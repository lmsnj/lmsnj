from django.apps import AppConfig


class CommonConfig(AppConfig):
    """Kode bersama (pagination, upload file, mixin) dan perintah manage.py seperti seed_demo."""

    name = "apps.common"
    verbose_name = "Umum"
