import { cellColors, layout } from '../lib/layout'
import { MONO, useApp } from '../state'

const sectionLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', color: '#8A8C8A', marginBottom: 9 }

export default function MapScreen() {
  const { s, set, nav } = useApp()
  const droneOn = s.drone !== 'None'
  const mapBands = layout('A7F3', 'RCBD', 4, 8).map((b) => ({
    cells: b.cells.map((c) => {
      const cc = cellColors(c.t)
      const filled = s.showFills && c.t !== 0
      return {
        num: c.num,
        t: c.t === 0 ? 'SP' : 'T' + c.t,
        fill: c.t === 0 ? 'rgba(20,20,20,.16)' : filled ? cc.bg : 'rgba(255,255,255,.08)',
        fg: filled ? cc.fg : '#FFFFFF',
        shadow: filled ? 'none' : '0 1px 2px rgba(0,0,0,.55)',
      }
    }),
  }))
  const droneBg =
    s.drone === 'NDVI'
      ? 'radial-gradient(circle at 22% 30%, oklch(0.74 0.16 140) 0 16%, transparent 44%), radial-gradient(circle at 72% 58%, oklch(0.8 0.15 98) 0 20%, transparent 48%), radial-gradient(circle at 46% 82%, oklch(0.67 0.15 48) 0 10%, transparent 32%), linear-gradient(140deg, oklch(0.7 0.14 130), oklch(0.78 0.12 102))'
      : 'radial-gradient(circle at 30% 40%, oklch(0.55 0.06 120) 0 20%, transparent 46%), radial-gradient(circle at 74% 56%, oklch(0.63 0.05 92) 0 18%, transparent 42%), linear-gradient(120deg, oklch(0.58 0.05 112), oklch(0.66 0.05 96))'
  const sw = (on: boolean) => ({ bg: on ? '#007749' : '#C9CCC9', x: on ? 'translateX(12px)' : 'translateX(0)' })
  const swP = sw(s.showPlots)
  const swF = sw(s.showFills)

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '26px 34px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: '#8A8C8A' }}>MATONG WHEAT FUNGICIDE DEMO 2026</div>
          <h1 style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: '#141414', letterSpacing: '-.01em' }}>Trial map</h1>
          <div style={{ marginTop: 3, fontSize: 12.5, color: '#8A8C8A' }}>
            ‘Glenview’, Matong NSW · <span style={{ fontFamily: MONO, fontSize: 11.5, color: '#3E403E' }}>−34.768, 146.929</span> ·{' '}
            <a href="https://maps.google.com/?q=-34.768,146.929" target="_blank" rel="noreferrer" style={{ fontWeight: 700, textDecoration: 'none' }}>
              Open in Google Maps ↗
            </a>
          </div>
        </div>
        <div onClick={() => nav('wizard', { step: 'treatments' })} className="hv-green-border" style={{ padding: '9px 16px', background: '#fff', border: '1px solid #D8DAD8', color: '#141414', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Open in wizard →
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative', border: '1px solid #E4E4E6', borderRadius: 10, overflow: 'hidden', height: 'calc(100vh - 220px)', minHeight: 460, background: '#DDE0D8' }}>
          {s.mapBase === 'Satellite' && (
            <>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, oklch(0.6 0.05 130) 0%, oklch(0.66 0.06 112) 34%, oklch(0.71 0.07 96) 34.4%, oklch(0.73 0.06 100) 62%, oklch(0.58 0.05 134) 62.4%, oklch(0.63 0.05 124) 100%)' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(24deg, rgba(255,255,255,.05) 0 2px, transparent 2px 16px),repeating-linear-gradient(114deg, rgba(0,0,0,.045) 0 3px, transparent 3px 34px)' }} />
            </>
          )}
          {s.mapBase === 'Roads' && (
            <>
              <div style={{ position: 'absolute', inset: 0, background: '#EFF0EA' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg,#E2E3DC 0 1px, transparent 1px 110px),repeating-linear-gradient(90deg,#E2E3DC 0 1px, transparent 1px 110px)' }} />
              <div style={{ position: 'absolute', top: '-10%', left: '60%', width: 7, height: '120%', background: '#DBDCD4', transform: 'rotate(13deg)' }} />
              <div style={{ position: 'absolute', top: '18%', left: '63%', fontFamily: MONO, fontSize: 9.5, color: '#A9ABA9', transform: 'rotate(77deg)' }}>Silo Rd</div>
            </>
          )}
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%) rotate(-4deg)' }}>
            {droneOn && (
              <>
                <div style={{ position: 'absolute', inset: -30, borderRadius: 10, background: droneBg, opacity: (s.droneOp || 65) / 100 }} />
                <div style={{ position: 'absolute', top: -52, left: -30, background: 'rgba(20,20,20,.72)', color: '#fff', fontFamily: MONO, fontSize: 9.5, padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap' }}>
                  {(s.drone === 'NDVI' ? 'NDVI' : 'RGB ortho') + ' · 12 Aug · drone'}
                </div>
              </>
            )}
            {s.showPlots && (
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {mapBands.map((bd, i) => (
                  <div key={i} style={{ display: 'flex', gap: 3 }}>
                    {bd.cells.map((cl) => (
                      <div key={cl.num} style={{ width: 34, height: 64, flex: 'none', borderRadius: 3, background: cl.fill, border: '1.5px solid rgba(255,255,255,.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                        <div style={{ fontFamily: MONO, fontSize: 7.5, color: cl.fg, opacity: 0.8, textShadow: cl.shadow }}>{cl.num}</div>
                        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: cl.fg, textShadow: cl.shadow }}>{cl.t}</div>
                      </div>
                    ))}
                  </div>
                ))}
                <div style={{ position: 'absolute', left: '62%', top: '38%' }}>
                  <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#00E38C', border: '2px solid #fff', boxShadow: '0 0 0 5px rgba(0,227,140,.25)', animation: 'ompulse 1.8s ease-in-out infinite' }} />
                  <div style={{ position: 'absolute', left: 16, top: -4, background: '#141414', color: '#fff', fontFamily: MONO, fontSize: 9, padding: '3px 7px', borderRadius: 5, whiteSpace: 'nowrap' }}>Sam’s phone · plot 214</div>
                </div>
              </div>
            )}
          </div>
          <div style={{ position: 'absolute', top: 14, left: 14, background: 'rgba(255,255,255,.92)', borderRadius: 7, padding: '5px 9px', fontFamily: MONO, fontSize: 10.5, fontWeight: 600, color: '#141414', boxShadow: '0 1px 4px rgba(0,0,0,.12)' }}>N ↑</div>
          <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', flexDirection: 'column', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 5px rgba(0,0,0,.15)' }}>
            <div className="hv-soft" style={{ width: 32, height: 32, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#141414', cursor: 'pointer' }}>+</div>
            <div className="hv-soft" style={{ width: 32, height: 32, background: '#fff', borderTop: '1px solid #EDEEED', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#141414', cursor: 'pointer' }}>−</div>
          </div>
          <div className="hv-green-text" style={{ position: 'absolute', bottom: 14, right: 14, background: 'rgba(255,255,255,.94)', borderRadius: 8, padding: '7px 12px', fontSize: 11.5, fontWeight: 700, color: '#141414', cursor: 'pointer', boxShadow: '0 1px 5px rgba(0,0,0,.15)' }}>⌖ Centre on trial</div>
          <div style={{ position: 'absolute', bottom: 14, left: 14, background: 'rgba(20,20,20,.5)', color: 'rgba(255,255,255,.9)', fontFamily: MONO, fontSize: 9, padding: '3px 8px', borderRadius: 4 }}>google maps satellite · placeholder — API key connects the live basemap</div>
        </div>
        <div style={{ width: 262, flex: 'none', background: '#fff', border: '1px solid #E4E4E6', borderRadius: 10, padding: '16px 16px', overflow: 'auto', height: 'calc(100vh - 220px)', minHeight: 460 }}>
          <div style={sectionLabel}>BASE</div>
          <div style={{ display: 'flex', border: '1px solid #D8DAD8', borderRadius: 8, overflow: 'hidden', width: 'max-content' }}>
            {(['Satellite', 'Roads'] as const).map((b) => (
              <div key={b} onClick={() => set({ mapBase: b })} style={{ padding: '7px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: s.mapBase === b ? '#141414' : '#FFFFFF', color: s.mapBase === b ? '#FFFFFF' : '#3E403E', borderLeft: b === 'Roads' ? '1px solid #E4E4E6' : 'none' }}>
                {b}
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: '#F0F1F0', margin: '15px 0' }} />
          <div style={sectionLabel}>TRIAL OVERLAY</div>
          <div onClick={() => set((st) => ({ showPlots: !st.showPlots }))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer', padding: '5px 0' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#141414' }}>Plot boundaries</div>
            <div style={{ width: 30, height: 18, flex: 'none', borderRadius: 99, background: swP.bg, position: 'relative', transition: 'background .15s' }}>
              <div style={{ position: 'absolute', top: 2, left: 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transform: swP.x, transition: 'transform .15s' }} />
            </div>
          </div>
          <div onClick={() => set((st) => ({ showFills: !st.showFills }))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer', padding: '5px 0' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#141414' }}>Treatment colours</div>
            <div style={{ width: 30, height: 18, flex: 'none', borderRadius: 99, background: swF.bg, position: 'relative', transition: 'background .15s' }}>
              <div style={{ position: 'absolute', top: 2, left: 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transform: swF.x, transition: 'transform .15s' }} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#8A8C8A', marginTop: 4, lineHeight: 1.45 }}>36 plots · seed #A7F3 · corners pegged from the spray map</div>
          <div style={{ height: 1, background: '#F0F1F0', margin: '15px 0' }} />
          <div style={sectionLabel}>DRONE IMAGERY</div>
          {(
            [
              ['None', 'hide imagery'],
              ['RGB ortho', '12 Aug · 4 cm/px · DJI M3M'],
              ['NDVI', '12 Aug · 4 cm/px · DJI M3M'],
            ] as const
          ).map(([name, meta]) => {
            const on = s.drone === name
            return (
              <div key={name} onClick={() => set({ drone: name })} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', cursor: 'pointer' }}>
                <div style={{ width: 14, height: 14, flex: 'none', borderRadius: '50%', border: `1.5px solid ${on ? '#007749' : '#C7CAC7'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {on && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#007749' }} />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#141414' }}>{name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, color: '#8A8C8A', marginTop: 1 }}>{meta}</div>
                </div>
              </div>
            )
          })}
          {droneOn && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: '#A9ABA9' }}>OPACITY</span>
                <span style={{ fontFamily: MONO, fontSize: 10.5, color: '#3E403E' }}>{s.droneOp}%</span>
              </div>
              <input type="range" min={20} max={100} value={s.droneOp} onChange={(e) => set({ droneOp: +e.target.value })} style={{ width: '100%', accentColor: '#007749', marginTop: 4 }} />
            </div>
          )}
          <div className="hv-drop" style={{ marginTop: 12, border: '1.5px dashed #C7CAC7', borderRadius: 8, padding: '10px 12px', textAlign: 'center', cursor: 'pointer' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#007749' }}>+ Add flight</div>
            <div style={{ fontSize: 10.5, color: '#8A8C8A', marginTop: 2 }}>GeoTIFF, JPG or Ag Leader export</div>
          </div>
          <div style={{ fontSize: 11, color: '#8A8C8A', marginTop: 8, lineHeight: 1.45 }}>Imagery georeferences to the plot corners automatically and stays with the trial.</div>
          <div style={{ height: 1, background: '#F0F1F0', margin: '15px 0' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#007749', animation: 'ompulse 1.8s ease-in-out infinite' }} />
            <div style={{ fontSize: 11.5, color: '#3E403E', fontWeight: 600 }}>2 phones in field · last fix 24 min ago</div>
          </div>
        </div>
      </div>
    </div>
  )
}
