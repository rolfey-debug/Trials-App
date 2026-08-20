import { useEffect, useState } from 'react'
import { CAT_CHIP, loadProducts, searchPicker, segs, type PickerProduct } from '../lib/products'
import { MONO, useApp } from '../state'

const expChip: React.CSSProperties = { flex: 'none', fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', color: '#cf4520', border: '1px solid #cf4520', background: '#FBEDE8', borderRadius: 4, padding: '2px 6px' }
const fieldLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', color: '#8A8C8A', marginBottom: 5 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 11px', fontSize: 13, border: '1px solid #D8DAD8', borderRadius: 8, outline: 'none', color: '#141414', background: '#fff' }

export default function Picker() {
  const { s, set, allT } = useApp()
  const [products, setProducts] = useState<PickerProduct[] | null>(null)
  useEffect(() => {
    let live = true
    loadProducts().then((p) => live && setProducts(p))
    return () => {
      live = false
    }
  }, [])

  if (!s.picker) return null
  const q = s.pq.trim().toLowerCase()
  const results = products ? searchPicker(products, s.pq) : []
  const nextT = 'T' + (allT().length + 1)
  const addRow = (name: string, exp: boolean) =>
    set((st) => ({ extras: st.extras.concat([{ name, exp }]), picker: false, lastAdded: 8 + st.extras.length, step: 'treatments' }))

  return (
    <div onClick={() => set({ picker: false })} style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,20,.38)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 664, maxWidth: '94vw', maxHeight: '86vh', background: '#fff', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(10,26,18,.25)' }}>
        <div style={{ padding: '18px 22px 0', flex: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#141414' }}>Add product — treatment {nextT}</div>
              <div style={{ fontSize: 12, color: '#8A8C8A', marginTop: 2 }}>Registered products · search by product or active ingredient</div>
            </div>
            <div onClick={() => set({ picker: false })} className="hv-close" style={{ width: 28, height: 28, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, fontSize: 16, color: '#8A8C8A', cursor: 'pointer' }}>×</div>
          </div>
          <input
            autoFocus
            value={s.pq}
            onChange={(e) => set({ pq: e.target.value })}
            placeholder="Search products or actives — try “prothio”"
            className="focus-green-bg"
            style={{ width: '100%', marginTop: 13, padding: '11px 14px', fontSize: 13.5, border: '1px solid #D8DAD8', borderRadius: 9, outline: 'none', color: '#141414', background: '#FBFCFB' }}
          />
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px', minHeight: 120 }}>
          {results.map((r, i) => {
            const cat = CAT_CHIP[r.cat]
            return (
              <div key={r.name + i} onClick={() => addRow(r.name, false)} className="hv-pick" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 12px', borderRadius: 9, cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: '#141414', whiteSpace: 'nowrap' }}>{r.name}</span>
                    <span style={{ fontSize: 11.5, color: '#8A8C8A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.co}</span>
                  </div>
                  <div style={{ marginTop: 3, fontFamily: MONO, fontSize: 11.5, color: '#6B6D6B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {segs(r.actives, q).map((sg, j) => (
                      <span key={j} style={{ color: sg.fg, fontWeight: sg.fw }}>{sg.t}</span>
                    ))}
                  </div>
                </div>
                <span style={{ flex: 'none', padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, background: cat.bg, color: cat.fg, border: `1px solid ${cat.bd}` }}>{r.cat}</span>
                <span style={{ flex: 'none', fontSize: 12, fontWeight: 800, color: '#007749' }}>Add +</span>
              </div>
            )
          })}
          {products && results.length === 0 && (
            <div style={{ padding: 26, textAlign: 'center', fontSize: 12.5, color: '#8A8C8A' }}>No registered product matches “{s.pq}” — check the spelling, or add it as experimental below.</div>
          )}
          {!products && <div style={{ padding: 26, textAlign: 'center', fontSize: 12.5, color: '#8A8C8A' }}>Loading the APVMA register…</div>}
        </div>
        <div style={{ borderTop: '1px solid #E4E4E6', background: '#FBFCFB', flex: 'none' }}>
          {!s.exp ? (
            <div onClick={() => set((st) => ({ exp: !st.exp }))} className="hv-menu" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 22px', cursor: 'pointer' }}>
              <span style={expChip}>EXP</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#141414' }}>Add an experimental product</div>
                <div style={{ fontSize: 11.5, color: '#8A8C8A', marginTop: 1 }}>Unregistered or code-named — flagged EXP wherever it appears</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#007749' }}>Open ▾</span>
            </div>
          ) : (
            <div style={{ padding: '16px 22px 18px' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 13 }}>
                <span style={expChip}>EXP</span>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 800, color: '#141414' }}>Experimental product</div>
                <div onClick={() => set((st) => ({ exp: !st.exp }))} className="hv-ink-text" style={{ fontSize: 12, fontWeight: 700, color: '#8A8C8A', cursor: 'pointer' }}>Collapse ▴</div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1.2 }}>
                  <div style={fieldLabel}>CODE NAME</div>
                  <input value={s.expName} onChange={(e) => set({ expName: e.target.value })} className="focus-green" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={fieldLabel}>CATEGORY</div>
                  <select value={s.expCat} onChange={(e) => set({ expCat: e.target.value })} style={{ ...inputStyle, padding: '8px 10px', fontWeight: 600 }}>
                    <option>Fungicide</option>
                    <option>Herbicide</option>
                    <option>Insecticide</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={fieldLabel}>
                  ACTIVES <span style={{ fontWeight: 600, letterSpacing: 0, color: '#A9ABA9' }}>· optional</span>
                </div>
                {s.expRows.map((er, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 7, alignItems: 'center' }}>
                    <input
                      value={er.n}
                      onChange={(e) => set((st) => ({ expRows: st.expRows.map((x, j) => (j === i ? { n: e.target.value, r: x.r } : x)) }))}
                      placeholder="active ingredient"
                      className="focus-green"
                      style={{ ...inputStyle, flex: 1.4, width: 'auto', padding: '7px 11px', fontSize: 12.5 }}
                    />
                    <input
                      value={er.r}
                      onChange={(e) => set((st) => ({ expRows: st.expRows.map((x, j) => (j === i ? { n: x.n, r: e.target.value } : x)) }))}
                      placeholder="e.g. 200 g/L"
                      className="focus-green"
                      style={{ ...inputStyle, flex: 1, width: 'auto', padding: '7px 11px', fontFamily: MONO, fontSize: 12 }}
                    />
                    <div onClick={() => set((st) => ({ expRows: st.expRows.filter((_, j) => j !== i) }))} className="hv-remove" style={{ width: 26, height: 26, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, color: '#A9ABA9', cursor: 'pointer', fontSize: 14 }}>×</div>
                  </div>
                ))}
                <div onClick={() => set((st) => ({ expRows: st.expRows.concat([{ n: '', r: '' }]) }))} className="hv-green-text" style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: '#007749', cursor: 'pointer' }}>
                  + add another active
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={fieldLabel}>NOTES</div>
                <input value={s.expNotes} onChange={(e) => set({ expNotes: e.target.value })} className="focus-green" style={{ ...inputStyle, fontSize: 12.5, color: '#3E403E' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
                <div style={{ flex: 1, fontSize: 11.5, color: '#8A8C8A', lineHeight: 1.45 }}>
                  Will appear as <span style={{ fontWeight: 700, color: '#141414' }}>{s.expName}</span> with an <span style={{ fontWeight: 800, color: '#cf4520' }}>EXP</span> flag in tables, plot maps and reports.
                </div>
                <div onClick={() => addRow(s.expName || 'EXP product', true)} className="hv-primary" style={{ flex: 'none', padding: '9px 16px', background: '#007749', color: '#fff', fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: 'pointer' }}>
                  Add experimental product
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
