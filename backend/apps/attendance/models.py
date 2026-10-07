from django.conf import settings
from django.db import models

from apps.schedule.models import TeachingSession


class AttendanceStatus(models.TextChoices):
    PRESENT = "H", "Hadir"
    SICK = "S", "Sakit"
    PERMIT = "I", "Izin"
    ABSENT = "A", "Alpa"


class Attendance(models.Model):
    """Kehadiran satu siswa di satu pertemuan (sesi mengajar).

    PROTECT: sesi atau siswa yang sudah punya catatan presensi tidak bisa dihapus, karena rekap
    presensi dipakai sebagai syarat kartu ujian.
    """

    session = models.ForeignKey(
        TeachingSession, verbose_name="sesi", on_delete=models.PROTECT, related_name="attendances"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="siswa", on_delete=models.PROTECT, related_name="attendances"
    )
    status = models.CharField("status", max_length=1, choices=AttendanceStatus.choices)
    note = models.CharField("keterangan", max_length=200, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="dicatat oleh",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    updated_at = models.DateTimeField("diubah", auto_now=True)

    class Meta:
        verbose_name = "presensi"
        verbose_name_plural = "presensi"
        ordering = ["session__starts_at", "student__full_name"]
        constraints = [
            models.UniqueConstraint(fields=["session", "student"], name="unique_attendance_per_session")
        ]

    def __str__(self):
        return f"{self.student} - {self.session} ({self.status})"
