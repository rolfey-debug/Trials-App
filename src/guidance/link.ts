/**
 * Base ⇄ rover link for the two-phone differential.
 *
 * Carried over Supabase Realtime *broadcast* — an ephemeral pub/sub channel on
 * the project the app already uses, nothing is stored. Any internet path works
 * (Starlink Wi-Fi, mobile data, one of each). The protocol is the Phoenix
 * channel wire format, hand-rolled here in keeping with shared/supa.ts's
 * zero-dependency client.
 *
 * A same-device BroadcastChannel mirror runs alongside so two tabs can be
 * paired with no network (bench testing, the Playwright drive).
 */
import { SUPA_KEY, SUPA_URL } from '../../shared/supa'

export type LinkState = 'connecting' | 'open' | 'local' | 'down'

export interface Link {
  send: (payload: unknown) => void
  close: () => void
}

const WS_URL = `${SUPA_URL.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${SUPA_KEY}&vsn=1.0.0`

export function openLink(code: string, onMsg: (payload: any) => void, onState: (s: LinkState) => void): Link {
  const topic = `realtime:guide-${code}`
  let ws: WebSocket | null = null
  let closed = false
  let joined = false
  let ref = 0
  let beat: number | undefined
  let retry: number | undefined
  let attempt = 0
  let peerSeen = false // heard something over the local mirror

  const local = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`tw-guide-${code}`) : null
  const report = () => onState(joined ? 'open' : peerSeen ? 'local' : ws && ws.readyState <= 1 ? 'connecting' : 'down')
  if (local)
    local.onmessage = (ev) => {
      if (!peerSeen) {
        peerSeen = true
        report()
      }
      onMsg(ev.data)
    }

  const push = (t: string, event: string, payload: unknown) => {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ topic: t, event, payload, ref: String(++ref) }))
  }

  const connect = () => {
    if (closed) return
    try {
      ws = new WebSocket(WS_URL)
    } catch {
      schedule()
      return
    }
    report()
    ws.onopen = () => {
      push(topic, 'phx_join', { config: { broadcast: { ack: false, self: false }, presence: { key: '' }, postgres_changes: [], private: false } })
      beat = window.setInterval(() => push('phoenix', 'heartbeat', {}), 25000)
    }
    ws.onmessage = (ev) => {
      let m: any
      try {
        m = JSON.parse(ev.data)
      } catch {
        return
      }
      if (m.topic !== topic) return
      if (m.event === 'phx_reply' && !joined && m.payload?.status === 'ok') {
        joined = true
        attempt = 0
        report()
      } else if (m.event === 'broadcast' && m.payload?.event === 'g') {
        onMsg(m.payload.payload)
      } else if (m.event === 'phx_error' || m.event === 'phx_close') {
        ws?.close()
      }
    }
    ws.onclose = () => {
      window.clearInterval(beat)
      joined = false
      ws = null
      report()
      schedule()
    }
    ws.onerror = () => ws?.close()
  }

  const schedule = () => {
    if (closed) return
    window.clearTimeout(retry)
    retry = window.setTimeout(connect, Math.min(15000, 1000 * 2 ** attempt++))
  }

  // Phones drop sockets when the radio naps — reconnect the moment we're back.
  const wake = () => {
    if (!closed && !ws && document.visibilityState === 'visible') {
      attempt = 0
      window.clearTimeout(retry)
      connect()
    }
  }
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('online', wake)

  connect()

  return {
    send(payload) {
      local?.postMessage(payload)
      if (joined) push(topic, 'broadcast', { type: 'broadcast', event: 'g', payload })
    },
    close() {
      closed = true
      window.clearInterval(beat)
      window.clearTimeout(retry)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      local?.close()
      ws?.close()
    },
  }
}

/** Six digits, easy to read across and thumb in with gloves on. */
export const newPairCode = () => String(Math.floor(100000 + Math.random() * 900000))
export const fmtCode = (c: string) => (c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c)
