import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import {
  BLANK,
  CHILDREN,
  KIND_LABELS,
  NODE_KINDS,
  newNode,
  paramsText,
  parseParams,
  TYPES,
} from './program'

// Warna blok mengikuti Flowgorithm: Input biru, Output hijau, If merah muda, perulangan oranye.
const TONES = {
  decl: 'border-slate-400 bg-slate-50',
  input: 'border-sky-500 bg-sky-50',
  output: 'border-emerald-500 bg-emerald-50',
  assign: 'border-amber-500 bg-amber-50',
  if: 'border-pink-500 bg-pink-50',
  while: 'border-orange-500 bg-orange-50',
  for: 'border-orange-500 bg-orange-50',
  do: 'border-orange-500 bg-orange-50',
  call: 'border-violet-500 bg-violet-50',
  cm: 'border-slate-300 bg-white',
}
const CHIP = {
  decl: 'bg-slate-600',
  input: 'bg-sky-600',
  output: 'bg-emerald-600',
  assign: 'bg-amber-600',
  if: 'bg-pink-600',
  while: 'bg-orange-600',
  for: 'bg-orange-600',
  do: 'bg-orange-600',
  call: 'bg-violet-600',
  cm: 'bg-slate-400',
}
const CHILD_TITLES = { yes: 'Jika True', no: 'Jika False', body: 'Isi perulangan' }
const INPUT =
  'min-w-0 rounded-md border-0 bg-white px-2 py-1 font-mono text-base ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-600 sm:text-sm'

/** Satu isian teks blok. Mode isi bagian kosong: {{}} menjadi kotak isian bernomor. */
function Field({ value, onChange, label, placeholder, size = 'flex-1', slot, blanks }) {
  const text = String(value ?? '')
  if (blanks && text.includes(BLANK)) {
    const pieces = text.split(BLANK)
    const start = blanks.indexes[slot] ?? 0
    return (
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1 font-mono text-[0.95em]">
        {pieces.map((piece, i) => (
          <span key={i} className="contents">
            {piece && <span className="whitespace-pre-wrap">{piece}</span>}
            {i < pieces.length - 1 && (
              <input
                aria-label={`Bagian kosong ${start + i + 1}`}
                value={blanks.values[start + i] ?? ''}
                onChange={(event) => blanks.onChange(start + i, event.target.value)}
                readOnly={!blanks.onChange}
                placeholder={`(${start + i + 1})`}
                spellCheck="false"
                autoCapitalize="off"
                className={`${INPUT} w-28 bg-yellow-50 ring-yellow-400 sm:w-36`}
              />
            )}
          </span>
        ))}
      </span>
    )
  }
  if (!onChange) {
    return (
      <span className="min-w-0 font-mono text-[0.95em] break-words whitespace-pre-wrap">
        {text}
      </span>
    )
  }
  return (
    <input
      aria-label={label}
      value={text}
      placeholder={placeholder}
      spellCheck="false"
      autoCapitalize="off"
      onChange={(event) => onChange(event.target.value)}
      className={`${INPUT} ${size}`}
    />
  )
}

function Word({ children }) {
  return <span className="text-[0.85em] font-semibold text-slate-500">{children}</span>
}

function NodeFields({ node, set, blanks }) {
  const field = (name, label, placeholder, size) => (
    <Field
      value={node[name]}
      onChange={set ? (value) => set({ [name]: value }) : null}
      label={`${KIND_LABELS[node.t]}: ${label}`}
      placeholder={placeholder}
      size={size}
      slot={`${node.id}:${name}`}
      blanks={blanks}
    />
  )
  switch (node.t) {
    case 'decl':
      return set ? (
        <>
          <select
            aria-label="Tipe data"
            value={node.type}
            onChange={(event) => set({ type: event.target.value })}
            className={`${INPUT} w-28`}
          >
            {TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
          <input
            aria-label="Nama variabel (pisahkan dengan koma)"
            value={(node.names ?? []).join(', ')}
            placeholder="nama1, nama2"
            spellCheck="false"
            autoCapitalize="off"
            onChange={(event) => set({ names: event.target.value.split(',').map((s) => s.trim()) })}
            className={`${INPUT} flex-1`}
          />
          <input
            aria-label="Jumlah laci array (kosong = bukan array)"
            title="Isi jumlah laci untuk membuat array"
            type="number"
            min="0"
            max="1000"
            value={node.size || ''}
            placeholder="array"
            onChange={(event) => set({ size: Math.max(0, parseInt(event.target.value, 10) || 0) })}
            className={`${INPUT} w-20`}
          />
        </>
      ) : (
        <span className="font-mono text-[0.95em]">
          {node.type} {(node.names ?? []).join(', ')}
          {node.size ? `[${node.size}]` : ''}
        </span>
      )
    case 'assign':
      return (
        <>
          {field('target', 'variabel', 'variabel', 'w-24 sm:w-28')}
          <Word>=</Word>
          {field('expr', 'ekspresi', 'ekspresi')}
        </>
      )
    case 'input':
      return field('target', 'variabel', 'variabel')
    case 'output':
    case 'call':
      return field('expr', 'ekspresi', node.t === 'call' ? 'fungsi(argumen)' : '"teks" & variabel')
    case 'if':
    case 'while':
    case 'do':
      return field('cond', 'syarat', 'syarat, mis. x > 0')
    case 'for':
      return (
        <>
          {field('v', 'variabel', 'i', 'w-14')}
          <Word>dari</Word>
          {field('from', 'nilai awal', '1', 'w-16')}
          <Word>sampai</Word>
          {field('to', 'nilai akhir', '5', 'w-16')}
          <Word>langkah</Word>
          {field('step', 'langkah', '1', 'w-14')}
        </>
      )
    case 'cm':
      return field('text', 'catatan', 'catatan')
    default:
      return null
  }
}

function SmallButton({ label, icon: Icon, onClick, disabled }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-md bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-30"
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  )
}

