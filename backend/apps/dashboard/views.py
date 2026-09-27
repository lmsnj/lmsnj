from rest_framework.response import Response
from rest_framework.views import APIView

from .services import DASHBOARDS


class DashboardView(APIView):
    """Satu endpoint untuk semua peran; isinya menyesuaikan peran user yang login."""

    def get(self, request):
        return Response(DASHBOARDS[request.user.role](request.user))
