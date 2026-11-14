import os
from datetime import timedelta

from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.academics.models import TeachingAssignment
from apps.accounts.models import Role
from apps.accounts.permissions import IsAdmin, IsFoundation
from apps.assessments.models import Assessment
from apps.common.files import delete_file, file_response
from apps.common.mixins import ProtectedDeleteMixin
from apps.materials.models import Material
from apps.tasks.models import Submission, Task

from .context import school_from_code, schools_for
from .models import School
from .serializers import (
    NewSchoolSerializer,
    PublicSchoolSerializer,
    SchoolIdentitySerializer,
    SchoolSerializer,
)


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
        if self.action in ("logo", "public"):
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_queryset(self):
        # Dibuka lewat subdomain sekolah: hanya sekolah itu (tidak bisa pindah ke sekolah lain).
        by_code = school_from_code(self.request)
        if by_code is not None:
            return schools_for(self.request.user).filter(pk=by_code.pk)
        # Super Admin juga perlu melihat sekolah nonaktif untuk mengaktifkannya kembali.
        if self.request.user.is_authenticated and self.request.user.is_foundation:
            return School.objects.all()
        return schools_for(self.request.user)

    def get_serializer_class(self):
        if self.action == "create":
            return NewSchoolSerializer
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
    def public(self, request):
        """Identitas sekolah dari kode subdomain (`?code=smknj`) untuk halaman login sekolah.
        Publik; sekolah nonaktif tetap dikembalikan (is_active=false) agar halaman login bisa
        menampilkan pesan yang jelas."""
        code = request.query_params.get("code", "").strip().lower()
        school = School.objects.filter(code=code).first() if code else None
        if school is None:
            raise NotFound("Alamat sekolah tidak dikenal.")
        return Response(PublicSchoolSerializer(school).data)

    @action(detail=False)
    def summary(self, request):
        """Ringkasan semua sekolah untuk Beranda & Daftar Sekolah admin yayasan.
        Jumlah sekolah sedikit, jadi cukup dihitung per sekolah (beberapa query per sekolah)."""
        week_ago = timezone.now() - timedelta(days=7)
        rows = []
        for school in School.objects.all():
            year = (
                school.classrooms.order_by("-academic_year").values_list("academic_year", flat=True).first()
            )
            members = school.members.filter(is_active=True)
            students = members.filter(role=Role.STUDENT)
            classrooms = school.classrooms.filter(academic_year=year)
            in_school = {"teaching_assignment__classroom__school": school}
            rows.append(
                {
                    **SchoolSerializer(school, context={"request": request}).data,
                    "academic_year": year,
                    "students": students.count(),
                    "teachers": members.filter(role=Role.TEACHER).count(),
                    "admins": members.filter(role=Role.ADMIN).count(),
                    "classrooms": classrooms.count(),
                    "subjects": school.subjects.count(),
                    "teaching_assignments": TeachingAssignment.objects.filter(
                        classroom__in=classrooms
                    ).count(),
                    "materials": Material.objects.filter(**in_school).count(),
                    "tasks": Task.objects.filter(**in_school).count(),
                    "assessments": Assessment.objects.filter(**in_school).count(),
                    "submissions_this_week": Submission.objects.filter(
                        task__teaching_assignment__classroom__school=school, submitted_at__gte=week_ago
                    ).count(),
                    # Hal yang perlu ditindaklanjuti admin sekolah.
                    "students_without_classroom": students.filter(classroom__isnull=True).count(),
                    "classrooms_without_homeroom": classrooms.filter(homeroom_teacher__isnull=True).count(),
                }
            )
        return Response(rows)
