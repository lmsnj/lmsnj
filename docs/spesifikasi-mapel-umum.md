<!-- Disalin dari "Spesifikasi Fitur LMS Sigma untuk Mapel Umum.docx" (23 Nov 2026). -->

> **Catatan penerapan:** nama di kode memakai bahasa Inggris (aturan CLAUDE.md). Tahap 1: tabel `pengaturan` =
> `SchoolSetting`, `pengaturan_riwayat` = `SettingChange`, `fitur_sekolah` = `SchoolFeature` (app `apps/school_settings`);
> endpoint `/api/pengaturan` = `/api/school-settings/`, saklar fitur = `/api/school-features/` (ubah: Super Admin);
> `getSetting` = `services.get_setting`, hook `useSetting` / `useFeature`.
> Tahap 2: `mode_kelas` = `ClassMode`, `kategori_mapel` = `SubjectCategory`, `mapel_pengaturan` = `SubjectProfile`
> (hanya kategori; mode disimpan sebagai pengaturan `kelas.mode_default` per cakupan); endpoint `/api/class-modes/`,
> `/api/subject-categories/`, `/api/subject-profiles/`. Saklar fitur tambahan `mode_kelas`.

## Spesifikasi Fitur LMS Sigma untuk Mapel Umum

Nov 23, 2026 · @abdul hadi

### 1. Latar belakang dan tujuan

LMS Sigma harus tetap dipakai setiap hari oleh guru mapel umum, walaupun siswa tidak memegang perangkat apa pun di kelas.

Kondisi di SMKS Nurul Jadid:

- 270 siswa, semuanya santri, tidak boleh memegang HP.
- 5 lab dengan total 75 PC, hanya dipakai saat jam mapel produktif.
- 22 kelas, 48 guru, 60 mapel, 179 pengampu sudah terdaftar di LMS.
- Mapel umum berlangsung di ruang kelas biasa, dengan laptop atau HP pribadi guru dan TV yang sudah ada di setiap kelas.

Tujuan:

- Guru mapel umum memakai LMS untuk menyampaikan materi, mencatat presensi, menilai, dan menyimpan bukti belajar.
- Semua nilai, mapel umum maupun produktif, terkumpul di satu laporan yang sama, dan Kepala Sekolah, Waka Kurikulum, serta superadmin bisa memantau keaktifan guru dan siswa.
- Semua aturan (kategori mapel, jenis penilaian, bobot, skala, KKM, opsi kuis) bisa diubah admin lewat menu Pengaturan, tanpa mengubah kode.
- Fitur yang sama bisa dijual ke sekolah pesantren lain, cukup dengan menyesuaikan pengaturannya.

### 2. Prinsip desain dinamis

Setiap aturan yang mungkin berubah disimpan sebagai data di database dan diatur admin lewat menu, bukan ditulis mati di kode.

- Pengaturan per sekolah. LMS Sigma sudah punya "Ganti sekolah", jadi setiap pengaturan terikat ke sekolah_id. SMKNJ dan sekolah lain bisa punya aturan berbeda dari kode yang sama.
- Master data, bukan enum di kode. Kategori mapel, jenis penilaian, skala nilai, dan mode kelas disimpan di tabel master. Admin bisa menambah, mengganti nama, menonaktifkan, dan mengurutkan.
- Default + override. Nilai default diatur di tingkat sekolah. Bisa ditimpa per kategori mapel, lalu per mapel, lalu per kelas. Urutan pengecekan: kelas → mapel → kategori → sekolah → default sistem.
- Feature flag. Setiap fitur baru (presentasi, kuis QR, LKPD foto) bisa dinyalakan atau dimatikan per sekolah, sehingga bisa diuji coba di SMKNJ dulu sebelum dirilis ke pembeli lain.
- Satu helper untuk membaca pengaturan. Backend punya satu fungsi getSetting(sekolah_id, key, scope) dan frontend punya satu hook useSetting(key). Tidak ada komponen yang membaca angka atau label langsung dari konstanta.
- Label dari data. Teks seperti "Tugas Kertas", "KKM", atau "Mapel Umum" diambil dari master data, jadi sekolah lain bisa memakai istilahnya sendiri.
- Riwayat perubahan. Setiap perubahan pengaturan dicatat (siapa, kapan, nilai lama, nilai baru), supaya bisa dilacak dan dikembalikan.

