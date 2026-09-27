"""Impor soal asesmen dari template Excel atau dari teks yang ditempel (salin dari Word).

- Rumus matematika ditulis LaTeX di antara $...$ (dalam kalimat) atau $$...$$ (baris sendiri).
- Teks Arab berharakat disimpan apa adanya (tidak dinormalisasi). Hanya karakter kontrol arah
  yang tidak terlihat (sering terbawa dari Word) yang dibuang.
- Gambar stimulus/soal/pilihan ditulis sebagai NAMA FILE, dan filenya diunggah dalam satu ZIP.
- Jenis soal: pg, pg kompleks (kunci lebih dari satu, mis. "A, C"), kategori (setiap pernyataan
  dijawab Benar/Salah, kunci mis. "B, S, B"), dan esai. Kolom Grup = soal dengan stimulus bersama.
- Tabel ditulis dengan garis tegak: | Kolom 1 | Kolom 2 | (lihat utils/richText.js di frontend).
- Setiap soal diperiksa dengan QuestionSerializer (aturan yang sama dengan form tambah soal).
  Impor hanya dijalankan jika SEMUA soal benar.
"""

import re

from django.db import transaction
from django.db.models import Max

from apps.common.excel import Column, build_template, first_errors, read_rows

from .images import image_key, save_image
from .models import ImageSlot, QuestionKind, TextDirection
from .serializers import QuestionSerializer

SHEET = "Soal"
LETTERS = "ABCDE"

COLUMNS = [
    Column("kind", "Jenis", required=True, width=12, choices=["pg", "pg kompleks", "kategori", "esai"]),
    Column("group", "Grup", width=8, text=True),
    Column("stimulus", "Stimulus", width=36, text=True),
    Column("stimulus_image", "Gambar Stimulus", width=18, text=True),
    Column("text", "Pertanyaan", required=True, width=50, text=True),
    Column("question_image", "Gambar Soal", width=16, text=True),
    Column("direction", "Arah Teks", width=12, choices=["otomatis", "rtl", "ltr"]),
    Column("points", "Poin", width=8),
    *[Column(f"choice_{letter}", f"Pilihan {letter}", width=26, text=True) for letter in LETTERS],
    *[Column(f"image_{letter}", f"Gambar {letter}", width=14, text=True) for letter in LETTERS],
    Column("key", "Kunci", width=12, text=True),
    Column("labels", "Label Kategori", width=18, text=True),
]

KIND_ALIASES = {
    "pg": QuestionKind.CHOICE, "pilihan ganda": QuestionKind.CHOICE, "pilihan": QuestionKind.CHOICE,
    "choice": QuestionKind.CHOICE,
    "pg kompleks": QuestionKind.MULTIPLE, "pgk": QuestionKind.MULTIPLE, "mcma": QuestionKind.MULTIPLE,
    "pilihan ganda kompleks": QuestionKind.MULTIPLE, "multiple": QuestionKind.MULTIPLE,
    "kategori": QuestionKind.CATEGORY, "benar salah": QuestionKind.CATEGORY,
    "benar/salah": QuestionKind.CATEGORY, "category": QuestionKind.CATEGORY,
    "esai": QuestionKind.ESSAY, "essay": QuestionKind.ESSAY, "uraian": QuestionKind.ESSAY,
}  # fmt: skip
DIRECTION_ALIASES = {
    "": TextDirection.AUTO, "otomatis": TextDirection.AUTO, "auto": TextDirection.AUTO,
    "rtl": TextDirection.RTL, "arab": TextDirection.RTL, "ltr": TextDirection.LTR,
}  # fmt: skip
# Kunci boleh huruf Latin (A-E), huruf Arab (أ ب ج د هـ), atau angka 1-5.
ARABIC_LETTER_INDEX = {"أ": 0, "ا": 0, "ب": 1, "ج": 2, "د": 3, "هـ": 4, "ه": 4}
DEFAULT_LABELS = ["Benar", "Salah"]
FIELD_LABELS = {
    "text": "Pertanyaan", "choices": "Pilihan", "correct_choice": "Kunci", "correct_choices": "Kunci",
    "points": "Poin", "kind": "Jenis", "text_direction": "Arah teks", "stimulus": "Stimulus",
    "category_labels": "Label kategori", "group": "Grup",
}  # fmt: skip

