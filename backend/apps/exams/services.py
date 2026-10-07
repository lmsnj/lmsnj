"""Syarat kartu ujian: hitung status setiap siswa di satu kelas untuk satu acara ujian.

Syarat otomatis: persentase kehadiran, persentase tugas terkumpul, rata-rata nilai (sama dengan
laporan nilai kelas), dan pembayaran (lunas sampai triwulan ke-N). Syarat manual: centang wali kelas.
Syarat yang angkanya belum ada (belum ada presensi tercatat, belum ada tugas yang lewat tenggat,
belum ada nilai) dianggap terpenuhi, agar siswa tidak dirugikan oleh data yang belum diisi guru.
Siswa yang dikecualikan admin tetap mendapat kartu walau ada syarat yang belum terpenuhi.
"""

import secrets

from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.attendance import services as attendance
from apps.attendance.models import Attendance
from apps.payments.services import paid_quarters
from apps.tasks.models import Submission, Task
from apps.tasks.reports import build_classroom_report

from .models import ExamParticipant

# (kunci nilai, label, field batas di ExamEvent)
AUTO_REQUIREMENTS = [
    ("attendance", "Kehadiran (%)", "min_attendance"),
    ("task_rate", "Tugas terkumpul (%)", "min_task_rate"),
    ("average", "Rata-rata nilai", "min_average"),
    ("paid_quarter", "Lunas sampai triwulan", "min_paid_quarter"),
]
# Token kartu: tanpa 0/O dan 1/I agar tidak salah baca saat diketik siswa.
TOKEN_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
TOKEN_LENGTH = 6
# Field yang hanya boleh diubah admin (wali kelas hanya mencentang persetujuan).
ADMIN_ONLY_FIELDS = ("exempted", "exemption_reason", "room")


def event_classrooms(event):
    """Kelas yang ikut acara: tahun ajaran acara, tingkat sesuai `grades` (kosong = semua)."""
    classrooms = event.school.classrooms.filter(academic_year=event.academic_year)
    if event.grades:
        classrooms = classrooms.filter(grade__in=event.grades)
    return classrooms


def exam_number(event, student):
    """Nomor peserta = nomor acara + NIS. Tidak berubah walau daftar siswa bertambah/berkurang."""
    return f"{event.id:03d}-{student.nis or 'U' + str(student.id)}"


def check_requirements(event, values, participant=None):
    """Bandingkan nilai siswa dengan batas acara. `values` = {attendance, task_rate, average, paid_quarter}
    (None = belum ada data). Mengembalikan {checks, requirements_met, eligible}."""
    checks = []
    for key, label, field in AUTO_REQUIREMENTS:
        minimum = getattr(event, field)
        if minimum is None:
            continue
        value = values.get(key)
        passed = value is None or value >= minimum
        checks.append({"key": key, "label": label, "minimum": minimum, "value": value, "passed": passed})
    if event.require_homeroom_check:
        checked = bool(participant and participant.homeroom_checked)
        checks.append(
            {
                "key": "homeroom",
                "label": "Persetujuan wali kelas",
                "minimum": None,
                "value": checked,
                "passed": checked,
            }
        )
    met = all(check["passed"] for check in checks)
    exempted = bool(participant and participant.exempted)
    return {"checks": checks, "requirements_met": met, "eligible": met or exempted}


def attendance_rates(event, classroom, students):
    records = Attendance.objects.filter(
        session__teaching_assignment__classroom=classroom, student__in=students
    )
    records = attendance.in_period(records, event.period_start, event.period_end)
    counts = attendance.counts_by_student(records)
    return {
        s.id: attendance.rate(counts.get(s.id, attendance.empty_counts()), event.count_excused)
        for s in students
    }


def task_rates(event, classroom, students):
    """Persentase tugas terbit (tenggat sudah lewat, dalam periode) yang dikumpulkan siswa."""
    tasks = Task.objects.filter(
        teaching_assignment__classroom=classroom, is_published=True, due_at__lte=timezone.now()
    )
    if event.period_start:
        tasks = tasks.filter(due_at__date__gte=event.period_start)
    if event.period_end:
        tasks = tasks.filter(due_at__date__lte=event.period_end)
    total = tasks.count()
    if not total:
        return {s.id: None for s in students}
    submitted = dict(
        Submission.objects.filter(task__in=tasks, student__in=students)
        .values("student_id")
        .annotate(count=Count("id"))
        .order_by("student_id")
        .values_list("student_id", "count")
    )
    return {s.id: round(submitted.get(s.id, 0) / total * 100, 1) for s in students}


def averages(classroom):
    return {row["student"]["id"]: row["overall"] for row in build_classroom_report(classroom)["rows"]}


