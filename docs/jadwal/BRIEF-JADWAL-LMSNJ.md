# Brief untuk Claude Code — Integrasi Jadwal KBM & Distribusi JP ke LMSNJ

Letakkan file ini bersama `data-akademik-ganjil-2026-2027.json` di repo LMS (mis. `docs/jadwal/`), lalu minta Claude Code:

> Baca `docs/jadwal/BRIEF-JADWAL-LMSNJ.md` dan `data-akademik-ganjil-2026-2027.json`. Kaji dulu struktur database/API LMSNJ yang sudah ada, lalu usulkan rencana (tanpa mengubah kode) untuk memasukkan data jadwal dan distribusi JP ini. Tunggu persetujuan saya sebelum implementasi.

## Sumber data

| Dokumen | Isi |
|---|---|
| JADWAL KBM Semester Ganjil 2026/2027, kode SMKNJ-262702 | Jadwal per hari/jam untuk 16 kelas (X dan XI), berlaku sejak 10 Oktober 2026 |
| DISTRIBUSI JP KBM Semester Ganjil 2026/2027 | Beban JP 43 guru per mapel per kelas (X, XI, XII), total 715 JP |

Keduanya ditandatangani Kepala Sekolah, Paiton, 9 Oktober 2026.

## Isi file JSON

| Kunci | Jumlah | Keterangan |
|---|---|---|
| `meta` | – | Sekolah, tahun pelajaran, semester, kode jadwal, tanggal berlaku, hari aktif (Sabtu–Kamis) |
| `kelas` | 22 | Nama, tingkat, kelompok (X MAT-PA/PI, XI/XII PUTRA/PUTRI), total JP menurut distribusi |
| `guru` | 44 | Kode (A0xxx), nama, JK |
| `mapel` | 34 | Kode dan nama mapel dari legenda jadwal |
| `slot_waktu` | 66 | Semua baris waktu per hari; `jenis` = `KBM` atau `NON_KBM` (+ `kegiatan`) |
| `jadwal` | 576 | Satu entri = 1 JP: hari, jam ke, waktu, kelas, kode mapel, kode guru, `kelas_gabungan` |
| `distribusi_jp` | 124 | Guru × mapel × kelas × JP |
| `total_jp_guru_distribusi` | 43 | Kolom "Total Jam Mapel" per guru |

Nama kelas dinormalkan mengikuti dokumen distribusi (mis. "X TKJ" di jadwal → `X-TKJ 1`).

## Hasil pencocokan dua dokumen (perlu diputuskan sebelum implementasi)

1. **Kelas gabungan putri.** Mapel umum untuk X-APHPi, X-RPL 2, X-TKJ 2, X-DKV 2, X-DPB diajar satu guru pada jam yang sama; begitu juga XI-TKJ 2, XI-DKV 2, XI-DPB. Di distribusi JP-nya hanya dicatat sekali (kolom X-APHPi / XI-TKJ 2), sehingga total kelas itu tertulis 24 atau 28 JP padahal di jadwal tiap kelas terisi 36 JP. Ini bukan bentrok; di JSON ditandai lewat `kelas_gabungan`. Validasi bentrok guru di LMS harus mengecualikan kasus ini.
2. **BK tidak ada di distribusi.** Setiap kelas di jadwal punya 1 JP BK (A0368), tetapi di distribusi A0368 bertotal 0. Akibatnya satu mapel produktif di tiap kelas berselisih 1 JP (mis. DDP X-RPL A0372: jadwal 11, distribusi 12).
3. **Lima guru punya total JP tanpa rincian:** A0343 (18), A0346 (12), A0367 (28), A0360 (28), A0362 (28) — jumlahnya 114 JP, persis selisih antara total 715 dan rincian 601. Nomor kolom dokumen melompat dari 4 ke 10, jadi kemungkinan ada kolom tersembunyi (diduga jam diniyah/Furudhul 'Ainiyah — perlu konfirmasi Waka Kurikulum).
4. **Kelas XII** hanya muncul di distribusi (PKL), tidak ada di jadwal.
5. **Nama mapel BWG berbeda:** "Mapel Pilihan (Robotika)" di jadwal, "Mapel Pilihan (MikroTik Academy)" di distribusi.
6. **A0471** ada di legenda jadwal tetapi tidak ada di distribusi dan tidak mengajar di jadwal.
7. **Waktu hari Selasa** tertulis jam 0 = 07.00–08.00 dan jam 2 = 08.35–09.00 (jam 3 mulai 09.10); disalin apa adanya dari dokumen.
8. Kode `APHP` (APHPi) dan kode BW* untuk Furudhul 'Ainiyah/Matrikulasi ada di legenda tetapi tidak dipakai di jadwal.

Di luar butir 1–2, seluruh pasangan guru–mapel–kelas di jadwal cocok dengan distribusi.

## Hal yang perlu dikaji Claude Code

- Tabel/entitas apa yang sudah ada di LMSNJ untuk guru, kelas, mapel, tahun ajaran/semester; apakah kode guru `A0xxx` dan kode mapel bisa jadi kunci pencocokan dengan data user/course yang sudah ada.
- Rancangan tabel baru: `slot_waktu`, `jadwal`, `distribusi_jp`, serta cara merepresentasikan kelas gabungan dan kegiatan non-KBM (pembiasaan, diniyah, pramuka, ekstrakurikuler, istirahat, sholat).
- Skrip seed/import yang idempoten dari file JSON ini, plus versi jadwal (kode `SMKNJ-262702`, tanggal berlaku) agar jadwal berikutnya tidak menimpa riwayat.
- Pemakaian di fitur: jadwal hari ini untuk siswa/guru, penautan course ke kelas–mapel–guru, rekap beban JP guru, deteksi bentrok.
- Hari aktif Sabtu–Kamis (Jumat libur) — pastikan logika kalender tidak mengasumsikan Senin–Jumat.