#### Aturan pengembangan: menambah, tidak mengubah

LMS Sigma sudah jadi dan sudah dipakai. Semua fitur di dokumen ini adalah tambahan yang dipasang di atas sistem yang ada, tanpa membongkar atau mengubah perilaku fitur lama.

| Bagian | Boleh | Tidak boleh |
|---|---|---|
| Database | Membuat tabel baru. Tabel baru merujuk tabel lama lewat id (misalnya mapel_id). | Mengubah, mengganti nama, atau menghapus kolom dan tabel yang sudah ada. |
| API | Menambah endpoint baru dengan nama yang belum dipakai. | Mengubah bentuk request atau response endpoint lama. |
| Halaman | Menambah menu dan halaman baru. Menambah tombol kecil di halaman lama, hanya tampil jika fiturnya aktif. | Mengubah alur, tata letak, atau isi halaman lama. |
| Laporan | Membuat laporan baru yang ikut membaca data lama. | Mengubah cara hitung laporan yang sudah ada. |
| Data | Membaca data lama (siswa, kelas, mapel, materi, bank soal, presensi). | Menulis ulang atau memindahkan data lama. |

Agar bisa dipakai sekolah lain tanpa mengubah kode lagi:

- Semua fitur baru dibungkus feature flag. Default mati untuk sekolah baru, nyala untuk SMKNJ setelah uji coba.
- Semua data baru terikat ke sekolah_id, mengikuti fitur "Ganti sekolah" yang sudah ada.
- Semua label, angka, dan pilihan diambil dari pengaturan dan master data, bukan ditulis di kode.
- Setiap sekolah baru otomatis mendapat paket pengaturan default saat didaftarkan. Admin sekolah cukup menyesuaikan lewat menu.
- Jika fitur dimatikan, LMS kembali bekerja persis seperti sekarang.

Syarat setiap tahap dianggap selesai: selain kriteria fiturnya sendiri, semua fitur lama (login, materi, tugas, pengumpulan, presensi, ujian, laporan, Media Interaktif) diuji ulang dan tetap berjalan seperti sebelumnya. Migrasi database harus bisa dibatalkan (rollback).

### 3. Urutan pengerjaan

Fitur dikerjakan berurutan. Setiap tahap menjadi fondasi tahap berikutnya, dan setiap tahap sudah bisa dipakai guru begitu selesai.

| Tahap | Fitur | Bergantung pada | Hasil yang langsung bisa dipakai |
|---|---|---|---|
| 1 | Pengaturan & feature flag | — | Admin bisa mengatur aturan tanpa mengubah kode |
| 2 | Kategori mapel & mode kelas | Tahap 1 | Setiap mapel tahu apakah siswanya pakai perangkat atau tidak |
| 3 | Penilaian langsung (nilai tanpa pengumpulan) | Tahap 1–2 | Guru mapel umum bisa input nilai tugas kertas, lisan, sikap |
| 4 | Mode presentasi kelas | Tahap 2 | Materi dan Media Interaktif tampil penuh di TV kelas |
| 5 | Kuis kartu QR | Tahap 3–4 | Kuis satu kelas tanpa perangkat siswa, nilai otomatis |
| 6 | LKPD cetak ber-QR + unggah foto massal | Tahap 3 | Bukti tugas kertas masuk ke portofolio tiap siswa |
| 7 | Bobot nilai & laporan terpadu | Tahap 3, 5, 6 | Rapor mapel umum dan produktif dalam satu laporan |
| 8 | Monitoring progres guru & laporan aktivitas | Tahap 1 (bisa paralel dengan Tahap 2–7) | Pimpinan melihat guru mana yang sudah dan belum memakai LMS |

