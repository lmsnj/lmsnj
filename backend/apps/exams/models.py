from django.conf import settings
from django.core.validators import MaxValueValidator
from django.db import models

from apps.academics.models import validate_academic_year
from apps.payments.models import QUARTERS


class ExamEvent(models.Model):
    """Satu acara ujian sekolah (mis. "PAS Ganjil 2026/2027") beserta syarat kartu ujiannya.

    Batas syarat yang dikosongkan (null) = syarat itu tidak dipakai. Kelas yang ikut = kelas di
    tahun ajaran acara dengan tingkat di `grades` (kosong = semua tingkat).
    """

    school = models.ForeignKey(
        "schools.School", verbose_name="sekolah", on_delete=models.PROTECT, related_name="exam_events"
    )
    name = models.CharField("nama acara", max_length=100)
    academic_year = models.CharField("tahun ajaran", max_length=9, validators=[validate_academic_year])
    grades = models.JSONField("tingkat", default=list, blank=True)
    exam_start = models.DateField("tanggal mulai ujian")
    exam_end = models.DateField("tanggal selesai ujian", null=True, blank=True)
    # Rentang tanggal pertemuan & tenggat tugas yang dihitung untuk syarat. Kosong = sepanjang tahun ajaran.
    period_start = models.DateField("awal periode hitung", null=True, blank=True)
    period_end = models.DateField("akhir periode hitung", null=True, blank=True)

    min_attendance = models.PositiveSmallIntegerField(
        "min. kehadiran (%)", null=True, blank=True, validators=[MaxValueValidator(100)]
    )
    count_excused = models.BooleanField("sakit & izin dihitung hadir", default=True)
    min_task_rate = models.PositiveSmallIntegerField(
        "min. tugas terkumpul (%)", null=True, blank=True, validators=[MaxValueValidator(100)]
    )
    min_average = models.PositiveSmallIntegerField(
        "min. rata-rata nilai", null=True, blank=True, validators=[MaxValueValidator(100)]
    )
    min_paid_quarter = models.PositiveSmallIntegerField(
        "min. lunas sampai triwulan", null=True, blank=True, validators=[MaxValueValidator(QUARTERS)]
    )
    require_homeroom_check = models.BooleanField("perlu persetujuan wali kelas", default=False)

    # Isi tambahan kartu ujian.
    card_note = models.TextField("catatan di kartu", blank=True)
    signer_title = models.CharField("jabatan penanda tangan", max_length=100, blank=True)
    signer_name = models.CharField("nama penanda tangan", max_length=100, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="dibuat oleh",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    created_at = models.DateTimeField("dibuat", auto_now_add=True)

    class Meta:
        verbose_name = "acara ujian"
        verbose_name_plural = "acara ujian"
        ordering = ["-exam_start", "-id"]

    def __str__(self):
        return self.name


class ExamParticipant(models.Model):
    """Catatan per siswa di satu acara ujian: centang wali kelas, pengecualian (admin), dan ruang.

    Baris ini hanya ada jika ada yang diisi; siswa tanpa baris dinilai dari syarat otomatis saja.
    """

    event = models.ForeignKey(
        ExamEvent, verbose_name="acara ujian", on_delete=models.CASCADE, related_name="participants"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="siswa",
        on_delete=models.PROTECT,
        related_name="exam_participations",
    )
    homeroom_checked = models.BooleanField("disetujui wali kelas", default=False)
    exempted = models.BooleanField("dikecualikan", default=False)
    exemption_reason = models.CharField("alasan pengecualian", max_length=200, blank=True)
    room = models.CharField("ruang", max_length=50, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="diubah oleh",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    updated_at = models.DateTimeField("diubah", auto_now=True)

    class Meta:
        verbose_name = "peserta ujian"
        verbose_name_plural = "peserta ujian"
        ordering = ["event", "student__full_name"]
        constraints = [
            models.UniqueConstraint(fields=["event", "student"], name="unique_participant_per_event")
        ]

    def __str__(self):
        return f"{self.student} - {self.event}"
