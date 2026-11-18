"""Impor "Rencana Pembelajaran" satu kelas-mapel dari Excel: lembar Bab, Materi, dan Tugas.

Agar guru tidak mengisi form satu per satu. Template yang diunduh SUDAH berisi bab, materi, dan tugas
kelas-mapel itu, jadi file yang sama dipakai untuk menambah maupun mengubah (dan bisa diimpor ke kelas
lain dengan mapel yang sama). Pola sama dengan impor lain: Periksa (tidak menyimpan) -> Impor jika SEMUA
baris benar.

Aturan:
- Baris dicocokkan lewat JUDUL (huruf besar/kecil & spasi diabaikan) di kelas-mapel itu: judul yang
  sudah ada = diperbarui, judul baru = dibuat. Tidak ada yang dihapus.
- Urutan baris = urutan bab/materi; yang tidak ada di file ditaruh sesudahnya (urutannya tetap).
- Setiap baris divalidasi serializer yang sama dengan form (MaterialSerializer, TaskSerializer).
- File PDF tidak bisa lewat Excel: materi PDF yang sudah ada boleh diubah (filenya tetap), materi PDF
  baru diunggah lewat form.
"""

import io
from datetime import datetime, time, timedelta

from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from rest_framework.exceptions import ValidationError

from apps.common.excel import Column, fill_data_sheet, first_errors, normalize, open_workbook, sheet_rows
from apps.tasks.models import Task
from apps.tasks.serializers import TaskSerializer

from .models import Chapter, Material, MaterialType
from .serializers import MaterialSerializer

MAX_ROWS = 200
YES = {"ya", "y", "yes", "true", "1", "benar"}
NO = {"tidak", "t", "no", "n", "false", "0", "salah"}
TYPE_FROM_TEXT = {"pdf": MaterialType.PDF, "video": MaterialType.VIDEO, "link": MaterialType.LINK}
DATE_FORMATS = [
    "%Y-%m-%d %H:%M:%S.%f",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%d/%m/%Y %H:%M",
    "%d-%m-%Y %H:%M",
]
DATE_ONLY_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"]

CHAPTER_COLUMNS = [
    Column("title", "Judul Bab", required=True, width=36),
    Column("description", "Yang akan dipelajari", width=60),
]
MATERIAL_COLUMNS = [
    Column("chapter", "Bab", width=28),
    Column("title", "Judul Materi", required=True, width=36),
    Column("description", "Deskripsi", width=44),
    Column("material_type", "Tipe", required=True, width=10, choices=["video", "link", "pdf"]),
    Column("url", "URL", width=40, text=True),
    Column("objectives", "Capaian", width=44),
    Column("concepts", "Konsep Kunci", width=44),
    Column("require_reflection", "Wajib Refleksi", width=14, choices=["ya", "tidak"]),
    Column("require_teacher_approval", "Disahkan Guru", width=14, choices=["ya", "tidak"]),
    Column("is_published", "Terbit", width=10, choices=["ya", "tidak"]),
]
TASK_COLUMNS = [
    Column("title", "Judul Tugas", required=True, width=36),
    Column("instructions", "Instruksi", width=60),
    Column("due_at", "Tenggat", required=True, width=18),
    Column("max_score", "Nilai Maks", width=11),
    Column("allow_late", "Terima Terlambat", width=16, choices=["ya", "tidak"]),
    Column("is_published", "Terbit", width=10, choices=["ya", "tidak"]),
]
SHEETS = [("Bab", CHAPTER_COLUMNS), ("Materi", MATERIAL_COLUMNS), ("Tugas", TASK_COLUMNS)]

