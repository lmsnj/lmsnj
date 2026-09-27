from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Role


class HasRole(BasePermission):
    """Dasar permission berbasis peran. Subclass cukup mengisi `allowed_roles`."""

    allowed_roles = ()
    message = "Anda tidak memiliki akses ke fitur ini."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in self.allowed_roles)


class IsAdmin(HasRole):
    allowed_roles = (Role.ADMIN,)


class IsTeacher(HasRole):
    allowed_roles = (Role.TEACHER,)


class IsStudent(HasRole):
    allowed_roles = (Role.STUDENT,)


class IsAdminOrTeacher(HasRole):
    allowed_roles = (Role.ADMIN, Role.TEACHER)


class IsAdminOrReadOnly(BasePermission):
    """Semua user login boleh membaca; hanya admin yang boleh mengubah.

    Data yang boleh dibaca tetap dibatasi lewat `get_queryset` di masing-masing view.
    """

    message = "Hanya admin yang dapat mengubah data ini."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return request.method in SAFE_METHODS or user.role == Role.ADMIN


class ContentPermission(BasePermission):
    """Untuk konten kelas (materi, tugas).

    Baca: semua user login (data dibatasi lewat get_queryset). Tambah/ubah: guru.
    Hapus: guru atau admin. Guru hanya bisa menyentuh konten di kelas-mapel miliknya
    karena queryset-nya sudah dibatasi.
    """

    message = "Anda tidak memiliki akses untuk mengubah data ini."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        if request.method == "DELETE":
            return user.role in (Role.TEACHER, Role.ADMIN)
        return user.role == Role.TEACHER
