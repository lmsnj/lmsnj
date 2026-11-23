from django.apps import AppConfig


class SchoolSettingsConfig(AppConfig):
    """Pengaturan pembelajaran per sekolah (aturan yang bisa diubah admin tanpa mengubah kode)
    dan saklar fitur (feature flag) per sekolah."""

    name = "apps.school_settings"
    verbose_name = "Pengaturan Pembelajaran"
