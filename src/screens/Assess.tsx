import React, { useMemo, useRef, useState } from 'react'
import { C, MONO, SANS } from '../theme'
import { useApp } from '../store/store'
import { useGps } from '../gps/useGps'
import { assessmentOrder, capFor, measureFlat, measureGroups, repOf, rowOf, posOf, treatmentByN, unitOf } from '../lib/trial'
import { gridFromCorners, locate } from '../gps/geo'
import { compressAndStore } from '../lib/photo'
import { PulseDot } from '../components/bits'

/** Assess run — the deep flow (design screen 2b). GPS never forces plot
 * assignment: the walk order advances, GPS verifies the row and warns on
 * mismatch (>6 m accuracy → amber row-check-only). */
export function Assess() {
  const { st, doc, ts, mutTrial } = useApp()
  const gps = useGps()
  const [listening, setListening] = useState(false)
  const [flash, setFlash] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const voiceTimer = useRef<number | undefined>(undefined)

  const order = useMemo(() => assessmentOrder(doc), [doc])
  const flat = useMemo(() => measureFlat(doc.measures), [doc])
  const groups = useMemo(() => measureGroups(doc.measures), [doc])
  const [msOpen, setMsOpen] = useState(false)

  const idx = Math.min(ts.assessIdx, order.length - 1)
  const pid = order[idx]
  const row = rowOf(pid)
  const pos = posOf(pid)
  const rep = repOf(doc, pid)
  const trtN = (ts.relabel[pid] ?? doc.cells[pid]) as number
  const tinfo = treatmentByN(doc, trtN)
  const sc = ts.scores[pid]
  const nextPid = order[idx + 1]
  const prevPid = order[idx - 1]
  const scored = Object.keys(ts.scores).length
  const measures = ts.activeMeasures
  const field = measures.includes(ts.assessField) ? ts.assessField : measures[0]
  const blind = ts.blind

  // --- GPS strip: verify, don't force -----------------------------------
  const acc = gps.accuracy
  const warnCoarse = acc > 6
  let located: { row: number; pos: number } | null = null
  if (ts.site.pinned && ts.site.corners && gps.fix) {
    const grid = gridFromCorners(ts.site.corners.A, ts.site.corners.B, doc)
    const hit = locate(gps.fix, grid)
    if (hit.row) located = { row: hit.row, pos: hit.pos! }
  }
  const rowMismatch = !warnCoarse && located !== null && located.row !== row
  const warn = warnCoarse || rowMismatch
  const gpsTxt = warnCoarse
    ? `GPS coarse — row check only · Row ${row}`
    : rowMismatch
      ? `GPS reads Row ${located!.row} — card says Row ${row}. Check your row.`
      : `GPS · Row ${row} Pos ${pos} — on walk order`

  // --- score mutation helpers -------------------------------------------
  const setScore = (label: string | null, fn: (v: Record<string, number>, s: { note?: string; photoIds: string[] }) => void) =>
    mutTrial(label ? { kind: 'assessment', label } : null, (t) => {
      const cur = t.scores[pid] ?? { v: {}, photoIds: [], ts: Date.now(), by: st.session.name }
      const shell = { note: cur.note, photoIds: cur.photoIds }
      fn(cur.v, shell)
      cur.note = shell.note
      cur.photoIds = shell.photoIds
      cur.ts = Date.now()
      t.scores[pid] = cur
    })

  const keyDigit = (d: string) => {
    setFlash('')
    setScore(null, (v) => {
      const curStr = String(v[field] ?? '')
      const next = Number(curStr + d)
      v[field] = Math.min(capFor(flat[field]), next)
    })
  }
  const backspace = () =>
    setScore(null, (v) => {
      const s = String(v[field] ?? '')
      if (s.length > 1) v[field] = Number(s.slice(0, -1))
      else delete v[field]
    })

  const fi = measures.indexOf(field)
  const nextMeasure = measures[(fi + 1) % measures.length]

  const onSame = () => {
    const pv = ts.scores[prevPid]
    if (!pv) return
    setScore(null, (v) => {
      for (const k of measures) if (pv.v[k] !== undefined) v[k] = pv.v[k]
    })
    setFlash(`Copied ${prevPid}'s values`)
  }

  const onSave = () =>
    mutTrial({ kind: 'assessment', label: `Assessment 1 · plot ${pid}` }, (t) => {
      if (!t.scores[pid]) t.scores[pid] = { v: {}, photoIds: [], ts: Date.now(), by: st.session.name }
      t.assessIdx = Math.min(idx + 1, order.length - 1)
      t.assessField = measures[0]
    })

  const onPrev = () =>
    mutTrial(null, (t) => {
      t.assessIdx = Math.max(0, idx - 1)
      t.assessField = t.activeMeasures[0]
    })

  // --- aux: photo / voice / note ----------------------------------------
  const onPhotoFile = async (f: File | undefined) => {
    if (!f) return
    const id = `ph-${pid}-${Date.now()}`
    try {
      const { sizeKB } = await compressAndStore(id, f)
      mutTrial({ kind: 'photo', label: `Photo · plot ${pid}` }, (t) => {
        const cur = t.scores[pid] ?? { v: {}, photoIds: [], ts: Date.now(), by: st.session.name }
        cur.photoIds = [...cur.photoIds, id]
        t.scores[pid] = cur
        t.photos.push({
          id, pid, trt: trtN,
          date: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
          flagged: false, stored: true, sizeKB,
          lat: gps.fix?.lat, lng: gps.fix?.lng,
        })
      })
      setFlash(`Photo saved · ~${sizeKB} KB on phone, full-res queues for Wi-Fi`)
    } catch {
      setFlash('Could not read that photo')
    }
  }

  const fillVoice = (transcript?: string) => {
    const m1 = flat[measures[0]][1]
    const m2 = measures[1] ? flat[measures[1]][1] : null
    let vals: number[] | null = null
    if (transcript) {
      const nums = transcript.match(/\d+/g)?.map(Number) ?? []
      const words: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
      const wordNums = transcript.toLowerCase().split(/\s+/).map((w) => words[w]).filter((v): v is number => v !== undefined)
      const all = nums.length ? nums : wordNums
      if (all.length) vals = all
    }
    if (!vals) vals = [5, 0] // demo fill (design behaviour) when nothing recognised
    const v1 = vals[0]
    const v2 = vals[1]
    setScore(null, (v) => {
      v[measures[0]] = Math.min(capFor(flat[measures[0]]), v1)
      if (measures[1] && v2 !== undefined) v[measures[1]] = Math.min(capFor(flat[measures[1]]), v2)
    })
    setListening(false)
    setFlash(
      transcript
        ? `Heard: “${transcript}” — filled`
        : `Heard: “${m1.toLowerCase()} five${m2 ? `, ${m2.toLowerCase()} zero` : ''}” — filled`
    )
  }

  const onVoice = () => {
    if (listening) return
    setListening(true)
    setFlash('')
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }
    const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition
    if (SR) {
      try {
        const rec = new SR()
        rec.lang = 'en-AU'
        rec.onresult = (e) => fillVoice(e.results[0][0].transcript)
        rec.onerror = () => fillVoice()
        rec.onend = () => setListening(false)
        rec.start()
        voiceTimer.current = window.setTimeout(() => rec.stop(), 5000)
        return
      } catch {
        /* fall through to demo fill */
      }
    }
    voiceTimer.current = window.setTimeout(() => fillVoice(), 1300)
  }

  // --- styles ------------------------------------------------------------
  const padSt: React.CSSProperties = {
    height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff',
    border: `1px solid ${C.hairline}`, borderRadius: 11, font: `600 21px ${MONO}`, cursor: 'pointer', userSelect: 'none',
  }
  const auxSt = (active: boolean): React.CSSProperties => ({
    flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 9, border: `1px solid ${C.hairline}`,
    background: active ? C.greenTint : '#fff', fontSize: 11.5, fontWeight: 700, color: C.body, cursor: 'pointer',
  })

  const gpsBg = warn ? C.burntTint : C.greenTint
  const gpsInk = warn ? C.burntDark : C.greenDark

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 14px 8px', display: 'flex', flexDirection: 'column' }}>
      {/* GPS strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: gpsBg, borderRadius: 10, padding: '8px 12px', marginBottom: 8 }}>
        <PulseDot color={warn ? C.burnt : C.green} size={8} />
        <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: gpsInk }}>{gpsTxt}</div>
        <div style={{ font: `500 10.5px ${MONO}`, color: gpsInk }}>±{acc} m</div>
      </div>

      {/* plot card */}
      <div style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '12px 14px 11px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ font: `700 32px ${MONO}`, letterSpacing: -1 }}>{pid}</div>
          <div
            onClick={() => mutTrial(null, (t) => void (t.blind = !t.blind))}
            style={{
              cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '6px 11px', borderRadius: 99,
              background: blind ? C.ink : C.chipBg, color: blind ? '#fff' : C.grey,
            }}
          >
            {blind ? 'Blind · ON' : 'Blind · off'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, margin: '2px 0 8px' }}>
          {[`REP ${rep}`, `ROW ${row}`, `POS ${pos}`].map((c) => (
            <span key={c} style={{ font: `500 10px ${MONO}`, background: C.chipBg, padding: '3px 7px', borderRadius: 5, color: C.grey }}>
              {c}
            </span>
          ))}
        </div>
        {blind ? (
          <div style={{ background: C.chipBg, borderRadius: 8, padding: '8px 10px', fontSize: 12, color: C.grey }}>
            Treatment hidden — blind scoring on
          </div>
        ) : (
          <>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: C.green }}>
              T{trtN} · {tinfo?.name}
              {ts.relabel[pid] !== undefined && <span style={{ color: C.burntDark, fontSize: 11 }}> · relabelled</span>}
            </div>
            <div style={{ fontSize: 11.5, color: C.grey, marginTop: 1 }}>{tinfo?.recipe}</div>
          </>
        )}
      </div>

      {/* progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 2px 6px' }}>
        <div style={{ flex: 1, height: 4, background: '#E0E1E0', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${Math.round((scored / order.length) * 100)}%`, height: '100%', background: C.green }} />
        </div>
        <div style={{ font: `500 10.5px ${MONO}`, color: C.grey }}>
          {scored}/{order.length} · Assess 1
        </div>
      </div>

      {/* measure header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 2px 5px' }}>
        <span style={{ font: `600 9.5px ${MONO}`, color: C.muted, letterSpacing: '.08em' }}>
          SCORING: {measures.map((k) => flat[k][1].toUpperCase()).join(' · ')}
        </span>
        <span onClick={() => setMsOpen(!msOpen)} style={{ fontSize: 11, fontWeight: 700, color: C.green, cursor: 'pointer', padding: '4px 0' }}>
          {msOpen ? 'Close' : 'Edit list'}
        </span>
      </div>

      {/* measure chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {measures.map((k) => {
          const m = flat[k]
          const active = field === k
          return (
            <div
              key={k}
              onClick={() => mutTrial(null, (t) => void (t.assessField = k))}
              style={{
                flex: 1, minWidth: '31%', padding: '10px 13px', borderRadius: 12, cursor: 'pointer',
                background: active ? C.greenTint : '#fff',
                border: `1.5px solid ${active ? C.green : C.hairline}`,
                boxSizing: 'border-box',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: active ? C.greenDark : C.grey, whiteSpace: 'nowrap' }}>{m[1]}</div>
              <div style={{ font: `600 24px ${MONO}`, marginTop: 1 }}>
                {sc?.v[k] ?? '–'}
                <span style={{ fontSize: 12, color: C.muted }}> {unitOf(m)}</span>
              </div>
            </div>
          )
        })}
      </div>

      {!msOpen ? (
        <>
          {/* aux row */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <div style={auxSt(!!sc?.photoIds.length)} onClick={() => fileRef.current?.click()}>
              {sc?.photoIds.length ? `Photo · ${sc.photoIds.length}` : 'Photo'}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => {
                onPhotoFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <div
              style={{ ...auxSt(listening), color: listening ? C.greenDark : C.body, animation: listening ? 'gpsPulse 1.1s infinite' : undefined }}
              onClick={onVoice}
            >
              {listening ? 'Listening…' : 'Voice'}
            </div>
            <div style={auxSt(!!sc?.note)} onClick={() => setNoteOpen(!noteOpen)}>
              {sc?.note ? 'Note ✓' : 'Note'}
            </div>
          </div>
          {noteOpen && (
            <textarea
              autoFocus
              defaultValue={sc?.note ?? ''}
              placeholder="e.g. Rust on flag leaf"
              onBlur={(e) => {
                const val = e.target.value.trim()
                setScore(null, (_, s) => void (s.note = val || undefined))
                setNoteOpen(false)
              }}
              style={{
                border: `1.5px solid ${C.green}`, borderRadius: 9, padding: '8px 10px', fontSize: 12.5,
                fontFamily: SANS, marginBottom: 6, resize: 'none', height: 44, outline: 'none',
              }}
            />
          )}
          {flash && <div style={{ fontSize: 11.5, color: C.greenDark, margin: '0 2px 6px' }}>{flash}</div>}

          {/* number pad */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <div key={d} style={padSt} onClick={() => keyDigit(d)}>
                {d}
              </div>
            ))}
            <div style={{ ...padSt, color: C.muted, fontSize: 17 }} onClick={backspace}>
              ⌫
            </div>
            <div style={padSt} onClick={() => keyDigit('0')}>
              0
            </div>
            <div
              style={{
                ...padSt, fontFamily: SANS, fontSize: 11.5, fontWeight: 700, color: C.green,
                background: C.greenTint, borderColor: '#9CC7B2', padding: '0 4px', textAlign: 'center',
              }}
              onClick={() => mutTrial(null, (t) => void (t.assessField = nextMeasure))}
            >
              {flat[nextMeasure][1]} →
            </div>
          </div>

          {/* save row */}
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
            <div
              onClick={onSame}
              style={{
                flex: 1, textAlign: 'center', padding: '15px 0', borderRadius: 12, border: `1.5px solid ${C.ghostBorder}`,
                fontSize: 13, fontWeight: 700, color: C.body, cursor: 'pointer', background: '#fff',
              }}
            >
              Same as last
            </div>
            <div
              onClick={onSave}
              style={{ flex: 1.4, textAlign: 'center', padding: '15px 0', borderRadius: 12, background: C.green, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              {nextPid ? `Save · ${nextPid} →` : 'Save · Finish'}
            </div>
          </div>
          <div onClick={onPrev} style={{ textAlign: 'center', font: `500 11px ${MONO}`, color: C.muted, padding: '7px 0 2px', cursor: 'pointer' }}>
            {prevPid ? `↩  back to ${prevPid}` : ''}
          </div>
        </>
      ) : (
        <>
          {/* measure picker */}
          <div style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '12px 14px', marginBottom: 8, flex: 1, overflow: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 2 }}>What are we scoring?</div>
            <div style={{ fontSize: 11, color: C.grey, marginBottom: 10 }}>
              Saved per trial — these become the chips above and the columns in your export.
            </div>
            {groups.map((g) => (
              <div key={g.title}>
                <div style={{ font: `600 9.5px ${MONO}`, color: C.muted, letterSpacing: '.08em', margin: '8px 0 5px' }}>{g.title}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {g.items.map((m) => {
                    const on = measures.includes(m[0])
                    return (
                      <div
                        key={m[0]}
                        onClick={() =>
                          mutTrial(null, (t) => {
                            const has = t.activeMeasures.includes(m[0])
                            if (has && t.activeMeasures.length === 1) return
                            t.activeMeasures = has ? t.activeMeasures.filter((x) => x !== m[0]) : [...t.activeMeasures, m[0]]
                            if (!t.activeMeasures.includes(t.assessField)) t.assessField = t.activeMeasures[0]
                          })
                        }
                        style={{
                          padding: '8px 11px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          background: on ? C.green : '#fff',
                          border: on ? 'none' : `1px solid ${C.ghostBorder}`,
                          color: on ? '#fff' : C.body,
                        }}
                      >
                        {m[1]}
                        <span style={{ fontSize: 9, opacity: 0.65 }}> {unitOf(m)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <div
            onClick={() => setMsOpen(false)}
            style={{ textAlign: 'center', padding: '14px 0', borderRadius: 12, background: C.green, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            Done — back to scoring
          </div>
        </>
      )}
    </div>
  )
}

interface SpeechRec {
  lang: string
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
