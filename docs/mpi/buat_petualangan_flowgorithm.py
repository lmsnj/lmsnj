"""Membuat isi media "Petualangan Flowgorithm" (X RPL 1) untuk diimpor lewat Studio > Impor > JSON.

Sumber: hasil ekstrak media lama `media-source/flowgorithm-extract.json` (tidak di-commit). Jalankan dari folder
backend dengan venv aktif:

    python ../docs/mpi/buat_petualangan_flowgorithm.py

Hasil (di folder ini):
- petualangan-flowgorithm.json   : media (format "lms-sigma-media"), divalidasi seperti saat terbit;
- tes-awal-flowgorithm.txt       : 10 soal Tes Awal (format "teks tempel" impor soal Asesmen);
- tes-akhir-flowgorithm.txt      : 10 soal Tes Akhir yang setara (konsep sama, angka/kalimat berbeda).
"""

import html
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from apps.assessments.question_import import parse_text  # noqa: E402
from apps.learning_media import schema  # noqa: E402

EXTRACT = ROOT / "media-source" / "flowgorithm-extract.json"
TES_IDX = [0, 2, 5, 6, 8, 9, 13, 17, 18, 21]  # soal Tes Awal/Akhir media lama

# ---------------------------------------------------------------- data tulisan tangan per stasiun
# (tujuan, nama lencana, 3 poin ringkasan, pertanyaan refleksi)
META = {
    1: (["Menjelaskan arti algoritma", "Menyusun langkah algoritma sehari-hari"], "Juru Resep",
        ["Algoritma = langkah jelas & berurutan", "Program = algoritma untuk komputer", "Algoritma punya input, proses, output"],
        "Algoritma apa yang kamu jalankan setiap pagi sebelum ke kelas?"),
    2: (["Menyebutkan ciri algoritma yang baik"], "Pemeriksa Langkah",
        ["Langkah harus jelas & pasti", "Urutannya logis", "Algoritma harus berhenti"],
        "Pernahkah kamu mengikuti petunjuk yang membingungkan? Bagian mana yang tidak jelas?"),
    3: (["Menjelaskan flowchart dan Flowgorithm", "Mengenali simbol dasar"], "Pengenal Simbol",
        ["Flowchart = diagram alur", "Flowgorithm menjalankan flowchart", "Tiap simbol punya bentuk & warna"],
        "Apa bedanya menggambar flowchart di kertas dengan di Flowgorithm?"),
    4: (["Menyebutkan bagian layar Flowgorithm dan fungsinya"], "Penjelajah Layar",
        ["Toolbar: Run & Step", "Console: hasil & isian", "Variable Watch: isi variabel"],
        "Bagian layar mana yang menurutmu paling membantu saat mencari kesalahan?"),
    5: (["Memasangkan simbol flowchart dengan namanya"], "Ahli Simbol",
        ["Input biru, Output hijau", "If merah muda (percabangan)", "Perulangan oranye"],
        "Simbol mana yang paling sulit kamu ingat? Bagaimana cara mengingatnya?"),
    6: (["Menjelaskan variabel", "Menentukan nama variabel yang benar"], "Penjaga Kotak",
        ["Variabel = kotak berlabel", "Nama diawali huruf, tanpa spasi & garis bawah", "Besar kecil huruf tidak dibedakan"],
        "Beri contoh tiga nama variabel untuk data dirimu sendiri."),
    7: (["Membedakan tipe Integer, Real, String, Boolean"], "Pemilah Data",
        ["Integer bulat, Real pecahan", "String teks dalam kutip ganda", "Boolean hanya true/false"],
        "Data apa di sekolahmu yang cocok disimpan sebagai Boolean?"),
    8: (["Menjelaskan array dan indeks yang dimulai dari 0"], "Pemilik Lemari",
        ["Array = lemari berlaci", "Indeks mulai dari 0", "Laci terakhir = jumlah laci - 1"],
        "Data apa di kelasmu yang cocok disimpan dalam array?"),
    9: (["Menghitung dengan operator + - * / % ^", "Menerapkan urutan operasi"], "Kalkulator Cilik",
        ["% = sisa bagi", "Kali & bagi lebih dulu", "& menggabung teks"],
        "Kapan operator sisa bagi (%) berguna dalam kehidupan sehari-hari?"),
    10: (["Menentukan hasil operator banding dan logika"], "Hakim Logika",
         ["== untuk sama dengan", "and butuh keduanya true", "not membalik true/false"],
         "Buat satu syarat dengan and untuk aturan di asramamu."),
    11: (["Menampilkan teks dan isi variabel dengan Output"], "Pembicara Program",
         ["Teks ditulis dalam kutip ganda", "Variabel ditulis tanpa kutip", "& menggabung teks & variabel"],
         "Apa bedanya Output \"nama\" dengan Output nama?"),
    12: (["Membaca isian keyboard dengan Input"], "Penanya Ramah",
         ["Input menyimpan isian ke variabel", "Declare dulu sebelum Input", "Tipe variabel menentukan isian"],
         "Program apa yang ingin kamu buat yang bertanya kepada pengguna?"),
    13: (["Menghitung dan menyimpan hasil dengan Assign"], "Penghitung Andal",
         ["= berarti isi kotak kiri", "Hitungan di kanan", "Pakai kurung bila perlu"],
         "Kenapa tanda = di Assign berbeda dengan = di matematika?"),
    14: (["Menyusun program sekuensial yang urut"], "Penyusun Urutan",
         ["Program berjalan dari atas ke bawah", "Declare, Input, Proses, Output", "Urutan salah = hasil salah"],
         "Apa yang terjadi kalau Output ditaruh sebelum perhitungan?"),
    15: (["Menentukan jalur If dari sebuah syarat"], "Penunjuk Jalan",
         ["If memeriksa syarat", "True ke kanan, False ke kiri", "Batas syarat (>, >=) penting"],
         "Keputusan apa hari ini yang bisa kamu tulis sebagai If?"),
    16: (["Menyusun If bersarang untuk banyak pilihan"], "Pemilih Bijak",
         ["Syarat diperiksa dari atas", "Syarat paling ketat lebih dulu", "Genap: bilangan % 2 == 0"],
         "Kenapa urutan pemeriksaan syarat bisa mengubah hasil?"),
    17: (["Menjelaskan cara kerja While"], "Pelari Tangguh",
         ["While cek syarat dulu", "Harus ada perubahan nilai", "Tanpa perubahan = loop tak berhenti"],
         "Kegiatan apa di pondok yang berulang selama syarat tertentu masih benar?"),
    18: (["Memakai For dan Do While"], "Penghitung Putaran",
         ["For: start, end, step", "Step negatif = hitung mundur", "Do While jalan minimal sekali"],
         "Kapan kamu memilih For, dan kapan While?"),
    19: (["Menjelaskan fungsi, parameter, argumen, dan return"], "Montir Mesin",
         ["Fungsi = mesin yang bisa dipakai ulang", "Parameter = bahan masuk", "Return = hasil keluar"],
         "Fungsi apa yang ingin kamu buat agar tidak menulis ulang langkah yang sama?"),
    20: (["Memakai komentar dan langkah demi langkah untuk mencari bug"], "Pemburu Bug",
         ["Komentar = catatan untuk manusia", "Jalankan langkah demi langkah", "Amati Variable Watch"],
         "Bug apa yang paling sering kamu buat? Bagaimana cara menemukannya?"),
    21: (["Mengolah array dengan perulangan For"], "Penjelajah Lemari",
         ["buah[i] memakai indeks dari variabel", "For dari 0 sampai jumlah laci - 1", "Total dihitung dengan menambah tiap laci"],
         "Data apa yang ingin kamu olah dengan array dan perulangan?"),
}  # fmt: skip

