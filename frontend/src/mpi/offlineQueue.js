/**
 * Antrean kiriman yang tidak butuh jawaban langsung (posisi & waktu belajar, refleksi). Jika sinyal
 * putus, kiriman disimpan di HP (localStorage) lalu dikirim lagi saat online. Jawaban latihan tidak
 * masuk antrean ini karena harus dinilai server; jawaban dicoba ulang langsung oleh pemutar.
 */
import { isNetworkError, queueAdd, queueRemove } from './engine'

const KEY = 'mpi-antrean'

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

function write(queue) {
  try {
    localStorage.setItem(KEY, JSON.stringify(queue))
  } catch {
    // Penyimpanan penuh/diblokir: kiriman berikutnya tetap dicoba langsung.
  }
}

export function pendingCount() {
  return read().length
}

/** Kirim sekarang; jika gagal karena sinyal, simpan untuk dikirim nanti. */
export async function send(api, item) {
  try {
    return await api[item.type](item.materialId, item.data)
  } catch (error) {
    if (isNetworkError(error)) write(queueAdd(read(), item))
    throw error
  }
}

let flushing = false

/** Kirim ulang semua antrean. Berhenti saat masih offline; kiriman yang ditolak server dibuang. */
export async function flush(api) {
  if (flushing) return
  flushing = true
  try {
    for (const item of read()) {
      try {
        await api[item.type](item.materialId, item.data)
        write(queueRemove(read(), item.uid))
      } catch (error) {
        if (isNetworkError(error)) break
        write(queueRemove(read(), item.uid))
      }
    }
  } finally {
    flushing = false
  }
}
