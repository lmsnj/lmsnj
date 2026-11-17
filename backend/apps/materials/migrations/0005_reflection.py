from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("materials", "0004_material_objective_quizzes"),
    ]

    operations = [
        # Materi yang sudah ada: tidak wajib refleksi (progres siswa yang berjalan tidak tiba-tiba
        # terkunci). Materi baru: wajib (default True).
        migrations.AddField(
            model_name="material",
            name="require_reflection",
            field=models.BooleanField(default=False, verbose_name="wajib cerita reflektif"),
        ),
        migrations.AlterField(
            model_name="material",
            name="require_reflection",
            field=models.BooleanField(default=True, verbose_name="wajib cerita reflektif"),
        ),
        migrations.AddField(
            model_name="materialprogress",
            name="reflection",
            field=models.TextField(blank=True, verbose_name="cerita reflektif"),
        ),
        migrations.AddField(
            model_name="materialprogress",
            name="reflected_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="refleksi ditulis"),
        ),
    ]
