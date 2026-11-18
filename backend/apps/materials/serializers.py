import json

from rest_framework import serializers
from rest_framework.fields import empty
from rest_framework.utils import html

from apps.academics.models import TeachingAssignment
from apps.academics.selectors import team_assignments_for_request
from apps.accounts.models import Role, User
from apps.assessments.models import Assessment
from apps.common.files import delete_file, validate_upload
from apps.tasks.models import Task

from .code_practice import MAX_CODE, MAX_EXERCISES, clean_checks, clean_flowchart
from .math_check import clean_math_items, clean_variables, questions_for
from .models import Chapter, CodeAttempt, CodeExercise, CodeLanguage, Material, MaterialItem, MaterialType
from .objective_quiz import practice_count, quiz_counts
from .progress import chapter_progress, progress_for_request

PDF_SIGNATURE = b"%PDF-"
MAX_OBJECTIVES = 10
MAX_CONCEPTS = 12
MIN_REFLECTION = 20
MAX_REFLECTION = 2000
MAX_ITEMS = 10


def validate_pdf(file):
    """Cek ekstensi, ukuran, dan isi file PDF (bukan hanya ekstensinya)."""
    if not file:
        return file
    validate_upload(file, {".pdf"})
    header = file.read(len(PDF_SIGNATURE))
    file.seek(0)
    if header != PDF_SIGNATURE:
        raise serializers.ValidationError("File bukan PDF yang valid.")
    return file


def same_class_subject(content, assignment):
    """Konten (tugas/asesmen/bab) boleh dipakai jika dari kelas-mapel yang sama, buatan guru tim mana pun."""
    return assignment is not None and content.teaching_assignment.class_subject == assignment.class_subject


def validate_content(attrs, instance):
    """Isi konten sesuai tipenya: PDF wajib file, video/link wajib URL. Dipakai materi & konten tambahan."""
    material_type = attrs.get("material_type", getattr(instance, "material_type", None))
    has_file = bool(attrs.get("file")) or bool(instance and instance.file and "file" not in attrs)
    url = attrs.get("url", getattr(instance, "url", ""))
    if material_type == MaterialType.PDF:
        if not has_file:
            raise serializers.ValidationError({"file": "File PDF wajib diunggah."})
        attrs["url"] = ""
    else:
        if not url:
            raise serializers.ValidationError({"url": "URL wajib diisi untuk materi video/link."})
        # Konten non-PDF tidak menyimpan file.
        attrs["file"] = None
    return attrs


class FileContentMixin:
    """Simpan file baru/kosongkan file beserta nama aslinya; file lama dihapus setelah data tersimpan."""

    def create(self, validated_data):
        file = validated_data.pop("file", None)
        instance = self.Meta.model(**validated_data)
        if file:
            instance.file = file
            instance.original_filename = file.name
        instance.save()
        return instance

    def update(self, instance, validated_data):
        old_file = None
        if "file" in validated_data:
            old_file = instance.file if instance.file else None
            new_file = validated_data.pop("file")
            instance.file = new_file
            instance.original_filename = new_file.name if new_file else ""
        instance = super().update(instance, validated_data)
        if old_file and old_file.name != instance.file.name:
            delete_file(old_file)
        return instance


class ObjectivesField(serializers.ListField):
    """Daftar capaian. Form multipart mengirimnya sebagai teks JSON, jadi keduanya diterima."""

    child = serializers.CharField(max_length=200, allow_blank=True)  # baris kosong dibuang di bawah

    def get_value(self, dictionary):
        # Multipart: ambil satu nilai teks JSON, bukan getlist() bawaan ListField.
        if html.is_html_input(dictionary):
            return dictionary.get(self.field_name, empty)
        return super().get_value(dictionary)

    def to_internal_value(self, data):
        if isinstance(data, str):
            try:
                data = json.loads(data or "[]")
            except ValueError:
                raise serializers.ValidationError("Format daftar capaian tidak valid.")
        values = [text.strip() for text in super().to_internal_value(data) if text.strip()]
        if len(values) > MAX_OBJECTIVES:
            raise serializers.ValidationError(f"Maksimal {MAX_OBJECTIVES} capaian per materi.")
        return values


