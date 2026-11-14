from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.academics.models import TeachingAssignment
from apps.accounts.models import Role
from apps.accounts.permissions import ContentPermission, IsAdminOrTeacher, IsStudent, IsTeacher
from apps.assessments import ai_generate, auto_assessment
from apps.common.files import file_response
from apps.schools.context import active_school

from . import progress as learning
from .models import Material, MaterialProgress
from .selectors import materials_for
from .serializers import (
    CheckObjectivesSerializer,
    MaterialSerializer,
    ProgressUpdateSerializer,
    ReorderSerializer,
)


class MaterialViewSet(viewsets.ModelViewSet):
    serializer_class = MaterialSerializer
    permission_classes = [ContentPermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ["teaching_assignment", "material_type", "is_published"]
    search_fields = ["title", "description"]
    ordering_fields = ["created_at", "title", "order"]

    def get_queryset(self):
        return materials_for(self.request.user, active_school(self.request)).select_related(
            "teaching_assignment__subject",
            "teaching_assignment__classroom",
            "created_by",
            "required_task",
            "required_assessment",
        )

    def perform_create(self, serializer):
        # Materi baru ditaruh di urutan terakhir kelas-mapelnya.
        assignment = serializer.validated_data["teaching_assignment"]
        last = assignment.materials.aggregate(last=Max("order"))["last"] or 0
        serializer.save(created_by=self.request.user, order=last + 1)

    def unlocked_for_student(self, material):
        """Siswa hanya boleh membuka isi materi yang tidak terkunci."""
        if self.request.user.role != Role.STUDENT:
            return
        row = learning.progress_for_request(self.request).get(material.id)
        if row and row["locked"]:
            raise PermissionDenied(
                f"Materi ini masih terkunci. Selesaikan capaian materi \u201c{row['locked_by']}\u201d dulu."
            )

    @action(detail=True)
    def download(self, request, pk=None):
        """Kirim file PDF setelah hak akses dicek (lewat get_queryset dan kunci materi)."""
        material = self.get_object()
        self.unlocked_for_student(material)
        return file_response(material.file, material.original_filename or "materi.pdf")

    def _my_progress(self, material):
        progress, _ = MaterialProgress.objects.get_or_create(material=material, student=self.request.user)
        return progress

    def _material_response(self, material):
        # Hitung ulang progres setelah berubah.
        self.request.__dict__.pop("_material_progress", None)
        return Response(self.get_serializer(material).data)

    @action(detail=True, methods=["post"], permission_classes=[IsStudent])
    def open(self, request, pk=None):
        """Siswa membuka materi (syarat capaian pertama)."""
        material = self.get_object()
        self.unlocked_for_student(material)
        progress = self._my_progress(material)
        if not progress.opened_at:
            progress.opened_at = timezone.now()
            progress.save(update_fields=["opened_at", "updated_at"])
        return self._material_response(material)

    @action(detail=True, methods=["post"], permission_classes=[IsStudent])
    def objectives(self, request, pk=None):
        """{checked: [indeks capaian]} - siswa mencentang capaian yang sudah ia kuasai."""
        material = self.get_object()
        self.unlocked_for_student(material)
        serializer = CheckObjectivesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        checked = sorted({i for i in serializer.validated_data["checked"] if i < len(material.objectives)})
        progress = self._my_progress(material)
        progress.checked_objectives = checked
        progress.opened_at = progress.opened_at or timezone.now()
        progress.save()
        return self._material_response(material)

    @action(detail=True, methods=["get", "put"], permission_classes=[IsAdminOrTeacher])
    def progress(self, request, pk=None):
        """GET: progres capaian setiap siswa kelas ini. PUT {records}: sahkan / buka kunci per siswa."""
        material = self.get_object()
        if request.method == "PUT":
            if request.user.role != Role.TEACHER:
                raise PermissionDenied("Hanya guru pengampu yang dapat mengubah progres siswa.")
            serializer = ProgressUpdateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            self._save_progress(material, serializer.validated_data["records"])
        students = list(
            material.teaching_assignment.classroom.students.filter(is_active=True).order_by("full_name")
        )
        # Progres dihitung bersama materi lain di kelas-mapel ini (agar status terkunci benar).
        materials = learning.published_materials([material.teaching_assignment_id])
        if material not in materials:
            materials.append(material)
        table = learning.progress_table(materials, [s.id for s in students])
        return Response(
            {
                "material": material.id,
                "title": material.title,
                "rows": [
                    {"student": s.id, "student_name": s.full_name, "nis": s.nis, **table[(material.id, s.id)]}
                    for s in students
                ],
            }
        )

    @transaction.atomic
    def _save_progress(self, material, records):
        allowed = set(material.teaching_assignment.classroom.students.values_list("id", flat=True))
        unknown = [r["student"].full_name for r in records if r["student"].id not in allowed]
        if unknown:
            raise ValidationError({"records": f"Bukan siswa kelas ini: {', '.join(unknown)}."})
        for record in records:
            progress, _ = MaterialProgress.objects.get_or_create(material=material, student=record["student"])
            for field in ("teacher_approved", "unlocked", "note"):
                if field in record:
                    setattr(progress, field, record[field])
            progress.updated_by = self.request.user
            progress.save()

    @action(
        detail=True, methods=["get", "post"], url_path="generate-assessment", permission_classes=[IsTeacher]
    )
    def generate_assessment(self, request, pk=None):
        """Guru pengampu: buat asesmen "Cek Pemahaman" otomatis (draf, langsung jadi syarat materi).
        GET = sumber yang tersedia. POST {source: "concepts" (gratis, bawaan) | "ai", question_count}."""
        material = self.get_object()
        if material.teaching_assignment.teacher_id != request.user.id:
            raise PermissionDenied("Hanya guru pengampu yang dapat membuat asesmen untuk materi ini.")
        if request.method == "GET":
            return Response(
                {
                    "concepts": len(auto_assessment.parse_concepts(material.concepts)),
                    "min_concepts": auto_assessment.MIN_CONCEPTS,
                    "objectives": len(material.objectives),
                    "ai_enabled": ai_generate.ai_enabled(),
                }
            )
        params = GenerateAssessmentSerializer(data=request.data)
        params.is_valid(raise_exception=True)
        try:
            if params.validated_data["source"] == "ai":
                if not ai_generate.ai_enabled():
                    raise ValidationError(
                        {"detail": "Fitur AI belum diaktifkan di server (ANTHROPIC_API_KEY kosong)."}
                    )
                assessment, skipped = ai_generate.generate_for_material(
                    material, request, params.validated_data["question_count"]
                )
            else:
                assessment, skipped = auto_assessment.generate_from_concepts(material, request)
        except auto_assessment.AutoAssessmentError as error:
            raise ValidationError({"detail": str(error)})
        except ai_generate.AIGenerationError as error:
            return Response({"detail": str(error)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(
            {
                "assessment": assessment.id,
                "title": assessment.title,
                "question_count": assessment.questions.count(),
                "skipped": skipped,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], permission_classes=[IsTeacher])
    def reorder(self, request):
        """{teaching_assignment, materials: [id urut]} - atur urutan materi kelas-mapel milik guru."""
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment = get_object_or_404(
            TeachingAssignment.objects.filter(teacher=request.user),
            pk=serializer.validated_data["teaching_assignment"],
        )
        ids = serializer.validated_data["materials"]
        existing = set(assignment.materials.values_list("id", flat=True))
        if set(ids) != existing or len(ids) != len(existing):
            raise ValidationError(
                {"materials": "Daftar materi tidak lengkap atau bukan dari kelas-mapel ini."}
            )
        with transaction.atomic():
            for number, material_id in enumerate(ids, start=1):
                Material.objects.filter(pk=material_id).update(order=number)
        return Response({"detail": "Urutan materi disimpan."})


class GenerateAssessmentSerializer(serializers.Serializer):
    source = serializers.ChoiceField(choices=["concepts", "ai"], default="concepts")
    question_count = serializers.IntegerField(
        min_value=ai_generate.MIN_QUESTIONS, max_value=ai_generate.MAX_QUESTIONS, default=10
    )
