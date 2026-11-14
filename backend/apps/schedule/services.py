"""Aturan dan rekap jadwal pelajaran mingguan."""

from collections import defaultdict

from django.db.models import Count

from apps.academics.models import TeachingAssignment

from .models import TimetableEntry


def find_conflicts(rows):
    """Cari bentrok pada isi jadwal sebelum disimpan.

    rows: daftar dict berisi `slot`, `classroom`, `teacher`, `subject` (teks apa saja yang unik).
    Aturan: satu kelas hanya satu mapel per jam. Satu guru boleh berada di beberapa kelas pada jam
    yang sama hanya jika mapelnya sama (kelas gabungan); mapel berbeda berarti bentrok.
    """
    by_class = defaultdict(set)
    by_teacher = defaultdict(set)
    for row in rows:
        by_class[(row["slot"], row["classroom"])].add((row["subject"], row["teacher"]))
        by_teacher[(row["slot"], row["teacher"])].add(row["subject"])

    conflicts = []
    for (slot, classroom), lessons in by_class.items():
        if len(lessons) > 1:
            conflicts.append(f"{slot}: kelas {classroom} punya lebih dari satu pelajaran.")
    for (slot, teacher), subjects in by_teacher.items():
        if len(subjects) > 1:
            names = ", ".join(sorted(subjects))
            conflicts.append(f"{slot}: guru {teacher} mengajar mapel berbeda sekaligus ({names}).")
    return sorted(conflicts)


def teacher_loads(timetable):
    """Beban mengajar tiap guru pada satu jadwal.

    - `scheduled_periods`: jam mengajar di jadwal; kelas gabungan pada jam yang sama dihitung sekali.
    - `official_hours`: JP resmi (dokumen distribusi JP); None jika belum ada yang diisi.
    - `unscheduled_hours`: bagian JP resmi yang memang tidak ada di jadwal, mis. PKL.
    """
    scheduled = (
        TimetableEntry.objects.filter(time_slot__timetable=timetable)
        .values("teaching_assignment__teacher")
        .annotate(periods=Count("time_slot", distinct=True))
        .order_by("teaching_assignment__teacher")
    )
    in_timetable = set(
        TimetableEntry.objects.filter(time_slot__timetable=timetable).values_list(
            "teaching_assignment", flat=True
        )
    )
    official = TeachingAssignment.objects.filter(
        classroom__school=timetable.school, classroom__academic_year=timetable.academic_year
    ).exclude(weekly_hours=None)
    loads = defaultdict(lambda: {"scheduled_periods": 0, "official_hours": None, "unscheduled_hours": 0})
    for row in scheduled:
        loads[row["teaching_assignment__teacher"]]["scheduled_periods"] = row["periods"]
    for assignment_id, teacher_id, hours in official.values_list("id", "teacher", "weekly_hours"):
        load = loads[teacher_id]
        load["official_hours"] = (load["official_hours"] or 0) + hours
        if assignment_id not in in_timetable:
            load["unscheduled_hours"] += hours
    return loads
