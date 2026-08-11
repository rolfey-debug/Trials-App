import { unzipSync, strFromU8 } from 'fflate'

/** Minimal .xlsx reader (no DOM dependency so it also runs under node tests).
 * Returns sheets as arrays of string rows, in workbook order with names. */
export interface SheetData {
  name: string
  rows: string[][]
}

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')

function textOf(siXml: string): string {
  // concatenate all <t> runs
  let out = ''
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(siXml))) out += unescapeXml(m[1])
  return out
}

const colIndex = (ref: string): number => {
  let n = 0
  for (const ch of ref) {
    if (ch >= 'A' && ch <= 'Z') n = n * 26 + (ch.charCodeAt(0) - 64)
    else break
  }
  return n - 1
}

export function readXlsx(data: Uint8Array): SheetData[] {
  const files = unzipSync(data)
  const get = (p: string) => (files[p] ? strFromU8(files[p]) : '')

  const shared: string[] = []
  const ssXml = get('xl/sharedStrings.xml')
  if (ssXml) {
    const re = /<si>([\s\S]*?)<\/si>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(ssXml))) shared.push(textOf(m[1]))
  }

  const wb = get('xl/workbook.xml')
  const names: string[] = []
  {
    const re = /<sheet\s[^>]*name="([^"]*)"[^>]*\/?>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(wb))) names.push(unescapeXml(m[1]))
  }

  const sheets: SheetData[] = []
  for (let i = 0; i < names.length; i++) {
    const xml = get(`xl/worksheets/sheet${i + 1}.xml`)
    const rows: string[][] = []
    const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g
    let rm: RegExpExecArray | null
    while ((rm = rowRe.exec(xml))) {
      const cells: string[] = []
      const cellRe = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
      let cm: RegExpExecArray | null
      while ((cm = cellRe.exec(rm[1]))) {
        const attrs = cm[1]
        const inner = cm[2] ?? ''
        const refM = /r="([A-Z]+)\d+"/.exec(attrs)
        const idx = refM ? colIndex(refM[1]) : cells.length
        const type = /t="(\w+)"/.exec(attrs)?.[1]
        let val = ''
        if (type === 'inlineStr') val = textOf(inner)
        else {
          const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? ''
          val = type === 's' ? shared[Number(v)] ?? '' : unescapeXml(v)
        }
        while (cells.length < idx) cells.push('')
        cells[idx] = val
      }
      rows.push(cells)
    }
    sheets.push({ name: names[i], rows })
  }
  return sheets
}
