"""API Praktik (menulis kode) di materi. Aturan bentuk soal di code_practice.py.

Guru tim pengampu membuat soal; siswa mengerjakan setelah konten materi dibuka dan Latihan Pemahaman
lulus. Kode dijalankan & diperiksa di browser siswa; server hanya menyimpan kode dan hasilnya agar guru
bisa membacanya.
"""

from django.db.models import Max
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.accounts.models import Role
from apps.accounts.permissions import ContentPermission, IsAdminOrTeacher, IsStudent
from apps.schools.context import active_school

from . import progress as learning
from .models import CodeAttempt, CodeExercise
from .selectors import materials_for
from .serializers import (
    CodeAttemptInputSerializer,
    CodeAttemptSerializer,
    CodeExerciseSerializer,
    MaterialSerializer,
)


class CodeExerciseViewSet(viewsets.ModelViewSet):
    """Soal praktik. Baca: guru tim & admin semua soal materinya; siswa hanya soal di materi terbit yang
    tidak terkunci (+ `my_attempt`). Tulis: guru tim. Hapus: guru tim/admin."""

    serializer_class = CodeExerciseSerializer
    permission_classes = [ContentPermission]
    filterset_fields = ["material"]
    pagination_class = None  # paling banyak 5 soal per materi

    def get_queryset(self):
        user = self.request.user
        materials = materials_for(user, active_school(self.request))
        queryset = CodeExercise.objects.filter(material__in=materials).select_related(
            "material__teaching_assignment"
        )
        if user.role == Role.STUDENT:
            progress = learning.progress_for_request(self.request)
            unlocked = [pk for pk, row in progress.items() if not row["locked"]]
            queryset = queryset.filter(material_id__in=unlocked)
        return queryset.order_by("material_id", "order", "id")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.request.user.role == Role.STUDENT:
            context["my_attempts"] = {
                attempt.exercise_id: attempt
                for attempt in CodeAttempt.objects.filter(student=self.request.user)
            }
        return context

    def perform_create(self, serializer):
        # Soal baru ditaruh paling akhir.
        material = serializer.validated_data["material"]
        last = material.exercises.aggregate(last=Max("order"))["last"] or 0
        serializer.save(order=last + 1)

    @action(detail=True, methods=["post"], permission_classes=[IsStudent])
    def attempt(self, request, pk=None):
        """{code, checked, passed} - siswa menyimpan kodenya; checked = hasil tombol Periksa.
        Sekali lulus tetap lulus (kode saat lulus disimpan terpisah). Mengembalikan pekerjaan + materi."""
        exercise = self.get_object()
        material = exercise.material
        # Alur belajar: konten -> Latihan Pemahaman -> Praktik -> Cerita Reflektif.
        if not learning.check_done(request, material, "opened"):
            raise ValidationError({"detail": "Buka semua konten materi dulu, lalu kerjakan Praktik."})
        if not learning.check_done(request, material, "practice"):
            raise ValidationError({"detail": "Selesaikan Latihan Pemahaman dulu, lalu kerjakan Praktik."})
        serializer = CodeAttemptInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        attempt, _ = CodeAttempt.objects.get_or_create(exercise=exercise, student=request.user)
        attempt.code = data["code"]
        if data["checked"]:
            attempt.check_count += 1
            if data["passed"] and attempt.passed_at is None:
                attempt.passed_at = timezone.now()
                attempt.passed_code = data["code"]
        attempt.save()

        # Progres dihitung ulang agar syarat "Lulus Praktik" langsung terlihat.
        if hasattr(request, "_material_progress"):
            del request._material_progress
        return Response(
            {
                "attempt": CodeAttemptSerializer(attempt).data,
                "material": MaterialSerializer(material, context={"request": request}).data,
            }
        )

    @action(detail=True, permission_classes=[IsAdminOrTeacher])
    def attempts(self, request, pk=None):
        """Pekerjaan semua siswa kelas ini di soal ini (guru tim / admin): kode terakhir, kode saat lulus."""
        exercise = self.get_object()
        assignment = exercise.material.teaching_assignment
        if request.user.role == Role.TEACHER and not assignment.has_team_member(request.user):
            raise PermissionDenied("Hanya guru pengampu yang dapat melihat pekerjaan siswa.")
        students = assignment.classroom.students.filter(is_active=True).order_by("full_name")
        attempts = {a.student_id: a for a in exercise.attempts.all()}
        rows = []
        for student in students:
            attempt = attempts.get(student.id)
            rows.append(
                {
                    "student": student.id,
                    "full_name": student.full_name,
                    "nis": student.nis,
                    "code": attempt.code if attempt else "",
                    "passed_code": attempt.passed_code if attempt else "",
                    "passed": bool(attempt and attempt.passed_at),
                    "passed_at": attempt.passed_at if attempt else None,
                    "check_count": attempt.check_count if attempt else 0,
                    "updated_at": attempt.updated_at if attempt else None,
                }
            )
        return Response({"exercise": exercise.id, "title": exercise.title, "rows": rows})
