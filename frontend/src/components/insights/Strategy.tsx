import { motion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, LABELS, pct, RATING_KEYS, type Insights, type StrategyResult } from '../../api'
import { CountUp } from '../../lib/motion'
import { Button, Card, ErrorBox, fieldCls, InfoTip, Toggle2 } from '../ui'

export function Strategy({ ins }: { ins: Insights }) {
  const [service, setService] = useState('online_boarding')
  const [amount, setAmount] = useState(1)
  const [cls, setCls] = useState('all')
  const [seg, setSeg] = useState('all')
  const [res, setRes] = useState<StrategyResult | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true); setErr('')
    try { setRes(await api.strategy({ service, amount, travel_class: cls === 'all' ? null : +cls, segment: seg === 'all' ? null : +seg })) }
    catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  useEffect(() => { run() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
      <Card className="space-y-6">
        <div>
          <h3 className="font-display text-2xl font-semibold">What if we improved…</h3>
          <p className="mt-1 text-[15px] text-muted">Pick one service and a group. The model re-scores all {ins.eda.test_rows.toLocaleString('en-IN')} held-out passengers.</p>
        </div>
        <label className="block text-[15px] font-medium text-muted">Service
          <select className={`${fieldCls} mt-2`} value={service} onChange={(e) => setService(e.target.value)}>
            {RATING_KEYS.map((k) => <option key={k} value={k}>{LABELS[k]}</option>)}
          </select>
        </label>
        <div><div className="mb-2 text-[15px] font-medium text-muted">Improvement</div>
          <Toggle2 label="Improvement" value={amount - 1} onChange={(v) => setAmount(v + 1)} options={['+1 star', '+2 stars', '+3 stars']} /></div>
        <label className="block text-[15px] font-medium text-muted">Cabin class
          <select className={`${fieldCls} mt-2`} value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="all">All classes</option><option value="0">Eco</option><option value="1">Eco Plus</option><option value="2">Business</option>
          </select>
        </label>
        <label className="block text-[15px] font-medium text-muted">Passenger persona
          <select className={`${fieldCls} mt-2`} value={seg} onChange={(e) => setSeg(e.target.value)}>
            <option value="all">Everyone</option>
            {ins.segments.segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <Button size="lg" className="w-full" onClick={run} disabled={busy}><TrendingUp size={19} />{busy ? 'Simulating…' : 'Run simulation'}</Button>
        <p className="text-[13px] text-muted">Ratings are capped at 5 stars; “not used” answers stay unchanged.</p>
      </Card>
      <Card>
        {err && <ErrorBox error={err} />}
        {!res && !err && <div className="skeleton h-80" />}
        {res && (
          <div key={`${res.service}${res.amount}${res.n}${res.after}`}>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">Result</p>
            <h3 className="mt-2 font-display text-3xl font-semibold">{res.label} +{res.amount} star{res.amount > 1 ? 's' : ''}</h3>
            <p className="mt-1 text-[15px] text-muted">{res.n.toLocaleString('en-IN')} passengers in this group · actual satisfied rate in the data {pct(res.actual_rate, 1)}</p>
            <div className="mt-10 space-y-8">
              {[{ l: 'Before', v: res.before, bg: 'var(--line-strong)' }, { l: 'After', v: res.after, bg: 'linear-gradient(90deg, var(--a1), var(--a2))' }].map((b, i) => (
                <div key={b.l}>
                  <div className="mb-2 flex items-baseline justify-between"><span className="text-lg font-semibold">{b.l}</span><span className="num font-display text-3xl font-semibold">{pct(b.v, 1)}</span></div>
                  <div className="h-12 overflow-hidden rounded-2xl bg-line/60">
                    <motion.div className="h-full rounded-2xl" style={{ background: b.bg, boxShadow: i ? '0 0 30px -6px var(--a1)' : undefined }}
                      initial={{ width: 0 }} animate={{ width: `${b.v * 100}%` }} transition={{ delay: i * 0.3, duration: 1.1, ease: [0.16, 1, 0.3, 1] }} />
                  </div>
                  <div className="mt-1 text-[13px] text-muted">predicted satisfied</div>
                </div>
              ))}
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-surface p-5 ring-1 ring-inset ring-line"><div className="text-sm text-muted">Lift<InfoTip>Percentage points (pts) = the simple difference between the two percentages.</InfoTip></div><div className="font-display text-4xl font-semibold text-safe"><CountUp value={res.lift_pp} format={(v) => `+${v.toFixed(1)} pts`} /></div></div>
              <div className="rounded-2xl bg-surface p-5 ring-1 ring-inset ring-line"><div className="text-sm text-muted">Newly satisfied passengers</div><div className="font-display text-4xl font-semibold"><CountUp value={res.newly_satisfied} /></div></div>
              <div className="rounded-2xl bg-surface p-5 ring-1 ring-inset ring-line"><div className="text-sm text-muted">Average chance</div><div className="mt-1 font-display text-2xl font-semibold">{pct(res.avg_prob_before, 1)} → {pct(res.avg_prob_after, 1)}</div></div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
