import { useState } from 'react'
import { examsApi } from '../../api/exams'
import FormModal from '../../components/FormModal'
import TextAreaField from '../../components/TextAreaField'
import TextField from '../../components/TextField'
import useFormSubmit from '../../hooks/useFormSubmit'
import useGrades from '../../hooks/useGrades'
import { currentAcademicYear } from '../../utils/academic'
import { eventToForm, formToPayload, REQUIREMENT_FIELDS } from '../../utils/exams'

function Checkbox({ label, hint, checked, onChange }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 rounded text-brand-600"
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  )
}

function Section({ title, hint, children }) {
  return (
    <fieldset className="space-y-3 rounded-xl p-4 ring-1 ring-slate-200">
      <legend className="px-1 text-sm font-semibold text-slate-900">{title}</legend>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      {children}
    </fieldset>
  )
}

// Tambah/ubah acara ujian beserta syarat kartu ujiannya (khusus admin).
export default function ExamEventFormModal({ event, onClose, onSaved }) {
  const { grades } = useGrades()
  const [form, setForm] = useState(() => eventToForm(event, currentAcademicYear()))
  const { submit, submitting, errors, generalError } = useFormSubmit(async () => {
    const payload = formToPayload(form)
    const saved = event ? await examsApi.update(event.id, payload) : await examsApi.create(payload)
    onSaved(saved, Boolean(event))
  })

  const set = (name, value) => setForm({ ...form, [name]: value })
  const handleChange = (e) => set(e.target.name, e.target.value)
  const toggleGrade = (grade) =>
    set(
      'grades',
      form.grades.includes(grade)
        ? form.grades.filter((g) => g !== grade)
        : [...form.grades, grade],
    )

  return (
    <FormModal
      title={event ? 'Ubah Acara Ujian' : 'Tambah Acara Ujian'}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      error={generalError}
    >
      <TextField
        label="Nama acara"
        name="name"
        value={form.name}
        onChange={handleChange}
        error={errors.name}
        placeholder="Penilaian Akhir Semester Ganjil 2026/2027"
        required
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Tahun ajaran"
          name="academic_year"
          value={form.academic_year}
          onChange={handleChange}
          error={errors.academic_year}
          placeholder="2026/2027"
          required
        />
        <TextField
          label="Mulai ujian"
          type="date"
          name="exam_start"
          value={form.exam_start}
          onChange={handleChange}
          error={errors.exam_start}
          required
        />
        <TextField
          label="Selesai ujian"
          type="date"
          name="exam_end"
          value={form.exam_end}
          onChange={handleChange}
          error={errors.exam_end}
        />
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-slate-700">Tingkat yang ikut</p>
        <div className="flex flex-wrap gap-2">
          {grades.map((grade) => (
            <label
              key={grade}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ${
                form.grades.includes(grade)
                  ? 'bg-brand-600 text-white ring-brand-600'
                  : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={form.grades.includes(grade)}
                onChange={() => toggleGrade(grade)}
              />
              Kelas {grade}
            </label>
          ))}
        </div>
        {errors.grades ? (
          <p className="mt-1 text-xs text-red-600">{errors.grades}</p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">Tidak memilih = semua tingkat ikut.</p>
        )}
      </div>

      <Section
        title="Syarat kartu ujian"
        hint="Kosongkan batas yang tidak dipakai. Data yang belum ada (mis. presensi belum diisi guru) dianggap memenuhi."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {REQUIREMENT_FIELDS.map((field) => (
            <TextField
              key={field.name}
              label={field.label}
              type="number"
              min={0}
              max={field.max}
              name={field.name}
              value={form[field.name]}
              onChange={handleChange}
              error={errors[field.name]}
              placeholder="Tidak dipakai"
            />
          ))}
        </div>
        <Checkbox
          label="Sakit dan Izin dihitung hadir"
          checked={form.count_excused}
          onChange={(value) => set('count_excused', value)}
        />
        <Checkbox
          label="Perlu persetujuan wali kelas"
          hint="Wali kelas mencentang siswa yang boleh ikut ujian (mis. sudah tertib administrasi)."
          checked={form.require_homeroom_check}
          onChange={(value) => set('require_homeroom_check', value)}
        />
      </Section>

      <Section
        title="Periode hitung (opsional)"
        hint="Presensi dan tugas yang dihitung hanya dalam rentang ini. Kosong = sepanjang tahun ajaran."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Dari tanggal"
            type="date"
            name="period_start"
            value={form.period_start}
            onChange={handleChange}
            error={errors.period_start}
          />
          <TextField
            label="Sampai tanggal"
            type="date"
            name="period_end"
            value={form.period_end}
            onChange={handleChange}
            error={errors.period_end}
          />
        </div>
      </Section>

      <Section title="Isi kartu">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Jabatan penanda tangan"
            name="signer_title"
            value={form.signer_title}
            onChange={handleChange}
            error={errors.signer_title}
            placeholder="Kepala Sekolah"
          />
          <TextField
            label="Nama penanda tangan"
            name="signer_name"
            value={form.signer_name}
            onChange={handleChange}
            error={errors.signer_name}
          />
        </div>
        <TextAreaField
          label="Catatan di kartu"
          name="card_note"
          rows={2}
          value={form.card_note}
          onChange={handleChange}
          error={errors.card_note}
          placeholder="Kartu wajib dibawa selama ujian berlangsung."
        />
      </Section>
    </FormModal>
  )
}