PARTS = [
    (
        "Mengenal Algoritma & Flowgorithm",
        "Algoritma, flowchart, layar & simbol Flowgorithm.",
        range(1, 6),
    ),
    (
        "Variabel, Tipe Data & Operator",
        "Kotak penyimpan data dan cara menghitungnya.",
        range(6, 11),
    ),
    (
        "Output, Input & Proses",
        "Komputer bicara, bertanya, dan menghitung secara berurutan.",
        range(11, 15),
    ),
    ("Percabangan & Perulangan", "Memilih jalan dan mengulang langkah.", range(15, 19)),
    (
        "Fungsi, Debug & Array",
        "Mesin yang bisa dipakai ulang, berburu bug, dan lemari data.",
        range(19, 22),
    ),
]

# Jawaban soal "isi lalu jalankan" (media lama hanya menyimpan ujinya).
FILL_ANSWERS = {
    "Sapa Bita!": "nama",
    "Komputer berkata halo": '"Halo, Dunia!"',
    "Tanya umur": "umur",
    "Tanya nama": "nama",
    "Luas persegi panjang": "panjang * lebar",
    "Keliling persegi panjang": "2 * (panjang + lebar)",
    "Sisa bagi": "a % b",
    "Hitung 1 sampai 5": "5",
    "Bilangan genap": "10",
    "Hitung mundur": "-1",
    "Do While": "n <= 3",
    "Genap atau ganjil?": "bilangan % 2 == 0",
    "Berkeliling semua laci": "2",
    "Menjumlahkan isi laci": "a[i]",
}