def evaluate_classroom(event, classroom):
    """Satu baris per siswa aktif di kelas: nilai tiap syarat, centang/pengecualian, dan hasilnya.

    Hanya syarat yang dipakai acara yang dihitung (laporan nilai cukup berat dihitung)."""
    students = list(classroom.students.filter(is_active=True).order_by("full_name"))
    values = {s.id: {} for s in students}

    def fill(key, found):
        for student_id, value in found.items():
            if student_id in values:
                values[student_id][key] = value

    if event.min_attendance is not None:
        fill("attendance", attendance_rates(event, classroom, students))
    if event.min_task_rate is not None:
        fill("task_rate", task_rates(event, classroom, students))
    if event.min_average is not None:
        fill("average", averages(classroom))
    if event.min_paid_quarter is not None:
        fill("paid_quarter", paid_quarters([s.id for s in students], event.academic_year))

    participants = {p.student_id: p for p in event.participants.filter(student__in=students)}
    rows = []
    for student in students:
        participant = participants.get(student.id)
        rows.append(
            {
                "student": student.id,
                "student_name": student.full_name,
                "nis": student.nis,
                "exam_number": exam_number(event, student),
                "homeroom_checked": bool(participant and participant.homeroom_checked),
                "exempted": bool(participant and participant.exempted),
                "exemption_reason": participant.exemption_reason if participant else "",
                "room": participant.room if participant else "",
                "token": participant.token if participant else "",
                **check_requirements(event, values[student.id], participant),
            }
        )
    return rows


@transaction.atomic
def save_participants(event, classroom, records, user):
    """records = [{student, homeroom_checked?, exempted?, exemption_reason?, room?}].
    Hanya field yang dikirim yang diubah. Wali kelas hanya boleh mengubah `homeroom_checked`."""
    if not user.is_admin_role and any(field in record for record in records for field in ADMIN_ONLY_FIELDS):
        raise PermissionDenied("Pengecualian dan ruang ujian hanya dapat diatur admin.")
    allowed = set(classroom.students.filter(is_active=True).values_list("id", flat=True))
    unknown = [r["student"].full_name for r in records if r["student"].id not in allowed]
    if unknown:
        raise ValidationError({"records": f"Bukan siswa kelas {classroom.name}: {', '.join(unknown)}."})

    for record in records:
        participant, _ = ExamParticipant.objects.get_or_create(event=event, student=record["student"])
        for field in ("homeroom_checked", *ADMIN_ONLY_FIELDS):
            if field in record:
                setattr(participant, field, record[field])
        if not participant.exempted:
            participant.exemption_reason = ""
        elif not participant.exemption_reason.strip():
            # Seluruh simpanan dibatalkan (atomic), jadi tidak ada yang tersimpan setengah.
            raise ValidationError(
                {"records": f"Alasan pengecualian untuk {participant.student.full_name} wajib diisi."}
            )
        participant.updated_by = user
        participant.save()
    return len(records)


# ---------------------------------------------------------------- token kartu


def new_token(event):
    used = set(event.participants.exclude(token="").values_list("token", flat=True))
    while True:
        token = "".join(secrets.choice(TOKEN_CHARS) for _ in range(TOKEN_LENGTH))
        if token not in used:
            return token


def ensure_tokens(event, student_ids):
    """Pastikan setiap siswa punya token kartu (dibuat saat kartu dicetak). Mengembalikan {student_id: token}."""
    tokens = {}
    for student_id in student_ids:
        participant, _ = ExamParticipant.objects.get_or_create(event=event, student_id=student_id)
        if not participant.token:
            participant.token = new_token(event)
            participant.save(update_fields=["token"])
        tokens[student_id] = participant.token
    return tokens


def reset_token(event, student, user):
    """Token baru untuk kartu yang hilang. Kartu lama tidak berlaku lagi."""
    participant, _ = ExamParticipant.objects.get_or_create(event=event, student=student)
    participant.token = new_token(event)
    participant.updated_by = user
    participant.save()
    return participant.token


def normalize_token(value):
    return "".join((value or "").split()).upper()


def student_eligibility(event, student):
    """Baris kelayakan satu siswa (lihat evaluate_classroom), atau None jika kelasnya tidak ikut acara."""
    classroom = student.classroom
    if classroom is None or not event_classrooms(event).filter(pk=classroom.pk).exists():
        return None
    return next((row for row in evaluate_classroom(event, classroom) if row["student"] == student.id), None)


def verify_card(event, student, token):
    """Syarat mulai asesmen yang ditautkan ke acara ujian: masih layak DAN token sama dengan kartu."""
    row = student_eligibility(event, student)
    if row is None:
        raise ValidationError({"token": f"Kelas Anda tidak terdaftar di {event.name}."})
    if not row["eligible"]:
        raise ValidationError(
            {
                "token": "Anda belum memenuhi syarat kartu ujian, jadi belum boleh mengerjakan. Hubungi wali kelas."
            }
        )
    if not row["token"]:
        raise ValidationError({"token": "Kartu ujian Anda belum dicetak. Hubungi wali kelas."})
    if not normalize_token(token):
        raise ValidationError({"token": "Masukkan token dari kartu peserta ujian Anda."})
    if normalize_token(token) != row["token"]:
        raise ValidationError({"token": "Token salah. Periksa kembali token di kartu peserta ujian Anda."})
