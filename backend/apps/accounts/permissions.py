from rest_framework.permissions import BasePermission

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
