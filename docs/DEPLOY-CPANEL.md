# Panduan Hosting di cPanel (Shared Hosting)

Panduan ini untuk hosting cPanel yang punya **Setup Python App** (Python 3.12 atau lebih baru),
**Terminal**, dan bisa membuat subdomain wildcard. Untuk VPS/server sendiri pakai `docs/DEPLOY.md`.

Contoh di bawah memakai domain `sigmateknologi.my.id` dan user cPanel `sigmatek`
(home `/home/sigmatek`). Ganti jika berbeda.

## Gambaran

| Alamat                                    | Isi                                                     | Folder di server                         |
|-------------------------------------------|---------------------------------------------------------|------------------------------------------|
| `api.sigmateknologi.my.id`                | Backend Django (Setup Python App / Passenger)           | `/home/sigmatek/lms/backend`             |
| `sigmateknologi.my.id`, `admin.`, `<kode>.` | Frontend React (file hasil `npm run build`)          | `/home/sigmatek/public_html`             |

- `api` termasuk kode yang dicadangkan (`RESERVED_CODES`), jadi tidak bentrok dengan kode sekolah.
- Kode backend, database (`db.sqlite3`), dan folder `media/` berada DI LUAR `public_html`, sehingga
  file upload tidak bisa dibuka orang lain lewat browser.

## 1. Domain & Subdomain

Menu **Domains** -> **Create A New Domain**:

1. `api.sigmateknologi.my.id`: hapus centang "Share document root", document root biarkan bawaan
   (mis. `/home/sigmatek/api.sigmateknologi.my.id`). Folder ini nanti diisi otomatis oleh Setup Python App.
2. `*.sigmateknologi.my.id` (wildcard): **centang** "Share document root" dengan `public_html`, agar
   semua subdomain sekolah membuka frontend yang sama.

Subdomain yang dibuat tersendiri (`api`) selalu didahulukan daripada wildcard.

## 2. Sertifikat HTTPS

