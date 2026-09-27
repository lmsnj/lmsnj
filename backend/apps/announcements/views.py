from django.db.models import Q
from rest_framework import viewsets
from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.academics.selectors import teaching_assignments_for
from apps.accounts.models import Role

from .models import Announcement
from .serializers import AnnouncementSerializer


def announcements_for(user):
    """Admin: semua. Guru & siswa: pengumuman sekolah + pengumuman kelas-mapel miliknya."""
    queryset = Announcement.objects.all()
    if user.role == Role.ADMIN:
        return queryset
    return queryset.filter(
        Q(teaching_assignment__isnull=True) | Q(teaching_assignment__in=teaching_assignments_for(user))
    )


class AnnouncementPermission(BasePermission):
    """Baca: semua user login. Buat: admin & guru. Ubah/hapus: penulisnya atau admin."""

    message = "Anda tidak memiliki akses untuk mengubah pengumuman ini."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return request.method in SAFE_METHODS or user.role in (Role.ADMIN, Role.TEACHER)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return request.user.role == Role.ADMIN or obj.author_id == request.user.id


class AnnouncementViewSet(viewsets.ModelViewSet):
    serializer_class = AnnouncementSerializer
    permission_classes = [AnnouncementPermission]
    search_fields = ["title", "body"]

    def get_queryset(self):
        queryset = announcements_for(self.request.user).select_related(
            "author", "teaching_assignment__subject", "teaching_assignment__classroom"
        )
        # ?teaching_assignment=<id> -> pengumuman kelas-mapel itu; ?teaching_assignment=school -> sekolah.
        target = self.request.query_params.get("teaching_assignment")
        if target == "school":
            queryset = queryset.filter(teaching_assignment__isnull=True)
        elif target:
            queryset = queryset.filter(teaching_assignment_id=target)
        return queryset

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)
