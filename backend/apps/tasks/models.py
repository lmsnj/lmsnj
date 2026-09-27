from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from apps.academics.models import TeachingAssignment
from apps.common.files import RandomUploadPath, delete_file

# Ekstensi yang boleh diunggah siswa sebagai jawaban dan guru sebagai lampiran tugas.
ALLOWED_TASK_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".zip",
    ".rar",
    ".7z",
    ".jpg",
    ".jpeg",
    ".png",
}


class Task(models.Model):
    teaching_assignment = models.ForeignKey(
        TeachingAssignment, verbose_name="pengampu", on_delete=models.PROTECT, related_name="tasks"
    )
    title = models.CharField("judul", max_length=200)
    instructions = models.TextField("instruksi", blank=True)
    attachment = models.FileField("lampiran", upload_to=RandomUploadPath("tasks"), blank=True)
    attachment_filename = models.CharField("nama lampiran asli", max_length=255, blank=True)
    due_at = models.DateTimeField("tenggat")
    max_score = models.PositiveSmallIntegerField(
        "nilai maksimal", default=100, validators=[MinValueValidator(1), MaxValueValidator(1000)]
    )
    allow_late = models.BooleanField("terima pengumpulan terlambat", default=True)
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
        verbose_name = "tugas"
        verbose_name_plural = "tugas"
        ordering = ["-due_at"]

    def __str__(self):
        return self.title

    @property
    def is_past_due(self):
        return timezone.now() > self.due_at

    def delete(self, *args, **kwargs):
        attachment = self.attachment
        result = super().delete(*args, **kwargs)
        delete_file(attachment)
        return result


class Submission(models.Model):
    # PROTECT: tugas yang sudah dikumpulkan siswa tidak bisa terhapus tanpa sengaja
    # (jawaban dan nilai siswa ikut hilang). Guru cukup menjadikannya draf.
    task = models.ForeignKey(Task, verbose_name="tugas", on_delete=models.PROTECT, related_name="submissions")
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="siswa", on_delete=models.PROTECT, related_name="submissions"
    )
    text_answer = models.TextField("jawaban teks", blank=True)
    file = models.FileField("file jawaban", upload_to=RandomUploadPath("submissions"), blank=True)
    original_filename = models.CharField("nama file asli", max_length=255, blank=True)
    # Disimpan saat mengumpulkan, bukan dihitung ulang, agar tidak berubah jika tenggat diundur.
    is_late = models.BooleanField("terlambat", default=False)
    submitted_at = models.DateTimeField("waktu kumpul")
    created_at = models.DateTimeField("pertama dikumpulkan", auto_now_add=True)

    # Penilaian. score kosong (null) = belum dinilai.
    score = models.DecimalField("nilai", max_digits=6, decimal_places=2, null=True, blank=True)
    feedback = models.TextField("umpan balik", blank=True)
    graded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="dinilai oleh",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    graded_at = models.DateTimeField("waktu dinilai", null=True, blank=True)

    class Meta:
        verbose_name = "pengumpulan"
        verbose_name_plural = "pengumpulan"
        ordering = ["-submitted_at"]
        constraints = [
            models.UniqueConstraint(fields=["task", "student"], name="unique_submission_per_student"),
        ]

    def __str__(self):
        return f"{self.task} - {self.student.full_name}"

    @property
    def is_graded(self):
        return self.score is not None

    def delete(self, *args, **kwargs):
        file = self.file
        result = super().delete(*args, **kwargs)
        delete_file(file)
        return result
