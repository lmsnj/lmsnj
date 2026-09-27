from apps.academics.selectors import teaching_assignments_for
from apps.accounts.models import Role

from .models import Submission, Task


def tasks_for(user):
    """Admin: semua tugas. Guru: tugas di kelas-mapel yang ia ampu (termasuk draf).
    Siswa: hanya tugas yang sudah terbit di kelasnya."""
    queryset = Task.objects.filter(teaching_assignment__in=teaching_assignments_for(user))
    if user.role == Role.STUDENT:
        queryset = queryset.filter(is_published=True)
    return queryset


def submissions_for(user):
    """Admin: semua. Guru: pengumpulan untuk tugas miliknya. Siswa: pengumpulan miliknya sendiri."""
    queryset = Submission.objects.all()
    if user.role == Role.ADMIN:
        return queryset
    if user.role == Role.TEACHER:
        return queryset.filter(task__teaching_assignment__teacher=user)
    return queryset.filter(student=user)
