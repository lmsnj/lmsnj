from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from apps.academics.models import TeachingAssignment
from apps.academics.selectors import team_assignments_for_request
from apps.exams.models import ExamEvent

from . import interactive
from .images import images_data
from .models import INTERACTIVE_KINDS, Assessment, ImageSlot, Question, QuestionKind, ViolationKind
from .results import final_result, max_score_of
from .services import ensure_editable, ensure_publishable

MAX_CHOICES = 6
DEFAULT_CATEGORY_LABELS = ["Benar", "Salah"]


def is_index_list(value):
    """Daftar bilangan bulat >= 0 (bool tidak dihitung sebagai angka)."""
    return isinstance(value, list) and all(
        isinstance(v, int) and not isinstance(v, bool) and v >= 0 for v in value
    )


def checked_choices(choices, with_image, kind):
    """Periksa daftar pilihan (atau pernyataan untuk soal kategori). Pilihan bergambar boleh tanpa teks."""
    if not isinstance(choices, list) or not all(isinstance(c, str) for c in choices):
        raise serializers.ValidationError({"choices": "Pilihan harus berupa daftar teks."})
    choices = [c.strip() for c in choices]
    empty = [i for i, c in enumerate(choices) if not c and i not in with_image]
    if kind == QuestionKind.CATEGORY:
        if not 1 <= len(choices) <= MAX_CHOICES or empty:
            raise serializers.ValidationError({"choices": f"Isi 1 sampai {MAX_CHOICES} pernyataan."})
    elif not 2 <= len(choices) <= MAX_CHOICES or empty:
        raise serializers.ValidationError(
            {"choices": f"Isi 2 sampai {MAX_CHOICES} pilihan. Pilihan tanpa teks harus diberi gambar."}
        )
    return choices


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
        "number": attempt.number,
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
    # Soal interaktif boleh tanpa pertanyaan (diisi petunjuk bawaan); soal lain wajib (dicek di validate).
    text = serializers.CharField(required=False, allow_blank=True)
    # Soal interaktif: rancangan guru (kalimat [[...]], pasangan, checkpoint). Dibaca lagi lewat
    # to_representation dari answer_key["spec"].
    spec = serializers.JSONField(required=False, write_only=True)
    content = serializers.SerializerMethodField()
    key = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = [
            "id",
            "assessment",
            "order",
            "kind",
            "group",
            "stimulus",
            "text",
            "text_direction",
            "points",
            "scoring_mode",
            "choices",
            "correct_choice",
            "correct_choices",
            "category_labels",
            "images",
            "image_choices",
            "spec",
            "content",
            "key",
        ]

    def get_images(self, obj):
        return images_data(obj)

    def get_content(self, obj):
        if obj.kind not in INTERACTIVE_KINDS:
            return None
        return interactive.teacher_content(obj, user=getattr(self.context.get("request"), "user", None))

    def get_key(self, obj):
        return interactive.key_display(obj) if obj.kind in INTERACTIVE_KINDS and obj.answer_key else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["spec"] = instance.answer_key.get("spec") if instance.kind in INTERACTIVE_KINDS else None
        return data

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            self.fields["assessment"].queryset = Assessment.objects.filter(
                teaching_assignment__in=team_assignments_for_request(request)
            )

    def validate_assessment(self, value):
        if self.instance and value != self.instance.assessment:
            raise serializers.ValidationError("Soal tidak bisa dipindah ke asesmen lain.")
        return value

    def validate_group(self, value):
        return value.strip()

    def validate(self, attrs):
        assessment = attrs.get("assessment") or self.instance.assessment
        ensure_editable(assessment)

        def current(field, default):
            return attrs.get(field, getattr(self.instance, field, default))

        kind = current("kind", QuestionKind.CHOICE)
        with_image = set(attrs.pop("image_choices", []) or [])
        if self.instance:
            with_image |= set(
                self.instance.images.filter(slot=ImageSlot.CHOICE).values_list("index", flat=True)
            )
        if kind in INTERACTIVE_KINDS:
            return self.validate_interactive(attrs, kind, with_image, current)
        attrs.pop("spec", None)
        if not str(current("text", "")).strip():
            raise serializers.ValidationError({"text": "Pertanyaan wajib diisi."})
        attrs.update(content={}, answer_key={})
        if kind == QuestionKind.ESSAY:
            attrs.update(choices=[], correct_choice=None, correct_choices=[], category_labels=[])
            return attrs

        choices = checked_choices(current("choices", []), with_image, kind)
        attrs["choices"] = choices
        if kind == QuestionKind.CHOICE:
            correct = current("correct_choice", None)
            if correct is None or correct >= len(choices):
                raise serializers.ValidationError(
                    {"correct_choice": "Tandai satu pilihan sebagai jawaban benar."}
                )
            attrs.update(correct_choices=[], category_labels=[])
        elif kind == QuestionKind.MULTIPLE:
            correct = current("correct_choices", [])
            if not is_index_list(correct) or len(set(correct)) < 2 or max(correct) >= len(choices):
                raise serializers.ValidationError(
                    {"correct_choices": "Tandai minimal dua pilihan sebagai jawaban benar."}
                )
            attrs.update(correct_choices=sorted(set(correct)), correct_choice=None, category_labels=[])
        else:
            labels = current("category_labels", []) or DEFAULT_CATEGORY_LABELS
            labels = [str(label).strip() for label in labels] if isinstance(labels, list) else []
            if len(labels) != 2 or not all(labels) or any(len(label) > 30 for label in labels):
                raise serializers.ValidationError(
                    {"category_labels": "Isi dua label jawaban, mis. Benar dan Salah (maks. 30 huruf)."}
                )
            correct = current("correct_choices", [])
            if not is_index_list(correct) or len(correct) != len(choices) or any(c > 1 for c in correct):
                raise serializers.ValidationError(
                    {"correct_choices": "Tentukan jawaban benar untuk setiap pernyataan."}
                )
            attrs.update(category_labels=labels, correct_choices=correct, correct_choice=None)
        return attrs

    def validate_interactive(self, attrs, kind, with_image, current):
        """Soal interaktif: bangun content + answer_key dari spec (lihat interactive.py)."""
        if not str(current("text", "")).strip():
            attrs["text"] = interactive.DEFAULT_TEXT[kind]
        attrs.update(choices=[], correct_choice=None, correct_choices=[], category_labels=[])
        spec = attrs.pop("spec", None)
        if spec is None:
            # Mis. hanya mengubah urutan soal: isi soal tidak dibangun ulang (id pilihan tetap).
            if self.instance and self.instance.kind == kind and self.instance.answer_key:
                return attrs
            raise serializers.ValidationError({"spec": "Lengkapi isi soal terlebih dahulu."})
        _, content, key, total = interactive.build(kind, spec, image_options=with_image)
        attrs.update(content=content, answer_key=key)
        if total is not None:
            # Video interaktif: poin soal = jumlah poin semua checkpoint.
            attrs["points"] = total
        return attrs

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        # Gambar milik pilihan yang sudah dihapus ikut dihapus (juga video jika tidak dipakai lagi).
        instance.images.filter(slot=ImageSlot.CHOICE, index__gte=interactive.choice_count(instance)).delete()
        if instance.kind != QuestionKind.INTERACTIVE_VIDEO or instance.content.get("source") != "file":
            instance.images.filter(slot=ImageSlot.VIDEO).delete()
        return instance


