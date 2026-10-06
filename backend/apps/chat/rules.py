"""Siapa boleh mengobrol dengan siapa. Satu-satunya tempat aturan ini ditulis.

- Admin <-> siapa saja.
- Guru <-> guru.
- Guru <-> siswa: hanya jika guru mengajar di kelas siswa itu atau menjadi wali kelasnya.
- Siswa <-> siswa: tidak boleh (mencegah obrolan tanpa pengawasan di LMS sekolah).
- Semua aturan di atas hanya berlaku untuk orang yang terdaftar di sekolah (aktif) yang sama.
"""

from django.db.models import Q

from apps.accounts.models import Role, User
from apps.schools.models import School


def _teacher_student_linked(teacher, student):
    classroom_id = student.classroom_id
    if classroom_id is None:
        return False
    return (
        teacher.teaching_assignments.filter(classroom_id=classroom_id).exists()
        or teacher.homeroom_classes.filter(pk=classroom_id).exists()
    )


def _shared_school(user, other):
    # Dua filter() terpisah = dua join, jadi sekolahnya harus punya KEDUA anggota itu.
    return School.objects.filter(is_active=True, members=user).filter(members=other).exists()


def can_chat(user, other):
    if user.id == other.id or not (user.is_active and other.is_active):
        return False
    if not _shared_school(user, other):
        return False
    roles = {user.role, other.role}
    if Role.ADMIN in roles:
        return True
    if roles == {Role.TEACHER}:
        return True
    if roles == {Role.TEACHER, Role.STUDENT}:
        teacher, student = (user, other) if user.role == Role.TEACHER else (other, user)
        return _teacher_student_linked(teacher, student)
    return False  # siswa <-> siswa


def contacts_for(user):
    """Semua orang yang boleh diajak mengobrol oleh `user` (cerminan can_chat dalam bentuk query)."""
    school_ids = user.schools.filter(is_active=True).values("id")
    people = User.objects.filter(is_active=True, schools__in=school_ids).exclude(pk=user.pk).distinct()
    if user.role == Role.ADMIN:
        return people
    if user.role == Role.TEACHER:
        class_ids = set(user.teaching_assignments.values_list("classroom_id", flat=True))
        class_ids |= set(user.homeroom_classes.values_list("id", flat=True))
        return people.filter(
            Q(role__in=[Role.ADMIN, Role.TEACHER]) | Q(role=Role.STUDENT, classroom_id__in=class_ids)
        )
    # Siswa: admin, guru yang mengajar di kelasnya, dan wali kelasnya.
    if user.classroom_id is None:
        return people.filter(role=Role.ADMIN)
    return people.filter(
        Q(role=Role.ADMIN)
        | Q(role=Role.TEACHER, teaching_assignments__classroom_id=user.classroom_id)
        | Q(role=Role.TEACHER, homeroom_classes__id=user.classroom_id)
    ).distinct()
