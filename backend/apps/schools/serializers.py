from django.urls import reverse
from rest_framework import serializers

from apps.common.images import LogoSerializerMixin

from .models import LEVEL_GRADES, School


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
        if not obj.logo:
            return None
        return f"{reverse('school-logo', args=[obj.pk])}?v={int(obj.updated_at.timestamp())}"

    def validate_code(self, value):
        return value.lower()

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
