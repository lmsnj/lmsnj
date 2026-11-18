import re

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


def validate_academic_year(value):
    """Format tahun ajaran harus 'YYYY/YYYY' dengan tahun kedua = tahun pertama + 1."""
    match = re.fullmatch(r"(\d{4})/(\d{4})", value)
    if not match:
        raise ValidationError("Format tahun ajaran: 2026/2027.")
    start, end = match.groups()
    if int(end) != int(start) + 1:
        raise ValidationError("Tahun ajaran harus berurutan, contoh: 2026/2027.")


class Grade(models.TextChoices):
    """Semua tingkat SD/MI (I-VI), SMP/MTs (VII-IX), SMA/MA/SMK (X-XII).
    Tingkat yang boleh dipakai per sekolah: `School.grades`."""

    I = "I", "I"  # noqa: E741
    II = "II", "II"
    III = "III", "III"
    IV = "IV", "IV"
    V = "V", "V"
    VI = "VI", "VI"
    VII = "VII", "VII"
    VIII = "VIII", "VIII"
    IX = "IX", "IX"
    X = "X", "X"
    XI = "XI", "XI"
    XII = "XII", "XII"


class Classroom(models.Model):
    school = models.ForeignKey(
        "schools.School", verbose_name="sekolah", on_delete=models.PROTECT, related_name="classrooms"
    )
    name = models.CharField("nama kelas", max_length=50, help_text="Contoh: XI RPL 1")
    grade = models.CharField("tingkat", max_length=4, choices=Grade.choices)
    major = models.CharField("jurusan", max_length=50, help_text="Contoh: RPL")
    academic_year = models.CharField("tahun ajaran", max_length=9, validators=[validate_academic_year])
    homeroom_teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="wali kelas",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="homeroom_classes",
    )

    class Meta:
        verbose_name = "kelas"
        verbose_name_plural = "kelas"
        ordering = ["-academic_year", "grade", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["school", "name", "academic_year"],
                name="unique_classroom_per_year",
                violation_error_message="Kelas dengan nama ini sudah ada di tahun ajaran tersebut.",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.academic_year})"


class Subject(models.Model):
    school = models.ForeignKey(
        "schools.School", verbose_name="sekolah", on_delete=models.PROTECT, related_name="subjects"
    )
    code = models.CharField("kode", max_length=20)
    name = models.CharField("nama mapel", max_length=100)

    class Meta:
        verbose_name = "mata pelajaran"
        verbose_name_plural = "mata pelajaran"
        ordering = ["name"]
        constraints = [
            # Kode mapel cukup unik di satu sekolah: "MTK" boleh ada di SD dan SMP sekaligus.
            models.UniqueConstraint(
                fields=["school", "code"],
                name="unique_subject_code_per_school",
                violation_error_message="Kode mapel ini sudah dipakai.",
            ),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"


class TeachingAssignment(models.Model):
    """Pengampu: guru yang mengajar satu mapel di satu kelas.

    Ini unit utama tempat materi dan tugas ditempelkan pada fase berikutnya.
    PROTECT dipakai agar mapel/kelas/guru tidak bisa dihapus selama masih diampu,
    sehingga materi dan tugas di dalamnya tidak ikut hilang tanpa sengaja.
    """

    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="guru",
        on_delete=models.PROTECT,
        related_name="teaching_assignments",
    )
    subject = models.ForeignKey(
        Subject, verbose_name="mapel", on_delete=models.PROTECT, related_name="teaching_assignments"
    )
    classroom = models.ForeignKey(
        Classroom, verbose_name="kelas", on_delete=models.PROTECT, related_name="teaching_assignments"
    )
    # JP resmi per minggu menurut dokumen distribusi JP. Kosong = belum ditetapkan.
    weekly_hours = models.PositiveSmallIntegerField("JP per minggu", null=True, blank=True)

    class Meta:
        verbose_name = "pengampu"
        verbose_name_plural = "pengampu"
        ordering = ["classroom__name", "subject__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["teacher", "subject", "classroom"],
                name="unique_teaching_assignment",
                violation_error_message="Guru ini sudah mengampu mapel tersebut di kelas ini.",
            ),
        ]

    def __str__(self):
        return f"{self.subject.name} - {self.classroom.name} ({self.teacher.full_name})"

    # Tim pengampu: beberapa guru boleh mengajar mapel yang sama di kelas yang sama. Materi, bab, tugas,
    # dan asesmen satu kelas-mapel dipakai BERSAMA oleh tim itu, sehingga siswa hanya punya satu jalur
    # belajar (progresnya tidak ganda) dan guru tidak perlu mengunggah ulang materi rekannya.
    @property
    def class_subject(self):
        """Kunci kelas-mapel (sama untuk semua anggota tim)."""
        return (self.classroom_id, self.subject_id)

    def team(self):
        """Semua pengampu mapel ini di kelas ini (termasuk dirinya sendiri)."""
        return TeachingAssignment.objects.filter(classroom_id=self.classroom_id, subject_id=self.subject_id)

    def has_team_member(self, user):
        """Apakah `user` termasuk guru tim kelas-mapel ini."""
        return self.team().filter(teacher_id=user.id).exists()
