from django.urls import reverse
from rest_framework import serializers

from .models import School


class SchoolSerializer(serializers.ModelSerializer):
    level_display = serializers.CharField(source="get_level_display", read_only=True)
    # Alamat logo diberi versi (waktu diubah) agar browser langsung memuat logo baru.
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = School
        fields = ["id", "code", "name", "level", "level_display", "slogan", "logo_url", "grades"]
        read_only_fields = fields

    def get_logo_url(self, obj):
        if not obj.logo:
            return None
        return f"{reverse('school-logo', args=[obj.pk])}?v={int(obj.updated_at.timestamp())}"