Menu **SSL/TLS Status** (atau Let's Encrypt): terbitkan sertifikat untuk `sigmateknologi.my.id`,
`*.sigmateknologi.my.id`, dan `api.sigmateknologi.my.id`. Tunggu sampai statusnya aktif.
Jika sertifikat wildcard gagal, minta bantuan dukungan hosting.

## 3. Upload Kode Backend

1. Buka **File Manager**, buat folder `/home/sigmatek/lms`.
2. Upload `backend.zip` ke folder itu, lalu **Extract**. Hasilnya `/home/sigmatek/lms/backend/manage.py`.

`backend.zip` berisi kode saja (tanpa `.env`, `db.sqlite3`, `media/`, `.venv`). Membuatnya di laptop:
`git archive -o backend.zip HEAD backend` dari folder proyek.

## 4. Setup Python App

Menu **Setup Python App** -> **Create Application**:

| Isian                    | Nilai                          |
|--------------------------|--------------------------------|
| Python version           | **3.12** (atau lebih baru)     |
| Application root         | `lms/backend`                  |
| Application URL          | `api.sigmateknologi.my.id`     |
| Application startup file | `passenger_wsgi.py`            |
| Application Entry point  | `application`                  |

Klik **Create**. Di bagian atas halaman muncul perintah seperti:

```
source /home/sigmatek/virtualenv/lms/backend/3.12/bin/activate && cd /home/sigmatek/lms/backend
```

Salin perintah itu; dipakai setiap kali membuka Terminal.

Catatan: jika cPanel menimpa `passenger_wsgi.py` dengan isi contoh, upload ulang file itu dari proyek.

## 5. File `.env` Backend

Di **File Manager**, buat file `/home/sigmatek/lms/backend/.env`:

```
SECRET_KEY=isi-dengan-kunci-acak-panjang
DEBUG=False
ALLOWED_HOSTS=api.sigmateknologi.my.id
CORS_ALLOWED_ORIGINS=https://sigmateknologi.my.id
CORS_ALLOWED_ORIGIN_REGEXES=^https://[a-z0-9-]+\.sigmateknologi\.my\.id$
CSRF_TRUSTED_ORIGINS=https://api.sigmateknologi.my.id
HTTPS=True
SECURE_SSL_REDIRECT=False
MAX_UPLOAD_SIZE_MB=10
MAX_VIDEO_UPLOAD_MB=100
DB_ENGINE=sqlite
LOG_LEVEL=WARNING
ANTHROPIC_API_KEY=
```

- `SECRET_KEY`: buat dengan `python -c "import secrets; print(secrets.token_urlsafe(50))"`.
- `SECURE_SSL_REDIRECT=False`: Passenger tidak selalu mengirim header `X-Forwarded-Proto`, sehingga
  Django bisa mengira permintaan HTTPS sebagai HTTP lalu mengalihkan terus-menerus. Pengalihan ke
  HTTPS diurus cPanel (Domains -> Force HTTPS Redirect) dan `.htaccess` frontend.

## 6. Pasang Paket & Siapkan Database (Terminal)

Buka **Terminal**, tempel perintah `source ... && cd ...` dari langkah 4, lalu:

```
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py createsuperuser      # akun Super Admin (peran otomatis Super Admin)
python manage.py check --deploy
```

Kembali ke **Setup Python App** -> klik **Restart**. Buka `https://api.sigmateknologi.my.id/api/branding/`
di browser: jika muncul data JSON, backend sudah jalan.

**Memakai data dari laptop (opsional):** sebelum `migrate`, upload `db.sqlite3` ke
`/home/sigmatek/lms/backend/` dan folder `media/` (zip lalu extract) ke folder yang sama.
Hapus atau ganti password akun demo bila ada. Jangan pernah menjalankan `seed_demo` di server.

## 7. Build & Upload Frontend

Di laptop, dari folder `frontend/`, buat file `.env.production.local` (tidak di-commit):

```
VITE_API_URL=https://api.sigmateknologi.my.id/api
VITE_BASE_DOMAIN=sigmateknologi.my.id
```

Lalu `npm run build`. Zip **isi** folder `dist/` (bukan foldernya), upload ke `public_html`, lalu
Extract. Pastikan `index.html` dan `.htaccess` berada langsung di `public_html` (aktifkan
"Show Hidden Files" di File Manager untuk melihat `.htaccess`). Hapus file bawaan hosting di
`public_html` (mis. `index.php`/`default.html`) agar tidak mendahului `index.html`.

## 8. Mulai Memakai

1. Buka `https://admin.sigmateknologi.my.id`, masuk dengan akun Super Admin.
2. **Daftar Sekolah** -> **Tambah Sekolah** (mis. kode `smknj`), sekalian buat akun admin sekolah.
3. Buka `https://smknj.sigmateknologi.my.id` dan masuk sebagai admin sekolah.

## 9. Memperbarui Aplikasi

- **Backend:** upload `backend.zip` baru lalu Extract (timpa). File `.env`, `db.sqlite3`, dan `media/`
  tidak ikut tertimpa karena tidak ada di zip. Di Terminal: `pip install -r requirements.txt`,
  `python manage.py migrate`, `python manage.py collectstatic --noinput`, lalu **Restart** di Setup Python App.
- **Frontend:** `npm run build`, upload isi `dist/` ke `public_html` (timpa).

## 10. Backup

Menu **Cron Jobs**, tambahkan (misalnya setiap malam pukul 01.00):

```
0 1 * * * cd /home/sigmatek/lms/backend && mkdir -p ~/backup && cp db.sqlite3 ~/backup/db-$(date +\%F).sqlite3 && tar czf ~/backup/media-$(date +\%F).tgz media && find ~/backup -mtime +14 -delete
```

Unduh isi `~/backup` ke laptop secara berkala (cadangan di server yang sama tidak cukup).

## Masalah Umum

| Gejala                                         | Penyebab & solusi                                                                 |
|------------------------------------------------|-----------------------------------------------------------------------------------|
| Halaman login: "Network Error"                 | `VITE_API_URL` salah, atau CORS: cek `CORS_ALLOWED_ORIGINS` / `..._REGEXES` di `.env` |
| `api.` menampilkan error 500 / "Incomplete response" | Lihat `/home/sigmatek/lms/backend/stderr.log`; biasanya `.env` belum ada atau paket belum terpasang |
| "Bad Request (400)" di `api.`                  | `ALLOWED_HOSTS` belum berisi `api.sigmateknologi.my.id`                           |
| Refresh di `/guru/...` jadi 404                | `.htaccess` tidak ikut ter-upload ke `public_html`                                |
| Perubahan `.env` / kode tidak berpengaruh      | Klik **Restart** di Setup Python App                                              |
| Upload video besar gagal                       | Batas upload hosting lebih kecil; kecilkan `MAX_VIDEO_UPLOAD_MB` atau tanyakan hosting |

## Keterbatasan Shared Hosting

RAM/CPU dibagi dengan pelanggan lain, jadi ujian serentak ratusan siswa bisa terasa lambat. Jika
sekolah pelanggan bertambah banyak, pindah ke VPS (`docs/DEPLOY.md`) tanpa mengubah kode.
