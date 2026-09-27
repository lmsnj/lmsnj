from apps.academics.selectors import teaching_assignments_for
from apps.accounts.models import Role

from .models import Material


def materials_for(user):
    """Admin: semua materi. Guru: materi di kelas-mapel yang ia ampu (termasuk draf).
    Siswa: hanya materi yang sudah terbit di kelasnya."""
    queryset = Material.objects.filter(teaching_assignment__in=teaching_assignments_for(user))
    if user.role == Role.STUDENT:
        queryset = queryset.filter(is_published=True)
    return queryset
