import { motion } from 'framer-motion'
import { useMemo } from 'react'
import type { Seat } from '../api'
import { ACTION_COLOR, RISK_HEX } from '../three/colors'

const ROWS = Array.from({ length: 25 }, (_, i) => i + 1)
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

/** Flat seat map: rows run left (front) to right (back) on wide screens, top to bottom on phones. */
export function SeatMap2D({ seats, selected, onSelect, wave }: { seats: Seat[]; selected: string | null; onSelect: (s: string) => void; wave: number }) {
  const bySeat = useMemo(() => new Map(seats.map((s) => [s.seat, s])), [seats])
  const cell = (r: number, l: string) => {
    const biz = r <= 5
    if (biz && (l === 'B' || l === 'E')) return <span key={l} />
    const id = `${r}${l}`, p = bySeat.get(id)
    const color = p ? RISK_HEX[p.band] : undefined
    return (
      <motion.button key={`${l}-${wave}`} type="button" disabled={!p} onClick={() => p && onSelect(id)}
        initial={{ scale: 0.6, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: r * 0.03, type: 'spring', stiffness: 300, damping: 18 }}
        aria-label={p ? `Seat ${id}, ${p.name}, ${(p.risk * 100).toFixed(0)}% risk${p.action_label ? ', ' + p.action_label : ''}` : `Seat ${id}, empty`}
        className={`relative grid aspect-square w-full place-items-center rounded-md text-[13px] font-semibold transition ${p ? 'cursor-pointer hover:scale-110' : 'cursor-default'} ${selected === id ? 'ring-2 ring-white' : ''}`}
        style={p ? { background: color, color: '#06101f', boxShadow: `0 0 14px -2px ${color}` } : { background: 'var(--line)', color: 'var(--muted)' }}>
        {l}
        {p?.action && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rotate-45 ring-2 ring-[var(--bg)]" style={{ background: ACTION_COLOR[p.action] }} />}
      </motion.button>
    )
  }
  return (
    <div className="h-full w-full overflow-auto px-4 pb-20 pt-20 sm:px-6" data-lenis-prevent>
      {/* wide: columns are rows */}
      <div className="hidden min-w-[880px] sm:block">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `2.2rem repeat(25, minmax(0, 1fr))` }}>
          <span />
          {ROWS.map((r) => <span key={r} className="text-center text-[13px] text-muted">{r}</span>)}
          {LETTERS.map((l, li) => (
            <div key={l} className="contents">
              <span className="grid place-items-center text-[13px] text-muted">{l}</span>
              {ROWS.map((r) => <div key={r} className={li === 3 ? 'mt-5' : ''}>{cell(r, l)}</div>)}
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between text-[13px] text-muted"><span>← Front · Business 1–5</span><span>Eco Plus 6–9</span><span>Eco 10–25 · Back →</span></div>
      </div>
      {/* phone: rows top to bottom */}
      <div className="mx-auto max-w-xs sm:hidden">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: '1.8rem repeat(3, 1fr) 0.8rem repeat(3, 1fr)' }}>
          <span />
          {LETTERS.map((l, i) => <span key={l} className="text-center text-[13px] text-muted" style={{ gridColumn: i < 3 ? i + 2 : i + 3 }}>{l}</span>)}
          {ROWS.map((r) => (
            <div key={r} className="contents">
              <span className="grid place-items-center text-[13px] text-muted">{r}</span>
              {LETTERS.slice(0, 3).map((l) => <div key={l}>{cell(r, l)}</div>)}
              <span />
              {LETTERS.slice(3).map((l) => <div key={l}>{cell(r, l)}</div>)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
