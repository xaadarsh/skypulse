import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Box, CloudLightning, Database, FileUp, Grid3x3, History, Plus, ShieldCheck, Smile, Sparkles, Trash2, TriangleAlert, UserPlus, Users, UtensilsCrossed, Wallet, WifiOff } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, inr, pct, type Flight, type FlightSummary, type OptimizeResult, type RecoverResult } from '../api'
import { BudgetChips, CreateFlightCard, FlightStrip, SortTable, Summary, Timeline, type Col } from '../components/monitor'
import { PassengerForm } from '../components/PassengerForm'
import { SeatDrawer } from '../components/SeatDrawer'
import { SeatMap2D } from '../components/SeatMap2D'
import { bandOf, Button, Card, EmptyState, ErrorBox, fieldCls, InfoTip, Kpi, PageHero, RiskPill, Section, Skeleton, Tabs } from '../components/ui'
import { ACTION_COLOR } from '../three/colors'
import { Reveal } from '../lib/motion'

const Cabin = lazy(() => import('../three/Cabin'))
type Dock = 'events' | 'recovery' | 'budget'
const ACTION_NAMES: Record<string, string> = { apology: 'Apology', meal: 'Free meal', wifi: 'Wifi voucher', baggage: 'Priority baggage', lounge: 'Lounge pass', upgrade: 'Seat upgrade' }

function RiskChange({ before, after }: { before: number; after: number }) {
  return (
    <span className="num inline-flex flex-wrap items-center justify-end gap-2 sm:justify-start">
      <span style={{ color: before >= 0.5 ? 'var(--risk)' : 'var(--warn)' }}>{pct(before)}</span>
      <span className="text-muted">→</span>
      <RiskPill band={bandOf(after)} risk={after} />
    </span>
  )
}

