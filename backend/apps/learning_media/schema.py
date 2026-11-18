"""Bentuk isi media (JSON terversi) dan kompilasinya saat diterbitkan.

    {
      "schema_version": 1,
      "mascot": {"name": "Bita", "image": ""},
      "glossary": [{"term": "Algoritma", "meaning": "..."}],
      "parts": [{
        "id", "title", "description",
        "stations": [{
          "id", "title", "objectives": [...], "minutes", "prerequisites": [id stasiun], "optional",
          "badge": {"title", "icon"} | null,
          "steps": [langkah], "remedial": [langkah], "challenge": [langkah],
          "summary": [3 poin], "reflection": "pertanyaan refleksi"
        }]
      }]
    }

Langkah = {"id", "kind", "title", "hints": [petunjuk 1, petunjuk 2], ...field jenisnya (steps.py)}.

Semua bagian/stasiun/langkah punya `id` tetap. Progres siswa disimpan menurut id ini (bukan nomor urut),
jadi guru boleh mengubah, menyusun ulang, atau menambah langkah setelah terbit tanpa merusak progres.
Id yang kosong dibuatkan otomatis saat disimpan.

Draf disimpan dengan pemeriksaan ringan (bentuk & batas ukuran) agar guru bisa menyimpan pekerjaan
yang belum lengkap; pemeriksaan lengkap per langkah dilakukan saat pratinjau dan terbit.
"""

import json

from . import steps as step_kinds
from .steps import ID_RE, StepError, new_id, number, text, text_list

SCHEMA_VERSION = 1
MAX_BYTES = 2 * 1024 * 1024
MAX_PARTS = 20
MAX_STATIONS = 100
MAX_STEPS = 40
MAX_EXTRA_STEPS = 20
MAX_GLOSSARY = 300
STEP_LISTS = ("steps", "remedial", "challenge")
LIST_LABELS = {"steps": "Langkah", "remedial": "Belajar ulang", "challenge": "Tantangan"}


class MediaError(ValueError):
    """Isi media tidak valid. `errors` = daftar pesan per lokasi."""

    def __init__(self, errors):
        super().__init__("; ".join(errors))
        self.errors = errors


def empty_media():
    return {
        "schema_version": SCHEMA_VERSION,
        "mascot": {"name": "", "image": ""},
        "glossary": [],
        "parts": [],
    }


def upgrade(content):
    """Ubah isi versi skema lama ke versi sekarang. Baru ada versi 1; tempat menambah migrasi isi nanti."""
    version = content.get("schema_version", SCHEMA_VERSION)
    if version != SCHEMA_VERSION:
        raise MediaError([f"Versi skema {version} belum didukung (yang didukung: {SCHEMA_VERSION})."])
    return content


def _ensure_id(item, used, where, errors):
    value = item.get("id") or new_id()
    if not isinstance(value, str) or not ID_RE.match(value):
        errors.append(f"{where}: id hanya boleh huruf, angka, - dan _ (maks. 40).")
        return value
    if value in used:
        errors.append(f"{where}: id '{value}' dipakai dua kali.")
    used.add(value)
    return value


def _location(part_no, station_no=None, list_name=None, step_no=None):
    where = f"Bagian {part_no}"
    if station_no is not None:
        where += f" › Stasiun {station_no}"
    if list_name is not None:
        where += f" › {LIST_LABELS[list_name]} {step_no}"
    return where


def _clean_step(raw, where, full, used, errors):
    if not isinstance(raw, dict):
        errors.append(f"{where}: langkah tidak valid.")
        return None
    step = dict(raw)
    step["id"] = _ensure_id(step, used, where, errors)
    kind = step.get("kind")
    if kind not in step_kinds.KINDS:
        errors.append(f"{where}: jenis langkah '{kind}' tidak dikenal.")
        return step
    if not full:
        return step
    try:
        hints = text_list(step.get("hints"), "Petunjuk", 0, step_kinds.MAX_HINTS, 1000)
        cleaned = step_kinds.KINDS[kind].validate(step)
        return {
            "id": step["id"],
            "kind": kind,
            "title": text(step.get("title"), "Judul langkah", 200),
            "hints": hints,
            **cleaned,
        }
    except StepError as error:
        errors.append(f"{where}: {error}")
        return step


