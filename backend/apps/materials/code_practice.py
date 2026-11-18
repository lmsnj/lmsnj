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

from rest_framework.exceptions import ValidationError

from .models import CodeLanguage

# Bahasa yang diperiksa lewat masukan -> keluaran (bukan pemeriksaan halaman HTML).
IO_LANGUAGES = {CodeLanguage.PYTHON, CodeLanguage.PHP}
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