GLOSSARY = [
    (
        "Algoritma",
        "Urutan langkah yang jelas, logis, dan berhenti untuk menyelesaikan masalah.",
    ),
    ("Program", "Algoritma yang ditulis supaya bisa dijalankan komputer."),
    ("Flowchart", "Diagram alur: langkah-langkah digambar dengan simbol dan panah."),
    ("Flowgorithm", "Aplikasi gratis untuk menggambar dan menjalankan flowchart."),
    ("Variabel", "Kotak berlabel untuk menyimpan data; isinya boleh berubah."),
    ("Tipe data", "Jenis isi variabel: Integer, Real, String, atau Boolean."),
    ("Integer", "Tipe data bilangan bulat, mis. 25."),
    ("Real", "Tipe data bilangan pecahan, mis. 1.35."),
    ("String", "Tipe data teks, ditulis di antara tanda kutip ganda."),
    ("Boolean", "Tipe data yang hanya bernilai true atau false."),
    ("Array", "Satu variabel dengan banyak laci bernomor (indeks mulai dari 0)."),
    ("Indeks", "Nomor laci array; laci pertama berindeks 0."),
    ("Operator", "Tanda untuk menghitung atau membandingkan, mis. +, %, ==."),
    ("Input", "Simbol untuk membaca isian dari keyboard ke variabel."),
    ("Output", "Simbol untuk menampilkan teks atau hasil di Console."),
    ("Assign", "Simbol untuk mengisi variabel dengan hasil hitungan."),
    ("Console", "Jendela tempat hasil Output tampil dan isian diketik."),
    ("Variable Watch", "Jendela yang menampilkan isi variabel saat program berjalan."),
    ("If", "Percabangan: memilih jalur True atau False sesuai syarat."),
    ("While", "Perulangan yang memeriksa syarat dulu sebelum mengulang."),
    ("For", "Perulangan dengan penghitung dari nilai awal sampai nilai akhir."),
    ("Do While", "Perulangan yang mengerjakan isinya dulu, baru memeriksa syarat."),
    ("Fungsi", "Kumpulan langkah bernama yang bisa dipanggil berulang kali."),
    ("Parameter", "Bahan yang diterima fungsi."),
    ("Return", "Hasil yang dikeluarkan fungsi."),
    ("Komentar", "Catatan untuk manusia di dalam program; tidak dijalankan."),
    ("Breakpoint", "Titik berhenti sementara untuk mengintip isi variabel."),
    ("Bug", "Kesalahan di dalam program."),
]

# ---------------------------------------------------------------- alat bantu


def rich(text):
    """HTML media lama -> teks kaya MPI (**tebal**)."""
    text = re.sub(r"</?(b|strong)>", "**", str(text or ""))
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    return html.unescape(text).strip()


def step(kind, **fields):
    return {
        "id": "",
        "kind": kind,
        "title": fields.pop("title", ""),
        "hints": fields.pop("hints", []),
        **fields,
    }


def station(number, title, steps, **extra):
    data = {
        "id": f"st{number:02d}" if isinstance(number, int) else number,
        "title": title,
        "objectives": [],
        "minutes": 10,
        "prerequisites": [],
        "optional": False,
        "badge": None,
        "steps": steps,
        "remedial": [],
        "challenge": [],
        "summary": [],
        "reflection": "",
    }
    data.update(extra)
    return data


def story_dialog(story, title):
    lines = [
        {
            "speaker": "mascot",
            "mood": "happy" if i == 0 else "",
            "text": rich(item["t"]),
        }
        for i, item in enumerate(story)
    ]
    return step("dialog", title=title, lines=lines, image="")


SHAPES = {
    "start": "Main/End (lonjong)",
    "input": "Input",
    "output": "Output",
    "if": "If",
    "while": "While",
    "decl": "Declare",
}


def mc_step(item):
    """PG media lama (boleh berisi gambar simbol atau kotak ekspresi)."""
    question = rich(item["q"])
    shown = item.get("html")
    if isinstance(shown, dict) and shown.get("__shape"):
        question = f"Simbol bertuliskan **{shown['label']}**.\n\n{question}"
    elif isinstance(shown, str) and shown.strip():
        question = f"**{rich(shown)}**\n\n{question}"
    choices = [{"text": rich(o), "why": ""} for o in item["o"]]
    return step(
        "choice",
        text=question,
        image="",
        choices=choices,
        correct=item["a"],
        explanation=rich(item.get("why", "")),
    )


