from apps.academics.selectors import team_assignments_for
from apps.accounts.models import Role

from .models import Chapter, Material


def materials_for(user, school):
    """Admin: semua materi. Guru: materi di kelas-mapel yang ia ampu, termasuk buatan rekan setimnya
    (termasuk draf). Siswa: hanya materi yang sudah terbit di kelasnya."""
    queryset = Material.objects.filter(teaching_assignment__in=team_assignments_for(user, school))
    if user.role == Role.STUDENT:
        queryset = queryset.filter(is_published=True)
    return queryset


def chapters_for(user, school):
    """Bab di kelas-mapel yang boleh dilihat. Siswa: hanya bab yang berisi materi terbit."""
    queryset = Chapter.objects.filter(teaching_assignment__in=team_assignments_for(user, school))
    if user.role == Role.STUDENT:
        queryset = queryset.filter(materials__is_published=True).distinct()
    return queryset
