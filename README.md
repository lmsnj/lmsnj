# LMS SMKS Nurul Jadid

Learning Management System (LMS) untuk SMKS Nurul Jadid: tempat guru membagikan materi dan
tugas, siswa mengumpulkan jawaban, dan guru memberi nilai. Dikembangkan oleh guru RPL dan
dapat dipakai sebagai contoh proyek pembelajaran bagi siswa.

## Fitur

| Peran | Yang bisa dilakukan |
|-------|---------------------|
| **Admin** | Mengelola akun guru & siswa (termasuk **impor massal dari Excel** dengan template), kelas, mata pelajaran, dan pengampu (guru–mapel–kelas). Dashboard statistik dan daftar hal yang perlu ditindaklanjuti. |
| **Guru** | Membagikan materi (PDF, video YouTube, link), membuat tugas dengan tenggat, melihat siapa yang sudah/belum mengumpulkan, menilai dengan umpan balik, rekap nilai + ekspor CSV untuk Excel. |
| **Siswa** | Membaca materi, mengumpulkan tugas (teks dan/atau file), melihat nilai dan umpan balik, dashboard tugas yang harus dikerjakan. |

Tampilan responsif (bisa dipakai di HP) dan seluruh teks berbahasa Indonesia.

## Teknologi

- **Frontend:** React 19, Vite, Tailwind CSS 4, React Router, Axios — folder `frontend/`
- **Backend:** Django 6.1, Django REST Framework, SimpleJWT — folder `backend/`
- **Database:** SQLite (bawaan), bisa diganti PostgreSQL/MySQL

## Menjalankan di Komputer Sendiri

Kebutuhan: **Python 3.12+** dan **Node.js 22+**. Perintah di bawah untuk Windows
(PowerShell / Command Prompt).

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
| Admin | `admin` | `AdminSmknj#2026` |
| Guru | `guru.rpl`, `bu.siti`, `pak.budi` | `Belajar#Koding26` |
| Siswa | `rizki`, `aisyah`, `dimas`, `hafiz`, `bagus`, dll. | `Siswa#Smknj26` |

`seed_demo` aman dijalankan berulang kali (tidak membuat data ganda dan tidak mengubah password
akun yang sudah ada) dan menolak berjalan jika `DEBUG=False`. **Jangan** gunakan akun demo di
server sekolah yang asli. Untuk membuat akun admin pertama tanpa data demo:
`python manage.py createsuperuser`.

## Perintah Pengembangan

| Perintah | Kegunaan |
|----------|----------|
| `python manage.py test` | Menjalankan seluruh test backend |
| `python -m black apps config` dan `python -m isort apps config` | Merapikan kode Python |
| `npm run lint` | Memeriksa kode frontend (oxlint) |
| `npm run format` | Merapikan kode frontend (Prettier) |
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
