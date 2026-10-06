import os

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Role
from apps.accounts.permissions import IsAdmin, IsFoundation
from apps.common.files import delete_file, file_response
from apps.common.mixins import ProtectedDeleteMixin
from apps.materials.models import Material
from apps.tasks.models import Task

from .context import schools_for
from .models import School
from .serializers import SchoolIdentitySerializer, SchoolSerializer


class SchoolViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    """Baca: sekolah yang boleh dibuka user (untuk pilihan sekolah aktif).
    Tambah/hapus: admin yayasan. Ubah: admin yayasan (semua isian) atau admin sekolah (identitas
    sekolahnya sendiri: nama, slogan, logo)."""

    parser_classes = [JSONParser, MultiPartParser, FormParser]
    pagination_class = None  # jumlah sekolah sedikit
    protected_message = (
        "Sekolah ini sudah punya kelas atau mapel. Nonaktifkan saja agar datanya tetap tersimpan."
    )

    def get_permissions(self):
        if self.action in ("create", "destroy", "summary"):
            return [IsFoundation()]
        if self.action in ("update", "partial_update"):
            return [IsAdmin()]
        if self.action == "logo":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_queryset(self):
        # Admin yayasan juga perlu melihat sekolah nonaktif untuk mengaktifkannya kembali.
        if self.request.user.is_authenticated and self.request.user.is_foundation:
            return School.objects.all()
        return schools_for(self.request.user)

    def get_serializer_class(self):
        if self.request.user.is_authenticated and self.request.user.is_foundation:
            return SchoolSerializer
        return SchoolIdentitySerializer

    def perform_destroy(self, instance):
        logo = instance.logo
        super().perform_destroy(instance)  # gagal (400) jika sekolah masih punya kelas/mapel
        delete_file(logo)

    @action(detail=True)
    def logo(self, request, pk=None):
        """Logo sekolah. Publik seperti logo di halaman login, bukan data rahasia."""
        school = School.objects.filter(pk=pk, is_active=True).first() or School()
        ext = os.path.splitext(school.logo.name)[1] if school.logo else ""
        response = file_response(school.logo, f"logo{ext}")
        # Alamat logo selalu diberi ?v=<waktu diubah>, jadi aman disimpan lama di cache browser.
        response["Cache-Control"] = "public, max-age=31536000, immutable"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    @action(detail=False)
    def summary(self, request):
        """Ringkasan semua sekolah untuk admin yayasan (jumlah sekolah sedikit, jadi dihitung per sekolah)."""
        rows = []
        for school in School.objects.all():
            year = (
                school.classrooms.order_by("-academic_year").values_list("academic_year", flat=True).first()
            )
            members = school.members.filter(is_active=True)
            in_school = {"teaching_assignment__classroom__school": school}
            rows.append(
                {
                    **SchoolSerializer(school, context={"request": request}).data,
                    "academic_year": year,
                    "students": members.filter(role=Role.STUDENT).count(),
                    "teachers": members.filter(role=Role.TEACHER).count(),
                    "admins": members.filter(role=Role.ADMIN).count(),
                    "classrooms": school.classrooms.filter(academic_year=year).count(),
                    "subjects": school.subjects.count(),
                    "materials": Material.objects.filter(**in_school).count(),
                    "tasks": Task.objects.filter(**in_school).count(),
                }
            )
        return Response(rows)
