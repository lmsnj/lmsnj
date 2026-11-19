# Panduan Guru — Media Pembelajaran Interaktif (MPI)

Media Interaktif adalah materi berbentuk "petualangan": **Bagian → Stasiun → Langkah**. Siswa belajar langkah demi
langkah di HP, mendapat bintang, petunjuk, dan lencana; guru melihat progres, kesulitan, dan N-Gain kelas.

## 1. Membuat media

1. Menu **Media Interaktif** → **Media Baru** (judul, mapel) → Studio terbuka.
2. **Sudah punya bahan?** Tekan **Impor Bahan** (lihat bagian 3) agar tidak mengetik ulang.
3. Di daftar kiri: tambah **Bagian**, tambah stasiun dari **template** (konsep, latihan, studi kasus, kuis), lalu
   **+ Langkah**. Setiap item bisa dinaikkan, diturunkan, diduplikat, dihapus.
4. Klik item untuk mengedit di kanan. Pengaturan stasiun: tujuan pembelajaran, perkiraan durasi, **opsional**,
   **prasyarat** (stasiun sebelumnya yang wajib selesai), lencana, 3 poin ringkasan, pertanyaan refleksi.
5. **Maskot & glosarium** (paling atas di daftar kiri): nama/gambar maskot dan istilah yang bisa dicari siswa.
6. **Simpan** (atau Ctrl+S) → **Pratinjau** (tampilan HP/laptop, jawaban tidak disimpan) → **Terbitkan**.

Teks boleh berisi **tebal** `**...**`, *miring* `*...*`, rumus `$...$`, dan `{nama_panggilan}` (diganti nama siswa).
Gambar diunggah langsung (dikompres otomatis agar hemat kuota).

### Jenis langkah

| Penjelasan (tanpa nilai) | Latihan (dinilai, memberi bintang) |
|---|---|
| Teks & gambar, Tahukah kamu?, Dialog maskot, Video (YouTube/Drive), Tautan, Kartu bolak-balik, Flashcard, Contoh langkah demi langkah, **Konten HTML5/H5P**, **Flowgorithm demo/lab** | Pilihan ganda (dengan "kenapa salah" per pilihan), Benar/salah, Urutkan, Kelompokkan, Ketuk bagian gambar, Isian rumpang, Tarik & lepas, Pasangkan, **Flowgorithm susun/isi program**, **Flowgorithm tebak output**, **Simulator exposure (DKV)**, **Tugas HTML5/H5P** |

Setiap latihan bisa diberi **petunjuk bertahap** (maks. 3) dan **pembahasan**. Bintang: 3 jika tanpa salah,
berkurang karena salah, membuka petunjuk, atau "Tunjukkan jawaban". Bintang terbaik yang disimpan.
Setiap stasiun juga punya daftar **Belajar ulang** (disarankan bagi siswa yang kesulitan) dan **Tantangan**
(bagi siswa yang mendapat 3 bintang).

## 2. Terbit, versi, dan mengubah setelah terbit

- **Terbitkan** = siswa melihat isi terbaru. Bila ada yang belum lengkap, Studio menunjukkan lokasinya, mis.
  "Bagian 1 › Stasiun 2 › Langkah 3: Alamat video wajib diisi."
- Mengubah, menambah, atau menyusun ulang langkah **setelah terbit aman**: progres siswa disimpan per stasiun/langkah,
  bintang dan status selesai tidak pernah turun. Jawaban siswa dinilai dengan versi yang sedang ia pakai.
- **Riwayat**: lihat versi lama dan pulihkan ke draf bila perlu.

## 3. Impor bahan (Studio › Impor)

Wizard 3 langkah: **Pilih sumber → Periksa** (belum disimpan; terlihat jumlah stasiun/langkah, catatan, dan hal
yang perlu dilengkapi) **→ Terapkan ke draf**. Pilih **Tambahkan** (di belakang isi yang ada) atau **Ganti**.

| Sumber | Cara diubah |
|---|---|
| **Excel / CSV** | Unduh template (berisi isi media ini), ubah di Excel, impor ulang dengan mode Ganti. Kolom Id jangan diubah agar progres siswa tetap. |
| **Word (.docx)** | Judul 1 = bagian, Judul 2 = stasiun, Judul 3 = judul langkah, paragraf/tabel/gambar = langkah teks. Soal `1. ... A. ... B. ... Kunci: B` (+ `Pembahasan: ...`) menjadi latihan. |
| **PowerPoint** | Satu slide = satu langkah; slide "Section Header" = stasiun baru. |
| **PDF** | Satu halaman = satu langkah teks (PDF hasil pindai tidak berisi teks). |
| **Flowgorithm (.fprg)** | Program Flowgorithm asli menjadi langkah lab. |
| **Daftar tautan** | `Judul \| https://...` per baris; `# Judul` = stasiun baru. YouTube/Drive → video, H5P embed → konten HTML5, lainnya → tombol tautan. |
| **Bank soal** | Pilih asesmen & soal; PG, PG kompleks, kategori, isian, seret, jodohkan menjadi latihan. |
| **JSON** | Hasil "Ekspor JSON" media lain, mis. dari sekolah lain. |

