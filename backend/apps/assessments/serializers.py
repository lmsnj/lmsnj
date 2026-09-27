from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from apps.academics.models import TeachingAssignment

from .images import images_data
from .models import Assessment, ImageSlot, Question, QuestionKind, ViolationKind
from .services import ensure_editable, ensure_publishable

MAX_CHOICES = 6


def attempt_summary(attempt):
    """Ringkasan pengerjaan (dipakai siswa dan guru)."""
    if attempt is None:
        return None
    points = [a.points for a in attempt.answers.all()]
    auto_score = sum((p for p in points if p is not None), Decimal(0))
    if attempt.submitted_at:
        status = "graded" if attempt.score is not None else "submitted"
    else:
        status = "in_progress"
    return {
        "id": attempt.id,
        "status": status,
        "started_at": attempt.started_at,
        "deadline": attempt.deadline,
        "submitted_at": attempt.submitted_at,
        "is_late": attempt.is_late,
        "score": float(attempt.score) if attempt.score is not None else None,
        # Nilai sementara (pilihan ganda + esai yang sudah dinilai), sebelum semua esai dinilai.
        "auto_score": float(auto_score),
        "ungraded": points.count(None),
        "violation_count": attempt.violation_count,
        "auto_submitted": attempt.auto_submitted,
    }


class QuestionSerializer(serializers.ModelSerializer):
    """Soal versi GURU (berisi kunci jawaban). Jangan pernah dipakai untuk siswa."""

    assessment = serializers.PrimaryKeyRelatedField(queryset=Assessment.objects.none())
    images = serializers.SerializerMethodField()
    # Nomor pilihan yang akan diberi gambar: pilihan tersebut boleh tanpa teks (pilihan bergambar).
    image_choices = serializers.ListField(
        child=serializers.IntegerField(min_value=0), write_only=True, required=False
    )

    class Meta:
        model = Question
        fields = [
            "id",
            "assessment",
            "order",
            "kind",
            "stimulus",
            "text",
            "text_direction",
            "points",
            "choices",
            "correct_choice",
            "images",
            "image_choices",
        ]

    def get_images(self, obj):
        return images_data(obj)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            self.fields["assessment"].queryset = Assessment.objects.filter(
                teaching_assignment__teacher=request.user
            )

    def validate_assessment(self, value):
        if self.instance and value != self.instance.assessment:
            raise serializers.ValidationError("Soal tidak bisa dipindah ke asesmen lain.")
        return value

    def validate(self, attrs):
        assessment = attrs.get("assessment") or self.instance.assessment
        ensure_editable(assessment)
        kind = attrs.get("kind", getattr(self.instance, "kind", QuestionKind.CHOICE))
        with_image = set(attrs.pop("image_choices", []) or [])
        if self.instance:
            with_image |= set(
                self.instance.images.filter(slot=ImageSlot.CHOICE).values_list("index", flat=True)
            )
        if kind == QuestionKind.CHOICE:
            choices = attrs.get("choices", getattr(self.instance, "choices", []))
            if not isinstance(choices, list) or not all(isinstance(c, str) for c in choices):
                raise serializers.ValidationError({"choices": "Pilihan harus berupa daftar teks."})
            choices = [c.strip() for c in choices]
            empty = [i for i, c in enumerate(choices) if not c and i not in with_image]
            if not 2 <= len(choices) <= MAX_CHOICES or empty:
                raise serializers.ValidationError(
                    {
                        "choices": f"Isi 2 sampai {MAX_CHOICES} pilihan. Pilihan tanpa teks harus diberi gambar."
                    }
                )
            correct = attrs.get("correct_choice", getattr(self.instance, "correct_choice", None))
            if correct is None or correct >= len(choices):
                raise serializers.ValidationError(
                    {"correct_choice": "Tandai satu pilihan sebagai jawaban benar."}
                )
            attrs["choices"] = choices
        else:
            attrs["choices"] = []
            attrs["correct_choice"] = None
        return attrs

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        # Gambar milik pilihan yang sudah dihapus ikut dihapus.
        instance.images.filter(slot=ImageSlot.CHOICE, index__gte=len(instance.choices)).delete()
        return instance


