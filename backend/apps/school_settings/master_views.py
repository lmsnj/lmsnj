"""API master data Tahap 2: mode kelas (global), kategori mapel (per sekolah), dan kategori/mode per mapel.

Mode bawaan kategori, mode per mapel, dan mode per kelas TIDAK punya kolom sendiri: semuanya disimpan
sebagai pengaturan `kelas.mode_default` di cakupan kategori/mapel/kelas (lihat services), sehingga
urutan kelas -> mapel -> kategori -> sekolah -> bawaan berlaku sama seperti pengaturan lain.
"""

from django.db import transaction
from django.db.models import Count, Max
from django.shortcuts import get_object_or_404
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import Subject
from apps.accounts.models import Role
from apps.accounts.permissions import IsAdmin
from apps.schools.context import require_school

from . import services
from .models import ClassMode, Scope, SubjectCategory, SubjectProfile
from .registry import get_definition

MODE_KEY = services.MODE_KEY
SYSTEM_DEFAULT_MODE = get_definition(MODE_KEY).default


class ReadAnyWriteFoundation(BasePermission):
    message = "Hanya Super Admin yang dapat mengubah mode kelas."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return request.method in SAFE_METHODS or user.role == Role.FOUNDATION


class ClassModeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClassMode
        fields = ["id", "code", "name", "needs_student_device", "order", "is_active"]

    def validate_code(self, code):
        if self.instance and code != self.instance.code:
            raise serializers.ValidationError("Kode mode tidak bisa diubah karena dipakai pengaturan.")
        return code

    def validate(self, attrs):
        code = attrs.get("code", getattr(self.instance, "code", None))
        if code == SYSTEM_DEFAULT_MODE and attrs.get("is_active") is False:
            raise serializers.ValidationError({"is_active": "Mode bawaan sistem tidak bisa dinonaktifkan."})
        return attrs


class ClassModeViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Mode kelas untuk semua sekolah. Baca: semua login. Tambah/ubah: Super Admin.
    Tidak bisa dihapus (kodenya bisa tersimpan di pengaturan sekolah mana pun); nonaktifkan saja."""

    queryset = ClassMode.objects.all()
    serializer_class = ClassModeSerializer
    permission_classes = [ReadAnyWriteFoundation]
    pagination_class = None


class SubjectCategorySerializer(serializers.ModelSerializer):
    # Mode bawaan kategori = pengaturan kelas.mode_default di cakupan kategori (null = ikut sekolah).
    mode = serializers.CharField(required=False, allow_null=True, write_only=True)
    subject_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = SubjectCategory
        fields = ["id", "name", "order", "is_active", "mode", "subject_count"]

    def validate_name(self, name):
        name = name.strip()
        school = self.context["school"]
        others = SubjectCategory.objects.filter(school=school, name__iexact=name)
        if self.instance:
            others = others.exclude(pk=self.instance.pk)
        if others.exists():
            raise serializers.ValidationError("Nama kategori ini sudah dipakai.")
        return name

    def to_representation(self, category):
        data = super().to_representation(category)
        data["mode"] = self.context["reader"].stored(MODE_KEY, Scope.CATEGORY, category.pk)
        return data


class SubjectCategoryViewSet(viewsets.ModelViewSet):
    """Kategori mapel sekolah aktif. Khusus admin. Kategori yang dipakai mapel tidak bisa dihapus."""

    serializer_class = SubjectCategorySerializer
    permission_classes = [IsAdmin]
    pagination_class = None

    def get_queryset(self):
        return (
            SubjectCategory.objects.filter(school=require_school(self.request))
            .annotate(subject_count=Count("profiles"))
            .order_by("order", "id")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        school = require_school(self.request)
        context.update(school=school, reader=services.SettingReader(school))
        return context

    @transaction.atomic
    def perform_create(self, serializer):
        school = require_school(self.request)
        mode = serializer.validated_data.pop("mode", None)
        if "order" not in serializer.validated_data:
            last = SubjectCategory.objects.filter(school=school).aggregate(m=Max("order"))["m"] or 0
            serializer.validated_data["order"] = last + 1
        category = serializer.save(school=school)
        if mode:
            services.save_setting(school, MODE_KEY, Scope.CATEGORY, category.pk, mode, self.request.user)
        serializer.context["reader"] = services.SettingReader(school)

    @transaction.atomic
    def perform_update(self, serializer):
        school = require_school(self.request)
        has_mode = "mode" in serializer.validated_data
        mode = serializer.validated_data.pop("mode", None)
        category = serializer.save()
        if has_mode:
            services.set_scope_value(school, MODE_KEY, Scope.CATEGORY, category.pk, mode, self.request.user)
        serializer.context["reader"] = services.SettingReader(school)

    def perform_destroy(self, instance):
        services.delete_category(instance)

    @action(detail=False, methods=["post"])
    def reorder(self, request):
        ids = request.data.get("categories")
        categories = {c.pk: c for c in self.get_queryset()}
        if not isinstance(ids, list) or sorted(ids) != sorted(categories):
            raise ValidationError({"categories": "Kirim semua kategori sekolah ini dalam urutan baru."})
        with transaction.atomic():
            for order, pk in enumerate(ids, start=1):
                SubjectCategory.objects.filter(pk=pk).update(order=order)
        return Response({"detail": "Urutan kategori disimpan."})


def _profile_rows(school):
    """Semua mapel sekolah + kategori + mode (tersimpan di mapel & yang berlaku)."""
    reader = services.SettingReader(school)
    profiles = dict(
        SubjectProfile.objects.filter(subject__school=school).values_list("subject_id", "category_id")
    )
    names = dict(SubjectCategory.objects.filter(school=school).values_list("pk", "name"))
    rows = []
    for subject in Subject.objects.filter(school=school).order_by("name"):
        mode, source = reader.resolve(MODE_KEY, subject=subject.pk)
        category = profiles.get(subject.pk)
        rows.append(
            {
                "subject": subject.pk,
                "code": subject.code,
                "name": subject.name,
                "category": category,
                "category_name": names.get(category),
                "mode": reader.stored(MODE_KEY, Scope.SUBJECT, subject.pk),
                "effective_mode": mode,
                "mode_source": source,
            }
        )
    return rows


class ProfileSerializer(serializers.Serializer):
    """Kategori/mode yang dikirim; field yang tidak dikirim = tidak diubah, null = dikosongkan."""

    category = serializers.IntegerField(required=False, allow_null=True)
    mode = serializers.CharField(required=False, allow_null=True)


def _apply_profile(school, subjects, data, user):
    if "category" in data:
        category = None
        if data["category"] is not None:
            category = SubjectCategory.objects.filter(school=school, pk=data["category"]).first()
            if category is None:
                raise ValidationError({"category": "Kategori tidak ditemukan di sekolah ini."})
            if not category.is_active:
                raise ValidationError({"category": "Kategori ini sudah dinonaktifkan."})
        for subject in subjects:
            services.set_subject_category(subject, category)
    if "mode" in data:
        for subject in subjects:
            services.set_scope_value(school, MODE_KEY, Scope.SUBJECT, subject.pk, data["mode"], user)


class SubjectProfileListView(APIView):
    """GET: semua mapel sekolah aktif dengan kategori & modenya. Khusus admin."""

    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(_profile_rows(require_school(request)))


class SubjectProfileDetailView(APIView):
    """PUT {category, mode}: kategori/mode satu mapel. Halaman Kelola Mapel lama tidak diubah."""

    permission_classes = [IsAdmin]

    @transaction.atomic
    def put(self, request, subject_id):
        school = require_school(request)
        subject = get_object_or_404(Subject, school=school, pk=subject_id)
        serializer = ProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _apply_profile(school, [subject], serializer.validated_data, request.user)
        return Response(next(r for r in _profile_rows(school) if r["subject"] == subject.pk))


class BulkProfileSerializer(ProfileSerializer):
    subjects = serializers.ListField(child=serializers.IntegerField(), allow_empty=False, max_length=500)


class SubjectProfileBulkView(APIView):
    """POST {subjects: [id], category?, mode?}: tetapkan kategori/mode banyak mapel sekaligus."""

    permission_classes = [IsAdmin]

    @transaction.atomic
    def post(self, request):
        school = require_school(request)
        serializer = BulkProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        ids = set(data["subjects"])
        subjects = list(Subject.objects.filter(school=school, pk__in=ids))
        if len(subjects) != len(ids):
            raise ValidationError({"subjects": "Ada mapel yang tidak ditemukan di sekolah ini."})
        if "category" not in data and "mode" not in data:
            raise ValidationError({"detail": "Pilih kategori atau mode yang akan ditetapkan."})
        _apply_profile(school, subjects, data, request.user)
        return Response({"detail": f"{len(subjects)} mapel diperbarui.", "updated": len(subjects)})
