import { motion } from 'framer-motion'
import { BrainCircuit, Database, MonitorSmartphone, Server } from 'lucide-react'
import { useEffect, useState } from 'react'
import { siFastapi, siFramer, siJupyter, siNumpy, siPandas, siPytest, siPython, siReact, siScikitlearn, siSqlite, siTailwindcss, siThreedotjs, siTypescript, siVite } from 'simple-icons'
import { TEAM } from '../App'
import { api, type Insights } from '../api'
import { Card, PageHero, Section } from '../components/ui'
import { Reveal, Tilt } from '../lib/motion'

const STACK = [
  ['Machine learning', [siPython, siPandas, siNumpy, siScikitlearn, siJupyter], 'scikit-learn · XGBoost · SHAP · K-Means · PCA'],
  ['Backend', [siFastapi, siSqlite, siPytest], 'FastAPI · SQLite · pytest'],
  ['Frontend', [siReact, siTypescript, siVite, siTailwindcss, siFramer, siThreedotjs], 'React · TypeScript · Tailwind · Framer Motion · Three.js · Recharts'],
] as const

function Logo({ icon }: { icon: { title: string; path: string; hex: string } }) {
  return (
    <span title={icon.title} className="grid h-12 w-12 place-items-center rounded-2xl bg-surface ring-1 ring-inset ring-line">
      <svg viewBox="0 0 24 24" width="24" height="24" role="img" aria-label={icon.title}><path d={icon.path} fill="currentColor" /></svg>
    </span>
  )
}

const FLOW = [
  { i: Database, t: 'Kaggle dataset', s: '1,29,880 surveys · 22 features' },
  { i: BrainCircuit, t: 'ML pipeline', s: 'clean · encode · train 4 models · SHAP · K-Means' },
  { i: Server, t: 'FastAPI + SQLite', s: 'predict · explain · recover · optimize' },
  { i: MonitorSmartphone, t: 'React app', s: '3D cabin · predictor · insights' },
]

export default function About() {
  const [ins, setIns] = useState<Insights | null>(null)
  useEffect(() => { api.insights().then(setIns).catch(() => {}) }, [])
  const m = ins?.metrics
  return (
    <div>
      <PageHero eyebrow="About the project" title={<>SkyPulse — <span className="text-gradient">AI Passenger Care.</span></>}>
        Airlines usually learn a passenger was unhappy only after the flight. SkyPulse predicts who is at risk during the journey, explains why, and plans recovery within a budget.
      </PageHero>

      <section>
        <Section eyebrow="Architecture" title="How the pieces connect" />
        <Card>
          <div className="grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
            {FLOW.map(({ i: I, t, s }, k) => (
              <div key={t} className="contents">
                <Reveal delay={k * 0.15}
                  className={`rounded-3xl p-5 text-center ring-1 ring-inset ${k === 2 ? 'bg-brand-soft ring-a1/40' : 'bg-surface ring-line'}`}>
                  <span className="bg-accent mx-auto grid h-12 w-12 place-items-center rounded-2xl text-[var(--on-accent)]"><I size={22} /></span>
                  <div className="mt-3 font-display text-lg font-semibold">{t}</div>
                  <div className="mt-1 text-[15px] text-muted">{s}</div>
                </Reveal>
                {k < FLOW.length - 1 && (
                  <svg aria-hidden className="mx-auto h-10 w-10 rotate-90 self-center md:h-6 md:w-14 md:rotate-0" viewBox="0 0 56 24">
                    <defs><linearGradient id={`ar${k}`}><stop offset="0" stopColor="var(--a1)" /><stop offset="1" stopColor="var(--a2)" /></linearGradient></defs>
                    <motion.path d="M2 12 H46" stroke={`url(#ar${k})`} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 6" fill="none"
                      animate={{ strokeDashoffset: [24, 0] }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} />
                    <path d="M44 6 L54 12 L44 18" stroke="var(--a2)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="mt-24">
        <Section eyebrow="Pipeline" title="From raw survey to recovery action" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Pre-process', 'Join train + test, encode text columns, stratified 80/20 split. Missing arrival delays get the training median; delays are log-scaled.'],
            ['Train & tune', `Logistic Regression, SVM, Random Forest and XGBoost, tuned with randomized search and 3-fold cross-validation.${m ? ` Best F1: ${m.best_model} (${m.models[m.best_model].f1.toFixed(3)}).` : ''}`],
            ['Explain', 'SHAP splits every prediction into pushes from each factor — that is where the plain-English reasons come from.'],
            ['Act', 'A rule table turns the biggest complaint into an action; a greedy optimizer spends a budget where it helps the most per rupee.'],
          ].map(([h, p], i) => (
            <Reveal key={h} delay={i * 0.08} className="h-full">
              <Tilt className="glass h-full rounded-3xl p-6">
                <div className="font-display text-5xl font-semibold text-line-strong">0{i + 1}</div>
                <h3 className="mt-3 font-display text-xl font-semibold">{h}</h3>
                <p className="mt-2 text-[15px] text-muted">{p}</p>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mt-24">
        <Section eyebrow="Tech stack" title="Built with" />
        <div className="grid gap-5 lg:grid-cols-3">
          {STACK.map(([h, icons, s], i) => (
            <Reveal key={h} delay={i * 0.08}>
              <Card className="h-full">
                <h3 className="font-display text-xl font-semibold">{h}</h3>
                <div className="mt-4 flex flex-wrap gap-2.5">{icons.map((ic) => <Logo key={ic.title} icon={ic} />)}</div>
                <p className="mt-4 text-[15px] text-muted">{s}</p>
              </Card>
            </Reveal>
          ))}
        </div>
        <p className="mt-5 text-[15px] text-muted">The 3D airplane, globe, clouds and cabin are built from Three.js shapes in code — no outside 3D models. Recovery costs are assumed values (configurable).</p>
      </section>

      <section className="mt-24">
        <Section eyebrow="Team 11" title="The team" />
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          {TEAM.map((n, i) => (
            <Reveal key={n} delay={i * 0.08}>
              <Tilt className="glass h-full rounded-3xl p-6 text-center">
                <span className="bg-accent mx-auto grid h-20 w-20 place-items-center rounded-full font-display text-2xl font-semibold text-[var(--on-accent)]">{n.split(' ').map((w) => w[0]).join('')}</span>
                <div className="mt-4 font-display text-lg font-semibold">{n}</div>
              </Tilt>
            </Reveal>
          ))}
        </div>
        <p className="mt-5 text-[15px] text-muted">Machine Learning — Final Review</p>
      </section>
    </div>
  )
}
