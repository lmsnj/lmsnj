from rest_framework import serializers

from apps.accounts.models import Role, User
from apps.schools.context import SchoolOwnedSerializer, active_school

from .models import Classroom, Subject, TeachingAssignment


class UpperCaseCharField(serializers.CharField):
    """Diubah ke huruf besar sebelum validator (termasuk cek unique) dijalankan."""

    def to_internal_value(self, data):
        return super().to_internal_value(data).upper()


def ensure_member(user, school):
    """Guru/siswa dari sekolah lain tidak boleh dipakai di data sekolah ini."""
    if user is not None and not user.schools.filter(pk=school.pk).exists():
        raise serializers.ValidationError(f"{user.full_name} tidak terdaftar di sekolah ini.")
    return user


def ensure_teacher(user):
    if user is not None and user.role != Role.TEACHER:
        raise serializers.ValidationError(f"{user.full_name} bukan guru.")
    return user


class ClassroomSerializer(SchoolOwnedSerializer):
    homeroom_teacher_name = serializers.CharField(
        source="homeroom_teacher.full_name", read_only=True, default=None
    )
    major = UpperCaseCharField(max_length=50)
    student_count = serializers.SerializerMethodField()

    class Meta:
        model = Classroom
        fields = [
            "id",
            "school",
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

    def validate(self, attrs):
        # Tingkat harus sesuai jenjang sekolah: SD/MI I-VI, SMP/MTs VII-IX, SMA/MA/SMK X-XII.
        school = self.instance.school if self.instance else attrs["school"]
        grade = attrs.get("grade", getattr(self.instance, "grade", None))
        if grade not in school.grades:
            allowed = ", ".join(school.grades)
            raise serializers.ValidationError(
                {"grade": f"Tingkat untuk {school.get_level_display()} hanya: {allowed}."}
            )
        if attrs.get("homeroom_teacher"):
            try:
                ensure_member(attrs["homeroom_teacher"], school)
            except serializers.ValidationError as error:
                raise serializers.ValidationError({"homeroom_teacher": error.detail})
        return attrs


class SubjectSerializer(SchoolOwnedSerializer):
    # Kode disimpan huruf besar, jadi "pweb" dan "PWEB" dianggap sama (unik per sekolah).
    code = UpperCaseCharField(max_length=20)

    class Meta:
        model = Subject
        fields = ["id", "school", "code", "name"]
        # Cek kode unik ditulis sendiri di validate() agar pesannya menempel di field "code".
        validators = []

    def validate(self, attrs):
        school = self.instance.school if self.instance else attrs["school"]
        code = attrs.get("code")
        duplicates = school.subjects.filter(code=code)
        if self.instance:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if code and duplicates.exists():
            raise serializers.ValidationError({"code": "Kode mapel ini sudah dipakai."})
        return attrs


class TeachingAssignmentSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source="teacher.full_name", read_only=True)
    subject_code = serializers.CharField(source="subject.code", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    classroom_name = serializers.CharField(source="classroom.name", read_only=True)
    academic_year = serializers.CharField(source="classroom.academic_year", read_only=True)
    student_count = serializers.SerializerMethodField()
    # Nama semua guru tim kelas-mapel ini (termasuk guru pengampu ini sendiri), lihat TeachingAssignment.team.
    team_teachers = serializers.SerializerMethodField()

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
            "weekly_hours",
            "student_count",
            "team_teachers",
        ]

    def get_team_teachers(self, obj):
        # Dihitung sekali per request (satu query untuk seluruh sekolah), bukan satu query per baris.
        teams = self.context.get("_teams")
        if teams is None:
            teams = {}
            rows = (
                TeachingAssignment.objects.filter(classroom__school_id=obj.classroom.school_id)
                .order_by("id")
                .values_list("classroom_id", "subject_id", "teacher__full_name")
            )
            for classroom_id, subject_id, name in rows:
                teams.setdefault((classroom_id, subject_id), []).append(name)
            self.context["_teams"] = teams
        return teams.get(obj.class_subject, [])

    def get_student_count(self, obj):
        count = getattr(obj, "student_count", None)
        return obj.classroom.students.count() if count is None else count

    def validate_teacher(self, value):
        return ensure_teacher(value)

    def validate(self, attrs):
        # Guru, mapel, dan kelas harus dari sekolah yang sama dengan kelasnya.
        classroom = attrs.get("classroom", getattr(self.instance, "classroom", None))
        subject = attrs.get("subject", getattr(self.instance, "subject", None))
        teacher = attrs.get("teacher", getattr(self.instance, "teacher", None))
        school = self.context.get("school") or active_school(self.context["request"])
        if classroom.school_id != school.id:
            raise serializers.ValidationError(
                {"classroom": "Kelas ini bukan dari sekolah yang sedang dibuka."}
            )
        if subject.school_id != school.id:
            raise serializers.ValidationError({"subject": "Mapel ini bukan dari sekolah yang sedang dibuka."})
        try:
            ensure_member(teacher, school)
        except serializers.ValidationError as error:
            raise serializers.ValidationError({"teacher": error.detail})
        return attrs


class StudentBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "full_name", "nis", "is_active"]


class StudentIdsSerializer(serializers.Serializer):
    student_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)

    def validate_student_ids(self, value):
        ids = set(value)
        found = User.objects.filter(pk__in=ids, role=Role.STUDENT, schools=self.context["school"]).count()
        if found != len(ids):
            raise serializers.ValidationError("Sebagian ID tidak ditemukan atau bukan siswa sekolah ini.")
        return list(ids)
