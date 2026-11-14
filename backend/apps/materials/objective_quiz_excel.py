"""Impor kuis per capaian dari Excel (guru pengampu).

Template yang diunduh SUDAH berisi kuis yang ada (lengkap dengan kunci), jadi guru bisa memakainya
untuk menambah maupun mengubah soal. Pola sama dengan impor lain: Periksa (tidak menyimpan) ->
Impor jika SEMUA baris benar. Capaian yang muncul di file diganti seluruh soalnya; capaian yang
tidak ada di file tidak berubah.

Kolom: No Capaian, Jenis (pg / isian / seret / jodohkan), Pertanyaan, Kalimat [[...]] (isian/seret),
Pilihan A-E, Kunci (huruf, khusus pg), Pembahasan.
"""

import io

from openpyxl import load_workbook
from rest_framework.exceptions import ValidationError

from apps.common.excel import Column, build_template, cell_text, read_rows

from .objective_quiz import MAX_QUESTIONS, build_quiz, quiz_for

SHEET = "Kuis"
LETTERS = "ABCDE"
KIND_TO_TEXT = {"choice": "pg", "fill_blank": "isian", "drag_drop": "seret", "matching": "jodohkan"}
TEXT_TO_KIND = {
    "pg": "choice", "pilihan ganda": "choice",
    "isian": "fill_blank", "isian singkat": "fill_blank",
    "seret": "drag_drop", "tarik lepas": "drag_drop", "tarik & lepas": "drag_drop",
    "jodohkan": "matching", "menjodohkan": "matching",
}  # fmt: skip


def columns_for(material):
    numbers = [str(i) for i in range(1, len(material.objectives) + 1)]
    return [
        Column("objective", "No Capaian", required=True, width=12, choices=numbers),
        Column("kind", "Jenis", required=True, width=12, choices=["pg", "isian", "seret", "jodohkan"]),
        Column("text", "Pertanyaan", width=50, text=True),
        Column("template", "Kalimat [[...]]", width=50, text=True),
        *[Column(f"choice_{letter}", f"Pilihan {letter}", width=28, text=True) for letter in LETTERS],
        Column("key", "Kunci", width=8, text=True),
        Column("explanation", "Pembahasan", width=40, text=True),
    ]


def item_to_row(number, item):
    """Satu soal tersimpan -> baris Excel (urutan kolom sama dengan columns_for)."""
    kind = item["kind"]
    choices, key, template = [], "", ""
    if kind == "choice":
        choices = item["choices"]
        key = LETTERS[item["correct_choice"]]
    elif kind == "fill_blank":
        template = item["template"]
    elif kind == "drag_drop":
        template = item["template"]
        choices = item.get("distractors", [])
    else:
        choices = [f"{p['left']} = {p['right']}" for p in item["pairs"]]
        choices += [f"= {d}" for d in item.get("distractors", [])]
    choices = (list(choices) + [""] * len(LETTERS))[: len(LETTERS)]
    return [str(number), KIND_TO_TEXT[kind], item.get("text", ""), template, *choices, key,
            item.get("explanation", "")]  # fmt: skip


