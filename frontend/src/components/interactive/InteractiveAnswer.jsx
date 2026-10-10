import { questionDir } from '../../utils/assessments'
import DragDropInput from './DragDropInput'
import FillBlankInput from './FillBlankInput'
import InteractiveVideoInput from './InteractiveVideoInput'
import MatchingInput from './MatchingInput'

const INPUTS = {
  fill_blank: FillBlankInput,
  drag_drop: DragDropInput,
  matching: MatchingInput,
  interactive_video: InteractiveVideoInput,
}

/**
 * Area jawaban soal interaktif — dipakai di halaman ujian siswa, pratinjau guru, dan halaman hasil
 * agar tampilannya selalu sama.
 * - `value`: jawaban (response); `onChange` kosong = hanya dibaca (hasil/editor).
 * - `review`: { result, key } untuk menandai benar/salah dan menampilkan kunci.
 * - `extra`: properti khusus jenis soal (mis. pemeriksa checkpoint video).
 */
export default function InteractiveAnswer({ question, value, onChange, number, review, ...extra }) {
  const Input = INPUTS[question.kind]
  if (!Input || !question.content) return null
  return (
    <Input
      content={question.content}
      value={value}
      onChange={onChange}
      number={number}
      dir={questionDir(question)}
      review={review}
      question={question}
      {...extra}
    />
  )
}
