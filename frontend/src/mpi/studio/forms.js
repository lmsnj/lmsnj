/** Form Studio milik plugin mapel: jenis langkah -> komponen isian (props { step, set, mediaId }). */
export const PLUGIN_FORMS = {}

export function registerStepForm(kind, Form) {
  PLUGIN_FORMS[kind] = Form
}
