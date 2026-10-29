import { Trophy } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { pct, type Insights } from '../../api'
import { CountUp, Reveal } from '../../lib/motion'
import { SHAP_TIP } from '../ReasonChart'
import { Card, InfoTip } from '../ui'

const MODEL_COLORS: Record<string, string> = { 'Logistic Regression': '#94a3b8', 'SVM (RBF)': '#818cf8', 'Random Forest': '#a78bfa', XGBoost: '#38bdf8', 'Booking-time XGBoost': '#fbbf24' }
export const tip = {
  contentStyle: { background: 'var(--surface-strong)', border: '1px solid var(--line)', borderRadius: 14, fontSize: 14, color: 'var(--ink)', boxShadow: '0 20px 40px -20px rgba(0,0,0,.6)' },
  labelStyle: { color: 'var(--ink)', fontWeight: 600 }, itemStyle: { color: 'var(--ink)' },
}
export const axis = { tick: { fill: 'var(--muted)', fontSize: 13 }, stroke: 'var(--line)', tickLine: false }
const TERMS = {
  Accuracy: 'Share of test passengers the model got right.',
  Precision: 'When the model says “satisfied”, how often it is right.',
  Recall: 'Of all truly satisfied passengers, how many the model found.',
  F1: 'Balance of precision and recall (higher is better). We pick the winner by F1.',
  'ROC-AUC': 'How well the model ranks satisfied above unsatisfied passengers. 1.0 = perfect, 0.5 = guessing.',
}

