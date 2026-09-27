import { useState } from 'react'
import { getErrorMessage, getFieldErrors } from '../utils/errors'

/**
 * Mengurus state kirim form: sedang mengirim, error per field, dan error umum.
 *
 * const { submit, submitting, errors, generalError } = useFormSubmit(async () => { ... })
 * <form onSubmit={submit}>
 */
export default function useFormSubmit(action) {
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState({})
  const [generalError, setGeneralError] = useState('')

  const submit = async (event) => {
    event?.preventDefault()
    setSubmitting(true)
    setErrors({})
    setGeneralError('')
    try {
      await action()
    } catch (err) {
      const fieldErrors = getFieldErrors(err)
      setErrors(fieldErrors)
      if (fieldErrors.non_field_errors) setGeneralError(fieldErrors.non_field_errors)
      else if (Object.keys(fieldErrors).length === 0) setGeneralError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return { submit, submitting, errors, generalError }
}
