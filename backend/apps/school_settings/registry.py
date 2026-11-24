"""Daftar semua pengaturan pembelajaran dan saklar fitur beserta nilai bawaan sistem.

Fitur baru cukup menambah satu `Setting` di sini (tanpa kolom/tabel baru). Nilai bawaan dipakai
selama sekolah belum mengubahnya, jadi sekolah baru langsung punya paket pengaturan lengkap.

Jenis isian (`kind`) dan bentuk nilainya:
- int      : bilangan bulat antara `min` dan `max`
- choice   : salah satu `options`
- bool     : true / false
- multi    : daftar berisi sebagian `options` (minimal satu)
- bands    : [{"label", "min"}] urut dari batas tertinggi, batas terakhir 0 (predikat, status)
- weights  : [{"label", "weight"}] jumlah bobot 100; `fixed` = label tidak boleh diubah
- fields   : {nama: angka} dengan batas per nama (`fields`)
- mode     : kode mode kelas yang aktif di tabel ClassMode (pilihan dibaca dari database)
"""

from dataclasses import dataclass, field

from rest_framework.exceptions import ValidationError

from .models import ClassMode, Scope

S, C, M, K = Scope.SCHOOL, Scope.CATEGORY, Scope.SUBJECT, Scope.CLASSROOM

# Tab di halaman Pengaturan Pembelajaran (urutan tampil).
GROUPS = [
    ("umum", "Umum"),
    ("kategori", "Kategori Mapel"),
    ("penilaian", "Penilaian"),
    ("kuis_qr", "Kuis QR"),
    ("lkpd", "LKPD"),
    ("monitoring", "Monitoring"),
]


@dataclass(frozen=True)
class Setting:
    key: str
    group: str
    label: str
    kind: str
    default: object
    scopes: tuple = (S,)
    help: str = ""
    options: tuple = ()  # (nilai, label) untuk choice & multi
    min: int = 0
    max: int = 100
    unit: str = ""
    fixed: bool = False  # weights: label tetap
    fields: tuple = ()  # fields: (nama, label, min, max, satuan)

    def as_dict(self):
        data = {
            "key": self.key,
            "group": self.group,
            "label": self.label,
            "kind": self.kind,
            "default": self.default,
            "scopes": list(self.scopes),
            "help": self.help,
        }
        if self.options:
            data["options"] = [{"value": v, "label": label} for v, label in self.options]
        if self.kind == "mode":
            data["options"] = mode_options()
        if self.kind in ("int", "bands"):
            data.update(min=self.min, max=self.max)
        if self.unit:
            data["unit"] = self.unit
        if self.kind == "weights":
            data["fixed"] = self.fixed
        if self.fields:
            data["fields"] = [
                {"name": n, "label": label, "min": lo, "max": hi, "unit": unit}
                for n, label, lo, hi, unit in self.fields
            ]
        return data


@dataclass(frozen=True)
class Feature:
    code: str
    label: str
    help: str = ""

    def as_dict(self):
        return {"code": self.code, "label": self.label, "help": self.help}


def _bands(*pairs):
    return [{"label": label, "min": minimum} for label, minimum in pairs]


def _weights(*pairs):
    return [{"label": label, "weight": weight} for label, weight in pairs]


