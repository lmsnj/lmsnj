from django.db.models import Count, IntegerField, OuterRef, Prefetch, Subquery, Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.selectors import teaching_assignments_for
from apps.accounts.models import Role
from apps.accounts.permissions import ContentPermission, IsAdminOrTeacher, IsStudent, IsTeacher
from apps.common.excel import import_response, is_dry_run, template_response
from apps.common.files import file_response
from apps.common.mixins import ProtectedDeleteMixin
from apps.tasks.gradebook import roster_students

from .images import image_error, read_zip, save_image
from .models import Assessment, Attempt, ImageSlot, Question, QuestionImage
from .question_import import build_question_template, parse_excel, parse_text, prepare, preview
from .question_import import save as save_imported
from .serializers import (
    AssessmentSerializer,
    GradeSerializer,
    QuestionSerializer,
    StudentQuestionSerializer,
    SubmitSerializer,
    ViolationSerializer,
    answer_sheet,
    attempt_summary,
)
from .services import (
    ensure_editable,
    grade_answers,
    record_violation,
    save_draft,
    start_attempt,
    submit_attempt,
)


def _subquery(queryset, aggregate):
    """Hitungan per asesmen lewat subquery (menghindari angka berlipat karena join ganda)."""
    return Coalesce(
        Subquery(
            queryset.filter(assessment=OuterRef("pk"))
            .order_by()
            .values("assessment")
            .annotate(value=aggregate)
            .values("value")[:1],
            output_field=IntegerField(),
        ),
        0,
    )


def assessments_for(user):
    """Admin: semua. Guru: asesmen kelas-mapel miliknya (termasuk draf). Siswa: yang terbit di kelasnya."""
    queryset = Assessment.objects.filter(teaching_assignment__in=teaching_assignments_for(user))
    if user.role == Role.STUDENT:
        queryset = queryset.filter(is_published=True)
    return queryset


def attempt_with_answers():
    return Attempt.objects.select_related("assessment", "student").prefetch_related(
        "answers", "assessment__questions__images"
    )


class AssessmentViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    serializer_class = AssessmentSerializer
    permission_classes = [ContentPermission]
    filterset_fields = {"teaching_assignment": ["exact"], "is_published": ["exact"], "due_at": ["gte", "lte"]}
    search_fields = ["title"]
    ordering_fields = ["due_at", "created_at"]
    protected_message = "Asesmen ini sudah dikerjakan siswa sehingga tidak bisa dihapus. Jadikan draf saja."

    def get_queryset(self):
        user = self.request.user
        submitted = Attempt.objects.filter(submitted_at__isnull=False)
        queryset = (
            assessments_for(user)
            .select_related("teaching_assignment__subject", "teaching_assignment__classroom")
            .annotate(
                question_count=_subquery(Question.objects.all(), Count("pk")),
                max_score=_subquery(Question.objects.all(), Sum("points")),
                attempt_count=_subquery(Attempt.objects.all(), Count("pk")),
                submitted_count=_subquery(submitted, Count("pk")),
                needs_grading_count=_subquery(submitted.filter(score__isnull=True), Count("pk")),
                student_count=Count("teaching_assignment__classroom__students", distinct=True),
            )
            .order_by(*Assessment._meta.ordering)
        )
        if user.role == Role.STUDENT:
            mine = Attempt.objects.filter(student=user).prefetch_related("answers")
            queryset = queryset.prefetch_related(Prefetch("attempts", queryset=mine, to_attr="my_attempts"))
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, permission_classes=[IsAdminOrTeacher])
    def questions(self, request, pk=None):
        """Soal lengkap dengan kunci jawaban, untuk guru pengampu (dan admin)."""
        assessment = self.get_object()
        return Response(QuestionSerializer(assessment.questions.prefetch_related("images"), many=True).data)

    @action(detail=False, url_path="question-template", permission_classes=[IsAdminOrTeacher])
    def question_template(self, request):
        """Template Excel soal (contoh rumus, soal Arab, gambar, dan lembar Contekan Rumus)."""
        return template_response(build_question_template(), "Template Soal Asesmen.xlsx")

    @action(detail=True, methods=["post"], url_path="import-questions", permission_classes=[IsTeacher])
    def import_questions(self, request, pk=None):
        """Impor soal. mode=excel (file .xlsx) atau mode=text (soal ditempel), + ZIP gambar opsional.
        dry_run=true (bawaan) hanya memeriksa; false menyimpan jika SEMUA soal benar."""
        assessment = self.get_object()
        ensure_editable(assessment)
        if request.data.get("mode") == "text":
            text = request.data.get("text", "")
            if not text.strip():
                raise ValidationError({"text": "Tempelkan soal terlebih dahulu."})
            items = parse_text(text)
            if not items:
                raise ValidationError(
                    {"text": 'Tidak ada soal yang dikenali. Awali setiap soal dengan nomor, mis. "1."'}
                )
        else:
            items = parse_excel(request.FILES.get("file"))
        zip_images = read_zip(request.FILES.get("images"))
        rows = prepare(assessment, request, items, zip_images)
        return import_response(preview(rows), is_dry_run(request), lambda: save_imported(rows, zip_images))

    @action(detail=True, methods=["post"], permission_classes=[IsStudent])
    def start(self, request, pk=None):
        """Siswa mulai (atau melanjutkan) mengerjakan. Mengembalikan soal TANPA kunci jawaban."""
        assessment = self.get_object()
        attempt = start_attempt(assessment, request.user)
        if attempt.submitted_at:
            return self._my_attempt_response(attempt)
        return Response(
            {
                "attempt": attempt_summary(attempt),
                "questions": StudentQuestionSerializer(
                    assessment.questions.prefetch_related("images"), many=True
                ).data,
                # Jawaban sementara di server, dipulihkan jika pindah perangkat / cache terhapus.
                "draft": attempt.draft_answers,
                "rules": {
                    "max_violations": assessment.max_violations,
                    "require_fullscreen": assessment.require_fullscreen,
                },
                "server_time": timezone.now(),
            }
        )

    def _my_open_attempt(self, request):
        assessment = self.get_object()
        return get_object_or_404(
            Attempt.objects.select_related("assessment"), assessment=assessment, student=request.user
        )

    @action(detail=True, methods=["post"], permission_classes=[IsStudent])
    def draft(self, request, pk=None):
        """Simpan jawaban sementara (otomatis beberapa detik sekali saat siswa mengerjakan)."""
        serializer = SubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        save_draft(self._my_open_attempt(request), serializer.validated_data["answers"])
        return Response({"saved": True})

    @action(detail=True, methods=["post"], permission_classes=[IsStudent])
    def violation(self, request, pk=None):
        """Catat siswa keluar dari halaman ujian. Bisa memicu pengumpulan otomatis."""
        serializer = ViolationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        attempt = record_violation(self._my_open_attempt(request), serializer.validated_data["kind"])
        if attempt.submitted_at:
            return self._my_attempt_response(attempt_with_answers().get(pk=attempt.pk))
        return Response({"attempt": attempt_summary(attempt)})

    @action(detail=True, methods=["post"], permission_classes=[IsStudent])
    def submit(self, request, pk=None):
        assessment = self.get_object()
        attempt = get_object_or_404(Attempt, assessment=assessment, student=request.user)
        serializer = SubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submit_attempt(attempt, serializer.validated_data["answers"])
        return self._my_attempt_response(attempt_with_answers().get(pk=attempt.pk))

    @action(detail=True, url_path="my-attempt", permission_classes=[IsStudent])
    def my_attempt(self, request, pk=None):
        assessment = self.get_object()
        attempt = attempt_with_answers().filter(assessment=assessment, student=request.user).first()
        if attempt is None:
            return Response({"attempt": None, "questions": []})
        if not attempt.submitted_at:
            return self.start(request, pk)
        return self._my_attempt_response(attempt)

    def _my_attempt_response(self, attempt):
        # Kunci jawaban dibuka setelah tenggat, jika guru mengizinkan.
        assessment = attempt.assessment
        reveal = assessment.show_answers and assessment.is_past_due
        return Response(
            {
                "attempt": attempt_summary(attempt),
                "questions": answer_sheet(attempt, reveal_answers=reveal),
                "answers_revealed": reveal,
            }
        )

    @action(detail=True, permission_classes=[IsAdminOrTeacher])
    def results(self, request, pk=None):
        """Rekap: setiap siswa di kelas beserta status & nilai pengerjaannya."""
        assessment = self.get_object()
        attempts = list(
            assessment.attempts.select_related("student", "assessment").prefetch_related("answers")
        )
        by_student = {a.student_id: a for a in attempts}
        rows = [
            {
                "student": {"id": s.id, "full_name": s.full_name, "nis": s.nis},
                "attempt": attempt_summary(by_student.get(s.id)),
            }
            for s in roster_students(assessment.teaching_assignment, attempts)
        ]
        return Response(rows)


