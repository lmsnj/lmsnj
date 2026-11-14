# Rencana Integrasi Jadwal KBM & Distribusi JP ke LMSNJ

Disusun dari kajian repo `lmsnj/lmsnj` (commit `a9bc552`) dan `data-akademik-ganjil-2026-2027.json`.
**Status:** Fase 1–3 sudah dikerjakan (termasuk tab "Jadwal Hari Ini" di Beranda guru & siswa) (lihat `README.md` di folder ini); Fase 4 belum. Perbedaan dari rancangan: `TimetableEntry` memakai CASCADE (seperti `TeachingSession`), dan `TimeSlot` tidak dibatasi unik per kelas di database, tetapi diperiksa saat impor.

## 1. Kondisi LMSNJ saat ini

| Kebutuhan data | Sudah ada di LMSNJ | Catatan |
|---|---|---|
| Guru | `accounts.User` (role `teacher`, `username`, `nip`) | Tidak ada kolom kode guru (`A0372` dst.) |
| Kelas | `academics.Classroom` (`name`, `grade`, `major`, `academic_year`) | Cocok; 22 kelas tinggal diisi |
| Mapel | `academics.Subject` (`code` unik, `name`) | Cocok; 34 kode bisa dipakai langsung |
| Guru–mapel–kelas | `academics.TeachingAssignment` | Cocok; data menghasilkan 172 pengampu |
| Jadwal mingguan | Belum ada | `schedule.TeachingSession` hanya sesi bertanggal yang dibuat guru, bukan jadwal tetap per hari/jam |
| Slot waktu & kegiatan non-KBM | Belum ada | |
| Beban JP guru | Belum ada | |
| Impor massal | Excel (Mapel, Kelas, Pengampu, Pengguna) | Pola Template → Periksa → Impor bisa ditiru |

Jadi tiga tabel induk dan pengampu sudah siap menampung data; yang perlu dibangun adalah jadwal mingguan.

## 2. Pemetaan data

| JSON | Tujuan | Aturan |
|---|---|---|
| `mapel` (34) + `PKL`, `BK` | `Subject` | `code` = kode dokumen (W, R, DDP, BWH, …) |
| `kelas` (22) | `Classroom` | `academic_year` = 2026/2027; `major` dari nama (RPL, TKJ, DKV, TPTL, APHPI, DPB) |
| `guru` (44) | `User` role `teacher` | Dicocokkan lewat kode guru (lihat keputusan A) |
| `jadwal` + `distribusi_jp` | `TeachingAssignment` | Gabungan pasangan unik guru–mapel–kelas: 147 dari jadwal, 172 termasuk PKL kelas XII |
| `slot_waktu` (66) | Model baru `TimeSlot` | |
| `jadwal` (576) | Model baru `TimetableEntry` | |
| `distribusi_jp` | Kolom baru `weekly_hours` di `TeachingAssignment` | JP resmi; JP jadwal dihitung dari entri |

Kelas gabungan putri tidak butuh model khusus: tiap kelas mendapat pengampu dan entri jadwalnya sendiri dengan guru yang sama.

## 3. Rancangan model baru (di app `schedule`)

- **`Timetable`** — satu versi jadwal: `code` (SMKNJ-262702), `academic_year`, `semester`, `effective_from`, `is_active`. Jadwal baru tidak menimpa yang lama.
- **`TimeSlot`** — `timetable`, `day` (Sabtu–Kamis), `period` (0–8, kosong untuk istirahat/sholat), `starts_at`, `ends_at`, `kind` (`lesson`/`activity`), `label` (Pembiasaan Karakter Baik, KBM Diniyah, Pramuka, Ekstrakurikuler, Istirahat, Sholat Dhuhur).
- **`TimetableEntry`** — `time_slot` + `teaching_assignment` (PROTECT). Unik per (slot, kelas).

Validasi di `services.py`:
- satu kelas hanya satu mapel per slot;
- satu guru boleh di beberapa kelas pada slot yang sama hanya jika mapelnya sama (kelas gabungan); selain itu ditolak sebagai bentrok.

## 4. Tahapan kerja

**Fase 1 — Data induk.** Tambah `teacher_code` di `User` (migrasi). Perintah `python manage.py import_timetable docs/jadwal/data-akademik-ganjil-2026-2027.json --dry-run` yang membuat/memperbarui mapel, kelas, guru, dan pengampu secara idempoten, dengan laporan apa yang dibuat, dilewati, dan tidak cocok. Akun guru baru diberi password acak sekali tampil, mengikuti pola `user_import.py`.

**Fase 2 — Jadwal mingguan (backend).** Model di butir 3, migrasi, serializer, `TimetableViewSet` baca-saja untuk guru/siswa memakai `teaching_assignments_for`, tulis hanya admin. Endpoint `/api/timetable/` dengan filter `classroom`, `teacher`, `day`. Test `APITestCase` untuk hak akses, aturan bentrok, dan impor ulang.

**Fase 3 — Tampilan.** Halaman "Jadwal Pelajaran":
- siswa: jadwal kelasnya per hari (kartu di HP, grid di layar lebar);
- guru: jadwal mengajarnya + total JP per minggu;
- admin: grid per kelas atau per guru, dan rekap beban JP (jadwal vs distribusi).
Tambah menu di `layouts/navigation.js`, route `lazy()`, dan panel "Jadwal Hari Ini" di Beranda.

**Fase 4 (opsional).** Impor jadwal lewat Excel di menu admin dengan pola `ImportExcelModal`; tombol "Buat sesi dari jadwal" untuk mengisi `TeachingSession`.

## 5. Keputusan yang dibutuhkan sebelum mulai

| | Pertanyaan | Usulan |
|---|---|---|
| A | Bagaimana kode guru disimpan? | Kolom baru `teacher_code`; `username` dan `nip` tidak diubah |
| B | Apakah akun guru, kelas, dan mapel sudah ada di database yang berjalan? | Jika sudah, impor mencocokkan dulu (kode guru / nama kelas / kode mapel) dan hanya menambah yang belum ada |
| C | Nama kelas memakai format mana? | Format distribusi (`X-RPL`, `X-TKJ 1`) agar sama dengan dokumen resmi |
| D | BK (1 JP per kelas, tidak ada di distribusi) ikut dimasukkan? | Ya, sebagai mapel `BK` di jadwal; `weekly_hours` dikosongkan |
| E | Lima guru dengan total JP tanpa rincian (114 JP) | Hanya dibuatkan akun; JP-nya menunggu konfirmasi Waka Kurikulum |
| F | PKL kelas XII (hanya di distribusi) | Dibuat sebagai pengampu dengan `weekly_hours`, tanpa entri jadwal |
| G | Nama BWG: Robotika atau MikroTik Academy? | Menunggu konfirmasi |

## 6. Catatan teknis

- Hari aktif Sabtu–Kamis; pilihan hari di model harus memuat Ahad dan Sabtu, dan "jadwal hari ini" memakai `timezone.localdate()` (Asia/Jakarta).
- Nama mapel terpanjang 38 karakter, kode terpanjang 4; muat di `Subject`.
- `TeachingAssignment` memakai PROTECT, jadi impor tidak menghapus pengampu lama; pengampu yang hilang dari jadwal baru hanya dilaporkan.
- CLAUDE.md meminta fitur di luar lingkup disetujui dulu; jadwal mingguan adalah fitur baru, jadi kerjakan per fase setelah disetujui.