export default function Monitor() {
  const [params, setParams] = useSearchParams()
  const [flights, setFlights] = useState<FlightSummary[] | null>(null)
  const [flight, setFlight] = useState<Flight | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [wave, setWave] = useState(0)
  const [view, setView] = useState<'3d' | '2d'>('3d')
  const [dock, setDock] = useState<Dock>('events')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [delay, setDelay] = useState(120)
  const [budget, setBudget] = useState(30000)
  const [recovery, setRecovery] = useState<RecoverResult | null>(null)
  const [opt, setOpt] = useState<OptimizeResult | null>(null)
  const [form, setForm] = useState<'add' | 'edit' | null>(null)
  const fid = Number(params.get('flight')) || null

  const refresh = useCallback(() => api.flights().then(setFlights).catch((e) => setErr(e.message)), [])
  useEffect(() => { refresh() }, [refresh])
  const run = async <T,>(label: string, fn: () => Promise<T>) => {
    setBusy(label); setErr('')
    try { return await fn() } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }
  useEffect(() => {
    if (!fid) { setFlight(null); return }
    run('open', async () => {
      const f = await api.flight(fid)
      setFlight(f); setSelected(null); setRecovery(null); setOpt(null); setDock('events'); setWave((w) => w + 1)
    })
  }, [fid]) // eslint-disable-line react-hooks/exhaustive-deps
  const open = (id: number | null) => setParams(id ? { flight: String(id) } : {})
  const updated = (f: Flight) => { setFlight(f); refresh() }

  const event = (kind: string) => flight && run(kind, async () => { const r = await api.event(flight.id, kind, delay); updated(r.flight); setWave((w) => w + 1) })
  const recover = () => flight && run('recover', async () => { const r = await api.recover(flight.id); setRecovery(r); updated(r.flight); setWave((w) => w + 1) })
  const optimize = (apply = false) => flight && run(apply ? 'apply' : 'optimize', async () => {
    const r = await api.optimize(flight.id, budget, apply)
    setOpt(r)
    if (apply) { updated(r.flight); setRecovery(null); setWave((w) => w + 1) }
  })
  const remove = (id: number) => {
    if (!window.confirm('Delete this flight and its full history? This cannot be undone.')) return
    run('delete', async () => { await api.deleteFlight(id); if (flight?.id === id) open(null); refresh() })
  }
  const seat = flight?.seats.find((s) => s.seat === selected) ?? null

  // ---------- step 1: no flight open ----------
  if (!fid) {
    return (
      <div>
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-12">
          <PageHero eyebrow="Live Flight Monitor" title={<>Watch a flight. <span className="text-gradient">Save its passengers.</span></>}
            steps={['Create a flight', 'Trigger an in-flight event', 'Recover at-risk passengers']}>
            Every seat is scored by our model. Make something go wrong on board, see who becomes unhappy, and let SkyPulse plan the recovery.
          </PageHero>
          <div className="lg:pt-6">
            {err && <div className="mb-6"><ErrorBox error={err} /></div>}
            <CreateFlightCard busy={busy === 'create'} onCreate={(fd) => run('create', async () => { const f = await api.createFlight(fd); refresh(); open(f.id) })} />
          </div>
        </div>
        <section className="mt-14">
          <Section eyebrow="History" title="Your flights">Every flight, event and action is saved — it is still here after a restart.</Section>
          {!flights && <div className="flex gap-4"><Skeleton className="h-48 w-72" /><Skeleton className="h-48 w-72" /></div>}
          {flights?.length === 0 && <Card><EmptyState title="No flights yet">Create your first flight above — “Real dataset” is the quickest way to start.</EmptyState></Card>}
          {!!flights?.length && <FlightStrip flights={flights} onOpen={open} onDelete={remove} />}
        </section>
      </div>
    )
  }

  // ---------- step 2: flight open ----------
  if (!flight) return <div className="space-y-5 pt-10" aria-busy="true"><Skeleton className="h-12 w-72" /><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div><Skeleton className="h-[60vh]" />{err && <ErrorBox error={err} />}</div>

  const s = flight.stats
  const recoveryCols: Col<RecoverResult['list'][number]>[] = [
    { key: 'seat', label: 'Seat', render: (r) => <button className="font-semibold text-brand underline-offset-4 hover:underline" onClick={() => setSelected(r.seat)}>{r.seat}</button>, sort: (r) => parseInt(r.seat) * 10 + r.seat.charCodeAt(r.seat.length - 1) },
    { key: 'action', label: 'Action', render: (r) => <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rotate-45" style={{ background: ACTION_COLOR[r.action] }} />{r.action_label}</span>, sort: (r) => r.action_label },
    { key: 'reason', label: 'Biggest complaint', render: (r) => <span className="text-muted">{r.reason.replace('Top negative driver: ', '')}</span> },
    { key: 'cost', label: 'Cost', align: 'right', render: (r) => <span className="num">{inr(r.cost)}</span>, sort: (r) => r.cost },
    { key: 'risk', label: 'Risk before → after', render: (r) => <RiskChange before={r.risk_before} after={r.risk_after} />, sort: (r) => r.risk_before - r.risk_after },
    { key: 'msg', label: 'Message', render: (r) => <details><summary className="cursor-pointer text-brand">Read</summary><p className="mt-2 max-w-sm text-sm text-muted">{r.message}</p></details> },
  ]
  const planCols: Col<OptimizeResult['plan'][number]>[] = [
    { key: 'seat', label: 'Seat', render: (r) => <button className="font-semibold text-brand underline-offset-4 hover:underline" onClick={() => setSelected(r.seat)}>{r.seat}</button>, sort: (r) => parseInt(r.seat) * 10 + r.seat.charCodeAt(r.seat.length - 1) },
    { key: 'action', label: 'Action', render: (r) => <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rotate-45" style={{ background: ACTION_COLOR[r.action] }} />{r.action_label}</span>, sort: (r) => r.action_label },
    { key: 'cost', label: 'Cost', align: 'right', render: (r) => <span className="num">{inr(r.cost)}</span>, sort: (r) => r.cost },
    { key: 'risk', label: 'Risk before → after', render: (r) => <RiskChange before={r.risk_before} after={r.risk_after} />, sort: (r) => r.risk_before - r.risk_after },
    { key: 'gain', label: 'Gain', align: 'right', render: (r) => <span className="num font-semibold text-safe">+{(r.gain * 100).toFixed(1)} pts</span>, sort: (r) => r.gain },
  ]

  return (
    <div>
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-8 pt-4">
        <div className="flex items-center gap-4">
          <button onClick={() => open(null)} aria-label="Back to all flights" className="glass grid h-12 w-12 shrink-0 place-items-center rounded-full transition hover:bg-surface-hover"><ArrowLeft size={20} /></button>
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{flight.code}</h1>
              <span className="text-xl text-muted">{flight.route}</span>
            </div>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-[13px] font-semibold text-brand ring-1 ring-inset ring-a1/30">
              {flight.source === 'dataset' ? <Database size={13} /> : flight.source === 'manifest' ? <FileUp size={13} /> : <UserPlus size={13} />}{flight.source_label}
              {flight.source === 'dataset' && <InfoTip>Profiles and service ratings are real passengers from the Kaggle test set. The flight starts on time — delays come from the events you trigger.</InfoTip>}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setForm('add')}><Plus size={16} />Add passenger</Button>
          <Button variant="danger" onClick={() => remove(flight.id)} aria-label="Delete flight"><Trash2 size={16} /></Button>
        </div>
      </div>
      {err && <div className="mb-6"><ErrorBox error={err} /></div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={<Users size={16} />} label="Passengers" value={s.passengers} hint={`${140 - s.passengers} empty seats`} />
        <Kpi icon={<TriangleAlert size={16} />} label="At risk" value={s.at_risk} tone="var(--risk)" hint="predicted to leave unhappy (risk ≥ 50%)" />
        <Kpi icon={<Smile size={16} />} label="Avg satisfaction" value={(s.avg_satisfaction ?? 0) * 100} format={(v) => `${v.toFixed(0)}%`} tone="var(--safe)" hint="average chance of being satisfied" />
        <Kpi icon={<Wallet size={16} />} label="Recovery cost" value={s.actions_cost} format={(v) => inr(Math.round(v))} hint={`${s.actions} actions · assumed costs`} />
      </div>

      {/* cabin hero */}
      <Reveal className="mt-6">
        <div className="glass relative h-[70vh] min-h-[460px] scroll-mt-24 overflow-hidden rounded-[2rem]" data-testid="cabin">
          {flight.seats.length === 0 ? (
            <div className="grid h-full place-items-center"><EmptyState title="The cabin is empty" action={<Button onClick={() => setForm('add')}><Plus size={16} />Add the first passenger</Button>}>
              Add passengers by hand — each one is scored the moment you save.</EmptyState></div>
          ) : view === '3d' ? (
            <Suspense fallback={<Skeleton className="h-full rounded-none" />}>
              <Cabin seats={flight.seats} selected={selected} onSelect={setSelected} wave={wave} />
            </Suspense>
          ) : <SeatMap2D seats={flight.seats} selected={selected} onSelect={setSelected} wave={wave} />}
          <div className="absolute left-4 top-4 z-10"><Tabs label="Cabin view" value={view} onChange={setView} options={[{ value: '3d', label: '3D', icon: <Box size={15} /> }, { value: '2d', label: 'Seat map', icon: <Grid3x3 size={15} /> }]} /></div>
          {view === '3d' && flight.seats.length > 0 && <div className="glass pointer-events-none absolute right-4 top-4 z-10 hidden rounded-full px-4 py-2 text-[13px] text-muted md:block">Scroll to zoom · drag to rotate · click a seat</div>}
          {flight.seats.length > 0 && (
            <div className="glass pointer-events-none absolute bottom-4 left-4 right-4 z-10 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-2xl px-4 py-2.5 text-[13px] sm:right-auto">
              {[['#2fd08f', 'Safe < 30%'], ['#f6b23c', 'Watch 30–50%'], ['#ff5d52', 'At risk ≥ 50%']].map(([c, t]) => <span key={t} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />{t}</span>)}
              {s.actions > 0 && Object.entries(ACTION_COLOR).map(([k, c]) => <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45" style={{ background: c }} />{ACTION_NAMES[k]}</span>)}
            </div>
          )}
        </div>
      </Reveal>

      {/* control dock */}
      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Tabs label="Controls" size="lg" value={dock} onChange={setDock} options={[
            { value: 'events', label: 'Events', icon: <CloudLightning size={17} className="hidden sm:block" /> },
            { value: 'recovery', label: 'Recovery', icon: <Sparkles size={17} className="hidden sm:block" /> },
            { value: 'budget', label: 'Budget', icon: <Wallet size={17} className="hidden sm:block" /> },
          ]} />
          {busy && <span className="text-sm text-muted" role="status">Working…</span>}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={dock} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }} className="mt-7">
            {dock === 'events' && (
              <div>
                <p className="text-lg text-muted">Make something go wrong on board. The model re-scores every seat instantly — watch the ripple run through the cabin.</p>
                <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
                  <div className="rounded-3xl bg-surface p-6 ring-1 ring-inset ring-line">
                    <div className="flex items-center gap-3"><History className="text-warn" size={22} /><span className="font-display text-xl font-semibold">Flight delay</span></div>
                    <div className="mt-4 flex items-baseline justify-between"><label htmlFor="delay" className="text-[15px] text-muted">Delay for the whole flight</label><span className="num font-display text-3xl font-semibold">{delay}<span className="text-base text-muted"> min</span></span></div>
                    <input id="delay" type="range" className="slider mt-2" min={0} max={300} step={5} value={delay} style={{ '--fill': `${delay / 3}%` } as React.CSSProperties} onChange={(e) => setDelay(+e.target.value)} />
                    <Button size="lg" className="mt-4 w-full" disabled={!!busy || !flight.seats.length} onClick={() => event('delay')}>Apply {delay}-minute delay</Button>
                  </div>
                  <div className="grid gap-3">
                    {[
                      { k: 'wifi_outage', t: 'Wifi outage', d: 'Wifi rating drops by 3 stars for everyone', I: WifiOff },
                      { k: 'meal_shortage', t: 'Meal shortage', d: 'Food rating −2 outside Business class', I: UtensilsCrossed },
                      { k: 'turbulence', t: 'Turbulence', d: 'Seat comfort, service and food −1 each', I: CloudLightning },
                    ].map(({ k, t, d, I }) => (
                      <button key={k} onClick={() => event(k)} disabled={!!busy || !flight.seats.length}
                        className="glow-card flex items-center gap-4 rounded-3xl bg-surface p-5 text-left ring-1 ring-inset ring-line transition hover:bg-surface-hover hover:ring-risk/40 disabled:opacity-45">
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-risk/12 text-risk" style={{ background: 'color-mix(in srgb, var(--risk) 14%, transparent)' }}><I size={22} /></span>
                        <span><span className="block font-display text-lg font-semibold">{busy === k ? 'Applying…' : t}</span><span className="block text-[15px] text-muted">{d}</span></span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {dock === 'recovery' && (
              <div>
                <p className="text-lg text-muted">For every at-risk passenger, SkyPulse finds their biggest complaint (from SHAP), picks a matching action, and re-scores them to estimate the new risk.</p>
                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <Button size="lg" magnetic disabled={!!busy || !flight.seats.length} onClick={recover}><Sparkles size={20} />{busy === 'recover' ? 'Recovering…' : 'Auto-Recover all at-risk passengers'}</Button>
                  <span className="text-[15px] text-muted">Costs are assumed values (configurable).</span>
                </div>
                {recovery ? (
                  <div className="mt-8 space-y-5">
                    <Summary items={[
                      { label: 'Actions taken', value: recovery.actions },
                      { label: 'Total cost', value: inr(recovery.total_cost) },
                      { label: 'Average risk', value: <span className="num">{pct(recovery.avg_risk_before, 0)} → <span className="text-safe">{pct(recovery.avg_risk_after, 0)}</span></span> },
                      { label: 'Now below 50% risk', value: recovery.saved, tone: 'var(--safe)' },
                    ]} />
                    <h3 className="pt-2 font-display text-xl font-semibold">Crew alerts <span className="text-base font-normal text-muted">· click a column to sort, a seat to open it</span></h3>
                    <SortTable rows={recovery.list} cols={recoveryCols} rowKey={(r) => r.passenger_id} initialSort="risk" />
                  </div>
                ) : <div className="mt-6 rounded-3xl border border-dashed border-line-strong p-6 text-center text-[15px] text-muted">The crew alert list (seat, action, reason, risk before → after and a personal message) appears here after Auto-Recover.</div>}
              </div>
            )}
            {dock === 'budget' && (
              <div>
                <p className="text-lg text-muted">Give SkyPulse a budget. The optimizer spends it where each rupee raises passengers’ chance of being satisfied the most — one action per passenger.</p>
                <div className="mt-6 flex flex-wrap items-end gap-4">
                  <label className="w-56 text-[15px] font-medium text-muted">Budget (₹)
                    <input type="number" min={0} step={1000} value={budget} onChange={(e) => setBudget(Math.max(0, +e.target.value))} className={`${fieldCls} num mt-2 font-display text-lg`} aria-label="Budget in rupees" />
                  </label>
                  <BudgetChips value={budget} onChange={setBudget} />
                  <Button size="lg" magnetic disabled={!!busy || !flight.seats.length} onClick={() => optimize(false)}><Wallet size={19} />{busy === 'optimize' ? 'Optimizing…' : 'Optimize'}</Button>
                </div>
                {opt ? (
                  <div className="mt-8 space-y-5" data-testid="optimizer">
                    <Summary items={[
                      { label: <>Passengers saved (expected)<InfoTip>Sum of the increase in each passenger’s chance of being satisfied. 1.0 = one whole passenger moved from certainly unhappy to certainly satisfied.</InfoTip></>, value: opt.expected_saved.toFixed(1), tone: 'var(--safe)' },
                      { label: 'Flipped to safe', value: opt.flipped },
                      { label: 'Spent', value: <span className="num">{inr(opt.total_cost)} <span className="text-base text-muted">/ {inr(opt.budget)}</span></span> },
                      { label: 'At-risk passengers', value: opt.at_risk },
                    ]} />
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <h3 className="font-display text-xl font-semibold">Budget plan <span className="text-base font-normal text-muted">· {opt.plan.length} actions</span></h3>
                      <Button disabled={!!busy || !opt.plan.length} onClick={() => optimize(true)}><ShieldCheck size={17} />{busy === 'apply' ? 'Applying…' : 'Apply this plan to the flight'}</Button>
                    </div>
                    {opt.plan.length ? <SortTable rows={opt.plan} cols={planCols} rowKey={(r) => r.passenger_id} initialSort="gain" />
                      : <p className="text-muted">No action raises anyone’s chance of being satisfied within this budget.</p>}
                  </div>
                ) : <div className="mt-6 rounded-3xl border border-dashed border-line-strong p-6 text-center text-[15px] text-muted">The plan (seat, action, cost, risk before → after) appears here after you press Optimize.</div>}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </Card>

      {/* history */}
      <section className="mt-20">
        <Section eyebrow="Saved in SQLite" title="Flight history">Everything that happened on this flight, newest first.</Section>
        <Card><Timeline flight={flight} /></Card>
      </section>

      <SeatDrawer seat={form ? null : seat} onClose={() => setSelected(null)} onEdit={() => setForm('edit')}
        onRemove={() => seat && window.confirm(`Remove ${seat.name} from the flight?`) && run('rm', async () => { updated(await api.deletePassenger(seat.id)); setSelected(null) })} />
      <PassengerForm open={form !== null} seat={form === 'edit' ? seat : null} onClose={() => setForm(null)}
        onSave={async (v) => { const f = await api.upsertPassenger({ flight_id: flight.id, passenger_id: form === 'edit' ? seat?.id : undefined, ...v }); updated(f); setWave((w) => w + 1) }} />
    </div>
  )
}
