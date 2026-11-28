/**
 * Demo drive — a virtual bike working up-and-back passes, with phone-like GPS
 * error, so the guidance screen can be tried at a desk. Never used when a real
 * fix is available; the screen labels it loudly.
 */
import type { LatLng } from '../store/types'
import { Frame, unit, vadd, vmul, type Vec } from './engine'

export interface SimFix {
  lat: number
  lng: number
  acc: number
  speed: number
  heading: number
  t: number
}

export class DemoDrive {
  private frame: Frame
  private pos: Vec = { e: 0, n: 0 }
  private heading: number
  private along = 0
  private turning = 0 // degrees of the current headland turn still to go
  private turnDir = 1
  private wander: Vec = { e: 0, n: 0 }
  private seed = 20261111

  constructor(origin: LatLng, private h0 = 24, private lengthM = 70, private spacingM = 5.7, private speedMs = 2.2) {
    this.frame = new Frame(origin)
    this.heading = h0
  }

  private g() {
    const u = () => ((this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0), this.seed / 4294967296)
    return Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u())
  }

  /** Advance `dt` seconds and return the fix a phone would report. */
  step(dt: number, t: number): SimFix {
    const sub = 10
    for (let i = 0; i < sub; i++) {
      const h = dt / sub
      if (this.turning > 0) {
        const rate = ((this.speedMs / (this.spacingM / 2)) * 180) / Math.PI // deg/s for a half-spacing radius
        const d = Math.min(this.turning, rate * h)
        this.heading = (this.heading + d * this.turnDir + 360) % 360
        this.turning -= d
        if (this.turning <= 0) {
          this.along = 0
          this.turnDir = -this.turnDir
        }
      } else {
        this.along += this.speedMs * h
        if (this.along >= this.lengthM) this.turning = 180
      }
      this.pos = vadd(this.pos, vmul(unit(this.heading), this.speedMs * h))
    }
    // slow shared-style wander + fix-to-fix jitter
    const a = Math.exp(-dt / 150)
    const k = 0.7 * Math.sqrt(1 - a * a)
    this.wander = { e: this.wander.e * a + this.g() * k, n: this.wander.n * a + this.g() * k }
    const z = vadd(this.pos, vadd(this.wander, { e: this.g() * 0.25, n: this.g() * 0.25 }))
    return { ...this.frame.toLL(z), acc: 3, speed: this.speedMs + this.g() * 0.03, heading: (this.heading + this.g() * 0.5 + 360) % 360, t }
  }
}
