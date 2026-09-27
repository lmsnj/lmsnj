"""Aturan bisnis lembar asesmen.

- Soal hanya bisa diubah selama BELUM ada siswa yang mulai mengerjakan (agar penilaian adil).
- Terbit hanya jika ada minimal 1 soal dan setiap soal yang dinilai otomatis punya kunci jawaban.
- Siswa mulai mengerjakan sebelum tenggat, satu kali. Batas waktu = mulai + durasi (maks. tenggat).
- Jawaban yang dikirim lewat batas waktu tetap disimpan tetapi ditandai terlambat.
- Pilihan ganda, PG kompleks, dan kategori dinilai otomatis. PG kompleks & kategori: poin penuh
  hanya jika SEMUA benar (semua pilihan benar dicentang tanpa pilihan salah / semua pernyataan
  tepat), selain itu 0. Esai kosong otomatis 0; esai berisi dinilai guru.
- Nilai akhir terisi setelah semua jawaban dinilai.
- Pengawasan: setiap kali siswa keluar dari halaman ujian dicatat (AttemptEvent). Jika guru
  memasang batas (max_violations), jawaban sementara otomatis dikumpulkan saat batas tercapai.
"""

from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import AUTO_GRADED_KINDS, Answer, Attempt, AttemptEvent, QuestionKind

# Toleransi keterlambatan jaringan saat mengumpulkan tepat di akhir waktu.
SUBMIT_GRACE = timedelta(seconds=60)


def ensure_editable(assessment):
    if assessment.attempts.exists():
        raise ValidationError(
            {"detail": "Soal tidak bisa diubah karena sudah ada siswa yang mulai mengerjakan."}
        )


def ensure_publishable(assessment):
    questions = list(assessment.questions.all())
    if not questions:
        raise ValidationError({"is_published": "Tambahkan minimal satu soal sebelum menerbitkan."})
    missing = [str(index) for index, q in enumerate(questions, start=1) if not q.has_answer_key]
    if missing:
        raise ValidationError({"is_published": f"Soal nomor {', '.join(missing)} belum punya kunci jawaban."})


def start_attempt(assessment, student):
    attempt = Attempt.objects.filter(assessment=assessment, student=student).first()
    if attempt:
        return attempt
    if timezone.now() > assessment.due_at:
        raise ValidationError({"detail": "Tenggat sudah lewat, asesmen ini tidak bisa dikerjakan lagi."})
    return Attempt.objects.create(assessment=assessment, student=student)


def recompute_score(attempt):
    points = list(attempt.answers.values_list("points", flat=True))
    attempt.score = sum(points, Decimal(0)) if points and None not in points else None
    attempt.save(update_fields=["score"])


def _checked_answers(questions, answers):
    """Periksa jawaban kiriman siswa.
    Mengembalikan {question_id: {"choice", "choices", "text", "flagged"}}."""
    given = {}
    for item in answers:
        question = questions.get(item.get("question"))
        if question is None:
            raise ValidationError({"answers": "Ada jawaban untuk soal yang tidak ada di asesmen ini."})
        count = len(question.choices)
        choice = item.get("choice")
        choices = list(item.get("choices") or [])
        if question.kind == QuestionKind.CHOICE:
            valid = choice is None or 0 <= choice < count
        elif question.kind == QuestionKind.MULTIPLE:
            valid = all(c is not None and 0 <= c < count for c in choices)
            choices = sorted(set(choices))
        elif question.kind == QuestionKind.CATEGORY:
            valid = len(choices) <= count and all(c in (None, 0, 1) for c in choices)
            choices = (choices + [None] * count)[:count]
        else:
            valid = True
        if not valid:
            raise ValidationError({"answers": "Pilihan jawaban tidak valid."})
        given[question.id] = {
            "choice": choice if question.kind == QuestionKind.CHOICE else None,
            "choices": choices if question.kind in (QuestionKind.MULTIPLE, QuestionKind.CATEGORY) else [],
            "text": item.get("text") or "",
            "flagged": bool(item.get("flagged")),
        }
    return given


