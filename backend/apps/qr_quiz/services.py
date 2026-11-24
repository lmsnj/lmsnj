"""Aturan kuis kartu QR: peta kartu, soal, menyimpan hasil pindai, dan mengubah hasil jadi nilai."""

from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.accounts.models import Role, User
from apps.grading.models import EntryStatus, GradeActivity, GradeEntry, GradeSource, GradeType
from apps.grading.scales import clean_value
from apps.grading.services import scale_snapshot
from apps.school_settings.services import SettingReader, feature_enabled

from .models import CardAssignment, QuizAnswer

FEATURE = "kuis_qr"
GRADE_TYPE_NAME = "Kuis QR"
MAX_QUESTIONS = 50


def ensure_enabled(school):
    """Menulis (peta kartu, sesi, jawaban) hanya jika fitur menyala; data lama tetap bisa dibaca."""
    if not feature_enabled(school, FEATURE):
        raise PermissionDenied("Fitur Kuis Kartu QR belum diaktifkan untuk sekolah ini.")


def class_students(classroom_id):
    return User.objects.filter(role=Role.STUDENT, classroom_id=classroom_id, is_active=True).order_by(
        "full_name", "id"
    )


# --- Peta kartu -------------------------------------------------------------------------------


def card_rows(classroom):
    numbers = dict(CardAssignment.objects.filter(classroom=classroom).values_list("student_id", "number"))
    return [
        {"student": s.pk, "full_name": s.full_name, "nis": s.nis, "number": numbers.get(s.pk)}
        for s in class_students(classroom.pk)
    ]


@transaction.atomic
def save_cards(classroom, records):
    """Ganti seluruh peta kartu kelas: records = [{student, number | None}]. Nomor 1..kartu_per_set,
    tidak boleh dipakai dua siswa. Error per siswa: {"records": {id_siswa: pesan}}."""
    limit = SettingReader(classroom.school).get("kuis_qr.kartu_per_set")
    allowed = set(class_students(classroom.pk).values_list("pk", flat=True))
    errors, used, cleaned = {}, set(), []
    for record in records:
        student, number = record["student"], record.get("number")
        if student not in allowed:
            errors[str(student)] = "Siswa ini bukan anggota kelas."
            continue
        if number is None:
            continue
        if not 1 <= number <= limit:
            errors[str(student)] = f"Nomor kartu harus 1–{limit}."
        elif number in used:
            errors[str(student)] = f"Kartu {number} sudah dipakai siswa lain."
        else:
            used.add(number)
            cleaned.append(CardAssignment(classroom=classroom, student_id=student, number=number))
    if errors:
        raise ValidationError({"records": errors})
    CardAssignment.objects.filter(classroom=classroom).delete()
    CardAssignment.objects.bulk_create(cleaned)
    return len(cleaned)


def auto_cards(classroom):
    """Isi otomatis: kartu 1, 2, 3, ... sesuai urutan nama (urutan absen)."""
    limit = SettingReader(classroom.school).get("kuis_qr.kartu_per_set")
    students = list(class_students(classroom.pk))
    if len(students) > limit:
        raise ValidationError(
            {"detail": f"Siswa kelas ini ({len(students)}) lebih banyak dari jumlah kartu per set ({limit})."}
        )
    return save_cards(classroom, [{"student": s.pk, "number": n} for n, s in enumerate(students, start=1)])


# --- Soal ------------------------------------------------------------------------------------


def option_limit(assignment):
    reader = SettingReader(assignment.classroom.school)
    return reader.get("kuis_qr.jumlah_opsi", subject=assignment.subject_id)


def clean_questions(questions, max_options):
    """Rapikan & periksa soal: [{text, choices, correct}]. Pesan error per nomor soal (mulai 0)."""
    if not isinstance(questions, list) or not questions:
        raise ValidationError({"questions": "Tambahkan minimal satu soal."})
    if len(questions) > MAX_QUESTIONS:
        raise ValidationError({"questions": f"Maksimal {MAX_QUESTIONS} soal."})
    errors, cleaned = {}, []
    for index, item in enumerate(questions):
        item = item if isinstance(item, dict) else {}
        text = str(item.get("text") or "").strip()
        raw_choices = item.get("choices")
        choices = [str(c or "").strip() for c in raw_choices] if isinstance(raw_choices, list) else []
        correct = item.get("correct")
        if not text:
            errors[str(index)] = "Pertanyaan wajib diisi."
        elif len(text) > 2000:
            errors[str(index)] = "Pertanyaan maksimal 2000 karakter."
        elif not 2 <= len(choices) <= max_options:
            errors[str(index)] = f"Jumlah pilihan harus 2–{max_options}."
        elif any(not c or len(c) > 300 for c in choices):
            errors[str(index)] = "Setiap pilihan wajib diisi (maks. 300 karakter)."
        elif not isinstance(correct, int) or isinstance(correct, bool) or not 0 <= correct < len(choices):
            errors[str(index)] = "Pilih jawaban yang benar."
        else:
            cleaned.append({"text": text, "choices": choices, "correct": correct})
    if errors:
        raise ValidationError({"questions": errors})
    return cleaned


