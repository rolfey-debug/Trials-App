/** A printable satellite map: Esri World Imagery tiles laid out as plain
 * images with an SVG overlay for plot polygons, labels, a north arrow and a
 * scale bar. No Leaflet, so it renders inside a printout and a PDF. Web
 * Mercator maths is the usual tile arithmetic; tested in test/sitemap.test.ts. */
import type { LatLng } from '../../../shared/geometry'

export interface MapPolygon {
  ring: LatLng[]
  fill: string
  stroke?: string
  label?: string
  /** 0..1 fill opacity */
  opacity?: number
  title?: string
}

export interface MapOptions {
  /** Output width in CSS px; height follows the bounds. */
  width?: number
  maxHeight?: number
  /** Extra metres around the content. */
  padM?: number
  /** Pin markers (site centre, gate). */
  pins?: Array<{ at: LatLng; label: string; colour?: string }>
  /** Fixed zoom; otherwise the largest that fits (18 at most, Esri's rural limit). */
  zoom?: number
  /** Tiles may be enlarged up to this factor so a small block still fills the width (default 3). */
  maxScale?: number
  /** Open lines (tracks, fences, power lines). */
  lines?: Array<{ pts: LatLng[]; colour?: string; label?: string; dash?: boolean }>
  /** Credit line drawn in the corner; an empty string leaves it off (put it in a caption instead). */
  attribution?: string
  tileUrl?: (z: number, x: number, y: number) => string
}

const TILE = 256
const RAD = Math.PI / 180

export function lngToX(lng: number, z: number): number {
  return ((lng + 180) / 360) * 2 ** z
}
export function latToY(lat: number, z: number): number {
  const s = Math.sin(lat * RAD)
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z
}
/** Ground metres per pixel at a latitude and zoom. */
export function metresPerPixel(lat: number, z: number): number {
  return (156543.03392 * Math.cos(lat * RAD)) / 2 ** z
}

export function bounds(points: LatLng[]): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }
  return { minLat, maxLat, minLng, maxLng }
}

