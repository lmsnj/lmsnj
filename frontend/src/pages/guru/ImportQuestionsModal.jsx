import { Check } from 'lucide-react'
import { useState } from 'react'
import { questionImportApi } from '../../api/assessments'
import Alert from '../../components/Alert'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import FileDownloadButton from '../../components/FileDownloadButton'
import FileInput from '../../components/FileInput'
import Modal from '../../components/Modal'
import { ChoiceContent, QuestionBody } from '../../components/QuestionContent'
import { choiceLetter } from '../../utils/assessments'
import { getErrorMessage, getFieldErrors } from '../../utils/errors'

// Contoh format tempel (tombol "Isi contoh format"): rumus, bahasa Arab, esai.
const EXAMPLE = String.raw`1. Nilai dari $\frac{1}{2} + \frac{1}{4}$ adalah ...
A. $\frac{3}{4}$
B. $\frac{2}{6}$
C. $\frac{1}{6}$
D. $\frac{2}{4}$
Kunci: A
Poin: 2

2. [esai] Tentukan nilai $x$ dan $y$ dari
$$\begin{cases} x + y = 5 \\ x - y = 1 \end{cases}$$
Poin: 5

Stimulus: ذَهَبَ أَحْمَدُ إِلَى الْمَدْرَسَةِ صَبَاحًا.
3. إِلَى أَيْنَ ذَهَبَ أَحْمَدُ؟
أ. إِلَى الْمَدْرَسَةِ
ب. إِلَى السُّوْقِ
ج. إِلَى الْبَيْتِ
Kunci: أ
Arah: rtl

4. Arti kata «الْمَدْرَسَةُ» adalah ...
A. Sekolah
B. Masjid
Kunci: A`

const FORMAT_HELP = [
  ['1. Pertanyaan', 'awal setiap soal (angka Arab ١. juga bisa)'],
  ['A. / B. / C.', 'pilihan jawaban (huruf Arab أ. ب. ج. juga bisa); *B. = kunci'],
  ['Kunci: B', 'jawaban benar (A–E atau أ ب ج د)'],
  ['Poin: 2', 'opsional'],
  ['Arah: rtl', 'opsional, untuk soal berbahasa Arab'],
  ['[esai]', 'setelah nomor; soal tanpa pilihan juga dianggap esai'],
  ['Stimulus: ...', 'bacaan untuk soal sesudahnya'],
  ['Gambar: nama.png', 'gambar soal; [gambar: a.png] di akhir pilihan; unggah ZIP-nya'],
  ['$...$ / $$...$$', 'rumus LaTeX (lihat lembar Contekan Rumus di template Excel)'],
]

