# LMS SMKS Nurul Jadid

Learning Management System untuk SMKS Nurul Jadid. Dikembangkan oleh guru RPL, sekaligus dapat dipakai sebagai contoh proyek pembelajaran bagi siswa.

**Bahasa komunikasi:** selalu jawab dan jelaskan dalam Bahasa Indonesia.

## Tujuan MVP

- Login dengan JWT untuk tiga peran: **admin**, **guru**, **siswa**.
- Manajemen kelas & mata pelajaran (mapel), termasuk penugasan guru ke mapel di kelas tertentu.
- Materi pembelajaran: file PDF, video (link YouTube / URL), dan link eksternal.
- Tugas & pengumpulan tugas oleh siswa (file dan/atau teks), dengan tenggat waktu.
- Penilaian pengumpulan tugas (nilai + umpan balik) oleh guru.
- Dashboard berbeda untuk tiap peran.

Di luar MVP (jangan dikerjakan kecuali diminta): kuis/ujian online, forum diskusi, absensi, notifikasi real-time, aplikasi mobile, integrasi Dapodik.

## Stack

| Bagian    | Teknologi                                                       |
|-----------|-----------------------------------------------------------------|
| Frontend  | React + Vite + Tailwind CSS, React Router, Axios                |
| Backend   | Django + Django REST Framework                                  |
| Auth      | JWT via `djangorestframework-simplejwt` (access + refresh token)|
| Database  | SQLite (tahap pengembangan), siap migrasi ke PostgreSQL/MySQL   |
| Lainnya   | `django-cors-headers`, `django-filter`, Pillow (bila perlu)     |

Versi terpasang: Python 3.14, Django 6.1, DRF 3.18, SimpleJWT 5.5, React 19, Vite 8, Tailwind CSS 4 (plugin `@tailwindcss/vite`), React Router 7. Versi lengkap ada di `backend/requirements.txt` dan `frontend/package.json`.

## Struktur Folder

```
lms-smknj/
├── CLAUDE.md
├── README.md            # Cara menjalankan, akun demo
├── docs/DEPLOY.md       # Panduan memasang di server sekolah
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── config/              # settings.py, urls.py, wsgi.py, asgi.py
│   ├── apps/
│   │   ├── common/          # Kode bersama: pagination, mixin, files.py, exceptions.py, perintah seed_demo
│   │   ├── accounts/        # User custom (role), login JWT, manajemen user; user_import.py = impor Excel
│   │   ├── academics/       # Kelas, Mapel, Pengampu (guru–mapel–kelas); selectors.py = filter data per peran
│   │   ├── materials/       # Materi (PDF/video/link); selectors.py = materi yang boleh dilihat
│   │   ├── tasks/           # Tugas, Pengumpulan, Penilaian; services.py = aturan, gradebook.py = rekap nilai & CSV
│   │   └── dashboard/       # Ringkasan per peran (tanpa model); services.py memakai selector modul lain
│   └── media/               # File upload (tidak di-commit, TIDAK disajikan publik)
└── frontend/
    ├── index.html
    ├── package.json
    ├── .env.example
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api/             # Instance Axios + fungsi pemanggil API per modul
        ├── context/         # AuthContext (user, token, role)
        ├── routes/          # Definisi route + ProtectedRoute/RoleRoute
        ├── layouts/         # Layout per peran (sidebar, navbar)
        ├── components/      # Komponen UI reusable (Button, DataTable, FormModal, DeleteDialog, dll.)
        ├── pages/
        │   ├── auth/
        │   ├── admin/
        │   ├── guru/
        │   └── siswa/
        ├── hooks/           # useAuth, useFetch (memuat data API), useFormSubmit, useDebounce, useTabs
        └── utils/
```

Setiap app Django mengikuti pola: `models.py`, `serializers.py`, `views.py`, `urls.py`, `permissions.py` (bila perlu), `admin.py`, `tests.py` (atau folder `tests/`).