Tahap 1–4 adalah minimum agar mapel umum bisa mulai uji coba. Tahap 5–7 menyusul setelah guru pilot terbiasa.

### 4. Detail fitur

Setiap fitur ditulis dengan urutan yang sama: tujuan, apa yang bisa diatur, alur pakai, API, dan kriteria selesai.

#### Tahap 1 — Pengaturan & feature flag

Tujuan: satu tempat untuk semua aturan yang bisa berubah.

Yang bisa diatur: semua key di tabel pengaturan (Bagian 5), plus saklar fitur: presentasi, penilaian_langsung, kuis_qr, lkpd_foto.

Alur pakai:

- Admin membuka menu baru Pengaturan Pembelajaran (di bawah Identitas).
- Pengaturan dikelompokkan per tab: Umum, Kategori Mapel, Penilaian, Kuis QR, LKPD.
- Setiap isian menampilkan nilai default dan tombol "Kembalikan ke default".
- Perubahan langsung berlaku dan tercatat di riwayat.

API: GET /api/pengaturan?scope=&scope_id= · PUT /api/pengaturan/:key · GET /api/pengaturan/riwayat

Selesai jika: mengubah satu pengaturan di menu langsung mengubah perilaku fitur tanpa deploy ulang, dan menu fitur yang dimatikan tidak tampil.

#### Tahap 2 — Kategori mapel & mode kelas

Tujuan: LMS tahu cara siswa mengakses setiap mapel.

Yang bisa diatur:

- Master kategori mapel, untuk SMKNJ cukup Umum dan Produktif. Sekolah lain bisa menambah dan mengganti nama sendiri.
- Master mode kelas: tanpa_perangkat (hanya guru), lab (setiap siswa punya PC), perangkat_kelompok (tablet sekolah per kelompok).
- Setiap kategori punya mode default; setiap mapel atau kelas boleh menimpanya.

Alur pakai:

- Admin menetapkan kategori di halaman baru Pengaturan Pembelajaran › Kategori Mapel. Halaman Kelola Mapel yang lama tidak diubah.
- Saat guru membuka kelas, tampilan menyesuaikan mode. Mode tanpa_perangkat menonjolkan tombol Presentasi, Penilaian Langsung, dan Kuis QR. Mode lab menampilkan alur tugas dan pengumpulan seperti sekarang.

API: CRUD /api/master/kategori-mapel · CRUD /api/master/mode-kelas · PUT /api/mapel-pengaturan/:mapel_id (kategori_id, mode_id)

Selesai jika: 60 mapel SMKNJ sudah berkategori, dan guru mapel umum melihat tampilan tanpa perangkat.

#### Tahap 3 — Penilaian langsung (nilai tanpa pengumpulan)

Tujuan: guru memberi nilai walaupun siswa tidak mengunggah apa pun.

Yang bisa diatur:

- Master jenis penilaian: Tugas Kertas, Ulangan Kertas, Lisan, Praktik di Kelas, Sikap, Kuis QR. Bisa ditambah.
- Skala nilai: 0–100, 0–4, atau predikat (A/B/C/D) dengan rentang yang bisa diatur.
- KKM per sekolah, per mapel, atau per kelas.
- Apakah jenis penilaian masuk sumatif atau formatif.

Alur pakai:

- Guru membuka kelas, klik Penilaian Langsung, pilih jenis dan judul (misalnya "LKPD Bab 2").
- Muncul grid berisi semua siswa kelas itu. Guru mengetik nilai; kursor pindah ke bawah dengan Enter.
- Ada tombol cepat: "Isi semua dengan ..." lalu edit yang berbeda, dan tombol "Tidak hadir".
- Nilai di bawah KKM berwarna merah. Tersimpan otomatis setiap kali sel berubah.
- Tampilan grid nyaman di HP guru (satu kolom, angka besar).

