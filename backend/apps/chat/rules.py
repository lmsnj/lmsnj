"""Siapa boleh mengobrol dengan siapa. Satu-satunya tempat aturan ini ditulis.

- Admin (sekolah & yayasan) <-> siapa saja.
- Guru <-> guru.
- Guru <-> siswa: hanya jika guru mengajar di kelas siswa itu atau menjadi wali kelasnya.
- Siswa <-> siswa: tidak boleh (mencegah obrolan tanpa pengawasan di LMS sekolah).
- Semua aturan di atas hanya berlaku untuk orang di sekolah (aktif) yang sama. Admin yayasan
  dianggap anggota semua sekolah.
"""

from django.db.models import Q

from apps.accounts.models import ADMIN_ROLES, Role, User
from apps.schools.context import schools_for


def _teacher_student_linked(teacher, student):
    classroom_id = student.classroom_id
    if classroom_id is None:
        return False
    return (
        teacher.teaching_assignments.filter(classroom_id=classroom_id).exists()
        or teacher.homeroom_classes.filter(pk=classroom_id).exists()
    )


def _school_ids(user):
    return set(schools_for(user).values_list("id", flat=True))


def _shared_school(user, other):
    return bool(_school_ids(user) & _school_ids(other))


def can_chat(user, other):
    if user.id == other.id or not (user.is_active and other.is_active):
        return False
    if not _shared_school(user, other):
        return False
    roles = {user.role, other.role}
    if roles & set(ADMIN_ROLES):
        return True
    if roles == {Role.TEACHER}:
        return True
    if roles == {Role.TEACHER, Role.STUDENT}:
        teacher, student = (user, other) if user.role == Role.TEACHER else (other, user)
        return _teacher_student_linked(teacher, student)
    return False  # siswa <-> siswa


def contacts_for(user):
    """Semua orang yang boleh diajak mengobrol oleh `user` (cerminan can_chat dalam bentuk query)."""
    school_ids = _school_ids(user)
    if not school_ids:
        return User.objects.none()
    people = (
        User.objects.filter(Q(schools__in=school_ids) | Q(role=Role.FOUNDATION), is_active=True)
        .exclude(pk=user.pk)
        .distinct()
    )
    if user.is_admin_role:
        return people
    if user.role == Role.TEACHER:
        class_ids = set(user.teaching_assignments.values_list("classroom_id", flat=True))
        class_ids |= set(user.homeroom_classes.values_list("id", flat=True))
        return people.filter(
            Q(role__in=[*ADMIN_ROLES, Role.TEACHER]) | Q(role=Role.STUDENT, classroom_id__in=class_ids)
        )
    # Siswa: admin, guru yang mengajar di kelasnya, dan wali kelasnya.
    if user.classroom_id is None:
        return people.filter(role__in=ADMIN_ROLES)
    return people.filter(
        Q(role__in=ADMIN_ROLES)
        | Q(role=Role.TEACHER, teaching_assignments__classroom_id=user.classroom_id)
        | Q(role=Role.TEACHER, homeroom_classes__id=user.classroom_id)
    ).distinct()