Pola yang wajib dipakai ulang:
- **Backend:** batasi data per peran lewat `apps/academics/selectors.py` (`classrooms_for`, `teaching_assignments_for`). Modul materi/tugas harus memakai fungsi ini, jangan menulis ulang aturan aksesnya. Relasi yang datanya tidak boleh hilang memakai `on_delete=PROTECT` + `ProtectedDeleteMixin` di view.
- **File upload:** simpan dengan `RandomUploadPath` (nama diacak), validasi dengan `validate_upload` (ekstensi + ukuran `MAX_UPLOAD_SIZE_MB`) dan cek isi file bila memungkinkan. File **tidak pernah** disajikan lewat `/media/`; sediakan action `download` yang memakai `get_queryset` (cek akses) dan mengembalikan `FileResponse`. Path file tidak dikirim ke klien (`write_only`). Hapus file dari disk saat data dihapus atau file diganti.
- **Frontend:** muat data dengan `useFetch`, kirim form dengan `useFormSubmit` + `FormModal`, tabel dengan `DataTable`, hapus dengan `DeleteDialog`. Isi dropdown memakai `ALL` (`page_size=500`) dan `toOptions` dari `utils/academic.js`. File dari API diambil sebagai blob (`responseType: 'blob'`) lalu ditampilkan lewat `URL.createObjectURL`; upload memakai FormData dengan progress (`onUploadProgress`).

## Model Data

- **User** (custom, `AUTH_USER_MODEL = "accounts.User"`): username, `full_name`, email, `role` (nilai: `admin`/`teacher`/`student`, label: Admin/Guru/Siswa), `nis` (siswa) / `nip` (guru), `classroom` (FK ke Classroom, khusus siswa, SET_NULL).
- **Classroom** (kelas): `name` (mis. "XI RPL 1"), `grade` (X/XI/XII), `major` (huruf besar), `academic_year` ("2026/2027"), `homeroom_teacher` (wali kelas). Unik per (nama, tahun ajaran).
- **Subject** (mapel): `code` (unik, huruf besar), `name`.
- **TeachingAssignment** (pengampu): `teacher` + `subject` + `classroom` (semua PROTECT, kombinasi unik) → unit utama tempat materi & tugas ditempelkan.
- **Material** (materi): `teaching_assignment` (PROTECT, tidak bisa dipindah), `title`, `description`, `material_type` (`pdf`/`video`/`link`), `file` + `original_filename` (khusus PDF, maks. 10 MB), `url` (video/link), `is_published` (draf tidak terlihat siswa), `created_by`.
- **Task** (tugas; sengaja bukan "Assignment" agar tidak rancu dengan TeachingAssignment): `teaching_assignment` (PROTECT, tidak bisa dipindah), `title`, `instructions`, `attachment` + `attachment_filename` (opsional), `due_at`, `max_score` (1–1000), `allow_late`, `is_published`, `created_by`.
- **Submission** (pengumpulan): `task` (PROTECT), `student` (PROTECT), `text_answer`, `file` + `original_filename`, `is_late` (disimpan saat mengumpulkan), `submitted_at`. Satu per (tugas, siswa).
  - Aturan (`apps/tasks/services.py`): sebelum tenggat siswa boleh kumpul/ganti/batal; setelah tenggat pengumpulan pertama diterima dan ditandai terlambat jika `allow_late`, pengumpulan yang sudah ada terkunci. Minimal ada teks atau file.
  - Penilaian: `score` (Decimal 0–`max_score`, null = belum dinilai), `feedback`, `graded_by`, `graded_at`. Pengumpulan yang sudah dinilai terkunci bagi siswa sampai guru menghapus nilainya (`score: null`).
  - Rekap nilai hanya memuat tugas yang terbit; rata-rata = rata-rata (nilai/maks × 100) dari tugas yang sudah dinilai. CSV memakai pemisah `;`, koma desimal, dan BOM UTF-8 (untuk Excel berbahasa Indonesia).

## Aturan Coding

