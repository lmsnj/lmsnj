"""Aturan dan rekap jadwal pelajaran mingguan."""

from collections import defaultdict
from datetime import datetime, timedelta

from django.db.models import Count
from django.utils import timezone

from apps.academics.models import TeachingAssignment

from .models import TeachingSession, TimetableEntry


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


MAX_SESSION_DAYS = 31


def _lesson_blocks(day_slots, entries):
    """Kelompokkan isi jadwal satu hari per pengampu. Jam yang berurutan (tidak dipisah istirahat,
    kegiatan, atau jam lain) digabung menjadi satu pertemuan, sama dengan Beranda."""
    position = {slot.pk: index for index, slot in enumerate(day_slots)}
    by_assignment = defaultdict(list)
    for entry in entries:
        by_assignment[entry.teaching_assignment].append(entry.time_slot)
    blocks = []
    for assignment, slots in by_assignment.items():
        slots.sort(key=lambda slot: position[slot.pk])
        current = None
        for slot in slots:
            if current and position[slot.pk] == position[current["slots"][-1].pk] + 1:
                current["slots"].append(slot)
            else:
                current = {"assignment": assignment, "slots": [slot]}
                blocks.append(current)
    return blocks


def _session_title(subject_name, slots):
    periods = [slot.period for slot in slots if slot.period is not None]
    if not periods:
        return subject_name
    label = f"Jam {periods[0]}" if len(periods) == 1 else f"Jam {periods[0]}-{periods[-1]}"
    return f"{subject_name} ({label})"


def sessions_from_timetable(timetable, assignments, date_from, date_to, created_by, dry_run=False):
    """Buat sesi mengajar (pertemuan) dari jadwal mingguan untuk rentang tanggal.

    `assignments`: pengampu yang boleh dibuatkan sesi (milik guru itu). Satu sesi per pengampu per
    blok jam berurutan, sehingga kelas gabungan tetap mendapat sesi masing-masing (presensi per
    kelas). Sesi yang sudah ada (pengampu & jam mulai sama) dilewati, jadi aman diulang. Tanggal
    sebelum jadwal berlaku juga dilewati. Mengembalikan {"created": [...], "skipped": n}.
    """
    slots_by_day = defaultdict(list)
    for slot in timetable.slots.order_by("starts_at"):
        slots_by_day[slot.day].append(slot)
    entries = list(
        TimetableEntry.objects.filter(
            time_slot__timetable=timetable, teaching_assignment__in=assignments
        ).select_related("time_slot", "teaching_assignment__subject", "teaching_assignment__classroom")
    )
    entries_by_day = defaultdict(list)
    for entry in entries:
        entries_by_day[entry.time_slot.day].append(entry)

    planned = []
    day = max(date_from, timetable.effective_from)
    while day <= date_to:
        for block in _lesson_blocks(slots_by_day[day.weekday()], entries_by_day[day.weekday()]):
            first, last = block["slots"][0], block["slots"][-1]
            starts_at = timezone.make_aware(datetime.combine(day, first.starts_at))
            minutes = (
                datetime.combine(day, last.ends_at) - datetime.combine(day, first.starts_at)
            ).seconds // 60
            planned.append(
                TeachingSession(
                    teaching_assignment=block["assignment"],
                    title=_session_title(block["assignment"].subject.name, block["slots"]),
                    starts_at=starts_at,
                    duration_minutes=min(max(minutes, 10), 480),
                    created_by=created_by,
                )
            )
        day += timedelta(days=1)

    existing = set(
        TeachingSession.objects.filter(
            teaching_assignment__in=assignments,
            starts_at__in=[session.starts_at for session in planned],
        ).values_list("teaching_assignment_id", "starts_at")
    )
    new = [s for s in planned if (s.teaching_assignment_id, s.starts_at) not in existing]
    if not dry_run:
        TeachingSession.objects.bulk_create(new)
    return {"created": new, "skipped": len(planned) - len(new)}
