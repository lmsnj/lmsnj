from datetime import timedelta

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils import timezone

from apps.academics.models import TeachingAssignment
from apps.common.files import RandomUploadPath, delete_file


class Assessment(models.Model):
    """Lembar asesmen (kuis online): soal pilihan ganda (dinilai otomatis) dan esai (dinilai guru)."""

    teaching_assignment = models.ForeignKey(
        TeachingAssignment, verbose_name="kelas-mapel", on_delete=models.PROTECT, related_name="assessments"
    )
    title = models.CharField("judul", max_length=200)
    instructions = models.TextField("petunjuk", blank=True)
    due_at = models.DateTimeField("tenggat")
    # Kosong = tanpa batas waktu (siswa bisa mengerjakan sampai tenggat).
    duration_minutes = models.PositiveSmallIntegerField(
        "durasi (menit)", null=True, blank=True, validators=[MinValueValidator(5), MaxValueValidator(300)]
    )
    show_answers = models.BooleanField("tampilkan kunci jawaban setelah tenggat", default=True)
    # Pengawasan: keluar dari halaman ujian (pindah tab/aplikasi, keluar layar penuh) selalu dicatat.
    # max_violations > 0 = jawaban otomatis dikumpulkan setelah keluar sebanyak itu.
    max_violations = models.PositiveSmallIntegerField(
        "batas keluar halaman", default=0, validators=[MaxValueValidator(20)]
    )
    require_fullscreen = models.BooleanField("wajib layar penuh (laptop/PC)", default=False)
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
        verbose_name = "lembar asesmen"
        verbose_name_plural = "lembar asesmen"
        ordering = ["-due_at"]

    def __str__(self):
        return self.title

    @property
    def is_past_due(self):
        return timezone.now() > self.due_at


class QuestionKind(models.TextChoices):
    CHOICE = "choice", "Pilihan ganda"
    ESSAY = "essay", "Esai"


class TextDirection(models.TextChoices):
    AUTO = "auto", "Otomatis"
    RTL = "rtl", "Kanan ke kiri (Arab)"
    LTR = "ltr", "Kiri ke kanan"


class Question(models.Model):
    """Soal. Teks (stimulus, pertanyaan, pilihan) boleh berisi rumus LaTeX di antara $...$ atau
    $$...$$ dan teks Arab berharakat; disimpan apa adanya (tidak dinormalisasi) agar tidak rusak."""

    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE, related_name="questions")
    order = models.PositiveIntegerField("urutan", default=0)
    kind = models.CharField("jenis", max_length=10, choices=QuestionKind.choices, default=QuestionKind.CHOICE)
    # Bacaan/konteks sebelum pertanyaan (opsional), mis. teks bacaan atau keterangan grafik.
    stimulus = models.TextField("stimulus", blank=True)
    text = models.TextField("pertanyaan")
    text_direction = models.CharField(
        "arah teks", max_length=4, choices=TextDirection.choices, default=TextDirection.AUTO
    )
    points = models.PositiveSmallIntegerField(
        "poin", default=1, validators=[MinValueValidator(1), MaxValueValidator(100)]
    )
    # Pilihan ganda: daftar teks pilihan, dan indeks (mulai 0) jawaban yang benar.
    choices = models.JSONField("pilihan", default=list, blank=True)
    correct_choice = models.PositiveSmallIntegerField("jawaban benar", null=True, blank=True)

    class Meta:
        verbose_name = "soal"
        verbose_name_plural = "soal"
        ordering = ["order", "id"]

    def __str__(self):
        return self.text[:50]


