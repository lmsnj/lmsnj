/**
 * Tata letak diagram flowchart (fungsi murni): program -> bentuk & garis dengan koordinat, lalu
 * digambar sebagai SVG oleh components/code/FlowchartDiagram.jsx.
 *
 * Setiap potongan diagram punya titik masuk di atas tengah (cx, 0) dan titik keluar di bawah (cx, h),
 * sehingga potongan bisa disusun bertumpuk. Bentuk: terminal (Mulai/Selesai), io (jajaran genjang:
 * masukan/keluaran), process (persegi), decision (belah ketupat: jika/selama), loop (segi enam: ulangi).
 */
import { blockText } from './program.js'

const CHAR = 7.2
const PAD = 16
const BOX_H = 40
const DIAMOND_H = 60
const GAP = 26
const MIN_W = 110
const MAX_W = 240
const LANE = 22

/** Potong teks yang terlalu panjang agar muat di bentuknya. */
export function fitText(text, maxWidth = MAX_W) {
  // + 1e-6: lebar bentuk dihitung pas dari panjang teks, dan pembagian desimal bisa menghasilkan 10,999… sehingga
  // huruf terakhir (sering angka, mis. "nilai >= 85") terpotong padahal muat.
  const maxChars = Math.floor((maxWidth - 2 * PAD) / CHAR + 1e-6)
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text
}

function textWidth(text, extra = 0) {
  return Math.min(MAX_W + extra, Math.max(MIN_W, text.length * CHAR + 2 * PAD + extra))
}

function empty() {
  return { w: 0, h: 0, cx: 0, nodes: [], lines: [], labels: [] }
}

function translate(part, dx, dy) {
  return {
    nodes: part.nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })),
    lines: part.lines.map((l) => ({ ...l, points: l.points.map(([x, y]) => [x + dx, y + dy]) })),
    labels: part.labels.map((t) => ({ ...t, x: t.x + dx, y: t.y + dy })),
  }
}

function merge(target, part) {
  target.nodes.push(...part.nodes)
  target.lines.push(...part.lines)
  target.labels.push(...part.labels)
}

function box(shape, text, id) {
  const extra = shape === 'io' ? 24 : shape === 'loop' ? 30 : 0
  const w = textWidth(text, extra)
  return {
    w,
    h: BOX_H,
    cx: w / 2,
    nodes: [{ shape, x: 0, y: 0, w, h: BOX_H, text: fitText(text, w - extra), id }],
    lines: [],
    labels: [],
  }
}

function sequence(parts) {
  const list = parts.filter((p) => p.h > 0)
  if (!list.length) return empty()
  const left = Math.max(...list.map((p) => p.cx))
  const right = Math.max(...list.map((p) => p.w - p.cx))
  const result = { w: left + right, h: 0, cx: left, nodes: [], lines: [], labels: [] }
  let y = 0
  list.forEach((part, index) => {
    if (index > 0) {
      result.lines.push({
        points: [
          [left, y - GAP],
          [left, y],
        ],
        arrow: true,
      })
    }
    merge(result, translate(part, left - part.cx, y))
    y += part.h + GAP
  })
  result.h = y - GAP
  return result
}

function decision(block, ...branches) {
  const text = blockText(block)
  const dw = textWidth(text, 50)
  const diamond = {
    shape: 'decision',
    w: dw,
    h: DIAMOND_H,
    text: fitText(text, dw - 50),
    id: block.id,
  }
  return { diamond, dw, branches }
}

function ifLayout(block) {
  const { diamond, dw } = decision(block)
  const yes = layoutList(block.yes ?? [])
  const no = layoutList(block.no ?? [])
  // Cabang Ya di kiri, Tidak di kanan; cabang tidak boleh menabrak belah ketupat.
  const leftSpan = Math.max(dw / 2 + 20, yes.w - yes.cx + 15)
  const rightSpan = Math.max(dw / 2 + 20, no.cx + 15)
  const cx = yes.cx + leftSpan
  const yesX = cx - leftSpan
  const noX = cx + rightSpan
  const top = DIAMOND_H + 22
  const mergeY = top + Math.max(yes.h, no.h) + 24
  const result = { w: noX + (no.w - no.cx), h: mergeY, cx, nodes: [], lines: [], labels: [] }
  result.nodes.push({ ...diamond, x: cx - dw / 2, y: 0 })
  const mid = DIAMOND_H / 2
  for (const [part, x, side] of [
    [yes, yesX, -1],
    [no, noX, 1],
  ]) {
    const vertex = cx + (side * dw) / 2
    if (part.h > 0) {
      result.lines.push({
        points: [
          [vertex, mid],
          [x, mid],
          [x, top],
        ],
        arrow: true,
      })
      merge(result, translate(part, x - part.cx, top))
      result.lines.push({
        points: [
          [x, top + part.h],
          [x, mergeY],
          [cx, mergeY],
        ],
        arrow: false,
      })
    } else {
      result.lines.push({
        points: [
          [vertex, mid],
          [x, mid],
          [x, mergeY],
          [cx, mergeY],
        ],
        arrow: false,
      })
    }
    result.labels.push({
      x: vertex + side * 8,
      y: mid - 6,
      text: side < 0 ? 'Ya' : 'Tidak',
      anchor: side < 0 ? 'end' : 'start',
    })
  }
  result.nodes.push({ shape: 'dot', x: cx - 3, y: mergeY - 3, w: 6, h: 6 })
  return result
}

