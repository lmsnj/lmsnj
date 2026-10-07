from django.db.models import Count
from rest_framework import viewsets

from apps.academics.selectors import teaching_assignments_for
from apps.accounts.permissions import ContentPermission
from apps.common.mixins import ProtectedDeleteMixin
from apps.schools.context import active_school

from .models import TeachingSession
from .serializers import TeachingSessionSerializer


class TeachingSessionViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    """Admin: semua sesi. Guru: sesi di kelas-mapel miliknya (bisa diubah). Siswa: sesi kelasnya."""

    protected_message = "Pertemuan ini sudah berisi presensi siswa sehingga tidak bisa dihapus."

    serializer_class = TeachingSessionSerializer
    permission_classes = [ContentPermission]
    filterset_fields = {"teaching_assignment": ["exact"], "starts_at": ["gte", "lte"]}
    ordering_fields = ["starts_at"]

    def get_queryset(self):
        return (
            TeachingSession.objects.filter(
                teaching_assignment__in=teaching_assignments_for(
                    self.request.user, active_school(self.request)
                )
            ).select_related(
                "teaching_assignment__subject",
                "teaching_assignment__classroom",
                "teaching_assignment__teacher",
            )
            # Jumlah catatan presensi: 0 = presensi pertemuan ini belum diisi.
            .annotate(attendance_count=Count("attendances"))
            # Meta.ordering tidak berlaku pada query dengan annotate(Count), jadi ditulis ulang.
            .order_by(*TeachingSession._meta.ordering)
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
