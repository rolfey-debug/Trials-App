import React, { useRef, useState } from 'react'
import { C, MONO } from '../theme'
import { useApp } from '../store/store'
import { GhostBtn, PrimaryBtn, ScreenTitle, SuccessCard } from '../components/bits'
import { parseSprayMapPdf } from '../parsers/sprayMapPdf'
import { parseMixingPlan } from '../parsers/mixingPlan'
import { parseArmCsv, parseProtocolDocx, blankTrial } from '../parsers/otherSources'
import { freshTrialState } from '../store/seed'
import type { TrialDoc } from '../store/types'

/** Add a trial (design screen 2f) — point it at the files you already make.
 * Parsing runs on-device (PDF text + xlsx); the portal can re-parse server-side. */

type Step = 0 | 1 | 2 | 3

interface Parsed {
  doc: TrialDoc
  chips: string[]
  note: string
}

const SOURCES: { t: string; s: string; accept: string | null }[] = [
  { t: 'Spray map PDF', s: 'grid, reps, OUT + reserve plots — like Matong', accept: '.pdf,application/pdf' },
  { t: 'Protocol document', s: '.docx — like Junee Reefs Knockdown 2026', accept: '.docx' },
  { t: 'Mixing plan', s: '.xlsx — treatments, rates, batch volumes', accept: '.xlsx' },
  { t: 'ARM export', s: '.csv / .xml study definition', accept: '.csv,.xml,text/csv' },
  { t: 'Start blank', s: 'type treatments in the ute, map later', accept: null },
]

