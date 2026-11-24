from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.filters import TeamContentFilter
from apps.academics.selectors import classrooms_for, team_assignments_for, team_assignments_for_request
from apps.accounts.models import Role
from apps.school_settings.services import SettingReader
from apps.schools.context import active_school, require_school

from . import services
from .models import CardAssignment, QuizSession


class StaffOnly(BasePermission):
    """Baca: admin & guru (data dibatasi queryset). Menulis: guru (sesi) / admin & guru kelas (kartu)."""

    message = "Anda tidak memiliki akses ke Kuis QR."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role != Role.STUDENT)


# --- Peta kartu -------------------------------------------------------------------------------


class CardRecordSerializer(serializers.Serializer):
    student = serializers.IntegerField()
    number = serializers.IntegerField(allow_null=True, required=False, default=None)


class CardsSerializer(serializers.Serializer):
    classroom = serializers.IntegerField()
    records = CardRecordSerializer(many=True, max_length=500)


class CardMapView(APIView):
    """GET ?classroom=: siswa kelas + nomor kartunya. PUT {classroom, records}: ganti seluruh peta.
    Untuk admin dan guru yang mengajar/mewalikan kelas itu."""

    permission_classes = [StaffOnly]

    def _classroom(self, classroom_id):
        school = require_school(self.request)
        return get_object_or_404(classrooms_for(self.request.user, school), pk=classroom_id)

    def _response(self, classroom):
        reader = SettingReader(classroom.school)
        return Response(
            {
                "classroom": classroom.pk,
                "classroom_name": classroom.name,
                "card_limit": reader.get("kuis_qr.kartu_per_set"),
                "rows": services.card_rows(classroom),
            }
        )

    def get(self, request):
        classroom_id = request.query_params.get("classroom")
        if not str(classroom_id or "").isdigit():
            raise ValidationError({"classroom": "Pilih kelas."})
        return self._response(self._classroom(classroom_id))

    def put(self, request):
        serializer = CardsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        classroom = self._classroom(serializer.validated_data["classroom"])
        services.ensure_enabled(classroom.school)
        services.save_cards(classroom, serializer.validated_data["records"])
        return self._response(classroom)


class AutoCardsView(CardMapView):
    """POST {classroom}: isi peta kartu otomatis sesuai urutan nama."""

    def get(self, request):
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def put(self, request):
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def post(self, request):
        classroom_id = request.data.get("classroom")
        if not str(classroom_id or "").isdigit():
            raise ValidationError({"classroom": "Pilih kelas."})
        classroom = self._classroom(classroom_id)
        services.ensure_enabled(classroom.school)
        services.auto_cards(classroom)
        return self._response(classroom)


# --- Sesi kuis --------------------------------------------------------------------------------


class SessionPermission(StaffOnly):
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        return request.method in SAFE_METHODS or request.user.role == Role.TEACHER


class QuizSessionSerializer(serializers.ModelSerializer):
    classroom = serializers.IntegerField(source="teaching_assignment.classroom_id", read_only=True)
    subject = serializers.IntegerField(source="teaching_assignment.subject_id", read_only=True)
    classroom_name = serializers.CharField(source="teaching_assignment.classroom.name", read_only=True)
    subject_name = serializers.CharField(source="teaching_assignment.subject.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", default=None, read_only=True)
    question_count = serializers.SerializerMethodField()
    answer_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = QuizSession
        fields = [
            "id",
            "teaching_assignment",
            "classroom",
            "classroom_name",
            "subject",
            "subject_name",
            "title",
            "questions",
            "question_count",
            "answer_count",
            "current_question",
            "revealed",
            "grade_activity",
            "created_by_name",
            "created_at",
            "finished_at",
        ]
        read_only_fields = ["current_question", "revealed", "grade_activity", "created_at", "finished_at"]

    def get_question_count(self, session):
        return len(session.questions or [])

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        if request is not None:
            fields["teaching_assignment"].queryset = team_assignments_for_request(request)
        return fields

    def validate_teaching_assignment(self, assignment):
        if self.instance and assignment.pk != self.instance.teaching_assignment_id:
            raise serializers.ValidationError("Kelas-mapel kuis tidak bisa diubah.")
        return assignment

    def validate(self, attrs):
        if self.instance:
            services.ensure_open(self.instance)
        if "questions" in attrs:
            if self.instance and self.instance.answers.exists():
                raise ValidationError(
                    {"questions": "Soal tidak bisa diubah setelah ada jawaban yang dipindai."}
                )
            assignment = attrs.get("teaching_assignment") or self.instance.teaching_assignment
            attrs["questions"] = services.clean_questions(
                attrs["questions"], services.option_limit(assignment)
            )
        elif not self.instance:
            raise ValidationError({"questions": "Tambahkan minimal satu soal."})
        return attrs


