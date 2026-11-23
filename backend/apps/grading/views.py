from django.db import transaction
from django.db.models import Count, Max, Q
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response

from apps.academics.filters import TeamContentFilter
from apps.academics.selectors import team_assignments_for, team_assignments_for_request
from apps.accounts.models import Role
from apps.accounts.permissions import IsAdmin
from apps.common.mixins import ProtectedDeleteMixin
from apps.schools.context import active_school, require_school

from . import services
from .models import EntryStatus, GradeActivity, GradeType


class AdminWriteStaffRead(BasePermission):
    """Jenis penilaian: dibaca admin & guru (pilihan di form), diubah admin."""

    message = "Hanya admin yang dapat mengubah jenis penilaian."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated) or user.role == Role.STUDENT:
            return False
        return request.method in SAFE_METHODS or user.is_admin_role


class GradeTypeSerializer(serializers.ModelSerializer):
    activity_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = GradeType
        fields = ["id", "name", "group", "default_weight", "order", "is_active", "activity_count"]
        extra_kwargs = {"default_weight": {"max_value": 100}}

    def validate_name(self, name):
        name = name.strip()
        others = GradeType.objects.filter(school=self.context["school"], name__iexact=name)
        if self.instance:
            others = others.exclude(pk=self.instance.pk)
        if others.exists():
            raise serializers.ValidationError("Nama jenis penilaian ini sudah dipakai.")
        return name


class GradeTypeViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    """Jenis penilaian sekolah aktif. Jenis yang sudah dipakai tidak bisa dihapus (nonaktifkan saja)."""

    serializer_class = GradeTypeSerializer
    permission_classes = [AdminWriteStaffRead]
    pagination_class = None
    protected_message = "Jenis penilaian ini sudah dipakai. Nonaktifkan saja agar tidak bisa dipilih lagi."

    def get_queryset(self):
        return (
            GradeType.objects.filter(school=require_school(self.request))
            .annotate(activity_count=Count("activities"))
            .order_by("order", "id")
        )

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "school": require_school(self.request)}

    def perform_create(self, serializer):
        school = require_school(self.request)
        last = GradeType.objects.filter(school=school).aggregate(m=Max("order"))["m"] or 0
        serializer.save(school=school, order=serializer.validated_data.get("order") or last + 1)

    @action(detail=False, methods=["post"], permission_classes=[IsAdmin])
    def starter(self, request):
        created = services.create_starter_types(require_school(request))
        return Response({"detail": f"{created} jenis penilaian dibuat.", "created": created})

    @action(detail=False, methods=["post"], permission_classes=[IsAdmin])
    def reorder(self, request):
        ids = request.data.get("grade_types")
        existing = set(self.get_queryset().values_list("pk", flat=True))
        if not isinstance(ids, list) or set(ids) != existing or len(ids) != len(existing):
            raise ValidationError({"grade_types": "Kirim semua jenis penilaian dalam urutan baru."})
        with transaction.atomic():
            for order, pk in enumerate(ids, start=1):
                GradeType.objects.filter(pk=pk).update(order=order)
        return Response({"detail": "Urutan jenis penilaian disimpan."})


class GradeActivityPermission(BasePermission):
    """Baca: admin & guru (data dibatasi queryset). Tambah/ubah/hapus & isi nilai: guru tim pengampu."""

    message = "Anda tidak memiliki akses ke penilaian ini."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated) or user.role == Role.STUDENT:
            return False
        return request.method in SAFE_METHODS or user.role == Role.TEACHER