API: POST /api/penilaian (kelas_id, mapel_id, jenis_id, judul, tanggal) · PUT /api/penilaian/:id/nilai (array siswa_id + nilai) · GET /api/penilaian?kelas_id=&mapel_id=

Selesai jika: guru bisa memasukkan nilai 30 siswa dalam kurang dari 3 menit dari HP, dan nilainya muncul di Laporan Nilai Terpadu (Tahap 7).

#### Tahap 4 — Mode presentasi kelas

Tujuan: materi dan Media Interaktif tampil bersih di TV kelas, lewat kabel HDMI dari laptop atau screen mirroring dari HP guru.

Yang bisa diatur: ukuran huruf dasar, tema terang/gelap, tampil atau sembunyikan timer, durasi timer default.

Alur pakai:

- Di halaman materi atau Media Interaktif, guru klik Presentasi.
- Layar penuh tanpa menu. Navigasi dengan klik, panah keyboard, atau remote presenter.
- Untuk Media Interaktif, guru menjalankan stasiun satu per satu. Jawaban siswa (angkat tangan, maju ke depan) diklik oleh guru.
- Tombol kecil di pojok: timer, kembali, dan "Mulai Kuis QR" untuk stasiun berbentuk soal pilihan ganda.

API: tidak perlu endpoint baru; memakai data materi dan media yang sudah ada.

Selesai jika: materi dan Petualangan Flowgorithm bisa dijalankan penuh dari laptop atau HP guru ke TV kelas tanpa siswa login.

#### Tahap 5 — Kuis kartu QR

Tujuan: seluruh kelas menjawab kuis, tanpa perangkat siswa, dan nilainya masuk otomatis.

Cara kerja:

- Setiap siswa punya kartu bernomor berisi satu kode QR. Huruf A, B, C, D tercetak di empat sisi kartu.
- Siswa mengangkat kartu dengan huruf jawabannya di atas.
- HP guru membaca semua QR dalam satu bidikan kamera. Arah QR menentukan jawaban; isi QR menentukan nomor kartu.
- Nomor kartu dipetakan ke siswa di kelas itu, jadi kartu bisa dipakai ulang tiap tahun.

Yang bisa diatur: jumlah opsi (2–4), jumlah kartu per set (default 40), ukuran cetak (A5 atau A6), poin per soal, apakah jawaban boleh dipindai ulang, dan apakah hasil langsung tampil di TV.

Alur pakai:

- Admin mencetak set kartu dari LMS, sekali saja, lalu dilaminating dan disimpan di kelas.
- Guru memetakan kartu ke siswa (otomatis berdasarkan urutan absen, bisa diubah).
- Guru membuat soal pilihan ganda, atau memakai soal dari bank soal yang sudah ada.
- Di kelas: soal tampil di TV, siswa mengangkat kartu, guru memindai dengan HP.
- Layar HP menampilkan siswa yang sudah terbaca (hijau) dan yang belum. TV menampilkan grafik jawaban tanpa nama.
- Setelah kuis, nilai otomatis tersimpan sebagai penilaian jenis Kuis QR (memakai tabel Tahap 3).

Teknis: pemindaian di browser HP guru (tidak perlu aplikasi), memakai pustaka pembaca QR yang mendukung banyak kode dalam satu gambar, misalnya zxing-wasm. QR dibuat sependek mungkin (misalnya SG:12) dengan koreksi galat tinggi supaya terbaca dari jauh. Jarak baca perlu diuji di kelas sebenarnya sebelum ukuran kartu ditetapkan.

API: POST /api/kartu-qr/set (cetak) · PUT /api/kelas/:id/peta-kartu · POST /api/kuis-qr/sesi · POST /api/kuis-qr/sesi/:id/jawaban (soal_id, array kartu + opsi) · POST /api/kuis-qr/sesi/:id/selesai

Selesai jika: satu bidikan membaca minimal 90% kartu di kelas berisi 30 siswa dari depan kelas, dan nilai kuis muncul di Laporan Nilai Terpadu.