class ConceptsField(ObjectivesField):
    """Konsep kunci, satu baris "istilah = penjelasan" (bahan asesmen otomatis)."""

    child = serializers.CharField(max_length=300, allow_blank=True)

    def to_internal_value(self, data):
        if isinstance(data, str):
            try:
                data = json.loads(data or "[]")
            except ValueError:
                raise serializers.ValidationError("Format daftar konsep tidak valid.")
        values = [
            text.strip() for text in serializers.ListField.to_internal_value(self, data) if text.strip()
        ]
        if len(values) > MAX_CONCEPTS:
            raise serializers.ValidationError(f"Maksimal {MAX_CONCEPTS} konsep per materi.")
        wrong = [text for text in values if len([part for part in text.split("=", 1) if part.strip()]) < 2]
        if wrong:
            raise serializers.ValidationError(f"Tulis dengan format “istilah = penjelasan”: {wrong[0]}")
        return values


class MaterialItemSerializer(FileContentMixin, serializers.ModelSerializer):
    # Guru hanya boleh menambah konten ke materi kelas-mapel timnya (diisi di __init__).
    material = serializers.PrimaryKeyRelatedField(queryset=Material.objects.none())
    file = serializers.FileField(write_only=True, required=False, allow_null=True)
    has_file = serializers.SerializerMethodField()

    class Meta:
        model = MaterialItem
        fields = [
            "id",
            "material",
            "title",
            "material_type",
            "file",
            "has_file",
            "original_filename",
            "url",
            "order",
        ]
        read_only_fields = ["original_filename", "order"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None and "material" in self.fields:
            self.fields["material"].queryset = Material.objects.filter(
                teaching_assignment__in=team_assignments_for_request(request)
            )

    def get_has_file(self, obj):
        return bool(obj.file)

    def validate_material(self, value):
        if self.instance and value != self.instance.material:
            raise serializers.ValidationError("Konten tidak bisa dipindah ke materi lain.")
        if not self.instance and value.items.count() >= MAX_ITEMS:
            raise serializers.ValidationError(f"Maksimal {MAX_ITEMS} konten tambahan per materi.")
        return value

    def validate_file(self, file):
        return validate_pdf(file)

    def validate(self, attrs):
        return validate_content(attrs, self.instance)


class ChapterSerializer(serializers.ModelSerializer):
    # Guru hanya boleh memilih kelas-mapel yang ia ampu (diisi di __init__).
    teaching_assignment = serializers.PrimaryKeyRelatedField(queryset=TeachingAssignment.objects.none())
    post_test = serializers.PrimaryKeyRelatedField(
        queryset=Assessment.objects.all(), required=False, allow_null=True
    )
    post_test_title = serializers.CharField(source="post_test.title", read_only=True, default=None)
    post_test_published = serializers.BooleanField(
        source="post_test.is_published", read_only=True, default=None
    )
    material_count = serializers.SerializerMethodField()
    # Khusus siswa: terkunci/tidak, jumlah materi tercapai, status Post Test (lihat progress.py).
    progress = serializers.SerializerMethodField()

    class Meta:
        model = Chapter
        fields = [
            "id",
            "teaching_assignment",
            "title",
            "description",
            "order",
            "post_test",
            "post_test_title",
            "post_test_published",
            "material_count",
            "progress",
        ]
        read_only_fields = ["order"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            self.fields["teaching_assignment"].queryset = team_assignments_for_request(request)

    def _visible_materials(self, obj):
        request = self.context.get("request")
        materials = list(obj.materials.all())
        if request is not None and request.user.role == Role.STUDENT:
            materials = [m for m in materials if m.is_published]
        return materials

    def get_material_count(self, obj):
        return len(self._visible_materials(obj))

    def get_progress(self, obj):
        request = self.context.get("request")
        if request is None or request.user.role != Role.STUDENT:
            return None
        return chapter_progress(request, obj, self._visible_materials(obj))

    def validate_teaching_assignment(self, value):
        if self.instance and value != self.instance.teaching_assignment:
            raise serializers.ValidationError("Bab tidak bisa dipindah ke kelas-mapel lain.")
        return value

    def validate(self, attrs):
        assignment = attrs.get("teaching_assignment", getattr(self.instance, "teaching_assignment", None))
        test = attrs.get("post_test")
        if test is not None and not same_class_subject(test, assignment):
            raise serializers.ValidationError(
                {"post_test": "Post Test harus asesmen dari kelas-mapel yang sama."}
            )
        return attrs


class MaterialSerializer(FileContentMixin, serializers.ModelSerializer):
    # Guru hanya boleh memilih kelas-mapel yang ia ampu (diisi di __init__).
    teaching_assignment = serializers.PrimaryKeyRelatedField(queryset=TeachingAssignment.objects.none())
    # Kosong = materi tanpa bab. Bab harus dari kelas-mapel yang sama (dicek di validate).
    chapter = serializers.PrimaryKeyRelatedField(
        queryset=Chapter.objects.none(), required=False, allow_null=True
    )
    chapter_title = serializers.CharField(source="chapter.title", read_only=True, default=None)
    file = serializers.FileField(write_only=True, required=False, allow_null=True)
    has_file = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source="teaching_assignment.subject.name", read_only=True)
    classroom_name = serializers.CharField(source="teaching_assignment.classroom.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)
    objectives = ObjectivesField(required=False)
    concepts = ConceptsField(required=False)
    # Jumlah soal kuis per capaian (urut capaian; 0 = dicentang sendiri oleh siswa).
    objective_quiz = serializers.SerializerMethodField()
    # Jumlah soal Latihan Pemahaman (0 = tanpa latihan).
    practice_count = serializers.SerializerMethodField()
    # Jumlah soal Praktik (menulis kode; 0 = tanpa praktik).
    code_exercise_count = serializers.SerializerMethodField()
    required_task = serializers.PrimaryKeyRelatedField(
        queryset=Task.objects.all(), required=False, allow_null=True
    )
    required_task_title = serializers.CharField(source="required_task.title", read_only=True, default=None)
    required_assessment = serializers.PrimaryKeyRelatedField(
        queryset=Assessment.objects.all(), required=False, allow_null=True
    )
    required_assessment_title = serializers.CharField(
        source="required_assessment.title", read_only=True, default=None
    )
    # Konten tambahan (urut). Siswa harus membuka semuanya; isinya disembunyikan jika materi terkunci.
    items = serializers.SerializerMethodField()
    # Khusus siswa: urutan, terkunci/tidak, dan syarat capaian (lihat progress.py).
    progress = serializers.SerializerMethodField()

    class Meta:
        model = Material
        fields = [
            "id",
            "teaching_assignment",
            "subject_name",
            "classroom_name",
            "chapter",
            "chapter_title",
            "title",
            "description",
            "material_type",
            "file",
            "has_file",
            "original_filename",
            "url",
            "items",
            "is_published",
            "order",
            "objectives",
            "concepts",
            "objective_quiz",
            "practice_count",
            "code_exercise_count",
            "required_task",
            "required_task_title",
            "min_task_score",
            "required_assessment",
            "required_assessment_title",
            "require_teacher_approval",
            "require_reflection",
            "progress",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["original_filename", "order"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            # Kelas-mapel tim guru ini: rekan setim boleh mengubah materi buatan rekannya.
            assignments = team_assignments_for_request(request)
            self.fields["teaching_assignment"].queryset = assignments
            self.fields["chapter"].queryset = Chapter.objects.filter(teaching_assignment__in=assignments)

    def get_has_file(self, obj):
        return bool(obj.file)

    def _student_progress(self, obj):
        request = self.context.get("request")
        if request is None or request.user.role != Role.STUDENT:
            return None
        return progress_for_request(request).get(obj.id)

    def get_progress(self, obj):
        return self._student_progress(obj)

    def get_items(self, obj):
        return [
            {
                "id": item.id,
                "title": item.title,
                "material_type": item.material_type,
                "has_file": bool(item.file),
                "original_filename": item.original_filename,
                "url": item.url,
                "order": item.order,
            }
            for item in obj.items.all()
        ]

    def get_practice_count(self, obj):
        return practice_count(obj)

    def get_code_exercise_count(self, obj):
        return len(obj.exercises.all())

    def get_objective_quiz(self, obj):
        return quiz_counts(obj)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if request is None or request.user.role == Role.STUDENT:
            # Konsep kunci = bahan soal cek pemahaman; jangan jadi contekan siswa.
            data.pop("concepts", None)
        progress = data.get("progress")
        if progress and progress["locked"]:
            # Materi terkunci: judul & capaian terlihat, isinya belum.
            data.update(url="", has_file=False, original_filename="")
            for item in data.get("items", []):
                item.update(url="", has_file=False, original_filename="")
        return data

    def validate_teaching_assignment(self, value):
        # Kelas-mapel materi tidak bisa dipindah setelah dibuat.
        if self.instance and value != self.instance.teaching_assignment:
            raise serializers.ValidationError("Materi tidak bisa dipindah ke kelas-mapel lain.")
        return value

    def validate_file(self, file):
        return validate_pdf(file)

    def validate(self, attrs):
        assignment = attrs.get("teaching_assignment", getattr(self.instance, "teaching_assignment", None))
        for field, label in (("required_task", "Tugas"), ("required_assessment", "Asesmen")):
            content = attrs.get(field)
            if content is not None and not same_class_subject(content, assignment):
                raise serializers.ValidationError(
                    {field: f"{label} syarat harus dari kelas-mapel yang sama."}
                )
        chapter = attrs.get("chapter")
        if chapter is not None and not same_class_subject(chapter, assignment):
            raise serializers.ValidationError({"chapter": "Bab harus dari kelas-mapel yang sama."})
        return validate_content(attrs, self.instance)


class ProgressRecordSerializer(serializers.Serializer):
    """Ubahan guru per siswa. Field yang tidak dikirim tidak diubah."""

    student = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(role=Role.STUDENT))
    teacher_approved = serializers.BooleanField(required=False)
    unlocked = serializers.BooleanField(required=False)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True)


class ProgressUpdateSerializer(serializers.Serializer):
    records = ProgressRecordSerializer(many=True, allow_empty=False)


class ReorderSerializer(serializers.Serializer):
    teaching_assignment = serializers.IntegerField()
    materials = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)


class CopyMaterialsSerializer(serializers.Serializer):
    teaching_assignment = serializers.IntegerField()
    materials = serializers.ListField(child=serializers.IntegerField(), allow_empty=False, max_length=100)
    target = serializers.IntegerField()


class MergeMaterialSerializer(serializers.Serializer):
    duplicate = serializers.IntegerField()


class ReorderChaptersSerializer(serializers.Serializer):
    teaching_assignment = serializers.IntegerField()
    chapters = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)