# Karakter kontrol arah yang TIDAK terlihat (LRM, RLM, embedding, override, isolate) dan BOM.
# Sering terbawa saat menyalin dari Word dan mengganggu pengenalan nomor/huruf pilihan.
# Harakat (fathah, kasrah, dst.) TIDAK termasuk di sini, jadi tidak ikut terhapus.
_CONTROL_CODES = [0x200E, 0x200F, *range(0x202A, 0x202F), *range(0x2066, 0x206A), 0xFEFF]
INVISIBLE_CONTROLS = re.compile("[" + "".join(map(chr, _CONTROL_CODES)) + "]")
ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
NBSP = chr(0xA0)

QUESTION_RE = re.compile(r"^\s*([0-9٠-٩]+)\s*[.)]\s*(.*)$")
OPTION_RE = re.compile(r"^\s*(\*)?\s*\(?\s*([A-Ea-e]|هـ|[أابجده])\s*[.)]\s*(.*)$")
META_RE = re.compile(
    r"^\s*(kunci|jawaban|poin|nilai|arah(?: teks)?|jenis|grup|label(?: kategori)?|stimulus|gambar stimulus"
    r"|gambar soal|gambar)\s*:\s*(.*)$",
    re.IGNORECASE,
)
INLINE_IMAGE_RE = re.compile(r"\s*\[gambar\s*:\s*([^\]]+)\]\s*$", re.IGNORECASE)
# Penanda jenis setelah nomor soal, mis. "3. [pg kompleks] Pilih ..." atau "4. [kategori] ...".
KIND_TAG_RE = re.compile(
    r"^\s*\[(esai|essay|uraian|pg kompleks|pgk|mcma|kategori|benar salah|benar/salah)\]\s*", re.IGNORECASE
)
# Pemisah kunci PG kompleks: "A, C" / "A;C" / "A C". Kategori: "B, S, B" atau "Benar; Salah".
KEY_SPLIT_RE = re.compile(r"[\s,;/]+")
CATEGORY_KEY_SPLIT_RE = re.compile(r"\s*[,;]\s*")
LABEL_SPLIT_RE = re.compile(r"\s*[/;|]\s*")


def clean(text):
    return INVISIBLE_CONTROLS.sub("", str(text or "")).replace(NBSP, " ")


def key_index(value):
    """'B' / 'b' / 'ب' / '2' -> 1. None jika kosong, -1 jika tidak dikenali."""
    value = clean(value).strip().rstrip(".)")
    if not value:
        return None
    if value.upper() in LETTERS:
        return LETTERS.index(value.upper())
    if value in ARABIC_LETTER_INDEX:
        return ARABIC_LETTER_INDEX[value]
    digits = value.translate(ARABIC_DIGITS)
    return int(digits) - 1 if digits.isdigit() and int(digits) >= 1 else -1


def category_index(token, labels):
    """Jawaban satu pernyataan kategori -> indeks label: 'Benar' / 'B' / '1' -> 0, 'Salah' / 'S' / '2' -> 1.
    Mengikuti label soal (mis. 'Sesuai' / 'S', 'Tidak sesuai' / 'T'). -1 jika tidak dikenali."""
    value = token.strip().rstrip(".").lower()
    lowered = [label.lower() for label in labels]
    if value in lowered:
        return lowered.index(value)
    initials = [label[:1] for label in lowered]
    if len(set(initials)) == len(initials) and value in initials:
        return initials.index(value)
    if value in ("1", "2"):
        return int(value) - 1
    return {"benar": 0, "b": 0, "ya": 0, "salah": 1, "s": 1, "tidak": 1}.get(value, -1)


def empty_images():
    return {"stimulus": "", "question": "", "choices": {}}


