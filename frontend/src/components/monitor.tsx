import { motion } from 'framer-motion'
import { ArrowDown, ArrowUp, CloudLightning, Database, FileUp, History, PlaneTakeoff, Sparkles, Trash2, UserPlus, UtensilsCrossed, Wallet, WifiOff, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { inr, pct, type Flight, type FlightSummary } from '../api'
import { Reveal } from '../lib/motion'
import { Button, Card, fieldCls, Toggle2 } from './ui'

export function CreateFlightCard({ busy, onCreate }: { busy: boolean; onCreate: (fd: FormData) => void }) {
  const [source, setSource] = useState(0) // 0 dataset, 1 manifest, 2 manual
  const [count, setCount] = useState(120)
  const [code, setCode] = useState('')
  const [route, setRoute] = useState('DEL → BOM')
  const [file, setFile] = useState<File | null>(null)
  const src = (['dataset', 'manifest', 'manual'] as const)[source]
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const fd = new FormData()
    fd.append('source', src); fd.append('count', String(count)); fd.append('code', code); fd.append('route', route)
    if (file) fd.append('file', file)
    onCreate(fd)
  }
  const fill = `${((count - 20) / 120) * 100}%`
  return (
    <Card className="mx-auto w-full max-w-2xl !p-6 sm:!p-8">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <h2 className="font-display text-[28px] font-semibold">Create a flight</h2>
          <p className="mt-1 text-base text-muted">Choose where the passengers come from.</p>
        </div>
        <div>
          <div className="mb-2 text-[15px] font-medium text-muted">Passengers from</div>
          <Toggle2 label="Passenger source" value={source} onChange={setSource} options={['Real dataset', 'Upload CSV', 'Add by hand']} />
          <p className="mt-2 text-[13px] text-muted">
            {source === 0 && 'Real passengers sampled from the Kaggle test set, seated by their class.'}
            {source === 1 && 'Upload a passenger manifest in the Kaggle column format (optional Name and Seat columns).'}
            {source === 2 && 'Start with an empty cabin and add passengers one by one.'}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-[15px] font-medium text-muted">Flight code<input className={`${fieldCls} mt-2`} placeholder="Auto (e.g. SP-101)" value={code} maxLength={12} onChange={(e) => setCode(e.target.value)} /></label>
          <label className="text-[15px] font-medium text-muted">Route<input className={`${fieldCls} mt-2`} value={route} maxLength={40} onChange={(e) => setRoute(e.target.value)} /></label>
        </div>
        {source === 0 && (
          <div>
            <div className="flex items-baseline justify-between"><label htmlFor="count" className="text-[15px] font-medium text-muted">Number of passengers</label><span className="num font-display text-lg font-semibold">{count}</span></div>
            <input id="count" type="range" className="slider" min={20} max={140} step={10} value={count} style={{ '--fill': fill } as React.CSSProperties} onChange={(e) => setCount(+e.target.value)} />
          </div>
        )}
        {source === 1 && (
          <label className="animated-border flex cursor-pointer flex-col items-center rounded-3xl px-6 py-8 text-center">
            <FileUp className="text-brand" size={28} />
            <span className="mt-2 font-semibold">{file ? file.name : 'Choose a CSV file'}</span>
            <span className="text-sm text-muted">or <a href="/sample_passengers.csv" download className="text-brand underline" onClick={(e) => e.stopPropagation()}>download the sample manifest</a></span>
            <input type="file" accept=".csv" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        )}
        <Button type="submit" size="lg" magnetic className="w-full" disabled={busy || (source === 1 && !file)}>
          <PlaneTakeoff size={20} />{busy ? 'Boarding passengers…' : 'Create flight'}
        </Button>
      </form>
    </Card>
  )
}