def build_quiz_template(material):
    rows = []
    for index in range(len(material.objectives)):
        quiz = quiz_for(material, index)
        rows += [item_to_row(index + 1, item) for item in (quiz or {}).get("spec", [])]
    guide = [
        "Satu baris = satu soal. No Capaian = nomor capaian materi (lihat daftar di bawah).",
        f"Setiap capaian berisi 1-{MAX_QUESTIONS} soal. Capaian yang ada di file DIGANTI seluruh soalnya;",
        "capaian yang tidak ada di file tidak berubah. File ini sudah berisi kuis yang ada (jika ada).",
        "pg       : Pertanyaan + Pilihan A-E (minimal 2) + Kunci huruf, mis. B.",
        "isian    : Kalimat berisi jawaban dalam [[...]]; jawaban lain yang benar dipisah |,",
        "           mis. Hasil 17 % 5 adalah [[2]]. Pertanyaan = petunjuk (boleh kosong).",
        "seret    : Kalimat berisi [[jawaban]] (satu per celah); Pilihan A-E = pengecoh (boleh kosong).",
        "jodohkan : Pertanyaan + Pilihan A-E berisi pasangan 'kiri = kanan'; pengecoh kanan ditulis '= teks'.",
        "Pembahasan tampil ke siswa setelah semua soal capaian itu dijawab benar.",
        "",
        "Daftar capaian materi ini:",
        *[f"{i}. {text}" for i, text in enumerate(material.objectives, start=1)],
    ]
    examples = [
        ["1", "pg", "2 + 3 = ...", "", "4", "5", "6", "", "", "B", "Dua tambah tiga sama dengan lima."],
        ["1", "isian", "Lengkapi kalimat berikut.", "Ibu kota Indonesia adalah [[Jakarta]].",
         "", "", "", "", "", "", ""],
        ["1", "jodohkan", "Pasangkan elemen dengan fungsinya.", "", "Input = Membaca data",
         "Output = Menampilkan hasil", "= Menghapus data", "", "", "", ""],
    ]  # fmt: skip
    content = build_template(
        SHEET, columns_for(material), f"Kuis Capaian - {material.title}", guide, examples, max_rows=200
    )
    if not rows:
        return content
    # Isi lembar Kuis dengan soal yang sudah ada.
    workbook = load_workbook(io.BytesIO(content))
    sheet = workbook[SHEET]
    for row_number, values in enumerate(rows, start=2):
        for column, value in enumerate(values, start=1):
            sheet.cell(row=row_number, column=column, value=value or None)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def row_to_item(data):
    """Baris Excel -> (rancangan soal, daftar error). Rancangan diperiksa lagi oleh build_quiz."""
    errors = []
    kind = TEXT_TO_KIND.get(data["kind"].strip().lower())
    if kind is None:
        return None, ["Jenis harus pg, isian, seret, atau jodohkan."]
    filled = [data[f"choice_{letter}"].strip() for letter in LETTERS]
    last = max((i for i, text in enumerate(filled) if text), default=-1)
    choices = filled[: last + 1]
    item = {"kind": kind, "text": data["text"].strip(), "explanation": data["explanation"].strip()}
    if kind == "choice":
        key = data["key"].strip().upper()
        if len(key) != 1 or key not in LETTERS[: len(choices)]:
            errors.append("Kunci pg harus satu huruf yang sesuai dengan pilihan (mis. B).")
        item.update(choices=choices, correct_choice=LETTERS.index(key) if key in LETTERS else 0)
    elif kind in ("fill_blank", "drag_drop"):
        if "[[" not in data["template"]:
            errors.append("Isi kolom Kalimat dengan jawaban di dalam [[...]].")
        item["template"] = data["template"].strip()
        if kind == "drag_drop":
            item["distractors"] = [c for c in choices if c]
    else:
        pairs, distractors = [], []
        for text in choices:
            if not text:
                continue
            left, sep, right = text.partition("=")
            if not sep:
                errors.append(f"Pilihan jodohkan harus berbentuk 'kiri = kanan': {text}")
            elif left.strip():
                pairs.append({"left": left.strip(), "right": right.strip()})
            else:
                distractors.append(right.strip())
        item.update(pairs=pairs, distractors=distractors)
    return item, errors


def check_file(file, material):
    """Baca & periksa file. Mengembalikan (baris pratinjau, {indeks capaian: [rancangan soal]})."""
    rows = read_rows(file, SHEET, columns_for(material), max_rows=200)
    preview, grouped = [], {}
    for row in rows:
        data = row["data"]
        number = cell_text(data["objective"])
        errors = []
        index = int(number) - 1 if number.isdigit() else -1
        if not 0 <= index < len(material.objectives):
            errors.append(f"No Capaian harus 1 sampai {len(material.objectives)}.")
        item, item_errors = row_to_item(data)
        errors += item_errors
        if item and not item_errors:
            try:
                build_quiz([item])  # periksa satu soal dengan aturan yang sama dengan penyimpanan
            except ValidationError as error:
                detail = error.detail
                message = detail.get("quizzes") if isinstance(detail, dict) else detail
                errors.append(str(message).replace("Soal nomor 1: ", ""))
        if not errors and index >= 0:
            grouped.setdefault(index, []).append(item)
        preview.append(
            {
                "row": row["row"],
                "objective": number,
                "kind": data["kind"],
                "text": data["text"] or data["template"],
                "errors": errors,
            }
        )
    for index, items in grouped.items():
        if len(items) > MAX_QUESTIONS:
            for row in preview:
                if row["objective"] == str(index + 1):
                    row["errors"].append(f"Capaian {index + 1} berisi lebih dari {MAX_QUESTIONS} soal.")
    return preview, grouped
