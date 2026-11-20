"""Impor & template Excel/CSV media.

Template berisi isi draf yang ada (atau contoh jika masih kosong), jadi guru bisa: unduh -> ubah di Excel ->
impor dengan mode "Ganti". Kolom Id dipakai agar progres siswa tetap terikat ke stasiun/langkah yang sama.

Lembar:
- Stasiun   : satu baris per stasiun (Bagian, Stasiun, tujuan, durasi, ...).
- Langkah   : satu baris per langkah, dirujuk lewat judul stasiun.
- Glosarium : Istilah, Arti.
CSV = isi lembar Langkah (+ kolom Bagian opsional); stasiun dibuat dari judul stasiun.
"""

import csv
import io
import re

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from rest_framework.exceptions import ValidationError

from apps.common.excel import Column, fill_data_sheet, open_workbook, sheet_rows

from .. import schema
from .. import steps as step_kinds
from ..steps import ID_RE, StepError
from . import ImportResult, new_station

STATION_SHEET, STEP_SHEET, GLOSSARY_SHEET = "Stasiun", "Langkah", "Glosarium"
MAX_STEP_ROWS = 2000
MAX_CSV_BYTES = 3 * 1024 * 1024
LETTERS = "ABCDEF"

KIND_NAMES = [
    ("teks", "text"),
    ("tahukah kamu", "did_you_know"),
    ("dialog", "dialog"),
    ("video", "video"),
    ("tautan", "link"),
    ("kartu bolak-balik", "flip_cards"),
    ("flashcard", "flashcards"),
    ("contoh langkah", "worked_example"),
    ("pg", "choice"),
    ("benar salah", "true_false"),
    ("urutkan", "ordering"),
    ("kelompokkan", "categorize"),
    ("isian", "fill_blank"),
    ("seret", "drag_drop"),
    ("jodohkan", "matching"),
]
EXCEL_KINDS = {kind: name for name, kind in KIND_NAMES}
# Jenis yang hanya bisa dibuat di Studio (butuh gambar/koordinat, plugin): di Excel hanya bisa diubah
# judul, teks, pembahasan, dan petunjuknya (langkah lama dicari lewat Id Langkah).
STUDIO_ONLY_NAMES = {"hotspot": "ketuk gambar"}
KIND_ALIASES = {
    **{name: kind for name, kind in KIND_NAMES},
    "pilihan ganda": "choice",
    "benar/salah": "true_false",
    "b/s": "true_false",
    "teks & gambar": "text",
    "kartu": "flip_cards",
    "contoh": "worked_example",
    "tarik & lepas": "drag_drop",
    "pasangkan": "matching",
    "link": "link",
    "ketuk gambar": "hotspot",
}
LIST_NAMES = {"": "steps", "utama": "steps", "belajar ulang": "remedial", "tantangan": "challenge"}
LIST_LABELS = {"steps": "Utama", "remedial": "Belajar ulang", "challenge": "Tantangan"}
MOODS = {"senang": "happy", "berpikir": "think", "ups": "oops", "wow": "wow"}
MOOD_NAMES = {value: name for name, value in MOODS.items()}
SPEAKERS = {
    "siswa": "student",
    "kamu": "student",
    "murid": "student",
    "narator": "narrator",
    "narasi": "narrator",
}

STATION_COLUMNS = [
    Column("part", "Bagian", True, 24),
    Column("part_description", "Deskripsi Bagian", width=30),
    Column("title", "Stasiun", True, 30),
    Column("objectives", "Tujuan (satu per baris)", width=36),
    Column("minutes", "Durasi (menit)", width=12),
    Column("optional", "Opsional", width=10, choices=["tidak", "ya"]),
    Column("prerequisites", "Prasyarat (judul stasiun, satu per baris)", width=30),
    Column("badge", "Lencana", width=20),
    Column("summary", "Ringkasan (satu per baris)", width=36),
    Column("reflection", "Pertanyaan Refleksi", width=30),
    Column("part_id", "Id Bagian", width=12, text=True),
    Column("id", "Id Stasiun", width=12, text=True),
]
STEP_COLUMNS = [
    Column("station", "Stasiun", True, 26),
    Column("list", "Daftar", width=13, choices=list(LIST_LABELS.values())),
    Column("kind", "Jenis", True, 16, choices=[name for name, _ in KIND_NAMES] + ["ketuk gambar"]),
    Column("title", "Judul", width=22),
    Column("text", "Teks", width=44),
    Column("items", "Butir (satu per baris)", width=36),
    *[Column(f"choice_{letter}", f"Pilihan {letter}", width=18) for letter in LETTERS],
    Column("key", "Kunci", width=10),
    Column("feedback", "Umpan Balik Salah", width=30),
    Column("explanation", "Pembahasan", width=30),
    Column("hints", "Petunjuk (satu per baris)", width=28),
    Column("media", "Gambar / Tautan", width=26),
    Column("id", "Id Langkah", width=12, text=True),
]
CSV_COLUMNS = [Column("part", "Bagian"), *STEP_COLUMNS]
GLOSSARY_COLUMNS = [Column("term", "Istilah", True, 24), Column("meaning", "Arti", True, 60)]