export function ModelLab({ ins }: { ins: Insights }) {
  const m = ins.metrics
  const all = { ...m.models, 'Booking-time XGBoost': m.booking_model }
  const keys = ['accuracy', 'precision', 'recall', 'f1', 'roc_auc'] as const
  const best = m.models[m.best_model], served = m.models[m.served_model]
  const compare = keys.map((k, i) => ({ metric: Object.keys(TERMS)[i], Full: served[k], Booking: m.booking_model[k] }))

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card className="relative overflow-hidden">
          <div aria-hidden className="absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-40 blur-3xl" style={{ background: 'radial-gradient(circle, var(--a2), transparent 70%)' }} />
          <div className="relative flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-brand"><Trophy size={16} />Winner by F1</div>
          <div className="relative mt-3 font-display text-5xl font-semibold tracking-tight">{m.best_model}</div>
          <div className="relative mt-6 grid grid-cols-3 gap-4">
            {[['Accuracy', best.accuracy * 100, '%'], ['F1', best.f1, ''], ['ROC-AUC', best.roc_auc, '']].map(([l, v, u]) => (
              <div key={l as string}><div className="text-sm text-muted">{l}</div><div className="text-gradient font-display text-3xl font-semibold sm:text-4xl"><CountUp value={v as number} format={(x) => (u ? x.toFixed(1) + u : x.toFixed(3))} /></div></div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">Used in the app</div>
          <div className="mt-3 font-display text-3xl font-semibold">{m.served_model} <span className="text-lg font-normal text-muted">F1 {served.f1.toFixed(4)}</span></div>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">{m.serving_reason}.</p>
          <p className="mt-3 text-[13px] text-muted">Trained on {m.split.train.toLocaleString('en-IN')} passengers · tested on {m.split.test.toLocaleString('en-IN')} unseen passengers (stratified 80/20).</p>
        </Card>
      </div>

      <Reveal>
        <Card className="overflow-x-auto">
          <h3 className="mb-4 font-display text-2xl font-semibold">All models on the test set</h3>
          <table className="w-full min-w-[760px] text-[15px]">
            <thead><tr className="text-left text-[13px] uppercase tracking-wider text-muted">
              <th className="py-3 pr-4">Model</th>
              {Object.entries(TERMS).map(([h, t]) => <th key={h} className="py-3 pr-4 text-right"><span className="inline-flex items-center">{h}<InfoTip label={`What is ${h}?`}>{t}</InfoTip></span></th>)}
              <th className="py-3 text-right">Fit time</th>
            </tr></thead>
            <tbody>
              {Object.entries(all).map(([name, x]) => {
                const win = name === m.best_model
                return (
                  <tr key={name} className={`border-t border-line ${win ? 'bg-brand-soft' : ''}`}>
                    <td className="py-4 pr-4">
                      <div className="flex flex-wrap items-center gap-2 font-semibold"><span className="h-3 w-3 rounded-full" style={{ background: MODEL_COLORS[name] }} />{name}
                        {win && <span className="bg-accent rounded-full px-2.5 py-0.5 text-[13px] font-bold text-[var(--on-accent)]">Best F1</span>}
                        {name === m.served_model && <span className="rounded-full px-2.5 py-0.5 text-[13px] font-bold text-brand ring-1 ring-inset ring-a1/50">In app</span>}</div>
                      {x.note && <div className="mt-1 max-w-sm text-[13px] text-muted">{x.note}</div>}
                    </td>
                    {keys.map((k) => <td key={k} className={`num py-4 pr-4 text-right ${win ? 'font-semibold' : ''}`}>{x[k].toFixed(4)}</td>)}
                    <td className="num py-4 text-right text-muted">{x.train_time_s}s</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-2">
        <Reveal><Card className="h-full">
          <h3 className="flex items-center font-display text-2xl font-semibold">ROC curves<InfoTip>Each curve shows how many satisfied passengers a model catches (up) against false alarms (right). Curves hugging the top-left corner are better.</InfoTip></h3>
          <div className="mt-4 h-[340px]">
            <ResponsiveContainer>
              <LineChart margin={{ top: 8, right: 12, left: -8, bottom: 16 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 6" />
                <XAxis type="number" dataKey="fpr" domain={[0, 1]} {...axis} label={{ value: 'False alarm rate', position: 'insideBottom', offset: -10, fill: 'var(--muted)', fontSize: 13 }} />
                <YAxis type="number" domain={[0, 1]} {...axis} />
                <Tooltip {...tip} formatter={(v) => Number(v).toFixed(3)} labelFormatter={(v) => `False alarm rate ${Number(v).toFixed(2)}`} />
                <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
                {Object.entries(all).map(([name, x]) => (
                  <Line key={name} name={`${name} (${x.roc_auc.toFixed(3)})`} data={x.roc_curve.map(([fpr, tpr]) => ({ fpr, tpr }))} dataKey="tpr"
                    stroke={MODEL_COLORS[name]} dot={false} strokeWidth={name === m.served_model || name === m.best_model ? 3 : 2} animationDuration={1400} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card></Reveal>
        <Reveal delay={0.08}><Card className="h-full">
          <h3 className="font-display text-2xl font-semibold">Booking-time vs in-flight</h3>
          <p className="mt-1 text-[15px] text-muted">Honest comparison: with only the 6 facts known at booking, the model is much weaker. The in-flight experience decides satisfaction.</p>
          <div className="mt-4 h-[300px]">
            <ResponsiveContainer>
              <BarChart data={compare} margin={{ top: 8, right: 8, left: -12, bottom: 4 }} barCategoryGap="22%">
                <defs>
                  <linearGradient id="gFull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#38bdf8" /><stop offset="1" stopColor="#a78bfa" /></linearGradient>
                  <linearGradient id="gBook" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fbbf24" /><stop offset="1" stopColor="#f59e0b" stopOpacity={0.6} /></linearGradient>
                </defs>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="metric" {...axis} /><YAxis domain={[0.5, 1]} {...axis} />
                <Tooltip {...tip} formatter={(v) => Number(v).toFixed(4)} cursor={{ fill: 'var(--brand-soft)' }} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Bar dataKey="Full" name={`In-flight ${m.served_model}`} fill="url(#gFull)" radius={[8, 8, 0, 0]} animationDuration={1200} />
                <Bar dataKey="Booking" name="Booking-time XGBoost" fill="url(#gBook)" radius={[8, 8, 0, 0]} animationDuration={1200} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card></Reveal>
      </div>

      <Reveal><Card>
        <h3 className="flex items-center font-display text-2xl font-semibold">Confusion matrices<InfoTip>Rows are what really happened, columns are what the model predicted. Green = correct, red = mistakes.</InfoTip></h3>
        <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {Object.entries(all).map(([name, x]) => {
            const cm = x.confusion_matrix, total = cm.flat().reduce((a, b) => a + b, 0)
            return (
              <div key={name}>
                <div className="mb-2 text-[15px] font-semibold">{name}</div>
                <div className="grid grid-cols-2 gap-1.5 text-center">
                  {cm.flat().map((v, i) => {
                    const ok = i === 0 || i === 3, share = v / total
                    return (
                      <div key={i} className="rounded-xl px-2 py-3" style={{ background: `color-mix(in srgb, ${ok ? 'var(--safe)' : 'var(--risk)'} ${Math.round(10 + share * 110)}%, transparent)` }}>
                        <div className="num font-display text-lg font-semibold">{v.toLocaleString('en-IN')}</div>
                        <div className="text-[13px] text-ink/80">{['Unhappy ✓', 'False happy', 'Missed happy', 'Happy ✓'][i]}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </Card></Reveal>

      <div className="grid gap-6 lg:grid-cols-2">
        <Reveal><Card className="h-full">
          <h3 className="flex items-center font-display text-2xl font-semibold">What drives satisfaction<InfoTip label="What is SHAP?">{SHAP_TIP} Here: the average size of each factor’s push over 3,000 test passengers.</InfoTip></h3>
          <div className="mt-4 h-[560px]">
            <ResponsiveContainer>
              <BarChart data={ins.shap_global} layout="vertical" margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
                <defs><linearGradient id="gShap" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#38bdf8" /><stop offset="1" stopColor="#a78bfa" /></linearGradient></defs>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 6" horizontal={false} />
                <XAxis type="number" {...axis} /><YAxis type="category" dataKey="label" width={150} {...axis} interval={0} />
                <Tooltip {...tip} formatter={(v) => Number(v).toFixed(3)} cursor={{ fill: 'var(--brand-soft)' }} />
                <Bar dataKey="importance" name="Average push" fill="url(#gShap)" radius={[0, 8, 8, 0]} animationDuration={1200} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card></Reveal>
        <Reveal delay={0.08}><Card className="h-full overflow-x-auto">
          <h3 className="flex items-center font-display text-2xl font-semibold">Fairness check<InfoTip>Does the model work equally well for different groups? We compare accuracy and F1 across gender and age.</InfoTip></h3>
          <table className="mt-4 w-full text-[15px]">
            <thead><tr className="text-left text-[13px] uppercase tracking-wider text-muted"><th className="py-2">Group</th><th className="text-right">Passengers</th><th className="text-right">Accuracy</th><th className="text-right">F1</th></tr></thead>
            <tbody>{ins.fairness.map((r) => (
              <tr key={r.attribute + r.group} className="border-t border-line">
                <td className="py-3"><span className="text-muted">{r.attribute}:</span> <span className="font-semibold">{r.group}</span></td>
                <td className="num text-right">{r.n.toLocaleString('en-IN')}</td>
                <td className="num text-right">{pct(r.accuracy, 1)}</td>
                <td className="num text-right">{r.f1.toFixed(3)}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-[15px] text-muted ring-1 ring-inset ring-line">
            Accuracy gap: <strong className="text-ink">{gap(ins.fairness.filter((r) => r.attribute === 'Gender').map((r) => r.accuracy))} pts</strong> between genders and <strong className="text-ink">{gap(ins.fairness.filter((r) => r.attribute === 'Age group').map((r) => r.accuracy))} pts</strong> across age groups. F1 is lower for under-25 and 60+, who also have far fewer satisfied passengers.
          </p>
        </Card></Reveal>
      </div>
    </div>
  )
}

const gap = (xs: number[]) => ((Math.max(...xs) - Math.min(...xs)) * 100).toFixed(2)