#### Tahap 6 — LKPD cetak ber-QR + unggah foto massal

Tujuan: tugas kertas punya bukti digital per siswa.

Yang bisa diatur: template kop LKPD (logo, nama sekolah), posisi QR, ukuran kertas, kualitas kompresi foto, batas ukuran file.

Alur pakai:

- Guru membuat tugas jenis LKPD, lalu klik Cetak. LMS membuat satu halaman per siswa dengan nama dan QR (berisi id tugas + id siswa).
- Siswa mengerjakan di kertas.
- Guru memotret lembar-lembar itu atau memilih banyak foto sekaligus di HP.
- LMS membaca QR di setiap foto dan menyimpannya ke akun siswa yang tepat. Foto tanpa QR terbaca masuk daftar "perlu dicocokkan manual".
- Guru menilai dari grid Tahap 3, dengan pratinjau foto di samping nilai.

API: GET /api/tugas/:id/cetak-lkpd (PDF) · POST /api/tugas/:id/foto-massal · PATCH /api/foto/:id (cocokkan manual)

Selesai jika: 30 foto LKPD terunggah dalam satu kali pilih, minimal 90% otomatis masuk ke siswa yang benar.

#### Tahap 7 — Bobot nilai & laporan terpadu

Tujuan: nilai dari semua sumber digabung menjadi nilai rapor.

Yang bisa diatur: bobot per jenis penilaian (misalnya Tugas 30%, Kuis 20%, Ulangan 50%), per sekolah dan boleh ditimpa per mapel. Cara pembulatan. Format ekspor (Excel, format rapor).

Alur pakai:

- Admin atau Waka Kurikulum mengatur bobot di Pengaturan.
- Halaman baru Laporan Nilai Terpadu menggabungkan nilai tugas yang sudah ada dengan nilai penilaian langsung dan kuis QR, lalu menghitung nilai akhir berdasarkan bobot itu. Laporan Nilai Kelas yang lama tetap ada tanpa perubahan.
- Wali kelas dan pimpinan bisa mengekspor per kelas.

API: GET /api/laporan/nilai-terpadu?kelas_id=&semester= · GET /api/laporan/nilai-terpadu/ekspor

Selesai jika: mengubah bobot di Pengaturan langsung mengubah nilai akhir di laporan, tanpa mengubah kode.

#### Tahap 8 — Monitoring progres guru & laporan aktivitas

Tujuan: pimpinan bisa melihat guru mana yang sudah dan belum memakai LMS, serta aktivitas belajar siswa, tanpa harus menanyakan satu per satu.

Siapa yang bisa membuka:

- Default: Superadmin, Kepala Sekolah, Waka Kurikulum. Daftar jabatan diatur di pengaturan monitoring.jabatan_akses, jadi bisa ditambah (misalnya Waka Kesiswaan) tanpa mengubah kode.
- Jabatan ditetapkan lewat tabel baru akses_pimpinan, yang menempelkan jabatan ke akun yang sudah ada. Contohnya akun guru Waka Kurikulum tetap akun guru, hanya mendapat akses tambahan. Tabel peran lama tidak diubah.
- Guru biasa tidak bisa membuka halaman ini dan tidak bisa melihat skor guru lain.

Sumber data:

- Data lama, hanya dibaca: jadwal, pengampu, presensi, materi, tugas, pengumpulan, ujian, nilai.
- Data baru di tabel log_aktivitas: login, membuka materi, mode presentasi, penilaian langsung, kuis QR, unggah foto LKPD. Pencatatan memakai lapisan tambahan yang hanya menulis log, tanpa mengubah respons endpoint lama.

Isi halaman baru "Monitoring" (menu baru, hanya tampil untuk jabatan yang berhak):