GUIDE = [
    "Template Media Pembelajaran Interaktif",
    "",
    "Lembar 'Stasiun': satu baris per stasiun. Kolom Bagian mengelompokkan stasiun (judul sama = bagian sama).",
    "Lembar 'Langkah': satu baris per langkah, urut dari atas. Kolom Stasiun = judul stasiun di lembar Stasiun.",
    "Lembar 'Glosarium': istilah & artinya (opsional).",
    "Kolom Id: JANGAN diubah. Id menjaga progres siswa tetap tersimpan saat media diimpor ulang. "
    "Baris baru: kosongkan Id.",
    "Kolom 'satu per baris': tekan Alt+Enter di dalam sel untuk pindah baris.",
    "",
    "Cara mengisi tiap Jenis langkah:",
    "teks / tahukah kamu : Teks = isi (boleh **tebal**, *miring*, rumus $...$). Gambar / Tautan = alamat gambar.",
    "dialog : Butir = 'Nama: kalimat' per baris. Nama 'Siswa' = siswa, 'Narator' = narator, lainnya = maskot. "
    "Ekspresi opsional: 'Bita (senang): ...' (senang/berpikir/ups/wow). {nama_panggilan} = nama siswa.",
    "video : Gambar / Tautan = link YouTube/Drive. Teks = keterangan. Kunci = detik mulai (opsional).",
    "tautan : Gambar / Tautan = alamat halaman (https://). Teks = keterangan.",
    "kartu bolak-balik / flashcard : Butir = 'depan = belakang' per baris.",
    "contoh langkah : Teks = soal contoh. Butir = 'langkah || penjelasan' per baris (penjelasan opsional).",
    "pg : Teks = pertanyaan, Pilihan A-F, Kunci = huruf (mis. B). Umpan Balik Salah = 'C: alasan' per baris.",
    "benar salah : Teks = pernyataan, Kunci = B atau S. Umpan Balik Salah = alasan jika siswa salah menjawab.",
    "urutkan : Butir = langkah-langkah dalam urutan BENAR (akan diacak untuk siswa).",
    "kelompokkan : Butir = 'butir = nama wadah' per baris (2-4 wadah). Umpan Balik Salah = 'nomor butir: alasan'.",
    "isian : Teks = kalimat dengan jawaban di [[...]], mis. 'Simbol input berbentuk [[jajaran genjang]]'. "
    "Jawaban lain yang benar: [[jawaban|alternatif]]. Paragraf pertama tanpa [[...]] = perintah soal (opsional).",
    "seret : seperti isian; Butir = pilihan pengecoh.",
    "jodohkan : Butir = 'kiri = kanan' per baris; pengecoh ditulis '= teks'.",
    "ketuk gambar : dibuat di Studio (butuh gambar & area); di sini hanya judul/teks/pembahasan yang bisa diubah.",
    "",
    "Semua latihan boleh diberi Pembahasan dan Petunjuk (maks. 3, satu per baris; dibuka bertahap oleh siswa).",
    "Daftar: Utama (wajib), Belajar ulang (untuk siswa yang kesulitan), Tantangan (untuk siswa yang cepat).",
]


# ---------------------------------------------------------------- alat bantu teks


def lines(value):
    return [line.strip() for line in str(value or "").splitlines() if line.strip()]


def split_pair(line, separator="="):
    """'kiri = kanan' -> ('kiri', 'kanan'). Spasi di sekitar pemisah diutamakan agar 'x=5' tetap utuh."""
    spaced = f" {separator} "
    if spaced in line:
        left, _, right = line.partition(spaced)
    elif line.startswith(separator):
        left, right = "", line[len(separator) :]
    else:
        left, sep, right = line.partition(separator)
        if not sep:
            return line.strip(), None
    return left.strip(), right.strip()


