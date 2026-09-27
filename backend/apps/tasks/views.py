from django.db.models import Count, Prefetch, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import Classroom
from apps.academics.selectors import teaching_assignments_for
from apps.accounts.models import Role
from apps.accounts.permissions import ContentPermission, IsAdminOrTeacher, IsStudent, IsTeacher
from apps.common.files import file_response
from apps.common.mixins import ProtectedDeleteMixin

from .gradebook import build_gradebook, gradebook_csv, roster_students
from .models import Submission, Task
from .reports import build_classroom_report, classroom_report_csv
from .selectors import submissions_for, tasks_for
from .serializers import GradeSerializer, SubmissionSerializer, SubmitSerializer, TaskSerializer
from .services import cancel_submission, grade_submission, submit_task


class TaskViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [ContentPermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    # due_at__gte / due_at__lte dipakai tab "Tugas Hari Ini" dan "Tugas Mendatang" di Beranda.
    filterset_fields = {
        "teaching_assignment": ["exact"],
        "is_published": ["exact"],
        "due_at": ["gte", "lte"],
    }
    search_fields = ["title", "instructions"]
    ordering_fields = ["due_at", "created_at", "title"]
    protected_message = (
        "Tugas ini sudah dikumpulkan oleh siswa sehingga tidak bisa dihapus. "
        "Jadikan draf jika ingin menyembunyikannya."
    )

    def get_queryset(self):
        user = self.request.user
        queryset = (
            tasks_for(user)
            .select_related("teaching_assignment__subject", "teaching_assignment__classroom")
            .annotate(
                submission_count=Count("submissions", distinct=True),
                ungraded_count=Count("submissions", filter=Q(submissions__score__isnull=True), distinct=True),
                student_count=Count("teaching_assignment__classroom__students", distinct=True),
            )
            # Meta.ordering tidak berlaku pada query dengan annotate(Count), jadi ditulis ulang.
            .order_by(*Task._meta.ordering)
        )
        if user.role == Role.STUDENT:
            mine = Submission.objects.filter(student=user)
            queryset = queryset.prefetch_related(
                Prefetch("submissions", queryset=mine, to_attr="my_submissions")
            )
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True)
    def attachment(self, request, pk=None):
        task = self.get_object()
        return file_response(task.attachment, task.attachment_filename or "lampiran", as_attachment=True)

    @action(
        detail=True,
        methods=["get", "put", "delete"],
        url_path="my-submission",
        permission_classes=[IsStudent],
    )
    def my_submission(self, request, pk=None):
        """Pengumpulan milik siswa yang login: lihat (GET), kumpulkan/ganti (PUT), batalkan (DELETE)."""
        task = self.get_object()
        if request.method == "DELETE":
            cancel_submission(task, request.user)
            return Response(status=status.HTTP_204_NO_CONTENT)
        if request.method == "PUT":
            serializer = SubmitSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            submission = submit_task(task, request.user, **serializer.validated_data)
            return Response(SubmissionSerializer(submission).data)
        submission = Submission.objects.filter(task=task, student=request.user).first()
        return Response(SubmissionSerializer(submission).data if submission else None)

    @action(detail=True, permission_classes=[IsAdminOrTeacher])
    def submissions(self, request, pk=None):
        """Rekap: setiap siswa di kelas beserta pengumpulannya (null jika belum mengumpulkan)."""
        task = self.get_object()
        submissions = list(task.submissions.select_related("student", "graded_by", "task"))
        by_student = {s.student_id: s for s in submissions}
        students = roster_students(task.teaching_assignment, submissions)

        rows = [
            {
                "student": {"id": s.id, "full_name": s.full_name, "nis": s.nis},
                "submission": SubmissionSerializer(by_student[s.id]).data if s.id in by_student else None,
            }
            for s in students
        ]
        return Response(rows)


class SubmissionViewSet(viewsets.ReadOnlyModelViewSet):
    """Daftar pengumpulan (dibatasi per peran) dan unduh file jawaban."""

    serializer_class = SubmissionSerializer
    filterset_fields = ["task", "student", "is_late"]

    def get_queryset(self):
        return submissions_for(self.request.user).select_related("student", "task", "graded_by")

    @action(detail=True, methods=["patch"], permission_classes=[IsTeacher])
    def grade(self, request, pk=None):
        """Guru pengampu memberi/mengubah/menghapus nilai (queryset guru hanya berisi tugas miliknya)."""
        submission = self.get_object()
        serializer = GradeSerializer(data=request.data, context={"submission": submission})
        serializer.is_valid(raise_exception=True)
        grade_submission(submission, request.user, **serializer.validated_data)
        return Response(SubmissionSerializer(submission).data)

    @action(detail=True)
    def download(self, request, pk=None):
        submission = self.get_object()
        return file_response(submission.file, submission.original_filename or "jawaban", as_attachment=True)


class GradebookView(APIView):
    """Rekap nilai satu kelas-mapel untuk guru pengampu dan admin. `export=True` -> file CSV."""

    permission_classes = [IsAdminOrTeacher]
    export = False

    def get(self, request, assignment_id):
        assignment = get_object_or_404(
            teaching_assignments_for(request.user).select_related("subject", "classroom"), pk=assignment_id
        )
        gradebook = build_gradebook(assignment)
        if not self.export:
            return Response(gradebook)

        year = assignment.classroom.academic_year.replace("/", "-")
        filename = f"Nilai {assignment.subject.code} {assignment.classroom.name} {year}.csv"
        response = HttpResponse(gradebook_csv(gradebook), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class ClassroomReportView(APIView):
    """Rekap nilai satu kelas (siswa x mapel) untuk admin dan wali kelas. `export=True` -> CSV."""

    permission_classes = [IsAdminOrTeacher]
    export = False

    def get(self, request, classroom_id):
        classrooms = Classroom.objects.select_related("homeroom_teacher")
        if request.user.role == Role.TEACHER:
            # Guru hanya bisa melihat laporan kelas yang ia walikan.
            classrooms = classrooms.filter(homeroom_teacher=request.user)
        classroom = get_object_or_404(classrooms, pk=classroom_id)
        report = build_classroom_report(classroom)
        if not self.export:
            return Response(report)
        year = classroom.academic_year.replace("/", "-")
        response = HttpResponse(classroom_report_csv(report), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="Laporan Nilai {classroom.name} {year}.csv"'
        return response