SETTINGS = [
    # --- Umum: mode presentasi kelas (Tahap 4) ---
    Setting(
        "presentasi.ukuran_huruf",
        "umum",
        "Ukuran huruf presentasi",
        "choice",
        "besar",
        options=(("normal", "Normal"), ("besar", "Besar"), ("sangat_besar", "Sangat besar")),
        help="Ukuran huruf dasar saat materi ditampilkan di TV kelas.",
    ),
    Setting(
        "presentasi.timer_default",
        "umum",
        "Durasi timer bawaan",
        "int",
        5,
        scopes=(S, M),
        min=1,
        max=120,
        unit="menit",
        help="Durasi awal timer di mode presentasi.",
    ),
    Setting(
        "presentasi.tema",
        "umum",
        "Tema presentasi",
        "choice",
        "gelap",
        options=(("gelap", "Gelap"), ("terang", "Terang")),
        help="Gelap lebih nyaman dibaca di TV kelas; terang cocok untuk ruangan yang sangat terang.",
    ),
    Setting(
        "presentasi.tampil_timer",
        "umum",
        "Tampilkan timer",
        "bool",
        True,
        help="Timer hitung mundur di pojok layar presentasi.",
    ),
    # --- Kategori mapel & mode kelas (Tahap 2) ---
    Setting(
        "kelas.mode_default",
        "kategori",
        "Mode kelas bawaan",
        "mode",
        "lab",
        scopes=(S, C, M, K),
        help="Cara siswa mengakses pembelajaran. Bawaan Lab = tampilan seperti sekarang.",
    ),
    # --- Penilaian (Tahap 3 & 7) ---
    Setting(
        "nilai.skala",
        "penilaian",
        "Skala nilai",
        "choice",
        "0-100",
        options=(("0-100", "0 – 100"), ("0-4", "0 – 4"), ("predikat", "Predikat (A/B/C/D)")),
    ),
    Setting(
        "nilai.kkm",
        "penilaian",
        "KKM",
        "int",
        75,
        scopes=(S, M, K),
        min=0,
        max=100,
        help="Kriteria ketuntasan minimal (skala 100). Nilai di bawahnya ditandai merah.",
    ),
    Setting(
        "nilai.predikat",
        "penilaian",
        "Rentang predikat",
        "bands",
        _bands(("A", 90), ("B", 80), ("C", 75), ("D", 0)),
        help="Batas bawah setiap predikat (skala 100), dari yang tertinggi.",
    ),
    Setting(
        "nilai.bobot",
        "penilaian",
        "Bobot nilai rapor",
        "weights",
        _weights(("Tugas", 30), ("Kuis", 20), ("Ulangan", 50)),
        scopes=(S, C, M),
        help="Bobot setiap kelompok penilaian dalam nilai akhir. Jumlahnya harus 100%.",
    ),
    Setting(
        "nilai.pembulatan",
        "penilaian",
        "Pembulatan nilai akhir",
        "choice",
        "bulat",
        options=(
            ("bulat", "Bilangan bulat"),
            ("satu_desimal", "Satu desimal"),
            ("dua_desimal", "Dua desimal"),
        ),
    ),
    # --- Kuis kartu QR (Tahap 5) ---
    Setting(
        "kuis_qr.jumlah_opsi",
        "kuis_qr",
        "Jumlah pilihan jawaban",
        "int",
        4,
        scopes=(S, M),
        min=2,
        max=4,
        unit="opsi",
    ),
    Setting(
        "kuis_qr.kartu_per_set", "kuis_qr", "Jumlah kartu per set", "int", 40, min=1, max=200, unit="kartu"
    ),
    Setting(
        "kuis_qr.ukuran_kartu",
        "kuis_qr",
        "Ukuran cetak kartu",
        "choice",
        "A5",
        options=(("A5", "A5"), ("A6", "A6")),
    ),
    Setting(
        "kuis_qr.tampil_hasil_layar",
        "kuis_qr",
        "Tampilkan grafik hasil di TV",
        "bool",
        True,
        scopes=(S, M),
    ),
    Setting("kuis_qr.boleh_pindai_ulang", "kuis_qr", "Jawaban boleh dipindai ulang", "bool", True),
    # --- LKPD cetak + foto (Tahap 6) ---
    Setting(
        "lkpd.ukuran_kertas",
        "lkpd",
        "Ukuran kertas LKPD",
        "choice",
        "A4",
        options=(("A4", "A4"), ("F4", "F4 / Folio"), ("A5", "A5")),
    ),
    Setting(
        "lkpd.kompresi_foto",
        "lkpd",
        "Kompresi foto LKPD",
        "fields",
        {"max_px": 1600, "quality": 70},
        fields=(("max_px", "Sisi terpanjang", 400, 4000, "px"), ("quality", "Kualitas", 30, 95, "%")),
        help="Foto diperkecil sebelum disimpan agar hemat ruang.",
    ),
    # --- Monitoring guru (Tahap 8) ---
    Setting(
        "monitoring.jabatan_akses",
        "monitoring",
        "Jabatan yang boleh membuka Monitoring",
        "multi",
        ["superadmin", "kepala_sekolah", "waka_kurikulum"],
        options=(
            ("superadmin", "Super Admin"),
            ("kepala_sekolah", "Kepala Sekolah"),
            ("waka_kurikulum", "Waka Kurikulum"),
            ("waka_kesiswaan", "Waka Kesiswaan"),
            ("lainnya", "Jabatan lainnya"),
        ),
    ),
    Setting(
        "monitoring.indikator_guru",
        "monitoring",
        "Bobot indikator keaktifan guru",
        "weights",
        _weights(("Presensi", 40), ("Nilai", 30), ("Materi", 20), ("Kuis", 10)),
        fixed=True,
    ),
    Setting(
        "monitoring.ambang_status",
        "monitoring",
        "Batas status keaktifan guru",
        "bands",
        _bands(("Aktif", 75), ("Kurang", 40), ("Belum", 0)),
        help="Skor minimal setiap status (0–100).",
    ),
    Setting(
        "monitoring.peringatan_hari",
        "monitoring",
        "Peringatan guru tanpa aktivitas",
        "int",
        7,
        min=1,
        max=90,
        unit="hari",
    ),
    Setting(
        "monitoring.periode_default",
        "monitoring",
        "Periode bawaan laporan",
        "choice",
        "minggu_ini",
        options=(("minggu_ini", "Minggu ini"), ("bulan_ini", "Bulan ini"), ("semester_ini", "Semester ini")),
    ),
]

