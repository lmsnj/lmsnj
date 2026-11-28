# Langkah Simulasi (`simulation`) di Media Pembelajaran Interaktif

Simulasi = peraga interaktif berupa **file HTML mandiri** yang ditampilkan di dalam iframe pada satu
langkah media. Jenis ini generik: guru Matematika, Fisika, Ekonomi, dll. cukup menambah file HTML baru
lalu menunjuknya dari JSON media, tanpa mengubah kode LMS.

Berbeda dengan langkah `embed` (konten dari situs lain, lihat `docs/mpi-bridge.md`), file simulasi
disimpan di aplikasi ini sendiri: `frontend/public/mpi/...` (ikut `npm run build` dan deploy, sama seperti
gambar `/mpi/flowgorithm/`). Contoh: `frontend/public/mpi/eksponen/sim/{pangkat,hoaks,sifat,fungsi,akar}.html`.

## Skema langkah

```json
{
  "id": "a1b2c3d4",
  "kind": "simulation",
  "title": "Coba sendiri: peraga pangkat",
  "hints": [],
  "text": "Geser bilangan pokok dan pangkat ...",
  "src": "/mpi/eksponen/sim/pangkat.html",
  "height": 560,
  "params": { "target": 81 },
  "require_done": true,
  "explanation": "3⁴ = 3 × 3 × 3 × 3 = 81."
}
```

| Field | Wajib | Keterangan |
|-------|-------|------------|
| `src` | ya | Path file `.html` yang diawali `/mpi/` (tanpa `..`). URL luar (`http://`, `https://`, `//`), `javascript:` dan `data:` **ditolak** saat simpan/impor (backend `steps.SIMULATION_SRC`) dan tidak dirender (frontend `mpi/simulation.js::isSafeSimulationSrc`; aturan keduanya harus sama). |
| `text` | tidak | Instruksi, format sama dengan teks langkah lain (tebal, miring, rumus `$...$`). |
| `height` | tidak | Tinggi awal iframe, 240–1400 piksel (bawaan 520). Simulasi boleh mengubahnya lewat `mpi:resize`. |
| `params` | tidak | Objek JSON bebas (maks. 4000 karakter), dikirim ke simulasi lewat `mpi:init`. |
| `require_done` | tidak | Bawaan `true`: tombol **Lanjut** baru aktif setelah simulasi mengirim `mpi:done`. `false` = Lanjut langsung aktif. |
| `explanation` | tidak | Ditampilkan setelah `mpi:done` (gaya kotak hijau seperti pembahasan soal). |

Simulasi **bukan latihan berskor**: tidak memengaruhi bintang dan tidak menghalangi "Selesaikan stasiun",
tetapi dihitung sebagai langkah. Saat `mpi:done` diterima, pemutar mengirim aksi stasiun
`POST /api/materials/{id}/media/station/` `{action: "complete", step}` sehingga langkah tercatat `done`
di progres siswa (`InteractiveMediaProgress.run`); hanya jenis dengan `StepKind.completable = True` yang
boleh ditandai begini. Jika peraga tidak mengirim `mpi:ready` dalam 8 detik (file tidak ada/gagal
dimuat), siswa diberi pesan dan Lanjut diaktifkan agar tidak terjebak.

## Protokol postMessage

Simulasi → LMS (kirim ke `window.parent` dengan targetOrigin `'*'`):

| Pesan | Arti |
|-------|------|
| `{type: 'mpi:ready'}` | Simulasi siap. LMS membalas `mpi:init`. |
| `{type: 'mpi:resize', height: <px>}` | Ubah tinggi iframe (dibatasi 240–1400). |
| `{type: 'mpi:progress', detail: {...}}` | Opsional; saat ini diabaikan. |
| `{type: 'mpi:done', detail: {...}}` | Tantangan selesai: langkah ditandai selesai, Lanjut aktif, penjelasan tampil. |

LMS → simulasi:

| Pesan | Kapan |
|-------|-------|
| `{type: 'mpi:init', params: {...}}` | Setelah `mpi:ready`, dan lagi setiap siswa menekan **Ulangi** (simulasi sebaiknya mengatur ulang tantangannya). |

Keamanan:
- Iframe memakai `sandbox="allow-scripts allow-downloads"` saja (`allow-downloads` agar peraga bisa
  mengunduh hasil karya siswa, mis. PNG/SVG dari editor logo; tanpa `allow-same-origin`, `allow-top-navigation`,
  `allow-forms`, `allow-popups`), jadi origin-nya `null`: simulasi tidak bisa membaca token, data, atau
  halaman LMS meskipun filenya dari domain yang sama.
- Karena origin `null`, LMS mengirim pesan dengan targetOrigin `'*'` (isinya hanya `params` dari JSON).
- LMS hanya menerima pesan yang `event.source === iframe.contentWindow` langkah itu, `type` berupa teks
  yang dikenal, dan `height` berupa angka (`mpi/simulation.js::parseSimulationMessage`, ada test).
- Laporan `mpi:done` dari browser tidak bisa dibuktikan server, karena itu simulasi tidak diberi nilai.

## Membuat simulasi baru

1. Buat satu file HTML mandiri (CSS & JS di dalam file, tanpa pustaka dari internet) di
   `frontend/public/mpi/<topik>/sim/<nama>.html`. Buat tampilan responsif (lebar 100%, bisa di HP).
2. Pasang jembatan kecil ini (sama dengan file contoh eksponen), lalu tulis fungsi `start(params)`:

```html
<script>
const MPI = { params: {}, started: false, _done: false,
  post(m) { try { if (window.parent !== window) window.parent.postMessage(m, '*') } catch (e) {} },
  done(detail) { if (this._done) return; this._done = true; this.post({ type: 'mpi:done', detail: detail || {} }) },
  progress(detail) { this.post({ type: 'mpi:progress', detail }) } };
(function () {
  function go() { MPI.started = true; try { window.start(MPI.params) } catch (e) { console.error(e) } }
  window.addEventListener('message', (e) => {
    const d = e.data
    if (d && d.type === 'mpi:init') { Object.assign(MPI.params, d.params || {}); MPI._done = false; go() }
  })
  new ResizeObserver(() => MPI.post({ type: 'mpi:resize', height: Math.ceil(document.documentElement.scrollHeight) }))
    .observe(document.body)
  window.addEventListener('load', () => { MPI.post({ type: 'mpi:ready' }); setTimeout(() => { if (!MPI.started) go() }, 400) })
})()
function start(params) { /* gambar peraga; panggil MPI.done({...}) saat tantangan tercapai */ }
</script>
```

3. Di Studio: **+ Langkah → Simulasi**, isi Path file, Params (JSON), lalu cek di **Pratinjau langsung**
   pada form. Atau tulis langsung di JSON media lalu Impor (layar Periksa menampilkan jumlah simulasi).
4. Commit file HTML-nya dan deploy frontend seperti biasa.