| Tampilan | Isi |
|---|---|
| Ringkasan sekolah | Jumlah guru aktif dari total guru, persentase pertemuan terjadwal yang presensinya sudah diisi, jumlah materi, penilaian, dan kuis periode ini, serta tren per minggu |
| Progres per guru | Nama, mapel dan kelas yang diampu, pertemuan terjadwal vs presensi diisi, materi, penilaian diinput, kuis QR, aktivitas terakhir, skor, dan status Aktif / Kurang / Belum. Klik nama untuk melihat riwayat aktivitasnya. |
| Per kelas | Rata-rata kehadiran, mapel yang sudah dan belum punya nilai, jumlah siswa di bawah KKM |
| Per siswa | Kehadiran, nilai di bawah KKM, tugas lab yang belum dikumpulkan, aktivitas lab terakhir |
| Peringatan | Guru tanpa aktivitas selama N hari, jadwal yang presensinya belum diisi, kelas tanpa nilai baru dalam sebulan, siswa dengan kehadiran rendah |
| Ekspor | Laporan bulanan PDF atau Excel untuk supervisi, memakai kop dan blok tanda tangan dari menu Identitas |

Semua tampilan bisa disaring per periode (minggu, bulan, semester, atau rentang tanggal), jurusan, kategori mapel, kelas, dan guru.

Cara menghitung skor keaktifan guru:

- Setiap indikator dihitung sebagai capaian dibagi target, maksimal 100%. Target diambil dari jadwal mengajar guru pada periode itu.
- Skor = jumlah dari (bobot indikator × capaian indikator).
- Indikator, bobot, dan batas status diatur di pengaturan monitoring.indikator_guru dan monitoring.ambang_status. Usulan awal: presensi 40%, nilai 30%, materi 20%, kuis 10%; Aktif ≥75, Kurang 40–74, Belum <40.

API: GET /api/monitoring/ringkasan · GET /api/monitoring/guru · GET /api/monitoring/guru/:id · GET /api/monitoring/kelas/:id · GET /api/monitoring/siswa/:id · GET /api/monitoring/peringatan · GET /api/monitoring/ekspor

Selesai jika: Kepala Sekolah membuka Monitoring dan langsung melihat status 48 guru minggu ini; mengubah bobot indikator di pengaturan langsung mengubah skor; akun guru biasa ditolak saat membuka halaman ini; semua fitur lama tetap berjalan seperti sebelumnya.

Tahap ini sebagian besar membaca data yang sudah ada, jadi bisa dikerjakan segera setelah Tahap 1 dan langsung berguna untuk memantau uji coba guru pilot.

### 5. Struktur database & pengaturan dinamis

Cukup satu tabel pengaturan generik ditambah beberapa tabel master. Fitur baru cukup menambah key, tidak perlu kolom baru.

#### Tabel baru

| Tabel | Kolom utama | Fungsi |
|---|---|---|
| pengaturan | id, sekolah_id, scope (sekolah/kategori/mapel/kelas), scope_id, key, value (JSON), updated_by, updated_at | Semua aturan dinamis |
| pengaturan_riwayat | id, pengaturan_id, nilai_lama, nilai_baru, oleh, waktu | Jejak perubahan |
| fitur_sekolah | sekolah_id, kode_fitur, aktif | Feature flag per sekolah |
| kategori_mapel | id, sekolah_id, nama, mode_default_id, urutan, aktif | Umum, Produktif, dll. |
| mode_kelas | id, kode, nama, perlu_perangkat_siswa | tanpa_perangkat, lab, perangkat_kelompok |
| jenis_penilaian | id, sekolah_id, nama, kelompok (formatif/sumatif), bobot_default, urutan, aktif | Tugas Kertas, Lisan, Kuis QR, dll. |
| penilaian | id, kelas_id, mapel_id, guru_id, jenis_id, judul, tanggal, sumber (manual/kuis_qr/lkpd) | Satu kegiatan penilaian |
| penilaian_nilai | penilaian_id, siswa_id, nilai, status (hadir/tidak_hadir), catatan, foto_id | Nilai per siswa |
| kartu_qr | id, sekolah_id, nomor, kode | Set kartu cetak |
| peta_kartu | kelas_id, tahun_ajaran_id, kartu_id, siswa_id | Kartu milik siswa di kelas tertentu |
| kuis_qr_sesi | id, kelas_id, mapel_id, guru_id, penilaian_id, mulai, selesai | Satu sesi kuis |
| kuis_qr_jawaban | sesi_id, soal_id, siswa_id, opsi, benar, waktu_pindai | Jawaban hasil pindai |
| lkpd_foto | id, tugas_id, siswa_id (boleh kosong), path, status_cocok | Foto tugas kertas |
| log_aktivitas | id, sekolah_id, user_id, peran, aksi, objek_tipe, objek_id, kelas_id, mapel_id, waktu | Catatan aktivitas guru dan siswa |
| akses_pimpinan | id, sekolah_id, user_id, jabatan (kepala_sekolah/waka_kurikulum/lainnya), aktif | Siapa yang boleh membuka laporan monitoring |

