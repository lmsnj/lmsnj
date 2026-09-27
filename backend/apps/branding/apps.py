from django.apps import AppConfig


class BrandingConfig(AppConfig):
    """Identitas sekolah yang bisa diganti admin: nama sekolah, slogan, nama aplikasi, dan logo."""

    name = "apps.branding"
    verbose_name = "Identitas Sekolah"