function NodeEditor({ node, index, count, update, remove, move, ...shared }) {
  const { activeId, errorId, editable, blanks } = shared
  const set = editable ? (changes) => update({ ...node, ...changes }) : null
  const ring =
    node.id === errorId
      ? 'ring-2 ring-red-500'
      : node.id === activeId
        ? 'ring-2 ring-yellow-500'
        : ''
  return (
    <li className={`rounded-lg border-l-4 p-2 ${TONES[node.t]} ${ring}`} data-node={node.id}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-xs font-bold text-white ${CHIP[node.t]}`}>
          {KIND_LABELS[node.t]}
        </span>
        <NodeFields node={node} set={set} blanks={blanks} />
        {editable && (
          <span className="ms-auto flex gap-1">
            <SmallButton
              label="Naikkan blok"
              icon={ArrowUp}
              disabled={index === 0}
              onClick={() => move(-1)}
            />
            <SmallButton
              label="Turunkan blok"
              icon={ArrowDown}
              disabled={index === count - 1}
              onClick={() => move(1)}
            />
            <SmallButton label="Hapus blok" icon={Trash2} onClick={remove} />
          </span>
        )}
      </div>
      {(CHILDREN[node.t] ?? []).map((child) => (
        <div key={child} className="mt-2 ms-2 border-s-2 border-dashed border-slate-300 ps-2">
          <p className="mb-1 text-xs font-semibold text-slate-500">
            {node.t === 'do' ? 'Kerjakan dulu, lalu cek syarat' : CHILD_TITLES[child]}
          </p>
          <BlockList
            nodes={node[child] ?? []}
            onChange={(list) => update({ ...node, [child]: list })}
            {...shared}
          />
        </div>
      ))}
    </li>
  )
}

function AddBlock({ onAdd }) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-sm">
      <Plus className="size-4 shrink-0 text-brand-700" aria-hidden="true" />
      <select
        aria-label="Tambah blok"
        value=""
        onChange={(event) => event.target.value && onAdd(newNode(event.target.value))}
        className="w-full max-w-xs min-w-0 rounded-md border-0 bg-white px-2 py-1 text-sm text-brand-700 ring-1 ring-brand-300 ring-inset"
      >
        <option value="">Tambah blok…</option>
        {NODE_KINDS.map((kind) => (
          <option key={kind.t} value={kind.t} title={kind.hint}>
            {kind.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function BlockList({ nodes, onChange, ...shared }) {
  const update = (index, node) => onChange(nodes.map((n, i) => (i === index ? node : n)))
  const move = (index, delta) => {
    const next = [...nodes]
    const target = index + delta
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  return (
    <div className="space-y-1.5">
      {nodes.length > 0 && (
        <ol className="space-y-1.5">
          {nodes.map((node, index) => (
            <NodeEditor
              key={node.id ?? index}
              node={node}
              index={index}
              count={nodes.length}
              update={(next) => update(index, next)}
              remove={() => onChange(nodes.filter((_, i) => i !== index))}
              move={(delta) => move(index, delta)}
              {...shared}
            />
          ))}
        </ol>
      )}
      {shared.editable && <AddBlock onAdd={(node) => onChange([...nodes, node])} />}
      {!nodes.length && !shared.editable && <p className="text-xs text-slate-400">(kosong)</p>}
    </div>
  )
}

function FunctionEditor({ name, fn, onChange, onRename, onRemove, shared }) {
  const { editable } = shared
  return (
    <div className="space-y-2 rounded-lg bg-violet-50/60 p-2 ring-1 ring-violet-200">
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="rounded bg-violet-700 px-1.5 py-0.5 text-xs font-bold text-white">
          Fungsi
        </span>
        {editable ? (
          <>
            <input
              aria-label="Nama fungsi"
              value={name}
              onChange={(e) => onRename(e.target.value)}
              className={`${INPUT} w-32`}
            />
            <Word>parameter</Word>
            <input
              aria-label="Parameter (nama: tipe, dipisah koma)"
              defaultValue={paramsText(fn.params)}
              placeholder="a: Integer, b: Real"
              onBlur={(e) => onChange({ ...fn, params: parseParams(e.target.value) })}
              className={`${INPUT} flex-1`}
            />
            <Word>hasil</Word>
            <select
              aria-label="Tipe hasil"
              value={fn.type || ''}
              onChange={(e) => onChange({ ...fn, type: e.target.value })}
              className={`${INPUT} w-28`}
            >
              <option value="">(tanpa hasil)</option>
              {TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <SmallButton label="Hapus fungsi" icon={Trash2} onClick={onRemove} />
          </>
        ) : (
          <span className="font-mono">
            {fn.type || 'None'} {name}({paramsText(fn.params)})
          </span>
        )}
      </div>
      <BlockList nodes={fn.body ?? []} onChange={(body) => onChange({ ...fn, body })} {...shared} />
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="rounded bg-violet-700 px-1.5 py-0.5 text-xs font-bold text-white">
          Return
        </span>
        <Field
          value={fn.ret}
          onChange={editable ? (ret) => onChange({ ...fn, ret }) : null}
          label="Nilai yang dikembalikan"
          placeholder="variabel hasil (kosong = tanpa hasil)"
          slot={`fn:${name}:ret`}
          blanks={shared.blanks}
        />
      </div>
    </div>
  )
}

/**
 * Editor program Flowgorithm (susun blok). `onChange` kosong = hanya baca. `blanks` (mode isi):
 * { indexes, values, onChange(index, teks) } -> {{}} menjadi kotak isian. `activeId`/`errorId` menandai blok
 * yang sedang dijalankan / error. `functions` = tampilkan bagian fungsi (Studio).
 */
export default function FlowgorithmEditor({
  program,
  onChange,
  activeId,
  errorId,
  blanks,
  functions = false,
}) {
  const editable = Boolean(onChange)
  const shared = { activeId, errorId, editable, blanks }
  const funcs = program.funcs ?? {}
  const setFuncs = (next) => {
    const result = { ...program, funcs: next }
    if (!Object.keys(next).length) delete result.funcs
    onChange(result)
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1.5 rounded-lg bg-white p-2 ring-1 ring-slate-200">
        <p className="w-fit rounded-full bg-brand-700 px-3 py-0.5 text-xs font-bold text-white">
          Main
        </p>
        <BlockList
          nodes={program.body ?? []}
          onChange={(body) => onChange({ ...program, body })}
          {...shared}
        />
        <p className="w-fit rounded-full bg-brand-700 px-3 py-0.5 text-xs font-bold text-white">
          End
        </p>
      </div>
      {Object.entries(funcs).map(([name, fn], index) => (
        // Kunci = urutan (bukan nama) agar kotak nama tidak kehilangan fokus saat diketik.
        <FunctionEditor
          key={index}
          name={name}
          fn={fn}
          shared={shared}
          onChange={(next) => setFuncs({ ...funcs, [name]: next })}
          onRename={(next) => {
            const entries = Object.entries(funcs).map(([key, value]) => [
              key === name ? next : key,
              value,
            ])
            setFuncs(Object.fromEntries(entries))
          }}
          onRemove={() =>
            setFuncs(Object.fromEntries(Object.entries(funcs).filter(([key]) => key !== name)))
          }
        />
      ))}
      {editable && functions && (
        <button
          type="button"
          onClick={() => {
            let index = Object.keys(funcs).length + 1
            while (funcs[`fungsi${index}`]) index += 1
            setFuncs({
              ...funcs,
              [`fungsi${index}`]: { params: [], type: 'Integer', body: [], ret: '' },
            })
          }}
          className="inline-flex items-center gap-1 text-sm font-semibold text-violet-800"
        >
          <Plus className="size-4" aria-hidden="true" /> Tambah fungsi
        </button>
      )}
    </div>
  )
}