class StudentQuestionSerializer(serializers.ModelSerializer):
    """Soal versi SISWA: tanpa kunci jawaban (answer_key tidak pernah ikut).

    context: `seed` (id pengerjaan, untuk mengacak pilihan soal interaktif) dan `request`."""

    images = serializers.SerializerMethodField()
    content = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = [
            "id",
            "order",
            "kind",
            "group",
            "stimulus",
            "text",
            "text_direction",
            "points",
            "scoring_mode",
            "choices",
            "category_labels",
            "images",
            "content",
        ]

    def get_images(self, obj):
        data = images_data(obj)
        if obj.kind in INTERACTIVE_KINDS:
            # Gambar pilihan sudah ada di dalam content (urutan aslinya bisa membocorkan kunci).
            data["choices"] = []
            data.pop("video", None)
        return data

    def get_content(self, obj):
        if obj.kind not in INTERACTIVE_KINDS:
            return None
        return interactive.student_content(
            obj, self.context.get("seed", 0), user=getattr(self.context.get("request"), "user", None)
        )


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
    my_result = serializers.SerializerMethodField()
    locked_by_material = serializers.SerializerMethodField()
    exam_event = serializers.PrimaryKeyRelatedField(
        queryset=ExamEvent.objects.all(), allow_null=True, required=False
    )
    exam_event_name = serializers.CharField(source="exam_event.name", read_only=True, default=None)

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
            "passing_score",
            "remedial_attempts",
            "remedial_due_at",
            "exam_event",
            "exam_event_name",
            "is_published",
            "is_past_due",
            "question_count",
            "max_score",
            "submitted_count",
            "needs_grading_count",
            "student_count",
            "locked",
            "my_attempt",
            "my_result",
            "locked_by_material",
            "created_at",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            # Kelas-mapel tim guru ini (rekan setim boleh mengubah asesmen buatan rekannya).
            self.fields["teaching_assignment"].queryset = team_assignments_for_request(request)

    def get_locked(self, obj):
        # Hitungan dari annotate; untuk objek baru dibuat pasti belum ada pengerjaan.
        return bool(getattr(obj, "attempt_count", 0))

    def get_my_attempt(self, obj):
        # my_attempts diurutkan dari percobaan terbaru (lihat AssessmentViewSet.get_queryset).
        mine = getattr(obj, "my_attempts", None)
        return attempt_summary(mine[0]) if mine else None

    def get_locked_by_material(self, obj):
        from apps.materials.progress import locked_by_material

        return locked_by_material(self.context.get("request"), "assessments", obj.id)

    def get_my_result(self, obj):
        mine = getattr(obj, "my_attempts", None)
        return final_result(obj, mine, max_score_of(obj)) if mine is not None else None

    def check_exam_event(self, event, assignment):
        """Acara ujian harus milik sekolah, tahun ajaran, dan tingkat kelas asesmen ini."""
        if self.instance:
            assignment = self.instance.teaching_assignment
            if event != self.instance.exam_event and self.instance.attempts.exists():
                raise serializers.ValidationError(
                    {"exam_event": "Syarat kartu ujian tidak bisa diubah setelah ada siswa yang mengerjakan."}
                )
        if event is None or assignment is None:
            return
        classroom = assignment.classroom
        if (
            event.school_id != classroom.school_id
            or event.academic_year != classroom.academic_year
            or (event.grades and classroom.grade not in event.grades)
        ):
            raise serializers.ValidationError(
                {"exam_event": f"Kelas {classroom.name} tidak ikut acara ujian ini."}
            )

    def validate_teaching_assignment(self, value):
        if self.instance and value != self.instance.teaching_assignment:
            raise serializers.ValidationError("Asesmen tidak bisa dipindah ke kelas-mapel lain.")
        return value

    def validate_due_at(self, value):
        if self.instance is None and value <= timezone.now():
            raise serializers.ValidationError("Tenggat harus di masa yang akan datang.")
        return value

    def validate(self, attrs):
        def value(field):
            return attrs.get(field, getattr(self.instance, field, None))

        if value("remedial_attempts") and value("passing_score") is None:
            raise serializers.ValidationError({"passing_score": "Isi KKM agar remedial bisa dipakai."})
        if value("remedial_due_at") and value("due_at") and value("remedial_due_at") < value("due_at"):
            raise serializers.ValidationError(
                {"remedial_due_at": "Tenggat remedial harus setelah tenggat utama."}
            )
        if "exam_event" in attrs:
            self.check_exam_event(attrs["exam_event"], attrs.get("teaching_assignment"))
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
    # PG kompleks: pilihan yang dicentang. Kategori: indeks label per pernyataan (null = belum dijawab).
    choices = serializers.ListField(
        child=serializers.IntegerField(min_value=0, allow_null=True),
        required=False,
        default=list,
        max_length=MAX_CHOICES,
    )
    text = serializers.CharField(required=False, allow_blank=True, default="", max_length=10000)
    # Soal interaktif: jawaban per celah/pasangan/checkpoint (diperiksa di interactive.clean_response).
    response = serializers.JSONField(required=False, default=dict)
    # Tanda "ragu-ragu" dari siswa; hanya disimpan di jawaban sementara, tidak memengaruhi nilai.
    flagged = serializers.BooleanField(required=False, default=False)


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


