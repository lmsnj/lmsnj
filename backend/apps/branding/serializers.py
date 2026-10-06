from django.urls import reverse
from rest_framework import serializers

from apps.common.images import LogoSerializerMixin

from .models import SiteSettings


class SiteSettingsSerializer(LogoSerializerMixin, serializers.ModelSerializer):
    # Alamat logo diberi versi (waktu diubah) agar browser langsung memuat logo baru.
    logo_url = serializers.SerializerMethodField()
    logo = serializers.FileField(write_only=True, required=False)
    remove_logo = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = SiteSettings
        fields = ["school_name", "slogan", "app_name", "logo", "logo_url", "remove_logo", "updated_at"]
        read_only_fields = ["updated_at"]

    def get_logo_url(self, obj):
        if not obj.logo:
            return None
        return f"{reverse('branding-logo')}?v={int(obj.updated_at.timestamp())}"

    def validate_school_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Nama sekolah wajib diisi.")
        return value.strip()

    def validate_app_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Nama aplikasi wajib diisi.")
        return value.strip()

    def validate_slogan(self, value):
        return value.strip()

    def update(self, instance, validated_data):
        return self.save_logo(instance, validated_data)
