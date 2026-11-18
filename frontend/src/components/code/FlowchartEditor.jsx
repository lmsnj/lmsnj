import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  BLOCK_LABELS,
  BLOCK_TYPES,
  insertBlock,
  moveBlock,
  newBlock,
  parseProgram,
  removeBlock,
  serializeProgram,
  updateBlock,
} from '../../utils/flowchart/program'
import Dropdown, { DropdownItem } from '../Dropdown'
import FlowchartDiagram from './FlowchartDiagram'

// Warna garis kiri kartu sesuai bentuk di diagram.
const BORDERS = {
  input: 'border-sky-500',
  output: 'border-sky-500',
  assign: 'border-amber-500',
  if: 'border-violet-500',
  while: 'border-violet-500',
  for: 'border-orange-500',
}

const fieldClass =
  'min-w-0 rounded-md bg-white px-2 py-1 font-mono text-base text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-500 focus:outline-none sm:text-sm disabled:bg-slate-50'

function Field({ value, onChange, placeholder, label, className = '', disabled }) {
  return (
    <input
      type="text"
      aria-label={label}
      value={value ?? ''}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`${fieldClass} ${className}`}
    />
  )
}

function AddBlock({ onAdd, nested }) {
  return (
    <Dropdown
      label="Tambah blok"
      align="left"
      width="w-64"
      buttonClassName={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
        nested ? 'text-slate-500 hover:bg-white' : 'bg-brand-50 text-brand-800 hover:bg-brand-100'
      }`}
      button={() => (
        <>
          <Plus className="size-3.5" aria-hidden="true" /> Tambah blok
        </>
      )}
    >
      {(close) =>
        BLOCK_TYPES.map((type) => (
          <DropdownItem
            key={type.type}
            onClick={() => {
              onAdd(newBlock(type.type))
              close()
            }}
          >
            <span className="font-medium">{type.label}</span>
            <span className="block text-xs text-slate-500">{type.hint}</span>
          </DropdownItem>
        ))
      }
    </Dropdown>
  )
}

/**
 * Editor flowchart untuk Praktik: siswa menyusun blok (Masukan, Keluaran, Proses, Jika, Selama, Ulangi)
 * — lebih mudah di HP daripada menggambar bebas — dan diagramnya digambar otomatis (tab "Diagram").
 * `value` = teks JSON program (utils/flowchart/program.js). `errorBlockId` = blok yang error (merah).
 */
export default function FlowchartEditor({
  value,
  onChange,
  errorBlockId = null,
  readOnly = false,
}) {
  const program = useMemo(() => parseProgram(value), [value])
  const [tab, setTab] = useState('blocks')
  const save = (blocks) => onChange?.(serializeProgram({ blocks }))
  const blocks = program.blocks

  const actions = {
    update: (id, changes) => save(updateBlock(blocks, id, changes)),
    remove: (id) => save(removeBlock(blocks, id)),
    move: (id, delta) => save(moveBlock(blocks, id, delta)),
    add: (parentId, branch, list, block) =>
      save(insertBlock(blocks, parentId, branch, list.length, block)),
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1" role="tablist" aria-label="Tampilan flowchart">
        {[
          ['blocks', 'Susun Blok'],
          ['diagram', 'Diagram'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1 text-sm font-medium ${
              tab === key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'diagram' ? (
        <FlowchartDiagram program={program} highlightId={errorBlockId} />
      ) : (
        <div className="max-h-[32rem] space-y-2 overflow-auto rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
          <p className="rounded-md bg-emerald-50 px-2 py-1 text-center text-xs font-semibold text-emerald-700">
            Mulai
          </p>
          <BlockList
            blocks={blocks}
            parentId={null}
            branch={null}
            actions={actions}
            errorBlockId={errorBlockId}
            readOnly={readOnly}
          />
          <p className="rounded-md bg-emerald-50 px-2 py-1 text-center text-xs font-semibold text-emerald-700">
            Selesai
          </p>
        </div>
      )}
    </div>
  )
}

function BlockList({ blocks, parentId, branch, actions, errorBlockId, readOnly }) {
  return (
    <div className="space-y-2">
      {blocks.map((block, index) => (
        <BlockCard
          key={block.id}
          block={block}
          first={index === 0}
          last={index === blocks.length - 1}
          actions={actions}
          errorBlockId={errorBlockId}
          readOnly={readOnly}
        />
      ))}
      {!readOnly && (
        <AddBlock
          nested={parentId !== null}
          onAdd={(b) => actions.add(parentId, branch, blocks, b)}
        />
      )}
    </div>
  )
}

function Branch({ title, block, branch, actions, errorBlockId, readOnly }) {
  return (
    <div className="rounded-md bg-slate-100/70 p-2">
      <p className="mb-1 text-xs font-semibold text-slate-600">{title}</p>
      <BlockList
        blocks={block[branch] ?? []}
        parentId={block.id}
        branch={branch}
        actions={actions}
        errorBlockId={errorBlockId}
        readOnly={readOnly}
      />
    </div>
  )
}

function BlockCard({ block, first, last, actions, errorBlockId, readOnly }) {
  const set = (field) => (value) => actions.update(block.id, { [field]: value })
  const error = block.id === errorBlockId
  const common = { disabled: readOnly }
  const branchProps = { block, actions, errorBlockId, readOnly }

  return (
    <div
      className={`rounded-lg border-l-4 bg-white p-2 shadow-sm ring-1 ${BORDERS[block.type]} ${
        error ? 'ring-2 ring-red-400' : 'ring-slate-200'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
          {BLOCK_LABELS[block.type]}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm">
          {block.type === 'input' && (
            <Field
              label="Nama variabel"
              value={block.variable}
              onChange={set('variable')}
              placeholder="nama variabel, mis. a"
              className="w-40"
              {...common}
            />
          )}
          {block.type === 'output' && (
            <Field
              label="Yang ditampilkan"
              value={block.expression}
              onChange={set('expression')}
              placeholder={'mis. c  atau  "Hasil: " & c'}
              className="min-w-24 flex-1"
              {...common}
            />
          )}
          {block.type === 'assign' && (
            <>
              <Field
                label="Variabel"
                value={block.variable}
                onChange={set('variable')}
                placeholder="c"
                className="w-24"
                {...common}
              />
              <span aria-hidden="true">←</span>
              <Field
                label="Nilai"
                value={block.expression}
                onChange={set('expression')}
                placeholder="mis. a + b"
                className="min-w-32 flex-1"
                {...common}
              />
            </>
          )}
          {(block.type === 'if' || block.type === 'while') && (
            <Field
              label="Kondisi"
              value={block.condition}
              onChange={set('condition')}
              placeholder="mis. nilai >= 75"
              className="min-w-32 flex-1"
              {...common}
            />
          )}
          {block.type === 'for' && (
            <>
              <Field
                label="Variabel penghitung"
                value={block.variable}
                onChange={set('variable')}
                placeholder="i"
                className="w-14"
                {...common}
              />
              <span>dari</span>
              <Field
                label="Nilai awal"
                value={block.from}
                onChange={set('from')}
                placeholder="1"
                className="w-16"
                {...common}
              />
              <span>sampai</span>
              <Field
                label="Nilai akhir"
                value={block.to}
                onChange={set('to')}
                placeholder="n"
                className="w-16"
                {...common}
              />
              <span>langkah</span>
              <Field
                label="Langkah"
                value={block.step}
                onChange={set('step')}
                placeholder="1"
                className="w-14"
                {...common}
              />
            </>
          )}
        </div>
        {!readOnly && (
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              disabled={first}
              onClick={() => actions.move(block.id, -1)}
              aria-label="Naikkan blok"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={last}
              onClick={() => actions.move(block.id, 1)}
              aria-label="Turunkan blok"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
            >
              <ArrowDown className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => actions.remove(block.id)}
              aria-label="Hapus blok"
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      {block.type === 'if' && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Branch title="Jika Ya" branch="yes" {...branchProps} />
          <Branch title="Jika Tidak" branch="no" {...branchProps} />
        </div>
      )}
      {(block.type === 'while' || block.type === 'for') && (
        <div className="mt-2 pl-2">
          <Branch title="Ulangi" branch="body" {...branchProps} />
        </div>
      )}
    </div>
  )
}
