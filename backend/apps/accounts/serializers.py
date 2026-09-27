from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Role, User


class UserSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    classroom_name = serializers.CharField(source="classroom.name", read_only=True, default=None)

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

    def validate(self, attrs):
        # String kosong disimpan sebagai NULL agar tidak melanggar aturan unique.
        for field in ("nis", "nip"):
            if field in attrs and not attrs[field]:
                attrs[field] = None

        role = attrs.get("role", getattr(self.instance, "role", None))
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
    """Respons login berisi token sekaligus data user, agar frontend tidak perlu request tambahan."""

    def validate(self, attrs):
        data = super().validate(attrs)
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
    new_password = serializers.CharField(style={"input_type": "password"})

    def validate_new_password(self, value):
        validate_password(value, user=self.context.get("target_user"))
        return value
