/** Cabin layout in metres. The cabin runs along X (front = +X), floor at y = 0, seats face +X.
 *  Business rows 1–5 are 2-2 pods (1.45 m pitch); Eco Plus 6–9 (0.95 m) and Eco 10–25 (0.82 m) are 3-3.
 *  Eco seats are 0.5 m apart with one shared armrest between neighbours, so nothing overlaps. */
export type Slot = { key: string; row: number; letter: string; kind: 'eco' | 'biz'; x: number; z: number }

const ECO_Z: Record<string, number> = { A: -1.55, B: -1.05, C: -0.55, D: 0.55, E: 1.05, F: 1.55 }
const BIZ_Z: Record<string, number> = { A: -1.72, C: -0.82, D: 0.82, F: 1.72 }
const ARM_Z = [-1.8, -1.3, -0.8, -0.3, 0.3, 0.8, 1.3, 1.8]

export function rowX(r: number) {
  if (r <= 5) return -(r - 1) * 1.45
  if (r <= 9) return -(4 * 1.45 + 1.4 + (r - 6) * 0.95)
  return -(4 * 1.45 + 1.4 + 3 * 0.95 + 1.0 + (r - 10) * 0.82)
}

export type CabinExtent = { front: number; rear: number; dividers: number[]; nose: boolean }

export function flightLayout(): { slots: Slot[]; extent: CabinExtent } {
  const slots: Slot[] = []
  for (let r = 1; r <= 25; r++) {
    const letters = r <= 5 ? 'ACDF' : 'ABCDEF'
    for (const l of letters) slots.push({ key: `${r}${l}`, row: r, letter: l, kind: r <= 5 ? 'biz' : 'eco', x: rowX(r), z: (r <= 5 ? BIZ_Z : ECO_Z)[l] })
  }
  return { slots, extent: { front: 1.3, rear: rowX(25) - 0.75, dividers: [(rowX(5) + rowX(6)) / 2 + 0.2, (rowX(9) + rowX(10)) / 2], nose: true } }
}

/** A short Eco section for the Home story. */
export function storyLayout(rows = 9): { slots: Slot[]; extent: CabinExtent } {
  const slots: Slot[] = []
  for (let r = 0; r < rows; r++) for (const l of 'ABCDEF') slots.push({ key: `${r}${l}`, row: r, letter: l, kind: 'eco', x: -r * 0.82, z: ECO_Z[l] })
  return { slots, extent: { front: 0.9, rear: -(rows - 1) * 0.82 - 0.75, dividers: [], nose: false } }
}

export function armrests(slots: Slot[]): [number, number][] {
  const rows = new Map<number, number>()
  slots.filter((s) => s.kind === 'eco').forEach((s) => rows.set(s.row, s.x))
  return [...rows.values()].flatMap((x) => ARM_Z.map((z) => [x, z] as [number, number]))
}
