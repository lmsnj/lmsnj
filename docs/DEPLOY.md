# Panduan Deploy ke Server Sekolah

Panduan ini memasang LMS di satu server, contohnya **Ubuntu Server 24.04** dengan **Nginx**
dan **Gunicorn**. Catatan untuk server Windows ada di bagian akhir.

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
ALLOWED_HOSTS=lms.smknj.sch.id
CORS_ALLOWED_ORIGINS=https://lms.smknj.sch.id
CSRF_TRUSTED_ORIGINS=https://lms.smknj.sch.id
HTTPS=True            # False jika belum memakai sertifikat SSL (mis. hanya di jaringan lokal)
```

Siapkan database, file statis, dan akun admin pertama:

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

> **Jangan** menjalankan `seed_demo` di server asli. Buat akun guru dan siswa lewat menu
> Pengguna di aplikasi.

### Layanan Gunicorn (systemd)

Buat `/etc/systemd/system/lms.service`:

```ini
[Unit]
Description=LMS SMKS Nurul Jadid (Gunicorn)
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
sudo -u lms cp .env.production.example .env.production
# Karena satu domain, cukup pakai alamat relatif:
echo "VITE_API_URL=/api" | sudo -u lms tee .env.production
sudo -u lms npm ci
sudo -u lms npm run build        # hasil di frontend/dist/
```

## 4. Nginx

Buat `/etc/nginx/sites-available/lms`:

```nginx
server {
    listen 80;
    server_name lms.smknj.sch.id;

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
sudo certbot --nginx -d lms.smknj.sch.id
```

Lalu pastikan `.env` berisi `HTTPS=True` dan restart: `sudo systemctl restart lms`.
Setelah yakin HTTPS berjalan stabil, `SECURE_HSTS_SECONDS=31536000` boleh ditambahkan.

## 6. Pindah ke PostgreSQL (Opsional)

SQLite cukup untuk satu sekolah dengan beberapa ratus pengguna. Jika ingin PostgreSQL:

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
- [ ] Tidak ada akun demo; admin memakai password yang kuat
- [ ] Upload PDF 9 MB berhasil (memastikan `client_max_body_size` benar)
- [ ] Refresh browser di halaman dalam (mis. `/guru/kelas/1`) tidak menghasilkan 404
- [ ] Backup database + folder media berjalan dan sudah diuji pulihkan
