"""Laporan rekap nilai satu kelas: baris = siswa, kolom = mapel (rata-rata tugas per mapel).

Dibangun dari build_gradebook agar cara menghitung rata-rata sama persis dengan rekap nilai guru.
"""

import csv
import io

from .gradebook import UTF8_BOM, build_gradebook, format_number


def _mean(values):
    values = [v for v in values if v is not None]
    return round(sum(values) / len(values), 2) if values else None


def build_classroom_report(classroom):
    assignments = classroom.teaching_assignments.select_related("subject", "teacher").order_by(
        "subject__name"
    )
    subjects = []
    averages = {}  # student_id -> {assignment_id: rata-rata}
    for assignment in assignments:
        gradebook = build_gradebook(assignment)
        subjects.append(
            {
                "id": assignment.id,
                "subject_code": assignment.subject.code,
                "subject_name": assignment.subject.name,
                "teacher_name": assignment.teacher.full_name,
                "task_count": len(gradebook["tasks"]),
            }
        )
        for row in gradebook["rows"]:
            averages.setdefault(row["student"]["id"], {})[str(assignment.id)] = row["average"]

    rows = []
    for student in classroom.students.order_by("full_name"):
        mine = averages.get(student.id, {})
        values = {str(s["id"]): mine.get(str(s["id"])) for s in subjects}
        rows.append(
            {
                "student": {"id": student.id, "full_name": student.full_name, "nis": student.nis},
                "averages": values,
                # Rata-rata dari mapel yang sudah punya nilai (skala 100).
                "overall": _mean(values.values()),
            }
        )

    return {
        "classroom": {
            "id": classroom.id,
            "name": classroom.name,
            "academic_year": classroom.academic_year,
            "homeroom_teacher_name": (
                classroom.homeroom_teacher.full_name if classroom.homeroom_teacher else None
            ),
        },
        "subjects": subjects,
        "rows": rows,
        "class_average": _mean(row["overall"] for row in rows),
    }


def classroom_report_csv(report):
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    subjects = report["subjects"]
    writer.writerow(["No", "NIS", "Nama"] + [s["subject_name"] for s in subjects] + ["Rata-rata"])
    for number, row in enumerate(report["rows"], start=1):
        writer.writerow(
            [number, row["student"]["nis"] or "", row["student"]["full_name"]]
            + [format_number(row["averages"][str(s["id"])]) for s in subjects]
            + [format_number(row["overall"])]
        )
    writer.writerow([])
    writer.writerow(
        ["", "", "Rata-rata kelas"] + [""] * len(subjects) + [format_number(report["class_average"])]
    )
    return UTF8_BOM + buffer.getvalue()
