from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.accounts.models import Role, User
from apps.accounts.permissions import IsAdmin, IsAdminOrTeacher
from apps.common.mixins import ProtectedDeleteMixin
from apps.schools.context import active_school

from . import services
from .models import ExamEvent
from .permissions import ExamEventPermission
from .serializers import ExamEventSerializer, ParticipantUpdateSerializer


class ResetTokenSerializer(serializers.Serializer):
    student = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(role=Role.STUDENT))
    classroom = serializers.IntegerField()


class ExamEventViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    """Acara ujian sekolah aktif. Admin mengatur acara, syarat, pengecualian, dan ruang;
    wali kelas melihat kelayakan & kartu kelasnya serta mencentang persetujuan wali kelas."""

    serializer_class = ExamEventSerializer
    permission_classes = [ExamEventPermission]
    search_fields = ["name"]
    protected_message = (
        "Acara ini masih dipakai sebagai syarat lembar asesmen. Lepaskan dulu dari asesmennya."
    )

    def get_queryset(self):
        return ExamEvent.objects.filter(school=active_school(self.request)).select_related("school")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def classrooms_of(self, event):
        """Kelas acara yang boleh dibuka: admin semua, guru hanya kelas yang ia walikan."""
        classrooms = services.event_classrooms(event)
        if not self.request.user.is_admin_role:
            classrooms = classrooms.filter(homeroom_teacher=self.request.user)
        return classrooms

    def get_classroom(self, event, classroom_id):
        if not str(classroom_id).isdigit():
            raise ValidationError({"classroom": "Pilih kelas."})
        return get_object_or_404(
            self.classrooms_of(event).select_related("homeroom_teacher"), pk=classroom_id
        )

    @action(detail=True)
    def classrooms(self, request, pk=None):
        """Kelas yang ikut acara ini (guru: kelas yang ia walikan)."""
        classrooms = (
            self.classrooms_of(self.get_object())
            .select_related("homeroom_teacher")
            .annotate(student_count=Count("students", filter=Q(students__is_active=True)))
            .order_by("grade", "name")
        )
        return Response(
            [
                {
                    "id": c.id,
                    "name": c.name,
                    "grade": c.grade,
                    "homeroom_teacher_name": c.homeroom_teacher.full_name if c.homeroom_teacher else None,
                    "student_count": c.student_count,
                }
                for c in classrooms
            ]
        )

    # Wali kelas juga boleh PUT (centang persetujuan); kelasnya dibatasi di get_classroom.
    @action(detail=True, methods=["get", "put"], permission_classes=[IsAdminOrTeacher])
    def eligibility(self, request, pk=None):
        """GET ?classroom=<id>: status syarat setiap siswa.
        PUT {classroom, records}: simpan centang wali kelas (wali kelas/admin), pengecualian & ruang (admin).
        """
        event = self.get_object()
        if request.method == "PUT":
            serializer = ParticipantUpdateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            classroom = self.get_classroom(event, serializer.validated_data["classroom"])
            services.save_participants(event, classroom, serializer.validated_data["records"], request.user)
        else:
            classroom = self.get_classroom(event, request.query_params.get("classroom", ""))
        rows = services.evaluate_classroom(event, classroom)
        return Response(
            {
                "classroom": classroom.id,
                "classroom_name": classroom.name,
                "homeroom_teacher_name": (
                    classroom.homeroom_teacher.full_name if classroom.homeroom_teacher else None
                ),
                "eligible_count": sum(row["eligible"] for row in rows),
                "rows": rows,
            }
        )

    @action(detail=True)
    def cards(self, request, pk=None):
        """GET ?classroom=<id>: data kartu ujian siswa yang memenuhi syarat (atau dikecualikan).
        Token kartu dibuat di sini saat kartu pertama kali dibuka/dicetak (sesudahnya tetap sama)."""
        event = self.get_object()
        classroom = self.get_classroom(event, request.query_params.get("classroom", ""))
        rows = services.evaluate_classroom(event, classroom)
        tokens = services.ensure_tokens(event, [row["student"] for row in rows if row["eligible"]])
        return Response(
            {
                "event": ExamEventSerializer(event, context=self.get_serializer_context()).data,
                "school": {"id": event.school.id, "name": event.school.name, "slogan": event.school.slogan},
                "classroom": classroom.id,
                "classroom_name": classroom.name,
                "homeroom_teacher_name": (
                    classroom.homeroom_teacher.full_name if classroom.homeroom_teacher else None
                ),
                "skipped_count": sum(not row["eligible"] for row in rows),
                "cards": [
                    {
                        "student": row["student"],
                        "student_name": row["student_name"],
                        "nis": row["nis"],
                        "exam_number": row["exam_number"],
                        "room": row["room"],
                        "token": tokens[row["student"]],
                    }
                    for row in rows
                    if row["eligible"]
                ],
            }
        )

    @action(detail=True, methods=["post"], url_path="reset-token", permission_classes=[IsAdmin])
    def reset_token(self, request, pk=None):
        """{student, classroom}: buat token baru (kartu hilang). Kartu lama tidak berlaku, cetak ulang."""
        event = self.get_object()
        serializer = ResetTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        classroom = self.get_classroom(event, serializer.validated_data["classroom"])
        student = serializer.validated_data["student"]
        if student.classroom_id != classroom.id:
            raise ValidationError({"student": f"Bukan siswa kelas {classroom.name}."})
        token = services.reset_token(event, student, request.user)
        return Response(
            {
                "detail": f"Token baru untuk {student.full_name}: {token}. Cetak ulang kartunya.",
                "token": token,
            }
        )