const esriTile = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`

/** Pick the largest zoom (≤ 18) at which the padded bounds fit the width. */
export function fitZoom(b: ReturnType<typeof bounds>, widthPx: number, maxHeightPx: number, padM: number): number {
  const midLat = (b.minLat + b.maxLat) / 2
  for (let z = 18; z >= 12; z--) {
    const mpp = metresPerPixel(midLat, z)
    const w = (lngToX(b.maxLng, z) - lngToX(b.minLng, z)) * TILE + (2 * padM) / mpp
    const h = (latToY(b.minLat, z) - latToY(b.maxLat, z)) * TILE + (2 * padM) / mpp
    if (w <= widthPx && h <= maxHeightPx) return z
  }
  return 12
}

const esc = (v: string | number) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The map as HTML: tiles, overlay, scale bar, north arrow, attribution. */
export function satelliteMapHtml(polygons: MapPolygon[], o: MapOptions = {}): string {
  const width = o.width ?? 700
  const maxHeight = o.maxHeight ?? 520
  const padM = o.padM ?? 25
  const pts = [...polygons.flatMap((p) => p.ring), ...(o.pins ?? []).map((p) => p.at), ...(o.lines ?? []).flatMap((l) => l.pts)]
  if (!pts.length) return ''
  const b = bounds(pts)
  const midLat = (b.minLat + b.maxLat) / 2
  const z = o.zoom ?? fitZoom(b, width, maxHeight, padM)
  const mpp = metresPerPixel(midLat, z)
  const padPx = padM / mpp
  // content box in world pixels at zoom z
  const x0 = lngToX(b.minLng, z) * TILE - padPx
  const x1 = lngToX(b.maxLng, z) * TILE + padPx
  const y0 = latToY(b.maxLat, z) * TILE - padPx
  const y1 = latToY(b.minLat, z) * TILE + padPx
  const cw = Math.max(1, x1 - x0)
  const ch = Math.max(1, y1 - y0)
  // fit the content to the requested box; small blocks are enlarged (blurrier tiles, readable plots)
  const scale = Math.min(width / cw, maxHeight / ch, o.maxScale ?? 3)
  const W = Math.round(cw * scale)
  const H = Math.round(ch * scale)
  const toPx = (p: LatLng) => ({ x: (lngToX(p.lng, z) * TILE - x0) * scale, y: (latToY(p.lat, z) * TILE - y0) * scale })
  const tx0 = Math.floor(x0 / TILE)
  const tx1 = Math.floor(x1 / TILE)
  const ty0 = Math.floor(y0 / TILE)
  const ty1 = Math.floor(y1 / TILE)
  const tile = o.tileUrl ?? esriTile
  const tiles: string[] = []
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      const left = (tx * TILE - x0) * scale
      const top = (ty * TILE - y0) * scale
      tiles.push(`<img src="${esc(tile(z, tx, ty))}" alt="" style="position:absolute;left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;width:${(TILE * scale).toFixed(2)}px;height:${(TILE * scale).toFixed(2)}px;display:block">`)
    }
  const FONT = 'font-family="Mulish, Arial, sans-serif"'
  const polys = polygons.map((p) => {
    const px = p.ring.map((q) => toPx(q))
    const d = px.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')
    const cx = px.reduce((a, q) => a + q.x, 0) / px.length
    const cy = px.reduce((a, q) => a + q.y, 0) / px.length
    // label along the longer side so a 2 × 12 m plot still carries its number
    const e1 = px.length > 1 ? { x: px[1].x - px[0].x, y: px[1].y - px[0].y } : { x: 1, y: 0 }
    const e2 = px.length > 2 ? { x: px[2].x - px[1].x, y: px[2].y - px[1].y } : { x: 0, y: 1 }
    const l1 = Math.hypot(e1.x, e1.y)
    const l2 = Math.hypot(e2.x, e2.y)
    const long = l1 >= l2 ? e1 : e2
    const longPx = Math.max(l1, l2)
    const shortPx = Math.min(l1, l2)
    let ang = (Math.atan2(long.y, long.x) * 180) / Math.PI
    if (ang > 90) ang -= 180
    if (ang < -90) ang += 180
    const fs = Math.max(5, Math.min(9, shortPx * 0.85, longPx / Math.max(2, (p.label ?? '').length) / 0.62))
    const show = p.label && longPx >= 12 && shortPx >= 5
    return `<polygon points="${d}" fill="${esc(p.fill)}" fill-opacity="${p.opacity ?? 0.55}" stroke="${esc(p.stroke ?? '#ffffff')}" stroke-width="0.8">${p.title ? `<title>${esc(p.title)}</title>` : ''}</polygon>${show ? `<text transform="translate(${cx.toFixed(1)},${cy.toFixed(1)}) rotate(${ang.toFixed(1)})" y="${(fs * 0.35).toFixed(1)}" text-anchor="middle" font-size="${fs.toFixed(1)}" font-weight="700" fill="#fff" stroke="#000" stroke-width="${(fs / 4).toFixed(1)}" paint-order="stroke" ${FONT}>${esc(p.label!)}</text>` : ''}`
  })
  const lines = (o.lines ?? []).map((l) => {
    const px = l.pts.map((q) => toPx(q))
    const d = px.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')
    const mid = px[Math.floor(px.length / 2)]
    return `<polyline points="${d}" fill="none" stroke="${esc(l.colour ?? '#F2A900')}" stroke-width="2"${l.dash ? ' stroke-dasharray="6 4"' : ''}/>${l.label && mid ? `<text x="${(mid.x + 4).toFixed(1)}" y="${(mid.y - 4).toFixed(1)}" font-size="9" font-weight="700" fill="#fff" stroke="#000" stroke-width="2" paint-order="stroke" ${FONT}>${esc(l.label)}</text>` : ''}`
  })
  const pins = (o.pins ?? []).map((p) => {
    const q = toPx(p.at)
    return `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="5" fill="${esc(p.colour ?? '#F2A900')}" stroke="#fff" stroke-width="2"/><text x="${(q.x + 8).toFixed(1)}" y="${(q.y + 4).toFixed(1)}" font-size="10" font-weight="700" fill="#fff" stroke="#000" stroke-width="2.5" paint-order="stroke" font-family="Mulish, Arial, sans-serif">${esc(p.label)}</text>`
  })
  // scale bar: a round number of metres that is 60–140 px long
  const nice = [10, 20, 25, 50, 100, 200, 250, 500, 1000]
  const barM = nice.find((m) => m / (mpp / scale) >= 60) ?? 1000
  const barPx = barM / (mpp / scale)
  return `<div style="position:relative;width:${W}px;height:${H}px;overflow:hidden;border-radius:6px;background:#1f2a1f;break-inside:avoid">
    ${tiles.join('')}
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0">
      ${polys.join('')}${lines.join('')}${pins.join('')}
      <g transform="translate(${W - 36},34)"><polygon points="0,-18 6,6 0,2 -6,6" fill="#fff" stroke="#000" stroke-width="1"/><text x="0" y="22" text-anchor="middle" font-size="10" font-weight="800" fill="#fff" stroke="#000" stroke-width="2" paint-order="stroke" font-family="Mulish, Arial, sans-serif">N</text></g>
      <g transform="translate(12,${H - 16})"><rect x="0" y="0" width="${barPx.toFixed(1)}" height="4" fill="#fff" stroke="#000" stroke-width="1"/><text x="${(barPx / 2).toFixed(1)}" y="-4" text-anchor="middle" font-size="10" font-weight="700" fill="#fff" stroke="#000" stroke-width="2" paint-order="stroke" font-family="Mulish, Arial, sans-serif">${barM} m</text></g>
      ${o.attribution === '' ? '' : `<text x="${W - 6}" y="${H - 5}" text-anchor="end" font-size="8" fill="#fff" stroke="#000" stroke-width="1.5" paint-order="stroke" font-family="Mulish, Arial, sans-serif">${esc(o.attribution ?? 'Imagery © Esri, Maxar, Earthstar Geographics')}</text>`}
    </svg>
  </div>`
}