def predict_step(item):
    return step(
        "flowgorithm_predict",
        text=rich(item.get("q") or "Apa yang tampil di Console?"),
        image="",
        program=item["prog"],
        inputs=item.get("inputs") or [],
        show="last" if item.get("last") else "all",
        wrong=[rich(w) for w in item["wrong"]],
        explanation=rich(item.get("why", "")),
        hints=(
            [rich(item["hint"])]
            if item.get("hint")
            else ["Ikuti panah dari atas ke bawah, satu langkah demi satu."]
        ),
    )


def fill_step(item):
    return step(
        "flowgorithm",
        title=item["title"],
        text=rich(item["ask"]),
        image="",
        mode="fill",
        program=item["prog"],
        solution=None,
        answers=[FILL_ANSWERS[item["title"]]],
        tests=[{"inputs": t.get("inputs", []), "expected": t["exp"], "hidden": False} for t in item["tests"]],
        compare="tail",
        explanation=rich(item.get("why", "")),
        hints=[rich(item["hint"])] if item.get("hint") else [],
    )


def activity_steps(activity):
    game, cfg = activity.get("game"), activity.get("cfg")
    if game == "order":
        return [
            step("ordering", title=rich(cfg["title"]), text=rich(cfg.get("intro", "Susun dengan urutan yang benar.")),
                 image="", items=[rich(i) for i in cfg["items"]], why=rich(cfg.get("why", "")), explanation="")
        ]  # fmt: skip
    if game == "sort":
        keys = [c["k"] for c in cfg["cats"]]
        items = [
            {
                "text": rich(i["t"]),
                "category": keys.index(i["c"]),
                "why": rich(i.get("why", "")),
            }
            for i in cfg["items"]
        ]
        return [step("categorize", title=rich(cfg["title"]), text="Kelompokkan ke wadah yang benar.", image="",
                     categories=[rich(c["label"]) for c in cfg["cats"]], items=items, explanation="")]  # fmt: skip
    if game == "pairs":
        pairs = [
            {"left": rich(left["label"]), "right": right} for left, right in zip(cfg["left"], cfg["right"])
        ]
        return [step("matching", title=rich(cfg["title"]), text="Pasangkan isi simbol dengan nama simbolnya.",
                     image="", pairs=pairs, distractors=[], why="", explanation="")]  # fmt: skip
    if game == "mc":
        if isinstance(cfg, dict) and cfg.get("__predict"):
            return [predict_step(item) for item in cfg["__predict"]]
        return [mc_step(item) for item in cfg]
    if game == "fill_run":
        return [fill_step(item) for item in cfg]
    return []


def D(type_, *names, size=None):
    node = {"t": "decl", "type": type_, "names": list(names)}
    if size:
        node["size"] = size
    return node


def A(target, expr):
    return {"t": "assign", "target": target, "expr": expr}


def O(expr):
    return {"t": "output", "expr": expr}


def I(target):
    return {"t": "input", "target": target}


def FOR(v, a, b, body, step_="1"):
    return {"t": "for", "v": v, "from": a, "to": b, "step": step_, "body": body}


def WH(cond, body):
    return {"t": "while", "cond": cond, "body": body}


def IF(cond, yes, no=()):
    return {"t": "if", "cond": cond, "yes": yes, "no": list(no)}


def CM(text):
    return {"t": "cm", "text": text}


def choice(text, options, explanation="", correct=0, hints=()):
    return step("choice", text=text, image="", choices=[{"text": o, "why": ""} for o in options], correct=correct,
                explanation=explanation, hints=list(hints))  # fmt: skip


