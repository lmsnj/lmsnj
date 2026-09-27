// Ambil ID video YouTube dari berbagai bentuk URL:
// youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, youtube.com/shorts/ID
export function getYoutubeId(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const host = parsed.hostname.replace(/^(www\.|m\.)/, '')
  let id = null
  if (host === 'youtu.be') id = parsed.pathname.slice(1)
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = parsed.searchParams.get('v')
    const match = parsed.pathname.match(/^\/(embed|shorts|live)\/([^/]+)/)
    if (match) id = match[2]
  }
  return id && /^[\w-]{6,20}$/.test(id) ? id : null
}

export function youtubeEmbedUrl(url) {
  const id = getYoutubeId(url)
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
}

// Picu unduhan file dari Blob dengan nama tertentu.
export function saveBlob(blobUrl, filename) {
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function formatDate(value) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}
