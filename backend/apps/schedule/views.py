from django.db.models import Count
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.selectors import teaching_assignments_for
from apps.accounts.models import User
from apps.accounts.permissions import ContentPermission, IsAdmin
from apps.common.mixins import ProtectedDeleteMixin
from apps.schools.context import active_school, require_school

from .models import TeachingSession, Timetable, TimetableEntry
from .serializers import (
    TeachingSessionSerializer,
    TimeSlotSerializer,
    TimetableEntrySerializer,
    TimetableSerializer,
)
from .services import teacher_loads


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