def labelled(feedback):
    """'B: alasan' per baris -> {'B': 'alasan'} (label huruf/angka sebelum titik dua)."""
    result = {}
    for line in lines(feedback):
        match = re.match(r"^\s*([A-Za-z]|\d{1,2})\s*[:.)]\s*(.+)$", line)
        if match:
            result[match.group(1).upper()] = match.group(2).strip()
    return result


def parse_bool(value):
    value = str(value or "").strip().casefold()
    if value in ("b", "benar", "true", "ya", "1"):
        return True
    if value in ("s", "salah", "false", "tidak", "0"):
        return False
    return None


def split_template(value):
    """Teks isian/seret -> (perintah soal, kalimat [[...]])."""
    paragraphs = re.split(r"\n\s*\n", str(value or "").strip())
    for index, paragraph in enumerate(paragraphs):
        if "[[" in paragraph:
            return "\n\n".join(paragraphs[:index]).strip(), "\n\n".join(paragraphs[index:]).strip()
    return "", str(value or "").strip()


def dialog_line(line):
    name, separator, said = line.partition(":")
    if not separator or len(name) > 40:
        return {"speaker": "mascot", "mood": "", "text": line.strip()}
    mood = ""
    match = re.match(r"^(.*?)\s*\((\w+)\)\s*$", name)
    if match and match.group(2).casefold() in MOODS:
        name, mood = match.group(1), MOODS[match.group(2).casefold()]
    speaker = SPEAKERS.get(name.strip().casefold(), "mascot")
    return {"speaker": speaker, "mood": mood, "text": said.strip()}


# ---------------------------------------------------------------- baris -> langkah


def build_step(kind, data, base):
    """Satu baris lembar Langkah -> rancangan langkah. `base` = langkah lama ber-Id sama (field yang tidak
    ada di Excel, mis. gambar pilihan atau ekspresi, tetap dipertahankan)."""
    step = dict(base) if base and base.get("kind") == kind else {}
    step.update(kind=kind, title=data["title"], hints=lines(data["hints"]))
    body, media, items, feedback = data["text"], data["media"], lines(data["items"]), data["feedback"]
    graded = step_kinds.KINDS[kind].graded
    if graded:
        step["explanation"] = data["explanation"]

    if kind in ("text", "did_you_know"):
        step.update(body=body, image=media)
    elif kind == "dialog":
        step.update(lines=[dialog_line(line) for line in (items or lines(body))], image=media)
    elif kind == "video":
        start = data["key"].strip()
        step.update(url=media, body=body, start=int(start) if start.isdigit() else step.get("start", 0))
    elif kind == "link":
        step.update(url=media, body=body)
    elif kind in ("flip_cards", "flashcards"):
        cards = []
        for line in items or lines(body):
            # "depan = belakang || gambar" (gambar opsional: asset:<id> atau https://...)
            line, _, image = line.partition(" || ")
            front, back = split_pair(line)
            cards.append({"front": front, "back": back or "", "image": image.strip()})
        step["cards"] = cards
    elif kind == "worked_example":
        parts = []
        for line in items:
            text, _, explain = line.partition("||")
            parts.append({"text": text.strip(), "explain": explain.strip()})
        step.update(body=body, steps=parts)
    elif kind == "choice":
        raw = [data[f"choice_{letter}"] for letter in LETTERS]
        while raw and not raw[-1].strip():
            raw.pop()
        why = labelled(feedback)
        choices, starred = [], []
        for index, choice in enumerate(raw):
            choice = choice.strip()
            if choice.startswith("*"):
                starred.append(index)
                choice = choice[1:].strip()
            choices.append({"text": choice, "why": why.get(LETTERS[index], "")})
        key = data["key"].strip().upper()
        correct = (
            LETTERS.index(key) if len(key) == 1 and key in LETTERS else (starred[0] if starred else None)
        )
        if correct is None or correct >= len(choices):
            raise StepError(
                f"Kunci '{data['key']}' tidak cocok dengan pilihan yang ada (tulis huruf, mis. B)."
            )
        step.update(text=body, image=media, choices=choices, correct=correct)
    elif kind == "true_false":
        answer = parse_bool(data["key"])
        if answer is None:
            raise StepError("Kunci benar salah harus B (benar) atau S (salah).")
        wrong = "why_false" if answer else "why_true"
        right = "why_true" if answer else "why_false"
        step.update(text=body, image=media, answer=answer, **{wrong: feedback.strip()})
        step.setdefault(right, "")
    elif kind == "ordering":
        step.update(text=body, image=media, items=items, why=feedback.strip())
    elif kind == "categorize":
        categories, result = [], []
        why = labelled(feedback)
        for number_, line in enumerate(items, start=1):
            item, category = split_pair(line)
            if not category:
                raise StepError(f"Butir {number_} harus ditulis 'butir = nama wadah'.")
            if category.casefold() not in [c.casefold() for c in categories]:
                categories.append(category)
            index = [c.casefold() for c in categories].index(category.casefold())
            result.append({"text": item, "category": index, "why": why.get(str(number_), "")})
        step.update(text=body, image=media, categories=categories, items=result)
    elif kind in ("fill_blank", "drag_drop"):
        question, template = split_template(body)
        step.update(text=question, image=media, template=template, why=feedback.strip())
        if kind == "fill_blank":
            step.setdefault("case_sensitive", False)
        else:
            step["distractors"] = items
    elif kind == "matching":
        pairs, distractors = [], []
        for line in items:
            left, right = split_pair(line)
            if right is None:
                raise StepError(f"Butir '{line}' harus ditulis 'kiri = kanan' (pengecoh: '= teks').")
            if left:
                pairs.append({"left": left, "right": right})
            else:
                distractors.append(right)
        step.update(text=body, image=media, pairs=pairs, distractors=distractors, why=feedback.strip())
    else:
        # Jenis khusus Studio: hanya teks umum yang bisa diubah dari Excel.
        if not base or base.get("kind") != kind:
            name = STUDIO_ONLY_NAMES.get(kind, kind)
            raise StepError(
                f"Langkah '{name}' hanya bisa dibuat di Studio. Baris ini harus ber-Id langkah lama."
            )
        if "text" in base:
            step["text"] = body
    step_kinds.text_list(step["hints"], "Petunjuk", 0, step_kinds.MAX_HINTS, 1000)
    step_kinds.text(step["title"], "Judul langkah", 200)
    step_kinds.KINDS[kind].validate(step)
    return step


