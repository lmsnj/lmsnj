import json

from rest_framework import serializers
from rest_framework.fields import empty
from rest_framework.utils import html

from apps.academics.models import TeachingAssignment
from apps.accounts.models import Role, User
from apps.assessments.models import Assessment
from apps.common.files import delete_file, validate_upload
from apps.tasks.models import Task

from .models import Material, MaterialType
from .progress import progress_for_request

PDF_SIGNATURE = b"%PDF-"
MAX_OBJECTIVES = 10
MAX_CONCEPTS = 12


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


class MaterialSerializer(serializers.ModelSerializer):
    # Guru hanya boleh memilih kelas-mapel yang ia ampu (diisi di __init__).
    teaching_assignment = serializers.PrimaryKeyRelatedField(queryset=TeachingAssignment.objects.none())
    file = serializers.FileField(write_only=True, required=False, allow_null=True)
    has_file = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source="teaching_assignment.subject.name", read_only=True)
    classroom_name = serializers.CharField(source="teaching_assignment.classroom.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)
    objectives = ObjectivesField(required=False)
    concepts = ConceptsField(required=False)
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
    # Khusus siswa: urutan, terkunci/tidak, dan syarat capaian (lihat progress.py).
    progress = serializers.SerializerMethodField()

    class Meta:
        model = Material
        fields = [
            "id",
            "teaching_assignment",
            "subject_name",
            "classroom_name",
            "title",
            "description",
            "material_type",
            "file",
            "has_file",
            "original_filename",
            "url",
            "is_published",
            "order",
            "objectives",
            "concepts",
            "required_task",
            "required_task_title",
            "min_task_score",
            "required_assessment",
            "required_assessment_title",
            "require_teacher_approval",
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
            self.fields["teaching_assignment"].queryset = TeachingAssignment.objects.filter(
                teacher=request.user
            )

    def get_has_file(self, obj):
        return bool(obj.file)

    def _student_progress(self, obj):
        request = self.context.get("request")
        if request is None or request.user.role != Role.STUDENT:
            return None
        return progress_for_request(request).get(obj.id)

    def get_progress(self, obj):
        return self._student_progress(obj)

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
        return data

    def validate_teaching_assignment(self, value):
        # Kelas-mapel materi tidak bisa dipindah setelah dibuat.
        if self.instance and value != self.instance.teaching_assignment:
            raise serializers.ValidationError("Materi tidak bisa dipindah ke kelas-mapel lain.")
        return value

    def validate_file(self, file):
        if not file:
            return file
        validate_upload(file, {".pdf"})
        # Cek isi file, bukan hanya ekstensinya.
        header = file.read(len(PDF_SIGNATURE))
        file.seek(0)
        if header != PDF_SIGNATURE:
            raise serializers.ValidationError("File bukan PDF yang valid.")
        return file

    def validate(self, attrs):
        assignment = attrs.get("teaching_assignment", getattr(self.instance, "teaching_assignment", None))
        for field, label in (("required_task", "Tugas"), ("required_assessment", "Asesmen")):
            content = attrs.get(field)
            if content is not None and content.teaching_assignment_id != getattr(assignment, "id", None):
                raise serializers.ValidationError(
                    {field: f"{label} syarat harus dari kelas-mapel yang sama."}
                )
        material_type = attrs.get("material_type", getattr(self.instance, "material_type", None))
        new_file = attrs.get("file")
        has_file = bool(new_file) or bool(self.instance and self.instance.file and "file" not in attrs)
        url = attrs.get("url", getattr(self.instance, "url", ""))

        if material_type == MaterialType.PDF:
            if not has_file:
                raise serializers.ValidationError({"file": "File PDF wajib diunggah."})
            attrs["url"] = ""
        else:
            if not url:
                raise serializers.ValidationError({"url": "URL wajib diisi untuk materi video/link."})
            # Materi non-PDF tidak menyimpan file.
            attrs["file"] = None
        return attrs

    def _apply_file(self, instance, attrs):
        """Set file baru (atau kosongkan) dan catat nama aslinya. Mengembalikan file lama."""
        if "file" not in attrs:
            return None
        old_file = instance.file if instance.file else None
        new_file = attrs.pop("file")
        instance.file = new_file
        instance.original_filename = new_file.name if new_file else ""
        return old_file

    def create(self, validated_data):
        file = validated_data.pop("file", None)
        material = Material(**validated_data)
        if file:
            material.file = file
            material.original_filename = file.name
        material.save()
        return material

    def update(self, instance, validated_data):
        old_file = self._apply_file(instance, validated_data)
        instance = super().update(instance, validated_data)
        # Hapus file lama dari disk hanya setelah data baru tersimpan.
        if old_file and old_file.name != instance.file.name:
            delete_file(old_file)
        return instance


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


class CheckObjectivesSerializer(serializers.Serializer):
    checked = serializers.ListField(child=serializers.IntegerField(min_value=0), max_length=MAX_OBJECTIVES)
