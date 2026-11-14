"""Impor jadwal pelajaran mingguan dari Excel (menu admin).

File Excel diubah menjadi data berbentuk sama dengan file JSON (lihat timetable_import.py), lalu
diimpor dengan aturan yang sama: mapel, kelas, guru, pengampu, dan jadwal dicari/dibuat di sekolah
aktif saja, dan impor dibatalkan seluruhnya jika ada satu masalah.

Lembar: Info, Slot Waktu, Jadwal, Guru, Mapel, Distribusi JP (opsional). Kelas tidak perlu
ditulis terpisah: diambil dari kolom Kelas, tingkatnya dari kata pertama nama kelas.
"""

import io
import os
import re
from datetime import date, datetime, time

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font
from rest_framework.exceptions import ValidationError

from apps.common.excel import HEADER_FILL, cell_text, normalize

from .timetable_import import DAYS, TimetableImportError

MAX_ROWS = 3000

INFO_FIELDS = [
    ("code", "Kode Jadwal"),
    ("year", "Tahun Ajaran"),
    ("semester", "Semester"),
    ("effective_from", "Berlaku Sejak"),
]

# (judul lembar, wajib ada, [(kunci, judul kolom, wajib diisi)])
SHEETS = [
    (
        "Slot Waktu",
        True,
        [
            ("day", "Hari", True),
            ("period", "Jam Ke", False),
            ("starts_at", "Mulai", True),
            ("ends_at", "Selesai", True),
            ("activity", "Kegiatan", False),
        ],
    ),
    (
        "Jadwal",
        True,
        [
            ("day", "Hari", True),
            ("period", "Jam Ke", True),
            ("classroom", "Kelas", True),
            ("subject", "Kode Mapel", True),
            ("teacher", "Kode Guru", True),
        ],
    ),
    ("Guru", True, [("code", "Kode Guru", True), ("name", "Nama", True)]),
    ("Mapel", True, [("code", "Kode", True), ("name", "Nama Mapel", True)]),
    (
        "Distribusi JP",
        False,
        [
            ("teacher", "Kode Guru", True),
            ("subject", "Kode Mapel", True),
            ("classroom", "Kelas", True),
            ("hours", "JP", True),
        ],
    ),
]

GUIDE = [
    "Template Impor Jadwal Pelajaran",
    "",
    "Isi setiap lembar mulai baris ke-2. Kolom bertanda * wajib diisi.",
    "Info: kode jadwal (unik per sekolah, mis. JDW-2026-1), tahun ajaran (2026/2027), semester (Ganjil/Genap),",
    "  dan tanggal berlaku (mis. 2026-07-13). Kode yang sama diimpor ulang = isi jadwal itu diganti;",
    "  kode baru = versi jadwal baru (versi lama tetap tersimpan). Jadwal yang diimpor menjadi jadwal aktif.",
    "Slot Waktu: semua baris waktu setiap hari (Senin, Selasa, ..., Sabtu, Ahad). Jam (07:30 atau 07.30).",
    "  Kegiatan kosong = jam pelajaran. Kegiatan diisi (Istirahat, Upacara, Sholat Dhuhur) = kegiatan bersama.",
    "Jadwal: satu baris = satu jam pelajaran satu kelas. Hari + Jam Ke harus ada di lembar Slot Waktu.",
    "  Kelas ditulis dengan tingkat di depan (mis. X RPL 1). Kelas yang belum ada dibuat otomatis.",
    "  Satu guru boleh di beberapa kelas pada jam yang sama hanya jika mapelnya sama (kelas gabungan).",
    "Guru: kode guru dan nama. Guru dicocokkan lewat kode guru, lalu lewat nama; yang belum ada dibuatkan akun",
    "  (password awal ditampilkan satu kali setelah impor).",
    "Mapel: kode dan nama mapel. Mapel dicocokkan lewat kode + nama.",
    "Distribusi JP (opsional): JP resmi per minggu untuk setiap guru-mapel-kelas.",
    "",
    "Tekan Periksa dulu di aplikasi: belum ada data yang disimpan sampai Anda menekan Impor.",
]


