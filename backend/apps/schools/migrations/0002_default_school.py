"""Data lama (sebelum aplikasi mendukung banyak sekolah) dipindahkan ke satu sekolah awal.

Nama, slogan, dan logo diambil dari Identitas Sekolah yang sudah diatur admin. Database baru yang
masih kosong (termasuk database test) tidak dibuatkan sekolah apa pun.
"""

import os

from django.core.files.base import ContentFile
from django.db import migrations


def create_default_school(apps, schema_editor):
    School = apps.get_model("schools", "School")
    Classroom = apps.get_model("academics", "Classroom")
    Subject = apps.get_model("academics", "Subject")
    User = apps.get_model("accounts", "User")
    SiteSettings = apps.get_model("branding", "SiteSettings")

    if not (User.objects.exists() or Classroom.objects.exists() or Subject.objects.exists()):
        return

    settings = SiteSettings.objects.filter(pk=1).first()
    school = School.objects.create(
        code="smknj",
        name=settings.school_name if settings else "SMKS Nurul Jadid",
        slogan=settings.slogan if settings else "",
        level="smk",
    )
    # Logo disalin (bukan dipakai bersama) agar menghapus salah satunya tidak ikut menghapus yang lain.
    if settings and settings.logo:
        try:
            with settings.logo.open("rb") as source:
                ext = os.path.splitext(settings.logo.name)[1]
                school.logo.save(f"logo{ext}", ContentFile(source.read()), save=True)
        except FileNotFoundError:
            pass

    Classroom.objects.update(school=school)
    Subject.objects.update(school=school)
    Membership = User.schools.through
    Membership.objects.bulk_create(
        [Membership(user_id=user_id, school_id=school.id) for user_id in User.objects.values_list("id", flat=True)]
    )


class Migration(migrations.Migration):
    dependencies = [
        ("schools", "0001_initial"),
        ("academics", "0002_classroom_subject_school"),
        ("accounts", "0003_user_schools"),
        ("branding", "0001_initial"),
    ]

    operations = [migrations.RunPython(create_default_school, migrations.RunPython.noop)]
