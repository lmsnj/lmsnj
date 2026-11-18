import { useId, useMemo } from 'react'
import { layoutProgram } from '../../utils/flowchart/layout'

// Warna per bentuk (kelas Tailwind untuk SVG). Blok yang error diberi warna merah.
const STYLES = {
  terminal: 'fill-emerald-50 stroke-emerald-600',
  io: 'fill-sky-50 stroke-sky-600',
  process: 'fill-amber-50 stroke-amber-600',
  decision: 'fill-violet-50 stroke-violet-600',
  loop: 'fill-orange-50 stroke-orange-600',
}
const ERROR_STYLE = 'fill-red-50 stroke-red-600'

function Shape({ node, highlighted }) {
  const { x, y, w, h } = node
  const className = `${highlighted ? ERROR_STYLE : STYLES[node.shape]} stroke-[1.5]`
  switch (node.shape) {
    case 'terminal':
      return <rect x={x} y={y} width={w} height={h} rx={h / 2} className={className} />
    case 'io':
      return (
        <polygon
          points={`${x + 12},${y} ${x + w},${y} ${x + w - 12},${y + h} ${x},${y + h}`}
          className={className}
        />
      )
    case 'decision':
      return (
        <polygon
          points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`}
          className={className}
        />
      )
    case 'loop':
      return (
        <polygon
          points={`${x + 14},${y} ${x + w - 14},${y} ${x + w},${y + h / 2} ${x + w - 14},${y + h} ${x + 14},${y + h} ${x},${y + h / 2}`}
          className={className}
        />
      )
    case 'dot':
      return <circle cx={x + w / 2} cy={y + h / 2} r={w / 2} className="fill-slate-500" />
    default:
      return <rect x={x} y={y} width={w} height={h} rx={4} className={className} />
  }
}

/**
 * Gambar flowchart (SVG) yang dibuat otomatis dari susunan blok. Ukuran asli dipertahankan agar teks
 * terbaca; bila lebih lebar dari layar, area ini bisa digeser. `highlightId` = blok yang error.
 */
export default function FlowchartDiagram({
  program,
  highlightId = null,
  title = 'Diagram flowchart',
}) {
  const layout = useMemo(() => layoutProgram(program), [program])
  const arrowId = useId().replace(/:/g, '')
  return (
    <div className="overflow-auto rounded-lg bg-white p-2 ring-1 ring-slate-200">
      <svg
        role="img"
        aria-label={title}
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="mx-auto block max-w-none"
      >
        <defs>
          <marker
            id={arrowId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-slate-500" />
          </marker>
        </defs>
        {layout.lines.map((line, index) => (
          <polyline
            key={index}
            points={line.points.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none"
            className="stroke-slate-500 stroke-[1.5]"
            markerEnd={line.arrow ? `url(#${arrowId})` : undefined}
          />
        ))}
        {layout.nodes.map((node, index) => (
          <g key={node.id ?? `dot-${index}`}>
            <Shape node={node} highlighted={node.id && node.id === highlightId} />
            {node.text && (
              <text
                x={node.x + node.w / 2}
                y={node.y + node.h / 2}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-slate-800 font-mono text-[12px]"
              >
                {node.text}
              </text>
            )}
          </g>
        ))}
        {layout.labels.map((label, index) => (
          <text
            key={index}
            x={label.x}
            y={label.y}
            textAnchor={label.anchor}
            className="fill-slate-500 text-[11px] font-semibold"
          >
            {label.text}
          </text>
        ))}
      </svg>
    </div>
  )
}
