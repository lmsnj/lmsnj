# Panduan Deploy ke Server (sigmateknologi.my.id)

Panduan ini memasang LMS Sigma di satu server, contohnya **Ubuntu Server 24.04** dengan **Nginx**
dan **Gunicorn**, untuk domain `sigmateknologi.my.id`: setiap sekolah di `<kode>.sigmateknologi.my.id`
dan Super Admin di `admin.sigmateknologi.my.id` (lihat bagian 9). Catatan untuk server Windows ada
di bagian akhir.

## Gambaran

```
Browser ──► Nginx (port 80/443)
             ├── /            → file frontend hasil build (frontend/dist)
             ├── /api/, /admin/ → Gunicorn (Django) di 127.0.0.1:8000
             └── /static/     → Gunicorn (disajikan WhiteNoise)
```

Frontend dan API berada di **domain yang sama**, jadi tidak perlu pengaturan CORS yang rumit.
Folder `backend/media/` (file materi & jawaban siswa) **tidak** disajikan Nginx; file hanya
bisa diunduh lewat API yang mengecek hak akses.

## 1. Siapkan Server

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx git
# Node.js 22 (untuk build frontend) — bisa juga build di laptop lalu salin folder dist/
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

sudo useradd --system --create-home --home-dir /srv/lms lms
sudo -u lms git clone <alamat-repositori> /srv/lms/app
```

## 2. Backend

```bash
cd /srv/lms/app/backend
sudo -u lms python3 -m venv .venv
sudo -u lms .venv/bin/pip install -r requirements.txt gunicorn
sudo -u lms cp .env.example .env
sudo -u lms nano .env
```

Isi `.env` minimal:

```ini
SECRET_KEY=<hasil: python3 -c "import secrets; print(secrets.token_urlsafe(50))">
DEBUG=False
ALLOWED_HOSTS=sigmateknologi.my.id,.sigmateknologi.my.id
CORS_ALLOWED_ORIGINS=https://admin.sigmateknologi.my.id
CSRF_TRUSTED_ORIGINS=https://admin.sigmateknologi.my.id
HTTPS=True            # False jika belum memakai sertifikat SSL (mis. hanya di jaringan lokal)
```

Siapkan database, file statis, dan akun **Admin Yayasan** pertama (`createsuperuser`
otomatis memberi peran Admin Yayasan):

```bash
sudo -u lms .venv/bin/python manage.py migrate
sudo -u lms .venv/bin/python manage.py collectstatic --noinput
sudo -u lms .venv/bin/python manage.py createsuperuser
sudo -u lms .venv/bin/python manage.py check --deploy
```

`check --deploy` sebaiknya tidak menampilkan **error**. Peringatan yang boleh dibiarkan:

- `security.W005` / `W021` (HSTS subdomain & preload) — aktifkan hanya jika **semua**
  subdomain sekolah sudah HTTPS.
- `W004`, `W008`, `W012`, `W016` — muncul jika `HTTPS=False`. Wajar untuk server yang hanya
  bisa diakses di jaringan lokal sekolah, tetapi sebaiknya segera pasang HTTPS (langkah 5).

> **Jangan** menjalankan `seed_demo` di server asli. Setelah login sebagai Admin Yayasan:
> tambahkan sekolah di menu **Daftar Sekolah**, buka sekolah itu lewat **Ganti Sekolah**, lalu
> buat akun admin sekolah di menu **Pengguna**. Akun guru dan siswa dibuat oleh admin sekolah.
>
> Server yang di-upgrade dari versi satu sekolah: `migrate` otomatis membuat sekolah `smknj`
> dari identitas sekolah lama dan memasukkan semua kelas, mapel, dan pengguna lama ke sana.

### Layanan Gunicorn (systemd)

Buat `/etc/systemd/system/lms.service`:

```ini
[Unit]
Description=LMS Sigma (Gunicorn)
After=network.target

[Service]
User=lms
WorkingDirectory=/srv/lms/app/backend
ExecStart=/srv/lms/app/backend/.venv/bin/gunicorn config.wsgi:application \
    --bind 127.0.0.1:8000 --workers 3 --timeout 120
Restart=always

[Install]
WantedBy=multi-user.target
```

`--timeout 120` memberi waktu cukup untuk upload file lewat internet yang lambat.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lms
sudo systemctl status lms
```

## 3. Frontend

```bash
cd /srv/lms/app/frontend
# Contoh sudah berisi VITE_API_URL=/api (satu domain) dan VITE_BASE_DOMAIN=sigmateknologi.my.id.
sudo -u lms cp .env.production.example .env.production
sudo -u lms npm ci
sudo -u lms npm run build        # hasil di frontend/dist/
```

## 4. Nginx

Buat `/etc/nginx/sites-available/lms`:

```nginx
server {
    listen 80;
    server_name sigmateknologi.my.id .sigmateknologi.my.id;

    # Harus sedikit di atas MAX_UPLOAD_SIZE_MB (10 MB). Bawaan Nginx hanya 1 MB,
    # sehingga upload materi/tugas akan gagal jika baris ini tidak ada.
    client_max_body_size 12M;

    root /srv/lms/app/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # Unggah video soal video interaktif: sedikit di atas MAX_VIDEO_UPLOAD_MB (100 MB).
    location ~ ^/api/assessment-questions/\d+/images/$ {
        client_max_body_size 105M;
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
    }

    # Putar video soal (streaming dengan header Range): jangan ditampung dulu oleh Nginx.
    location /api/assessment-videos/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header Range $http_range;
        proxy_buffering off;
    }

    location ~ ^/(admin|static)/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Aplikasi React (single page): semua alamat lain diarahkan ke index.html
    # agar halaman seperti /guru/kelas/3 tetap bisa di-refresh.
    location / {
        try_files $uri /index.html;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/lms /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 5. HTTPS (Sangat Disarankan)

Tanpa HTTPS, password dan token login dikirim tanpa enkripsi. Jika server bisa diakses dari
internet dan punya domain:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Karena setiap sekolah memakai subdomain sendiri, buat sertifikat **wildcard**
(`*.sigmateknologi.my.id`) sesuai langkah 3 di bagian 9. Lalu pastikan `.env` berisi `HTTPS=True` dan restart: `sudo systemctl restart lms`.
Setelah yakin HTTPS berjalan stabil, `SECURE_HSTS_SECONDS=31536000` boleh ditambahkan.

## 6. Pindah ke PostgreSQL (Opsional)

SQLite cukup untuk beberapa sekolah dengan total beberapa ratus pengguna. Jika jumlah
pengguna semua sekolah sudah ribuan, sebaiknya pindah ke PostgreSQL:

```bash
sudo apt install -y postgresql
sudo -u postgres createuser lms --pwprompt
sudo -u postgres createdb lms_smknj --owner lms
sudo -u lms .venv/bin/pip install "psycopg[binary]"
```

Pindahkan data lama (jika sudah ada), lalu ganti pengaturan:

```bash
sudo -u lms .venv/bin/python manage.py dumpdata --natural-foreign --natural-primary \
    --exclude contenttypes --exclude auth.permission --exclude token_blacklist -o data.json
```

Ubah `.env`: `DB_ENGINE=postgresql`, `DB_NAME=lms_smknj`, `DB_USER=lms`, `DB_PASSWORD=...`, lalu:

```bash
sudo -u lms .venv/bin/python manage.py migrate
sudo -u lms .venv/bin/python manage.py loaddata data.json
sudo systemctl restart lms
```

Untuk MySQL/MariaDB caranya sama dengan `DB_ENGINE=mysql` dan paket `mysqlclient`.

## 7. Backup

Yang **wajib** dibackup rutin (misalnya setiap malam):

1. **Database**: file `backend/db.sqlite3` (atau `pg_dump lms_smknj` untuk PostgreSQL).
2. **Folder `backend/media/`**: berisi semua file materi dan jawaban siswa. Database tanpa
   folder ini membuat file tidak bisa diunduh.
3. File `backend/.env` (simpan di tempat aman; berisi `SECRET_KEY`).

Contoh cron (`sudo crontab -u lms -e`) untuk SQLite:

```cron
0 1 * * * cd /srv/lms/app/backend && sqlite3 db.sqlite3 ".backup /srv/lms/backup/db-$(date +\%F).sqlite3" && tar czf /srv/lms/backup/media-$(date +\%F).tar.gz media
```

Simpan salinan backup di luar server (flashdisk, NAS, atau cloud) dan uji pemulihannya
sesekali.

## 8. Memperbarui Aplikasi

```bash
cd /srv/lms/app
sudo -u lms git pull
cd backend
sudo -u lms .venv/bin/pip install -r requirements.txt gunicorn
sudo -u lms .venv/bin/python manage.py migrate
sudo -u lms .venv/bin/python manage.py collectstatic --noinput
sudo systemctl restart lms
cd ../frontend
sudo -u lms npm ci && sudo -u lms npm run build
```

Backup database dan folder media **sebelum** memperbarui.

## 9. Subdomain per Sekolah (Banyak Sekolah Pelanggan)

Satu server melayani banyak sekolah. Setiap sekolah punya alamat sendiri, dan Super Admin punya
alamat khusus untuk membuat dan mengelola sekolah:

| Alamat | Isi |
|--------|-----|
| `admin.sigmateknologi.my.id` | Super Admin: Daftar Sekolah, tambah/nonaktifkan sekolah, ringkasan semua sekolah |
| `smknj.sigmateknologi.my.id` | Sekolah berkode `smknj` (guru, siswa, admin sekolah itu saja) |
| `<kode>.sigmateknologi.my.id` | Sekolah baru langsung bisa dibuka setelah dibuat Super Admin |

Kode sekolah = subdomain (huruf kecil, angka, tanda hubung). Kode `admin`, `www`, `api`, dll.
dicadangkan. Di subdomain sekolah hanya anggota sekolah itu (dan Super Admin) yang bisa masuk;
sekolah yang dinonaktifkan langsung tidak bisa dipakai, datanya tetap tersimpan.

**1. DNS** — di pengelola domain (registrar atau Cloudflare), arahkan dua rekaman `A` ke IP server:

```
sigmateknologi.my.id     A   <IP server>
*.sigmateknologi.my.id   A   <IP server>
```

Rekaman `*` (wildcard) membuat semua subdomain, termasuk sekolah yang baru dibuat, langsung
mengarah ke server tanpa perlu menambah DNS lagi.

**2. Nginx** — pakai konfigurasi bagian 4, cukup ganti `server_name` (titik di depan = semua
subdomain). Pastikan `proxy_set_header Host $host;` tetap ada.

```nginx
server_name sigmateknologi.my.id .sigmateknologi.my.id;
```

**3. HTTPS wildcard** — sertifikat untuk `*.sigmateknologi.my.id` hanya bisa dibuat lewat
verifikasi DNS:

```bash
sudo certbot certonly --manual --preferred-challenges dns \
  -d sigmateknologi.my.id -d '*.sigmateknologi.my.id'
