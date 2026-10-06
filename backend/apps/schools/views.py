import os

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny

from apps.common.files import file_response

from .context import schools_for
from .models import School
from .serializers import SchoolSerializer


class SchoolViewSet(viewsets.ReadOnlyModelViewSet):
    """Sekolah tempat user terdaftar (dipakai frontend untuk pilihan sekolah aktif)."""

    serializer_class = SchoolSerializer
    pagination_class = None  # jumlah sekolah sedikit

    def get_queryset(self):
        return schools_for(self.request.user)

    @action(detail=True, permission_classes=[AllowAny])
    def logo(self, request, pk=None):
        """Logo sekolah. Publik seperti logo di halaman login, bukan data rahasia."""
        school = School.objects.filter(pk=pk, is_active=True).first() or School()
        ext = os.path.splitext(school.logo.name)[1] if school.logo else ""
        response = file_response(school.logo, f"logo{ext}")
        # Alamat logo selalu diberi ?v=<waktu diubah>, jadi aman disimpan lama di cache browser.
        response["Cache-Control"] = "public, max-age=31536000, immutable"
        response["X-Content-Type-Options"] = "nosniff"
        return response