GUIDE = [
    "File ini berisi bab, materi, dan tugas kelas-mapel ini. Ubah atau tambahkan baris, lalu impor.",
    "Kolom bertanda * wajib diisi. Satu baris = satu bab / materi / tugas.",
    "",
    "Aturan impor:",
    "- Judul yang SAMA dengan yang sudah ada = data itu diperbarui. Judul baru = dibuat. Tidak ada yang dihapus.",
    "- Urutan baris = urutan bab dan materi yang dilihat siswa.",
    "- File ini juga bisa diimpor ke kelas lain dengan mapel yang sama.",
    "- Semua baris harus benar; jika ada yang salah, tidak ada yang disimpan.",
    "",
    "Lembar Bab: Judul Bab + 'Yang akan dipelajari' (ringkasan bab untuk siswa).",
    "",
    "Lembar Materi:",
    "- Bab = judul bab (dari lembar Bab atau bab yang sudah ada). Kosong = materi tanpa bab.",
    "- Tipe: video (link YouTube), link (tautan web), atau pdf.",
    "  Materi PDF BARU diunggah lewat tombol Tambah Materi; di sini hanya materi PDF yang sudah ada.",
    "- Capaian & Konsep Kunci: satu per baris di dalam sel (Alt+Enter untuk baris baru).",
    "  Konsep Kunci ditulis 'istilah = penjelasan' (bahan Asesmen Otomatis, tidak terlihat siswa).",
    "- Wajib Refleksi (bawaan ya), Disahkan Guru (bawaan tidak), Terbit (bawaan tidak = draf): ya / tidak.",
    "",
    "Lembar Tugas:",
    "- Tenggat: tanggal & jam, mis. 30/11/2026 23:59 (tanpa jam = pukul 23:59). Tugas baru harus di masa depan.",
    "- Nilai Maks 1-1000 (bawaan 100). Terima Terlambat (bawaan ya), Terbit (bawaan tidak = draf).",
    "- Lampiran tugas ditambahkan lewat form Ubah Tugas.",
]


def team_chapters(assignment):
    return Chapter.objects.filter(teaching_assignment__in=assignment.team()).order_by("order", "id")


def team_materials(assignment):
    return Material.objects.filter(teaching_assignment__in=assignment.team()).order_by("order", "id")


def team_tasks(assignment):
    return Task.objects.filter(teaching_assignment__in=assignment.team()).order_by("due_at", "id")


def yes_no(value):
    return "ya" if value else "tidak"


def lines(values):
    return "\n".join(values or [])


# ---------------------------------------------------------------- template


def build_plan_template(assignment):
    """Template Excel berisi bab, materi, dan tugas kelas-mapel ini (seluruh tim)."""
    chapters = list(team_chapters(assignment))
    titles = {c.id: c.title for c in chapters}
    data = {
        "Bab": [[c.title, c.description] for c in chapters],
        "Materi": [
            [
                titles.get(m.chapter_id, ""),
                m.title,
                m.description,
                m.material_type,
                m.url,
                lines(m.objectives),
                lines(m.concepts),
                yes_no(m.require_reflection),
                yes_no(m.require_teacher_approval),
                yes_no(m.is_published),
            ]
            for m in team_materials(assignment)
        ],
        "Tugas": [
            [
                t.title,
                t.instructions,
                timezone.localtime(t.due_at).replace(tzinfo=None, second=0, microsecond=0),
                t.max_score,
                yes_no(t.allow_late),
                yes_no(t.is_published),
            ]
            for t in team_tasks(assignment)
        ],
    }
    if not any(data.values()):
        data = examples()  # kelas-mapel masih kosong: beri contoh agar guru tahu cara mengisinya

    workbook = Workbook()
    guide = workbook.active
    guide.title = "Petunjuk"
    title = f"Rencana Pembelajaran - {assignment.subject.name} {assignment.classroom.name}"
    guide.cell(row=1, column=1, value=title).font = Font(bold=True, size=13)
    for row, text in enumerate(GUIDE, start=3):
        guide.cell(row=row, column=1, value=text).font = Font(bold=text.endswith(":"))
    guide.column_dimensions["A"].width = 110

    for sheet_title, columns in SHEETS:
        sheet = workbook.create_sheet(sheet_title)
        fill_data_sheet(workbook, sheet, columns, MAX_ROWS)
        for row_number, values in enumerate(data[sheet_title], start=2):
            for column, value in enumerate(values, start=1):
                cell = sheet.cell(row=row_number, column=column, value=value if value != "" else None)
                cell.alignment = Alignment(wrap_text=True, vertical="top")
                if isinstance(value, datetime):
                    cell.number_format = "dd/mm/yyyy hh:mm"
    if "Daftar" in workbook.sheetnames:
        workbook.move_sheet("Daftar", offset=len(workbook.sheetnames))  # lembar tersembunyi paling akhir

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _example_due():
    """Tenggat contoh: dua minggu lagi pukul 23:59 (selalu di masa depan saat template diunduh)."""
    day = timezone.localdate() + timedelta(days=14)
    return datetime.combine(day, time(23, 59))