Tidak ada kolom yang ditambahkan ke tabel lama. Kategori dan mode setiap mapel disimpan di tabel baru mapel_pengaturan (mapel_id, kategori_id, mode_id, sekolah_id). Mapel yang belum punya baris di tabel ini memakai default sekolah.

#### Daftar key pengaturan awal

| Key | Default SMKNJ | Bisa ditimpa di |
|---|---|---|
| nilai.skala | 0-100 | sekolah |
| nilai.kkm | 75 | sekolah, mapel, kelas |
| nilai.predikat | A ≥90, B ≥80, C ≥75, D <75 | sekolah |
| nilai.bobot | Tugas 30, Kuis 20, Ulangan 50 | sekolah, kategori, mapel |
| nilai.pembulatan | bulat | sekolah |
| kelas.mode_default | tanpa_perangkat (Umum), lab (Produktif) | kategori, mapel, kelas |
| presentasi.ukuran_huruf | besar | sekolah |
| presentasi.timer_default | 5 menit | sekolah, mapel |
| kuis_qr.jumlah_opsi | 4 | sekolah, mapel |
| kuis_qr.kartu_per_set | 40 | sekolah |
| kuis_qr.ukuran_kartu | A5 | sekolah |
| kuis_qr.tampil_hasil_layar | true | sekolah, mapel |
| kuis_qr.boleh_pindai_ulang | true | sekolah |
| lkpd.ukuran_kertas | A4 | sekolah |
| lkpd.kompresi_foto | 1600 px, 70% | sekolah |
| monitoring.jabatan_akses | superadmin, kepala_sekolah, waka_kurikulum | sekolah |
| monitoring.indikator_guru | presensi 40, nilai 30, materi 20, kuis 10 (bobot %) | sekolah |
| monitoring.ambang_status | Aktif ≥75, Kurang 40–74, Belum <40 | sekolah |
| monitoring.peringatan_hari | 7 hari tanpa aktivitas | sekolah |
| monitoring.periode_default | minggu ini | sekolah |

Angka default di atas adalah usulan awal. Pastikan dulu ke Waka Kurikulum, terutama KKM dan bobot nilai.

#### Cara membaca pengaturan

getSetting(sekolah_id, key, { kelas_id, mapel_id, kategori_id })  1. cari di scope kelas  2. jika kosong, cari di scope mapel  3. jika kosong, cari di scope kategori  4. jika kosong, cari di scope sekolah  5. jika kosong, pakai default sistem

Hasilnya di-cache per sekolah dan dibersihkan setiap kali pengaturan diubah.

### 6. Alur satu pertemuan mapel umum

Dalam satu pertemuan 2 JP, guru hanya memakai laptop atau HP pribadinya dan TV kelas, sementara siswa cukup memegang kartu QR dan kertas.

