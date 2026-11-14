from django.db.models import Q
from django.http import HttpResponse
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.common.excel import import_response, is_dry_run, template_response
from apps.common.files import validate_upload
from apps.common.mixins import ProtectedDeleteMixin
from apps.schools.context import active_school, require_school

from . import user_update
from .cards import MAX_CARDS, build_cards, card_data
from .models import ImpersonationLog, Role, User
from .permissions import IsAdmin, IsFoundation
from .serializers import (
    AccountCardsSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    LogoutSerializer,
    ResetPasswordSerializer,
    UserSerializer,
    UserWriteSerializer,
)
from .user_import import build_template, create_users, generate_password, read_rows, validate_rows

XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# Klaim di token akun yang dimasuki admin yayasan: id admin yayasan tersebut. Ikut tersalin ke
# access token dan ke refresh token hasil rotasi, jadi penandanya tidak hilang saat token diperbarui.
IMPERSONATOR_CLAIM = "impersonator"


def impersonator_id(request):
    """Id admin yayasan yang sedang "masuk sebagai" user ini, atau None jika login biasa."""
    token = request.auth
    return token.get(IMPERSONATOR_CLAIM) if token is not None and hasattr(token, "get") else None


def me_data(user, impersonator=None):
    """Data user untuk frontend + siapa admin yayasan yang sedang masuk ke akun ini (jika ada)."""
    data = UserSerializer(user).data
    data["impersonator"] = (
        {"id": impersonator.pk, "full_name": impersonator.full_name} if impersonator else None
    )
    return data


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    permission_classes = [AllowAny]
    # Batasi percobaan login untuk mencegah tebak-tebakan password.
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            RefreshToken(serializer.validated_data["refresh"]).blacklist()
        except TokenError:
            raise ValidationError({"refresh": "Token tidak valid atau sudah kedaluwarsa."})
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        admin_id = impersonator_id(request)
        impersonator = User.objects.filter(pk=admin_id).first() if admin_id else None
        return Response(me_data(request.user, impersonator))


class ChangePasswordView(APIView):
    def post(self, request):
        # Admin yayasan yang masuk ke akun orang lain tidak boleh mengganti password pemiliknya.
        if impersonator_id(request):
            raise PermissionDenied("Password tidak dapat diubah saat masuk sebagai pengguna lain.")
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"detail": "Password berhasil diubah."})


class ImpersonationView(generics.ListAPIView):
    """Admin yayasan masuk ke akun pengguna lain tanpa password, mis. untuk membantu atau memeriksa
    tampilan guru/siswa. GET = akun yang bisa dimasuki (semua sekolah), POST {user} = token akun itu.
    Setiap kali masuk dicatat di ImpersonationLog."""

    permission_classes = [IsFoundation]
    serializer_class = UserSerializer
    filterset_fields = {"role": ["exact"], "schools": ["exact"]}
    search_fields = ["username", "full_name", "nis", "nip"]

    def get_queryset(self):
        # Sesama admin yayasan tidak bisa dimasuki; akun nonaktif memang tidak boleh dipakai.
        return (
            User.objects.filter(is_active=True)
            .exclude(role=Role.FOUNDATION)
            .select_related("classroom")
            .prefetch_related("schools")
            .distinct()
            .order_by("full_name")
        )

    def post(self, request):
        # Dari akun yang sedang dimasuki tidak bisa masuk lagi ke akun lain (harus kembali dulu).
        if impersonator_id(request):
            raise PermissionDenied("Kembali ke akun Super Admin terlebih dahulu.")
        try:
            target = self.get_queryset().get(pk=int(request.data.get("user")))
        except (TypeError, ValueError, User.DoesNotExist):
            raise ValidationError({"user": "Akun tidak ditemukan atau tidak aktif."})

        refresh = RefreshToken.for_user(target)
        refresh[IMPERSONATOR_CLAIM] = request.user.pk
        ImpersonationLog.objects.create(
            impersonator=request.user,
            impersonator_username=request.user.username,
            target=target,
            target_username=target.username,
            ip_address=request.META.get("REMOTE_ADDR"),
        )
        return Response(
            {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
                "user": me_data(target, request.user),
            }
        )


class UserViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    """Manajemen pengguna, khusus admin."""

    permission_classes = [IsAdmin]
    # classroom__isnull=true dipakai untuk mencari siswa yang belum punya kelas.
    filterset_fields = {"role": ["exact"], "is_active": ["exact"], "classroom": ["exact", "isnull"]}
    search_fields = ["username", "full_name", "email", "nis", "nip"]
    ordering_fields = ["full_name", "username", "date_joined", "last_login"]
    protected_message = (
        "Pengguna ini masih memiliki data terkait (mengampu mapel atau sudah mengumpulkan tugas). "
        "Nonaktifkan akunnya saja agar datanya tetap tersimpan."
    )

    def get_queryset(self):
        # Admin hanya mengelola pengguna di sekolah yang sedang dibuka. Admin yayasan juga melihat
        # akun admin yayasan lain (yang tidak terdaftar di sekolah mana pun).
        members = Q(schools=active_school(self.request))
        if self.request.user.is_foundation:
            members |= Q(role=Role.FOUNDATION)
        return User.objects.filter(members).distinct().select_related("classroom").prefetch_related("schools")

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return UserWriteSerializer
        return UserSerializer

    def perform_create(self, serializer):
        # Pengguna baru otomatis terdaftar di sekolah yang sedang dibuka admin. Admin yayasan tidak
        # perlu terdaftar di sekolah, jadi boleh dibuat tanpa membuka sekolah.
        if serializer.validated_data.get("role") == Role.FOUNDATION:
            serializer.save()
            return
        school = require_school(self.request)
        user = serializer.save()
        user.schools.add(school)

    def perform_update(self, serializer):
        # Cegah admin mengunci dirinya sendiri keluar dari sistem.
        if serializer.instance == self.request.user:
            data = serializer.validated_data
            if data.get("role", self.request.user.role) != self.request.user.role:
                raise ValidationError({"role": "Anda tidak dapat mengubah peran akun sendiri."})
            if data.get("is_active") is False:
                raise ValidationError({"is_active": "Anda tidak dapat menonaktifkan akun sendiri."})
        serializer.save()

    def perform_destroy(self, instance):
        if instance == self.request.user:
            raise ValidationError({"detail": "Anda tidak dapat menghapus akun sendiri."})
        # Guru yang juga mengajar di sekolah lain hanya dikeluarkan dari sekolah ini, akunnya tetap.
        if instance.schools.count() > 1:
            instance.schools.remove(require_school(self.request))
            return
        super().perform_destroy(instance)

    @action(detail=False, methods=["post"])
    def join(self, request):
        """Daftarkan akun guru/admin yang sudah ada (dari sekolah lain) ke sekolah ini, lewat username."""
        school = require_school(request)
        username = str(request.data.get("username", "")).strip()
        user = User.objects.filter(username__iexact=username).first() if username else None
        if user is None:
            raise ValidationError({"username": "Akun dengan username ini tidak ditemukan."})
        if user.role == Role.STUDENT:
            raise ValidationError({"username": "Siswa hanya boleh terdaftar di satu sekolah."})
        if user.role == Role.FOUNDATION:
            raise ValidationError({"username": "Super Admin sudah bisa membuka semua sekolah."})
        if user.schools.filter(pk=school.pk).exists():
            raise ValidationError({"username": f"{user.full_name} sudah terdaftar di sekolah ini."})
        user.schools.add(school)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        user = self.get_object()
        serializer = ResetPasswordSerializer(data=request.data, context={"target_user": user})
        serializer.is_valid(raise_exception=True)
        password = serializer.validated_data.get("new_password") or ""
        generated = not password
        if generated:
            password = generate_password()
        user.set_password(password)
        user.save(update_fields=["password"])
        return Response(
            {
                "detail": f"Password {user.full_name} berhasil direset.",
                # Hanya password buatan otomatis yang dikembalikan (sekali), untuk kartu/WhatsApp.
                "password": password if generated else None,
                "account": card_data(user, password),
            }
        )

    @action(detail=False, methods=["post"], url_path="account-cards")
    def account_cards(self, request):
        """Data kartu akun untuk dicetak / dibagikan. reset_password=true membuat password baru untuk
        SEMUA akun terpilih (password lama tidak berlaku lagi) dan mengembalikannya sekali."""
        serializer = AccountCardsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        users = self.get_queryset().filter(is_active=True)
        if "user_ids" in data:
            users = users.filter(pk__in=data["user_ids"])
        if "classroom" in data:
            users = users.filter(classroom_id=data["classroom"], role=Role.STUDENT)
        if "role" in data:
            users = users.filter(role=data["role"])
        if data["reset_password"]:
            # Password akun sendiri diganti lewat Ganti Password, bukan lewat cetak kartu.
            users = users.exclude(pk=request.user.pk)
        if users.count() > MAX_CARDS:
            raise ValidationError(f"Terlalu banyak akun sekaligus (maks. {MAX_CARDS}). Pilih per kelas.")
        if not users.exists():
            raise ValidationError("Tidak ada akun aktif yang cocok.")
        school = require_school(request)
        cards = build_cards(users, reset_password=data["reset_password"])
        return Response({"school": {"name": school.name, "code": school.code}, "accounts": cards})

    @staticmethod
    def _update_role(value):
        # Hanya siswa (NIS) dan guru (NIP, kode guru) yang punya data untuk diperbarui.
        role = {"student": Role.STUDENT, "teacher": Role.TEACHER}.get(value)
        if role is None:
            raise ValidationError({"role": "Pilih peran siswa atau guru."})
        return role

    @action(detail=False, url_path="update-template")
    def update_template(self, request):
        """Daftar akun (siswa/guru) sekolah aktif untuk diisi NIS/NIP/kode guru. `kosong=1` = hanya
        akun yang datanya masih kosong."""
        role = self._update_role(request.query_params.get("role"))
        only_missing = request.query_params.get("kosong") == "1"
        content = user_update.build_template(require_school(request), role, only_missing)
        return template_response(content, f"Perbarui Data {role.label}.xlsx")

    @action(detail=False, methods=["post"], url_path="update-import")
    def update_import(self, request):
        """Perbarui akun yang sudah ada dari Excel. dry_run=true (bawaan) hanya memeriksa."""
        role = self._update_role(request.data.get("role"))
        results = user_update.check_rows(request.FILES.get("file"), require_school(request), role)
        return import_response(
            user_update.preview(results), is_dry_run(request), lambda: user_update.save_updates(results)
        )

    @action(detail=False, url_path="import-template")
    def import_template(self, request):
        """Template Excel untuk impor pengguna (dropdown kelas diisi dari data kelas terbaru)."""
        response = HttpResponse(build_template(require_school(request)), content_type=XLSX_CONTENT_TYPE)
        response["Content-Disposition"] = 'attachment; filename="Template Impor Pengguna.xlsx"'
        return response

    @action(detail=False, methods=["post"], url_path="import")
    def import_users(self, request):
        """Unggah file Excel. dry_run=true (bawaan): hanya diperiksa. dry_run=false: disimpan,
        tetapi hanya jika SEMUA baris benar (semua atau tidak sama sekali)."""
        file = request.FILES.get("file")
        if file is None:
            raise ValidationError({"file": "Pilih file Excel yang akan diimpor."})
        try:
            validate_upload(file, {".xlsx"})
        except ValidationError as error:
            # Beri nama field agar frontend tahu error ini milik isian file.
            raise ValidationError({"file": error.detail})
        results = validate_rows(read_rows(file), require_school(request))
        invalid = [r for r in results if r["errors"]]
        summary = {"total": len(results), "valid": len(results) - len(invalid), "invalid": len(invalid)}
        preview = [
            {
                "row": r["row"],
                "full_name": r["full_name"],
                "username": r["username"],
                "role": r["role"],
                "nis": r["nis"],
                "nip": r["nip"],
                "classroom": r["classroom"].name if r["classroom"] else "",
                "password_generated": not r["password"],
                "errors": r["errors"],
            }
            for r in results
        ]

        dry_run = str(request.data.get("dry_run", "true")).lower() != "false"
        if dry_run:
            return Response({"imported": False, "summary": summary, "rows": preview})
        if invalid:
            return Response(
                {
                    "detail": f"{len(invalid)} baris masih salah. Perbaiki file lalu unggah ulang.",
                    "summary": summary,
                    "rows": preview,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        accounts = create_users(results, require_school(request))
        return Response(
            {"imported": True, "summary": summary, "accounts": accounts}, status=status.HTTP_201_CREATED
        )