class StudentQuestionSerializer(serializers.ModelSerializer):
    """Soal versi SISWA: tanpa kunci jawaban."""

    images = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = ["id", "order", "kind", "stimulus", "text", "text_direction", "points", "choices", "images"]

    def get_images(self, obj):
        return images_data(obj)


class AssessmentSerializer(serializers.ModelSerializer):
    teaching_assignment = serializers.PrimaryKeyRelatedField(queryset=TeachingAssignment.objects.none())
    subject_name = serializers.CharField(source="teaching_assignment.subject.name", read_only=True)
    classroom_name = serializers.CharField(source="teaching_assignment.classroom.name", read_only=True)
    is_past_due = serializers.BooleanField(read_only=True)
    question_count = serializers.IntegerField(read_only=True, default=0)
    max_score = serializers.IntegerField(read_only=True, default=0)
    submitted_count = serializers.IntegerField(read_only=True, default=0)
    needs_grading_count = serializers.IntegerField(read_only=True, default=0)
    student_count = serializers.IntegerField(read_only=True, default=0)
    locked = serializers.SerializerMethodField()
    my_attempt = serializers.SerializerMethodField()

    class Meta:
        model = Assessment
        fields = [
            "id",
            "teaching_assignment",
            "subject_name",
            "classroom_name",
            "title",
            "instructions",
            "due_at",
            "duration_minutes",
            "show_answers",
            "max_violations",
            "require_fullscreen",
            "is_published",
            "is_past_due",
            "question_count",
            "max_score",
            "submitted_count",
            "needs_grading_count",
            "student_count",
            "locked",
            "my_attempt",
            "created_at",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            self.fields["teaching_assignment"].queryset = TeachingAssignment.objects.filter(
                teacher=request.user
            )

    def get_locked(self, obj):
        # Hitungan dari annotate; untuk objek baru dibuat pasti belum ada pengerjaan.
        return bool(getattr(obj, "attempt_count", 0))

    def get_my_attempt(self, obj):
        mine = getattr(obj, "my_attempts", None)
        return attempt_summary(mine[0]) if mine else None

    def validate_teaching_assignment(self, value):
        if self.instance and value != self.instance.teaching_assignment:
            raise serializers.ValidationError("Asesmen tidak bisa dipindah ke kelas-mapel lain.")
        return value

    def validate_due_at(self, value):
        if self.instance is None and value <= timezone.now():
            raise serializers.ValidationError("Tenggat harus di masa yang akan datang.")
        return value

    def validate(self, attrs):
        if attrs.get("is_published"):
            if self.instance is None:
                raise serializers.ValidationError(
                    {"is_published": "Simpan dulu, tambahkan soal, lalu terbitkan."}
                )
            ensure_publishable(self.instance)
        return attrs


class SubmitAnswerSerializer(serializers.Serializer):
    question = serializers.IntegerField()
    choice = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    text = serializers.CharField(required=False, allow_blank=True, default="", max_length=10000)


class SubmitSerializer(serializers.Serializer):
    answers = SubmitAnswerSerializer(many=True)


class ViolationSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=ViolationKind.choices)


class GradeItemSerializer(serializers.Serializer):
    answer = serializers.IntegerField()
    points = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=0)
    feedback = serializers.CharField(required=False, allow_blank=True, default="")


class GradeSerializer(serializers.Serializer):
    grades = GradeItemSerializer(many=True)


def answer_sheet(attempt, reveal_answers, include_key=False):
    """Soal + jawaban siswa. Kunci jawaban hanya disertakan jika `include_key` (guru) atau `reveal_answers`."""
    answers = {a.question_id: a for a in attempt.answers.all()}
    sheet = []
    for question in attempt.assessment.questions.all():
        answer = answers.get(question.id)
        item = StudentQuestionSerializer(question).data
        item["answer"] = (
            {
                "id": answer.id,
                "choice": answer.choice,
                "text": answer.text,
                "points": float(answer.points) if answer.points is not None else None,
                "feedback": answer.feedback,
            }
            if answer
            else None
        )
        item["correct_choice"] = question.correct_choice if include_key or reveal_answers else None
        sheet.append(item)
    return sheet