# Pengganti permainan ketuk media lama (butuh gambar khusus) dan tambahan per stasiun.
EXTRA = {
    4: [
        step("flip_cards", title="Bagian layar Flowgorithm", cards=[
            {"front": "Toolbar", "back": "Deretan tombol di atas, termasuk Run (jalankan) dan Step (satu langkah)."},
            {"front": "Jendela Flowchart", "back": "Tempat menggambar flowchart dari simbol-simbol."},
            {"front": "Console", "back": "Tempat hasil Output tampil dan tempat mengetik isian Input."},
            {"front": "Variable Watch", "back": "Tabel isi variabel yang berubah saat program berjalan."},
        ]),
        choice("Hasil Output tampil di bagian ...", ["Console", "Toolbar", "Variable Watch", "Jendela Flowchart"],
               "Console menampilkan hasil dan menerima isian."),
        choice("Tombol untuk menjalankan program satu langkah demi satu langkah ada di ...",
               ["Toolbar (tombol Step)", "Console", "Variable Watch", "Jendela Flowchart"], "Step ada di Toolbar."),
        choice("Kamu ingin tahu isi variabel **total** saat program berjalan. Lihat bagian ...",
               ["Variable Watch", "Console", "Toolbar", "Jendela Flowchart"], "Variable Watch menampilkan isi variabel."),
    ],
    8: [
        step("flip_cards", title="Lemari buah", cards=[
            {"front": "buah[0]", "back": "Apel (laci pertama)"},
            {"front": "buah[1]", "back": "Jeruk"},
            {"front": "buah[2]", "back": "Jambu"},
            {"front": "buah[3]", "back": "Strawberi"},
            {"front": "buah[4]", "back": "Mangga (laci terakhir)"},
        ]),
        choice("Array **buah** punya 5 laci. Indeks laci terakhir adalah ...", ["4", "5", "1", "0"],
               "Indeks mulai dari 0, jadi 5 laci bernomor 0, 1, 2, 3, 4."),
        choice("Isi buah[2] adalah ...", ["Jambu", "Jeruk", "Strawberi", "Apel"], "buah[0] Apel, buah[1] Jeruk, buah[2] Jambu."),
        step("flowgorithm_demo", title="Lemari buah dalam program", body="Jalankan program, lalu perhatikan isi array **buah** di Pantau Variabel.",
             program={"body": [D("Integer", "i"), D("String", "buah", size=3), A("buah[0]", '"Apel"'), A("buah[1]", '"Jeruk"'),
                               A("buah[2]", '"Jambu"'), FOR("i", "0", "2", [O('"buah " & i & ": " & buah[i]')])]},
             inputs=[], editable=False),
    ],
    20: [
        step("flowgorithm_demo", title="Jalankan langkah demi langkah",
             body="Program ini menjumlahkan 1 sampai 3. Baris berwarna abu-abu adalah **komentar** (tidak dijalankan). "
                  "Tekan **Langkah** berulang kali dan amati nilai **i** dan **total** di Pantau Variabel, seperti "
                  "berhenti di breakpoint.",
             program={"body": [CM("Menjumlahkan 1 sampai 3"), D("Integer", "i", "total"), A("i", "1"), A("total", "0"),
                               WH("i <= 3", [A("total", "total + i"), A("i", "i + 1")]), O('"Jumlah: " & total')]},
             inputs=[], editable=False),
        choice("Program berhenti di breakpoint **sebelum** menjalankan total = total + i pada putaran ke-3. "
               "Berapa nilai i dan total saat itu?",
               ["i = 3, total = 3", "i = 3, total = 6", "i = 2, total = 3", "i = 4, total = 6"],
               "Setelah dua putaran: total = 1 + 2 = 3 dan i sudah menjadi 3.",
               hints=["Hitung putaran pertama dan kedua dulu: total bertambah i, lalu i bertambah 1."]),
        step("flowgorithm", title="Berburu bug", text="Program ini seharusnya menampilkan 1 sampai 5, tetapi tidak "
             "pernah berhenti. Temukan **bug**-nya, perbaiki, lalu jalankan.", image="", mode="build",
             program={"body": [CM("Menampilkan 1 sampai 5"), D("Integer", "i"), A("i", "1"), WH("i <= 5", [O("i"), A("i", "i - 1")])]},
             solution={"body": [CM("Menampilkan 1 sampai 5"), D("Integer", "i"), A("i", "1"), WH("i <= 5", [O("i"), A("i", "i + 1")])]},
             answers=[], tests=[{"inputs": [], "expected": ["1", "2", "3", "4", "5"], "hidden": False}], compare="exact",
             explanation="Nilai i harus naik (i + 1) supaya suatu saat syarat i <= 5 menjadi false.",
             hints=["Jalankan langkah demi langkah dan lihat apakah i semakin besar atau semakin kecil."]),
    ],
}  # fmt: skip

# ---------------------------------------------------------------- studi kasus


