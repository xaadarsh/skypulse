import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Check, RotateCcw, Wand2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, DEFAULT_FEATURES, type BookingPrediction, type Features, type Prediction, type Recommendation } from '../api'
import { PassengerInputs } from '../components/PassengerInputs'
import { SHAP_TIP } from '../components/ReasonChart'
import { Button, Card, ErrorBox, Gauge, InfoTip, PageHero, RiskPill, Skeleton, Tabs } from '../components/ui'

const sig = (z: number) => 1 / (1 + Math.exp(-z))
const logit = (p: number) => Math.log(p / (1 - p))

/** SHAP waterfall in probability space: average passenger → each factor's push → this passenger. */
function Waterfall({ pred }: { pred: Prediction }) {
  const top = pred.reasons.slice(0, 8)
  const rest = pred.reasons.slice(8).reduce((a, r) => a + r.shap, 0)
  const steps = [...top.map((r) => ({ label: r.text.split(' →')[0], shap: r.shap })), { label: `${pred.reasons.length - 8} smaller factors`, shap: rest }]
  let z = logit(pred.base_prob)
  const rows = steps.map((s) => { const a = sig(z); z += s.shap; return { ...s, from: a, to: sig(z) } })
  return (
    <div role="img" aria-label="SHAP waterfall chart" className="text-[15px]">
      <div className="mb-2 flex justify-between text-muted"><span>Average passenger</span><span className="num">{(pred.base_prob * 100).toFixed(0)}%</span></div>
      <div className="space-y-2">
        {rows.map((r, i) => {
          const lo = Math.min(r.from, r.to), hi = Math.max(r.from, r.to), up = r.to >= r.from
          return (
            <div key={i} className="grid grid-cols-[minmax(0,11rem)_1fr_3.5rem] items-center gap-3">
              <span className="truncate" title={r.label}>{r.label}</span>
              <div className="relative h-5 rounded-md bg-line/60">
                <motion.div className="absolute top-0 h-5 rounded-md" initial={{ opacity: 0 }} animate={{ opacity: 1, left: `${lo * 100}%`, width: `${Math.max(0.8, (hi - lo) * 100)}%` }}
                  transition={{ delay: i * 0.04, type: 'spring', stiffness: 90, damping: 18 }}
                  style={{ background: up ? 'linear-gradient(90deg, color-mix(in srgb, var(--safe) 55%, transparent), var(--safe))' : 'linear-gradient(270deg, color-mix(in srgb, var(--risk) 55%, transparent), var(--risk))' }} />
              </div>
              <span className="num text-right font-semibold" style={{ color: up ? 'var(--safe)' : 'var(--risk)' }}>{up ? '+' : '−'}{(Math.abs(r.to - r.from) * 100).toFixed(1)}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex justify-between border-t border-line pt-3 font-semibold"><span>This passenger</span><span className="num">{(pred.prob * 100).toFixed(1)}%</span></div>
    </div>
  )
}

export default function Predictor() {
  const [f, setF] = useState<Features>(DEFAULT_FEATURES)
  const [mode, setMode] = useState<'full' | 'booking'>('full')
  const [pred, setPred] = useState<Prediction | null>(null)
  const [book, setBook] = useState<BookingPrediction | null>(null)
  const [rec, setRec] = useState<Recommendation | null>(null)
  const [err, setErr] = useState('')
  const [fixing, setFixing] = useState(false)
  const [applied, setApplied] = useState(false)

  const fromApply = useRef(false) // keep the "Applied" card when the change came from Apply
  useEffect(() => {
    if (fromApply.current) fromApply.current = false
    else { setRec(null); setApplied(false) }
    const t = setTimeout(() => {
      setErr('')
      const p = mode === 'full' ? api.predict(f).then(setPred) : api.predictBooking(f).then(setBook)
      p.catch((e) => setErr(e.message))
    }, 200)
    return () => clearTimeout(t)
  }, [f, mode])

  const fix = async () => {
    setFixing(true); setApplied(false)
    try { setRec(await api.recommend(f)) } catch (e) { setErr((e as Error).message) } finally { setFixing(false) }
  }
  const apply = () => {
    if (!rec) return
    setApplied(true)
    setTimeout(() => { fromApply.current = true; setF({ ...f, ...Object.fromEntries(rec.changes.map((c) => [c.feature, c.to])) }) }, 450)
  }
  const cur = mode === 'full' ? pred : book

  return (
    <div>
      <PageHero eyebrow="Single passenger" title={<>Will this passenger <span className="text-gradient">leave happy?</span></>}
        steps={['Describe the passenger', 'Read the score and reasons', 'Press “Fix it”']}>
        Change any answer and the model re-scores instantly. The chart shows which answers push the prediction up or down.
      </PageHero>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Tabs label="Model" value={mode} onChange={setMode} options={[{ value: 'full', label: 'In-flight model · 22 inputs' }, { value: 'booking', label: 'Booking-time model · 6 inputs' }]} />
        <Button variant="ghost" onClick={() => setF(DEFAULT_FEATURES)}><RotateCcw size={16} />Reset</Button>
      </div>
      {err && <div className="mb-6"><ErrorBox error={err} /></div>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
        <PassengerInputs value={f} onChange={setF} bookingOnly={mode === 'booking'} />
        <div className="space-y-5 lg:sticky lg:top-28 lg:h-fit">
          <Card className="text-center">
            {!cur ? <Skeleton className="mx-auto h-56 w-56 rounded-full" /> : (
              <>
                <Gauge value={cur.prob} label="chance of being satisfied" size={240} />
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <RiskPill band={cur.band} risk={cur.risk} />
                  <span className="text-[15px] font-semibold">{cur.prob >= 0.5 ? 'Predicted: satisfied' : 'Predicted: unhappy'}</span>
                </div>
                <p className="mt-2 text-sm text-muted">{cur.model}</p>
                {mode === 'full' && pred && <p className="mt-1 text-[15px] text-muted">Persona: <span className="font-semibold text-ink">{pred.segment}</span></p>}
                {mode === 'booking' && book && (
                  <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-left text-[15px] text-muted ring-1 ring-inset ring-line">
                    <strong className="text-warn">Honest note:</strong> at booking we only know 6 facts, so this model is right <strong className="text-ink">{(book.accuracy * 100).toFixed(1)}%</strong> of the time (F1 {book.f1.toFixed(3)}) — far below the in-flight model.
                  </p>
                )}
              </>
            )}
          </Card>
          {mode === 'full' && (
            <Card>
              <div className="mb-4 flex items-center font-display text-lg font-semibold">How the score was built<InfoTip label="What is SHAP?">{SHAP_TIP}</InfoTip></div>
              {pred ? <Waterfall pred={pred} /> : <Skeleton className="h-72" />}
            </Card>
          )}
          {mode === 'full' && (
            <Card>
              <Button size="lg" className="w-full" onClick={fix} disabled={fixing}><Wand2 size={19} />{fixing ? 'Searching…' : 'Fix it — smallest changes to satisfy'}</Button>
              <AnimatePresence>
                {rec && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="pt-5">
                      {rec.already_satisfied ? <p className="text-muted">Already predicted satisfied — nothing to fix.</p>
                        : rec.changes.length === 0 ? <p className="text-muted">No combination of +2 stars per service flips this passenger.</p> : (
                          <>
                            <div className="flex flex-wrap gap-2">
                              {rec.changes.map((c, i) => (
                                <motion.span key={c.feature} initial={{ opacity: 0, y: 8 }} animate={applied ? { scale: [1, 1.12, 1], opacity: 1, y: 0 } : { opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-[15px] ring-1 ring-inset ring-line">
                                  {c.label} <span className="text-risk">{c.from}★</span><ArrowRight size={14} className="text-muted" /><span className="font-semibold text-safe">{c.to}★</span>
                                </motion.span>
                              ))}
                            </div>
                            <p className="mt-3 text-[15px] text-muted">{rec.changes.length} change{rec.changes.length > 1 ? 's' : ''}: {(rec.start_prob * 100).toFixed(0)}% → <strong className="text-ink">{(rec.end_prob * 100).toFixed(0)}%</strong>{rec.flipped ? '' : ' (still below 50%)'}</p>
                            <Button variant="soft" className="mt-4 w-full" onClick={apply} disabled={applied}>{applied ? <><Check size={16} />Applied to the form</> : 'Apply these changes'}</Button>
                          </>
                        )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
