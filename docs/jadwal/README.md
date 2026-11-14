# Jadwal Pelajaran Mingguan

Fitur **Jadwal Pelajaran** menampilkan jadwal KBM mingguan: siswa melihat jadwal kelasnya, guru melihat
jadwal mengajarnya, admin melihat semua kelas/guru dan rekap beban mengajar.

Data jadwal diisi dari file JSON hasil olahan dokumen Jadwal KBM dan Distribusi JP.

## File data

File `data-akademik-*.json` berisi nama guru, jadi **tidak ikut di-commit** (lihat `.gitignore`).
Simpan sendiri di folder ini pada komputer/server, lalu jalankan perintah impor.

## Cara impor (dari folder `backend/`)

```
python manage.py migrate
python manage.py import_timetable ..\docs\jadwal\data-akademik-ganjil-2026-2027.json --school smknj --dry-run
python manage.py import_timetable ..\docs\jadwal\data-akademik-ganjil-2026-2027.json --school smknj --passwords-file password-guru.csv
```

1. `--school` = kode sekolah tujuan (wajib); data sekolah lain tidak tersentuh.
   `--dry-run` hanya memeriksa dan menampilkan laporan; tidak ada yang disimpan. Baca laporannya dulu.
2. Tanpa `--dry-run`, data disimpan. Password awal akun guru baru ditampilkan **sekali** dan (bila
   `--passwords-file` diisi) disimpan ke CSV. Bagikan ke guru, lalu hapus file CSV-nya.

Yang dilakukan impor:

| Data | Aturan |
|---|---|
| Mapel | Dicocokkan lewat kode. Yang belum ada dibuat; nama mapel yang sudah ada tidak diubah. |
| Kelas | Dicocokkan lewat nama pada tahun ajaran yang sama (`X-RPL` = `X RPL` = `X RPL 1`). Yang belum ada dibuat. |
| Guru | Dicocokkan lewat **kode guru**; jika belum ada, lewat nama (tanpa gelar) lalu kode guru diisikan ke akun itu. Yang belum ada dibuatkan akun dengan username = kode guru huruf kecil (mis. `a0372`). |
| Pengampu | Dibuat untuk setiap pasangan guru-mapel-kelas; JP resmi diisi dari distribusi JP. |
| Jadwal | Satu versi per kode jadwal. Impor ulang kode yang sama mengganti isinya; kode baru menjadi versi baru dan versi lama tetap tersimpan. Jadwal yang diimpor menjadi jadwal aktif (kecuali `--no-activate`). |

Impor aman dijalankan berulang kali. Jika ada masalah (dua akun guru bernama sama, bentrok jadwal,
kode tidak dikenal), impor dibatalkan seluruhnya dan masalahnya ditampilkan.

Pilihan lain: `--all-teachers` membuat akun juga untuk guru yang tidak punya jam mengajar di file.

## Impor lewat Excel (menu admin)

Admin juga bisa mengimpor dari aplikasi: **Jadwal Pelajaran → Impor Excel**. Unduh template, isi
lembar Info (kode jadwal, tahun ajaran, semester, berlaku sejak), Slot Waktu, Jadwal (Hari + Jam Ke +
Kelas + Kode Mapel + Kode Guru), Guru, Mapel, dan Distribusi JP (opsional), lalu **Periksa** →
**Impor Jadwal**. Aturannya sama dengan perintah di atas (memakai kode yang sama). Password akun guru
baru ditampilkan sekali setelah impor dan bisa dicetak sebagai kartu atau dikirim lewat WhatsApp.

## Buat sesi mengajar dari jadwal

Di halaman **Sesi Mengajar**, guru menekan **Buat dari Jadwal**, memilih rentang tanggal (maks. 31
hari), Periksa, lalu Buat. Setiap blok jam berurutan untuk satu kelas-mapel menjadi satu sesi (kelas
gabungan tetap satu sesi per kelas agar presensinya terpisah). Sesi yang sudah ada tidak dibuat dua kali.

## Aturan bentrok

- Satu kelas hanya boleh punya satu pelajaran per jam.
- Satu guru boleh mengajar beberapa kelas pada jam yang sama **hanya jika mapelnya sama** (kelas gabungan).

## Dokumen terkait

- `RENCANA-INTEGRASI-JADWAL.md` — rancangan dan keputusan.
- `BRIEF-JADWAL-LMSNJ.md` — struktur file JSON dan catatan pencocokan dua dokumen sumber.
