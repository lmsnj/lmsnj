"""Laporan Media Pembelajaran Interaktif untuk guru (satu materi = satu kelas).

- Progres siswa × stasiun: bintang, selesai, waktu belajar, salah & petunjuk.
- Analisis kesulitan: langkah dengan persentase jawaban salah tertinggi + jawaban salah yang paling sering.
- N-Gain (Hake): (Tes Akhir - Tes Awal) / (100 - Tes Awal), memakai nilai pengerjaan PERTAMA tiap tes.
- Siswa tidak aktif >= INACTIVE_DAYS hari (atau belum pernah membuka) dan belum menuntaskan media.
- Refleksi siswa per stasiun.
Fungsi di sini hanya membaca data; hak akses dicek di view.
"""

import io
from collections import Counter, defaultdict
from datetime import timedelta

from django.db.models import Max
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

from apps.assessments.models import Assessment, Attempt
from apps.assessments.results import final_result, max_score_of

from . import schema, services
from . import steps as step_kinds
from .models import InteractiveMediaAttempt, InteractiveMediaProgress, InteractiveMediaReflection

INACTIVE_DAYS = 3
MAX_DIFFICULT = 15
MIN_ATTEMPTS = 3  # langkah dengan jawaban lebih sedikit belum cukup untuk disebut sulit


def ngain(pre, post):
    if pre is None or post is None or pre >= 100:
        return None
    return round((post - pre) / (100 - pre), 2)


def ngain_category(value):
    if value is None:
        return ""
    if value >= 0.7:
        return "Tinggi"
    if value >= 0.3:
        return "Sedang"
    return "Rendah"


def _stations(content):
    result = []
    for part in content.get("parts", []):
        for station in part.get("stations", []):
            result.append(
                {
                    "id": station["id"],
                    "title": station.get("title", ""),
                    "part": part.get("title", ""),
                    "optional": bool(station.get("optional")),
                }
            )
    return result


def _test_scores(assessment_id, material, student_ids):
    """{id siswa: nilai pengerjaan pertama (skala 100)} untuk satu asesmen kelas-mapel yang sama."""
    if not assessment_id:
        return None, {}
    assessment = (
        Assessment.objects.filter(
            pk=assessment_id,
            teaching_assignment__classroom_id=material.teaching_assignment.classroom_id,
            teaching_assignment__subject_id=material.teaching_assignment.subject_id,
        )
        .prefetch_related("questions")
        .first()
    )
    if assessment is None:
        return None, {}
    max_score = max_score_of(assessment)
    attempts = defaultdict(list)
    for attempt in Attempt.objects.filter(assessment=assessment, student_id__in=student_ids):
        attempts[attempt.student_id].append(attempt)
    scores = {}
    for student_id, items in attempts.items():
        result = final_result(assessment, items, max_score)
        if result["first_score"] is not None:
            scores[student_id] = result["first_score"]
    return {"id": assessment.id, "title": assessment.title}, scores


def _step_info(content):
    """{id langkah: (judul stasiun, nomor langkah, label jenis, keterangan)}."""
    from .importers import step_caption

    info = {}
    for station in schema.iter_stations(content):
        for list_name, step in schema.iter_steps(station):
            kind = step_kinds.KINDS.get(step["kind"])
            number = station.get(list_name, []).index(step) + 1
            where = {"steps": "Langkah", "remedial": "Belajar ulang", "challenge": "Tantangan"}[list_name]
            info[step["id"]] = {
                "station": station.get("title", ""),
                "where": f"{where} {number}",
                "kind": kind.label if kind else step["kind"],
                "caption": step_caption(step),
            }
    return info


def _difficulty(material, content):
    info = _step_info(content)
    stats = defaultdict(
        lambda: {"total": 0, "wrong": 0, "students": set(), "wrong_students": set(), "answers": Counter()}
    )
    for attempt in InteractiveMediaAttempt.objects.filter(material=material).only(
        "step_id", "student_id", "correct", "answer_text"
    ):
        item = stats[attempt.step_id]
        item["total"] += 1
        item["students"].add(attempt.student_id)
        if not attempt.correct:
            item["wrong"] += 1
            item["wrong_students"].add(attempt.student_id)
            if attempt.answer_text:
                item["answers"][attempt.answer_text] += 1
    rows = []
    for step_id, item in stats.items():
        if item["total"] < MIN_ATTEMPTS or step_id not in info:
            continue
        rows.append(
            {
                "step": step_id,
                **info[step_id],
                "attempts": item["total"],
                "wrong": item["wrong"],
                "wrong_rate": round(item["wrong"] / item["total"] * 100),
                "students": len(item["students"]),
                "wrong_students": len(item["wrong_students"]),
                "top_wrong": [{"answer": a, "count": c} for a, c in item["answers"].most_common(3)],
            }
        )
    rows.sort(key=lambda r: (-r["wrong_rate"], -r["wrong"]))
    return rows[:MAX_DIFFICULT]


