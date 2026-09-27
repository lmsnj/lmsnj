import os

from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.common.files import file_response

from .models import SiteSettings
from .serializers import SiteSettingsSerializer


class SiteSettingsView(APIView):
    """GET: identitas sekolah (publik, dipakai juga di halaman login). PATCH: ubah (khusus admin)."""

    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_permissions(self):
        return [AllowAny()] if self.request.method == "GET" else [IsAdmin()]

    def get(self, request):
        return Response(SiteSettingsSerializer(SiteSettings.load()).data)

    def patch(self, request):
        serializer = SiteSettingsSerializer(SiteSettings.load(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class SiteLogoView(APIView):
    """File logo sekolah. Publik (logo tampil di halaman login), bukan data rahasia."""

    permission_classes = [AllowAny]

    def get(self, request):
        settings = SiteSettings.load()
        ext = os.path.splitext(settings.logo.name)[1] if settings.logo else ""
        response = file_response(settings.logo, f"logo{ext}")
        # Alamat logo selalu diberi ?v=<waktu diubah>, jadi aman disimpan lama di cache browser.
        response["Cache-Control"] = "public, max-age=31536000, immutable"
        response["X-Content-Type-Options"] = "nosniff"
        return response