export function FlightStrip({ flights, current, onOpen, onDelete }: { flights: FlightSummary[]; current?: number; onOpen: (id: number) => void; onDelete: (id: number) => void }) {
  return (
    <div className="-mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-3 sm:-mx-8 sm:px-8" data-lenis-prevent>
      {flights.map((f, i) => {
        const sat = f.avg_satisfaction ?? 0
        return (
          <motion.div key={f.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`glass glow-card group relative w-72 shrink-0 snap-start rounded-3xl p-5 transition ${current === f.id ? 'ring-2 ring-a1/60' : ''}`}>
            <button onClick={() => onOpen(f.id)} className="block w-full text-left" aria-label={`Open flight ${f.code}`}>
              <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
                {f.source === 'dataset' ? <Database size={14} /> : f.source === 'manifest' ? <FileUp size={14} /> : <UserPlus size={14} />}
                {f.source === 'dataset' ? 'Real dataset' : f.source === 'manifest' ? 'Uploaded manifest' : 'Added by hand'}
              </div>
              <div className="mt-2 font-display text-2xl font-semibold">{f.code}</div>
              <div className="text-[15px] text-muted">{f.route}</div>
              <div className="mt-4 flex items-end justify-between">
                <div><div className="text-[13px] text-muted">At risk</div><div className="font-display text-xl font-semibold text-risk">{f.at_risk}<span className="text-sm text-muted"> / {f.n}</span></div></div>
                <div className="text-right"><div className="text-[13px] text-muted">Avg satisfaction</div><div className="font-display text-xl font-semibold">{pct(sat)}</div></div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-safe" style={{ width: pct(sat) }} /></div>
            </button>
            <button onClick={() => onDelete(f.id)} aria-label={`Delete flight ${f.code}`}
              className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-muted opacity-70 transition hover:bg-risk/10 hover:text-risk group-hover:opacity-100"><Trash2 size={16} /></button>
          </motion.div>
        )
      })}
    </div>
  )
}

export type Col<T> = { key: string; label: ReactNode; render: (r: T) => ReactNode; sort?: (r: T) => number | string; align?: 'right' }

