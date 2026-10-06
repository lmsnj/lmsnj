# LMS Nurul Jadid

Learning Management System (LMS) untuk sekolah-sekolah di bawah **Biro Pendidikan Pondok Pesantren
Nurul Jadid** (SD/MI, SMP/MTs, SMA/MA/SMK): tempat guru membagikan materi dan tugas, siswa
mengumpulkan jawaban, dan guru memberi nilai. Dikembangkan oleh guru RPL SMKS Nurul Jadid dan
dapat dipakai sebagai contoh proyek pembelajaran bagi siswa.

## Fitur

| Peran | Yang bisa dilakukan |
|-------|---------------------|
| **Admin Yayasan** | Menambah, mengubah, dan menonaktifkan **sekolah** (jenjang menentukan tingkat kelas: I–VI, VII–IX, X–XII), melihat ringkasan semua sekolah, mengatur identitas yayasan (halaman login), dan membuka sekolah mana pun sebagai admin. |
| **Admin** (per sekolah) | Mengelola akun guru & siswa (termasuk **impor massal dari Excel**), kelas, mata pelajaran, dan pengampu. Pengumuman sekolah, laporan nilai per kelas (+ CSV), dan dashboard statistik. |
| **Guru** | Membagikan materi (PDF, video YouTube, link), tugas dengan tenggat, **lembar asesmen/kuis** (pilihan ganda, PG kompleks, kategori Benar/Salah — dinilai otomatis — dan esai; soal grup dengan stimulus bersama, tabel), menilai dengan umpan balik, rekap nilai + CSV, jadwal **sesi mengajar** (tatap muka/online), pengumuman kelas, dan laporan kelas wali. |
| **Siswa** | Membaca materi, mengumpulkan tugas, mengerjakan lembar asesmen dengan tampilan bergaya simulasi TKA (nomor soal, ragu-ragu, timer, ukuran huruf), melihat nilai & progres, jadwal sesi, dan pengumuman. |
| **Guru (tambahan)** | Impor soal dari **Word (tempel teks) atau Excel + ZIP gambar**, dengan **rumus matematika** (LaTeX + editor rumus visual) dan **teks Arab berharakat** (RTL otomatis). Form diberi contoh isian cepat. |
| **Admin (tambahan)** | Impor mata pelajaran, kelas, dan pengampu dari Excel. |
| **Semua** | **Ruang obrolan** (pesan langsung; siswa hanya dengan guru di kelasnya, wali kelas, dan admin). |

**Multi-sekolah:** satu aplikasi dan satu database untuk semua sekolah, tetapi data tiap sekolah
terpisah (admin SMK tidak melihat data MTs). Guru yang mengajar di beberapa sekolah cukup memakai
**satu akun** dan berpindah lewat tombol **Ganti Sekolah** di header.

Tampilan responsif (bisa dipakai di HP) dan seluruh teks berbahasa Indonesia.

## Teknologi

- **Frontend:** React 19, Vite, Tailwind CSS 4, React Router, Axios — folder `frontend/`
- **Backend:** Django 6.1, Django REST Framework, SimpleJWT — folder `backend/`
- **Database:** SQLite (bawaan), bisa diganti PostgreSQL/MySQL

## Menjalankan di Komputer Sendiri

Kebutuhan: **Python 3.12+** dan **Node.js 22+**. Perintah di bawah untuk Windows
(PowerShell / Command Prompt).

**Cara cepat:** klik dua kali `start-app.bat` di folder utama. Script ini menyiapkan venv, paket,
file `.env`, dan database (saat pertama kali), lalu menjalankan backend dan frontend di dua jendela
terpisah dan membuka browser. Langkah manual di bawah tetap berlaku jika ingin mengatur sendiri.

### 1. Backend (http://localhost:8000)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
copy .env.example .env
```

Buka `backend/.env`, isi `SECRET_KEY` dengan kunci acak:

```bash
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

Lalu siapkan database dan jalankan server:

```bash
python manage.py migrate
python manage.py seed_demo      # opsional: isi data contoh
python manage.py runserver
```

### 2. Frontend (http://localhost:5173)

Di terminal lain:

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Buka http://localhost:5173 di browser.

### Akun Demo

Tersedia setelah menjalankan `python manage.py seed_demo`:

| Peran | Username | Password |
|-------|----------|----------|
| Admin Yayasan | `yayasan` | `Yayasan#Nj2026` |
| Admin sekolah | `admin` (SMKS), `admin.mts` (MTs), `admin.mi` (MI) | `AdminSmknj#2026` |
| Guru | `guru.rpl`, `pak.budi` (SMKS), `bu.siti` (SMKS **dan** MTs), `ustadz.ali` (MTs), `ustadzah.aminah` (MI) | `Belajar#Koding26` |
| Siswa | `rizki`, `aisyah`, `hafiz`, dll. (SMKS), `zaki` (MTs), `hasan` (MI) | `Siswa#Smknj26` |

Data demo berisi tiga sekolah: **SMKS** (contoh paling lengkap, termasuk asesmen dan obrolan),
**MTs**, dan **MI** Nurul Jadid.

`seed_demo` aman dijalankan berulang kali (tidak membuat data ganda dan tidak mengubah password
akun yang sudah ada) dan menolak berjalan jika `DEBUG=False`. **Jangan** gunakan akun demo di
server sekolah yang asli.

### Mulai Tanpa Data Demo

1. `python manage.py createsuperuser` — akun ini otomatis menjadi **Admin Yayasan**.
2. Login, buka menu **Daftar Sekolah**, lalu tambahkan sekolah (nama, kode, jenjang).
3. Klik **Ganti Sekolah** di header untuk membuka sekolah itu, lalu buat akun **admin sekolah**
   di menu Pengguna (peran Admin). Admin sekolah yang melanjutkan mengisi kelas, mapel, guru,
   dan siswa sekolahnya.

## Perintah Pengembangan

| Perintah | Kegunaan |
|----------|----------|
| `python manage.py test` | Menjalankan seluruh test backend |
| `python -m black apps config` dan `python -m isort apps config` | Merapikan kode Python |
| `npm run lint` | Memeriksa kode frontend (oxlint) |
| `npm run format` | Merapikan kode frontend (Prettier) |
| `npm test` | Menjalankan test frontend (rumus, teks Arab, pengawasan ujian) |
| `npm run build` | Membuat versi produksi frontend ke `frontend/dist/` |

## Struktur Proyek

```
backend/
  config/            pengaturan Django
  apps/accounts/     pengguna, login JWT
  apps/academics/    kelas, mapel, pengampu
  apps/materials/    materi
  apps/tasks/        tugas, pengumpulan, penilaian, rekap nilai
  apps/dashboard/    ringkasan per peran
  apps/common/       kode bersama + perintah seed_demo
frontend/src/
  api/  components/  hooks/  pages/{admin,guru,siswa}/  routes/  utils/
docs/DEPLOY.md       panduan memasang di server sekolah
CLAUDE.md            aturan coding, model data, daftar endpoint API
```

Detail aturan coding, model data, dan daftar endpoint API ada di [CLAUDE.md](CLAUDE.md).

## Keamanan

- Hak akses dicek di backend untuk setiap permintaan: guru hanya melihat kelas yang ia ampu,
  siswa hanya melihat kelasnya sendiri.
- File materi dan jawaban siswa **tidak** bisa dibuka lewat URL publik; hanya lewat API
  yang mengecek login dan hak akses. Nama file di server diacak.
- Percobaan login dibatasi 10 kali per menit.

## Memasang di Server Sekolah

Lihat [docs/DEPLOY.md](docs/DEPLOY.md).