def case_station(index, case, prerequisite):
    tests = [{"inputs": t["inputs"], "expected": t["exp"], "hidden": i == len(case["tests"]) - 1}
             for i, t in enumerate(case["tests"])]  # fmt: skip
    text = f"{rich(case['soal'])}\n\n{rich(case['fmt'])}"
    return station(
        f"k{index}",
        f"K{index}. {case['title']}",
        [step("flowgorithm", title=case["title"], text=text, image="", mode="build", program=case["start"]["__html"],
              solution=case["sol"]["__html"], answers=[], tests=tests, compare="tail", explanation="",
              hints=[rich(case["hint"])])],  # fmt: skip
        minutes=15,
        prerequisites=[prerequisite],
        badge={"title": f"Penakluk Kasus {index}", "icon": "trophy"},
        objectives=[f"Menyusun program {case['lv'].lower()} yang lolos semua uji"],
        summary=[
            "Baca format output dengan teliti",
            "Coba contoh uji sebelum Periksa",
            "Uji tersembunyi memakai isian lain",
        ],
    )


PESANTREN = [
    {
        "id": "p1",
        "title": "Zakat Fitrah Keluarga",
        "lv": "Sekuensial",
        "text": "Setiap anggota keluarga membayar zakat fitrah **2.5 kg** beras. Buat program yang meminta jumlah anggota "
                "keluarga, lalu menampilkan beras yang harus dibayar.\n\nOutput harus berbentuk: Zakat: 7.5 kg",
        "start": {"body": [D("Integer", "anggota")]},
        "sol": {"body": [D("Integer", "anggota"), D("Real", "beras"), O('"Jumlah anggota keluarga?"'), I("anggota"),
                         A("beras", "anggota * 2.5"), O('"Zakat: " & beras & " kg"')]},
        "tests": [(["3"], ["Zakat: 7.5 kg"]), (["1"], ["Zakat: 2.5 kg"]), (["4"], ["Zakat: 10 kg"])],
        "hint": "Kalikan jumlah anggota dengan 2.5. Simpan hasilnya di variabel Real.",
        "after": "st13",
    },
    {
        "id": "p2",
        "title": "Target Setoran Hafalan",
        "lv": "Sekuensial",
        "text": "Santri ingin menyetor hafalan sebanyak **target** ayat, dengan **perHari** ayat setiap hari. Hari terakhir "
                "boleh kurang dari perHari. Tampilkan berapa hari yang dibutuhkan.\n\nOutput harus berbentuk: Hari: 7",
        "start": {"body": [D("Integer", "target", "perHari", "hari")]},
        "sol": {"body": [D("Integer", "target", "perHari", "hari"), I("target"), I("perHari"),
                         A("hari", "(target + perHari - 1) / perHari"), O('"Hari: " & hari')]},
        "tests": [(["20", "3"], ["Hari: 7"]), (["30", "5"], ["Hari: 6"]), (["7", "7"], ["Hari: 1"])],
        "hint": "Variabel Integer membuang pecahan. Tambahkan perHari - 1 sebelum dibagi supaya sisa ayat dihitung satu hari.",
        "after": "st14",
    },
    {
        "id": "p3",
        "title": "Poin Kedisiplinan Santri",
        "lv": "Perulangan dan Percabangan",
        "text": "Bagian keamanan pondok mencatat poin pelanggaran santri. Program meminta **jumlah** catatan, lalu poin "
                "setiap catatan. Tampilkan total poin, lalu \"Panggilan wali\" jika total 50 atau lebih, selain itu "
                "\"Aman\".\n\nOutput harus berbentuk: Total poin: 55 lalu Panggilan wali",
        "start": {"body": [D("Integer", "jumlah", "poin", "total", "i")]},
        "sol": {"body": [D("Integer", "jumlah", "poin", "total", "i"), A("total", "0"), I("jumlah"),
                         FOR("i", "1", "jumlah", [I("poin"), A("total", "total + poin")]), O('"Total poin: " & total'),
                         IF("total >= 50", [O('"Panggilan wali"')], [O('"Aman"')])]},
        "tests": [(["3", "10", "20", "25"], ["Total poin: 55", "Panggilan wali"]), (["2", "5", "10"], ["Total poin: 15", "Aman"]),
                  (["1", "50"], ["Total poin: 50", "Panggilan wali"]), (["0"], ["Total poin: 0", "Aman"])],
        "hint": "Mulai total dari 0. Di dalam For, baca poin lalu tambahkan ke total. Setelah For selesai, periksa dengan If.",
        "after": "st18",
    },
]  # fmt: skip


