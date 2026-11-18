from django.core import signing
from django.db.models import Count, IntegerField, OuterRef, Prefetch, Subquery, Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.filters import TeamContentFilter
from apps.academics.selectors import team_assignments_for, team_assignments_for_request
from apps.accounts.models import Role, User
from apps.accounts.permissions import ContentPermission, IsAdminOrTeacher, IsStudent, IsTeacher
from apps.common.excel import import_response, is_dry_run, template_response
from apps.common.files import file_response
from apps.common.mixins import ProtectedDeleteMixin
from apps.schools.context import active_school
from apps.tasks.gradebook import roster_students

from . import interactive
from .images import image_error, read_zip, save_image
from .models import Assessment, Attempt, ImageSlot, Question, QuestionImage, QuestionKind
from .question_import import build_question_template, parse_excel, parse_text, prepare, preview
from .question_import import save as save_imported
from .results import final_result, max_score_of
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
    check_checkpoint,
    checkpoint_feedback,
    ensure_editable,
    grade_answers,
    latest_attempt,
    record_violation,
    save_draft,
    start_attempt,
    submit_attempt,
)
from .videos import ranged_response, read_token, video_error


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


def assessments_for(user, school):
    """Admin: semua. Guru: asesmen kelas-mapel tim-nya (termasuk draf & buatan rekan setim).
    Siswa: yang terbit di kelasnya."""
    queryset = Assessment.objects.filter(teaching_assignment__in=team_assignments_for(user, school))
    if user.role == Role.STUDENT:
        queryset = queryset.filter(is_published=True)
    return queryset


def attempt_with_answers():
    return Attempt.objects.select_related("assessment", "student").prefetch_related(
        "answers", "assessment__questions__images"
    )


class AssessmentFilter(TeamContentFilter):
    class Meta:
        model = Assessment
        fields = {"is_published": ["exact"], "due_at": ["gte", "lte"]}


class AssessmentViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    serializer_class = AssessmentSerializer
    permission_classes = [ContentPermission]
    filterset_class = AssessmentFilter
    search_fields = ["title"]
    ordering_fields = ["due_at", "created_at"]
    protected_message = "Asesmen ini sudah dikerjakan siswa sehingga tidak bisa dihapus. Jadikan draf saja."

    def get_queryset(self):
        user = self.request.user
        submitted = Attempt.objects.filter(submitted_at__isnull=False)
        queryset = (
            assessments_for(user, active_school(self.request))
            .select_related("teaching_assignment__subject", "teaching_assignment__classroom", "exam_event")
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
            mine = Attempt.objects.filter(student=user).prefetch_related("answers").order_by("-number")
            queryset = queryset.prefetch_related(Prefetch("attempts", queryset=mine, to_attr="my_attempts"))
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, permission_classes=[IsAdminOrTeacher])
    def questions(self, request, pk=None):
        """Soal lengkap dengan kunci jawaban, untuk guru pengampu (dan admin)."""
        assessment = self.get_object()
        return Response(
            QuestionSerializer(
                assessment.questions.prefetch_related("images"), many=True, context={"request": request}
            ).data
        )

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
        from apps.materials.progress import ensure_content_unlocked  # hindari impor melingkar

        ensure_content_unlocked(request, "assessments", assessment.id)
        token = str(request.data.get("token", ""))
        remedial = str(request.data.get("remedial", "")).lower() in ("1", "true")
        attempt = start_attempt(assessment, request.user, token, remedial)
        if attempt.submitted_at:
            return self._my_attempt_response(attempt)
        return Response(
            {
                "attempt": attempt_summary(attempt),
                # Video mode latihan: checkpoint yang sudah diperiksa (dipulihkan setelah refresh).
                "checkpoints": checkpoint_feedback(attempt),
                "questions": StudentQuestionSerializer(
                    assessment.questions.prefetch_related("images"),
                    many=True,
                    context={"request": request, "seed": attempt.id},
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
        """Pengerjaan terbaru siswa (remedial jika ada). Yang sudah dikumpulkan ditolak/diabaikan oleh
        save_draft & record_violation."""
        attempt = latest_attempt(self.get_object(), request.user)
        if attempt is None:
            raise NotFound()
        return attempt

    @action(detail=True, methods=["post"], permission_classes=[IsStudent])
    def draft(self, request, pk=None):
        """Simpan jawaban sementara (otomatis beberapa detik sekali saat siswa mengerjakan)."""
        serializer = SubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        save_draft(self._my_open_attempt(request), serializer.validated_data["answers"])
        return Response({"saved": True})

    @action(detail=True, methods=["post"], permission_classes=[IsStudent])
    def checkpoint(self, request, pk=None):
        """Video interaktif mode latihan: periksa jawaban satu checkpoint (benar/salah + pembahasan).
        Jawaban yang sudah diperiksa dikunci dan ikut dinilai saat dikumpulkan."""
        result = check_checkpoint(
            self._my_open_attempt(request),
            request.data.get("question"),
            str(request.data.get("checkpoint", "")),
            request.data.get("response"),
        )
        return Response(result)

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
        attempt = latest_attempt(assessment, request.user)
        if attempt is None:
            raise NotFound()
        serializer = SubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submit_attempt(attempt, serializer.validated_data["answers"])
        return self._my_attempt_response(attempt_with_answers().get(pk=attempt.pk))

    @action(detail=True, url_path="my-attempt", permission_classes=[IsStudent])
    def my_attempt(self, request, pk=None):
        assessment = self.get_object()
        attempt = (
            attempt_with_answers()
            .filter(assessment=assessment, student=request.user)
            .order_by("-number")
            .first()
        )
        if attempt is None:
            return Response({"attempt": None, "questions": []})
        if not attempt.submitted_at:
            return self.start(request, pk)
        return self._my_attempt_response(attempt)

    def _my_attempt_response(self, attempt):
        # Kunci jawaban dibuka setelah tenggat terakhir (termasuk remedial), jika guru mengizinkan.
        assessment = attempt.assessment
        reveal = assessment.show_answers and timezone.now() > assessment.last_due_at
        attempts = Attempt.objects.filter(assessment=assessment, student=attempt.student)
        return Response(
            {
                "attempt": attempt_summary(attempt),
                "result": final_result(assessment, attempts, max_score_of(assessment)),
                "questions": answer_sheet(attempt, reveal_answers=reveal, request=self.request),
                "answers_revealed": reveal,
            }
        )

    @action(detail=True, permission_classes=[IsAdminOrTeacher])
    def results(self, request, pk=None):
        """Rekap: setiap siswa di kelas beserta status & nilai pengerjaannya."""
        assessment = self.get_object()
        attempts = list(
            assessment.attempts.select_related("student", "assessment")
            .prefetch_related("answers")
            .order_by("number")
        )
        by_student = {}
        for attempt in attempts:
            by_student.setdefault(attempt.student_id, []).append(attempt)
        max_score = max_score_of(assessment)
        rows = []
        for s in roster_students(assessment.teaching_assignment, attempts):
            mine = by_student.get(s.id, [])
            rows.append(
                {
                    "student": {"id": s.id, "full_name": s.full_name, "nis": s.nis},
                    # Pengerjaan terbaru (remedial jika ada) + riwayat semua percobaan.
                    "attempt": attempt_summary(mine[-1]) if mine else None,
                    "attempts": [attempt_summary(a) for a in mine],
                    "result": final_result(assessment, mine, max_score),
                }
            )
        return Response(rows)


class QuestionViewSet(viewsets.ModelViewSet):
    """Kelola soal (khusus guru pengampu). Terkunci setelah ada siswa yang mulai mengerjakan."""

    serializer_class = QuestionSerializer
    permission_classes = [IsTeacher]
    filterset_fields = ["assessment"]
    pagination_class = None

    def get_queryset(self):
        return Question.objects.filter(
            assessment__teaching_assignment__in=team_assignments_for_request(self.request)
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
            raise ValidationError({"slot": "Letak gambar harus stimulus, question, choice, atau video."})
        if slot == ImageSlot.VIDEO:
            return self._video(request, question)
        if slot != ImageSlot.CHOICE:
            index = 0
        elif not 0 <= index < interactive.choice_count(question):
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

    def _video(self, request, question):
        """File video soal video interaktif (sumber "file"). Disimpan langsung tanpa dibaca utuh ke memori."""
        if question.kind != QuestionKind.INTERACTIVE_VIDEO or question.content.get("source") != "file":
            raise ValidationError({"slot": "Video hanya untuk soal video interaktif bersumber file."})
        if request.method == "DELETE":
            question.images.filter(slot=ImageSlot.VIDEO).delete()
            return Response(status=204)
        file = request.FILES.get("file")
        if file is None:
            raise ValidationError({"file": "Pilih file video."})
        head = file.read(16)
        file.seek(0)
        error = video_error(file.name, head, file.size)
        if error:
            raise ValidationError({"file": error})
        question.images.filter(slot=ImageSlot.VIDEO).delete()
        video = QuestionImage(question=question, slot=ImageSlot.VIDEO, original_filename=file.name[:255])
        video.file.save(file.name, file, save=False)
        video.save()
        return Response(self.get_serializer(self.get_queryset().get(pk=question.pk)).data)


class AttemptViewSet(viewsets.GenericViewSet):
    """Detail pengerjaan untuk guru (lengkap dengan kunci) dan penilaian esai."""

    permission_classes = [IsAdminOrTeacher]

    def get_queryset(self):
        queryset = attempt_with_answers().filter(
            assessment__teaching_assignment__classroom__school=active_school(self.request)
        )
        if self.request.user.role == Role.TEACHER:
            queryset = queryset.filter(
                assessment__teaching_assignment__in=team_assignments_for_request(self.request)
            )
        return queryset

    def retrieve(self, request, pk=None):
        attempt = self.get_object()
        return Response(
            {
                "student": {"id": attempt.student.id, "full_name": attempt.student.full_name},
                "assessment": {"id": attempt.assessment.id, "title": attempt.assessment.title},
                "attempt": attempt_summary(attempt),
                "questions": answer_sheet(attempt, reveal_answers=True, include_key=True, request=request),
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
        if not assessments_for(request.user, active_school(request)).filter(pk=assessment.pk).exists():
            raise NotFound()
        if (
            request.user.role == Role.STUDENT
            and not assessment.attempts.filter(student=request.user).exists()
        ):
            raise NotFound()
        response = file_response(image.file, image.original_filename or "gambar")
        response["Cache-Control"] = "private, max-age=3600"
        return response


class AssessmentVideoView(APIView):
    """Putar video soal lewat alamat bertanda tangan (lihat videos.py). Hak akses pengguna pemilik
    token dicek ulang: guru/admin sesuai asesmennya, siswa hanya setelah mulai mengerjakan."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, pk):
        video = get_object_or_404(
            QuestionImage.objects.select_related("question__assessment__teaching_assignment__classroom"),
            pk=pk,
            slot=ImageSlot.VIDEO,
        )
        try:
            user_id = read_token(request.query_params.get("t", ""), video.id)
        except signing.BadSignature:
            raise PermissionDenied("Alamat video sudah kedaluwarsa. Muat ulang halaman.")
        user = User.objects.filter(pk=user_id, is_active=True).first()
        assessment = video.question.assessment
        school = assessment.teaching_assignment.classroom.school
        if user is None or not assessments_for(user, school).filter(pk=assessment.pk).exists():
            raise NotFound()
        if user.role == Role.STUDENT and not assessment.attempts.filter(student=user).exists():
            raise NotFound()
        return ranged_response(request, video.file, video.original_filename)