def kind_of(value):
    name = " ".join(str(value or "").split()).casefold()
    if name in KIND_ALIASES:
        return KIND_ALIASES[name]
    for kind, instance in step_kinds.KINDS.items():  # jenis plugin: nama atau labelnya
        if name in (kind.casefold(), instance.label.casefold()):
            return kind
    return None


def existing_items(draft):
    """{id: item} untuk stasiun & langkah draf lama."""
    stations, steps = {}, {}
    for station in schema.iter_stations(draft or {}):
        stations[station.get("id")] = station
        for _, step in schema.iter_steps(station):
            steps[step.get("id")] = step
    return stations, steps


def valid_id(value):
    value = str(value or "").strip()
    return value if ID_RE.match(value) else ""


# ---------------------------------------------------------------- baca file


def _stations_from_rows(rows, result, old_stations):
    parts, by_title = {}, {}
    for row in rows:
        data, where = row["data"], f"Lembar Stasiun baris {row['row']}"
        part_key = data["part"].strip().casefold()
        if part_key not in parts:
            parts[part_key] = {
                "id": valid_id(data["part_id"]),
                "title": data["part"].strip(),
                "description": data["part_description"].strip(),
                "stations": [],
            }
        part = parts[part_key]
        if not part["description"] and data["part_description"].strip():
            part["description"] = data["part_description"].strip()
        title_key = data["title"].strip().casefold()
        if title_key in by_title:
            result.errors.append(f"{where}: judul stasiun '{data['title']}' dipakai dua kali.")
            continue
        station_id = valid_id(data["id"])
        base = old_stations.get(station_id) or {}
        station = new_station(data["title"].strip())
        station.update(
            id=station_id,
            objectives=lines(data["objectives"]),
            summary=lines(data["summary"]),
            reflection=data["reflection"].strip(),
            optional=parse_bool(data["optional"]) is True,
        )
        minutes = data["minutes"].strip()
        if minutes:
            if not minutes.isdigit():
                result.errors.append(f"{where}: Durasi harus angka menit.")
            else:
                station["minutes"] = int(minutes)
        if data["badge"].strip():
            icon = (base.get("badge") or {}).get("icon") or "award"
            station["badge"] = {"title": data["badge"].strip(), "icon": icon}
        prerequisites = []
        for title in lines(data["prerequisites"]):
            required = by_title.get(title.casefold())
            if required is None:
                result.errors.append(f"{where}: prasyarat '{title}' harus judul stasiun di baris sebelumnya.")
            else:
                prerequisites.append(required)
        station["_prerequisites"] = prerequisites
        by_title[title_key] = station
        part["stations"].append(station)
    return list(parts.values()), by_title