def pesantren_station(number, case):
    tests = [{"inputs": i, "expected": e, "hidden": n >= 2} for n, (i, e) in enumerate(case["tests"])]
    return station(
        case["id"],
        f"P{number}. {case['title']}",
        [step("flowgorithm", title=case["title"], text=case["text"], image="", mode="build", program=case["start"],
              solution=case["sol"], answers=[], tests=tests, compare="tail", explanation="", hints=[case["hint"]])],
        minutes=15,
        prerequisites=[case["after"]],
        optional=True,
        badge={"title": f"Santri Programmer {number}", "icon": "star"},
        objectives=[f"Menyelesaikan masalah di pondok dengan program {case['lv'].lower()}"],
        summary=["Ubah masalah nyata menjadi input, proses, output", "Pilih tipe data yang tepat", "Uji dengan beberapa isian"],
    )  # fmt: skip


# ---------------------------------------------------------------- tes awal & akhir

TES_AKHIR = [
    ("Urutan langkah yang logis, jelas, dan berhenti untuk menyelesaikan masalah disebut ...", ["algoritma", "variabel", "konsol"]),
    ("Simbol jajaran genjang berwarna biru di Flowgorithm yang membaca isian keyboard bernama ...", ["Input", "Output", "If"]),
    ("Nama variabel yang boleh dipakai di Flowgorithm adalah ...", ["jumlahSantri", "jumlah santri", "jumlah_santri"]),
    ("Tipe data untuk menyimpan tinggi badan 1.65 meter adalah ...", ["Real", "Integer", "Boolean"]),
    ("Array berisi 8 laci. Indeks laci terakhir adalah ...", ["7", "8", "9"]),
    ("Hasil dari 23 % 4 adalah ...", ["3", "5", "92"]),
    ("Hasil dari (6 > 2) and (3 > 9) adalah ...", ["false", "true", "6"]),
    ("Pada simbol If, jalur False berada di sebelah ...", ["kiri", "kanan", "bawah"]),
    ("Program: i = 2; While i <= 4: Output i; i = i + 1. Yang tampil adalah ...", ["2, 3, 4", "2, 3", "3, 4, 5"]),
    ("Nilai yang dikirim ke fungsi saat memanggilnya, mis. luas(6), disebut ...", ["argumen", "return", "komentar"]),
]  # fmt: skip


def test_text(items):
    """Soal -> teks impor soal. Pilihan PG Asesmen tidak diacak, jadi letak jawaban benar digeser per soal."""
    lines = []
    for number, (question, options) in enumerate(items, start=1):
        correct = (number * 2 + 1) % len(options)
        ordered = options[1:]
        ordered.insert(correct, options[0])  # options[0] = jawaban benar
        lines.append(f"{number}. {question}")
        lines.extend(f"{'ABCDE'[i]}. {option}" for i, option in enumerate(ordered))
        lines.append(f"Kunci: {'ABCDE'[correct]}")
        lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------- susun


