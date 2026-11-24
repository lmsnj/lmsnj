import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { readsFromResults } from '../../utils/qrQuiz'

// File wasm disajikan dari server LMS sendiri (bawaan pustaka = CDN jsDelivr), jadi pemindai tetap
// jalan walaupun CDN diblokir jaringan sekolah.
prepareZXingModule({
  overrides: {
    locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
  },
})

const OPTIONS = {
  formats: ['QRCode'],
  maxNumberOfSymbols: 80,
  tryHarder: true,
  tryRotate: true,
  tryInvert: false,
}

/** Baca semua kartu di satu gambar (ImageData) -> [{card, option}]. */
export async function scanImage(imageData) {
  const results = await readBarcodes(imageData, OPTIONS)
  return readsFromResults(results.filter((result) => result.isValid))
}
