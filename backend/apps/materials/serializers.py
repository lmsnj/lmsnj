from rest_framework import serializers

from apps.academics.models import TeachingAssignment
from apps.common.files import delete_file, validate_upload

from .models import Material, MaterialType

PDF_SIGNATURE = b"%PDF-"


class MaterialSerializer(serializers.ModelSerializer):
    # Guru hanya boleh memilih kelas-mapel yang ia ampu (diisi di __init__).
    teaching_assignment = serializers.PrimaryKeyRelatedField(queryset=TeachingAssignment.objects.none())
    file = serializers.FileField(write_only=True, required=False, allow_null=True)
    has_file = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source="teaching_assignment.subject.name", read_only=True)
    classroom_name = serializers.CharField(source="teaching_assignment.classroom.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)

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
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["original_filename"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            self.fields["teaching_assignment"].queryset = TeachingAssignment.objects.filter(
                teacher=request.user
            )

    def get_has_file(self, obj):
        return bool(obj.file)

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