class Attempt(models.Model):
    """Pengerjaan satu siswa. Setiap siswa hanya boleh mengerjakan satu kali."""

    assessment = models.ForeignKey(Assessment, on_delete=models.PROTECT, related_name="attempts")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="attempts")
    started_at = models.DateTimeField("mulai", auto_now_add=True)
    submitted_at = models.DateTimeField("dikumpulkan", null=True, blank=True)
    is_late = models.BooleanField("terlambat", default=False)
    # Terisi setelah SEMUA jawaban (termasuk esai) sudah dinilai.
    score = models.DecimalField("nilai", max_digits=7, decimal_places=2, null=True, blank=True)
    # Jawaban sementara yang disimpan otomatis selama mengerjakan (dipakai saat dikumpulkan otomatis).
    draft_answers = models.JSONField("jawaban sementara", default=list, blank=True)
    violation_count = models.PositiveSmallIntegerField("jumlah keluar halaman", default=0)
    auto_submitted = models.BooleanField("dikumpulkan otomatis", default=False)

    class Meta:
        verbose_name = "pengerjaan"
        verbose_name_plural = "pengerjaan"
        ordering = ["-started_at"]
        constraints = [
            models.UniqueConstraint(fields=["assessment", "student"], name="unique_attempt_per_student")
        ]

    def __str__(self):
        return f"{self.assessment} - {self.student}"

    @property
    def deadline(self):
        """Batas waktu mengerjakan: mulai + durasi, tetapi tidak melewati tenggat."""
        if self.assessment.duration_minutes:
            return min(
                self.started_at + timedelta(minutes=self.assessment.duration_minutes), self.assessment.due_at
            )
        return self.assessment.due_at


class Answer(models.Model):
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="answers")
    choice = models.PositiveSmallIntegerField("pilihan", null=True, blank=True)
    text = models.TextField("jawaban", blank=True)
    # Kosong = belum dinilai (hanya terjadi pada esai yang diisi siswa).
    points = models.DecimalField("poin", max_digits=6, decimal_places=2, null=True, blank=True)
    feedback = models.TextField("umpan balik", blank=True)

    class Meta:
        verbose_name = "jawaban"
        verbose_name_plural = "jawaban"
        ordering = ["question__order", "question_id"]
        constraints = [
            models.UniqueConstraint(fields=["attempt", "question"], name="unique_answer_per_question")
        ]


class ViolationKind(models.TextChoices):
    HIDDEN = "hidden", "Pindah tab / aplikasi"
    BLUR = "blur", "Membuka jendela lain"
    FULLSCREEN_EXIT = "fullscreen_exit", "Keluar dari layar penuh"
    NAVIGATE = "navigate", "Meninggalkan halaman ujian"


class AttemptEvent(models.Model):
    """Catatan setiap kali siswa keluar dari halaman ujian, untuk ditinjau guru."""

    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="events")
    kind = models.CharField("jenis", max_length=20, choices=ViolationKind.choices)
    created_at = models.DateTimeField("waktu", auto_now_add=True)

    class Meta:
        verbose_name = "catatan pengawasan"
        verbose_name_plural = "catatan pengawasan"
        ordering = ["created_at"]


class ImageSlot(models.TextChoices):
    STIMULUS = "stimulus", "Gambar stimulus"
    QUESTION = "question", "Gambar soal"
    CHOICE = "choice", "Gambar pilihan"


class QuestionImage(models.Model):
    """Gambar pada soal. Untuk slot `choice`, `index` = nomor pilihan (0 = A)."""

    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="images")
    slot = models.CharField("letak", max_length=10, choices=ImageSlot.choices)
    index = models.PositiveSmallIntegerField("nomor pilihan", default=0)
    file = models.FileField("file", upload_to=RandomUploadPath("assessment-images"))
    original_filename = models.CharField("nama file asli", max_length=255, blank=True)

    class Meta:
        verbose_name = "gambar soal"
        verbose_name_plural = "gambar soal"
        constraints = [
            models.UniqueConstraint(fields=["question", "slot", "index"], name="unique_question_image_slot")
        ]


@receiver(post_delete, sender=QuestionImage)
def delete_question_image_file(sender, instance, **kwargs):
    # Sinyal (bukan override delete) agar file ikut terhapus saat soal/asesmen dihapus lewat CASCADE.
    delete_file(instance.file)