class QuestionViewSet(viewsets.ModelViewSet):
    """Kelola soal (khusus guru pengampu). Terkunci setelah ada siswa yang mulai mengerjakan."""

    serializer_class = QuestionSerializer
    permission_classes = [IsTeacher]
    filterset_fields = ["assessment"]
    pagination_class = None

    def get_queryset(self):
        return Question.objects.filter(
            assessment__teaching_assignment__teacher=self.request.user
        ).prefetch_related("images")

    def perform_destroy(self, instance):
        ensure_editable(instance.assessment)
        instance.delete()

    @action(detail=True, methods=["post", "delete"])
    def images(self, request, pk=None):
        """Pasang (POST: slot, index, file) atau hapus (DELETE ?slot=&index=) gambar soal.
        slot: stimulus | question | choice (index = nomor pilihan, 0 = A)."""
        question = self.get_object()
        ensure_editable(question.assessment)
        params = request.data if request.method == "POST" else request.query_params
        slot = params.get("slot")
        raw_index = str(params.get("index") or 0)
        index = int(raw_index) if raw_index.isdigit() else -1
        if slot not in ImageSlot.values:
            raise ValidationError({"slot": "Letak gambar harus stimulus, question, atau choice."})
        if slot != ImageSlot.CHOICE:
            index = 0
        elif not 0 <= index < len(question.choices):
            raise ValidationError({"index": "Nomor pilihan tidak ada pada soal ini."})
        if request.method == "DELETE":
            question.images.filter(slot=slot, index=index).delete()
            return Response(status=204)
        file = request.FILES.get("file")
        if file is None:
            raise ValidationError({"file": "Pilih file gambar."})
        data = file.read()
        error = image_error(file.name, data)
        if error:
            raise ValidationError({"file": error})
        save_image(question, slot, index, file.name, data)
        # Ambil ulang: daftar gambar hasil prefetch di objek lama belum memuat gambar baru.
        return Response(self.get_serializer(self.get_queryset().get(pk=question.pk)).data)


class AttemptViewSet(viewsets.GenericViewSet):
    """Detail pengerjaan untuk guru (lengkap dengan kunci) dan penilaian esai."""

    permission_classes = [IsAdminOrTeacher]

    def get_queryset(self):
        queryset = attempt_with_answers()
        if self.request.user.role == Role.TEACHER:
            queryset = queryset.filter(assessment__teaching_assignment__teacher=self.request.user)
        return queryset

    def retrieve(self, request, pk=None):
        attempt = self.get_object()
        return Response(
            {
                "student": {"id": attempt.student.id, "full_name": attempt.student.full_name},
                "assessment": {"id": attempt.assessment.id, "title": attempt.assessment.title},
                "attempt": attempt_summary(attempt),
                "questions": answer_sheet(attempt, reveal_answers=True, include_key=True),
                "events": [
                    {"kind": e.kind, "label": e.get_kind_display(), "created_at": e.created_at}
                    for e in attempt.events.all()
                ],
            }
        )

    @action(detail=True, methods=["patch"], permission_classes=[IsTeacher])
    def grade(self, request, pk=None):
        attempt = self.get_object()
        serializer = GradeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        grade_answers(attempt, serializer.validated_data["grades"])
        return self.retrieve(request, pk)


class AssessmentImageView(APIView):
    """Kirim gambar soal. Siswa baru bisa melihatnya setelah mulai mengerjakan asesmen itu."""

    def get(self, request, pk):
        image = get_object_or_404(QuestionImage.objects.select_related("question__assessment"), pk=pk)
        assessment = image.question.assessment
        if not assessments_for(request.user).filter(pk=assessment.pk).exists():
            raise NotFound()
        if (
            request.user.role == Role.STUDENT
            and not assessment.attempts.filter(student=request.user).exists()
        ):
            raise NotFound()
        response = file_response(image.file, image.original_filename or "gambar")
        response["Cache-Control"] = "private, max-age=3600"
        return response