def _resolve_prerequisites(parts):
    """Prasyarat ditulis sebagai judul -> id stasiun (id kosong dibuatkan dulu)."""
    for part in parts:
        for station in part["stations"]:
            if not station["id"]:
                station["id"] = step_kinds.new_id()
    for part in parts:
        for station in part["stations"]:
            station["prerequisites"] = [s["id"] for s in station.pop("_prerequisites", [])]


def build_result(station_rows, step_rows, glossary_rows, draft, from_csv=False):
    result = ImportResult()
    old_stations, old_steps = existing_items(draft)
    parts, by_title = _stations_from_rows(station_rows, result, old_stations)

    for row in step_rows:
        data, where = row["data"], f"Lembar Langkah baris {row['row']}"
        if from_csv:
            where = f"Baris {row['row']}"
        title_key = data["station"].strip().casefold()
        station = by_title.get(title_key)
        if station is None:
            part_title = data.get("part", "").strip() if from_csv else ""
            part = next(
                (p for p in parts if part_title and p["title"].casefold() == part_title.casefold()), None
            )
            if part is None:
                if part_title or not parts:
                    part = {"id": "", "title": part_title or "Bagian 1", "description": "", "stations": []}
                    parts.append(part)
                else:
                    part = parts[-1]
            station = new_station(data["station"].strip())
            station["_prerequisites"] = []
            part["stations"].append(station)
            by_title[title_key] = station
            if not from_csv:
                result.warnings.append(
                    f"{where}: stasiun '{data['station']}' tidak ada di lembar Stasiun, dibuat otomatis."
                )
        list_name = LIST_NAMES.get(data["list"].strip().casefold())
        kind = kind_of(data["kind"])
        if list_name is None:
            result.errors.append(f"{where}: Daftar harus Utama, Belajar ulang, atau Tantangan.")
            continue
        if kind is None:
            result.errors.append(f"{where}: jenis '{data['kind']}' tidak dikenal.")
            continue
        step_id = valid_id(data["id"])
        try:
            step = build_step(kind, data, old_steps.get(step_id))
        except StepError as error:
            result.errors.append(f"{where}: {error}")
            continue
        step["id"] = step_id
        station[list_name].append(step)

    _resolve_prerequisites(parts)
    result.parts = parts
    if glossary_rows is not None:
        result.glossary = [
            {"term": row["data"]["term"].strip(), "meaning": row["data"]["meaning"].strip()}
            for row in glossary_rows
        ]
    if not any(station["steps"] for part in parts for station in part["stations"]) and not result.errors:
        result.errors.append("File belum berisi langkah. Isi lembar Langkah (satu baris per langkah).")
    return result


def read_excel(file, draft):
    workbook = open_workbook(file)
    names = {name.casefold(): name for name in workbook.sheetnames}
    if STEP_SHEET.casefold() not in names:
        raise ValidationError({"file": "Lembar 'Langkah' tidak ditemukan. Gunakan template media."})
    station_rows = []
    if STATION_SHEET.casefold() in names:
        station_rows = sheet_rows(
            workbook[names[STATION_SHEET.casefold()]], STATION_COLUMNS, schema.MAX_STATIONS
        )
    step_rows = sheet_rows(workbook[names[STEP_SHEET.casefold()]], STEP_COLUMNS, MAX_STEP_ROWS)
    glossary_rows = None
    if GLOSSARY_SHEET.casefold() in names:
        glossary_rows = sheet_rows(
            workbook[names[GLOSSARY_SHEET.casefold()]], GLOSSARY_COLUMNS, schema.MAX_GLOSSARY
        )
    workbook.close()
    return build_result(station_rows, step_rows, glossary_rows, draft)


class _CsvSheet:
    """Pembungkus agar baris CSV bisa dibaca `sheet_rows` (sama dengan lembar Excel)."""

    title = "CSV"

    def __init__(self, rows):
        self.rows = rows

    def iter_rows(self, values_only=True):
        return iter(self.rows)