function PreviewRow({ row }) {
  const question = { ...row, images: null }
  return (
    <li
      className={`rounded-lg p-3 ring-1 ${
        row.errors.length ? 'bg-red-50/60 ring-red-200' : 'ring-slate-200'
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-slate-500">{row.row}</span>
        <Badge color={row.kind === 'choice' ? 'blue' : 'gray'}>
          {row.kind === 'choice' ? 'Pilihan ganda' : 'Esai'}
        </Badge>
        <span className="text-slate-500">{row.points} poin</span>
        {row.text_direction === 'rtl' && <Badge color="amber">RTL</Badge>}
        {!row.errors.length && <Badge color="green">Siap</Badge>}
      </div>
      <QuestionBody question={question} imageNames={row.images} />
      {row.kind === 'choice' && (
        <ul dir={row.text_direction} className="mt-2 space-y-1 text-sm">
          {row.choices.map((_, i) => (
            <li
              key={i}
              className={`flex items-center gap-2 rounded px-2 py-1 ${
                i === row.correct_choice ? 'bg-brand-50 text-brand-800' : 'text-slate-700'
              }`}
            >
              <span className="font-semibold">{choiceLetter(i)}.</span>
              <ChoiceContent question={question} index={i} imageName={row.images.choices[i]} />
              {i === row.correct_choice && <Check className="size-4" aria-label="kunci" />}
            </li>
          ))}
        </ul>
      )}
      {row.errors.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-red-700">
          {row.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

// Impor banyak soal sekaligus: tempel dari Word/Google Docs, atau template Excel (+ ZIP gambar).
export default function ImportQuestionsModal({ assessmentId, onClose, onImported }) {
  const [mode, setMode] = useState('text')
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [images, setImages] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  const reset = () => {
    setPreview(null)
    setError('')
  }

  const run = async (dryRun) => {
    setBusy(dryRun ? 'check' : 'import')
    setError('')
    try {
      const data = await questionImportApi.run(assessmentId, { mode, text, file, images }, dryRun)
      if (dryRun) setPreview(data)
      else onImported(data.created)
    } catch (err) {
      const body = err.response?.data
      if (body?.rows) setPreview(body)
      const fields = getFieldErrors(err)
      setError(fields.text || fields.file || fields.images || getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const ready = preview && preview.summary.invalid === 0
  const canCheck = mode === 'text' ? Boolean(text.trim()) : Boolean(file)

  return (
    <Modal
      open
      size="lg"
      title="Impor Soal"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button
            variant={ready ? 'secondary' : 'primary'}
            loading={busy === 'check'}
            disabled={!canCheck}
            onClick={() => run(true)}
          >
            Periksa
          </Button>
          {ready && (
            <Button loading={busy === 'import'} onClick={() => run(false)}>
              Tambahkan {preview.summary.total} Soal
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 sm:w-max" role="tablist">
          {[
            ['text', 'Tempel dari Word'],
            ['excel', 'Template Excel'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => {
                setMode(id)
                reset()
              }}
              className={`rounded-md px-3 py-1.5 text-sm ${
                mode === id ? 'bg-white font-medium shadow-sm' : 'text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'text' ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-600">
                Salin soal dari Word/Google Docs lalu tempel di sini. Harakat & rumus tetap utuh.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setText(EXAMPLE)
                  reset()
                }}
              >
                Isi contoh format
              </Button>
            </div>
            <textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                reset()
              }}
              dir="auto"
              rows={12}
              spellCheck={false}
              placeholder={EXAMPLE}
              aria-label="Soal yang ditempel"
              className="block w-full rounded-lg border-0 px-3 py-2 font-mono text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-600"
            />
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer font-medium text-brand-700">
                Panduan format
              </summary>
              <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
                {FORMAT_HELP.map(([code, desc]) => (
                  <div key={code} className="contents">
                    <dt className="font-mono text-slate-800">{code}</dt>
                    <dd>{desc}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Template berisi contoh soal matematika (rumus), bahasa Arab, dan soal bergambar, serta
              lembar <strong>Contekan Rumus</strong>.
            </p>
            <FileDownloadButton
              fetchBlob={questionImportApi.template}
              filename="Template Soal Asesmen.xlsx"
            >
              Unduh Template Excel
            </FileDownloadButton>
            <FileInput
              label="File Excel yang sudah diisi"
              accept=".xlsx"
              onChange={(chosen) => {
                setFile(chosen)
                reset()
              }}
              hint="Format .xlsx, maksimal 300 soal."
            />
          </div>
        )}

        <FileInput
          label="ZIP gambar (opsional)"
          accept=".zip"
          onChange={(chosen) => {
            setImages(chosen)
            reset()
          }}
          hint="Hanya jika soal memakai gambar. Nama file di ZIP harus sama dengan yang ditulis di soal. PNG/JPG/GIF/WEBP, maks. 2 MB per gambar."
        />

        <Alert type="error">{error}</Alert>

        {preview && (
          <section>
            <div className="mb-2 flex flex-wrap gap-2 text-sm">
              <Badge color="gray">{preview.summary.total} soal</Badge>
              <Badge color="green">{preview.summary.valid} siap</Badge>
              {preview.summary.invalid > 0 && (
                <Badge color="red">{preview.summary.invalid} salah</Badge>
              )}
            </div>
            {preview.summary.invalid > 0 && (
              <Alert type="error" className="mb-2">
                Perbaiki soal yang ditandai merah, lalu klik Periksa lagi. Belum ada soal yang
                disimpan.
              </Alert>
            )}
            <ol className="max-h-[50vh] space-y-2 overflow-y-auto">
              {preview.rows.map((row) => (
                <PreviewRow key={row.row} row={row} />
              ))}
            </ol>
          </section>
        )}
      </div>
    </Modal>
  )
}