FEATURES = [
    Feature(
        "mode_kelas",
        "Kategori & Mode Kelas",
        "Halaman kelas guru menyesuaikan mode kelas (mis. tanpa perangkat siswa).",
    ),
    Feature("presentasi", "Mode Presentasi Kelas", "Materi dan Media Interaktif tampil penuh di TV kelas."),
    Feature(
        "penilaian_langsung", "Penilaian Langsung", "Guru memasukkan nilai tanpa pengumpulan dari siswa."
    ),
    Feature("kuis_qr", "Kuis Kartu QR", "Kuis satu kelas memakai kartu QR, dipindai HP guru."),
    Feature("lkpd_foto", "LKPD Ber-QR & Foto Massal", "Bukti tugas kertas difoto dan masuk ke akun siswa."),
]

SETTINGS_BY_KEY = {s.key: s for s in SETTINGS}
FEATURES_BY_CODE = {f.code: f for f in FEATURES}


def get_definition(key):
    try:
        return SETTINGS_BY_KEY[key]
    except KeyError:
        raise ValidationError({"key": "Pengaturan tidak dikenal."}) from None


# --- Pemeriksaan nilai per jenis isian ---


def _is_int(value):
    # bool adalah turunan int di Python; True tidak boleh dianggap angka 1.
    return isinstance(value, int) and not isinstance(value, bool)


def _check_int(setting, value):
    if not _is_int(value):
        raise ValidationError("Isi dengan bilangan bulat.")
    if not setting.min <= value <= setting.max:
        raise ValidationError(f"Isi antara {setting.min} dan {setting.max}.")
    return value


def _check_choice(setting, value):
    if value not in [v for v, _ in setting.options]:
        raise ValidationError("Pilihan tidak tersedia.")
    return value


def _check_bool(setting, value):
    if not isinstance(value, bool):
        raise ValidationError("Isi dengan ya atau tidak.")
    return value