def read_csv(file, draft):
    raw = file.read()
    if len(raw) > MAX_CSV_BYTES:
        raise ValidationError({"file": "File CSV maksimal 3 MB."})
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        content = raw.decode("cp1252", errors="replace")
    first_line = content.split("\n", 1)[0]
    delimiter = max([";", ",", "\t"], key=first_line.count)
    try:
        rows = list(csv.reader(io.StringIO(content), delimiter=delimiter))
    except csv.Error:
        raise ValidationError({"file": "File CSV tidak bisa dibaca."})
    step_rows = sheet_rows(_CsvSheet(rows), CSV_COLUMNS, MAX_STEP_ROWS)
    return build_result([], step_rows, None, draft, from_csv=True)


# ---------------------------------------------------------------- draf -> baris (template)


def step_row(step, station_title, list_name, mascot_name):
    kind = step.get("kind", "")
    row = {column.key: "" for column in STEP_COLUMNS}
    row.update(
        station=station_title,
        list=LIST_LABELS[list_name],
        kind=EXCEL_KINDS.get(kind) or STUDIO_ONLY_NAMES.get(kind) or kind,
        title=step.get("title", ""),
        hints="\n".join(step.get("hints") or []),
        explanation=step.get("explanation", ""),
        id=step.get("id", ""),
    )
    if kind in ("text", "did_you_know"):
        row.update(text=step.get("body", ""), media=step.get("image", ""))
    elif kind == "dialog":
        names = {"student": "Siswa", "narrator": "Narator"}
        out = []
        for line in step.get("lines") or []:
            name = names.get(line.get("speaker")) or mascot_name or "Maskot"
            if line.get("mood") in MOOD_NAMES:
                name += f" ({MOOD_NAMES[line['mood']]})"
            out.append(f"{name}: {line.get('text', '')}")
        row.update(items="\n".join(out), media=step.get("image", ""))
    elif kind == "video":
        row.update(media=step.get("url", ""), text=step.get("body", ""), key=str(step.get("start") or ""))
    elif kind == "link":
        row.update(media=step.get("url", ""), text=step.get("body", ""))
    elif kind in ("flip_cards", "flashcards"):
        row["items"] = "\n".join(
            f"{c.get('front', '')} = {c.get('back', '')}" + (f" || {c['image']}" if c.get("image") else "")
            for c in step.get("cards") or []
        )
    elif kind == "worked_example":
        out = [
            f"{p.get('text', '')} || {p['explain']}" if p.get("explain") else p.get("text", "")
            for p in step.get("steps") or []
        ]
        row.update(text=step.get("body", ""), items="\n".join(out))
    elif kind == "choice":
        choices = step.get("choices") or []
        for letter, choice in zip(LETTERS, choices):
            row[f"choice_{letter}"] = choice.get("text", "")
        correct = step.get("correct")
        row.update(
            text=step.get("text", ""),
            media=step.get("image", ""),
            key=LETTERS[correct] if isinstance(correct, int) and 0 <= correct < len(LETTERS) else "",
            feedback="\n".join(f"{l}: {c['why']}" for l, c in zip(LETTERS, choices) if c.get("why")),
        )
    elif kind == "true_false":
        answer = step.get("answer")
        row.update(
            text=step.get("text", ""),
            media=step.get("image", ""),
            key="B" if answer else "S",
            feedback=step.get("why_false" if answer else "why_true", ""),
        )
    elif kind == "ordering":
        row.update(
            text=step.get("text", ""),
            media=step.get("image", ""),
            items="\n".join(step.get("items") or []),
            feedback=step.get("why", ""),
        )
    elif kind == "categorize":
        categories = step.get("categories") or []
        items = step.get("items") or []
        row.update(
            text=step.get("text", ""),
            media=step.get("image", ""),
            items="\n".join(
                f"{i.get('text', '')} = {categories[i['category']] if i.get('category', -1) < len(categories) else ''}"
                for i in items
            ),
            feedback="\n".join(f"{n}: {i['why']}" for n, i in enumerate(items, start=1) if i.get("why")),
        )
    elif kind in ("fill_blank", "drag_drop"):
        text = step.get("text", "")
        template = step.get("template", "")
        row.update(
            text=f"{text}\n\n{template}" if text else template,
            media=step.get("image", ""),
            feedback=step.get("why", ""),
        )
        if kind == "drag_drop":
            row["items"] = "\n".join(step.get("distractors") or [])
    elif kind == "matching":
        out = [f"{p.get('left', '')} = {p.get('right', '')}" for p in step.get("pairs") or []]
        out += [f"= {d}" for d in step.get("distractors") or []]
        row.update(
            text=step.get("text", ""),
            media=step.get("image", ""),
            items="\n".join(out),
            feedback=step.get("why", ""),
        )
    else:
        row["text"] = step.get("text", "")
    return row


