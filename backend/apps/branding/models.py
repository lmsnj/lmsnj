from django.db import models

from apps.common.files import RandomUploadPath

DEFAULT_SCHOOL_NAME = "SMKS Nurul Jadid"
DEFAULT_SLOGAN = "Cerdas, Terampil, Berakhlak Mulia"
DEFAULT_APP_NAME = "LMS SMKS Nurul Jadid"


class SiteSettings(models.Model):
    """Pengaturan identitas sekolah. Hanya ada SATU baris (pk=1), ambil lewat `SiteSettings.load()`."""

    school_name = models.CharField("nama sekolah", max_length=100, default=DEFAULT_SCHOOL_NAME)
    slogan = models.CharField("slogan", max_length=150, blank=True, default=DEFAULT_SLOGAN)
    app_name = models.CharField("nama aplikasi", max_length=100, default=DEFAULT_APP_NAME)
    # Kosong = memakai logo bawaan (placeholder) di frontend.
    logo = models.FileField("logo", upload_to=RandomUploadPath("branding"), blank=True)
    updated_at = models.DateTimeField("diubah", auto_now=True)

    class Meta:
        verbose_name = "identitas sekolah"
        verbose_name_plural = "identitas sekolah"

    def __str__(self):
        return self.school_name

    def save(self, *args, **kwargs):
        self.pk = 1  # selalu satu baris saja
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        settings, _ = cls.objects.get_or_create(pk=1)
        return settings
