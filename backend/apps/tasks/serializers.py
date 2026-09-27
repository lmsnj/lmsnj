from django.utils import timezone
from rest_framework import serializers

from apps.academics.models import TeachingAssignment
from apps.common.files import delete_file, validate_upload

from .models import ALLOWED_TASK_EXTENSIONS, Submission, Task


class SubmissionSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_nis = serializers.CharField(source="student.nis", read_only=True, default=None)
    task_title = serializers.CharField(source="task.title", read_only=True)
    max_score = serializers.IntegerField(source="task.max_score", read_only=True)
    has_file = serializers.SerializerMethodField()
    graded_by_name = serializers.CharField(source="graded_by.full_name", read_only=True, default=None)

    class Meta:
        model = Submission
        fields = [
            "id",
            "task",
            "task_title",
            "student",
            "student_name",
            "student_nis",
            "text_answer",
            "has_file",
            "original_filename",
            "is_late",
            "submitted_at",
            "max_score",
            "score",
            "feedback",
            "graded_by_name",
            "graded_at",
        ]
        read_only_fields = fields

    def get_has_file(self, obj):
        return bool(obj.file)


class GradeSerializer(serializers.Serializer):
    """Input guru saat menilai. score=null menghapus nilai."""

    score = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=0, allow_null=True)
    feedback = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_score(self, value):
        max_score = self.context["submission"].task.max_score
        if value is not None and value > max_score:
            raise serializers.ValidationError(f"Nilai maksimal untuk tugas ini adalah {max_score}.")
        return value


class SubmitSerializer(serializers.Serializer):
    """Input dari siswa saat mengumpulkan tugas."""

    text_answer = serializers.CharField(required=False, allow_blank=True, default="")
    file = serializers.FileField(required=False, allow_null=True)

    def validate_file(self, file):
        return validate_upload(file, ALLOWED_TASK_EXTENSIONS) if file else None


class TaskSerializer(serializers.ModelSerializer):
    # Guru hanya boleh memilih kelas-mapel yang ia ampu (diisi di __init__).
    teaching_assignment = serializers.PrimaryKeyRelatedField(queryset=TeachingAssignment.objects.none())
    attachment = serializers.FileField(write_only=True, required=False, allow_null=True)
    remove_attachment = serializers.BooleanField(write_only=True, required=False, default=False)
    has_attachment = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source="teaching_assignment.subject.name", read_only=True)
    classroom_name = serializers.CharField(source="teaching_assignment.classroom.name", read_only=True)
    is_past_due = serializers.BooleanField(read_only=True)
    submission_count = serializers.SerializerMethodField()
    student_count = serializers.SerializerMethodField()
    my_submission = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            "id",
            "teaching_assignment",
            "subject_name",
            "classroom_name",
            "title",
            "instructions",
            "attachment",
            "remove_attachment",
            "has_attachment",
            "attachment_filename",
            "due_at",
            "max_score",
            "allow_late",
            "is_published",
            "is_past_due",
            "submission_count",
            "student_count",
            "my_submission",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["attachment_filename"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            self.fields["teaching_assignment"].queryset = TeachingAssignment.objects.filter(
                teacher=request.user
            )

    # Diisi lewat annotate di view; hitung manual jika objek baru dibuat/diubah.
    def get_submission_count(self, obj):
        count = getattr(obj, "submission_count", None)
        return obj.submissions.count() if count is None else count

    def get_student_count(self, obj):
        count = getattr(obj, "student_count", None)
        return obj.teaching_assignment.classroom.students.count() if count is None else count

    def get_has_attachment(self, obj):
        return bool(obj.attachment)

    def get_my_submission(self, obj):
        # Hanya terisi untuk siswa (view mem-prefetch pengumpulan miliknya ke `my_submissions`).
        mine = getattr(obj, "my_submissions", None)
        if mine is None:
            return None
        return SubmissionSerializer(mine[0]).data if mine else None

    def validate_teaching_assignment(self, value):
        if self.instance and value != self.instance.teaching_assignment:
            raise serializers.ValidationError("Tugas tidak bisa dipindah ke kelas-mapel lain.")
        return value

    def validate_due_at(self, value):
        if self.instance is None and value <= timezone.now():
            raise serializers.ValidationError("Tenggat harus di masa yang akan datang.")
        return value

    def validate_attachment(self, file):
        return validate_upload(file, ALLOWED_TASK_EXTENSIONS) if file else None

    def create(self, validated_data):
        validated_data.pop("remove_attachment", None)
        attachment = validated_data.pop("attachment", None)
        task = Task(**validated_data)
        if attachment:
            task.attachment = attachment
            task.attachment_filename = attachment.name
        task.save()
        return task

    def update(self, instance, validated_data):
        new_file = validated_data.pop("attachment", None)
        remove = validated_data.pop("remove_attachment", False)
        old_file = instance.attachment if instance.attachment else None
        if new_file:
            instance.attachment = new_file
            instance.attachment_filename = new_file.name
        elif remove:
            instance.attachment = None
            instance.attachment_filename = ""
        else:
            old_file = None  # lampiran tidak berubah
        instance = super().update(instance, validated_data)
        if old_file:
            delete_file(old_file)
        return instance