def normalize_item(label, raw):
    """Ubah hasil baca (Excel/teks) menjadi data soal + daftar error awal."""
    errors = list(raw.get("errors", []))
    kind_text = clean(raw.get("kind", "")).strip().lower()
    choices = [clean(c).strip() for c in raw.get("choices", [])]
    starred = list(raw.get("starred") or [])
    if kind_text:
        kind = KIND_ALIASES.get(kind_text)
        if kind is None:
            errors.append("Jenis harus 'pg', 'pg kompleks', 'kategori', atau 'esai'.")
            kind = QuestionKind.CHOICE
    elif not choices:
        kind = QuestionKind.ESSAY
    else:
        # Lebih dari satu pilihan bertanda * = PG kompleks.
        kind = QuestionKind.MULTIPLE if len(starred) > 1 else QuestionKind.CHOICE

    direction = DIRECTION_ALIASES.get(clean(raw.get("direction", "")).strip().lower())
    if direction is None:
        errors.append("Arah teks harus 'otomatis', 'rtl', atau 'ltr'.")
        direction = TextDirection.AUTO

    points_text = clean(raw.get("points", "")).strip()
    if points_text:
        points = int(points_text) if points_text.isdigit() else points_text
    else:
        points = 5 if kind == QuestionKind.ESSAY else 1

    key_text = clean(raw.get("key", "")).strip()
    correct, correct_list, labels = None, [], []
    if kind == QuestionKind.CHOICE:
        correct = key_index(key_text) if key_text else (starred[0] if starred else None)
        if correct is not None and not 0 <= correct < len(choices):
            errors.append(f"Kunci '{key_text}' tidak cocok dengan pilihan yang ada.")
            correct = None
    elif kind == QuestionKind.MULTIPLE:
        if key_text:
            correct_list = [key_index(token) for token in KEY_SPLIT_RE.split(key_text) if token]
        else:
            correct_list = starred
        if any(i is None or not 0 <= i < len(choices) for i in correct_list):
            errors.append(f"Kunci '{key_text}' tidak cocok dengan pilihan yang ada (tulis mis. A, C).")
            correct_list = []
    elif kind == QuestionKind.CATEGORY:
        labels = [
            x for x in LABEL_SPLIT_RE.split(clean(raw.get("labels", "")).strip()) if x
        ] or DEFAULT_LABELS
        splitter = CATEGORY_KEY_SPLIT_RE if re.search(r"[,;]", key_text) else re.compile(r"\s+")
        correct_list = [category_index(token, labels) for token in splitter.split(key_text) if token]
        if -1 in correct_list or len(correct_list) != len(choices):
            errors.append(
                f"Kunci kategori harus berisi {len(choices)} jawaban (satu per pernyataan), "
                f"mis. {', '.join(label[:1] for label in labels[:2])}."
            )
            correct_list = []

    return {
        "row": label,
        "data": {
            "kind": kind,
            "group": clean(raw.get("group", "")).strip(),
            "stimulus": clean(raw.get("stimulus", "")).strip(),
            "text": clean(raw.get("text", "")).strip(),
            "text_direction": direction,
            "points": points,
            "choices": choices if kind != QuestionKind.ESSAY else [],
            "correct_choice": correct,
            "correct_choices": correct_list,
            "category_labels": labels,
        },
        "images": raw.get("images") or empty_images(),
        "errors": errors,
    }


# ---------------------------------------------------------------- Excel


def parse_excel(file):
    items = []
    for row in read_rows(file, SHEET, COLUMNS, max_rows=300):
        data = row["data"]
        filled = [(i, data[f"choice_{letter}"], data[f"image_{letter}"]) for i, letter in enumerate(LETTERS)]
        # Pilihan dihitung sampai pilihan terakhir yang berisi teks atau gambar.
        last = max((i for i, text, image in filled if text or image), default=-1)
        images = {
            "stimulus": data["stimulus_image"],
            "question": data["question_image"],
            "choices": {i: image for i, _, image in filled[: last + 1] if image},
        }
        choices = [text for _, text, _ in filled[: last + 1]]
        items.append(normalize_item(f"Baris {row['row']}", {**data, "choices": choices, "images": images}))
    return items


