import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    # Setelah data lama dipindahkan ke sekolah awal, kolom sekolah wajib diisi.
    dependencies = [
        ("academics", "0002_classroom_subject_school"),
        ("schools", "0002_default_school"),
    ]

    operations = [
        migrations.AlterField(
            model_name="classroom",
            name="school",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="classrooms",
                to="schools.school",
                verbose_name="sekolah",
            ),
        ),
        migrations.AlterField(
            model_name="subject",
            name="school",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="subjects",
                to="schools.school",
                verbose_name="sekolah",
            ),
        ),
    ]