def draft_rows(draft):
    """Draf -> (baris Stasiun, baris Langkah, baris Glosarium) untuk template."""
    mascot_name = (draft.get("mascot") or {}).get("name", "")
    titles = {s.get("id"): s.get("title", "") for s in schema.iter_stations(draft)}
    station_rows, step_rows = [], []
    for part in draft.get("parts", []):
        for station in part.get("stations", []):
            station_rows.append(
                {
                    "part": part.get("title", ""),
                    "part_description": part.get("description", ""),
                    "title": station.get("title", ""),
                    "objectives": "\n".join(station.get("objectives") or []),
                    "minutes": str(station.get("minutes") or ""),
                    "optional": "ya" if station.get("optional") else "tidak",
                    "prerequisites": "\n".join(titles.get(p, "") for p in station.get("prerequisites") or []),
                    "badge": (station.get("badge") or {}).get("title", ""),
                    "summary": "\n".join(station.get("summary") or []),
                    "reflection": station.get("reflection", ""),
                    "part_id": part.get("id", ""),
                    "id": station.get("id", ""),
                }
            )
            for list_name, step in schema.iter_steps(station):
                step_rows.append(step_row(step, station.get("title", ""), list_name, mascot_name))
    glossary_rows = [
        {"term": g.get("term", ""), "meaning": g.get("meaning", "")} for g in draft.get("glossary") or []
    ]
    return station_rows, step_rows, glossary_rows


def _write_rows(workbook, title, columns, rows, max_rows):
    sheet = workbook.create_sheet(title)
    fill_data_sheet(workbook, sheet, columns, max_rows)
    for index, row in enumerate(rows, start=2):
        for col, column in enumerate(columns, start=1):
            cell = sheet.cell(row=index, column=col, value=row.get(column.key) or None)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
    return sheet


def build_workbook(draft):
    """Template Excel berisi isi draf (atau contoh jika draf masih kosong)."""
    if not any(True for _ in schema.iter_stations(draft or {})):
        draft = EXAMPLE
    station_rows, step_rows, glossary_rows = draft_rows(draft)
    workbook = Workbook()
    guide = workbook.active
    guide.title = "Petunjuk"
    for row, line in enumerate(GUIDE, start=1):
        cell = guide.cell(row=row, column=1, value=line)
        cell.font = Font(bold=row == 1 or line.endswith(":"), size=13 if row == 1 else 11)
    guide.column_dimensions["A"].width = 140
    _write_rows(workbook, STATION_SHEET, STATION_COLUMNS, station_rows, schema.MAX_STATIONS)
    steps_sheet = _write_rows(workbook, STEP_SHEET, STEP_COLUMNS, step_rows, 300)
    _write_rows(workbook, GLOSSARY_SHEET, GLOSSARY_COLUMNS, glossary_rows, schema.MAX_GLOSSARY)
    # Lembar Daftar (pilihan dropdown) dibuat fill_data_sheet; pindahkan ke paling belakang.
    if "Daftar" in workbook.sheetnames:
        workbook.move_sheet("Daftar", offset=len(workbook.sheetnames))
    workbook.active = workbook.index(steps_sheet)
    for sheet in workbook.worksheets:
        sheet.sheet_view.tabSelected = sheet is steps_sheet
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


# ---------------------------------------------------------------- contoh template (diuji lolos impor)


def _step(kind, **fields):
    return {
        "id": "",
        "kind": kind,
        "title": fields.pop("title", ""),
        "hints": fields.pop("hints", []),
        **fields,
    }


