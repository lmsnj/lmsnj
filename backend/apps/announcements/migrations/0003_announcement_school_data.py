import django.db.models.deletion
from django.db import migrations, models


def fill_school(apps, schema_editor):
    """Pengumuman kelas-mapel ikut sekolah kelasnya; pengumuman sekolah lama ikut sekolah awal."""
    Announcement = apps.get_model("announcements", "Announcement")
    School = apps.get_model("schools", "School")
    first_school = School.objects.order_by("id").first()
    for announcement in Announcement.objects.select_related("teaching_assignment__classroom"):
        if announcement.teaching_assignment_id:
            announcement.school_id = announcement.teaching_assignment.classroom.school_id
        else:
            announcement.school = first_school
        announcement.save(update_fields=["school"])


class Migration(migrations.Migration):
    dependencies = [
        ("announcements", "0002_announcement_school"),
        ("academics", "0003_school_required"),
    ]

    operations = [
        migrations.RunPython(fill_school, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="announcement",
            name="school",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="announcements",
                to="schools.school",
                verbose_name="sekolah",
            ),
        ),
    ]
