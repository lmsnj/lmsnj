from django.urls import reverse
from rest_framework import serializers

from apps.common.images import image_error

from .models import SiteSettings


class SiteSettingsSerializer(serializers.ModelSerializer):
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

    def validate_logo(self, file):
        data = file.read()
        file.seek(0)
        error = image_error(file.name, data)
        if error:
            raise serializers.ValidationError(error)
        return file

    def update(self, instance, validated_data):
        remove = validated_data.pop("remove_logo", False)
        new_logo = validated_data.pop("logo", None)
        old_logo = instance.logo if (remove or new_logo) else None
        if new_logo:
            instance.logo = new_logo
        elif remove:
            instance.logo = ""
        instance = super().update(instance, validated_data)
        # File lama dihapus dari disk setelah data baru tersimpan.
        if old_logo and old_logo.name != instance.logo.name:
            old_logo.storage.delete(old_logo.name)
        return instance