def validate_media(content, full=True):
    """Periksa isi media. full=False (simpan draf) hanya memeriksa bentuk, id, dan ukuran.
    Mengembalikan isi yang sudah dibersihkan; raise MediaError berisi semua pesan kesalahan."""
    if not isinstance(content, dict):
        raise MediaError(["Isi media harus berupa objek JSON."])
    if len(json.dumps(content, ensure_ascii=False).encode()) > MAX_BYTES:
        raise MediaError(["Isi media terlalu besar (maks. 2 MB). Pindahkan gambar/video ke unggahan."])
    content = upgrade(content)
    errors, used = [], set()

    def safe(callback, where):
        try:
            return callback()
        except StepError as error:
            errors.append(f"{where}: {error}")
            return None

    mascot = content.get("mascot") or {}
    if not isinstance(mascot, dict):
        mascot = {}
    mascot = {
        "name": safe(lambda: text(mascot.get("name"), "Nama maskot", 40), "Maskot") or "",
        "image": safe(lambda: text(mascot.get("image"), "Gambar maskot"), "Maskot") or "",
    }
    glossary = []
    raw_glossary = content.get("glossary") or []
    if not isinstance(raw_glossary, list) or len(raw_glossary) > MAX_GLOSSARY:
        errors.append(f"Glosarium: maksimal {MAX_GLOSSARY} istilah.")
        raw_glossary = []
    for number_, entry in enumerate(raw_glossary, start=1):
        where = f"Glosarium {number_}"
        if not isinstance(entry, dict):
            errors.append(f"{where}: tidak valid.")
            continue
        term = safe(lambda: text(entry.get("term"), "Istilah", 100, True), where)
        meaning = safe(lambda: text(entry.get("meaning"), "Arti", 1000, True), where)
        if term and meaning:
            glossary.append({"term": term, "meaning": meaning})

    parts = content.get("parts") or []
    if not isinstance(parts, list) or len(parts) > MAX_PARTS:
        raise MediaError([f"Media berisi maksimal {MAX_PARTS} bagian."])
    if full and not parts:
        errors.append("Tambahkan minimal satu bagian berisi stasiun.")
    clean_parts, station_ids, station_count = [], [], 0
    for part_no, part in enumerate(parts, start=1):
        where = _location(part_no)
        if not isinstance(part, dict):
            errors.append(f"{where}: tidak valid.")
            continue
        stations = part.get("stations") or []
        if not isinstance(stations, list):
            errors.append(f"{where}: daftar stasiun tidak valid.")
            stations = []
        if full and not stations:
            errors.append(f"{where}: belum ada stasiun.")
        station_count += len(stations)
        clean_stations = []
        for station_no, station in enumerate(stations, start=1):
            clean_stations.append(_clean_station(station, part_no, station_no, full, used, errors, safe))
            if isinstance(station, dict):
                station_ids.append(clean_stations[-1].get("id"))
        clean_parts.append(
            {
                "id": _ensure_id(part, used, where, errors),
                "title": safe(lambda: text(part.get("title"), "Judul bagian", 200, full), where) or "",
                "description": safe(lambda: text(part.get("description"), "Deskripsi", 2000), where) or "",
                "stations": clean_stations,
            }
        )
    if station_count > MAX_STATIONS:
        errors.append(f"Media berisi maksimal {MAX_STATIONS} stasiun.")

    # Prasyarat harus menunjuk stasiun SEBELUMNYA (agar tidak ada lingkaran syarat).
    seen = set()
    for part_no, part in enumerate(clean_parts, start=1):
        for station_no, station in enumerate(part["stations"], start=1):
            for required in station.get("prerequisites", []):
                if required not in seen:
                    errors.append(
                        f"{_location(part_no, station_no)}: prasyarat '{required}' harus stasiun sebelumnya."
                    )
            seen.add(station.get("id"))
    if errors:
        raise MediaError(errors)
    return {"schema_version": SCHEMA_VERSION, "mascot": mascot, "glossary": glossary, "parts": clean_parts}