### Umum
- Nama variabel, fungsi, class, model, field, dan endpoint menggunakan **bahasa Inggris**; teks yang tampil ke pengguna (label, pesan error, notifikasi) menggunakan **Bahasa Indonesia**.
- Kode sederhana dan mudah dibaca — proyek ini juga bahan belajar siswa. Hindari abstraksi berlebihan.
- Komentar secukupnya, dalam Bahasa Indonesia, untuk menjelaskan *mengapa*, bukan *apa*.
- Jangan commit rahasia. Konfigurasi lewat file `.env` (sediakan `.env.example`).
- Kerjakan per fase sesuai rencana; jangan menambah fitur di luar lingkup tanpa persetujuan.

### Backend (Django/DRF)
- Semua endpoint di bawah prefix `/api/`, gaya REST, nama resource jamak (`/api/classes/`, `/api/subjects/`, `/api/materials/`, `/api/assignments/`, `/api/submissions/`).
- Gunakan `ModelViewSet` + router bila cocok; logika bisnis yang kompleks taruh di model/service, bukan di view.
- Pesan error yang tampil ke pengguna harus berbahasa Indonesia. 404 bawaan Django diganti otomatis oleh `apps/common/exceptions.py`.
- Pengaturan yang berbeda antar lingkungan dibaca dari `.env` (lihat `backend/.env.example`); `DEBUG=False` tanpa `SECRET_KEY` sengaja gagal dijalankan.
- Queryset yang memakai `annotate(Count(...))` wajib diberi `.order_by(...)` eksplisit: Django tidak menerapkan `Meta.ordering` pada query GROUP BY.
- Impor pengguna: password kosong dibuat otomatis (kata + 4 angka) dan hanya dikembalikan sekali; password awal di-hash dengan iterasi ringan (`IMPORT_HASH_ITERATIONS`) lalu otomatis di-upgrade Django saat login pertama. Username siswa kosong = NIS.
- Permission konten kelas (materi, tugas) memakai `ContentPermission`; action khusus peran menimpa `permission_classes` di `@action`.
- **Hak akses wajib dicek di backend** (permission class per peran + filter queryset), jangan hanya mengandalkan frontend:
  - Admin: kelola semua data.
  - Guru: hanya kelas/mapel yang ia ampu.
  - Siswa: hanya materi/tugas di kelasnya dan pengumpulan miliknya sendiri.
- Validasi upload: batasi ekstensi (PDF, DOC/DOCX, ZIP, gambar) dan ukuran maksimum (mis. 10 MB).
- Gunakan pagination default DRF untuk list.
- Format waktu disimpan UTC, `TIME_ZONE = "Asia/Jakarta"`, `LANGUAGE_CODE = "id"`.
- Style: PEP 8, format dengan `black` dan urutkan import dengan `isort` (konfigurasi di `backend/pyproject.toml`, panjang baris 110).
- Tulis test (`APITestCase`) minimal untuk hak akses dan alur utama tiap modul.

### Frontend (React/Vite/Tailwind)
- Komponen fungsional + hooks, file komponen `PascalCase.jsx`, hooks `useSesuatu.js`.
- Semua panggilan API lewat folder `src/api/`, memakai satu instance Axios (`src/api/client.js`) dengan interceptor untuk menambahkan token dan auto-refresh saat access token kedaluwarsa.
- Access token disimpan di memori, refresh token di `localStorage`. Refresh token dirotasi (sekali pakai) dan di-blacklist saat logout.
- URL halaman memakai Bahasa Indonesia (`/admin/pengguna`, `/guru`, `/siswa`, `/profil`).
- Base URL API dari `import.meta.env.VITE_API_URL`.
- Route diproteksi berdasarkan login dan peran (`ProtectedRoute`, `RoleRoute`).
- Styling hanya dengan kelas Tailwind; buat komponen reusable untuk elemen yang berulang.
- Tampilan responsif (banyak siswa mengakses dari HP).
- Setiap halaman menangani state *loading*, *error*, dan *data kosong*.
- Format kode dengan Prettier (`npm run format`), lint dengan oxlint (`npm run lint`).

## Perintah Pengembangan

Backend (dari folder `backend/`, Windows):
```
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
copy .env.example .env
python manage.py migrate
python manage.py createsuperuser   # atau: python manage.py seed_demo (data contoh)
python manage.py runserver
python manage.py test
```