class ReorderItemsSerializer(serializers.Serializer):
    material = serializers.IntegerField()
    items = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)


class CheckObjectivesSerializer(serializers.Serializer):
    checked = serializers.ListField(child=serializers.IntegerField(min_value=0), max_length=MAX_OBJECTIVES)


class ReflectionSerializer(serializers.Serializer):
    # Batas minimal agar refleksi tidak sekadar "ok" atau "paham".
    reflection = serializers.CharField(
        max_length=MAX_REFLECTION,
        trim_whitespace=True,
        error_messages={"blank": "Cerita reflektif tidak boleh kosong."},
    )

    def validate_reflection(self, value):
        if len(value) < MIN_REFLECTION:
            raise serializers.ValidationError(
                f"Tulis minimal {MIN_REFLECTION} karakter: apa yang Anda pelajari dan apa yang masih sulit."
            )
        return value


class CodeAttemptSerializer(serializers.ModelSerializer):
    passed = serializers.SerializerMethodField()

    class Meta:
        model = CodeAttempt
        fields = ["code", "passed", "passed_at", "check_count", "updated_at"]

    def get_passed(self, obj):
        return obj.passed_at is not None


class CodeExerciseSerializer(serializers.ModelSerializer):
    # Guru hanya boleh menambah soal ke materi kelas-mapel timnya (diisi di __init__).
    material = serializers.PrimaryKeyRelatedField(queryset=Material.objects.none())
    checks = serializers.JSONField()
    variables = serializers.JSONField(required=False)
    # Khusus siswa: pekerjaannya sendiri (view menitipkan {id soal: CodeAttempt} di context).
    my_attempt = serializers.SerializerMethodField()
    # Matematika: teks soal dengan angka milik pengguna yang login (kunci jawaban tidak ikut).
    questions = serializers.SerializerMethodField()

    class Meta:
        model = CodeExercise
        fields = [
            "id",
            "material",
            "order",
            "title",
            "language",
            "instructions",
            "starter_code",
            "checks",
            "variables",
            "questions",
            "my_attempt",
        ]
        read_only_fields = ["order"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            self.fields["material"].queryset = Material.objects.filter(
                teaching_assignment__in=team_assignments_for_request(request)
            )

    def get_my_attempt(self, obj):
        attempts = self.context.get("my_attempts")
        if attempts is None:
            return None
        attempt = attempts.get(obj.id)
        return CodeAttemptSerializer(attempt).data if attempt else None

    def get_questions(self, obj):
        request = self.context.get("request")
        if obj.language != CodeLanguage.MATH or request is None:
            return None
        return questions_for(obj, request.user)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if instance.language == CodeLanguage.MATH and (request is None or request.user.role == Role.STUDENT):
            # Kunci jawaban & rentang angka matematika hanya untuk guru.
            data.pop("checks", None)
            data.pop("variables", None)
        return data

    def validate_material(self, value):
        if self.instance and value != self.instance.material:
            raise serializers.ValidationError("Soal praktik tidak bisa dipindah ke materi lain.")
        if not self.instance and value.exercises.count() >= MAX_EXERCISES:
            raise serializers.ValidationError(f"Maksimal {MAX_EXERCISES} soal praktik per materi.")
        return value

    def validate_starter_code(self, value):
        if len(value) > MAX_CODE:
            raise serializers.ValidationError("Kode awal terlalu panjang.")
        return value

    def validate(self, attrs):
        language = attrs.get("language", getattr(self.instance, "language", None))
        checks = attrs.get("checks", getattr(self.instance, "checks", None))
        if language == CodeLanguage.MATH:
            try:
                attrs["variables"] = clean_variables(
                    attrs.get("variables", getattr(self.instance, "variables", {}))
                )
            except serializers.ValidationError as error:
                raise serializers.ValidationError({"variables": error.detail})
            try:
                attrs["checks"] = clean_math_items(checks, attrs["variables"])
            except serializers.ValidationError as error:
                raise serializers.ValidationError({"checks": error.detail})
            attrs["starter_code"] = ""
            return attrs
        attrs["variables"] = {}
        if language == CodeLanguage.FLOWCHART and "starter_code" in attrs:
            try:
                attrs["starter_code"] = clean_flowchart(attrs["starter_code"])
            except serializers.ValidationError as error:
                raise serializers.ValidationError({"starter_code": error.detail})
        try:
            attrs["checks"] = clean_checks(language, checks)
        except serializers.ValidationError as error:
            raise serializers.ValidationError({"checks": error.detail})
        return attrs


class CodeAttemptInputSerializer(serializers.Serializer):
    """Kiriman siswa: kode, dan hasil pemeriksaan di browser (checked = tombol Periksa ditekan)."""

    code = serializers.CharField(max_length=MAX_CODE, allow_blank=True, trim_whitespace=False)
    checked = serializers.BooleanField(default=False)
    passed = serializers.BooleanField(default=False)


class MathAnswersSerializer(serializers.Serializer):
    """Jawaban Praktik Matematika: satu teks per soal (urut)."""

    answers = serializers.ListField(
        child=serializers.CharField(max_length=300, allow_blank=True), max_length=20, allow_empty=False
    )
