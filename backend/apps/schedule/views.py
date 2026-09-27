from rest_framework import viewsets

from apps.academics.selectors import teaching_assignments_for
from apps.accounts.permissions import ContentPermission

from .models import TeachingSession
from .serializers import TeachingSessionSerializer


class TeachingSessionViewSet(viewsets.ModelViewSet):
    """Admin: semua sesi. Guru: sesi di kelas-mapel miliknya (bisa diubah). Siswa: sesi kelasnya."""

    serializer_class = TeachingSessionSerializer
    permission_classes = [ContentPermission]
    filterset_fields = {"teaching_assignment": ["exact"], "starts_at": ["gte", "lte"]}
    ordering_fields = ["starts_at"]

    def get_queryset(self):
        return TeachingSession.objects.filter(
            teaching_assignment__in=teaching_assignments_for(self.request.user)
        ).select_related(
            "teaching_assignment__subject", "teaching_assignment__classroom", "teaching_assignment__teacher"
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