def examples():
    """Contoh isian template untuk kelas-mapel yang masih kosong."""
    return {
        "Bab": [
            ["Pengenalan Algoritma", "Pengertian algoritma, contoh dalam kehidupan sehari-hari."],
            ["Flowchart", "Simbol flowchart dan cara membuat flowchart sederhana."],
        ],
        "Materi": [
            ["Pengenalan Algoritma", "Apa itu Algoritma?", "Tonton video lalu catat poin penting.",
             "video", "https://www.youtube.com/watch?v=contoh", "Menjelaskan pengertian algoritma\n"
             "Memberi contoh algoritma sehari-hari", "Algoritma = langkah-langkah menyelesaikan masalah\n"
             "Program = algoritma yang ditulis dalam bahasa pemrograman", "ya", "tidak", "tidak"],
            ["Flowchart", "Simbol Flowchart", "Baca artikel berikut.", "link",
             "https://contoh.sch.id/flowchart", "Menyebutkan simbol flowchart", "", "ya", "tidak", "tidak"],
        ],  # fmt: skip
        "Tugas": [
            ["Membuat Flowchart", "Buat flowchart menghitung luas persegi panjang. Kumpulkan foto/PDF.",
             _example_due(), 100, "ya", "tidak"],
        ],  # fmt: skip
    }


# ---------------------------------------------------------------- impor


def parse_bool(value, label, errors, default):
    text = normalize(value)
    if not text:
        return default
    if text in YES:
        return True
    if text in NO:
        return False
    errors.append(f"{label}: isi 'ya' atau 'tidak'.")
    return default


def parse_due(value, errors):
    """Tenggat dari sel Excel (tanggal Excel terbaca '2026-11-30 23:59:00') atau teks 30/11/2026 23:59."""
    text = " ".join(value.split())
    for fmt in DATE_FORMATS:
        try:
            return timezone.make_aware(datetime.strptime(text, fmt))
        except ValueError:
            pass
    for fmt in DATE_ONLY_FORMATS:
        try:
            return timezone.make_aware(datetime.combine(datetime.strptime(text, fmt).date(), time(23, 59)))
        except ValueError:
            pass
    errors.append("Tenggat: format tanggal tidak dikenali. Contoh: 30/11/2026 23:59.")
    return None


def split_lines(value):
    return [line.strip() for line in value.splitlines() if line.strip()]


def _match(existing, title):
    """Data lama berjudul sama (huruf besar/kecil & spasi diabaikan). Judul kembar: yang paling awal."""
    return existing.get(normalize(title))


def _index(queryset):
    found = {}
    for obj in queryset:
        found.setdefault(normalize(obj.title), obj)
    return found


def _duplicate(seen, title, errors, label):
    key = normalize(title)
    if key in seen:
        errors.append(f"{label} '{title}' sudah ada di baris {seen[key]}. Judul tidak boleh kembar.")
    return key


