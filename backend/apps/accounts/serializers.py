from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.academics.models import Classroom
from apps.schools.context import active_school, school_from_code
from apps.schools.serializers import SchoolSerializer

from .models import Role, User


class UserSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    classroom_name = serializers.CharField(source="classroom.name", read_only=True, default=None)
    # Sekolah tempat user terdaftar; frontend memakai daftar ini untuk pilihan sekolah aktif.
    schools = SchoolSerializer(many=True, read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "full_name",
            "email",
            "role",
            "role_display",
            "nis",
            "nip",
            "classroom",
            "classroom_name",
            "schools",
            "is_active",
            "date_joined",
            "last_login",
        ]
        read_only_fields = fields


class UserWriteSerializer(serializers.ModelSerializer):
    """Dipakai admin untuk membuat dan mengubah data pengguna."""

    password = serializers.CharField(write_only=True, required=False, style={"input_type": "password"})

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "full_name",
            "email",
            "role",
            "nis",
            "nip",
            "classroom",
            "is_active",
            "password",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        self.school = active_school(request) if request else None
        # Kelas hanya boleh dipilih dari sekolah yang sedang dibuka.
        self.fields["classroom"].queryset = Classroom.objects.filter(school=self.school)

    def validate_nis(self, value):
        if value:
            taken = User.objects.filter(nis=value, schools=self.school)
            if self.instance:
                taken = taken.exclude(pk=self.instance.pk)
            if taken.exists():
                raise serializers.ValidationError("NIS ini sudah dipakai siswa lain di sekolah ini.")
        return value

    def validate(self, attrs):
        # String kosong disimpan sebagai NULL agar tidak melanggar aturan unique.
        for field in ("nis", "nip"):
            if field in attrs and not attrs[field]:
                attrs[field] = None

        role = attrs.get("role", getattr(self.instance, "role", None))
        request = self.context.get("request")
        if role == Role.FOUNDATION and not (request and request.user.is_foundation):
            raise serializers.ValidationError({"role": "Hanya Super Admin yang dapat memberi peran ini."})
        if role != Role.STUDENT:
            attrs["nis"] = None
            attrs["classroom"] = None
        if role != Role.TEACHER:
            attrs["nip"] = None

        password = attrs.get("password")
        if self.instance is None and not password:
            raise serializers.ValidationError({"password": "Password wajib diisi untuk pengguna baru."})
        if password:
            # Validasi memakai data calon user supaya aturan "mirip username" ikut dicek.
            candidate = User(**{k: v for k, v in attrs.items() if k != "password"})
            try:
                validate_password(password, user=candidate)
            except DjangoValidationError as error:
                # Tempelkan error ke field password agar tampil di bawah input yang tepat.
                raise serializers.ValidationError({"password": list(error.messages)})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        # Ganti password lewat endpoint reset-password, bukan lewat update biasa.
        validated_data.pop("password", None)
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        return UserSerializer(instance, context=self.context).data


class LoginSerializer(TokenObtainPairSerializer):
    """Respons login berisi token sekaligus data user, agar frontend tidak perlu request tambahan.

    Di subdomain sekolah (header X-School-Code) hanya anggota sekolah itu (dan Super Admin) yang
    boleh masuk, agar akun sekolah lain tidak tersesat ke alamat yang salah."""

    def validate(self, attrs):
        school = school_from_code(self.context["request"])  # alamat tidak dikenal/nonaktif ditolak
        data = super().validate(attrs)
        if school and not (self.user.is_foundation or self.user.schools.filter(pk=school.pk).exists()):
            raise serializers.ValidationError(
                {"detail": f"Akun ini tidak terdaftar di {school.name}. Masuk lewat alamat sekolah Anda."}
            )
        data["user"] = UserSerializer(self.user).data
        return data


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(style={"input_type": "password"})
    new_password = serializers.CharField(style={"input_type": "password"})

    def validate_old_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Password lama salah.")
        return value

    def validate_new_password(self, value):
        validate_password(value, user=self.context["request"].user)
        return value


class ResetPasswordSerializer(serializers.Serializer):
    # Kosong = password dibuat otomatis lalu dikembalikan sekali (untuk kartu akun / WhatsApp).
    new_password = serializers.CharField(required=False, allow_blank=True, style={"input_type": "password"})

    def validate_new_password(self, value):
        if value:
            validate_password(value, user=self.context.get("target_user"))
        return value


class AccountCardsSerializer(serializers.Serializer):
    """Pilihan akun untuk kartu: id tertentu, siswa satu kelas, atau semua akun satu peran."""

    user_ids = serializers.ListField(child=serializers.IntegerField(), required=False, allow_empty=False)
    classroom = serializers.IntegerField(required=False)
    role = serializers.ChoiceField(choices=[Role.ADMIN, Role.TEACHER, Role.STUDENT], required=False)
    reset_password = serializers.BooleanField(default=False)

    def validate(self, attrs):
        if not any(key in attrs for key in ("user_ids", "classroom", "role")):
            raise serializers.ValidationError("Pilih akun, kelas, atau peran yang akan dibuatkan kartu.")
        return attrs
