# Isi Media Pembelajaran Interaktif

## Petualangan Flowgorithm (X RPL)

Berkas di folder ini dibuat oleh `buat_petualangan_flowgorithm.py` dari media lama (bahan acuan di
`media-source/`, tidak di-commit). Isinya sudah diperiksa seperti saat terbit (test
`apps/learning_media/tests/test_flowgorithm.py::ContentTests`).

| Berkas | Isi |
|---|---|
| `petualangan-flowgorithm.json` | 21 stasiun materi (5 bagian) + 8 studi kasus + 3 kasus pondok (opsional), glosarium 28 istilah, maskot Bita |
| `tes-awal-flowgorithm.txt` | Tes Awal, 10 soal PG |
| `tes-akhir-flowgorithm.txt` | Tes Akhir, 10 soal PG setara (konsep sama, angka/kalimat berbeda) |

### Cara memasang di kelas

1. **Media:** menu *Media Interaktif* → *Media Baru* (judul "Petualangan Flowgorithm", mapel Dasar-Dasar
   Pemrograman) → *Impor Bahan* → **JSON** → pilih `petualangan-flowgorithm.json` → *Periksa* → *Terapkan ke Draf*
   → periksa di *Pratinjau* → **Terbitkan**.
2. **Tes Awal & Tes Akhir:** menu *Lembar Asesmen* → buat dua asesmen di kelas-mapel X RPL 1 (mis. "Tes Awal
   Flowgorithm" dan "Tes Akhir Flowgorithm") → *Impor Soal* → **Teks** → tempel isi berkas `.txt` masing-masing →
   *Periksa* → *Impor*. Atur KKM bila perlu, lalu terbitkan.
3. **Materi:** di kelas X RPL 1 tambah Materi bertipe **Media Interaktif**, pilih media tadi, atur *Tes Awal* dan
   *Tes Akhir* dengan dua asesmen di atas, aturan buka stasiun *Berurutan*.

### Ringkasan isi

- Bagian 1–5: algoritma, flowchart & layar Flowgorithm, simbol, variabel, tipe data, array, operator, Output,
  Input, Assign, sekuensial, If, If bersarang, While, For & Do While, fungsi, komentar & langkah demi langkah
  (berburu bug), array & perulangan. Setiap stasiun: dialog Bita, latihan (urutkan, kelompokkan, pasangkan, PG,
  tebak output, isi bagian kosong program, lab), Belajar ulang, Tantangan, ringkasan, refleksi, lencana.
- Bagian 6 Studi Kasus: K1–K8 (dinilai dengan uji; uji terakhir tersembunyi), terbuka setelah stasiun materi yang
  dibutuhkan. P1–P3 kasus pondok (zakat fitrah, target setoran hafalan, poin kedisiplinan santri), opsional.
- Soal kuis yang dipakai Tes Awal/Akhir sengaja **tidak** dipakai di media agar perbandingan N-Gain adil.

Untuk membuat ulang (mis. setelah memperbaiki kalimat di skrip): dari folder `backend` dengan venv aktif,
`python ../docs/mpi/buat_petualangan_flowgorithm.py`.
