import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '../utils/errors'

/**
 * Memuat data dari API dan memuat ulang otomatis saat `params` berubah.
 *
 * const { data, loading, error, reload } = useFetch(usersApi.list, { page: 1 })
 *
 * Respons lama diabaikan jika params sudah berubah sebelum respons datang,
 * sehingga hasil pencarian lama tidak menimpa hasil yang baru.
 */
export default function useFetch(fetcher, params = null) {
  const [state, setState] = useState({ data: null, error: '', loadedKey: null })
  const [reloadCount, setReloadCount] = useState(0)

  // Simpan fetcher terbaru tanpa memicu request ulang setiap render.
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  const paramsJson = JSON.stringify(params)
  const requestKey = `${paramsJson}#${reloadCount}`

  useEffect(() => {
    let ignore = false
    fetcherRef
      .current(JSON.parse(paramsJson))
      .then((data) => !ignore && setState({ data, error: '', loadedKey: requestKey }))
      .catch(
        (err) =>
          !ignore &&
          setState((prev) => ({ ...prev, error: getErrorMessage(err), loadedKey: requestKey })),
      )
    return () => {
      ignore = true
    }
  }, [paramsJson, requestKey])

  const reload = useCallback(() => setReloadCount((count) => count + 1), [])

  return {
    data: state.data,
    error: state.error,
    loading: state.loadedKey !== requestKey,
    reload,
  }
}
