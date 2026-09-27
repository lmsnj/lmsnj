"""Isi ujian contoh "Simulasi TKA" untuk seed_demo: semua bentuk soal dalam satu lembar asesmen.

PG sederhana (dengan tabel & pecahan), PG kompleks (MCMA), kategori (Benar/Salah), soal grup
(stimulus bersama), esai, dan soal bahasa Arab (RTL, berharakat).
"""

TITLE = "Simulasi TKA: Contoh Semua Bentuk Soal"
INSTRUCTIONS = (
    "Ujian contoh untuk mencoba tampilan simulasi TKA. Waktu 60 menit sejak tombol Mulai ditekan.\n"
    "Pakai tombol nomor di kiri untuk berpindah soal, tandai Ragu-ragu jika belum yakin, lalu tekan "
    "Selesai Ujian."
)

TABLE_STIMULUS = (
    "Data berikut menunjukkan peserta kegiatan ekstrakurikuler (*extracurricular activities*) "
    "kelas X dan XI.\n\n"
    "| Kegiatan | Kelas X | < | Kelas XI | < |\n"
    "| | Laki-laki | Perempuan | Laki-laki | Perempuan |\n"
    "|---|---|---|---|---|\n"
    "| Pramuka | 6 | 4 | 5 | 5 |\n"
    "| Robotik | 8 | 2 | 9 | 3 |\n"
    "| Hadroh | 7 | 9 | 6 | 12 |"
)

READING_STIMULUS = (
    "Bacalah teks berikut untuk menjawab soal nomor 5 sampai 7.\n\n"
    "**Santri Digital**\n\n"
    "Setiap pagi para santri menyetor hafalan sebelum berangkat ke sekolah. Setelah pulang, sebagian "
    "dari mereka mengikuti kegiatan *coding club* di laboratorium komputer.\n\n"
    "Dalam kegiatan itu, santri belajar membuat aplikasi sederhana, misalnya aplikasi jadwal salat dan "
    "kamus kosakata bahasa Arab. Hasil karya terbaik dipamerkan setiap akhir semester.\n\n"
    "Menurut pembina, kegiatan ini melatih santri berpikir runtut tanpa meninggalkan kewajiban mengaji."
)

QUESTIONS = [
    {
        "kind": "choice",
        "points": 2,
        "stimulus": TABLE_STIMULUS,
        "text": "Berdasarkan tabel, bagian siswa kelas XI yang mengikuti Pramuka adalah ...",
        "choices": [
            r"$\frac{1}{5}$",
            r"$\frac{1}{4}$",
            r"$\frac{3}{10}$",
            r"$\frac{2}{5}$",
            r"$\frac{1}{2}$",
        ],
        "correct_choice": 1,
    },
    {
        "kind": "choice",
        "points": 2,
        "text": r"Hasil dari $\frac{3}{4} - \frac{1}{2}$ adalah ...",
        "choices": [r"$\frac{1}{4}$", r"$\frac{2}{6}$", r"$\frac{1}{2}$", r"$\frac{5}{4}$"],
        "correct_choice": 0,
    },
    {
        "kind": "multiple",
        "points": 3,
        "text": r"Bilangan berikut yang nilainya sama dengan $\frac{1}{2}$ adalah ...",
        "choices": [r"$\frac{2}{4}$", r"$0{,}5$", r"$\frac{3}{5}$", r"$50\%$", r"$\frac{1}{3}$"],
        "correct_choices": [0, 1, 3],
    },
    {
        "kind": "category",
        "points": 4,
        "text": "Tentukan **Benar** atau **Salah** untuk setiap pernyataan tentang HTML berikut.",
        "choices": [
            "Tag <br> tidak memerlukan tag penutup.",
            "Atribut href pada tag <img> dipakai untuk alamat gambar.",
            "Tag <h1> menghasilkan judul paling besar.",
            "CSS dipakai untuk mengatur tampilan halaman web.",
        ],
        "category_labels": ["Benar", "Salah"],
        "correct_choices": [0, 1, 0, 0],
    },
    {
        "kind": "choice",
        "points": 2,
        "group": "G1",
        "stimulus": READING_STIMULUS,
        "text": "Gagasan utama paragraf kedua adalah ...",
        "choices": [
            "Santri menyetor hafalan setiap pagi.",
            "Santri belajar membuat aplikasi sederhana.",
            "Pembina melatih santri mengaji.",
            "Karya santri dijual setiap akhir semester.",
        ],
        "correct_choice": 1,
    },
    {
        "kind": "category",
        "points": 3,
        "group": "G1",
        "text": "Tentukan kesesuaian setiap pernyataan berikut dengan isi teks.",
        "choices": [
            "Santri menyetor hafalan setelah pulang sekolah.",
            "Coding club diadakan di laboratorium komputer.",
            "Hasil karya terbaik dipamerkan setiap akhir semester.",
        ],
        "category_labels": ["Sesuai", "Tidak sesuai"],
        "correct_choices": [1, 0, 0],
    },
    {
        "kind": "essay",
        "points": 5,
        "group": "G1",
        "text": "Menurut pendapatmu, apa manfaat kegiatan *coding club* bagi santri? Jelaskan dengan singkat.",
    },
    {
        "kind": "choice",
        "points": 2,
        "text_direction": "rtl",
        "stimulus": "اِقْرَأِ النَّصَّ التَّالِيَ:\n\nذَهَبَ أَحْمَدُ إِلَى الْمَدْرَسَةِ صَبَاحًا، وَقَرَأَ الْكِتَابَ فِي الْفَصْلِ.",
        "text": "إِلَى أَيْنَ ذَهَبَ أَحْمَدُ؟",
        "choices": ["إِلَى السُّوْقِ", "إِلَى الْمَدْرَسَةِ", "إِلَى الْبَيْتِ", "إِلَى الْمَسْجِدِ"],
        "correct_choice": 1,
    },
    {
        "kind": "choice",
        "points": 1,
        "text": "Arti kata «الْكِتَابُ» dalam bahasa Indonesia adalah ...",
        "choices": ["Pena", "Buku", "Meja", "Kelas"],
        "correct_choice": 1,
    },
]
