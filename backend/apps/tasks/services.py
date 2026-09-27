"""Aturan bisnis pengumpulan tugas.

- Sebelum tenggat: siswa boleh mengumpulkan, mengganti, dan membatalkan.
- Setelah tenggat: pengumpulan PERTAMA masih diterima (ditandai terlambat) jika guru
  mengizinkan; pengumpulan yang sudah ada tidak bisa diubah/dibatalkan lagi.
- Pengumpulan yang sudah dinilai terkunci (tidak bisa diganti/dibatalkan siswa) sampai
  guru menghapus nilainya.
"""

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.common.files import delete_file

from .models import Submission

GRADED_LOCK_MESSAGE = "Tugas ini sudah dinilai guru, jadi jawaban tidak bisa diubah lagi."


def submit_task(task, student, text_answer="", file=None):
    now = timezone.now()
    existing = Submission.objects.filter(task=task, student=student).first()

    if existing and existing.is_graded:
        raise ValidationError({"detail": GRADED_LOCK_MESSAGE})
    if now > task.due_at:
        if existing:
            raise ValidationError({"detail": "Tenggat sudah lewat. Pengumpulan tidak bisa diubah lagi."})
        if not task.allow_late:
            raise ValidationError(
                {"detail": "Tenggat sudah lewat dan guru tidak menerima pengumpulan terlambat."}
            )
        is_late = True
    else:
        is_late = False

    keeps_old_file = existing is not None and bool(existing.file) and file is None
    if not text_answer.strip() and file is None and not keeps_old_file:
        raise ValidationError({"detail": "Isi jawaban teks atau unggah file jawaban."})

    submission = existing or Submission(task=task, student=student)
    old_file = existing.file if existing and existing.file and file is not None else None
    submission.text_answer = text_answer
    if file is not None:
        submission.file = file
        submission.original_filename = file.name
    submission.is_late = is_late
    submission.submitted_at = now
    submission.save()

    # File lama dihapus setelah file baru tersimpan.
    if old_file:
        delete_file(old_file)
    return submission


def cancel_submission(task, student):
    submission = Submission.objects.filter(task=task, student=student).first()
    if submission is None:
        raise ValidationError({"detail": "Anda belum mengumpulkan tugas ini."})
    if submission.is_graded:
        raise ValidationError({"detail": GRADED_LOCK_MESSAGE})
    if task.is_past_due:
        raise ValidationError({"detail": "Tenggat sudah lewat. Pengumpulan tidak bisa dibatalkan."})
    submission.delete()


def grade_submission(submission, teacher, score, feedback=""):
    """Simpan nilai. score=None berarti menghapus nilai (pengumpulan terbuka lagi untuk siswa)."""
    if score is None:
        submission.score = None
        submission.feedback = ""
        submission.graded_by = None
        submission.graded_at = None
    else:
        submission.score = score
        submission.feedback = feedback
        submission.graded_by = teacher
        submission.graded_at = timezone.now()
    submission.save(update_fields=["score", "feedback", "graded_by", "graded_at"])
    return submission
