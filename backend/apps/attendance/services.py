"""Aturan presensi dan rekapnya. Dipakai juga oleh syarat kartu ujian.

Persentase kehadiran = jumlah Hadir / jumlah pertemuan yang SUDAH dicatat untuk siswa itu.
Pertemuan yang presensinya belum diisi guru tidak dihitung (tidak merugikan siswa).
Jika `count_excused`, Sakit dan Izin ikut dihitung hadir.
"""

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import Attendance, AttendanceStatus

STATUSES = [choice.value for choice in AttendanceStatus]


def empty_counts():
    return {status: 0 for status in STATUSES}


def rate(counts, count_excused=False):
    """Persentase kehadiran (0-100, 1 desimal) dari {H, S, I, A}; None jika belum ada catatan."""
    total = sum(counts[status] for status in STATUSES)
    if not total:
        return None
    present = counts["H"] + (counts["S"] + counts["I"] if count_excused else 0)
    return round(present / total * 100, 1)


def counts_by_student(records):
    """{student_id: {H, S, I, A}} dari queryset Attendance (dihitung di database)."""
    result = {}
    rows = records.values("student_id").annotate(
        **{status: Count("id", filter=Q(status=status)) for status in STATUSES}
    )
    for row in rows.order_by("student_id"):
        result[row["student_id"]] = {status: row[status] for status in STATUSES}
    return result


def in_period(records, date_from=None, date_to=None):
    """Batasi catatan presensi ke rentang tanggal pertemuan (tanggal lokal, inklusif)."""
    if date_from:
        records = records.filter(session__starts_at__date__gte=date_from)
    if date_to:
        records = records.filter(session__starts_at__date__lte=date_to)
    return records


def summarize(students, records, count_excused=False):
    """Satu baris rekap per siswa: jumlah H/S/I/A, total pertemuan tercatat, dan persentase."""
    counts = counts_by_student(records)
    rows = []
    for student in students:
        student_counts = counts.get(student.id, empty_counts())
        rows.append(
            {
                "student": student.id,
                "student_name": student.full_name,
                "nis": student.nis,
                **student_counts,
                "total": sum(student_counts.values()),
                "rate": rate(student_counts, count_excused),
            }
        )
    return rows


def save_session_attendance(session, records, recorded_by):
    """Simpan (buat/ubah) presensi satu pertemuan. `records` = [{student, status, note}].

    Hanya untuk siswa yang sekarang ada di kelas pertemuan itu, dan hanya setelah sesi dimulai.
    """
    if session.starts_at > timezone.now():
        raise ValidationError({"detail": "Presensi baru bisa diisi saat atau setelah pertemuan dimulai."})
    classroom = session.teaching_assignment.classroom
    allowed = set(classroom.students.values_list("id", flat=True))
    unknown = [r["student"].full_name for r in records if r["student"].id not in allowed]
    if unknown:
        raise ValidationError({"records": f"Bukan siswa kelas {classroom.name}: {', '.join(unknown)}."})

    for record in records:
        Attendance.objects.update_or_create(
            session=session,
            student=record["student"],
            defaults={"status": record["status"], "note": record.get("note", ""), "recorded_by": recorded_by},
        )
    return session.attendances.select_related("student")