def check_plan_file(file, assignment, request):
    """Periksa file. Mengembalikan (pratinjau baris, rencana simpan). Pratinjau: [{sheet, row, title,
    action ('baru' / 'diperbarui'), errors}]; rencana = daftar langkah yang dijalankan save_plan."""
    workbook = open_workbook(file)
    sheets = {}
    for sheet_title, columns in SHEETS:
        sheets[sheet_title] = (
            sheet_rows(workbook[sheet_title], columns, MAX_ROWS) if sheet_title in workbook.sheetnames else []
        )
    workbook.close()
    if not any(sheets.values()):
        raise_empty()

    preview, plan = [], {"chapters": [], "materials": [], "tasks": []}
    context = {"request": request}

    # --- Bab
    chapters = _index(team_chapters(assignment))
    seen, chapter_titles = {}, set(chapters)
    for item in sheets["Bab"]:
        data, errors = item["data"], []
        title = data["title"]
        _duplicate(seen, title, errors, "Bab")
        if len(title) > 200:
            errors.append("Judul Bab maksimal 200 karakter.")
        seen.setdefault(normalize(title), item["row"])
        chapter_titles.add(normalize(title))
        instance = _match(chapters, title)
        plan["chapters"].append({"instance": instance, "title": title, "description": data["description"]})
        preview.append(_preview("Bab", item["row"], title, instance, errors))

    # --- Materi
    materials = _index(team_materials(assignment))
    seen = {}
    for item in sheets["Materi"]:
        data, errors = item["data"], []
        title = data["title"]
        _duplicate(seen, title, errors, "Materi")
        seen.setdefault(normalize(title), item["row"])
        instance = _match(materials, title)
        if data["chapter"] and normalize(data["chapter"]) not in chapter_titles:
            errors.append(f"Bab '{data['chapter']}' tidak ada di lembar Bab maupun di kelas-mapel ini.")
        material_type = TYPE_FROM_TEXT.get(normalize(data["material_type"]))
        if material_type is None:
            errors.append("Tipe: isi video, link, atau pdf.")
        elif material_type == MaterialType.PDF and not (instance and instance.file):
            errors.append(
                "Materi PDF baru harus diunggah lewat tombol Tambah Materi. "
                "Ubah Tipe menjadi link/video, atau hapus baris ini."
            )
        values = {
            "teaching_assignment": assignment.id,
            "title": title,
            "description": data["description"],
            "material_type": material_type or data["material_type"],
            "url": "" if material_type == MaterialType.PDF else data["url"],
            "objectives": split_lines(data["objectives"]),
            "concepts": split_lines(data["concepts"]),
            "require_reflection": parse_bool(
                data["require_reflection"], "Wajib Refleksi", errors,
                instance.require_reflection if instance else True,
            ),
            "require_teacher_approval": parse_bool(
                data["require_teacher_approval"], "Disahkan Guru", errors,
                instance.require_teacher_approval if instance else False,
            ),
            "is_published": parse_bool(
                data["is_published"], "Terbit", errors, instance.is_published if instance else False
            ),
        }  # fmt: skip
        if instance:
            # Materi lama tetap di pengampu pembuatnya (rekan setim); kelas-mapelnya sama.
            values["teaching_assignment"] = instance.teaching_assignment_id
        serializer = MaterialSerializer(instance, data=values, context=context)
        if not errors and not serializer.is_valid():
            errors += first_errors(serializer.errors, MATERIAL_LABELS)
        plan["materials"].append({"instance": instance, "values": values, "chapter": data["chapter"]})
        preview.append(_preview("Materi", item["row"], title, instance, errors))

    # --- Tugas
    tasks = _index(team_tasks(assignment))
    seen = {}
    for item in sheets["Tugas"]:
        data, errors = item["data"], []
        title = data["title"]
        _duplicate(seen, title, errors, "Tugas")
        seen.setdefault(normalize(title), item["row"])
        instance = _match(tasks, title)
        due_at = parse_due(data["due_at"], errors)
        values = {
            "teaching_assignment": instance.teaching_assignment_id if instance else assignment.id,
            "title": title,
            "instructions": data["instructions"],
            "due_at": due_at.isoformat() if due_at else None,
            "max_score": data["max_score"] or (instance.max_score if instance else 100),
            "allow_late": parse_bool(
                data["allow_late"], "Terima Terlambat", errors, instance.allow_late if instance else True
            ),
            "is_published": parse_bool(
                data["is_published"], "Terbit", errors, instance.is_published if instance else False
            ),
        }
        serializer = TaskSerializer(instance, data=values, context=context)
        if not errors and not serializer.is_valid():
            errors += first_errors(serializer.errors, TASK_LABELS)
        plan["tasks"].append({"instance": instance, "values": values})
        preview.append(_preview("Tugas", item["row"], title, instance, errors))

    return preview, plan