def build_report(material, now=None):
    now = now or timezone.now()
    media = material.interactive_media
    version = services._version(media, None)
    content = version.content if version else schema.empty_media()
    stations = _stations(content)
    required = [s["id"] for s in stations if not s["optional"]]
    students = list(
        material.teaching_assignment.classroom.students.filter(is_active=True).order_by("full_name")
    )
    ids = [s.id for s in students]

    progress = defaultdict(dict)
    last_active = {}
    for record in InteractiveMediaProgress.objects.filter(material=material, student_id__in=ids):
        progress[record.student_id][record.station_id] = record
        last_active[record.student_id] = max(
            last_active.get(record.student_id, record.updated_at), record.updated_at
        )
    for row in (
        InteractiveMediaAttempt.objects.filter(material=material, student_id__in=ids)
        .values("student_id")
        .annotate(last=Max("created_at"))
        .order_by("student_id")
    ):
        current = last_active.get(row["student_id"])
        last_active[row["student_id"]] = max(current, row["last"]) if current else row["last"]

    settings = services.settings_of(material)
    pretest, pre_scores = _test_scores(settings.get("pretest"), material, ids)
    posttest, post_scores = _test_scores(settings.get("posttest"), material, ids)

    limit = now - timedelta(days=INACTIVE_DAYS)
    rows = []
    for student in students:
        records = progress.get(student.id, {})
        cells = {}
        for station in stations:
            record = records.get(station["id"])
            if record is None:
                continue
            cells[station["id"]] = {
                "stars": record.stars,
                "done": record.completed_at is not None,
                "minutes": round(record.time_spent / 60),
                "mistakes": record.total_mistakes,
                "hints": record.hints_used,
            }
        done = sum(1 for sid in required if cells.get(sid, {}).get("done"))
        finished = bool(required) and done == len(required)
        last = last_active.get(student.id)
        pre, post = pre_scores.get(student.id), post_scores.get(student.id)
        gain = ngain(pre, post)
        rows.append(
            {
                "student": student.id,
                "name": student.full_name,
                "nis": student.nis,
                "stations": cells,
                "done": done,
                "required": len(required),
                "finished": finished,
                "stars": sum(c["stars"] for c in cells.values()),
                "minutes": sum(c["minutes"] for c in cells.values()),
                "last_active": last,
                "inactive": not finished and (last is None or last < limit),
                "pretest": pre,
                "posttest": post,
                "ngain": gain,
                "ngain_category": ngain_category(gain),
            }
        )

    gains = [r["ngain"] for r in rows if r["ngain"] is not None]
    average_gain = round(sum(gains) / len(gains), 2) if gains else None
    reflections = [
        {
            "student": r.student.full_name,
            "station": next((s["title"] for s in stations if s["id"] == r.station_id), r.station_id),
            "text": r.text,
            "updated_at": r.updated_at,
        }
        for r in InteractiveMediaReflection.objects.filter(material=material, student_id__in=ids)
        .select_related("student")
        .order_by("-updated_at")[:300]
    ]
    return {
        "material": material.id,
        "title": material.title,
        "media_title": media.title,
        "version": version.number if version else None,
        "classroom": material.teaching_assignment.classroom.name,
        "stations": stations,
        "rows": rows,
        "pretest": pretest,
        "posttest": posttest,
        "summary": {
            "students": len(rows),
            "finished": sum(1 for r in rows if r["finished"]),
            "started": sum(1 for r in rows if r["stations"]),
            "inactive": sum(1 for r in rows if r["inactive"]),
            "average_stars": round(sum(r["stars"] for r in rows) / len(rows), 1) if rows else 0,
            "average_ngain": average_gain,
            "ngain_category": ngain_category(average_gain),
            "ngain_counts": dict(Counter(r["ngain_category"] for r in rows if r["ngain_category"])),
        },
        "difficulty": _difficulty(material, content),
        "reflections": reflections,
        "inactive_days": INACTIVE_DAYS,
    }


# ---------------------------------------------------------------- Excel

HEADER = PatternFill("solid", fgColor="1F8A4C")


def _sheet(workbook, title, header, rows, widths):
    sheet = workbook.create_sheet(title)
    sheet.append(header)
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = HEADER
        cell.alignment = Alignment(wrap_text=True, vertical="center")
    for row in rows:
        sheet.append(row)
    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[sheet.cell(row=1, column=index).column_letter].width = width
    sheet.freeze_panes = "C2"
    return sheet


def _local(value):
    return timezone.localtime(value).strftime("%d/%m/%Y %H:%M") if value else "belum pernah"


def export_workbook(report):
    workbook = Workbook()
    workbook.remove(workbook.active)
    stations = report["stations"]
    header = ["Nama", "NIS", *[s["title"] for s in stations], "Stasiun wajib selesai", "Total bintang",
              "Waktu (menit)", "Terakhir aktif", "Tes Awal", "Tes Akhir", "N-Gain", "Kategori"]  # fmt: skip
    rows = []
    for row in report["rows"]:
        cells = []
        for station in stations:
            cell = row["stations"].get(station["id"])
            cells.append("" if cell is None else f"{'✓ ' if cell['done'] else ''}{cell['stars']}★")
        rows.append([row["name"], row["nis"], *cells, f"{row['done']}/{row['required']}", row["stars"],
                     row["minutes"], _local(row["last_active"]), row["pretest"], row["posttest"], row["ngain"],
                     row["ngain_category"]])  # fmt: skip
    _sheet(workbook, "Progres", header, rows, [28, 12, *[14] * len(stations), 12, 10, 10, 18, 10, 10, 10, 10])
    _sheet(
        workbook,
        "Kesulitan",
        [
            "Stasiun",
            "Langkah",
            "Jenis",
            "Keterangan",
            "Jawaban",
            "Salah",
            "% salah",
            "Siswa salah",
            "Jawaban salah terbanyak",
        ],
        [
            [d["station"], d["where"], d["kind"], d["caption"], d["attempts"], d["wrong"], d["wrong_rate"],
             d["wrong_students"], "; ".join(f"{w['answer']} ({w['count']}x)" for w in d["top_wrong"])]
            for d in report["difficulty"]
        ],  # fmt: skip
        [26, 14, 18, 40, 9, 8, 8, 10, 50],
    )
    _sheet(
        workbook,
        "Refleksi",
        ["Siswa", "Stasiun", "Refleksi", "Diubah"],
        [[r["student"], r["station"], r["text"], _local(r["updated_at"])] for r in report["reflections"]],
        [26, 28, 80, 18],
    )
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
