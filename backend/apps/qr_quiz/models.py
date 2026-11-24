from django.conf import settings
from django.db import models


class CardAssignment(models.Model):
    """Peta kartu: kartu bernomor `number` dipegang `student` di kelas itu. Kartu fisiknya hanya
    berisi nomor (QR "SG:<nomor>"), jadi set kartu yang sama bisa dipakai ulang tiap tahun ajaran."""

    classroom = models.ForeignKey(
        "academics.Classroom", verbose_name="kelas", on_delete=models.CASCADE, related_name="qr_cards"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="siswa", on_delete=models.CASCADE, related_name="qr_cards"
    )
    number = models.PositiveSmallIntegerField("nomor kartu")

    class Meta:
        verbose_name = "peta kartu QR"
        verbose_name_plural = "peta kartu QR"
        ordering = ["classroom", "number"]
        constraints = [
            models.UniqueConstraint(fields=["classroom", "number"], name="unique_qr_card_number"),
            models.UniqueConstraint(fields=["classroom", "student"], name="unique_qr_card_student"),
        ]

    def __str__(self):
        return f"Kartu {self.number} - {self.student}"


class QuizSession(models.Model):
    """Satu sesi kuis QR di satu kelas-mapel (dipakai bersama tim pengampu).

    `questions` = salinan soal [{text, choices: [teks], correct: indeks}], jadi soal sumber (bank soal)
    boleh berubah tanpa mengubah kuis yang sudah dijalankan. `current_question` & `revealed` = keadaan
    layar TV yang diatur dari HP guru. Selesai = nilai disimpan ke `grade_activity`."""

    teaching_assignment = models.ForeignKey(
        "academics.TeachingAssignment",
        verbose_name="pengampu",
        on_delete=models.PROTECT,
        related_name="qr_quizzes",
    )
    title = models.CharField("judul", max_length=150)
    questions = models.JSONField("soal", default=list)
    current_question = models.PositiveSmallIntegerField("soal yang tampil", default=0)
    revealed = models.BooleanField("hasil ditampilkan", default=False)
    grade_activity = models.OneToOneField(
        "grading.GradeActivity",
        verbose_name="penilaian",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="qr_quiz",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="dibuat oleh",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    created_at = models.DateTimeField("dibuat", auto_now_add=True)
    finished_at = models.DateTimeField("selesai", null=True, blank=True)

    class Meta:
        verbose_name = "sesi kuis QR"
        verbose_name_plural = "sesi kuis QR"
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return self.title


class QuizAnswer(models.Model):
    """Jawaban satu siswa untuk satu soal hasil pindai (dipindai ulang = diganti, jika boleh)."""

    session = models.ForeignKey(
        QuizSession, verbose_name="sesi", on_delete=models.CASCADE, related_name="answers"
    )
    question = models.PositiveSmallIntegerField("nomor soal (mulai 0)")
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="siswa", on_delete=models.PROTECT, related_name="qr_answers"
    )
    card_number = models.PositiveSmallIntegerField("nomor kartu")
    option = models.PositiveSmallIntegerField("pilihan (0 = A)")
    is_correct = models.BooleanField("benar")
    scanned_at = models.DateTimeField("dipindai", auto_now=True)

    class Meta:
        verbose_name = "jawaban kuis QR"
        verbose_name_plural = "jawaban kuis QR"
        ordering = ["session", "question", "student"]
        constraints = [
            models.UniqueConstraint(fields=["session", "question", "student"], name="unique_qr_answer")
        ]

    def __str__(self):
        return f"{self.student} soal {self.question + 1}: {'ABCD'[self.option]}"