class QuizSessionDetailSerializer(QuizSessionSerializer):
    """Detail = semua yang dibutuhkan layar TV & pemindai (dibaca berkala): peta kartu + jawaban."""

    roster = serializers.SerializerMethodField()
    answers = serializers.SerializerMethodField()
    options = serializers.SerializerMethodField()

    class Meta(QuizSessionSerializer.Meta):
        fields = QuizSessionSerializer.Meta.fields + ["roster", "answers", "options"]

    def get_roster(self, session):
        classroom_id = session.teaching_assignment.classroom_id
        numbers = dict(
            CardAssignment.objects.filter(classroom_id=classroom_id).values_list("student_id", "number")
        )
        return [
            {"student": s.pk, "full_name": s.full_name, "number": numbers.get(s.pk)}
            for s in services.class_students(classroom_id)
        ]

    def get_answers(self, session):
        return [
            {"question": q, "student": s, "card": c, "option": o, "correct": ok}
            for q, s, c, o, ok in session.answers.values_list(
                "question", "student_id", "card_number", "option", "is_correct"
            )
        ]

    def get_options(self, session):
        assignment = session.teaching_assignment
        reader = SettingReader(assignment.classroom.school)
        subject = assignment.subject_id
        return {
            "show_chart": reader.get("kuis_qr.tampil_hasil_layar", subject=subject),
            "allow_rescan": reader.get("kuis_qr.boleh_pindai_ulang"),
        }


class SessionFilter(TeamContentFilter):
    class Meta:
        model = QuizSession
        fields = []


class ControlSerializer(serializers.Serializer):
    question = serializers.IntegerField(min_value=0, required=False)
    revealed = serializers.BooleanField(required=False)


class ScanSerializer(serializers.Serializer):
    card = serializers.IntegerField(min_value=1)
    option = serializers.IntegerField(min_value=0, max_value=3)


class ScansSerializer(serializers.Serializer):
    question = serializers.IntegerField(min_value=0)
    scans = ScanSerializer(many=True, max_length=300)


class QuizSessionViewSet(viewsets.ModelViewSet):
    """Sesi kuis QR per kelas-mapel (tim pengampu). Menulis hanya saat fitur `kuis_qr` menyala;
    admin hanya melihat. Selesai = nilai tersimpan sebagai penilaian langsung jenis Kuis QR."""

    permission_classes = [SessionPermission]
    filterset_class = SessionFilter

    def get_serializer_class(self):
        if self.action in ("retrieve", "control", "scans"):
            return QuizSessionDetailSerializer
        return QuizSessionSerializer

    def get_queryset(self):
        assignments = team_assignments_for(self.request.user, active_school(self.request))
        return (
            QuizSession.objects.filter(teaching_assignment__in=assignments)
            .select_related(
                "teaching_assignment__classroom__school", "teaching_assignment__subject", "created_by"
            )
            .annotate(answer_count=Count("answers"))
            .order_by("-created_at", "-id")
        )

    def _ensure_writable(self):
        services.ensure_enabled(require_school(self.request))

    def perform_create(self, serializer):
        self._ensure_writable()
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        self._ensure_writable()
        serializer.save()

    def perform_destroy(self, instance):
        # Nilai yang sudah tersimpan (penilaian langsung) tetap ada.
        self._ensure_writable()
        instance.delete()

    def _detail(self, session):
        return Response(QuizSessionDetailSerializer(self.get_queryset().get(pk=session.pk)).data)

    @action(detail=True, methods=["post"])
    def control(self, request, pk=None):
        """Pindah soal / tampilkan hasil di TV: {question?, revealed?}. Pindah soal = hasil disembunyikan."""
        session = self.get_object()
        self._ensure_writable()
        services.ensure_open(session)
        serializer = ControlSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "question" in data:
            if data["question"] >= len(session.questions):
                raise ValidationError({"question": "Nomor soal tidak ada."})
            if data["question"] != session.current_question:
                session.current_question = data["question"]
                session.revealed = False
        if "revealed" in data:
            session.revealed = data["revealed"]
        session.save(update_fields=["current_question", "revealed"])
        return self._detail(session)

    @action(detail=True, methods=["post"])
    def scans(self, request, pk=None):
        """Hasil satu bidikan kamera: {question, scans: [{card, option}]}."""
        session = self.get_object()
        self._ensure_writable()
        serializer = ScansSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = services.record_scans(
            session, serializer.validated_data["question"], serializer.validated_data["scans"]
        )
        return Response({"report": report, "session": self._detail(session).data})

    @action(detail=True, methods=["post"])
    def finish(self, request, pk=None):
        session = self.get_object()
        self._ensure_writable()
        activity = services.finish(session, request.user)
        return Response(
            {
                "detail": "Kuis selesai. Nilai tersimpan di Penilaian Langsung.",
                "grade_activity": activity.pk,
                "session": self._detail(session).data,
            }
        )

    @action(detail=False, methods=["get"])
    def bank(self, request):
        """?teaching_assignment=: soal PG dari asesmen kelas-mapel itu yang muat di kartu."""
        assignment_id = request.query_params.get("teaching_assignment")
        if not str(assignment_id or "").isdigit():
            raise ValidationError({"teaching_assignment": "Pilih kelas-mapel."})
        assignments = team_assignments_for(request.user, active_school(request))
        assignment = get_object_or_404(assignments, pk=assignment_id)
        if request.user.role != Role.TEACHER:
            raise PermissionDenied("Hanya guru pengampu yang dapat menyusun kuis.")
        limit = services.option_limit(assignment)
        return Response({"option_limit": limit, "questions": services.bank_questions(assignment, limit)})