def bank_questions(assignment, max_options):
    """Soal PG sederhana dari asesmen kelas-mapel yang sama (seluruh tim) yang muat di kartu."""
    from apps.assessments.models import Question, QuestionKind

    rows = (
        Question.objects.filter(
            assessment__teaching_assignment__in=assignment.team(),
            kind=QuestionKind.CHOICE,
            correct_choice__isnull=False,
        )
        .select_related("assessment")
        .order_by("assessment__title", "assessment_id", "order", "id")
    )
    result = []
    for question in rows:
        choices = [str(c) for c in question.choices or []]
        if not 2 <= len(choices) <= max_options or question.correct_choice >= len(choices):
            continue
        result.append(
            {
                "id": question.pk,
                "assessment": question.assessment.title,
                "text": question.text,
                "choices": choices,
                "correct": question.correct_choice,
            }
        )
    return result


# --- Pindai ----------------------------------------------------------------------------------


def ensure_open(session):
    if session.finished_at:
        raise ValidationError({"detail": "Kuis ini sudah selesai dan nilainya sudah disimpan."})


@transaction.atomic
def record_scans(session, question, scans):
    """Simpan hasil satu bidikan: scans = [{card, option}]. Kartu yang tidak dikenal, pilihan di luar
    jumlah opsi soal, atau jawaban yang sudah ada (jika pindai ulang dimatikan) dilewati & dilaporkan."""
    ensure_open(session)
    if not 0 <= question < len(session.questions):
        raise ValidationError({"question": "Nomor soal tidak ada."})
    item = session.questions[question]
    assignment = session.teaching_assignment
    rescan = SettingReader(assignment.classroom.school).get("kuis_qr.boleh_pindai_ulang")
    cards = dict(
        CardAssignment.objects.filter(
            classroom_id=assignment.classroom_id, student__is_active=True
        ).values_list("number", "student_id")
    )
    existing = {a.student_id: a for a in QuizAnswer.objects.filter(session=session, question=question)}
    saved, unknown, invalid, kept = 0, [], [], []
    for scan in scans:
        card, option = scan["card"], scan["option"]
        student = cards.get(card)
        if student is None:
            unknown.append(card)
        elif option >= len(item["choices"]):
            invalid.append(card)
        elif student in existing and not rescan:
            kept.append(card)
        else:
            answer = existing.get(student) or QuizAnswer(
                session=session, question=question, student_id=student
            )
            answer.card_number = card
            answer.option = option
            answer.is_correct = option == item["correct"]
            answer.save()
            existing[student] = answer
            saved += 1
    return {"saved": saved, "unknown_cards": unknown, "invalid_cards": invalid, "kept_cards": kept}


# --- Nilai -----------------------------------------------------------------------------------


def percent_to_value(scale, bands, percent):
    """(isian, nilai skala 100) dari persentase benar 0-100, dikonversi sama seperti isian guru."""
    percent = Decimal(percent).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if scale == "0-4":
        raw = (percent / 25).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    elif scale == "predikat":
        ordered = sorted(bands or [], key=lambda band: band["min"], reverse=True)
        raw = next((band["label"] for band in ordered if percent >= band["min"]), ordered[-1]["label"])
    else:
        raw = percent
    return clean_value(scale, str(raw), bands)


def kuis_qr_type(school):
    """Jenis penilaian "Kuis QR" sekolah; dibuat otomatis jika belum ada."""
    grade_type = GradeType.objects.filter(school=school, name__iexact=GRADE_TYPE_NAME).first()
    if grade_type:
        return grade_type
    last = GradeType.objects.filter(school=school).aggregate(m=Max("order"))["m"] or 0
    return GradeType.objects.create(school=school, name=GRADE_TYPE_NAME, group="formatif", order=last + 1)


@transaction.atomic
def finish(session, user):
    """Akhiri kuis: buat penilaian langsung (sumber kuis_qr). Nilai = benar / jumlah soal x 100;
    siswa yang tidak terbaca sama sekali = tidak hadir."""
    ensure_open(session)
    assignment = session.teaching_assignment
    school = assignment.classroom.school
    scale, bands = scale_snapshot(school)
    activity = GradeActivity.objects.create(
        teaching_assignment=assignment,
        grade_type=kuis_qr_type(school),
        title=session.title,
        date=timezone.localdate(),
        scale=scale,
        bands=bands,
        source=GradeSource.QR_QUIZ,
        created_by=user,
    )
    total = len(session.questions)
    correct = {}
    for student, is_correct in session.answers.values_list("student_id", "is_correct"):
        correct[student] = correct.get(student, 0) + (1 if is_correct else 0)
    entries = []
    for student in class_students(assignment.classroom_id):
        if student.pk in correct:
            right = correct[student.pk]
            value, score = percent_to_value(scale, bands, Decimal(right * 100) / total)
            entry = GradeEntry(value=value, score=score, note=f"Kuis QR: {right}/{total} benar")
        else:
            entry = GradeEntry(status=EntryStatus.ABSENT, note="Kartu tidak terbaca")
        entry.activity, entry.student, entry.updated_by = activity, student, user
        entries.append(entry)
    GradeEntry.objects.bulk_create(entries)
    session.grade_activity = activity
    session.finished_at = timezone.now()
    session.save(update_fields=["grade_activity", "finished_at"])
    return activity
