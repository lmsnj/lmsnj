from django.db.models import Count
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.accounts.models import Role, User
from apps.accounts.permissions import IsAdmin, IsAdminOrReadOnly
from apps.common.mixins import ProtectedDeleteMixin

from .models import Classroom, Subject
from .selectors import classrooms_for, teaching_assignments_for
from .serializers import (
    ClassroomSerializer,
    StudentBriefSerializer,
    StudentIdsSerializer,
    SubjectSerializer,
    TeachingAssignmentSerializer,
)


class ClassroomViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    """Admin: kelola semua kelas. Guru: kelas yang diajar/diwalikan. Siswa: kelasnya sendiri."""

    serializer_class = ClassroomSerializer
    permission_classes = [IsAdminOrReadOnly]
    filterset_fields = ["grade", "major", "academic_year", "homeroom_teacher"]
    search_fields = ["name", "major"]
    ordering_fields = ["name", "grade", "academic_year"]
    protected_message = "Kelas ini masih memiliki pengampu mapel. Hapus data pengampunya terlebih dahulu."

    def get_queryset(self):
        return (
            classrooms_for(self.request.user)
            .select_related("homeroom_teacher")
            .annotate(student_count=Count("students", distinct=True))
        )

    @action(detail=False, url_path="academic-years", pagination_class=None)
    def academic_years(self, request):
        years = Classroom.objects.order_by("-academic_year").values_list("academic_year", flat=True)
        return Response(list(dict.fromkeys(years)))

    @action(detail=True, methods=["get", "post"])
    def students(self, request, pk=None):
        classroom = self.get_object()
        if request.method == "GET":
            # Daftar siswa hanya untuk admin dan guru di kelas tersebut.
            if request.user.role == Role.STUDENT:
                raise PermissionDenied("Anda tidak memiliki akses ke daftar siswa.")
            students = classroom.students.order_by("full_name")
            return Response(StudentBriefSerializer(students, many=True).data)

        # POST: memasukkan siswa ke kelas ini (siswa dari kelas lain ikut dipindahkan).
        self._require_admin(request)
        serializer = StudentIdsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = User.objects.filter(pk__in=serializer.validated_data["student_ids"]).update(
            classroom=classroom
        )
        return Response({"detail": f"{updated} siswa dimasukkan ke {classroom.name}."})

    @action(detail=True, methods=["post"], url_path="remove-students")
    def remove_students(self, request, pk=None):
        self._require_admin(request)
        classroom = self.get_object()
        serializer = StudentIdsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = classroom.students.filter(pk__in=serializer.validated_data["student_ids"]).update(
            classroom=None
        )
        return Response({"detail": f"{updated} siswa dikeluarkan dari {classroom.name}."})

    def _require_admin(self, request):
        if not IsAdmin().has_permission(request, self):
            raise PermissionDenied("Hanya admin yang dapat mengatur siswa di kelas.")


class SubjectViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer
    permission_classes = [IsAdminOrReadOnly]
    search_fields = ["code", "name"]
    ordering_fields = ["code", "name"]
    protected_message = "Mapel ini masih diampu di beberapa kelas. Hapus data pengampunya terlebih dahulu."


class TeachingAssignmentViewSet(viewsets.ModelViewSet):
    """Admin: kelola pengampu. Guru: mapel yang ia ampu. Siswa: mapel di kelasnya."""

    serializer_class = TeachingAssignmentSerializer
    permission_classes = [IsAdminOrReadOnly]
    filterset_fields = ["teacher", "subject", "classroom", "classroom__academic_year"]
    search_fields = ["subject__name", "subject__code", "classroom__name", "teacher__full_name"]
    ordering_fields = ["subject__name", "classroom__name", "teacher__full_name"]

    def get_queryset(self):
        return (
            teaching_assignments_for(self.request.user)
            .select_related("teacher", "subject", "classroom")
            .annotate(student_count=Count("classroom__students", distinct=True))
        )