| Waktu | Kegiatan di kelas | Yang dilakukan guru di LMS | Fitur |
|---|---|---|---|
| 5 menit | Salam, doa, presensi | Mengisi presensi pertemuan | Presensi (sudah ada) |
| 10 menit | Apersepsi: 3 soal pemantik | Menampilkan soal, memindai kartu siswa | Kuis kartu QR |
| 30 menit | Penjelasan materi, video, Media Interaktif | Menjalankan materi layar penuh | Mode presentasi |
| 25 menit | Diskusi kelompok, mengerjakan LKPD di kertas | LKPD sudah dicetak sebelumnya | LKPD ber-QR |
| 10 menit | Kuis penutup 3–5 soal | Memindai kartu, nilai tersimpan otomatis | Kuis kartu QR |
| Setelah kelas | — | Memotret LKPD, memberi nilai di grid | Foto massal + penilaian langsung |

Persiapan guru sebelum kelas: menyiapkan materi dan soal di LMS, lalu mencetak LKPD bila ada. Kartu QR cukup dicetak sekali dan disimpan di kelas.

Kalau TV sedang bermasalah, guru tetap bisa memakai penilaian langsung dan presensi dari HP; soal kuis dibacakan, lalu kartu dipindai seperti biasa.

### 7. Rencana uji coba & checklist

Uji coba dimulai dengan 3–4 guru mapel umum di beberapa kelas X, lalu diperluas setelah satu bulan.

#### Persiapan data

- ☐ Lengkapi pengampu untuk 12 guru yang belum mengampu mapel tahun ajaran ini
- ☐ Tetapkan kategori Umum atau Produktif untuk setiap mapel, dan nonaktifkan mapel muatan pesantren bila ada di daftar 60 mapel
- ☐ Konfirmasi KKM, skala, dan bobot nilai dengan Waka Kurikulum
- ☐ Pilih guru pilot, misalnya PAI, Bahasa Indonesia, Matematika, Bahasa Inggris

#### Pengembangan

- ☐ Tahap 1 — Pengaturan & feature flag
- ☐ Tahap 2 — Kategori mapel & mode kelas
- ☐ Tahap 3 — Penilaian langsung
- ☐ Tahap 4 — Mode presentasi kelas
- ☐ Tahap 5 — Kuis kartu QR (termasuk uji jarak baca di kelas sebenarnya)
- ☐ Tahap 6 — LKPD cetak ber-QR + foto massal
- ☐ Tahap 7 — Bobot nilai & laporan terpadu
- ☐ Tahap 8 — Monitoring progres guru & laporan aktivitas (bisa dikerjakan segera setelah Tahap 1)
- ☐ Uji regresi setelah setiap tahap: semua fitur lama tetap berjalan, dan mematikan fitur baru mengembalikan LMS persis seperti sebelumnya
- ☐ Uji sekolah kedua (data contoh): fitur bisa dinyalakan dan diatur tanpa mengubah kode

#### Pelaksanaan uji coba

- ☐ Cetak dan laminating kartu QR untuk kelas pilot
- ☐ Pelatihan guru pilot (presensi, presentasi, penilaian langsung, kuis QR)
- ☐ Jalankan 4 minggu, catat kendala per pertemuan
- ☐ Evaluasi: berapa persen pertemuan memakai LMS, berapa lama input nilai, berapa persen kartu terbaca

#### Keputusan yang sudah ditetapkan

| Hal | Keputusan | Dampak ke pengembangan |
|---|---|---|
| Layar di kelas | Setiap kelas sudah punya TV | Mode presentasi dirancang untuk TV (huruf besar, kontras tinggi, rasio 16:9). Tidak perlu pengadaan proyektor. |
| HP untuk memindai | Guru boleh memakai HP pribadi | Pemindai kartu QR berjalan di browser, tanpa instal aplikasi. Hanya minta izin kamera. Data nilai tidak disimpan di HP; sesi login guru otomatis keluar setelah tidak aktif. |
| Muatan pesantren | Dinilai di sistem pesantren sendiri | LMS Sigma di SMKNJ cukup mengelola kategori Umum dan Produktif. Kategori tetap dinamis, jadi sekolah lain bisa menambah kategori sendiri. |