def example_rows(grade):
    """Contoh isian (dipakai di lembar Petunjuk dan diuji agar selalu lolos impor)."""
    return {
        "Info": [("JDW-CONTOH", "2026/2027", "Ganjil", "2026-07-13")],
        "Slot Waktu": [
            ("Senin", "1", "07:00", "07:45", ""),
            ("Senin", "2", "07:45", "08:30", ""),
            ("Senin", "", "08:30", "08:45", "Istirahat"),
            ("Senin", "3", "08:45", "09:30", ""),
        ],
        "Jadwal": [
            ("Senin", "1", f"{grade} A", "MTK", "G01"),
            ("Senin", "2", f"{grade} A", "MTK", "G01"),
            ("Senin", "3", f"{grade} A", "BIND", "G02"),
            ("Senin", "1", f"{grade} B", "BIND", "G02"),
            ("Senin", "2", f"{grade} B", "BIND", "G02"),
        ],
        "Guru": [("G01", "Guru Contoh Satu, S.Pd."), ("G02", "Guru Contoh Dua, S.Pd.")],
        "Mapel": [("MTK", "Matematika Contoh"), ("BIND", "Bahasa Indonesia Contoh")],
        "Distribusi JP": [
            ("G01", "MTK", f"{grade} A", "2"),
            ("G02", "BIND", f"{grade} A", "1"),
            ("G02", "BIND", f"{grade} B", "2"),
        ],
    }


def _style_header(sheet, widths):
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal="center")
    for index, width in enumerate(widths):
        sheet.column_dimensions[chr(ord("A") + index)].width = width
    sheet.freeze_panes = "A2"


def build_template(school, with_examples=False):
    """Template kosong (atau berisi contoh, untuk test). Contoh selalu tampil di lembar Petunjuk."""
    grade = school.grades[0]
    examples = example_rows(grade)
    workbook = Workbook()
    guide = workbook.active
    guide.title = "Petunjuk"
    for line in GUIDE:
        guide.append([line])
    guide["A1"].font = Font(bold=True, size=13)
    guide.append([])
    guide.append(["Contoh isian:"])
    guide.cell(row=guide.max_row, column=1).font = Font(bold=True)
    for title, _required, columns in [
        ("Info", True, [(k, label, True) for k, label in INFO_FIELDS])
    ] + SHEETS:
        guide.append([])
        guide.append([f"Lembar {title}"])
        guide.cell(row=guide.max_row, column=1).font = Font(bold=True)
        guide.append([label for _key, label, _ in columns])
        for row in examples[title]:
            guide.append(list(row))
    guide.column_dimensions["A"].width = 24

    info = workbook.create_sheet("Info")
    info.append(["Isian", "Nilai"])
    for (key, label), value in zip(INFO_FIELDS, examples["Info"][0]):
        info.append([f"{label}*", value if with_examples else ""])
    _style_header(info, [20, 24])
    for row in range(2, len(INFO_FIELDS) + 2):
        info.cell(row=row, column=2).number_format = "@"

    for title, required, columns in SHEETS:
        sheet = workbook.create_sheet(title)
        sheet.append([f"{label}*" if mandatory else label for _key, label, mandatory in columns])
        _style_header(sheet, [16 if key != "name" else 36 for key, _label, _ in columns])
        for column in range(1, len(columns) + 1):
            for row in range(2, 202):
                sheet.cell(row=row, column=column).number_format = "@"  # kode & jam tidak diubah Excel
        if with_examples:
            for row, values in enumerate(examples[title], start=2):
                for column, value in enumerate(values, start=1):
                    sheet.cell(row=row, column=column, value=value)

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


# ------------------------------------------------------------------------------- membaca file


def _open(file):
    if file is None:
        raise ValidationError({"file": "Pilih file Excel yang akan diimpor."})
    if os.path.splitext(file.name)[1].lower() != ".xlsx":
        raise ValidationError(
            {"file": "Gunakan file Excel berformat .xlsx (unduh template yang disediakan)."}
        )
    try:
        return load_workbook(file, read_only=True, data_only=True)
    except Exception:
        raise ValidationError({"file": "File tidak bisa dibaca. Pastikan file Excel .xlsx yang valid."})


