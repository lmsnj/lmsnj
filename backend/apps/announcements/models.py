from django.conf import settings
from django.db import models

from apps.academics.models import TeachingAssignment


class Announcement(models.Model):
    """Pengumuman. teaching_assignment kosong = untuk seluruh sekolah (hanya admin)."""

    title = models.CharField("judul", max_length=200)
    body = models.TextField("isi")
    # CASCADE: pengumuman bersifat ringan dan tidak boleh menghalangi penghapusan pengampu.
    teaching_assignment = models.ForeignKey(
        TeachingAssignment,
        verbose_name="kelas-mapel",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="announcements",
    )
    is_pinned = models.BooleanField("disematkan", default=False)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="penulis",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    created_at = models.DateTimeField("dibuat", auto_now_add=True)
    updated_at = models.DateTimeField("diubah", auto_now=True)

    class Meta:
        verbose_name = "pengumuman"
        verbose_name_plural = "pengumuman"
        ordering = ["-is_pinned", "-created_at"]

    def __str__(self):
        return self.title