class GradeActivitySerializer(serializers.ModelSerializer):
    grade_type_name = serializers.CharField(source="grade_type.name", read_only=True)
    grade_group = serializers.CharField(source="grade_type.group", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", default=None, read_only=True)
    graded_count = serializers.IntegerField(read_only=True, default=0)
    absent_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = GradeActivity
        fields = [
            "id",
            "teaching_assignment",
            "grade_type",
            "grade_type_name",
            "grade_group",
            "title",
            "date",
            "scale",
            "bands",
            "source",
            "created_by_name",
            "created_at",
            "graded_count",
            "absent_count",
        ]
        read_only_fields = ["scale", "bands", "source", "created_at"]

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        if request is not None:
            fields["teaching_assignment"].queryset = team_assignments_for_request(request)
            fields["grade_type"].queryset = GradeType.objects.filter(school=active_school(request))
        return fields

    def validate_teaching_assignment(self, assignment):
        # Seperti materi & tugas: penilaian tidak bisa dipindah ke kelas-mapel lain.
        if self.instance and assignment.pk != self.instance.teaching_assignment_id:
            raise serializers.ValidationError("Kelas-mapel penilaian tidak bisa diubah.")
        return assignment

    def validate_grade_type(self, grade_type):
        changed = not self.instance or grade_type.pk != self.instance.grade_type_id
        if changed and not grade_type.is_active:
            raise serializers.ValidationError("Jenis penilaian ini sudah dinonaktifkan.")
        return grade_type


class GradeActivityFilter(TeamContentFilter):
    class Meta:
        model = GradeActivity
        fields = ["grade_type"]


class ScoreRecordSerializer(serializers.Serializer):
    student = serializers.IntegerField()
    value = serializers.CharField(required=False, allow_blank=True, max_length=10, default="")
    status = serializers.ChoiceField(choices=EntryStatus.choices, default=EntryStatus.PRESENT)
    note = serializers.CharField(required=False, allow_blank=True, max_length=200, default="")


class ScoresSerializer(serializers.Serializer):
    records = ScoreRecordSerializer(many=True, allow_empty=False, max_length=500)


class GradeActivityViewSet(viewsets.ModelViewSet):
    """Penilaian langsung per kelas-mapel (dipakai bersama tim pengampu).

    Menulis (tambah/ubah/hapus/isi nilai) hanya saat fitur `penilaian_langsung` menyala; data yang
    sudah ada tetap bisa dibaca walaupun fitur dimatikan. Siswa tidak punya akses (Tahap 7)."""

    serializer_class = GradeActivitySerializer
    permission_classes = [GradeActivityPermission]
    filterset_class = GradeActivityFilter

    def get_queryset(self):
        school = active_school(self.request)
        assignments = team_assignments_for(self.request.user, school)
        return (
            GradeActivity.objects.filter(teaching_assignment__in=assignments)
            .select_related("grade_type", "created_by", "teaching_assignment__classroom__school")
            .annotate(
                graded_count=Count("entries", filter=Q(entries__score__isnull=False)),
                absent_count=Count("entries", filter=Q(entries__status=EntryStatus.ABSENT)),
            )
            .order_by("-date", "-id")
        )

    def _ensure_writable(self):
        services.ensure_enabled(require_school(self.request))

    def perform_create(self, serializer):
        self._ensure_writable()
        scale, bands = services.scale_snapshot(require_school(self.request))
        serializer.save(created_by=self.request.user, scale=scale, bands=bands)

    def perform_update(self, serializer):
        self._ensure_writable()
        serializer.save()

    def perform_destroy(self, instance):
        self._ensure_writable()
        instance.delete()

    @action(detail=True, methods=["get", "put"])
    def scores(self, request, pk=None):
        """GET: semua siswa kelas + nilainya + KKM. PUT {records: [{student, value, status, note}]}:
        simpan sel yang berubah (guru tim saja; permission class sudah menolak admin)."""
        activity = self.get_object()
        if request.method == "PUT":
            if request.user.role != Role.TEACHER:
                raise PermissionDenied("Hanya guru pengampu yang dapat mengisi nilai.")
            self._ensure_writable()
            serializer = ScoresSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            services.save_scores(activity, serializer.validated_data["records"], request.user)
        data = services.score_rows(activity)
        return Response(
            {
                "activity": self.get_serializer(self.get_queryset().get(pk=activity.pk)).data,
                **data,
            }
        )
