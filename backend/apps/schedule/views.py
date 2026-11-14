from django.db.models import Count
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.selectors import teaching_assignments_for
from apps.accounts.models import User
from apps.accounts.permissions import ContentPermission, IsAdmin, IsTeacher
from apps.common.excel import is_dry_run, template_response
from apps.common.mixins import ProtectedDeleteMixin
from apps.schools.context import active_school, require_school

from .models import TeachingSession, Timetable, TimetableEntry
from .serializers import (
    TeachingSessionSerializer,
    TimeSlotSerializer,
    TimetableEntrySerializer,
    TimetableSerializer,
)
from .services import MAX_SESSION_DAYS, sessions_from_timetable, teacher_loads
from .timetable_excel import build_template, read_workbook
from .timetable_import import TimetableImportError, import_timetable


class TeachingSessionViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    """Admin: semua sesi. Guru: sesi di kelas-mapel miliknya (bisa diubah). Siswa: sesi kelasnya."""

    protected_message = "Pertemuan ini sudah berisi presensi siswa sehingga tidak bisa dihapus."

    serializer_class = TeachingSessionSerializer
    permission_classes = [ContentPermission]
    filterset_fields = {"teaching_assignment": ["exact"], "starts_at": ["gte", "lte"]}
    ordering_fields = ["starts_at"]

    def get_queryset(self):
        return (
            TeachingSession.objects.filter(
                teaching_assignment__in=teaching_assignments_for(
                    self.request.user, active_school(self.request)
                )
            ).select_related(
                "teaching_assignment__subject",
                "teaching_assignment__classroom",
                "teaching_assignment__teacher",
            )
            # Jumlah catatan presensi: 0 = presensi pertemuan ini belum diisi.
            .annotate(attendance_count=Count("attendances"))
            # Meta.ordering tidak berlaku pada query dengan annotate(Count), jadi ditulis ulang.
            .order_by(*TeachingSession._meta.ordering)
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=["post"], url_path="from-timetable", permission_classes=[IsTeacher])
    def from_timetable(self, request):
        """Guru: buat sesi untuk semua jam mengajarnya di jadwal aktif pada rentang tanggal."""
        params = SessionsFromTimetableSerializer(data=request.data)
        params.is_valid(raise_exception=True)
        school = require_school(request)
        timetable = active_timetable(school)
        if timetable is None:
            raise ValidationError({"detail": "Sekolah ini belum punya jadwal pelajaran yang aktif."})
        assignments = teaching_assignments_for(request.user, school).filter(teacher=request.user)
        result = sessions_from_timetable(
            timetable,
            assignments,
            params.validated_data["date_from"],
            params.validated_data["date_to"],
            created_by=request.user,
            dry_run=params.validated_data["dry_run"],
        )
        return Response(
            {
                "created": len(result["created"]),
                "skipped": result["skipped"],
                "sessions": [
                    {
                        "title": session.title,
                        "classroom_name": session.teaching_assignment.classroom.name,
                        "starts_at": session.starts_at,
                        "duration_minutes": session.duration_minutes,
                    }
                    for session in result["created"]
                ],
            },
            status=status.HTTP_200_OK if params.validated_data["dry_run"] else status.HTTP_201_CREATED,
        )


class SessionsFromTimetableSerializer(serializers.Serializer):
    date_from = serializers.DateField(label="Dari tanggal")
    date_to = serializers.DateField(label="Sampai tanggal")
    dry_run = serializers.BooleanField(default=False)

    def validate(self, attrs):
        days = (attrs["date_to"] - attrs["date_from"]).days
        if days < 0:
            raise serializers.ValidationError({"date_to": "Tanggal akhir tidak boleh sebelum tanggal awal."})
        if days >= MAX_SESSION_DAYS:
            raise serializers.ValidationError({"date_to": f"Rentang maksimal {MAX_SESSION_DAYS} hari."})
        return attrs


def active_timetable(school):
    """Jadwal aktif sekolah yang sedang dibuka (setiap sekolah punya jadwalnya sendiri)."""
    return Timetable.objects.filter(school=school, is_active=True).first()


def id_param(request, name):
    """Parameter angka opsional pada URL, mis. ?classroom=3."""
    value = request.query_params.get(name)
    if not value:
        return None
    if not value.isdigit():
        raise ValidationError({name: "Harus berupa angka."})
    return int(value)


class TimetableView(APIView):
    """Jadwal pelajaran mingguan yang aktif.

    Siswa: jadwal kelasnya. Guru: jadwal mengajarnya. Admin: semua, bisa disaring dengan
    `?classroom=` atau `?teacher=`.
    """

    def get(self, request):
        school = require_school(request)
        timetable = active_timetable(school)
        if timetable is None:
            return Response({"timetable": None, "slots": [], "entries": []})
        entries = TimetableEntry.objects.filter(
            time_slot__timetable=timetable,
            teaching_assignment__in=teaching_assignments_for(request.user, school),
        ).select_related(
            "teaching_assignment__subject", "teaching_assignment__classroom", "teaching_assignment__teacher"
        )
        # Admin sekolah & Super Admin melihat semua, bisa disaring per kelas / guru.
        if request.user.is_admin_role:
            classroom, teacher = id_param(request, "classroom"), id_param(request, "teacher")
            if classroom:
                entries = entries.filter(teaching_assignment__classroom_id=classroom)
            if teacher:
                entries = entries.filter(teaching_assignment__teacher_id=teacher)
        return Response(
            {
                "timetable": TimetableSerializer(timetable).data,
                "slots": TimeSlotSerializer(timetable.slots.all(), many=True).data,
                "entries": TimetableEntrySerializer(entries, many=True).data,
            }
        )


class TeacherLoadView(APIView):
    """Rekap beban mengajar guru pada jadwal aktif (khusus admin)."""

    permission_classes = [IsAdmin]

    def get(self, request):
        timetable = active_timetable(require_school(request))
        if timetable is None:
            return Response([])
        loads = teacher_loads(timetable)
        teachers = User.objects.filter(pk__in=loads.keys()).order_by("full_name")
        return Response(
            [
                {
                    "teacher": teacher.id,
                    "teacher_name": teacher.full_name,
                    "teacher_code": teacher.teacher_code,
                    **loads[teacher.id],
                }
                for teacher in teachers
            ]
        )


class TimetableImportTemplateView(APIView):
    """Template Excel impor jadwal (khusus admin)."""

    permission_classes = [IsAdmin]

    def get(self, request):
        return template_response(build_template(require_school(request)), "Template Impor Jadwal.xlsx")


class TimetableImportView(APIView):
    """Impor jadwal dari Excel (khusus admin). `dry_run=true` (bawaan) hanya memeriksa; aturannya
    sama dengan perintah import_timetable: semua atau tidak sama sekali."""

    permission_classes = [IsAdmin]

    def post(self, request):
        school = require_school(request)
        dry_run = is_dry_run(request)
        try:
            report = import_timetable(read_workbook(request.data.get("file")), school=school, dry_run=dry_run)
        except TimetableImportError as error:
            return Response(
                {"detail": "Impor dibatalkan, tidak ada data yang disimpan.", "errors": error.messages},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if dry_run:
            # Password saat uji coba tidak pernah dipakai; jangan dikirim agar tidak membingungkan.
            for teacher in report["teachers"]["created"]:
                teacher["password"] = None
        return Response(report, status=status.HTTP_200_OK if dry_run else status.HTTP_201_CREATED)
