from django.conf import settings
from django.db import models

from apps.academics.models import TeachingAssignment
from apps.common.files import RandomUploadPath, delete_file


class MaterialType(models.TextChoices):
    PDF = "pdf", "PDF"
    VIDEO = "video", "Video"
    LINK = "link", "Link"


class Material(models.Model):
    # PROTECT: pengampu yang masih punya materi tidak bisa dihapus tanpa sengaja.
    # Jika guru pengampu diganti, cukup ubah data pengampunya; materi tetap ada.
    teaching_assignment = models.ForeignKey(
        TeachingAssignment,
        verbose_name="pengampu",
        on_delete=models.PROTECT,
        related_name="materials",
    )
    title = models.CharField("judul", max_length=200)
    description = models.TextField("deskripsi", blank=True)
    material_type = models.CharField("tipe", max_length=10, choices=MaterialType.choices)
    file = models.FileField("file", upload_to=RandomUploadPath("materials"), blank=True)
    original_filename = models.CharField("nama file asli", max_length=255, blank=True)
    url = models.URLField("URL", max_length=500, blank=True)
    is_published = models.BooleanField("terbit", default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="dibuat oleh",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    created_at = models.DateTimeField("dibuat", auto_now_add=True)
    updated_at = models.DateTimeField("diubah", auto_now=True)

    class Meta:
        verbose_name = "materi"
        verbose_name_plural = "materi"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    def delete(self, *args, **kwargs):
        # File di disk ikut dihapus agar tidak menumpuk.
        file = self.file
        result = super().delete(*args, **kwargs)
        delete_file(file)
        return result