def _check_multi(setting, value):
    allowed = [v for v, _ in setting.options]
    if not isinstance(value, list) or not value:
        raise ValidationError("Pilih minimal satu.")
    if any(item not in allowed for item in value) or len(set(value)) != len(value):
        raise ValidationError("Pilihan tidak tersedia.")
    return [v for v in allowed if v in value]  # urutan mengikuti daftar pilihan


def _clean_label(item):
    if not isinstance(item, dict) or not isinstance(item.get("label"), str):
        raise ValidationError("Setiap baris harus punya label.")
    label = item["label"].strip()
    if not label or len(label) > 30:
        raise ValidationError("Label wajib diisi (maks. 30 karakter).")
    return label


def _check_bands(setting, value):
    if not isinstance(value, list) or len(value) < 2 or len(value) > 10:
        raise ValidationError("Isi 2 sampai 10 rentang.")
    cleaned = []
    for item in value:
        label = _clean_label(item)
        minimum = item.get("min")
        if not _is_int(minimum) or not setting.min <= minimum <= setting.max:
            raise ValidationError(f"Batas bawah {label} harus bilangan bulat {setting.min}–{setting.max}.")
        cleaned.append({"label": label, "min": minimum})
    if len({b["label"].lower() for b in cleaned}) != len(cleaned):
        raise ValidationError("Label tidak boleh sama.")
    if any(a["min"] <= b["min"] for a, b in zip(cleaned, cleaned[1:])):
        raise ValidationError("Batas bawah harus urut dari yang tertinggi dan tidak boleh sama.")
    if cleaned[-1]["min"] != setting.min:
        raise ValidationError(f"Batas bawah rentang terakhir harus {setting.min}.")
    return cleaned


def _check_weights(setting, value):
    if not isinstance(value, list) or not value or len(value) > 12:
        raise ValidationError("Isi 1 sampai 12 bobot.")
    cleaned = []
    for item in value:
        label = _clean_label(item)
        weight = item.get("weight")
        if not _is_int(weight) or not 0 <= weight <= 100:
            raise ValidationError(f"Bobot {label} harus bilangan bulat 0–100.")
        cleaned.append({"label": label, "weight": weight})
    if len({w["label"].lower() for w in cleaned}) != len(cleaned):
        raise ValidationError("Label tidak boleh sama.")
    if setting.fixed and [w["label"] for w in cleaned] != [w["label"] for w in setting.default]:
        raise ValidationError("Daftar indikator tidak boleh diubah, hanya bobotnya.")
    total = sum(w["weight"] for w in cleaned)
    if total != 100:
        raise ValidationError(f"Jumlah bobot harus 100% (sekarang {total}%).")
    return cleaned


def _check_fields(setting, value):
    if not isinstance(value, dict) or set(value) != {f[0] for f in setting.fields}:
        raise ValidationError("Isian tidak lengkap.")
    for name, label, low, high, _unit in setting.fields:
        if not _is_int(value[name]) or not low <= value[name] <= high:
            raise ValidationError(f"{label} harus bilangan bulat {low}–{high}.")
    return {name: value[name] for name, *_ in setting.fields}


def mode_options():
    """Pilihan mode kelas yang aktif (master ClassMode)."""
    return [{"value": m.code, "label": m.name} for m in ClassMode.objects.filter(is_active=True)]


def _check_mode(setting, value):
    if not isinstance(value, str) or not ClassMode.objects.filter(code=value, is_active=True).exists():
        raise ValidationError("Mode kelas tidak tersedia.")
    return value


CHECKERS = {
    "int": _check_int,
    "choice": _check_choice,
    "bool": _check_bool,
    "multi": _check_multi,
    "bands": _check_bands,
    "weights": _check_weights,
    "fields": _check_fields,
    "mode": _check_mode,
}


def clean_value(setting, value):
    """Nilai yang sudah diperiksa & dirapikan, atau ValidationError {"value": pesan}."""
    try:
        return CHECKERS[setting.kind](setting, value)
    except ValidationError as error:
        raise ValidationError({"value": error.detail}) from None
