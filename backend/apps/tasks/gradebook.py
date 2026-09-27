"""Rekap nilai satu kelas-mapel: baris = siswa, kolom = tugas yang sudah terbit."""

import csv
import io

from .models import Submission

# Penanda UTF-8 di awal file agar Excel membaca huruf dengan benar.
UTF8_BOM = "\ufeff"


def roster_students(teaching_assignment, submissions):
    """Siswa di kelas saat ini + siswa yang sudah pindah kelas tetapi pernah mengumpulkan."""
    students = list(teaching_assignment.classroom.students.order_by("full_name"))
    current_ids = {s.id for s in students}
    moved = {s.student_id: s.student for s in submissions if s.student_id not in current_ids}
    return students + sorted(moved.values(), key=lambda s: s.full_name)


def build_gradebook(teaching_assignment):
    tasks = list(teaching_assignment.tasks.filter(is_published=True).order_by("due_at", "id"))
    submissions = list(Submission.objects.filter(task__in=tasks).select_related("student"))
    by_key = {(s.student_id, s.task_id): s for s in submissions}

    rows = []
    for student in roster_students(teaching_assignment, submissions):
        grades = {}
        percentages = []
        for task in tasks:
            submission = by_key.get((student.id, task.id))
            if submission is None:
                grades[str(task.id)] = None
                continue
            score = float(submission.score) if submission.is_graded else None
            grades[str(task.id)] = {
                "submission_id": submission.id,
                "score": score,
                "is_late": submission.is_late,
            }
            if score is not None:
                # Dibuat skala 100 agar tugas dengan nilai maksimal berbeda bisa dirata-rata.
                percentages.append(score / task.max_score * 100)
        rows.append(
            {
                "student": {"id": student.id, "full_name": student.full_name, "nis": student.nis},
                "grades": grades,
                "graded_count": len(percentages),
                "average": round(sum(percentages) / len(percentages), 2) if percentages else None,
            }
        )

    return {
        "tasks": [
            {"id": t.id, "title": t.title, "max_score": t.max_score, "due_at": t.due_at.isoformat()}
            for t in tasks
        ],
        "rows": rows,
    }


def format_number(value):
    """Format angka ala Indonesia (koma desimal) tanpa nol berlebih: 87.5 -> '87,5', 90.0 -> '90'."""
    if value is None:
        return ""
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return text.replace(".", ",")


def gradebook_csv(gradebook):
    """CSV dengan pemisah titik koma dan BOM UTF-8 agar langsung rapi dibuka di Excel berbahasa Indonesia."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    tasks = gradebook["tasks"]
    writer.writerow(
        ["No", "NIS", "Nama"]
        + [f"{t['title']} (maks {t['max_score']})" for t in tasks]
        + ["Rata-rata (skala 100)"]
    )
    for number, row in enumerate(gradebook["rows"], start=1):
        cells = []
        for task in tasks:
            grade = row["grades"][str(task["id"])]
            cells.append(format_number(grade["score"]) if grade else "")
        writer.writerow(
            [number, row["student"]["nis"] or "", row["student"]["full_name"]]
            + cells
            + [format_number(row["average"])]
        )
    return UTF8_BOM + buffer.getvalue()
