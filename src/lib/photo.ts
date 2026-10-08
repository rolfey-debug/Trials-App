import { idb } from '../store/idb'
import type { PhotoMeta } from '../store/types'

/** Compress a captured image to ~300 KB (max 1280 px, JPEG q0.72) and store it
 * locally; full-res upload is a Wi-Fi sync job for the portal (Storage rules). */
export async function compressAndStore(id: string, file: File): Promise<{ sizeKB: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.72)
    )
    await idb.putPhoto(id, blob)
    return { sizeKB: Math.round(blob.size / 1024) }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function photoUrl(id: string): Promise<string | null> {
  const blob = await idb.getPhoto(id)
  return blob ? URL.createObjectURL(blob) : null
}

/** Render a copy of a stored photo with the plot details burned in along the
 * bottom, then hand it to the phone — the share sheet where the browser has
 * one (iOS: Save Image → camera roll), a plain download otherwise. The stored
 * original is untouched: photos are trial evidence. */
export async function saveWatermarked(p: PhotoMeta, trialName: string): Promise<'ok' | 'missing' | 'failed'> {
  const blob = await idb.getPhoto(p.id)
  if (!blob) return 'missing'
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)

    const bar = Math.max(40, Math.round(canvas.height * 0.09))
    const pad = Math.round(bar * 0.22)
    const big = Math.round(bar * 0.36)
    const small = Math.round(bar * 0.26)
    ctx.fillStyle = 'rgba(15,15,15,0.68)'
    ctx.fillRect(0, canvas.height - bar, canvas.width, bar)
    ctx.fillStyle = '#fff'
    ctx.font = `700 ${big}px -apple-system, system-ui, sans-serif`
    ctx.fillText(`Plot ${p.pid} · T${p.trt} — ${trialName}`, pad, canvas.height - bar + pad + big * 0.82, canvas.width - 2 * pad)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = `400 ${small}px -apple-system, system-ui, sans-serif`
    const gps = p.lat != null && p.lng != null ? ` · ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : ''
    ctx.fillText(`${p.date}${gps}`, pad, canvas.height - pad * 0.6, canvas.width - 2 * pad)

    const out = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85)
    )
    const file = new File([out], `plot-${p.pid}-${p.date}.jpg`, { type: 'image/jpeg' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `Plot ${p.pid}` })
    } else {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(out)
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
    }
    return 'ok'
  } catch (e) {
    // user closing the share sheet is not a failure
    return (e as Error).name === 'AbortError' ? 'ok' : 'failed'
  } finally {
    URL.revokeObjectURL(url)
  }
}
