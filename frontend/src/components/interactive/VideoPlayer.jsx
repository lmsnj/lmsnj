import { useEffect, useRef, useState } from 'react'

const TICK_MS = 250
let youtubeApi = null

// Muat YouTube IFrame API sekali untuk seluruh halaman.
function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  youtubeApi ??= new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(window.YT)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => {
      youtubeApi = null // boleh dicoba lagi
      reject(new Error('YouTube tidak bisa dimuat'))
    }
    document.head.appendChild(script)
  })
  return youtubeApi
}

/**
 * Pemutar video YouTube (IFrame API) atau file unggahan (<video>) dengan cara kendali yang sama:
 * - onReady(controls): controls = { play, pause, seek(detik), time(), duration() }
 * - onTick(detik): dipanggil tiap 250 ms selama video diputar
 * - onDuration(detik), onEnded()
 * `children` ditampilkan di atas video (mis. pertanyaan checkpoint). Layar penuh dimatikan agar
 * pertanyaan tidak tertutup.
 */
export default function VideoPlayer({
  source,
  youtubeId,
  src,
  label = 'Video soal',
  onReady,
  onTick,
  onDuration,
  onEnded,
  children,
}) {
  const container = useRef(null)
  const video = useRef(null)
  const callbacks = useRef({})
  const [error, setError] = useState('')

  useEffect(() => {
    callbacks.current = { onReady, onTick, onDuration, onEnded }
  })

  useEffect(() => {
    if (source !== 'youtube' || !youtubeId) return undefined
    let player = null
    let timer = null
    let cancelled = false
    // Elemen dibuat manual: IFrame API mengganti elemennya dengan iframe (bukan milik React).
    const holder = document.createElement('div')
    container.current.appendChild(holder)
    loadYouTube()
      .then((YT) => {
        if (cancelled) return
        player = new YT.Player(holder, {
          videoId: youtubeId,
          host: 'https://www.youtube-nocookie.com',
          width: '100%',
          height: '100%',
          playerVars: { rel: 0, fs: 0, playsinline: 1, modestbranding: 1 },
          events: {
            onReady: () => {
              // Penanda untuk pengawasan ujian: klik di dalam video bukan "membuka jendela lain".
              player.getIframe().setAttribute('data-exam-frame', '')
              const duration = player.getDuration()
              if (duration) callbacks.current.onDuration?.(duration)
              callbacks.current.onReady?.({
                play: () => player.playVideo(),
                pause: () => player.pauseVideo(),
                seek: (time) => player.seekTo(time, true),
                time: () => player.getCurrentTime() ?? 0,
                duration: () => player.getDuration() ?? 0,
              })
              timer = setInterval(() => {
                if (player.getPlayerState() === YT.PlayerState.PLAYING) {
                  callbacks.current.onTick?.(player.getCurrentTime())
                }
              }, TICK_MS)
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.PLAYING) {
                callbacks.current.onDuration?.(player.getDuration())
              }
              if (event.data === YT.PlayerState.ENDED) callbacks.current.onEnded?.()
            },
            onError: () =>
              setError(
                'Video YouTube tidak bisa diputar (mungkin dihapus, privat, atau dibatasi).',
              ),
          },
        })
      })
      .catch(
        () => !cancelled && setError('Pemutar YouTube gagal dimuat. Periksa koneksi internet.'),
      )
    const box = container.current
    return () => {
      cancelled = true
      clearInterval(timer)
      player?.destroy?.()
      box.replaceChildren()
    }
  }, [source, youtubeId])

  useEffect(() => {
    const element = video.current
    if (source !== 'file' || !element) return undefined
    callbacks.current.onReady?.({
      play: () => element.play().catch(() => {}),
      pause: () => element.pause(),
      seek: (time) => {
        element.currentTime = time
      },
      time: () => element.currentTime,
      duration: () => element.duration || 0,
    })
    const timer = setInterval(() => {
      if (!element.paused && !element.ended) callbacks.current.onTick?.(element.currentTime)
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [source, src])

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
      {source === 'youtube' ? (
        <div ref={container} className="absolute inset-0 [&_iframe]:size-full" />
      ) : src ? (
        <video
          ref={video}
          src={src}
          controls
          playsInline
          preload="metadata"
          controlsList="nofullscreen nodownload noplaybackrate"
          disablePictureInPicture
          onContextMenu={(event) => event.preventDefault()}
          onLoadedMetadata={(event) => callbacks.current.onDuration?.(event.currentTarget.duration)}
          onEnded={() => callbacks.current.onEnded?.()}
          onError={() => setError('File video gagal dimuat. Muat ulang halaman lalu coba lagi.')}
          aria-label={label}
          className="absolute inset-0 size-full"
        />
      ) : (
        <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-slate-300">
          Video belum tersedia.
        </p>
      )}
      {error && (
        <p className="absolute inset-x-0 bottom-0 bg-red-600/90 px-3 py-2 text-sm text-white">
          {error}
        </p>
      )}
      {children}
    </div>
  )
}