EXAMPLE = {
    "schema_version": schema.SCHEMA_VERSION,
    "mascot": {"name": "Bita", "image": ""},
    "glossary": [
        {"term": "Algoritma", "meaning": "Urutan langkah logis untuk menyelesaikan masalah."},
        {"term": "Flowchart", "meaning": "Diagram alir yang menggambarkan algoritma dengan simbol."},
    ],
    "parts": [
        {
            "id": "",
            "title": "Mengenal Algoritma",
            "description": "Konsep dasar algoritma dalam kehidupan sehari-hari.",
            "stations": [
                {
                    **new_station("Apa itu algoritma?"),
                    "objectives": [
                        "Menjelaskan pengertian algoritma",
                        "Memberi contoh algoritma sehari-hari",
                    ],
                    "minutes": 10,
                    "badge": {"title": "Pemula Algoritma", "icon": "award"},
                    "summary": ["Algoritma = langkah berurutan", "Langkah harus jelas dan berakhir"],
                    "reflection": "Algoritma apa yang kamu lakukan setiap pagi?",
                    "steps": [
                        _step(
                            "dialog",
                            lines=[
                                {
                                    "speaker": "mascot",
                                    "mood": "happy",
                                    "text": "Halo {nama_panggilan}! Siap belajar?",
                                },
                                {"speaker": "student", "mood": "", "text": "Siap!"},
                            ],
                        ),
                        _step("text", title="Pengertian", body="**Algoritma** adalah urutan langkah logis."),
                        _step(
                            "video",
                            url="https://www.youtube.com/watch?v=6hfOvs8pY1k",
                            body="Tonton videonya.",
                        ),
                        _step("flip_cards", cards=[{"front": "Input", "back": "Data yang dimasukkan"}]),
                        _step("flashcards", cards=[{"front": "Simbol proses?", "back": "Persegi panjang"}]),
                        _step(
                            "worked_example",
                            body="Algoritma membuat teh.",
                            steps=[
                                {"text": "Rebus air", "explain": "Air harus panas"},
                                {"text": "Masukkan teh", "explain": ""},
                            ],
                        ),
                        _step(
                            "choice",
                            text="Langkah berurutan untuk menyelesaikan masalah disebut ...",
                            choices=[
                                {"text": "Algoritma", "why": ""},
                                {
                                    "text": "Program",
                                    "why": "Program adalah algoritma yang ditulis dalam kode.",
                                },
                                {"text": "Data", "why": ""},
                            ],
                            correct=0,
                            explanation="Algoritma = urutan langkah logis.",
                            hints=["Ingat pengertian di awal stasiun."],
                        ),
                        _step(
                            "true_false",
                            text="Algoritma harus memiliki akhir.",
                            answer=True,
                            why_true="",
                            why_false="Algoritma yang tidak berakhir tidak menyelesaikan masalah.",
                            explanation="",
                        ),
                    ],
                },
                {
                    **new_station("Latihan algoritma"),
                    "minutes": 10,
                    "steps": [
                        _step(
                            "ordering",
                            text="Urutkan langkah menelepon.",
                            items=["Ambil HP", "Pilih kontak", "Tekan panggil"],
                            why="",
                            explanation="",
                        ),
                        _step(
                            "categorize",
                            text="Kelompokkan simbol flowchart.",
                            categories=["Input/Output", "Proses"],
                            items=[
                                {"text": "Baca nilai", "category": 0, "why": ""},
                                {"text": "Hitung total", "category": 1, "why": "Menghitung adalah proses."},
                            ],
                            explanation="",
                        ),
                        _step(
                            "fill_blank",
                            text="Lengkapi kalimat berikut.",
                            template="Simbol input berbentuk [[jajaran genjang]].",
                            case_sensitive=False,
                            why="",
                            explanation="",
                        ),
                        _step(
                            "drag_drop",
                            text="",
                            template="Simbol [[terminator]] menandai awal dan akhir.",
                            distractors=["proses"],
                            why="",
                            explanation="",
                        ),
                        _step(
                            "matching",
                            text="Pasangkan simbol dengan fungsinya.",
                            pairs=[
                                {"left": "Oval", "right": "Mulai/selesai"},
                                {"left": "Persegi", "right": "Proses"},
                            ],
                            distractors=["Komentar"],
                            why="",
                            explanation="",
                        ),
                    ],
                    "remedial": [
                        _step("did_you_know", body="Kata algoritma berasal dari nama ilmuwan Al-Khawarizmi.")
                    ],
                    "challenge": [
                        _step(
                            "link", url="https://flowgorithm.org", body="Coba aplikasi Flowgorithm.", label=""
                        )
                    ],
                },
            ],
        }
    ],
}
