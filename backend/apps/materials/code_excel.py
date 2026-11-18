"""Impor soal Praktik satu materi dari Excel (guru pengampu).

Template yang diunduh SUDAH berisi soal Praktik materi itu (atau contoh jika masih kosong), jadi dipakai
untuk menambah maupun mengubah. Pola sama dengan impor lain: Periksa (tidak menyimpan) -> Impor jika SEMUA
benar. Judul sama (huruf besar/kecil diabaikan) = soal itu diganti isinya; judul baru = dibuat; soal yang
tidak ada di file tidak berubah. Setiap soal divalidasi CodeExerciseSerializer (sama dengan form).

Lembar:
- Soal           : Judul*, Bahasa* (python/php/html/flowchart/matematika), Petunjuk, Kode Awal
- Cek Program    : Judul Soal*, Masukan, Keluaran*            (python, php, flowchart)
- Cek HTML       : Judul Soal*, Jenis*, Elemen, Properti CSS, Nilai, Elemen Hasil
- Soal Matematika: Judul Soal*, Pertanyaan*, Rumus Jawaban*, Toleransi
- Variabel       : Judul Soal*, Huruf*, Terkecil*, Terbesar*, Langkah   (matematika, angka acak per siswa)
Flowchart awal tidak bisa ditulis di Excel: flowchart awal soal lama dipertahankan (ubah lewat form).
"""

import io

from django.db import transaction
from django.db.models import Max
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from rest_framework.exceptions import ValidationError

from apps.common.excel import Column, fill_data_sheet, first_errors, normalize, open_workbook, sheet_rows

from .code_practice import IO_LANGUAGES, MAX_EXERCISES
from .models import CodeExercise, CodeLanguage
from .serializers import CodeExerciseSerializer

MAX_ROWS = 200
LANGUAGE_FROM_TEXT = {
    "python": CodeLanguage.PYTHON, "php": CodeLanguage.PHP, "html": CodeLanguage.HTML,
    "html/css/js": CodeLanguage.HTML, "flowchart": CodeLanguage.FLOWCHART,
    "matematika": CodeLanguage.MATH, "math": CodeLanguage.MATH,
}  # fmt: skip
LANGUAGE_TO_TEXT = {
    CodeLanguage.PYTHON: "python", CodeLanguage.PHP: "php", CodeLanguage.HTML: "html",
    CodeLanguage.FLOWCHART: "flowchart", CodeLanguage.MATH: "matematika",
}  # fmt: skip
HTML_TYPES = ["exists", "text", "style", "console", "click"]

SHEETS = {
    "Soal": [
        Column("title", "Judul", required=True, width=32),
        Column("language", "Bahasa", required=True, width=14, choices=list(LANGUAGE_TO_TEXT.values())),
        Column("instructions", "Petunjuk", width=50),
        Column("starter_code", "Kode Awal", width=50, text=True),
    ],
    "Cek Program": [
        Column("title", "Judul Soal", required=True, width=32),
        Column("input", "Masukan", width=24, text=True),
        Column("output", "Keluaran", required=True, width=24, text=True),
    ],
    "Cek HTML": [
        Column("title", "Judul Soal", required=True, width=32),
        Column("type", "Jenis", required=True, width=12, choices=HTML_TYPES),
        Column("selector", "Elemen", width=18, text=True),
        Column("property", "Properti CSS", width=18, text=True),
        Column("value", "Nilai", width=22, text=True),
        Column("target", "Elemen Hasil", width=18, text=True),
    ],
    "Soal Matematika": [
        Column("title", "Judul Soal", required=True, width=32),
        Column("question", "Pertanyaan", required=True, width=50, text=True),
        Column("answer", "Rumus Jawaban", required=True, width=22, text=True),
        Column("tolerance", "Toleransi", width=12, text=True),
    ],
    "Variabel": [
        Column("title", "Judul Soal", required=True, width=32),
        Column("name", "Huruf", required=True, width=8, text=True),
        Column("min", "Terkecil", required=True, width=10, text=True),
        Column("max", "Terbesar", required=True, width=10, text=True),
        Column("step", "Langkah", width=10, text=True),
    ],
}

