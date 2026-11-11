import { useEffect } from 'react'

/** Keep the screen on while guiding / broadcasting — a napping phone stops both GPS and the link. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const wl = (navigator as any).wakeLock
    if (!wl) return
    let lock: any = null
    let gone = false
    const grab = () => {
      if (gone || document.visibilityState !== 'visible') return
      wl.request('screen')
        .then((l: any) => {
          if (gone) l.release().catch(() => {})
          else lock = l
        })
        .catch(() => {})
    }
    grab()
    document.addEventListener('visibilitychange', grab) // the lock drops whenever the tab is hidden
    return () => {
      gone = true
      document.removeEventListener('visibilitychange', grab)
      lock?.release().catch(() => {})
    }
  }, [active])
}
