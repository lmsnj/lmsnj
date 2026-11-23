from django.conf import settings
from django.db import models


class GradeGroup(models.TextChoices):
    FORMATIVE = "formatif", "Formatif"
    SUMMATIVE = "sumatif", "Sumatif"


class GradeType(models.Model):
    """Master jenis penilaian per sekolah (Tugas Kertas, Lisan, Sikap, ...). Nama dipakai sebagai
    label di layar, jadi tiap sekolah bisa memakai istilahnya sendiri. `default_weight` dipakai
    laporan nilai terpadu (Tahap 7)."""

    school = models.ForeignKey(
        "schools.School", verbose_name="sekolah", on_delete=models.CASCADE, related_name="grade_types"
    )
    name = models.CharField("nama", max_length=60)
    group = models.CharField(
        "kelompok", max_length=10, choices=GradeGroup.choices, default=GradeGroup.FORMATIVE
    )
    default_weight = models.PositiveSmallIntegerField("bobot bawaan (%)", default=0)
    order = models.PositiveSmallIntegerField("urutan", default=0)
    is_active = models.BooleanField("aktif", default=True)

    class Meta:
        verbose_name = "jenis penilaian"
        verbose_name_plural = "jenis penilaian"
        ordering = ["order", "id"]
        constraints = [models.UniqueConstraint(fields=["school", "name"], name="unique_grade_type_name")]

    def __str__(self):
        return self.name


class GradeSource(models.TextChoices):
    MANUAL = "manual", "Manual"
    QR_QUIZ = "kuis_qr", "Kuis QR"
    LKPD = "lkpd", "LKPD"


class GradeActivity(models.Model):
    """Satu kegiatan penilaian di satu kelas-mapel (mis. "LKPD Bab 2"). Kelas, mapel, dan guru
    diambil dari pengampu; seperti konten kelas lain, dipakai bersama tim pengampu.

    `scale` (dan `bands`) disalin dari pengaturan nilai.skala/nilai.predikat saat dibuat, agar nilai lama tidak berubah arti
    jika admin mengganti skala sekolah."""

    teaching_assignment = models.ForeignKey(
        "academics.TeachingAssignment",
        verbose_name="pengampu",
        on_delete=models.PROTECT,
        related_name="grade_activities",
    )
    grade_type = models.ForeignKey(
        GradeType, verbose_name="jenis penilaian", on_delete=models.PROTECT, related_name="activities"
    )
    title = models.CharField("judul", max_length=150)
    date = models.DateField("tanggal")
    scale = models.CharField("skala", max_length=10)
    # Rentang predikat saat kegiatan dibuat (khusus skala predikat), alasan sama dengan `scale`.
    bands = models.JSONField("rentang predikat", null=True, blank=True)
    source = models.CharField(
        "sumber", max_length=10, choices=GradeSource.choices, default=GradeSource.MANUAL
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="dibuat oleh",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    created_at = models.DateTimeField("dibuat", auto_now_add=True)

    class Meta:
        verbose_name = "penilaian langsung"
        verbose_name_plural = "penilaian langsung"
        ordering = ["-date", "-id"]

    def __str__(self):
        return self.title


class EntryStatus(models.TextChoices):
    PRESENT = "hadir", "Hadir"
    ABSENT = "tidak_hadir", "Tidak hadir"


class GradeEntry(models.Model):
    """Nilai satu siswa di satu kegiatan. `value` = isian guru sesuai skala kegiatan ("85", "3.5",
    "A"); `score` = nilai skala 100 hasil konversi (dipakai KKM & laporan). Tidak hadir = tanpa nilai."""

    activity = models.ForeignKey(
        GradeActivity, verbose_name="penilaian", on_delete=models.CASCADE, related_name="entries"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="siswa", on_delete=models.PROTECT, related_name="grade_entries"
    )
    value = models.CharField("nilai", max_length=10, blank=True)
    score = models.DecimalField("nilai skala 100", max_digits=5, decimal_places=2, null=True, blank=True)
    status = models.CharField(
        "kehadiran", max_length=12, choices=EntryStatus.choices, default=EntryStatus.PRESENT
    )
    note = models.CharField("catatan", max_length=200, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="diubah oleh",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    updated_at = models.DateTimeField("diubah", auto_now=True)

    class Meta:
        verbose_name = "nilai penilaian langsung"
        verbose_name_plural = "nilai penilaian langsung"
        ordering = ["activity", "student__full_name"]
        constraints = [models.UniqueConstraint(fields=["activity", "student"], name="unique_grade_entry")]

    def __str__(self):
        return f"{self.student} {self.activity}: {self.value or self.get_status_display()}"
