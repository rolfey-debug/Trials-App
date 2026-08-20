/** Design tokens — AGnVET brand guidelines May 2026 (see docs/handoff). */
export const C = {
  // FIELD green (PMS 3415C)
  green: '#007749',
  greenDark: '#00623C',
  greenTint: '#E3F1EA',
  assessedFill: '#DCEDE4',
  // LAND BURNT (PMS 173C)
  burnt: '#cf4520',
  burntDark: '#A93414',
  burntTint: '#FAE8E1',
  outFill: '#F6DCD2',
  // Greys (PMS 425C family)
  grey: '#58585B',
  ink: '#141414',
  body: '#3E403E',
  muted: '#8A8C8A',
  hairline: '#E4E4E6',
  chipBg: '#EEEFEE',
  appBg: '#F4F5F4',
  disabled: '#B9BBB9',
  ghostBorder: '#D6D7D6',
} as const

export const MONO = "'IBM Plex Mono', monospace"
export const SANS = "'Mulish', Arial, sans-serif"

/** Shared style fragments used across screens (mirrors the design prototype). */
export const S = {
  card: {
    background: '#fff',
    border: `1px solid ${C.hairline}`,
    borderRadius: 13,
  } as React.CSSProperties,
  eyebrow: {
    font: `600 10.5px ${MONO}`,
    color: C.muted,
    letterSpacing: '.08em',
  } as React.CSSProperties,
  primaryBtn: {
    background: C.green,
    color: '#fff',
    borderRadius: 12,
    padding: '14px 0',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  } as React.CSSProperties,
  ghostBtn: {
    textAlign: 'center',
    padding: '11px 0',
    borderRadius: 12,
    border: `1.5px solid ${C.ghostBorder}`,
    fontSize: 12.5,
    fontWeight: 700,
    color: C.body,
    background: '#fff',
    cursor: 'pointer',
  } as React.CSSProperties,
  flash: {
    background: C.greenTint,
    borderRadius: 8,
    padding: '7px 10px',
    fontSize: 11.5,
    fontWeight: 700,
    color: C.greenDark,
  } as React.CSSProperties,
  chip: {
    font: `500 10px ${MONO}`,
    background: C.chipBg,
    padding: '3px 7px',
    borderRadius: 5,
    color: C.grey,
  } as React.CSSProperties,
}