def auto_points(question, choice, choices):
    """Poin soal yang dinilai otomatis: penuh jika jawabannya tepat sama dengan kunci, selain itu 0."""
    if question.kind == QuestionKind.CHOICE:
        correct = choice == question.correct_choice
    elif question.kind == QuestionKind.MULTIPLE:
        correct = choices == sorted(question.correct_choices)
    else:
        correct = choices == list(question.correct_choices)
    return Decimal(question.points) if correct else Decimal(0)


def save_draft(attempt, answers):
    """Simpan jawaban sementara ke server (dipanggil otomatis beberapa detik sekali saat mengerjakan)."""
    if attempt.submitted_at:
        raise ValidationError({"detail": "Asesmen ini sudah dikumpulkan."})
    given = _checked_answers({q.id: q for q in attempt.assessment.questions.all()}, answers)
    attempt.draft_answers = [{"question": qid, **value} for qid, value in given.items()]
    attempt.save(update_fields=["draft_answers"])
    return attempt


@transaction.atomic
def record_violation(attempt, kind):
    """Catat siswa keluar dari halaman ujian. Kumpulkan otomatis jika batas guru tercapai."""
    if attempt.submitted_at:
        return attempt  # sudah selesai: tidak ada yang perlu dicatat
    AttemptEvent.objects.create(attempt=attempt, kind=kind)
    Attempt.objects.filter(pk=attempt.pk).update(violation_count=F("violation_count") + 1)
    attempt.refresh_from_db(fields=["violation_count"])
    limit = attempt.assessment.max_violations
    if limit and attempt.violation_count >= limit:
        submit_attempt(attempt, attempt.draft_answers, auto=True)
    return attempt


@transaction.atomic
def submit_attempt(attempt, answers, auto=False):
    """`answers`: [{"question": id, "choice": int|None, "text": str}]. Soal tanpa jawaban = kosong.
    `auto=True` = dikumpulkan sistem karena batas keluar halaman tercapai."""
    if attempt.submitted_at:
        raise ValidationError({"detail": "Asesmen ini sudah dikumpulkan."})
    questions = {q.id: q for q in attempt.assessment.questions.all()}
    given = _checked_answers(questions, answers)

    rows = []
    for question in questions.values():
        item = given.get(question.id, {})
        choice = item.get("choice")
        choices = item.get("choices") or []
        text = (item.get("text") or "").strip()
        if question.kind in AUTO_GRADED_KINDS:
            if question.kind == QuestionKind.CATEGORY and not choices:
                choices = [None] * len(question.choices)
            points = auto_points(question, choice, choices)
            text = ""
        else:
            choice, choices = None, []
            points = Decimal(0) if not text else None  # esai kosong langsung 0
        rows.append(
            Answer(
                attempt=attempt, question=question, choice=choice, choices=choices, text=text, points=points
            )
        )
    Answer.objects.bulk_create(rows)

    now = timezone.now()
    attempt.submitted_at = now
    attempt.is_late = now > attempt.deadline + SUBMIT_GRACE
    attempt.auto_submitted = auto
    attempt.draft_answers = []
    attempt.save(update_fields=["submitted_at", "is_late", "auto_submitted", "draft_answers"])
    recompute_score(attempt)
    return attempt


@transaction.atomic
def grade_answers(attempt, grades):
    """`grades`: [{"answer": id, "points": Decimal, "feedback": str}] dari guru."""
    if not attempt.submitted_at:
        raise ValidationError({"detail": "Siswa belum mengumpulkan asesmen ini."})
    answers = {a.id: a for a in attempt.answers.select_related("question")}
    for item in grades:
        answer = answers.get(item["answer"])
        if answer is None:
            raise ValidationError({"grades": "Jawaban tidak ditemukan pada pengerjaan ini."})
        if item["points"] > answer.question.points:
            raise ValidationError(
                {"grades": f"Poin maksimal untuk soal ini adalah {answer.question.points}."}
            )
        answer.points = item["points"]
        answer.feedback = item.get("feedback", answer.feedback)
        answer.save(update_fields=["points", "feedback"])
    recompute_score(attempt)
    return attempt
