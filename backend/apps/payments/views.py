from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import validate_academic_year
from apps.accounts.models import Role, User
from apps.accounts.permissions import IsAdmin
from apps.common.excel import import_response, is_dry_run, template_response
from apps.schools.context import require_school

from . import services
from .models import QUARTERS, PaymentStatus


class PaymentRecordSerializer(serializers.Serializer):
    student = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(role=Role.STUDENT))
    paid_quarter = serializers.IntegerField(min_value=0, max_value=QUARTERS)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class PaymentUpdateSerializer(serializers.Serializer):
    academic_year = serializers.CharField(validators=[validate_academic_year])
    records = PaymentRecordSerializer(many=True, allow_empty=False)


class PaymentListView(APIView):
    """GET ?classroom=<id>: status pembayaran siswa kelas itu (tahun ajaran kelas).
    PUT {academic_year, records}: simpan banyak siswa sekaligus. Khusus admin."""

    permission_classes = [IsAdmin]

    def get(self, request):
        school = require_school(request)
        classroom_id = request.query_params.get("classroom", "")
        if not classroom_id.isdigit():
            raise ValidationError({"classroom": "Pilih kelas."})
        classroom = get_object_or_404(school.classrooms, pk=classroom_id)
        students = list(classroom.students.filter(is_active=True).order_by("full_name"))
        statuses = {
            p.student_id: p
            for p in PaymentStatus.objects.filter(student__in=students, academic_year=classroom.academic_year)
        }
        return Response(
            {
                "classroom": classroom.id,
                "classroom_name": classroom.name,
                "academic_year": classroom.academic_year,
                "rows": [
                    {
                        "student": s.id,
                        "student_name": s.full_name,
                        "nis": s.nis,
                        "paid_quarter": statuses[s.id].paid_quarter if s.id in statuses else 0,
                        "note": statuses[s.id].note if s.id in statuses else "",
                        "updated_at": statuses[s.id].updated_at if s.id in statuses else None,
                    }
                    for s in students
                ],
            }
        )

    def put(self, request):
        school = require_school(request)
        serializer = PaymentUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        services.validate_records(data["records"], school)
        saved = services.save_statuses(data["academic_year"], data["records"], request.user)
        return Response({"detail": f"Status pembayaran {saved} siswa disimpan.", "saved": saved})


class PaymentImportTemplateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return template_response(services.template(require_school(request)), "Template Impor Pembayaran.xlsx")


class PaymentImportView(APIView):
    """Impor status pembayaran dari Excel. dry_run=true (bawaan) hanya memeriksa."""

    permission_classes = [IsAdmin]

    def post(self, request):
        rows, save = services.check_import(request.FILES.get("file"), require_school(request))
        return import_response(rows, is_dry_run(request), lambda: save(request.user))
