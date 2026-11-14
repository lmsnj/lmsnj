from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.urls import reverse
from rest_framework import serializers

from apps.common.images import LogoSerializerMixin

from .domains import validate_school_code
from .models import LEVEL_GRADES, School


def school_logo_url(school):
    """Alamat logo diberi versi (waktu diubah) agar browser langsung memuat logo baru."""
    if not school.logo:
        return None
    return f"{reverse('school-logo', args=[school.pk])}?v={int(school.updated_at.timestamp())}"


class SchoolSerializer(LogoSerializerMixin, serializers.ModelSerializer):
    """Data sekolah. Diubah penuh oleh admin yayasan."""

    level_display = serializers.CharField(source="get_level_display", read_only=True)
    # Alamat logo diberi versi (waktu diubah) agar browser langsung memuat logo baru.
    logo_url = serializers.SerializerMethodField()
    logo = serializers.FileField(write_only=True, required=False)
    remove_logo = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = School
        fields = [
            "id",
            "code",
            "name",
            "level",
            "level_display",
            "slogan",
            "logo",
            "logo_url",
            "remove_logo",
            "is_active",
            "grades",
        ]
        read_only_fields = ["grades"]

    def get_logo_url(self, obj):
        return school_logo_url(obj)

    def validate_code(self, value):
        # Kode = alamat subdomain sekolah (kode.domain), jadi harus sah sebagai nama DNS.
        return validate_school_code(value)

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Nama sekolah wajib diisi.")
        return value.strip()

    def validate_slogan(self, value):
        return value.strip()

    def validate_level(self, value):
        # Tingkat kelas yang sudah ada mengikuti jenjang lama, jadi setelah ada kelas jenjang hanya
        # boleh diganti ke jenjang dengan tingkat yang sama (mis. SD <-> MI).
        if (
            self.instance
            and LEVEL_GRADES[value] != self.instance.grades
            and self.instance.classrooms.exists()
        ):
            raise serializers.ValidationError(
                "Jenjang tidak bisa diubah karena sekolah ini sudah punya kelas."
            )
        return value

    def create(self, validated_data):
        return self.save_logo(School(), validated_data)

    def update(self, instance, validated_data):
        return self.save_logo(instance, validated_data)


class SchoolIdentitySerializer(SchoolSerializer):
    """Untuk admin sekolah: hanya nama, slogan, dan logo sekolahnya sendiri."""

    class Meta(SchoolSerializer.Meta):
        read_only_fields = ["code", "level", "is_active", "grades"]


class NewSchoolSerializer(SchoolSerializer):
    """Membuat sekolah baru (Super Admin), opsional sekaligus akun admin pertamanya agar sekolah
    pelanggan langsung bisa dipakai. Password admin boleh dikosongkan: dibuat otomatis dan
    dikembalikan SEKALI di respons (`admin.password`), seperti impor pengguna."""

    admin_username = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=150)
    admin_full_name = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=150)
    admin_password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, style={"input_type": "password"}
    )

    class Meta(SchoolSerializer.Meta):
        fields = [*SchoolSerializer.Meta.fields, "admin_username", "admin_full_name", "admin_password"]

    def validate_admin_username(self, value):
        from apps.accounts.models import User

        value = value.strip()
        if value and User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Username ini sudah dipakai. Pilih username lain.")
        return value

    def validate(self, attrs):
        from apps.accounts.models import User

        attrs["admin_full_name"] = attrs.get("admin_full_name", "").strip()
        password = attrs.get("admin_password")
        if not attrs.get("admin_username"):
            if attrs["admin_full_name"] or password:
                raise serializers.ValidationError({"admin_username": "Isi username admin sekolah."})
            return attrs  # sekolah dibuat tanpa admin; admin bisa ditambahkan nanti
        if not attrs["admin_full_name"]:
            raise serializers.ValidationError({"admin_full_name": "Nama admin wajib diisi."})
        if password:
            candidate = User(username=attrs["admin_username"], full_name=attrs["admin_full_name"])
            try:
                validate_password(password, user=candidate)
            except DjangoValidationError as error:
                raise serializers.ValidationError({"admin_password": list(error.messages)})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        # Impor di dalam fungsi: modul accounts mengimpor serializer sekolah (hindari impor melingkar).
        from apps.accounts.models import Role, User
        from apps.accounts.user_import import generate_password

        username = validated_data.pop("admin_username", "")
        full_name = validated_data.pop("admin_full_name", "")
        password = validated_data.pop("admin_password", "") or ""
        school = super().create(validated_data)
        if not username:
            return school

        generated = not password
        if generated:
            password = generate_password()
        admin = User.objects.create_user(
            username=username, password=password, full_name=full_name, role=Role.ADMIN
        )
        admin.schools.add(school)
        # Disimpan sementara untuk respons; tidak pernah disimpan dalam bentuk teks biasa.
        school.first_admin = {
            "id": admin.id,
            "username": admin.username,
            "full_name": admin.full_name,
            "password": password if generated else None,
        }
        return school

    def to_representation(self, instance):
        data = SchoolSerializer(instance, context=self.context).data
        if hasattr(instance, "first_admin"):
            data["admin"] = instance.first_admin
        return data


class PublicSchoolSerializer(serializers.ModelSerializer):
    """Identitas sekolah untuk halaman login di subdomain sekolah (publik, bukan data rahasia)."""

    level_display = serializers.CharField(source="get_level_display", read_only=True)
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = School
        fields = ["id", "code", "name", "level_display", "slogan", "logo_url", "is_active"]
        read_only_fields = fields

    def get_logo_url(self, obj):
        return school_logo_url(obj)
