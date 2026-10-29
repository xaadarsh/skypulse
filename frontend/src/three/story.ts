/** Home cabin story: real numbers (tools/make_story.py) and the scroll timeline shared by the 3D scene and the captions. */
import data from './story.json'
import { flightLayout } from './layout'

export type StoryData = {
  flight: string; route: string; passengers: number; event: string; source: string
  at_risk_before: number; at_risk_after: number; saved: number; actions: number; cost: number
  seats: Record<string, [number, number]>
  focus: { seat: string; reason: string; action: string; action_label: string; risk_before: number; risk_after: number }
}
export const STORY = data as unknown as StoryData
export const CABIN = flightLayout()

/** share of the pinned scroll used by the hero before the cabin stages start */
export const HERO = 0.09
/** stage boundaries in cabin-progress (0..1) */
export const STAGES = [0, 0.15, 0.4, 0.6, 0.8, 1] as const
const SNAP = [0.12, 0.32, 0.58, 0.72, 1] // reduced motion: one finished frame per stage

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
export const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }

/** page progress (0..1 over the pinned section) -> cabin progress (negative during the hero) */
export function cabinProgress(p: number, reduce = false) {
  const s = (p - HERO) / (1 - HERO)
  if (!reduce || s < 0) return s
  const k = STAGES.findIndex((b, i) => i > 0 && s < b)
  return SNAP[k < 0 ? 4 : k - 1]
}

const FRONT = 1.3, REAR = CABIN.extent.rear
const sweep = (a: number, b: number, s: number) => FRONT + 0.4 - clamp01((s - a) / (b - a)) * (FRONT - REAR + 0.8)
/** x of the detection scan line / the recovery ripple (cabin metres, front = +x) */
export const scanX = (s: number) => sweep(0.42, 0.57, s)
export const rippleX = (s: number) => sweep(0.82, 0.95, s)

const risk = CABIN.slots.map((sl) => STORY.seats[sl.key] ?? [0, 0])
/** at-risk passengers the scan line has passed so far */
export const atRiskFound = (s: number) => { const x = scanX(s); return CABIN.slots.reduce((n, sl, i) => n + (sl.x > x && risk[i][0] >= 0.5 ? 1 : 0), 0) }
/** at-risk count while the recovery ripple passes */
export const atRiskNow = (s: number) => { const x = rippleX(s); return CABIN.slots.reduce((n, sl, i) => n + (risk[i][sl.x > x ? 1 : 0] >= 0.5 ? 1 : 0), 0) }
export const seatRisk = risk
export const focusIndex = CABIN.slots.findIndex((sl) => sl.key === STORY.focus.seat)
