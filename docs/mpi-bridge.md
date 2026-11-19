# Bridge Konten HTML5/H5P — Media Pembelajaran Interaktif

Konten HTML5 buatan sendiri (simulasi, game, kuis) atau H5P bisa dipasang di media lewat dua jenis langkah:

| Jenis | Kegunaan |
|---|---|
| **Konten HTML5/H5P** (`embed`) | Menampilkan konten tanpa nilai (simulasi, video H5P, bacaan interaktif). |
| **Tugas HTML5/H5P** (`embed_task`) | Latihan yang dianggap tuntas setelah konten **melaporkan selesai** (mode `bridge`, boleh dengan skor & skor minimal) atau setelah siswa **mencentang "sudah selesai"** (mode `manual`, untuk konten apa saja, mis. H5P.org). |

## Keamanan

1. **Origin terpisah.** Alamat konten wajib `https://` dan **tidak boleh** dari domain LMS sendiri. Server menolak
   host di `EMBED_BLOCKED_DOMAINS` (`.env`, mis. `sigmateknologi.my.id` = domain & semua subdomainnya),
   `ALLOWED_HOSTS`, dan `CORS_ALLOWED_ORIGINS`; pemutar juga menolak alamat ber-origin sama dengan halaman.
   Alasannya: iframe ber-origin sama dengan `allow-scripts allow-same-origin` bisa keluar dari sandbox.
2. **Iframe sandbox:** `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`,
   `referrerpolicy="no-referrer"`, `allow="fullscreen"`. Konten tidak bisa membuka/memindahkan halaman LMS,
   tidak bisa membaca token, cookie, atau data siswa (beda origin).
3. **Pesan divalidasi** (`frontend/src/mpi/bridge.js`, ada test): diterima hanya jika `event.source` = iframe itu,
   `event.origin` = origin alamat konten, `source = "mpi-content"`, `nonce` sama dengan yang dikirim pemutar, dan
   jenisnya dikenal. Angka dibatasi (tinggi 200–1200 px, progres 0–1, skor ≤ maks).
4. **Batas kepercayaan.** Laporan "selesai"/skor berasal dari browser siswa, sehingga **tidak bisa dibuktikan server**
   (siswa yang paham teknik bisa memalsukannya). Server tetap memeriksa bentuk data dan skor minimal, tetapi
   gunakan `embed_task` untuk **latihan**, bukan ujian. Penilaian penting tetap memakai jenis latihan bawaan atau
   Asesmen.
5. Saat mencoba di laptop (`DEBUG=True` / `npm run dev`), konten boleh dari `http://127.x.x.x` (mis.
   `python -m http.server 8090 --bind 127.0.0.2`).

## Protokol pesan (versi 1)

### LMS → konten

Dikirim pemutar ke `origin` konten setiap kali iframe selesai dimuat:

```json
{ "source": "lms-sigma", "type": "mpi:init", "version": 1, "nonce": "k3j9x0...", "step": "l1a2b3", "user": { "nickname": "Rani" } }
```

Konten menyimpan `event.origin` dan `nonce` dari pesan ini. `user.nickname` hanya nama depan (tanpa NIS/username).

### Konten → LMS

Semua pesan dikirim dengan `window.parent.postMessage(pesan, originDariInit)` — **jangan** memakai `"*"`.
Setiap pesan wajib berisi `"source": "mpi-content"` dan `"nonce"` dari `mpi:init`.

| `type` | Data | Arti |
|---|---|---|
| `mpi:ready` | — | Konten siap (opsional). |
| `mpi:progress` | `value` 0–1 | Kemajuan, ditampilkan sebagai persen. |
| `mpi:resize` | `height` (px) | Tinggi isi konten; iframe menyesuaikan (200–1200). |
| `mpi:complete` | `score`, `max` (opsional, angka, `max` > 0) | Kegiatan selesai. Pada `embed_task` mode bridge, siswa lalu menekan **Periksa**; server menilai tuntas jika selesai dan `score / max × 100 ≥ skor minimal`. |

Contoh minimal:

```js
let lms = null
window.addEventListener('message', (event) => {
  const d = event.data
  if (d?.source === 'lms-sigma' && d.type === 'mpi:init' && !lms) lms = { origin: event.origin, nonce: d.nonce }
})
function kirim(type, data = {}) {
  if (lms) window.parent.postMessage({ source: 'mpi-content', type, nonce: lms.nonce, ...data }, lms.origin)
}
// ... saat kegiatan selesai:
kirim('mpi:complete', { score: 8, max: 10 })
```

Contoh lengkap siap pakai: [`docs/mpi/contoh-konten-bridge.html`](mpi/contoh-konten-bridge.html) (kuis 3 soal:
progres, resize, selesai + skor). Unggah ke GitHub Pages/Netlify, lalu tempel alamatnya di Studio.

## H5P

Konten H5P (H5P.org, Moodle, WordPress) dipasang dengan alamat **embed**-nya, mis.
`https://h5p.org/h5p/embed/612`. Pemutar mendukung protokol resizer H5P (`context: "h5p"`, `hello` /
`prepareResize` / `resize`), jadi tinggi iframe mengikuti isi. H5P tidak mengirim pesan bridge LMS Sigma, sehingga
untuk tugas H5P gunakan mode **manual** (siswa mencentang "sudah selesai"). Impor *Daftar tautan* otomatis
menjadikan alamat `.../h5p/embed/...` sebagai langkah Konten HTML5/H5P.

## Rencana (belum aktif)

Unggah paket ZIP HTML5/H5P ke LMS lalu disajikan dari subdomain konten terpisah (mis.
`konten.sigmateknologi.my.id`) — butuh DNS & konfigurasi server tambahan, dikerjakan setelah subdomain siap.
