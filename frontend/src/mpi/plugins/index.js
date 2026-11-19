/**
 * Plugin mapel Media Pembelajaran Interaktif (pasangan backend `apps/learning_media/plugins/`).
 * Setiap plugin mendaftarkan: komponen pemutar (registerStep), isi awal di Studio (registerStudioKind),
 * dan form Studio (registerStepForm). Modul ini diimpor sekali oleh pemutar & Studio.
 */
import { registerStep } from '../registry'
import { registerStudioKind } from '../studio'
import { registerStepForm } from '../studio/forms'
import { ExposureStep } from './exposure/ExposureStep'
import { ExposureFields } from './exposure/StudioFields'
import { FlowgorithmDemoStep, FlowgorithmStep } from './flowgorithm/FlowgorithmStep'
import { isAnswered } from './flowgorithm/program'
import { FlowgorithmDemoFields, FlowgorithmFields } from './flowgorithm/StudioFields'

const SAMPLE = {
  body: [
    { t: 'decl', type: 'Integer', names: ['p', 'l'] },
    { t: 'input', target: 'p' },
    { t: 'input', target: 'l' },
    { t: 'output', expr: '"Luas: " & p * l' },
  ],
}

registerStep('flowgorithm', {
  Component: FlowgorithmStep,
  label: 'Flowgorithm (susun/isi program)',
  isAnswered,
})
registerStudioKind(
  'flowgorithm',
  () => ({
    text: 'Buat program yang meminta panjang dan lebar, lalu menampilkan luasnya.',
    image: '',
    mode: 'build',
    program: { body: [{ t: 'decl', type: 'Integer', names: ['p', 'l'] }] },
    solution: structuredClone(SAMPLE),
    answers: [],
    tests: [
      { inputs: ['5', '3'], expected: ['Luas: 15'], hidden: false },
      { inputs: ['7', '7'], expected: ['Luas: 49'], hidden: true },
    ],
    compare: 'tail',
    explanation: '',
  }),
  true,
)
registerStepForm('flowgorithm', FlowgorithmFields)

registerStep('flowgorithm_demo', {
  Component: FlowgorithmDemoStep,
  label: 'Flowgorithm (demo/lab)',
})
registerStudioKind('flowgorithm_demo', () => ({
  body: 'Jalankan program ini langkah demi langkah, lalu amati isi variabelnya.',
  program: structuredClone(SAMPLE),
  inputs: ['5', '3'],
  editable: false,
}))
registerStepForm('flowgorithm_demo', FlowgorithmDemoFields)

registerStep('exposure', {
  Component: ExposureStep,
  label: 'Simulator exposure (DKV)',
  isAnswered: (_, value) => Boolean(value),
})
registerStudioKind(
  'exposure',
  () => ({
    text: 'Potret pelari di siang hari. Pelari harus terlihat beku (tidak kabur).',
    image: '',
    target: { aperture: 5.6, shutter: 1 / 500, iso: 200 },
    rules: { slowest_shutter: 1 / 250, max_iso: 800, max_aperture: null, min_aperture: null },
    tolerance: 0.5,
    explanation: '',
  }),
  true,
)
registerStepForm('exposure', ExposureFields)
