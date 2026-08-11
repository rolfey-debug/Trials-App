import { idb } from '../store/idb'

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
