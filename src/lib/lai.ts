/** Leaf area index from a downward canopy photo.
 *
 * Two steps, both on-device:
 *  1. Fractional green canopy cover — per-pixel colour classification using
 *     the Canopeo criteria (Patrignani & Ochsner 2015): a pixel is canopy when
 *     red/green and blue/green are both below ~0.95 and the excess-green index
 *     (2G − R − B) clears a noise floor. Robust against soil, stubble and
 *     senesced leaf, which fail the ratio tests.
 *  2. Cover → LAI by Beer's law gap-fraction inversion: LAI = −ln(1 − FC) / k
 *     with k = 0.5 (spherical leaf angle distribution — the standard default
 *     for cereals). Cover saturates as the canopy closes, so above ~95% cover
 *     the inversion is flagged unreliable rather than trusted.
 *
 * The pixel math is pure (typed arrays in, numbers out) so the tests can run
 * it in Node; only `analyzeCanopyPhoto` touches the DOM.
 */

export const LAI_K = 0.5
export const LAI_MAX = 9.9

export function isCanopyPixel(r: number, g: number, b: number): boolean {
  if (g === 0) return false
  return r / g < 0.95 && b / g < 0.95 && 2 * g - r - b > 20
}

export interface CanopyStats {
  fraction: number
  canopy: number
  total: number
}

/** Fraction of canopy pixels in RGBA image data; fills `mask` (1 byte/pixel) when given. */
export function canopyStats(rgba: Uint8ClampedArray, mask?: Uint8Array): CanopyStats {
  const total = rgba.length >> 2
  let canopy = 0
  for (let i = 0; i < total; i++) {
    const o = i << 2
    if (isCanopyPixel(rgba[o], rgba[o + 1], rgba[o + 2])) {
      canopy++
      if (mask) mask[i] = 1
    }
  }
  return { fraction: total ? canopy / total : 0, canopy, total }
}

/** Beer's law inversion, one decimal, capped; saturated = canopy effectively closed. */
export function laiFromCover(fc: number, k = LAI_K): { lai: number; saturated: boolean } {
  const clamped = Math.min(Math.max(fc, 0), 0.99)
  const lai = Math.min(LAI_MAX, Math.round((-Math.log(1 - clamped) / k) * 10) / 10)
  return { lai, saturated: fc >= 0.95 }
}

/** EFTPOS-style fixed-point entry for the keypad: digits accumulate as tenths
 * ("3" → 0.3, then "4" → 3.4). Returns the new value, capped at LAI_MAX. */
export function laiKeyDigit(cur: number | undefined, d: number): number {
  const tenths = Math.round((cur ?? 0) * 10)
  return Math.min(LAI_MAX, (tenths * 10 + d) / 10)
}

/** Backspace for the fixed-point entry; undefined clears the field. */
export function laiBackspace(cur: number | undefined): number | undefined {
  const tenths = Math.round((cur ?? 0) * 10)
  const next = Math.floor(tenths / 10)
  return next > 0 ? next / 10 : undefined
}

export interface CanopyAnalysis {
  fraction: number
  lai: number
  saturated: boolean
  /** small preview with the classified canopy tinted green, as a data URL */
  thumb: string
}

/** Analyse a captured photo: downscale, classify, build the overlay preview. */
export async function analyzeCanopyPhoto(file: File): Promise<CanopyAnalysis> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    // 320 px is plenty: cover is a ratio, and small keeps analysis instant.
    const scale = Math.min(1, 320 / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h)
    const mask = new Uint8Array(w * h)
    const stats = canopyStats(data.data, mask)

    // Overlay: dim everything, tint classified canopy green — the assessor can
    // see at a glance whether the classification is believable.
    const px = data.data
    for (let i = 0; i < mask.length; i++) {
      const o = i << 2
      if (mask[i]) {
        px[o] = px[o] * 0.25
        px[o + 1] = Math.min(255, px[o + 1] * 0.45 + 130)
        px[o + 2] = px[o + 2] * 0.25
      } else {
        px[o] = px[o] * 0.55
        px[o + 1] = px[o + 1] * 0.55
        px[o + 2] = px[o + 2] * 0.55
      }
    }
    ctx.putImageData(data, 0, 0)
    const { lai, saturated } = laiFromCover(stats.fraction)
    return { fraction: stats.fraction, lai, saturated, thumb: canvas.toDataURL('image/jpeg', 0.7) }
  } finally {
    URL.revokeObjectURL(url)
  }
}
