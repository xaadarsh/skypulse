import { motion } from 'framer-motion'
import { ArrowRight, Pencil, Trash2, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type Prediction, type Recommendation, type Seat } from '../api'
import { ReasonChart } from './ReasonChart'
import { Button, Drawer, ErrorBox, Gauge, InfoTip, RiskPill, Skeleton } from './ui'

export function SeatDrawer({ seat, onClose, onEdit, onRemove }: { seat: Seat | null; onClose: () => void; onEdit: () => void; onRemove: () => void }) {
  const [pred, setPred] = useState<Prediction | null>(null)
  const [rec, setRec] = useState<Recommendation | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!seat) return
    let live = true
    setPred(null); setRec(null); setErr('')
    Promise.all([api.predict(seat.features), api.recommend(seat.features)])
      .then(([p, r]) => { if (live) { setPred(p); setRec(r) } })
      .catch((e) => live && setErr(e.message))
    return () => { live = false }
  }, [seat?.id, seat?.risk, seat?.action]) // eslint-disable-line react-hooks/exhaustive-deps

  const f = seat?.features
  return (
    <Drawer open={!!seat} onClose={onClose} title={seat ? `Seat ${seat.seat} · ${seat.name}` : ''}>
      {seat && f && (
        <div className="space-y-7">
          <div className="flex flex-wrap items-center gap-3">
            <RiskPill band={seat.band} risk={seat.risk} />
            <span className="text-[15px] text-muted">{seat.class_name}{seat.dataset_id != null && ` · dataset passenger #${seat.dataset_id}`}</span>
          </div>
          <dl className="grid grid-cols-3 gap-3">
            {[['Age', f.age], ['Gender', f.gender ? 'Male' : 'Female'], ['Customer', f.customer_type ? 'Loyal' : 'First-time'],
              ['Trip', f.travel_type ? 'Business' : 'Personal'], ['Distance', `${f.flight_distance} mi`], ['Delay', `${Math.round(f.dep_delay)} min`]].map(([k, v]) => (
              <div key={k as string} className="rounded-2xl bg-surface px-4 py-3 ring-1 ring-inset ring-line"><dt className="text-[13px] text-muted">{k}</dt><dd className="mt-0.5 font-semibold">{v}</dd></div>
            ))}
          </dl>
          {err && <ErrorBox error={err} />}
          {!pred && !err && <><Skeleton className="mx-auto h-52 w-52 rounded-full" /><Skeleton className="h-56" /></>}
          {pred && (
            <>
              <div className="text-center">
                <Gauge value={pred.prob} label="chance of being satisfied" size={210} />
                <p className="mt-3 text-[15px] text-muted">Persona: <span className="font-semibold text-ink">{pred.segment}</span></p>
              </div>
              <ReasonChart reasons={pred.reasons.slice(0, 6)} />
            </>
          )}
          {seat.action_label && (
            <div className="rounded-3xl border border-a1/30 bg-brand-soft p-5">
              <div className="text-[13px] font-semibold uppercase tracking-wider text-brand">Action taken</div>
              <div className="mt-1 font-display text-xl font-semibold">{seat.action_label}</div>
              {seat.message && <p className="mt-2 text-[15px] leading-relaxed text-muted">“{seat.message}”</p>}
            </div>
          )}
          {rec && (
            <div className="rounded-3xl border border-line p-5">
              <h4 className="flex items-center gap-2 font-display text-lg font-semibold"><Wand2 size={18} className="text-brand" />What would fix it
                <InfoTip>The smallest set of service-rating improvements (at most +2 stars each) that would make the model predict “satisfied”.</InfoTip></h4>
              {rec.already_satisfied ? <p className="mt-2 text-muted">Already predicted satisfied — nothing to fix.</p> : rec.changes.length ? (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {rec.changes.map((c, i) => (
                      <motion.span key={c.feature} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.06 }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm ring-1 ring-inset ring-line">
                        {c.label} <span className="text-risk">{c.from}★</span><ArrowRight size={13} className="text-muted" /><span className="font-semibold text-safe">{c.to}★</span>
                      </motion.span>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-muted">Satisfaction {(rec.start_prob * 100).toFixed(0)}% → <strong className="text-ink">{(rec.end_prob * 100).toFixed(0)}%</strong>{rec.flipped ? ' — flips to satisfied.' : ' — still not enough within +2 stars.'}</p>
                </>
              ) : <p className="mt-2 text-muted">No service change within +2 stars flips this passenger.</p>}
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onEdit} className="flex-1"><Pencil size={16} />Edit passenger</Button>
            <Button variant="danger" onClick={onRemove}><Trash2 size={16} />Remove</Button>
          </div>
        </div>
      )}
    </Drawer>
  )
}
