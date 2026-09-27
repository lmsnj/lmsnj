"""Query yang membatasi data akademik sesuai peran user.

Dipakai ulang oleh modul lain (materi, tugas) agar aturan akses cukup ditulis di satu tempat.
"""

from django.db.models import Q

from apps.accounts.models import Role

from .models import Classroom, TeachingAssignment


def classrooms_for(user):
    queryset = Classroom.objects.all()
    if user.role == Role.ADMIN:
        return queryset
    if user.role == Role.TEACHER:
        # Kelas yang ia ajar atau yang ia walikan.
        return queryset.filter(Q(teaching_assignments__teacher=user) | Q(homeroom_teacher=user)).distinct()
    return queryset.filter(pk=user.classroom_id)


def teaching_assignments_for(user):
    queryset = TeachingAssignment.objects.all()
    if user.role == Role.ADMIN:
        return queryset
    if user.role == Role.TEACHER:
        return queryset.filter(teacher=user)
    return queryset.filter(classroom_id=user.classroom_id)