# ---------------------------------------------------------------- teks tempel


def parse_text(text):
    """Baca soal yang ditempel. Contoh format (semua baris opsional kecuali nomor & pertanyaan):

    Stimulus: Bacalah teks berikut ...      <- berlaku untuk soal sesudahnya
    Gambar stimulus: grafik.png
    1. Nilai dari $\\frac{1}{2} + \\frac{1}{4}$ adalah ...
    Gambar: soal1.png
    A. $\\frac{3}{4}$
    *B. pilihan (tanda * = kunci)   atau baris "Kunci: B"
    C. pilihan [gambar: c.png]
    Kunci: A
    Poin: 2
    Arah: rtl
    2. [esai] Jelaskan ...                  <- soal tanpa pilihan otomatis dianggap esai
    3. [pg kompleks] Pilih ...              <- kunci lebih dari satu: "Kunci: A, C" atau *A. dan *C.
    4. [kategori] Tentukan benar/salah ...  <- pilihan = pernyataan; "Kunci: B, S, B"
    Label: Sesuai / Tidak sesuai            <- opsional (bawaan Benar / Salah)
    Grup: G1                                <- soal dengan grup sama memakai stimulus bersama
    """
    items, current = [], None
    stimulus, stimulus_image, mode = [], "", None

    def finish():
        if current is not None:
            items.append(normalize_item(f"Soal {current['number']}", current))

    for raw_line in str(text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = clean(raw_line).rstrip()
        if not line.strip():
            if mode == "stimulus" and stimulus:
                stimulus.append("")
            continue

        question = QUESTION_RE.match(line)
        if question:
            finish()
            body = question.group(2)
            current = {
                "number": question.group(1).translate(ARABIC_DIGITS),
                "text": KIND_TAG_RE.sub("", body),
                "kind": tag.group(1).lower() if (tag := KIND_TAG_RE.match(body)) else "",
                "starred": [],
                "stimulus": "\n".join(stimulus).strip(),
                "choices": [],
                "images": {**empty_images(), "stimulus": stimulus_image},
            }
            stimulus, stimulus_image, mode = [], "", "text"
            continue

        meta = META_RE.match(line)
        if meta:
            name, value = meta.group(1).lower(), meta.group(2).strip()
            if name == "stimulus":
                stimulus, mode = ([value] if value else []), "stimulus"
            elif name == "gambar stimulus":
                if mode == "stimulus" or current is None:
                    stimulus_image = value
                else:
                    current["images"]["stimulus"] = value
            elif current is not None:
                if name in ("kunci", "jawaban"):
                    current["key"] = value
                elif name in ("poin", "nilai"):
                    current["points"] = value
                elif name.startswith("arah"):
                    current["direction"] = value
                elif name == "jenis":
                    current["kind"] = value
                elif name == "grup":
                    current["group"] = value
                elif name.startswith("label"):
                    current["labels"] = value
                else:  # gambar / gambar soal
                    current["images"]["question"] = value
                mode = "meta"
            continue

        if mode == "stimulus":
            stimulus.append(line.strip())
            continue
        if current is None:
            continue  # teks sebelum soal pertama (mis. judul) diabaikan

        # Pilihan boleh muncul setelah baris meta (mis. "Gambar: soal.png" sebelum pilihan A).
        option = OPTION_RE.match(line) if mode in ("text", "option", "meta") else None
        if option:
            body = option.group(3)
            image = INLINE_IMAGE_RE.search(body)
            if image:
                current["images"]["choices"][len(current["choices"])] = image.group(1).strip()
                body = body[: image.start()]
            if option.group(1):
                current["starred"].append(len(current["choices"]))
            current["choices"].append(body)
            mode = "option"
        elif mode == "option":
            current["choices"][-1] += " " + line.strip()
        elif mode == "text":
            # Baris baru dipertahankan (penting untuk rumus $$...$$ di baris sendiri).
            current["text"] += "\n" + line.strip()
    finish()
    return items


# ---------------------------------------------------------------- periksa & simpan


def image_names(images):
    names = [name for name in (images["stimulus"], images["question"]) if name]
    return names + [name for name in images["choices"].values() if name]


def prepare(assessment, request, items, zip_images):
    """Periksa setiap soal. Mengembalikan baris (dengan error) + serializer yang siap disimpan."""
    start = (assessment.questions.aggregate(value=Max("order"))["value"] or -1) + 1
    rows = []
    for offset, item in enumerate(items):
        errors = list(item["errors"])
        images = item["images"]
        for name in image_names(images):
            if not zip_images:
                errors.append(f"Soal memakai gambar '{name}': unggah juga file ZIP berisi gambar.")
                break
            if image_key(name) not in zip_images:
                errors.append(f"Gambar '{name}' tidak ada di dalam file ZIP.")
        serializer = QuestionSerializer(
            data={
                **item["data"],
                "assessment": assessment.id,
                "order": start + offset,
                "image_choices": list(images["choices"]),
            },
            context={"request": request},
        )
        if not serializer.is_valid():
            errors += first_errors(serializer.errors, FIELD_LABELS)
        rows.append({"item": item, "serializer": serializer, "errors": errors})
    return rows


def preview(rows):
    return [
        {
            "row": r["item"]["row"],
            **r["item"]["data"],
            "images": {
                "stimulus": r["item"]["images"]["stimulus"],
                "question": r["item"]["images"]["question"],
                "choices": {str(k): v for k, v in r["item"]["images"]["choices"].items()},
            },
            "errors": r["errors"],
        }
        for r in rows
    ]


@transaction.atomic
def save(rows, zip_images):
    for row in rows:
        question = row["serializer"].save()
        images = row["item"]["images"]
        slots = [(ImageSlot.STIMULUS, 0, images["stimulus"]), (ImageSlot.QUESTION, 0, images["question"])]
        slots += [(ImageSlot.CHOICE, index, name) for index, name in images["choices"].items()]
        for slot, index, name in slots:
            if name:
                original, data = zip_images[image_key(name)]
                save_image(question, slot, index, original, data)
    return len(rows)


# ---------------------------------------------------------------- template


# Contoh LaTeX yang sering dipakai di SMK. Ditulis sebagai raw string agar backslash tidak berubah.
FORMULA_CHEATSHEET = [
    ("Pecahan", r"$\frac{3}{4}$", "tiga per empat"),
    ("Pecahan campuran", r"$2\frac{1}{3}$", "dua sepertiga"),
    ("Pangkat", r"$x^{2}$  atau  $2^{10}$", "pangkat lebih dari 1 digit wajib pakai { }"),
    ("Indeks bawah", r"$x_{1}$, $U_{n}$", "mis. suku ke-n"),
    ("Akar kuadrat", r"$\sqrt{16}$", ""),
    ("Akar pangkat n", r"$\sqrt[3]{27}$", "akar pangkat tiga"),
    ("Logaritma", r"$\log_{2} 8$  atau  ${}^{2}\log 8$", "gaya penulisan buku Indonesia: yang kedua"),
    ("Logaritma natural", r"$\ln x$", ""),
    ("Trigonometri", r"$\sin 30^\circ$, $\cos \alpha$, $\tan x$", r"^\circ = derajat"),
    ("Identitas trigonometri", r"$\sin^{2} x + \cos^{2} x = 1$", ""),
    ("Integral tak tentu", r"$\int x^{2}\,dx$", r"\, = spasi kecil"),
    ("Integral tentu", r"$\int_{0}^{2} (3x^{2} + 1)\,dx$", ""),
    ("Limit", r"$\lim_{x \to 0} \frac{\sin x}{x}$", ""),
    ("Turunan", r"$f'(x)$  atau  $\frac{dy}{dx}$", ""),
    ("Notasi sigma", r"$\sum_{i=1}^{n} i$", ""),
    ("Matriks", r"$\begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}$", r"& = pindah kolom, \\ = pindah baris"),
    ("Determinan", r"$\begin{vmatrix} a & b \\ c & d \end{vmatrix}$", ""),
    ("Sistem persamaan", r"$\begin{cases} x + y = 5 \\ 2x - y = 1 \end{cases}$", ""),
    ("Pertidaksamaan", r"$x \le 3$, $x \ge -1$, $x \neq 0$", ""),
    ("Operasi", r"$a \times b$, $a \div b$, $\pm$", ""),
    ("Simbol", r"$\pi$, $\infty$, $\alpha$, $\beta$, $\theta$", ""),
    ("Satuan & koma desimal", r"$2{,}5\,\Omega$", r"{,} = koma desimal, \Omega = ohm"),
    ("Vektor", r"$\vec{AB}$", ""),
    ("Persen", r"$25\%$", r"\% agar tanda % tidak dianggap komentar"),
    ("Rumus di baris sendiri", r"$$x = \frac{-b \pm \sqrt{b^{2} - 4ac}}{2a}$$", "pakai $$ ... $$"),
]

_BLANK_IMAGES = ["", "", "", "", ""]


def example(kind, text, choices=(), key="", points="", group="", stimulus="", stimulus_image="",
            direction="otomatis", labels=""):  # fmt: skip
    """Satu baris contoh sesuai urutan COLUMNS."""
    choices = [*choices, *[""] * (len(LETTERS) - len(choices))]
    return [kind, group, stimulus, stimulus_image, text, "", direction, points, *choices, *_BLANK_IMAGES,
            key, labels]  # fmt: skip


EXAMPLE_TABLE = (
    "Perhatikan tabel peserta ekstrakurikuler (*extracurricular*) berikut.\n\n"
    "| Kegiatan | Kelas X | < |\n"
    "| | Laki-laki | Perempuan |\n"
    "|---|---|---|\n"
    "| Pramuka | 6 | 4 |\n"
    "| Robotik | 8 | 2 |"
)
EXAMPLE_READING = (
    "Bacalah teks berikut untuk menjawab soal nomor 5 dan 6.\n\n"
    "Setiap pagi para santri menyetor hafalan sebelum berangkat ke sekolah. Setelah pulang, mereka "
    "mengikuti kegiatan praktik di laboratorium komputer."
)
EXAMPLES = [
    example("pg", r"Nilai dari $\frac{1}{2} + \frac{1}{4}$ adalah ...",
            [r"$\frac{3}{4}$", r"$\frac{2}{6}$", r"$\frac{1}{6}$", r"$\frac{2}{4}$"], "A", 2),
    example("pg", "Bagian siswa kelas X yang mengikuti Pramuka adalah ...",
            [r"$\frac{1}{2}$", r"$\frac{1}{4}$", r"$\frac{2}{5}$", r"$\frac{3}{10}$"], "A", 2,
            stimulus=EXAMPLE_TABLE),
    example("pg kompleks", r"Bilangan yang nilainya sama dengan $\frac{1}{2}$ adalah ...",
            [r"$\frac{2}{4}$", r"$0{,}5$", r"$50\%$", r"$\frac{3}{5}$"], "A, B, C", 2),
    example("kategori", "Tentukan benar atau salah setiap pernyataan tentang HTML berikut.",
            ["Tag <br> tidak memerlukan tag penutup.", "Atribut href dipakai untuk alamat gambar pada <img>.",
             "Tag <h1> menghasilkan judul paling besar."], "B, S, B", 3, labels="Benar / Salah"),
    example("pg", "Kegiatan santri setelah pulang sekolah adalah ...",
            ["Menyetor hafalan", "Praktik di laboratorium komputer", "Berangkat ke sekolah"], "B",
            group="G1", stimulus=EXAMPLE_READING),
    example("kategori", "Tentukan kesesuaian pernyataan berikut dengan teks.",
            ["Santri menyetor hafalan pada pagi hari.", "Praktik dilakukan sebelum berangkat sekolah."],
            "S, T", 2, group="G1", labels="Sesuai / Tidak sesuai"),
    example("esai", r"Tentukan nilai $x$ dan $y$ dari $$\begin{cases} x + y = 5 \\ x - y = 1 \end{cases}$$",
            points=5),
    example("pg", "Arti kata «الْمَدْرَسَةُ» dalam bahasa Indonesia adalah ...",
            ["Sekolah", "Masjid", "Rumah", "Pasar"], "A"),
    example("pg", "إِلَى أَيْنَ ذَهَبَ أَحْمَدُ؟",
            ["إِلَى الْمَدْرَسَةِ", "إِلَى السُّوْقِ", "إِلَى الْبَيْتِ", "إِلَى الْمَسْجِدِ"], "A",
            stimulus="اِقْرَأِ النَّصَّ التَّالِيَ: ذَهَبَ أَحْمَدُ إِلَى الْمَدْرَسَةِ صَبَاحًا.", direction="rtl"),
    example("pg", r"Jika $R_{1} = 4\,\Omega$ dan $R_{2} = 6\,\Omega$ disusun seri, hambatan totalnya adalah ...",
            [r"$10\,\Omega$", r"$2{,}4\,\Omega$", r"$24\,\Omega$", r"$2\,\Omega$"], "A", 2,
            stimulus="Perhatikan gambar rangkaian listrik berikut.", stimulus_image="rangkaian1.png"),
]  # fmt: skip

GUIDE = [
    "Jenis*    : pg (pilihan ganda), pg kompleks (jawaban benar lebih dari satu), kategori, atau esai.",
    "Pertanyaan* wajib diisi. Poin: kosong = 1 (pg/pg kompleks/kategori) atau 5 (esai).",
    "Stimulus  : bacaan/keterangan/tabel sebelum pertanyaan (opsional).",
    "Pilihan   : isi Pilihan A-E seperlunya (minimal 2). Kunci pg: A-E. Kunci pg kompleks: mis. A, C.",
    "KATEGORI  : Pilihan A-E = pernyataan. Kunci = jawaban tiap pernyataan, mis. B, S, B (Benar, Salah, Benar).",
    "            Label Kategori: kosong = Benar / Salah; bisa diganti mis. Sesuai / Tidak sesuai (kunci: S, T).",
    "GRUP      : soal dengan kode Grup yang sama (mis. G1) memakai stimulus bersama.",
    "            Isi stimulus hanya di soal PERTAMA grup itu; soal berikutnya kosongkan stimulusnya.",
    "TABEL     : tulis tiap baris dengan garis tegak, mis. | Nama | Nilai |  lalu baris |---|---| di bawah judul.",
    "            Baris sebelum |---| = judul tabel; sel berisi < = gabung dengan sel di kirinya. Alt+Enter = baris baru di sel.",
    "MIRING    : *istilah asing* (satu bintang) = huruf miring; **teks** = tebal.",
    "RUMUS     : tulis LaTeX di antara $...$ (dalam kalimat) atau $$...$$ (baris sendiri). Lihat lembar 'Contekan Rumus'.",
    "ARAB      : ketik/salin teks Arab berharakat langsung. Arah Teks 'rtl' untuk soal berbahasa Arab; 'otomatis' untuk campuran.",
    "GAMBAR    : isi kolom Gambar Stimulus / Gambar Soal / Gambar A-E dengan NAMA FILE (mis. grafik1.png),",
    "            lalu unggah semua gambar dalam satu file ZIP bersama Excel ini. Gambar: PNG/JPG/GIF/WEBP, maks. 2 MB.",
    "Pilihan boleh hanya berupa gambar: kosongkan teks Pilihan dan isi kolom Gambar-nya.",
    "Tip       : sel sudah berformat Teks agar Excel tidak mengubah isian (mis. 1/2 menjadi tanggal).",
]


def build_question_template():
    return build_template(
        SHEET,
        COLUMNS,
        "Template Soal Lembar Asesmen - LMS SMKS Nurul Jadid",
        GUIDE,
        EXAMPLES,
        max_rows=300,
        extra_sheets=[
            (
                "Contekan Rumus",
                ["Kebutuhan", "Tulis di sel (LaTeX)", "Keterangan"],
                [list(row) for row in FORMULA_CHEATSHEET],
            )
        ],
    )