function loopLayout(block) {
  const isFor = block.type === 'for'
  const text = blockText(block)
  const head = isFor
    ? { shape: 'loop', w: textWidth(text, 30), h: BOX_H }
    : { shape: 'decision', w: textWidth(text, 50), h: DIAMOND_H }
  head.text = fitText(text, head.w - (isFor ? 30 : 50))
  head.id = block.id
  const body = layoutList(block.body ?? [])
  // Ruang kiri untuk garis kembali ke atas, ruang kanan untuk jalan keluar.
  const leftExtent = Math.max(head.w / 2, body.cx) + LANE
  const rightExtent = Math.max(head.w / 2, body.w - body.cx) + LANE + 20
  const cx = leftExtent
  const top = head.h + 22
  const bodyBottom = top + body.h
  const backY = bodyBottom + 14
  const exitY = backY + 20
  const result = { w: leftExtent + rightExtent, h: exitY, cx, nodes: [], lines: [], labels: [] }
  result.nodes.push({ ...head, x: cx - head.w / 2, y: 0 })
  if (body.h > 0) {
    result.lines.push({
      points: [
        [cx, head.h],
        [cx, top],
      ],
      arrow: true,
    })
    merge(result, translate(body, cx - body.cx, top))
    result.lines.push({
      points: [
        [cx, bodyBottom],
        [cx, backY],
        [cx - leftExtent + 6, backY],
        [cx - leftExtent + 6, -12],
        [cx, -12],
      ],
      arrow: true,
    })
  } else {
    result.lines.push({
      points: [
        [cx, head.h],
        [cx, backY],
        [cx - leftExtent + 6, backY],
        [cx - leftExtent + 6, -12],
        [cx, -12],
      ],
      arrow: true,
    })
  }
  const right = cx + head.w / 2
  const laneX = cx + rightExtent - 10
  result.lines.push({
    points: [
      [right, head.h / 2],
      [laneX, head.h / 2],
      [laneX, exitY],
      [cx, exitY],
    ],
    arrow: false,
  })
  result.labels.push({ x: cx + 6, y: head.h + 14, text: isFor ? 'Ulangi' : 'Ya', anchor: 'start' })
  result.labels.push({
    x: right + 6,
    y: head.h / 2 - 6,
    text: isFor ? 'Selesai' : 'Tidak',
    anchor: 'start',
  })
  result.nodes.push({ shape: 'dot', x: cx - 3, y: exitY - 3, w: 6, h: 6 })
  return result
}

function layoutBlock(block) {
  switch (block.type) {
    case 'input':
    case 'output':
      return box('io', blockText(block), block.id)
    case 'assign':
      return box('process', blockText(block), block.id)
    case 'if':
      return ifLayout(block)
    case 'while':
    case 'for':
      return loopLayout(block)
    default:
      return empty()
  }
}

function layoutList(blocks) {
  return sequence(blocks.map(layoutBlock))
}

/** Program -> { width, height, nodes, lines, labels } (dengan Mulai & Selesai, diberi tepi). */
export function layoutProgram(program, margin = 16) {
  const start = box('terminal', 'Mulai', 'start')
  const end = box('terminal', 'Selesai', 'end')
  const body = sequence([start, ...program.blocks.map(layoutBlock), end])
  // Garis kembali perulangan bisa sedikit di atas potongannya (y = -12); beri tepi atas.
  const placed = translate(body, margin, margin + 12)
  return { width: body.w + margin * 2, height: body.h + margin * 2 + 12, ...placed }
}
