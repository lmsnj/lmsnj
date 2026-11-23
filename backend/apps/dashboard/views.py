from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.schools.context import active_school

from .services import DASHBOARDS
from .statistics import school_statistics


class DashboardView(APIView):
    """Satu endpoint untuk semua peran; isinya menyesuaikan peran user yang login."""

    def get(self, request):
        return Response(DASHBOARDS[request.user.role](request.user, active_school(request)))


class StatisticsView(APIView):
    """Data grafik Statistik Sekolah untuk admin sekolah yang sedang dibuka."""

    permission_classes = [IsAdmin]

    def get(self, request):
        school = active_school(request)
        if school is None:
            raise ValidationError({"detail": "Pilih sekolah terlebih dahulu."})
        return Response(school_statistics(school))
