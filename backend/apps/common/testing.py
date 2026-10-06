"""Alat bantu bersama untuk test."""

from apps.schools.models import Level, School


def default_school():
    """Sekolah tempat data test dibuat (dibuat sekali per test)."""
    school, _ = School.objects.get_or_create(
        code="smknj", defaults={"name": "SMKS Nurul Jadid", "level": Level.SMK}
    )
    return school