```

Certbot meminta Anda menambah rekaman `TXT` `_acme-challenge` di DNS. Cara manual ini harus
diulang setiap ±90 hari; agar otomatis, pakai plugin DNS pengelola domain Anda (mis.
`python3-certbot-dns-cloudflare` jika memakai Cloudflare). Lalu tambahkan di blok `server` Nginx:

```nginx
listen 443 ssl;
ssl_certificate     /etc/letsencrypt/live/sigmateknologi.my.id/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/sigmateknologi.my.id/privkey.pem;
```

**4. `backend/.env`**

```
ALLOWED_HOSTS=sigmateknologi.my.id,.sigmateknologi.my.id
CSRF_TRUSTED_ORIGINS=https://admin.sigmateknologi.my.id
HTTPS=True
```

**5. `frontend/.env`** lalu `npm run build`:

```
VITE_API_URL=/api
VITE_BASE_DOMAIN=sigmateknologi.my.id
```

Karena frontend dan API berada di alamat yang sama (`/api`), CORS tidak perlu diatur.

**6. Akun Super Admin pertama:** `python manage.py createsuperuser` (otomatis berperan Super
Admin), lalu masuk di `https://admin.sigmateknologi.my.id`.

**Menambah sekolah pelanggan:** Daftar Sekolah → **Tambah Sekolah** → isi nama, kode (menjadi
alamat), jenjang, dan (opsional) akun admin sekolah. Password admin yang dikosongkan dibuat
otomatis dan **hanya ditampilkan sekali** beserta alamat sekolahnya; tombol **Salin** menyalin
semuanya untuk dikirim ke sekolah.

**Mencoba di laptop:** browser mengarahkan `*.localhost` ke komputer sendiri, jadi tidak perlu
DNS. Isi `frontend/.env` dengan `VITE_BASE_DOMAIN=localhost` dan `backend/.env` dengan
`CORS_ALLOWED_ORIGIN_REGEXES=^http://[a-z0-9-]+\.localhost:5173$`, jalankan ulang keduanya, lalu
buka `http://admin.localhost:5173` (Super Admin) atau `http://smknj.localhost:5173` (sekolah).

## Catatan untuk Server Windows

Gunicorn tidak berjalan di Windows. Gunakan **Waitress**:

```bash
.venv\Scripts\pip install waitress
.venv\Scripts\waitress-serve --listen=127.0.0.1:8000 --channel-timeout=120 config.wsgi:application
```

Jalankan sebagai layanan Windows dengan [NSSM](https://nssm.cc/), dan gunakan Nginx for
Windows atau IIS (modul URL Rewrite + ARR) dengan pengaturan yang sama seperti bagian Nginx di
atas: sajikan `frontend/dist`, teruskan `/api/`, `/admin/`, `/static/` ke port 8000, arahkan
alamat lain ke `index.html`, dan naikkan batas ukuran upload.

## Daftar Periksa Sebelum Dipakai

- [ ] `DEBUG=False` dan `SECRET_KEY` acak sudah diisi
- [ ] `python manage.py check --deploy` tanpa error
- [ ] HTTPS aktif (atau server hanya bisa diakses dari jaringan sekolah)
- [ ] Tidak ada akun demo; Admin Yayasan dan admin sekolah memakai password yang kuat
- [ ] Setiap sekolah sudah dibuat (jenjang benar) dan punya minimal satu admin sekolah
- [ ] Upload PDF 9 MB berhasil (memastikan `client_max_body_size` benar)
- [ ] Unggah video soal (mis. 50 MB) berhasil dan video bisa digeser saat diputar
- [ ] Refresh browser di halaman dalam (mis. `/guru/kelas/1`) tidak menghasilkan 404
- [ ] Backup database + folder media berjalan dan sudah diuji pulihkan