def _sheet_rows(workbook, title, columns, required):
    """[(nomor baris, {kunci: nilai mentah})]. Lembar opsional yang tidak ada = daftar kosong."""
    if title not in workbook.sheetnames:
        if required:
            raise TimetableImportError(
                [f"Lembar '{title}' tidak ditemukan. Gunakan template yang disediakan."]
            )
        return []
    rows = workbook[title].iter_rows(values_only=True)
    header = [normalize(cell_text(value).replace("*", "")) for value in next(rows, None) or ()]
    positions = {}
    for key, label, _ in columns:
        if normalize(label) in header:
            positions[key] = header.index(normalize(label))
    missing = [label for key, label, mandatory in columns if mandatory and key not in positions]
    if missing:
        raise TimetableImportError([f"Lembar '{title}': kolom {', '.join(missing)} tidak ditemukan."])
    result = []
    for number, values in enumerate(rows, start=2):
        data = {key: values[index] if index < len(values) else None for key, index in positions.items()}
        if not any(cell_text(value) for value in data.values()):
            continue
        result.append((number, data))
        if len(result) > MAX_ROWS:
            raise TimetableImportError([f"Lembar '{title}': maksimal {MAX_ROWS} baris."])
    return result


def parse_clock(value):
    """time, datetime, '07:30', '07.30', atau '7.30' -> '07:30'. None jika tidak sah."""
    if isinstance(value, datetime):
        value = value.time()
    if isinstance(value, time):
        return f"{value.hour:02d}:{value.minute:02d}"
    match = re.fullmatch(r"(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?", cell_text(value))
    if not match or int(match[1]) > 23 or int(match[2]) > 59:
        return None
    return f"{int(match[1]):02d}:{match[2]}"