def answer_sheet(attempt, reveal_answers, include_key=False, request=None):
    """Soal + jawaban siswa. Kunci jawaban hanya disertakan jika `include_key` (guru) atau `reveal_answers`.

    Soal interaktif: `answer.result` = benar/salah per celah/pasangan/checkpoint (terlihat setelah
    dikumpulkan, setara dengan poin yang sudah terlihat), `key` = kunci (hanya jika dibuka)."""
    answers = {a.question_id: a for a in attempt.answers.all()}
    context = {"seed": attempt.id, "request": request}
    show_key = include_key or reveal_answers
    sheet = []
    for question in attempt.assessment.questions.all():
        answer = answers.get(question.id)
        item = StudentQuestionSerializer(question, context=context).data
        is_interactive = question.kind in INTERACTIVE_KINDS
        item["answer"] = (
            {
                "id": answer.id,
                "choice": answer.choice,
                "choices": answer.choices,
                "text": answer.text,
                "response": answer.response,
                "result": interactive.grade(question, answer.response)[1] if is_interactive else None,
                "points": float(answer.points) if answer.points is not None else None,
                "feedback": answer.feedback,
            }
            if answer
            else None
        )
        item["key_revealed"] = show_key
        item["correct_choice"] = question.correct_choice if show_key else None
        item["correct_choices"] = question.correct_choices if show_key else None
        item["key"] = interactive.key_display(question) if show_key and is_interactive else None
        sheet.append(item)
    return sheet