GUIDE = [
    "File ini berisi soal Praktik materi ini. Ubah atau tambahkan baris, lalu impor (maks. 5 soal per materi).",
    "Judul yang SAMA dengan soal yang ada = soal itu DIGANTI isinya. Judul baru = soal baru. Soal lain tidak berubah.",
    "Semua baris harus benar; jika ada yang salah, tidak ada yang disimpan.",
    "",
    "Lembar Soal: satu baris = satu soal. Bahasa: python, php, html, flowchart, atau matematika.",
    "  Kode Awal = kerangka kode untuk siswa (opsional; Alt+Enter untuk baris baru di dalam sel).",
    "  Flowchart awal tidak bisa ditulis di Excel: flowchart awal soal yang sudah ada tetap dipakai (ubah lewat form).",
    "",
    "Pemeriksaan ditulis di lembar sesuai bahasanya; kolom Judul Soal = judul di lembar Soal.",
    "  Cek Program (python, php, flowchart): Masukan (baris-baris input) -> Keluaran yang harus ditampilkan.",
    "  Cek HTML: Jenis exists (elemen ada), text (teks elemen memuat Nilai), style (Properti CSS = Nilai),",
    "            console (console.log memuat Nilai), click (klik Elemen, lalu teks Elemen Hasil memuat Nilai).",
    "  Soal Matematika: Pertanyaan (tulis [a] untuk angka acak), Rumus Jawaban (mis. a*b), Toleransi (mis. 0.01).",
    "  Variabel (matematika): Huruf (satu huruf kecil), Terkecil, Terbesar, Langkah (kosong = 1).",
]

EXAMPLES = {
    "Soal": [
        ["Menjumlahkan Dua Bilangan", "python", "Baca dua bilangan bulat, lalu tampilkan jumlahnya.",
         "a = int(input())\nb = int(input())\n"],
        ["Halaman Perkenalan", "html", 'Buat judul h1 berisi "Halo".', "<h1></h1>\n"],
        ["Operasi Hitung", "matematika", "Angka soalmu berbeda dengan temanmu.", ""],
    ],
    "Cek Program": [["Menjumlahkan Dua Bilangan", "3\n4", "7"], ["Menjumlahkan Dua Bilangan", "10\n-2", "8"]],
    "Cek HTML": [["Halaman Perkenalan", "text", "h1", "", "Halo", ""]],
    "Soal Matematika": [["Operasi Hitung", "Hitung $[a] \\times [b]$.", "a*b", ""]],
    "Variabel": [["Operasi Hitung", "a", "2", "12", "1"], ["Operasi Hitung", "b", "2", "9", "1"]],
}  # fmt: skip


def field(check, key):
    """Isi kolom pemeriksaan (kosong jika tidak ada, mis. data lama)."""
    return check.get(key, "")


def _number_text(value):
    return str(int(value)) if float(value).is_integer() else str(value)