def parse_date(value):
    """date/datetime, '2026-07-13', atau '13/07/2026' / '13-07-2026' -> date. None jika tidak sah."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = cell_text(value).split(" ")[0]
    for pattern in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(text, pattern).date()
        except ValueError:
            continue
    return None


def parse_day(value):
    """Nama hari dengan huruf besar di depan ('senin' -> 'Senin'); None jika tidak dikenal."""
    text = cell_text(value).lower()
    return text.capitalize() if text in DAYS else None


def _read_info(workbook, errors):
    if "Info" not in workbook.sheetnames:
        raise TimetableImportError(["Lembar 'Info' tidak ditemukan. Gunakan template yang disediakan."])
    values = {}
    for row in workbook["Info"].iter_rows(min_row=2, values_only=True):
        if row and row[0] is not None:
            values[normalize(cell_text(row[0]).replace("*", ""))] = row[1] if len(row) > 1 else None
    info = {key: values.get(normalize(label)) for key, label in INFO_FIELDS}
    for key, label in INFO_FIELDS:
        if not cell_text(info[key]):
            errors.append(f"Info: {label} wajib diisi.")
    year = cell_text(info["year"])
    if year and not re.fullmatch(r"\d{4}/\d{4}", year):
        errors.append("Info: Tahun Ajaran ditulis seperti 2026/2027.")
    semester = cell_text(info["semester"]).lower()
    if semester and semester not in ("ganjil", "genap"):
        errors.append("Info: Semester diisi Ganjil atau Genap.")
    effective = parse_date(info["effective_from"])
    if cell_text(info["effective_from"]) and effective is None:
        errors.append("Info: Berlaku Sejak ditulis seperti 2026-07-13.")
    return {
        "kode_jadwal": cell_text(info["code"]),
        "tahun_pelajaran": year,
        "semester": semester.capitalize(),
        "berlaku_sejak": effective.isoformat() if effective else "",
    }


def _classroom(name, errors, where):
    """Nama kelas dirapikan; tingkat = kata pertama. None jika nama tidak berisi tingkat + rombel."""
    name = " ".join(name.split())
    parts = re.split(r"[-\s]+", name)
    if len(parts) < 2:
        errors.append(f"{where}: nama kelas '{name}' harus berisi tingkat dan jurusan/rombel, mis. X RPL 1.")
        return None
    return {"nama": name, "tingkat": parts[0].upper()}


def read_workbook(file):
    """Ubah file Excel menjadi data impor (bentuk sama dengan file JSON)."""
    workbook = _open(file)
    errors = []
    try:
        meta = _read_info(workbook, errors)
        sheets = {
            title: _sheet_rows(workbook, title, columns, required) for title, required, columns in SHEETS
        }
    finally:
        workbook.close()

    def required(title, number, row, columns):
        for key, label, mandatory in columns:
            if mandatory and not cell_text(row.get(key)):
                errors.append(f"{title} baris {number}: {label} wajib diisi.")
                return False
        return True

    columns = {title: cols for title, _req, cols in SHEETS}

    slots, lesson_slots = [], {}
    for number, row in sheets["Slot Waktu"]:
        where = f"Slot Waktu baris {number}"
        if not required("Slot Waktu", number, row, columns["Slot Waktu"]):
            continue
        day, start, end = parse_day(row["day"]), parse_clock(row["starts_at"]), parse_clock(row["ends_at"])
        period = cell_text(row.get("period"))
        activity = cell_text(row.get("activity"))
        if day is None:
            errors.append(f"{where}: hari '{cell_text(row['day'])}' tidak dikenal.")
        if start is None or end is None:
            errors.append(f"{where}: jam ditulis seperti 07:30.")
        elif end <= start:
            errors.append(f"{where}: jam selesai harus setelah jam mulai.")
        if period and not period.isdigit():
            errors.append(f"{where}: Jam Ke harus berupa angka.")
        if not activity and not period:
            errors.append(f"{where}: isi Jam Ke untuk jam pelajaran, atau Kegiatan untuk kegiatan bersama.")
        if None in (day, start, end) or (period and not period.isdigit()):
            continue
        if any(s["hari"] == day and s["mulai"] == start for s in slots):
            errors.append(f"{where}: {day} jam {start} ditulis dua kali.")
            continue
        slots.append(
            {"hari": day, "jam_ke": period or "-", "mulai": start, "selesai": end,
             "jenis": "NON_KBM" if activity else "KBM", "kegiatan": activity or None}
        )  # fmt: skip
        if not activity:
            if (day, period) in lesson_slots:
                errors.append(f"{where}: {day} jam ke-{period} ditulis dua kali.")
            lesson_slots[(day, period)] = slots[-1]

    classrooms = {}
    schedule = []
    for number, row in sheets["Jadwal"]:
        where = f"Jadwal baris {number}"
        if not required("Jadwal", number, row, columns["Jadwal"]):
            continue
        day, period = parse_day(row["day"]), cell_text(row["period"])
        slot = lesson_slots.get((day, period))
        if slot is None:
            errors.append(f"{where}: {cell_text(row['day'])} jam ke-{period} tidak ada di lembar Slot Waktu.")
            continue
        classroom = _classroom(cell_text(row["classroom"]), errors, where)
        if classroom is None:
            continue
        classrooms.setdefault(classroom["nama"], classroom)
        schedule.append(
            {"hari": day, "jam_ke": period, "mulai": slot["mulai"], "selesai": slot["selesai"],
             "kelas": classroom["nama"], "kode_mapel": cell_text(row["subject"]).upper(),
             "kode_guru": cell_text(row["teacher"]).upper()}
        )  # fmt: skip

    distribution = []
    for number, row in sheets["Distribusi JP"]:
        where = f"Distribusi JP baris {number}"
        if not required("Distribusi JP", number, row, columns["Distribusi JP"]):
            continue
        hours = cell_text(row["hours"])
        if not hours.isdigit():
            errors.append(f"{where}: JP harus berupa angka.")
            continue
        classroom = _classroom(cell_text(row["classroom"]), errors, where)
        if classroom is None:
            continue
        classrooms.setdefault(classroom["nama"], classroom)
        distribution.append(
            {"kode_guru": cell_text(row["teacher"]).upper(), "kode_mapel": cell_text(row["subject"]).upper(),
             "kelas": classroom["nama"], "jp": int(hours)}
        )  # fmt: skip

    def code_list(title, label):
        items, seen = [], set()
        for number, row in sheets[title]:
            if not required(title, number, row, columns[title]):
                continue
            code = cell_text(row["code"]).upper()
            if code in seen:
                errors.append(f"{title} baris {number}: {label} {code} ditulis dua kali.")
                continue
            seen.add(code)
            items.append({"kode": code, "nama": " ".join(cell_text(row["name"]).split())})
        return items

    teachers = code_list("Guru", "kode guru")
    subjects = code_list("Mapel", "kode mapel")
    known_subjects = {item["kode"] for item in subjects}
    for row in schedule + distribution:
        if row["kode_mapel"] not in known_subjects:
            errors.append(f"Kode mapel {row['kode_mapel']} belum ada di lembar Mapel.")
            known_subjects.add(row["kode_mapel"])  # cukup dilaporkan sekali
    if not schedule and not errors:
        errors.append("Lembar 'Jadwal' masih kosong.")
    if errors:
        raise TimetableImportError(errors)
    return {
        "meta": meta,
        "kelas": list(classrooms.values()),
        "guru": teachers,
        "mapel": subjects,
        "slot_waktu": slots,
        "jadwal": schedule,
        "distribusi_jp": distribution,
    }
