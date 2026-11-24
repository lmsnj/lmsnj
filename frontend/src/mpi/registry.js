/**
 * Registri komponen jenis langkah. Pasangan dari `backend/apps/learning_media/steps.py::KINDS`.
 *
 * Plugin mapel (mis. Flowgorithm) mendaftarkan jenis langkahnya sendiri:
 *   registerStep('fc_run', { Component, isAnswered: (step, value) => ..., label: 'Isi lalu jalankan' })
 * Component menerima { step, value, onChange, review, user, mascot }; onChange kosong = hanya baca.
 */
import { isAnswered as defaultAnswered } from './engine'
import {
  DialogStep,
  DidYouKnowStep,
  FlashcardsStep,
  FlipCardsStep,
  LinkStep,
  TextStep,
  VideoStep,
  WorkedExampleStep,
} from './steps/ExplainSteps'
import { EmbedStep, EmbedTaskStep } from './steps/EmbedSteps'
import { SimulationStep } from './steps/SimulationStep'
import {
  CategorizeStep,
  ChoiceStep,
  HotspotStep,
  InteractiveStep,
  OrderingStep,
  TrueFalseStep,
} from './steps/PracticeSteps'

const STEPS = {
  text: { Component: TextStep, label: 'Teks & gambar' },
  did_you_know: { Component: DidYouKnowStep, label: 'Tahukah kamu?' },
  dialog: { Component: DialogStep, label: 'Dialog maskot' },
  video: { Component: VideoStep, label: 'Video' },
  link: { Component: LinkStep, label: 'Tautan' },
  embed: { Component: EmbedStep, label: 'Konten HTML5/H5P' },
  simulation: { Component: SimulationStep, label: 'Simulasi' },
  flip_cards: { Component: FlipCardsStep, label: 'Kartu bolak-balik' },
  flashcards: { Component: FlashcardsStep, label: 'Flashcard' },
  worked_example: { Component: WorkedExampleStep, label: 'Contoh langkah demi langkah' },
  choice: { Component: ChoiceStep, label: 'Pilihan ganda' },
  true_false: { Component: TrueFalseStep, label: 'Benar / salah' },
  ordering: { Component: OrderingStep, label: 'Urutkan langkah' },
  categorize: { Component: CategorizeStep, label: 'Kelompokkan' },
  hotspot: { Component: HotspotStep, label: 'Ketuk bagian gambar' },
  fill_blank: { Component: InteractiveStep, label: 'Isian rumpang' },
  drag_drop: { Component: InteractiveStep, label: 'Tarik & lepas' },
  matching: { Component: InteractiveStep, label: 'Pasangkan' },
  embed_task: {
    Component: EmbedTaskStep,
    label: 'Tugas HTML5/H5P',
    isAnswered: (_, value) => value?.completed === true,
  },
}

export function registerStep(kind, definition) {
  STEPS[kind] = definition
}

export function stepDefinition(kind) {
  return STEPS[kind] ?? null
}

export function answered(step, value) {
  const custom = STEPS[step.kind]?.isAnswered
  return custom ? custom(step, value) : defaultAnswered(step, value)
}