export function SortTable<T>({ rows, cols, rowKey, initialSort, maxHeight = 520 }: { rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string | number; initialSort?: string; maxHeight?: number }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(initialSort ? { key: initialSort, dir: -1 } : null)
  const sorted = useMemo(() => {
    const c = cols.find((c) => c.key === sort?.key)
    if (!c?.sort || !sort) return rows
    return [...rows].sort((a, b) => (c.sort!(a) > c.sort!(b) ? 1 : c.sort!(a) < c.sort!(b) ? -1 : 0) * sort.dir)
  }, [rows, cols, sort])
  return (
    <>
    {/* phones: one card per row */}
    <ul className="space-y-3 sm:hidden">
      {sorted.map((r) => (
        <li key={rowKey(r)} className="rounded-2xl bg-surface p-4 ring-1 ring-inset ring-line">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
            {cols.map((c) => <div key={c.key} className="contents"><dt className="text-[13px] font-semibold uppercase tracking-wider text-muted">{c.label}</dt><dd className="flex min-w-0 flex-wrap justify-end text-right">{c.render(r)}</dd></div>)}
          </dl>
        </li>
      ))}
    </ul>
    <div className="hidden overflow-auto rounded-2xl ring-1 ring-inset ring-line sm:block" style={{ maxHeight }} data-lenis-prevent>
      <table className="w-full min-w-[640px] text-[15px]">
        <thead className="sticky top-0 z-10 bg-surface-strong">
          <tr>
            {cols.map((c) => (
              <th key={c.key} scope="col" className={`px-4 py-3 text-[13px] font-semibold uppercase tracking-wider text-muted ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                {c.sort ? (
                  <button className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-ink" onClick={() => setSort({ key: c.key, dir: sort?.key === c.key && sort.dir === -1 ? 1 : -1 })}>
                    {c.label}{sort?.key === c.key && (sort.dir === 1 ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
                  </button>
                ) : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={rowKey(r)} className="border-t border-line transition-colors hover:bg-surface-hover">
              {cols.map((c) => <td key={c.key} className={`px-4 py-3 align-top ${c.align === 'right' ? 'text-right' : ''}`}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  )
}

const EVENT_META: Record<string, { label: string; icon: typeof History; color: string }> = {
  created: { label: 'Flight created', icon: PlaneTakeoff, color: 'var(--a1)' },
  delay: { label: 'Delay', icon: History, color: 'var(--warn)' },
  wifi_outage: { label: 'Wifi outage', icon: WifiOff, color: 'var(--risk)' },
  meal_shortage: { label: 'Meal shortage', icon: UtensilsCrossed, color: 'var(--risk)' },
  turbulence: { label: 'Turbulence', icon: CloudLightning, color: 'var(--risk)' },
  recover: { label: 'Auto-Recover', icon: Sparkles, color: 'var(--safe)' },
  optimize: { label: 'Budget plan', icon: Wallet, color: 'var(--a2)' },
  passenger_added: { label: 'Passenger added', icon: UserPlus, color: 'var(--a1)' },
  passenger_edited: { label: 'Passenger edited', icon: Users, color: 'var(--a1)' },
  passenger_removed: { label: 'Passenger removed', icon: Trash2, color: 'var(--muted)' },
}

function describe(kind: string, d: Record<string, unknown>) {
  const r = (k: string) => pct(d[k] as number, 1)
  if (kind === 'created') return `${d.passengers} passengers · ${d.note ?? d.file ?? d.source}`
  if (['delay', 'wifi_outage', 'meal_shortage', 'turbulence'].includes(kind)) return `${d.changed} seats changed · average risk ${r('avg_risk_before')} → ${r('avg_risk_after')} · ${d.at_risk_after} at risk`
  if (kind === 'recover') return `${d.actions} actions · ${inr(d.total_cost as number)} · average risk ${r('avg_risk_before')} → ${r('avg_risk_after')}`
  if (kind === 'optimize') return `Budget ${inr(d.budget as number)} · spent ${inr(d.total_cost as number)} · ${d.expected_saved} passengers expected saved${d.applied ? ' · applied to the flight' : ''}`
  return `${d.name ?? ''}${d.seat ? ' · seat ' + d.seat : ''}`
}

export function Timeline({ flight }: { flight: Flight }) {
  return (
    <ol className="relative ml-5 space-y-6 border-l border-line pl-8">
      {flight.events.map((e, i) => {
        const m = EVENT_META[e.kind] ?? { label: e.kind, icon: History, color: 'var(--muted)' }
        const I = m.icon
        return (
          <Reveal as="li" key={e.id} delay={Math.min(i, 8) * 0.05} className="relative">
            <span className="absolute -left-[3.05rem] grid h-9 w-9 place-items-center rounded-full ring-4 ring-[var(--bg)]" style={{ background: `color-mix(in srgb, ${m.color} 22%, var(--bg))`, color: m.color }}><I size={16} /></span>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <strong className="font-display text-lg">{m.label}{e.kind === 'delay' ? ` · ${e.detail.minutes} min` : ''}</strong>
              <time className="num text-sm text-muted">{e.created_at.replace('T', ' ').slice(0, 16)}</time>
            </div>
            <p className="mt-1 text-[15px] text-muted">{describe(e.kind, e.detail)}</p>
          </Reveal>
        )
      })}
    </ol>
  )
}

export function Summary({ items }: { items: { label: ReactNode; value: ReactNode; tone?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it, i) => (
        <div key={i} className="rounded-2xl bg-surface px-5 py-4 ring-1 ring-inset ring-line">
          <div className="flex items-center text-[13px] font-medium text-muted">{it.label}</div>
          <div className="mt-1 font-display text-2xl font-semibold" style={{ color: it.tone }}>{it.value}</div>
        </div>
      ))}
    </div>
  )
}

export function BudgetChips({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {[10000, 30000, 60000, 100000].map((b) => (
        <button key={b} type="button" onClick={() => onChange(b)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${value === b ? 'bg-accent text-[var(--on-accent)]' : 'bg-surface text-muted ring-1 ring-inset ring-line hover:text-ink'}`}>{inr(b)}</button>
      ))}
    </div>
  )
}

