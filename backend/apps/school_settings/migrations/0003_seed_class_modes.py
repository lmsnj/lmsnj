from django.db import migrations

# Mode kelas awal (spesifikasi Mapel Umum Tahap 2). Kode dipakai pengaturan kelas.mode_default.
MODES = [
    ("tanpa_perangkat", "Tanpa perangkat (hanya guru)", False, 1),
    ("lab", "Lab (setiap siswa punya PC)", True, 2),
    ("perangkat_kelompok", "Perangkat kelompok", True, 3),
]


def add_modes(apps, schema_editor):
    ClassMode = apps.get_model("school_settings", "ClassMode")
    for code, name, needs_device, order in MODES:
        ClassMode.objects.get_or_create(
            code=code, defaults={"name": name, "needs_student_device": needs_device, "order": order}
        )


def remove_modes(apps, schema_editor):
    apps.get_model("school_settings", "ClassMode").objects.filter(code__in=[m[0] for m in MODES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("school_settings", "0002_class_modes_categories"),
    ]

    operations = [migrations.RunPython(add_modes, remove_modes)]