export function AddTrial() {
  const { mut, go } = useApp()
  const [step, setStep] = useState<Step>(0)
  const [src, setSrc] = useState('')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingSource = useRef<string>('')

  const reset = () => {
    setStep(0)
    setParsed(null)
    setError('')
  }

  const finishParse = (doc: TrialDoc, extraNote?: string) => {
    const cells = Object.values(doc.cells)
    const outN = cells.filter((v) => v === 'out').length
    const chips = [
      `${doc.treatments.length} TREATMENTS`,
      `${doc.trial.reps} REPS · ${doc.trial.design}`,
      ...(cells.length ? [`${cells.length} POSITIONS`] : []),
      ...(outN || doc.marginalPlots.length ? [`${outN} OUT · ${doc.marginalPlots.length} MARGINAL`] : []),
      ...(doc.treatments.some((t) => t.bSpray) ? ['A + B TIMINGS'] : []),
    ]
    const first = doc.treatments
      .slice(0, 4)
      .map((t) => `T${t.n} ${t.name}`)
      .join(' · ')
    const more = doc.treatments.length > 4 ? ` … +${doc.treatments.length - 4} more` : ''
    const reserves = Object.entries(doc.cells)
      .filter(([, v]) => v === 'reserve')
      .map(([k]) => k)
    const note = `${first}${more}${reserves.length ? ` · reserves at ${reserves.join('/')} honoured` : ''}${extraNote ? ` · ${extraNote}` : ''}`
    setParsed({ doc, chips, note })
    setStep(2)
  }

  const parseFile = async (source: string, f: File) => {
    setSrc(source.toUpperCase())
    setFileName(f.name)
    setStep(1)
    setError('')
    const started = Date.now()
    try {
      const data = new Uint8Array(await f.arrayBuffer())
      let doc: TrialDoc
      let note: string | undefined
      if (source === 'Spray map PDF') {
        doc = parseSprayMapPdf(data, f.name).doc
      } else if (source === 'Mixing plan') {
        const r = parseMixingPlan(data, f.name)
        doc = r.doc
        note = `${r.stats.batchL} L batches from “${r.stats.sheet}”`
      } else if (source === 'ARM export') {
        const r = parseArmCsv(data, f.name)
        doc = r.doc
        note = r.stats
      } else {
        const r = parseProtocolDocx(data, f.name)
        doc = r.doc
        note = r.stats
      }
      // keep the reading state visible long enough to read (design shows a beat)
      const wait = Math.max(0, 900 - (Date.now() - started))
      setTimeout(() => finishParse(doc, note), wait)
    } catch (e) {
      setTimeout(() => {
        setError(e instanceof Error ? e.message : 'Could not read that file')
        setStep(0)
      }, 400)
    }
  }

  const pickSource = (t: string, accept: string | null) => {
    if (!accept) {
      // Start blank
      const name = window.prompt('Trial name?', 'New trial — untitled')
      if (!name) return
      setSrc('START BLANK')
      setFileName('typed in the ute')
      finishParse(blankTrial(name, 24, 3), 'map the grid later from Site setup')
      return
    }
    pendingSource.current = t
    if (fileRef.current) {
      fileRef.current.accept = accept
      fileRef.current.click()
    }
  }

  const confirm = () => {
    if (!parsed) return
    mut({ kind: 'trial', label: `Trial created · ${parsed.doc.trial.name}` }, (d) => {
      d.trials[parsed.doc.id] = parsed.doc
      // re-importing the same document must never wipe scores already taken
      if (!d.trialState[parsed.doc.id]) d.trialState[parsed.doc.id] = freshTrialState(parsed.doc)
      d.activeTrialId = parsed.doc.id
    })
    setStep(3)
  }

  const miniCell = (v: TrialDoc['cells'][string] | undefined): string => {
    if (v === 'out') return '#E8B7A6'
    if (typeof v === 'number') return '#BFDCCD'
    return '#E4E5E4'
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 12px', display: 'flex', flexDirection: 'column' }}>
      <ScreenTitle title="Add a trial" sub="Point it at the files you already make — it builds the trial" />
      <input
        ref={fileRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) parseFile(pendingSource.current, f)
          e.target.value = ''
        }}
      />

      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {error && (
            <div style={{ background: C.burntTint, borderRadius: 10, padding: '9px 12px', fontSize: 11.5, color: C.burntDark }}>
              Couldn't parse that file — {error}. Try another source, or start blank and fix the mapping in the portal.
            </div>
          )}
          {SOURCES.map((s) => (
            <div
              key={s.t}
              onClick={() => pickSource(s.t, s.accept)}
              style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 13, padding: '13px 15px', cursor: 'pointer' }}
            >
              <div style={{ fontSize: 14, fontWeight: 800, color: C.green }}>{s.t}</div>
              <div style={{ fontSize: 11.5, color: C.grey, marginTop: 1 }}>{s.s}</div>
            </div>
          ))}
        </div>
      )}

      {step === 1 && (
        <div style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '22px 18px', textAlign: 'center', animation: 'gpsPulse 1.2s infinite' }}>
          <div style={{ font: `600 12px ${MONO}`, color: C.green, marginBottom: 4 }}>READING…</div>
          <div style={{ fontSize: 13, color: C.body }}>
            {fileName}
            <br />
            finding the grid, reps and OUT plots
          </div>
        </div>
      )}

      {step === 2 && parsed && (
        <>
          <div style={{ background: '#fff', border: `1.5px solid ${C.green}`, borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ font: `600 10px ${MONO}`, color: C.green, letterSpacing: '.08em', marginBottom: 4 }}>FOUND IN {src}</div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{parsed.doc.trial.name}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '8px 0 10px' }}>
              {parsed.chips.map((c) => (
                <span
                  key={c}
                  style={{
                    font: `500 10px ${MONO}`, padding: '3px 7px', borderRadius: 5,
                    background: /OUT|MARGINAL/.test(c) ? C.burntTint : C.chipBg,
                    color: /OUT|MARGINAL/.test(c) ? C.burntDark : C.grey,
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
            {Object.keys(parsed.doc.cells).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
                {Array.from({ length: parsed.doc.trial.grid.rows }, (_, ri) => ri + 1).map((r) => (
                  <div key={r} style={{ display: 'flex', gap: 2 }}>
                    {Array.from({ length: parsed.doc.trial.grid.positions }, (_, pi) => pi + 1).map((p) => (
                      <div key={p} style={{ flex: 1, height: 9, borderRadius: 2, background: miniCell(parsed.doc.cells[r * 100 + p]) }} />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: C.chipBg, borderRadius: 8, padding: '8px 10px', fontSize: 11, color: C.grey, marginBottom: 10 }}>
                No plot grid in this source — lay it out at pegging with Site setup, or import the spray map later.
              </div>
            )}
            <div style={{ fontSize: 11.5, color: C.grey, lineHeight: 1.5 }}>{parsed.note}</div>
          </div>
          <PrimaryBtn onClick={confirm} style={{ marginBottom: 7 }}>
            Looks right — create trial
          </PrimaryBtn>
          <GhostBtn onClick={reset}>Fix mapping first</GhostBtn>
        </>
      )}

      {step === 3 && parsed && (
        <>
          <SuccessCard title={`${parsed.doc.trial.name} added`} sub="On Today for the whole team · Assessment 1 scheduled 14–21 DAA" />
          <PrimaryBtn onClick={() => go('setup')} style={{ marginBottom: 7 }}>
            Next: map the site with GPS →
          </PrimaryBtn>
          <GhostBtn onClick={() => go('home')}>Later — open Today</GhostBtn>
        </>
      )}

      {step > 0 && (
        <div onClick={reset} style={{ textAlign: 'center', font: `500 11px ${MONO}`, color: C.muted, padding: '10px 0 2px', cursor: 'pointer', marginTop: 'auto' }}>
          ↩ start over with a different file
        </div>
      )}
    </div>
  )
}
