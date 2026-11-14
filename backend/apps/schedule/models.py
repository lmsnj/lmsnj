from datetime import timedelta

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.academics.models import TeachingAssignment
from apps.schools.models import School


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


class Semester(models.TextChoices):
    ODD = "ganjil", "Ganjil"
    EVEN = "genap", "Genap"


class Day(models.IntegerChoices):
    """Nomor hari sama dengan `date.weekday()` (Senin = 0) agar mudah mencari jadwal hari ini."""

    MONDAY = 0, "Senin"
    TUESDAY = 1, "Selasa"
    WEDNESDAY = 2, "Rabu"
    THURSDAY = 3, "Kamis"
    FRIDAY = 4, "Jumat"
    SATURDAY = 5, "Sabtu"
    SUNDAY = 6, "Ahad"


class SlotKind(models.TextChoices):
    LESSON = "lesson", "Jam pelajaran"
    ACTIVITY = "activity", "Kegiatan"


class Timetable(models.Model):
    """Satu versi jadwal pelajaran mingguan milik satu sekolah. Jadwal baru dibuat sebagai versi baru,
    tidak menimpa yang lama. Setiap sekolah punya satu jadwal aktif."""

    school = models.ForeignKey(School, on_delete=models.PROTECT, related_name="timetables")
    code = models.CharField("kode jadwal", max_length=30, help_text="Contoh: SMKNJ-262702")
    academic_year = models.CharField("tahun ajaran", max_length=9)
    semester = models.CharField("semester", max_length=10, choices=Semester.choices)
    effective_from = models.DateField("berlaku sejak")
    is_active = models.BooleanField("aktif", default=False, help_text="Hanya satu jadwal aktif per sekolah.")
    created_at = models.DateTimeField("dibuat", auto_now_add=True)

    class Meta:
        verbose_name = "jadwal pelajaran"
        verbose_name_plural = "jadwal pelajaran"
        ordering = ["-effective_from"]
        constraints = [
            models.UniqueConstraint(fields=["school", "code"], name="unique_timetable_code_per_school"),
        ]

    def __str__(self):
        return f"{self.code} ({self.academic_year} {self.get_semester_display()})"


class TimeSlot(models.Model):
    """Satu baris waktu pada satu hari: jam pelajaran, atau kegiatan bersama (istirahat, sholat, pramuka)."""

    timetable = models.ForeignKey(Timetable, on_delete=models.CASCADE, related_name="slots")
    day = models.PositiveSmallIntegerField("hari", choices=Day.choices)
    period = models.PositiveSmallIntegerField("jam ke", null=True, blank=True)
    starts_at = models.TimeField("mulai")
    ends_at = models.TimeField("selesai")
    kind = models.CharField("jenis", max_length=10, choices=SlotKind.choices, default=SlotKind.LESSON)
    label = models.CharField(
        "kegiatan", max_length=100, blank=True, help_text="Diisi untuk kegiatan bersama."
    )

    class Meta:
        verbose_name = "slot waktu"
        verbose_name_plural = "slot waktu"
        ordering = ["day", "starts_at"]
        constraints = [
            models.UniqueConstraint(fields=["timetable", "day", "starts_at"], name="unique_slot_per_day"),
        ]

    def __str__(self):
        return f"{self.get_day_display()} {self.starts_at:%H.%M}-{self.ends_at:%H.%M}"


class TimetableEntry(models.Model):
    """Isi jadwal: satu kelas-mapel (pengampu) pada satu jam pelajaran."""

    time_slot = models.ForeignKey(TimeSlot, on_delete=models.CASCADE, related_name="entries")
    teaching_assignment = models.ForeignKey(
        TeachingAssignment,
        verbose_name="kelas-mapel",
        on_delete=models.CASCADE,
        related_name="timetable_entries",
    )

    class Meta:
        verbose_name = "isi jadwal"
        verbose_name_plural = "isi jadwal"
        ordering = ["time_slot__day", "time_slot__starts_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["time_slot", "teaching_assignment"], name="unique_entry_per_slot"
            ),
        ]

    def __str__(self):
        return f"{self.time_slot} - {self.teaching_assignment}"
