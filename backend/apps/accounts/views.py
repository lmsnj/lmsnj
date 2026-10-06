from django.http import HttpResponse
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.common.files import validate_upload
from apps.common.mixins import ProtectedDeleteMixin
from apps.schools.context import active_school, require_school

from .models import Role, User
from .permissions import IsAdmin
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    LogoutSerializer,
    ResetPasswordSerializer,
    UserSerializer,
    UserWriteSerializer,
)
from .user_import import build_template, create_users, read_rows, validate_rows

XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


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


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"detail": "Password berhasil diubah."})


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
        # Admin hanya mengelola pengguna di sekolah yang sedang dibuka.
        return (
            User.objects.filter(schools=active_school(self.request))
            .select_related("classroom")
            .prefetch_related("schools")
        )

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return UserWriteSerializer
        return UserSerializer

    def perform_create(self, serializer):
        # Pengguna baru otomatis terdaftar di sekolah yang sedang dibuka admin.
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
        if user.schools.filter(pk=school.pk).exists():
            raise ValidationError({"username": f"{user.full_name} sudah terdaftar di sekolah ini."})
        user.schools.add(school)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        user = self.get_object()
        serializer = ResetPasswordSerializer(data=request.data, context={"target_user": user})
        serializer.is_valid(raise_exception=True)
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        return Response({"detail": f"Password {user.full_name} berhasil direset."})

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
