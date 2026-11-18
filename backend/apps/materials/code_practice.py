"""Praktik menulis kode di materi (aturan bentuk soal & pemeriksaan).

Kode siswa dijalankan di BROWSER siswa, bukan di server: menjalankan kode siswa di server hosting
bersama berbahaya (bisa membaca data/merusak server). Akibatnya pemeriksaan otomatis juga di browser,
sehingga siswa yang sangat paham teknis bisa mengakalinya — wajar untuk latihan, dan guru tetap bisa
membaca kode setiap siswa (`CodeAttempt`).

Bentuk `checks` per bahasa:
- python & php: [{"input": "3\\n4", "output": "7"}] - masukan (baris untuk input() Python / fgets(STDIN)
  PHP) -> keluaran yang diharapkan. Dibandingkan per baris, spasi di akhir baris & baris kosong di akhir
  diabaikan.
- html: [{"type": ..., "selector", "property", "value", "target"}]:
    exists  : elemen `selector` ada
    text    : teks elemen `selector` memuat `value` (huruf besar/kecil diabaikan)
    style   : gaya `property` elemen `selector` = `value` (warna/ukuran dibandingkan setelah diolah browser)
    console : keluaran console.log memuat `value`
    click   : klik elemen `selector`, lalu teks elemen `target` memuat `value`
"""

import json

from rest_framework.exceptions import ValidationError

from .models import CodeLanguage

# Bahasa yang diperiksa lewat masukan -> keluaran (bukan pemeriksaan halaman HTML).
IO_LANGUAGES = {CodeLanguage.PYTHON, CodeLanguage.PHP, CodeLanguage.FLOWCHART}
MAX_EXERCISES = 5
MAX_CHECKS = 10
MAX_CODE = 50_000
MAX_TEXT = 5_000
HTML_TYPES = {
    "exists": ["selector"],
    "text": ["selector", "value"],
    "style": ["selector", "property", "value"],
    "console": ["value"],
    "click": ["selector", "target", "value"],
}
HTML_FIELDS = ["selector", "property", "value", "target"]
FIELD_LABELS = {
    "selector": "Elemen",
    "property": "Properti CSS",
    "value": "Nilai",
    "target": "Elemen hasil",
    "input": "Masukan",
    "output": "Keluaran",
}


def _text(item, key, number):
    value = item.get(key, "")
    if value is None:
        value = ""
    if not isinstance(value, (str, int, float)):
        raise ValidationError(f"Pemeriksaan {number}: {FIELD_LABELS[key]} harus berupa teks.")
    value = str(value)
    if len(value) > MAX_TEXT:
        raise ValidationError(f"Pemeriksaan {number}: {FIELD_LABELS[key]} terlalu panjang.")
    return value


def clean_checks(language, checks):
    """Rapikan & periksa daftar pemeriksaan sesuai bahasa. Mengembalikan daftar yang disimpan."""
    if not isinstance(checks, list) or not checks:
        raise ValidationError("Tambahkan minimal satu pemeriksaan otomatis.")
    if len(checks) > MAX_CHECKS:
        raise ValidationError(f"Maksimal {MAX_CHECKS} pemeriksaan per soal.")
    cleaned = []
    for number, item in enumerate(checks, start=1):
        if not isinstance(item, dict):
            raise ValidationError(f"Pemeriksaan {number} tidak valid.")
        if language in IO_LANGUAGES:
            data = {"input": _text(item, "input", number), "output": _text(item, "output", number)}
            if not data["output"].strip():
                raise ValidationError(f"Pemeriksaan {number}: isi keluaran yang diharapkan.")
        else:
            kind = item.get("type")
            if kind not in HTML_TYPES:
                raise ValidationError(f"Pemeriksaan {number}: jenis pemeriksaan tidak dikenal.")
            data = {"type": kind}
            for key in HTML_FIELDS:
                data[key] = _text(item, key, number).strip()
            missing = [FIELD_LABELS[key] for key in HTML_TYPES[kind] if not data[key]]
            if missing:
                raise ValidationError(f"Pemeriksaan {number}: isi {', '.join(missing)}.")
        cleaned.append(data)
    return cleaned


# Flowchart disimpan sebagai teks JSON {"version": 1, "blocks": [...]} (lihat frontend
# utils/flowchart/program.js). Flowchart awal dari guru diperiksa bentuknya di sini.
FLOWCHART_FIELDS = {
    "input": ["variable"],
    "output": ["expression"],
    "assign": ["variable", "expression"],
    "if": ["condition"],
    "while": ["condition"],
    "for": ["variable", "from", "to", "step"],
}
FLOWCHART_BRANCHES = {"if": ["yes", "no"], "while": ["body"], "for": ["body"]}
MAX_FLOWCHART_BLOCKS = 300
MAX_FLOWCHART_DEPTH = 20


def clean_flowchart(text):
    """Periksa teks JSON flowchart (kosong = tanpa flowchart awal). Mengembalikan teks yang disimpan."""
    if not str(text or "").strip():
        return ""
    try:
        data = json.loads(text)
    except ValueError:
        raise ValidationError("Flowchart awal tidak valid.")
    if not isinstance(data, dict) or not isinstance(data.get("blocks"), list):
        raise ValidationError("Flowchart awal tidak valid.")
    count = 0

    def check(blocks, depth):
        nonlocal count
        if depth > MAX_FLOWCHART_DEPTH:
            raise ValidationError("Flowchart awal terlalu bertingkat.")
        for block in blocks:
            count += 1
            if count > MAX_FLOWCHART_BLOCKS:
                raise ValidationError(f"Flowchart awal maksimal {MAX_FLOWCHART_BLOCKS} blok.")
            kind = block.get("type") if isinstance(block, dict) else None
            if kind not in FLOWCHART_FIELDS or not isinstance(block.get("id"), str):
                raise ValidationError("Flowchart awal berisi blok yang tidak dikenal.")
            for field in FLOWCHART_FIELDS[kind]:
                if not isinstance(block.get(field, ""), str) or len(block.get(field, "")) > 500:
                    raise ValidationError("Isi blok flowchart awal tidak valid.")
            for branch in FLOWCHART_BRANCHES.get(kind, []):
                children = block.get(branch, [])
                if not isinstance(children, list):
                    raise ValidationError("Flowchart awal tidak valid.")
                check(children, depth + 1)

    check(data["blocks"], 1)
    return json.dumps({"version": 1, "blocks": data["blocks"]}, ensure_ascii=False)
