import { useState } from 'react'
import { materialsApi } from '../../api/materials'
import FormModal from '../../components/FormModal'
import SelectField from '../../components/SelectField'
import useFormSubmit from '../../hooks/useFormSubmit'

/**
 * Gabungkan materi kembar (mis. materi yang sama terlanjur diunggah dua guru tim) ke `material`.
 * Materi kembar dihapus; siswa yang sudah menuntaskannya ditandai tercapai di `material`.
 * `materials` = semua materi kelas-mapel ini.
 */
export default function MergeMaterialModal({ material, materials, onClose, onMerged }) {
  const others = materials.filter((m) => m.id !== material.id)
  const [duplicate, setDuplicate] = useState('')
  const [problem, setProblem] = useState('')

  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    setProblem('')
    if (!duplicate) return setProblem('Pilih materi kembar yang akan digabungkan.')
    const result = await materialsApi.merge(material.id, Number(duplicate))
    onMerged(result.detail)
  })

  const options = [
    { value: '', label: 'Pilih materi kembar' },
    ...others.map((m) => ({
      value: m.id,
      label: `${m.title}${m.created_by_name ? ` (oleh ${m.created_by_name})` : ''}`,
    })),
  ]

  return (
    <FormModal
      title="Gabungkan Materi Kembar"
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={problem || generalError}
      submitLabel="Gabungkan"
    >
      <p className="text-sm text-slate-600">
        Materi yang dipertahankan: <strong>{material.title}</strong>
        {material.created_by_name && ` (oleh ${material.created_by_name})`}.
      </p>
      <SelectField
        label="Materi kembar yang dihapus"
        value={duplicate}
        onChange={(event) => setDuplicate(event.target.value)}
        options={options}
        error={errors.duplicate}
      />
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
        <li>
          Siswa yang sudah <strong>menuntaskan</strong> materi kembar ditandai tercapai di materi
          ini, jadi tidak perlu mempelajarinya lagi.
        </li>
        <li>Cerita reflektif dan pengesahan guru ikut dipindahkan.</li>
        <li>
          Materi kembar beserta file dan kontennya <strong>dihapus permanen</strong>.
        </li>
      </ul>
    </FormModal>
  )
}
