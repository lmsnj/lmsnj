import { html } from '@codemirror/lang-html'
import { python } from '@codemirror/lang-python'
import { indentUnit } from '@codemirror/language'
import { php } from '@codemirror/lang-php'
import { EditorState } from '@codemirror/state'
import { basicSetup, EditorView } from 'codemirror'
import { useEffect, useRef } from 'react'

// PHP: mode campuran (HTML di luar tag <?php ... ?>).
const LANGUAGE_EXTENSIONS = { python: () => python(), html: () => html(), php: () => php() }

// Ukuran huruf & tinggi minimal editor (Tailwind tidak bisa menata isi CodeMirror langsung).
const theme = EditorView.theme({
  '&': { fontSize: '14px' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' },
  '.cm-content, .cm-gutter': { minHeight: 'var(--editor-min-height, 16rem)' },
})

/**
 * Editor kode (CodeMirror 6): penomoran baris, warna sintaks, indentasi otomatis. Dimuat lazy bersama
 * halaman Praktik agar tidak memperbesar halaman lain. `value` dari luar menimpa isi editor hanya jika
 * berbeda (mis. tombol "Atur Ulang").
 */
export default function CodeEditor({
  value,
  onChange,
  language = 'python',
  readOnly = false,
  minHeight = '16rem',
  label = 'Editor kode',
}) {
  const parent = useRef(null)
  const view = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const editor = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: value ?? '',
        extensions: [
          basicSetup,
          theme,
          indentUnit.of(language === 'html' ? '  ' : '    '),
          LANGUAGE_EXTENSIONS[language]?.() ?? [],
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current?.(update.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = editor
    return () => editor.destroy()
    // Editor dibuat ulang hanya jika bahasa/mode baca berubah; isi diatur efek di bawah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly])

  useEffect(() => {
    const editor = view.current
    if (editor && value !== undefined && value !== editor.state.doc.toString()) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
    }
  }, [value])

  return (
    <div
      ref={parent}
      style={{ '--editor-min-height': minHeight }}
      className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-300 focus-within:ring-2 focus-within:ring-brand-500"
    />
  )
}