Frontend (dari folder `frontend/`):
```
npm install
copy .env.example .env
npm run dev
npm run build
npm run lint
npm run format
```

Default: backend di `http://localhost:8000`, frontend di `http://localhost:5173`.

## Endpoint API yang Sudah Ada

| Method | Endpoint                          | Akses            |
|--------|-----------------------------------|------------------|
| POST   | `/api/auth/login/`                | Publik (dibatasi 10/menit) |
| POST   | `/api/auth/refresh/`              | Publik           |
| POST   | `/api/auth/logout/`               | Login            |
| GET    | `/api/auth/me/`                   | Login            |
| POST   | `/api/auth/change-password/`      | Login            |
| CRUD   | `/api/users/` (filter `role`, `is_active`, `classroom`, `classroom__isnull`, `search`) | Admin |
| POST   | `/api/users/{id}/reset-password/` | Admin            |
| GET    | `/api/users/import-template/`     | Admin: template Excel (.xlsx) dengan dropdown peran & kelas |
| POST   | `/api/users/import/` (multipart `file`, `dry_run`) | Admin: `dry_run=true` hanya memeriksa; `false` menyimpan jika SEMUA baris benar (semua atau tidak sama sekali) |
| CRUD   | `/api/classrooms/` (filter `grade`, `major`, `academic_year`, `homeroom_teacher`) | Tulis: admin. Baca: admin semua, guru kelas yang diajar/diwalikan, siswa kelasnya |
| GET    | `/api/classrooms/academic-years/` | Login            |
| GET/POST | `/api/classrooms/{id}/students/` | GET: admin & guru kelas itu. POST (`student_ids`): admin |
| POST   | `/api/classrooms/{id}/remove-students/` | Admin      |
| CRUD   | `/api/subjects/`                  | Tulis: admin. Baca: semua login |
| CRUD   | `/api/teaching-assignments/` (filter `teacher`, `subject`, `classroom`) | Tulis: admin. Baca: admin semua, guru miliknya, siswa di kelasnya |
| CRUD   | `/api/materials/` (multipart; filter `teaching_assignment`, `material_type`, `is_published`) | Tambah/ubah: guru pengampu. Hapus: guru pengampu/admin. Baca: admin semua, guru miliknya, siswa hanya yang terbit di kelasnya |
| GET    | `/api/materials/{id}/download/`   | Sama dengan hak baca materi |
| CRUD   | `/api/tasks/` (multipart; filter `teaching_assignment`, `is_published`) | Sama dengan materi. Untuk siswa ada `my_submission` |
| GET    | `/api/tasks/{id}/attachment/`     | Sama dengan hak baca tugas |
| GET/PUT/DELETE | `/api/tasks/{id}/my-submission/` | Siswa: lihat, kumpulkan/ganti (multipart `text_answer`, `file`), batalkan |
| GET    | `/api/tasks/{id}/submissions/`    | Guru pengampu/admin: rekap semua siswa + pengumpulannya |
| GET    | `/api/submissions/`, `/api/submissions/{id}/download/` | Admin semua, guru untuk tugasnya, siswa miliknya |
| PATCH  | `/api/submissions/{id}/grade/` (`score`, `feedback`) | Guru pengampu tugas |
| GET    | `/api/gradebook/{teaching_assignment_id}/` dan `.../export/` (CSV) | Guru pengampu/admin |
| GET    | `/api/dashboard/`                 | Login; isi sesuai peran (admin: statistik & hal yang perlu ditindaklanjuti; guru: perlu dinilai & tenggat 7 hari; siswa: tugas tertunda, nilai & materi terbaru) |

## Progres

- [x] Fase 0: Fondasi proyek
- [x] Fase 1: Autentikasi & manajemen pengguna
- [x] Fase 2: Kelas, mapel & pengampu
- [x] Fase 3: Materi
- [x] Fase 4: Tugas & pengumpulan
- [x] Fase 5: Penilaian
- [x] Fase 6: Dashboard per peran
- [x] Fase 7: Pemantapan
