import { unzlibSync, inflateSync } from 'fflate'

/** Lightweight PDF text extraction: scans content streams (Flate / ASCII85+Flate),
 * pulls string-show operators in order. Covers the report-style PDFs trial teams
 * produce (ReportLab, Excel print-to-PDF); scanned maps would need the portal's OCR. */

function ascii85Decode(s: string): Uint8Array {
  const out: number[] = []
  let tuple = 0
  let count = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '~') break
    if (ch === 'z' && count === 0) {
      out.push(0, 0, 0, 0)
      continue
    }
    const c = ch.charCodeAt(0)
    if (c < 33 || c > 117) continue // whitespace / out of range
    tuple = tuple * 85 + (c - 33)
    count++
    if (count === 5) {
      out.push((tuple >>> 24) & 0xff, (tuple >>> 16) & 0xff, (tuple >>> 8) & 0xff, tuple & 0xff)
      tuple = 0
      count = 0
    }
  }
  if (count > 0) {
    for (let i = count; i < 5; i++) tuple = tuple * 85 + 84
    const bytes = [(tuple >>> 24) & 0xff, (tuple >>> 16) & 0xff, (tuple >>> 8) & 0xff, tuple & 0xff]
    out.push(...bytes.slice(0, count - 1))
  }
  return Uint8Array.from(out)
}

/** WinAnsi (CP1252) upper-half characters that matter for these documents. */
const WINANSI: Record<number, string> = {
  0x85: '…', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”',
  0x96: '–', 0x97: '—', 0xb0: '°', 0xb2: '²', 0xd7: '×',
}
const decodeByte = (b: number) => WINANSI[b] ?? String.fromCharCode(b)

/** Pull PDF literal strings out of a decompressed content stream, in order. */
function extractStrings(content: Uint8Array): string[] {
  const parts: string[] = []
  let i = 0
  while (i < content.length) {
    if (content[i] === 0x28 /* ( */) {
      let depth = 1
      let s = ''
      i++
      while (i < content.length && depth > 0) {
        const b = content[i]
        if (b === 0x5c /* \ */) {
          const n = content[i + 1]
          if (n >= 0x30 && n <= 0x37) {
            // octal escape, up to 3 digits
            let oct = 0
            let j = i + 1
            let d = 0
            while (j < content.length && d < 3 && content[j] >= 0x30 && content[j] <= 0x37) {
              oct = oct * 8 + (content[j] - 0x30)
              j++
              d++
            }
            s += decodeByte(oct)
            i = j
            continue
          }
          const map: Record<number, string> = { 0x6e: '\n', 0x72: '\r', 0x74: '\t', 0x28: '(', 0x29: ')', 0x5c: '\\' }
          s += map[n] ?? decodeByte(n)
          i += 2
          continue
        }
        if (b === 0x28) depth++
        else if (b === 0x29) {
          depth--
          if (depth === 0) break
        }
        if (depth > 0) s += decodeByte(b)
        i++
      }
      parts.push(s)
    }
    i++
  }
  return parts
}

const latin1 = (u: Uint8Array) => {
  let s = ''
  for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768))
  return s
}

export function pdfTextItems(data: Uint8Array): string[] {
  const raw = latin1(data)
  const items: string[] = []
  const re = /stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length
    const end = raw.indexOf('endstream', start)
    if (end < 0) break
    let chunk = raw.slice(start, end).replace(/[\r\n]+$/, '')
    const bytes = Uint8Array.from(chunk, (c) => c.charCodeAt(0) & 0xff)
    let dec: Uint8Array | null = null
    for (const attempt of [
      () => unzlibSync(ascii85Decode(chunk)),
      () => unzlibSync(bytes),
      () => inflateSync(bytes),
    ]) {
      try {
        dec = attempt()
        break
      } catch {
        /* next */
      }
    }
    if (!dec) continue
    items.push(...extractStrings(dec))
    re.lastIndex = end
  }
  return items
}
