"""Data grafik Statistik Sekolah (admin) untuk sekolah yang sedang dibuka.

Pengelompokan per minggu & per kelas dihitung di Python (bukan fungsi tanggal database) agar
hasilnya sama di SQLite maupun PostgreSQL/MySQL dan mengikuti zona waktu sekolah (Asia/Jakarta).
"""

from collections import defaultdict
from datetime import datetime, time, timedelta

from django.db.models import Count, Q
from django.utils import timezone

from apps.academics.models import Classroom
from apps.attendance.models import Attendance, AttendanceStatus
from apps.tasks.models import Submission

from .services import current_academic_year

WEEKS = 8


def week_starts(today, weeks=WEEKS):
    """Senin awal tiap minggu, dari `weeks - 1` minggu lalu sampai minggu ini (urut lama -> baru)."""
    this_monday = today - timedelta(days=today.weekday())
    return [this_monday - timedelta(weeks=n) for n in range(weeks - 1, -1, -1)]


def _monday_of(moment):
    day = timezone.localtime(moment).date()
    return day - timedelta(days=day.weekday())


def _range_start(weeks):
    return timezone.make_aware(datetime.combine(weeks[0], time.min))


def students_by_classroom(classrooms):
    rows = classrooms.annotate(
        total=Count("students", filter=Q(students__is_active=True), distinct=True)
    ).order_by("grade", "name")
    return [{"id": c.id, "name": c.name, "grade": c.grade, "count": c.total} for c in rows]


def submissions_by_week(school, weeks):
    moments = Submission.objects.filter(
        task__teaching_assignment__classroom__school=school, submitted_at__gte=_range_start(weeks)
    ).values_list("submitted_at", flat=True)
    counts = defaultdict(int)
    for moment in moments:
        counts[_monday_of(moment)] += 1
    return [{"week_start": week, "count": counts[week]} for week in weeks]


def attendance_by_week(school, weeks):
    """Persentase Hadir dari presensi yang sudah dicatat per minggu (Sakit/Izin tidak dihitung hadir)."""
    records = Attendance.objects.filter(
        session__teaching_assignment__classroom__school=school, session__starts_at__gte=_range_start(weeks)
    ).values_list("session__starts_at", "status")
    totals, present = defaultdict(int), defaultdict(int)
    for starts_at, status in records:
        week = _monday_of(starts_at)
        totals[week] += 1
        present[week] += status == AttendanceStatus.PRESENT
    return [
        {
            "week_start": week,
            "recorded": totals[week],
            "rate": round(present[week] / totals[week] * 100, 1) if totals[week] else None,
        }
        for week in weeks
    ]


def grades_by_classroom(classrooms):
    """Rata-rata nilai tugas terbit per kelas, skala 100 (cara hitung sama dengan rekap nilai)."""
    rows = Submission.objects.filter(
        task__teaching_assignment__classroom__in=classrooms, task__is_published=True, score__isnull=False
    ).values_list("task__teaching_assignment__classroom", "score", "task__max_score")
    values = defaultdict(list)
    for classroom_id, score, max_score in rows:
        values[classroom_id].append(float(score) / max_score * 100)
    result = []
    for classroom in classrooms.order_by("grade", "name"):
        scores = values.get(classroom.id, [])
        result.append(
            {
                "id": classroom.id,
                "name": classroom.name,
                "graded": len(scores),
                "average": round(sum(scores) / len(scores), 1) if scores else None,
            }
        )
    return result


def school_statistics(school):
    year = current_academic_year(school)
    classrooms = Classroom.objects.filter(school=school, academic_year=year)
    weeks = week_starts(timezone.localdate())
    return {
        "academic_year": year,
        "students_by_classroom": students_by_classroom(classrooms),
        "submissions_by_week": submissions_by_week(school, weeks),
        "attendance_by_week": attendance_by_week(school, weeks),
        "grades_by_classroom": grades_by_classroom(classrooms),
    }
