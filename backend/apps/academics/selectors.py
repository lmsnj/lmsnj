"""Query yang membatasi data akademik sesuai peran user DAN sekolah yang sedang dibuka.

Dipakai ulang oleh modul lain (materi, tugas) agar aturan akses cukup ditulis di satu tempat.
`school` = sekolah aktif (`apps.schools.context.active_school`); None = tidak ada data.
"""

from django.db.models import Exists, OuterRef, Q

from apps.accounts.models import Role
from apps.schools.context import active_school

from .models import Classroom, TeachingAssignment


def classrooms_for(user, school):
    queryset = Classroom.objects.filter(school=school) if school else Classroom.objects.none()
    if user.is_admin_role:
        return queryset
    if user.role == Role.TEACHER:
        # Kelas yang ia ajar atau yang ia walikan.
        return queryset.filter(Q(teaching_assignments__teacher=user) | Q(homeroom_teacher=user)).distinct()
    return queryset.filter(pk=user.classroom_id)


def teaching_assignments_for(user, school):
    queryset = (
        TeachingAssignment.objects.filter(classroom__school=school)
        if school
        else TeachingAssignment.objects.none()
    )
    if user.is_admin_role:
        return queryset
    if user.role == Role.TEACHER:
        return queryset.filter(teacher=user)
    return queryset.filter(classroom_id=user.classroom_id)


def team_assignments_for(user, school):
    """Seperti teaching_assignments_for, tetapi guru juga mendapat pengampu REKAN SETIMNYA (guru lain yang
    mengajar mapel yang sama di kelas yang sama). Dipakai konten kelas (materi, bab, tugas, asesmen) yang
    dikelola bersama oleh tim. Presensi, sesi, dan jadwal tetap memakai teaching_assignments_for."""
    if user.role != Role.TEACHER:
        return teaching_assignments_for(user, school)
    if not school:
        return TeachingAssignment.objects.none()
    mine = TeachingAssignment.objects.filter(
        teacher=user, classroom=OuterRef("classroom"), subject=OuterRef("subject")
    )
    return TeachingAssignment.objects.filter(classroom__school=school).filter(Exists(mine))


def team_assignments_for_request(request):
    """Pengampu yang boleh dipilih di form konten kelas: kelas-mapel tim guru yang login (sekolah aktif)."""
    return team_assignments_for(request.user, active_school(request))