Isi siap pakai **Petualangan Flowgorithm** (X RPL) beserta Tes Awal/Akhir ada di `docs/mpi/` (lihat
`docs/mpi/README.md`).

## 4. Flowgorithm

- **Susun program (studi kasus):** tulis soal, program awal (boleh hanya Declare), **program kunci**, dan beberapa
  **uji** (isian → output akhir yang diharapkan). Output boleh dikosongkan lalu tekan **Hitung output dari program
  kunci**. Centang **Tersembunyi** pada uji yang tidak boleh dilihat siswa (dinilai di server).
- **Isi bagian kosong:** tulis `{{}}` di blok yang harus dilengkapi siswa, lalu isi jawabannya (satu per baris).
- **Tebak output:** program ditampilkan, siswa memilih output; jawaban benar dihitung otomatis.
- **Demo/lab:** program contoh untuk dijalankan langkah demi langkah (boleh diubah siswa jika dicentang).
- Tombol **Impor .fprg** memuat program dari file Flowgorithm asli.
- Siswa bisa **Jalankan**, **Langkah**, melihat Console, Pantau Variabel, Flowchart, dan **Coba contoh uji** sebelum
  menekan Periksa.

## 5. Konten HTML5/H5P

Tempel alamat **https** dari situs lain (embed H5P.org `.../h5p/embed/123`, GitHub Pages, Netlify). Alamat LMS sendiri
ditolak demi keamanan. Pada **Tugas HTML5/H5P** pilih: siswa mencentang "sudah selesai" (konten apa saja), atau
konten melaporkan selesai + skor lewat bridge (konten buatan sendiri, lihat `docs/mpi-bridge.md` dan contoh
`docs/mpi/contoh-konten-bridge.html`). Laporan dari browser tidak bisa dibuktikan server — pakai untuk latihan.

## 6. Memasang di kelas

Menu **Materi** → tambah materi bertipe **Media Interaktif** → pilih media yang sudah terbit, lalu atur:

- **Aturan buka stasiun:** berurutan (selesaikan dulu stasiun sebelumnya) atau bebas.
- **Tes Awal** (wajib sebelum stasiun pertama) dan **Tes Akhir**: asesmen kelas-mapel yang sama — untuk N-Gain.
- **Papan peringkat** (bisa dimatikan) dan **jadwal buka per stasiun** (opsional).

Media yang sama bisa dipasang di beberapa kelas; progres tiap kelas terpisah.

## 7. Laporan

Daftar materi → **Laporan Media** (atau "Laporan kelas" di pratinjau):

- **Progres:** siswa × stasiun (bintang, selesai, menit, terakhir aktif).
- **Kesulitan:** langkah dengan persentase salah tertinggi dan **jawaban salah terbanyak** — bahan pembahasan di kelas.
- **N-Gain:** (Tes Akhir − Tes Awal) / (100 − Tes Awal); Tinggi ≥ 0,7, Sedang ≥ 0,3, Rendah < 0,3.
- **Tidak aktif:** siswa belum tuntas yang tidak membuka media ≥ 3 hari → pilih → **kirim pengingat** lewat Ruang
  Obrolan (`{nama}` = nama depan).
- **Refleksi** siswa dan **Ekspor Excel**.

## 8. Pustaka & berbagi

Tab **Pustaka** berisi media yang dibagikan Super Admin. **Salin** menjadikannya draf milik Anda (gambar ikut).
**Ekspor JSON** untuk membagikan media ke sekolah lain.

## Pertanyaan umum

- *Siswa bilang stasiun terkunci.* Cek aturan berurutan/prasyarat, Tes Awal (wajib dulu), dan jadwal buka.
- *Saya salah kunci setelah siswa mengerjakan.* Perbaiki di Studio lalu Terbitkan; jawaban yang sudah dinilai tidak
  berubah, jawaban berikutnya memakai kunci baru.
- *Sinyal siswa putus.* Posisi, waktu, dan refleksi disimpan di HP dan dikirim otomatis saat sinyal kembali.
