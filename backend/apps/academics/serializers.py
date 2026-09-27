from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from apps.accounts.models import Role, User

from .models import Classroom, Subject, TeachingAssignment


class UpperCaseCharField(serializers.CharField):
    """Diubah ke huruf besar sebelum validator (termasuk cek unique) dijalankan."""

    def to_internal_value(self, data):
        return super().to_internal_value(data).upper()


def ensure_teacher(user):
    if user is not None and user.role != Role.TEACHER:
        raise serializers.ValidationError(f"{user.full_name} bukan guru.")
    return user


class ClassroomSerializer(serializers.ModelSerializer):
    homeroom_teacher_name = serializers.CharField(
        source="homeroom_teacher.full_name", read_only=True, default=None
    )
    major = UpperCaseCharField(max_length=50)
    student_count = serializers.SerializerMethodField()

    class Meta:
        model = Classroom
        fields = [
            "id",
            "name",
            "grade",
            "major",
            "academic_year",
            "homeroom_teacher",
            "homeroom_teacher_name",
            "student_count",
        ]

    def get_student_count(self, obj):
        # Diisi lewat annotate di view; hitung manual jika objek baru dibuat.
        count = getattr(obj, "student_count", None)
        return obj.students.count() if count is None else count

    def validate_name(self, value):
        return " ".join(value.split())

    def validate_homeroom_teacher(self, value):
        return ensure_teacher(value)


class SubjectSerializer(serializers.ModelSerializer):
    # Kode disimpan huruf besar, jadi "pweb" dan "PWEB" dianggap sama.
    code = UpperCaseCharField(
        max_length=20,
        validators=[UniqueValidator(Subject.objects.all(), message="Kode mapel ini sudah dipakai.")],
    )

    class Meta:
        model = Subject
        fields = ["id", "code", "name"]


class TeachingAssignmentSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source="teacher.full_name", read_only=True)
    subject_code = serializers.CharField(source="subject.code", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    classroom_name = serializers.CharField(source="classroom.name", read_only=True)
    academic_year = serializers.CharField(source="classroom.academic_year", read_only=True)
    student_count = serializers.SerializerMethodField()

    class Meta:
        model = TeachingAssignment
        fields = [
            "id",
            "teacher",
            "teacher_name",
            "subject",
            "subject_code",
            "subject_name",
            "classroom",
            "classroom_name",
            "academic_year",
            "student_count",
        ]

    def get_student_count(self, obj):
        count = getattr(obj, "student_count", None)
        return obj.classroom.students.count() if count is None else count

    def validate_teacher(self, value):
        return ensure_teacher(value)


class StudentBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "full_name", "nis", "is_active"]


class StudentIdsSerializer(serializers.Serializer):
    student_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)

    def validate_student_ids(self, value):
        ids = set(value)
        found = User.objects.filter(pk__in=ids, role=Role.STUDENT).count()
        if found != len(ids):
            raise serializers.ValidationError("Sebagian ID tidak ditemukan atau bukan siswa.")
        return list(ids)
