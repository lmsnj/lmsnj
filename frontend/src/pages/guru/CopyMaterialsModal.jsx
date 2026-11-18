import { useState } from 'react'
import { materialsApi } from '../../api/materials'
import Alert from '../../components/Alert'
import FormModal from '../../components/FormModal'
import SelectField from '../../components/SelectField'
import Spinner from '../../components/Spinner'
import useFetch from '../../hooks/useFetch'
import useFormSubmit from '../../hooks/useFormSubmit'

/**
 * Salin materi kelas-mapel ini ke kelas lain dengan mapel yang sama (kelas paralel atau kelas tahun
 * ajaran baru). Salinan berstatus draf; guru kelas tujuan memeriksa lalu menerbitkannya.
 * `materials` = materi kelas-mapel ini (urut).
 */
export default function CopyMaterialsModal({ assignmentId, materials, onClose, onCopied }) {
  const targets = useFetch(materialsApi.copyTargets, assignmentId)
  const [target, setTarget] = useState('')
  const [selected, setSelected] = useState(() => new Set(materials.map((m) => m.id)))
  const [problem, setProblem] = useState('')

  const toggle = (id) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allSelected = selected.size === materials.length

  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    setProblem('')
    if (!target) return setProblem('Pilih kelas tujuan dulu.')
    if (!selected.size) return setProblem('Pilih minimal satu materi.')
    // Kirim sesuai urutan materi agar urutannya sama di kelas tujuan.
    const ids = materials.filter((m) => selected.has(m.id)).map((m) => m.id)
    const result = await materialsApi.copy(assignmentId, ids, Number(target))
    onCopied(result.detail)
  })

  const list = targets.data ?? []
  const options = [
    { value: '', label: 'Pilih kelas tujuan' },
    ...list.map((t) => ({
      value: t.teaching_assignment,
      label: `${t.classroom_name} · ${t.academic_year} · ${t.teachers.join(', ')}`,
    })),
  ]

  return (
    <FormModal
      title="Salin Materi ke Kelas Lain"
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={problem || generalError || errors.materials}
      submitLabel={`Salin ${selected.size} Materi`}
      size="lg"
    >
      <p className="text-sm text-slate-600">
        Cocok untuk materi hasil kolaborasi yang juga dipakai di kelas lain. File, konten tambahan,
        capaian, kuis, latihan, dan bab ikut disalin. Salinan berstatus <strong>Draf</strong>, jadi
        guru kelas tujuan memeriksa lalu menerbitkannya. Syarat tugas/asesmen tidak ikut karena
        milik kelas ini. Progres siswa tidak disalin karena siswanya berbeda.
      </p>
      <Alert type="error">{targets.error}</Alert>
      {targets.loading && !targets.data ? (
        <div className="py-4 text-center text-brand-600">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <Alert type="info">
          Belum ada kelas lain dengan mapel ini. Minta admin menambahkan pengampunya dulu.
        </Alert>
      ) : (
        <SelectField
          label="Kelas tujuan"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          options={options}
          error={errors.target}
        />
      )}

      <fieldset>
        <div className="mb-2 flex items-center justify-between gap-2">
          <legend className="text-sm font-medium text-slate-700">Materi yang disalin</legend>
          <button
            type="button"
            className="text-sm font-medium text-brand-700 hover:underline"
            onClick={() => setSelected(new Set(allSelected ? [] : materials.map((m) => m.id)))}
          >
            {allSelected ? 'Kosongkan pilihan' : 'Pilih semua'}
          </button>
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg p-1 ring-1 ring-slate-200">
          {materials.map((material, index) => (
            <li key={material.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.has(material.id)}
                  onChange={() => toggle(material.id)}
                  className="mt-0.5 size-4 rounded text-brand-600"
                />
                <span>
                  <span className="text-slate-500">{index + 1}.</span> {material.title}
                  {material.chapter_title && (
                    <span className="text-slate-500"> · {material.chapter_title}</span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </FormModal>
  )
}
