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

/** Render a stored photo into a watermarked File (plot, treatment, trial,
 * date, GPS burned along the bottom). The stored original is untouched:
 * photos are trial evidence. */
export async function watermarkFile(p: PhotoMeta, trialName: string): Promise<File | null> {
  const blob = await idb.getPhoto(p.id)
  if (!blob) return null
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
    return new File([out], `plot-${p.pid}-${p.date}-${p.id.slice(-4)}.jpg`, { type: 'image/jpeg' })
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Hand files to the phone: the share sheet where the browser has one
 * (iOS: Save Images → camera roll), plain downloads otherwise. */
async function handOff(files: File[], title: string): Promise<'ok' | 'failed'> {
  try {
    if (navigator.canShare?.({ files })) {
      await navigator.share({ files, title })
    } else {
      for (const f of files) {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(f)
        a.download = f.name
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(a.href)
      }
    }
    return 'ok'
  } catch (e) {
    // the user closing the share sheet is not a failure
    return (e as Error).name === 'AbortError' ? 'ok' : 'failed'
  }
}

/** Save one photo to the phone, watermarked. */
export async function saveWatermarked(p: PhotoMeta, trialName: string): Promise<'ok' | 'missing' | 'failed'> {
  const file = await watermarkFile(p, trialName)
  if (!file) return 'missing'
  return handOff([file], `Plot ${p.pid}`)
}

/** Save many photos to the phone in share-sheet-sized batches (iOS: Save
 * Images puts the whole batch in the camera roll). Returns how many files
 * were handed over. */
export async function saveAllWatermarked(
  photos: PhotoMeta[],
  trialName: string,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const stored = photos.filter((p) => p.stored)
  const BATCH = 12
  let handed = 0
  for (let i = 0; i < stored.length; i += BATCH) {
    const files: File[] = []
    for (const p of stored.slice(i, i + BATCH)) {
      const f = await watermarkFile(p, trialName)
      if (f) files.push(f)
    }
    if (!files.length) continue
    const res = await handOff(files, `${trialName} — plot photos`)
    if (res === 'failed') break
    handed += files.length
    onProgress?.(Math.min(i + BATCH, stored.length), stored.length)
  }
  return handed
}