def build():
    source = json.loads(EXTRACT.read_text(encoding="utf-8"))
    quiz = source["quiz"]
    stages = {s["number"]: s for s in source["stages"]}
    # Soal kuis yang tidak dipakai Tes Awal/Akhir menjadi Tantangan stasiun terkait.
    quiz_station = {0: 1, 1: 3, 3: 5, 4: 4, 7: 7, 10: 9, 11: 11, 12: 10, 14: 10, 15: 11, 16: 12, 19: 18, 20: 18,
                    22: 19, 23: 20, 24: 20, 25: 17, 26: 21, 27: 21}  # fmt: skip
    parts, previous = [], None
    for part_title, description, numbers in PARTS:
        stations = []
        for number in numbers:
            stage = stages[number]
            objectives, badge, summary, reflection = META[number]
            steps = [story_dialog(stage["story"], stage["title"])]
            for activity in stage["activities"]:
                steps += activity_steps(activity)
            steps += EXTRA.get(number, [])
            if number == 16:  # isian "Genap atau ganjil?" setelah tebak output
                steps.append(fill_step({
                    "title": "Genap atau ganjil?", "ask": "Tulis syarat supaya bilangan genap masuk ke jalur True:",
                    "prog": {"body": [D("Integer", "bilangan"), I("bilangan"), IF("{{}}", [O('"genap"')], [O('"ganjil"')])]},
                    "tests": [{"inputs": ["8"], "exp": ["genap"]}, {"inputs": ["7"], "exp": ["ganjil"]}],
                    "hint": "Bilangan genap kalau sisa dibagi 2 sama dengan 0.", "why": "Sisa bagi 2 yang bernilai 0 berarti genap."}))  # fmt: skip
            if number == 21:
                steps.append(
                    fill_step(
                        {
                            "title": "Berkeliling semua laci",
                            "ask": "Lemari nama punya 3 laci. Nilai akhir (End Value) berapa supaya semua nama tampil?",
                            "prog": {
                                "body": [
                                    D("Integer", "i"),
                                    D("String", "nama", size=3),
                                    A("nama[0]", '"Ani"'),
                                    A("nama[1]", '"Budi"'),
                                    A("nama[2]", '"Cici"'),
                                    FOR("i", "0", "{{}}", [O("nama[i]")]),
                                ]
                            },
                            "tests": [{"exp": ["Ani", "Budi", "Cici"]}],
                            "hint": "Laci pertama bernomor 0, jadi laci ketiga bernomor ...",
                        }
                    )
                )
                steps.append(fill_step({
                    "title": "Menjumlahkan isi laci", "ask": "Tulis isi laci ke-i yang harus ditambahkan ke total:",
                    "prog": {"body": [D("Integer", "i", "total"), D("Integer", "a", size=3), A("a[0]", "4"), A("a[1]", "6"),
                                      A("a[2]", "5"), A("total", "0"), FOR("i", "0", "2", [A("total", "total + {{}}")]),
                                      O('"Total: " & total')]},
                    "tests": [{"exp": ["Total: 15"]}], "hint": "Nama lemarinya a, nomor lacinya i. Ditulis a[i]."}))  # fmt: skip
            recap = " ".join(line["text"] for line in steps[0]["lines"])
            challenge = [mc_step(quiz[q]) for q, s in quiz_station.items() if s == number]
            stations.append(station(
                number, f"{number}. {stage['title']}", steps,
                objectives=objectives, minutes=8 if len(steps) < 5 else 12,
                prerequisites=[previous] if previous else [],
                badge={"title": badge, "icon": "award"}, summary=summary, reflection=reflection,
                remedial=[step("did_you_know", title="Ingat lagi", body=recap, image="", caption="")],
                challenge=challenge,
            ))  # fmt: skip
            previous = f"st{number:02d}"
        parts.append(
            {
                "id": f"b{len(parts) + 1}",
                "title": part_title,
                "description": description,
                "stations": stations,
            }
        )

    after = {
        0: "st14",
        1: "st14",
        2: "st15",
        3: "st16",
        4: "st18",
        5: "st18",
        6: "st21",
        7: "st21",
    }
    cases = [case_station(i + 1, case, after[i]) for i, case in enumerate(source["cases"])]
    cases += [pesantren_station(i + 1, case) for i, case in enumerate(PESANTREN)]
    parts.append({"id": "b6", "title": "Studi Kasus",
                  "description": "Susun program sendiri. Dinilai dengan uji, termasuk uji tersembunyi. Kasus P = kehidupan pondok (opsional).",
                  "stations": cases})  # fmt: skip
    media = {
        "schema_version": schema.SCHEMA_VERSION,
        "mascot": {"name": "Bita", "image": ""},
        "glossary": [{"term": t, "meaning": m} for t, m in GLOSSARY],
        "parts": parts,
    }
    from gambar_flowgorithm import pasang_gambar  # noqa: E402 (berkas di folder yang sama)

    pasang_gambar(media)
    clean = schema.validate_media(media, full=True)  # gagal di sini = isi belum layak terbit
    stats = {
        "stasiun": sum(1 for _ in schema.iter_stations(clean)),
        "langkah": sum(1 for s in schema.iter_stations(clean) for _ in schema.iter_steps(s)),
    }
    payload = {
        "format": "lms-sigma-media",
        "title": "Petualangan Flowgorithm",
        "description": "Belajar algoritma & pemrograman dasar dengan Flowgorithm bersama Bita (X RPL).",
        "media": clean,
    }
    (HERE / "petualangan-flowgorithm.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )

    tes_awal = [(rich(quiz[i]["q"]), [rich(o) for o in quiz[i]["o"]]) for i in TES_IDX]
    tes_awal[1] = (
        "Simbol jajaran genjang berwarna biru di Flowgorithm bernama ...",
        tes_awal[1][1],
    )
    for name, items in (("tes-awal", tes_awal), ("tes-akhir", TES_AKHIR)):
        text = test_text(items)
        parsed = parse_text(text)
        errors = [e for item in parsed for e in item["errors"]]
        assert len(parsed) == 10 and not errors, (name, errors)
        (HERE / f"{name}-flowgorithm.txt").write_text(text + "\n", encoding="utf-8")
    print(f"OK: {stats['stasiun']} stasiun, {stats['langkah']} langkah; tes awal & akhir 10 soal.")


if __name__ == "__main__":
    build()