def build_code_template(material):
    """Template Excel berisi soal Praktik materi ini (atau contoh jika belum ada)."""
    exercises = list(material.exercises.order_by("order", "id"))
    data = {title: [] for title in SHEETS}
    for exercise in exercises:
        starter = "" if exercise.language == CodeLanguage.FLOWCHART else exercise.starter_code
        data["Soal"].append(
            [exercise.title, LANGUAGE_TO_TEXT[exercise.language], exercise.instructions, starter]
        )
        for check in exercise.checks:
            if exercise.language in IO_LANGUAGES:
                data["Cek Program"].append([exercise.title, field(check, "input"), field(check, "output")])
            elif exercise.language == CodeLanguage.HTML:
                data["Cek HTML"].append(
                    [exercise.title]
                    + [field(check, k) for k in ("type", "selector", "property", "value", "target")]
                )
            else:
                data["Soal Matematika"].append(
                    [
                        exercise.title,
                        field(check, "question"),
                        field(check, "answer"),
                        field(check, "tolerance"),
                    ]
                )
        for name, spec in sorted((exercise.variables or {}).items()):
            data["Variabel"].append(
                [exercise.title, name, _number_text(spec["min"]), _number_text(spec["max"]),
                 _number_text(spec["step"])]
            )  # fmt: skip
    if not exercises:
        data = EXAMPLES  # materi belum punya soal: beri contoh agar guru tahu cara mengisinya

    workbook = Workbook()
    guide = workbook.active
    guide.title = "Petunjuk"
    guide.cell(row=1, column=1, value=f"Soal Praktik - {material.title}").font = Font(bold=True, size=13)
    for row, text in enumerate(GUIDE, start=3):
        guide.cell(row=row, column=1, value=text)
    guide.column_dimensions["A"].width = 110
    for title, columns in SHEETS.items():
        sheet = workbook.create_sheet(title)
        fill_data_sheet(workbook, sheet, columns, MAX_ROWS)
        for row_number, values in enumerate(data[title], start=2):
            for column, value in enumerate(values, start=1):
                cell = sheet.cell(row=row_number, column=column, value=value if value != "" else None)
                cell.alignment = Alignment(wrap_text=True, vertical="top")
    if "Daftar" in workbook.sheetnames:
        workbook.move_sheet("Daftar", offset=len(workbook.sheetnames))
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def check_code_file(file, material, request):
    """Periksa file. Mengembalikan (pratinjau, rencana). Pratinjau = satu baris per soal
    {row, kind (bahasa), text (judul), action, errors}; rencana = [(soal lama/None, data serializer)]."""
    workbook = open_workbook(file)
    sheets = {
        title: sheet_rows(workbook[title], columns, MAX_ROWS) if title in workbook.sheetnames else []
        for title, columns in SHEETS.items()
    }
    workbook.close()
    if not sheets["Soal"]:
        raise ValidationError({"file": "Tidak ada soal di lembar 'Soal'."})

    existing = {}
    for exercise in material.exercises.order_by("order", "id"):
        existing.setdefault(normalize(exercise.title), exercise)

    # Pemeriksaan & variabel dikelompokkan per judul soal.
    grouped = {title: {} for title in SHEETS if title != "Soal"}
    for title, rows in sheets.items():
        if title == "Soal":
            continue
        for item in rows:
            grouped[title].setdefault(normalize(item["data"]["title"]), []).append(item)

    preview, plan, seen = [], [], {}
    new_count = 0
    for item in sheets["Soal"]:
        data, errors = item["data"], []
        key = normalize(data["title"])
        if key in seen:
            errors.append(
                f"Judul '{data['title']}' sudah ada di baris {seen[key]}. Judul tidak boleh kembar."
            )
        seen.setdefault(key, item["row"])
        instance = existing.get(key)
        if instance is None:
            new_count += 1
        language = LANGUAGE_FROM_TEXT.get(normalize(data["language"]))
        if language is None:
            errors.append("Bahasa: isi python, php, html, flowchart, atau matematika.")
        values = {
            "material": material.id,
            "title": data["title"],
            "language": language or "",
            "instructions": data["instructions"],
            "starter_code": data["starter_code"],
            "checks": [],
            "variables": {},
        }
        if language == CodeLanguage.FLOWCHART:
            # Flowchart awal tidak ditulis di Excel: pakai yang lama (jika soal lama juga flowchart).
            keep = instance and instance.language == CodeLanguage.FLOWCHART
            values["starter_code"] = instance.starter_code if keep else ""
        if language in IO_LANGUAGES:
            values["checks"] = [
                {"input": c["data"]["input"], "output": c["data"]["output"]}
                for c in grouped["Cek Program"].pop(key, [])
            ]
        elif language == CodeLanguage.HTML:
            values["checks"] = [
                {k: c["data"][k] for k in ("type", "selector", "property", "value", "target")}
                for c in grouped["Cek HTML"].pop(key, [])
            ]
        elif language == CodeLanguage.MATH:
            values["checks"] = [
                {k: c["data"][k] for k in ("question", "answer", "tolerance")}
                for c in grouped["Soal Matematika"].pop(key, [])
            ]
            values["variables"] = {
                v["data"]["name"]
                .strip()
                .lower(): {
                    "min": v["data"]["min"].replace(",", "."),
                    "max": v["data"]["max"].replace(",", "."),
                    "step": (v["data"]["step"] or "1").replace(",", "."),
                }
                for v in grouped["Variabel"].pop(key, [])
            }
        if not errors:
            serializer = CodeExerciseSerializer(instance, data=values, context={"request": request})
            if not serializer.is_valid():
                errors += first_errors(serializer.errors, LABELS)
        plan.append((instance, values))
        preview.append(
            {
                "row": item["row"],
                "kind": data["language"],
                "text": data["title"],
                "action": "diperbarui" if instance else "baru",
                "errors": errors,
            }
        )

    if material.exercises.count() + new_count > MAX_EXERCISES:
        preview[0]["errors"].append(
            f"Materi ini paling banyak {MAX_EXERCISES} soal Praktik (sudah ada {material.exercises.count()})."
        )
    # Pemeriksaan untuk judul yang tidak ada di lembar Soal (atau bahasanya tidak cocok).
    for title, rows in grouped.items():
        for items in rows.values():
            for item in items:
                preview.append(
                    {
                        "row": item["row"],
                        "kind": "-",
                        "text": f"{title}: {item['data']['title']}",
                        "action": "",
                        "errors": [
                            f"Lembar {title} baris {item['row']}: judul soal tidak ada di lembar Soal "
                            "atau bahasanya tidak sesuai lembar ini."
                        ],
                    }
                )
    return preview, plan


LABELS = {
    "title": "Judul",
    "language": "Bahasa",
    "instructions": "Petunjuk",
    "starter_code": "Kode Awal",
    "checks": "Pemeriksaan",
    "variables": "Variabel",
    "material": "Materi",
}


@transaction.atomic
def save_code_plan(plan, material, request):
    """Simpan hasil check_code_file (hanya jika semua benar). Mengembalikan jumlah soal yang disimpan."""
    last = material.exercises.aggregate(last=Max("order"))["last"] or 0
    for instance, values in plan:
        # Total soal sudah dicek untuk seluruh file (maks. 5), jadi batas per soal di serializer pasti lolos.
        serializer = CodeExerciseSerializer(instance, data=values, context={"request": request})
        serializer.is_valid(raise_exception=True)
        if instance is None:
            last += 1
            serializer.save(order=last)
        else:
            serializer.save()
    return len(plan)