def _clean_station(station, part_no, station_no, full, used, errors, safe):
    where = _location(part_no, station_no)
    if not isinstance(station, dict):
        errors.append(f"{where}: tidak valid.")
        return {}
    clean = {
        "id": _ensure_id(station, used, where, errors),
        "title": safe(lambda: text(station.get("title"), "Judul stasiun", 200, full), where) or "",
        "objectives": safe(lambda: text_list(station.get("objectives"), "Tujuan pembelajaran", 0, 8), where)
        or [],
        "minutes": safe(lambda: number(station.get("minutes"), "Perkiraan durasi", 0, 240, default=0), where)
        or 0,
        "prerequisites": station.get("prerequisites") or [],
        "optional": bool(station.get("optional")),
        "summary": safe(lambda: text_list(station.get("summary"), "Ringkasan", 0, 5, 1000), where) or [],
        "reflection": safe(lambda: text(station.get("reflection"), "Pertanyaan refleksi", 500), where) or "",
        "badge": None,
    }
    if not isinstance(clean["prerequisites"], list) or not all(
        isinstance(p, str) for p in clean["prerequisites"]
    ):
        errors.append(f"{where}: prasyarat tidak valid.")
        clean["prerequisites"] = []
    badge = station.get("badge")
    if isinstance(badge, dict) and badge.get("title"):
        clean["badge"] = {
            "title": safe(lambda: text(badge.get("title"), "Nama lencana", 60), where) or "",
            "icon": safe(lambda: text(badge.get("icon"), "Ikon lencana", 40), where) or "award",
        }
    for list_name in STEP_LISTS:
        raw = station.get(list_name) or []
        limit = MAX_STEPS if list_name == "steps" else MAX_EXTRA_STEPS
        if not isinstance(raw, list) or len(raw) > limit:
            errors.append(f"{where}: {LIST_LABELS[list_name]} maksimal {limit} langkah.")
            raw = []
        if full and list_name == "steps" and not raw:
            errors.append(f"{where}: belum ada langkah.")
        clean[list_name] = [
            _clean_step(step, _location(part_no, station_no, list_name, n), full, used, errors)
            for n, step in enumerate(raw, start=1)
        ]
    return clean


def iter_stations(content):
    for part in content.get("parts", []):
        yield from part.get("stations", [])


def iter_steps(station):
    """(nama daftar, langkah) untuk semua langkah stasiun, termasuk Belajar ulang & Tantangan."""
    for list_name in STEP_LISTS:
        for step in station.get(list_name, []):
            yield list_name, step


def compile_media(content):
    """Isi lengkap (sudah divalidasi penuh) -> {"content": isi untuk siswa, "keys": {id langkah: kunci}}.
    Di isi siswa setiap langkah latihan diberi `graded: true`, setiap stasiun `graded_steps` (jumlah
    latihan utama)."""
    keys = {}
    parts = []
    for part in content["parts"]:
        stations = []
        for station in part["stations"]:
            compiled = {k: v for k, v in station.items() if k not in STEP_LISTS}
            for list_name in STEP_LISTS:
                compiled[list_name] = []
                for step in station[list_name]:
                    kind = step_kinds.KINDS[step["kind"]]
                    fields = {k: v for k, v in step.items() if k not in ("id", "kind", "title", "hints")}
                    public, key = kind.compile(fields)
                    entry = {
                        "id": step["id"],
                        "kind": step["kind"],
                        "title": step["title"],
                        "hints": step["hints"],
                    }
                    entry.update(public)
                    entry["graded"] = kind.graded
                    if key is not None:
                        keys[step["id"]] = key
                    compiled[list_name].append(entry)
            compiled["graded_steps"] = sum(1 for s in compiled["steps"] if s["graded"])
            stations.append(compiled)
        parts.append({**part, "stations": stations})
    return {"content": {**content, "parts": parts}, "keys": keys}


def required_station_ids(content):
    return [s["id"] for s in iter_stations(content) if not s.get("optional")]


def find_step(content, station_id, step_id):
    """(stasiun, nama daftar, langkah) atau (stasiun, None, None)."""
    for station in iter_stations(content):
        if station["id"] != station_id:
            continue
        for list_name, step in iter_steps(station):
            if step["id"] == step_id:
                return station, list_name, step
        return station, None, None
    return None, None, None


def student_content(content, seed):
    """Isi untuk satu siswa: pilihan/butir diacak dengan seed tetap per siswa-langkah."""
    parts = []
    for part in content["parts"]:
        stations = []
        for station in part["stations"]:
            copy = dict(station)
            for list_name in STEP_LISTS:
                copy[list_name] = [
                    (
                        step_kinds.KINDS[step["kind"]].student(step, f"{seed}-{step['id']}")
                        if step["graded"]
                        else step
                    )
                    for step in station[list_name]
                ]
            stations.append(copy)
        parts.append({**part, "stations": stations})
    return {**content, "parts": parts}
