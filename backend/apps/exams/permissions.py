from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import Role


class ExamEventPermission(BasePermission):
    """Baca: admin & guru (wali kelas butuh daftar acara). Tambah/ubah/hapus acara: admin.
    Action khusus (persetujuan wali kelas) mengatur aksesnya sendiri di view."""

    message = "Hanya admin yang dapat mengatur acara ujian."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated) or user.role == Role.STUDENT:
            return False
        return request.method in SAFE_METHODS or user.is_admin_role
