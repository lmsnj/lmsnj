from datetime import timedelta

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.academics.models import TeachingAssignment


class SessionMode(models.TextChoices):
    OFFLINE = "offline", "Tatap muka"
    ONLINE = "online", "Online"


class TeachingSession(models.Model):
    """Jadwal sesi mengajar satu kelas-mapel (pertemuan tatap muka atau online)."""

    teaching_assignment = models.ForeignKey(
        TeachingAssignment, verbose_name="kelas-mapel", on_delete=models.CASCADE, related_name="sessions"
    )
    title = models.CharField("topik", max_length=200)
    description = models.TextField("catatan", blank=True)
    starts_at = models.DateTimeField("mulai")
    duration_minutes = models.PositiveSmallIntegerField(
        "durasi (menit)", default=90, validators=[MinValueValidator(10), MaxValueValidator(480)]
    )
    mode = models.CharField("jenis", max_length=10, choices=SessionMode.choices, default=SessionMode.OFFLINE)
    location = models.CharField("ruang/tempat", max_length=100, blank=True)
    meeting_url = models.URLField("link pertemuan", max_length=500, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="dibuat oleh",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    created_at = models.DateTimeField("dibuat", auto_now_add=True)

    class Meta:
        verbose_name = "sesi mengajar"
        verbose_name_plural = "sesi mengajar"
        ordering = ["starts_at"]

    def __str__(self):
        return self.title

    @property
    def ends_at(self):
        return self.starts_at + timedelta(minutes=self.duration_minutes)