def raise_empty():
    raise ValidationError({"file": "Tidak ada data di lembar Bab, Materi, maupun Tugas."})


MATERIAL_LABELS = {
    "title": "Judul Materi",
    "description": "Deskripsi",
    "material_type": "Tipe",
    "url": "URL",
    "file": "File",
    "objectives": "Capaian",
    "concepts": "Konsep Kunci",
}
TASK_LABELS = {
    "title": "Judul Tugas",
    "instructions": "Instruksi",
    "due_at": "Tenggat",
    "max_score": "Nilai Maks",
}


def _preview(sheet, row, title, instance, errors):
    return {
        "sheet": sheet,
        "row": row,
        "title": title,
        "action": "diperbarui" if instance else "baru",
        "errors": errors,
    }


def _apply_order(model, queryset, ordered_ids):
    """Urutan baru: data di file sesuai urutan baris, sisanya sesudahnya (urutan lamanya tetap)."""
    rest = [pk for pk in queryset.values_list("id", flat=True) if pk not in ordered_ids]
    for number, pk in enumerate([*ordered_ids, *rest], start=1):
        model.objects.filter(pk=pk).update(order=number)


@transaction.atomic
def save_plan(plan, assignment, request):
    """Simpan hasil check_plan_file (hanya dipanggil jika semua baris benar). Mengembalikan jumlah
    {created, updated}."""
    counts = {"created": 0, "updated": 0}
    context = {"request": request}

    def counted(instance):
        counts["updated" if instance else "created"] += 1

    # Bab dulu, karena materi menunjuk bab lewat judulnya.
    chapter_ids = []
    last = team_chapters(assignment).aggregate(last=Max("order"))["last"] or 0
    for step in plan["chapters"]:
        chapter = step["instance"] or Chapter(teaching_assignment=assignment, order=last + 1)
        counted(step["instance"])
        chapter.title = step["title"]
        chapter.description = step["description"]
        chapter.save()
        chapter_ids.append(chapter.id)
    if chapter_ids:
        _apply_order(Chapter, team_chapters(assignment), chapter_ids)
    chapters = _index(team_chapters(assignment))

    material_ids = []
    for step in plan["materials"]:
        serializer = MaterialSerializer(step["instance"], data=step["values"], context=context)
        serializer.is_valid(raise_exception=True)
        chapter = _match(chapters, step["chapter"]) if step["chapter"] else None
        extra = {"chapter": chapter}
        if step["instance"] is None:
            extra.update(created_by=request.user, order=0)
        material = serializer.save(**extra)
        counted(step["instance"])
        material_ids.append(material.id)
    if material_ids:
        _apply_order(Material, team_materials(assignment), material_ids)

    for step in plan["tasks"]:
        serializer = TaskSerializer(step["instance"], data=step["values"], context=context)
        serializer.is_valid(raise_exception=True)
        serializer.save(**({} if step["instance"] else {"created_by": request.user}))
        counted(step["instance"])
    return counts
