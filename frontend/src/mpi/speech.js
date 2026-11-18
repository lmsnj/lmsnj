// "Bacakan" memakai suara bawaan perangkat (Web Speech API), tanpa layanan luar dan tanpa kuota.

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function speak(text, { onEnd } = {}) {
  if (!canSpeak() || !text) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'id-ID'
  utterance.rate = 0.95
  const voice = window.speechSynthesis
    .getVoices()
    .find((v) => v.lang?.toLowerCase().startsWith('id'))
  if (voice) utterance.voice = voice
  utterance.onend = () => onEnd?.()
  utterance.onerror = () => onEnd?.()
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel()
}
