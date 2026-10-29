import { motion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import { ArrowDown, ArrowRight, BarChart3, BrainCircuit, FileSpreadsheet, Gauge as GaugeIcon, PlaneTakeoff, Radar, Sparkles, Wallet } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { TEAM } from '../App'
import { api, type Insights } from '../api'
import { Card, ErrorBox, Section, Skeleton } from '../components/ui'
import { CountUp, Magnetic, Reveal, Tilt } from '../lib/motion'

const HomeStory = lazy(() => import('../three/HomeStory'))

/** Story caption: left column on wide screens (the 3D sits on the right), top on phones; always on a scrim. */
function Caption({ p, range, children }: { p: MotionValue<number>; range: [number, number]; children: ReactNode }) {
  const [a, b] = range
  const opacity = useTransform(p, [a, a + 0.03, b - 0.03, b], [0, 1, 1, 0])
  const y = useTransform(p, [a, b], [24, -24])
  return (
    <motion.div style={{ opacity, y }} className="pointer-events-none absolute inset-x-0 top-24 mx-auto max-w-[1280px] px-5 sm:top-1/2 sm:-translate-y-1/2 sm:px-8">
      <p className="glass-strong max-w-[26rem] rounded-3xl px-6 py-5 font-display text-xl font-medium leading-snug shadow-2xl sm:text-[26px]">{children}</p>
    </motion.div>
  )
}

function Story() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const heroOpacity = useTransform(scrollYProgress, [0, 0.1], [1, 0])
  const heroY = useTransform(scrollYProgress, [0, 0.12], [0, -80])
  const flash = useTransform(scrollYProgress, [0.47, 0.53, 0.59], [0, 1, 0])
  const hint = useTransform(scrollYProgress, [0, 0.04], [1, 0])
  const captionScrim = useTransform(scrollYProgress, [0.1, 0.15], [0, 1])
  return (
    <section ref={ref} className="relative h-[460vh]" aria-label="SkyPulse story">
      <div className="sticky top-0 h-svh overflow-hidden">
        <div className="absolute inset-0"><Suspense fallback={null}><HomeStory progress={scrollYProgress} /></Suspense></div>
        <motion.div aria-hidden style={{ opacity: flash }} className="pointer-events-none absolute inset-0 bg-[var(--bg)]" />
        <motion.div aria-hidden style={{ opacity: heroOpacity, background: 'linear-gradient(90deg, var(--bg) 0%, color-mix(in srgb, var(--bg) 70%, transparent) 38%, transparent 62%)' }} className="pointer-events-none absolute inset-0 hidden sm:block" />
        <motion.div aria-hidden style={{ opacity: heroOpacity, background: 'linear-gradient(180deg, var(--bg) 0%, color-mix(in srgb, var(--bg) 75%, transparent) 50%, transparent 72%)' }} className="pointer-events-none absolute inset-0 sm:hidden" />
        <motion.div style={{ opacity: heroOpacity, y: heroY }} className="absolute inset-0 mx-auto flex max-w-[1280px] flex-col justify-start px-5 pt-28 sm:justify-center sm:px-8 sm:pt-0">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand">AI Passenger Care System</p>
          <h1 className="mt-4 max-w-3xl font-display text-[48px] font-semibold leading-[0.98] tracking-tight sm:text-[72px] lg:text-[88px]">
            Know who’s unhappy <span className="text-gradient">before they land.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted sm:text-xl">
            SkyPulse scores every passenger during the flight, explains why they are at risk, and plans recovery actions within a budget.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Magnetic><Link to="/monitor" className="bg-accent inline-flex h-14 items-center gap-2 rounded-full px-7 text-base font-semibold text-[var(--on-accent)] shadow-[0_14px_50px_-12px_var(--a1)] transition hover:brightness-110">
              Launch Flight Monitor <ArrowRight size={18} /></Link></Magnetic>
            <a href="#problem" onClick={(e) => { const l = (window as unknown as { lenis?: { scrollTo: (t: Element, o: { offset: number }) => void } }).lenis; const t = document.getElementById('problem'); if (l && t) { e.preventDefault(); l.scrollTo(t, { offset: -112 }) } }} className="glass inline-flex h-14 items-center gap-2 rounded-full px-7 text-base font-semibold hover:bg-surface-hover">See the results</a>
          </div>
        </motion.div>
        <motion.div aria-hidden style={{ opacity: captionScrim, background: 'linear-gradient(90deg, color-mix(in srgb, var(--bg) 85%, transparent) 0%, color-mix(in srgb, var(--bg) 40%, transparent) 34%, transparent 52%)' }} className="pointer-events-none absolute inset-0 hidden sm:block" />
        <motion.div aria-hidden style={{ opacity: captionScrim, background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg) 85%, transparent) 0%, transparent 42%)' }} className="pointer-events-none absolute inset-0 sm:hidden" />
        <motion.div style={{ opacity: hint }} className="absolute inset-x-0 bottom-8 hidden flex-col items-center gap-2 text-sm text-muted sm:flex">
          Scroll to fly <motion.span animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.6 }}><ArrowDown size={18} /></motion.span>
        </motion.div>
        <Caption p={scrollYProgress} range={[0.14, 0.32]}>Cruising at 36,000 ft with 120 passengers on board.</Caption>
        <Caption p={scrollYProgress} range={[0.34, 0.48]}>SkyPulse looks inside the cabin — while the flight is still in the air.</Caption>
        <Caption p={scrollYProgress} range={[0.6, 0.76]}><span className="text-risk">Red seats</span> are passengers our model predicts will leave unhappy.</Caption>
        <Caption p={scrollYProgress} range={[0.8, 0.99]}>Recovery actions turn them <span className="text-safe">green</span> — before landing.</Caption>
      </div>
    </section>
  )
}

const FEATURES = [
  { to: '/monitor', icon: PlaneTakeoff, title: 'Flight Monitor', text: 'A live 3D cabin. Throw delays and outages at it and recover passengers within a budget.' },
  { to: '/predictor', icon: GaugeIcon, title: 'Predictor', text: 'Score one passenger, see exactly why, and find the smallest fix.' },
  { to: '/insights', icon: BarChart3, title: 'Insights', text: 'What-if strategy, passenger personas and the full model comparison.' },
  { to: '/bulk', icon: FileSpreadsheet, title: 'Bulk Analysis', text: 'Drop a CSV of passengers and get a risk score and reason for each one.' },
]

export default function Home() {
  const [ins, setIns] = useState<Insights | null>(null)
  const [err, setErr] = useState('')
  const load = () => { setErr(''); api.insights().then(setIns).catch((e) => setErr(e.message)) }
  useEffect(load, [])
  const best = ins?.metrics.models[ins.metrics.best_model]

  return (
    <div>
      <Story />
      <div className="mx-auto max-w-[1280px] space-y-36 px-5 py-32 sm:px-8">
        <section id="problem" className="scroll-mt-28">
          <Section eyebrow="The problem" title="Airlines find out too late.">
            Satisfaction surveys arrive after the flight. By then the passenger has already decided whether to fly with you again.
          </Section>
          {err && <ErrorBox error={err} retry={load} />}
          <div className="grid gap-5 md:grid-cols-3">
            {!ins && !err && [0, 1, 2].map((i) => <Skeleton key={i} className="h-52" />)}
            {ins && [
              { v: (1 - ins.eda.satisfied_rate) * 100, f: (x: number) => `${x.toFixed(1)}%`, t: 'of passengers in our data were neutral or dissatisfied', c: 'var(--risk)' },
              { v: ins.eda.rows, f: (x: number) => Math.round(x).toLocaleString('en-IN'), t: 'real passenger surveys analysed', c: 'var(--a1)' },
              { v: (ins.eda.by_delay[0].satisfied_rate - ins.eda.by_delay[ins.eda.by_delay.length - 1].satisfied_rate) * 100, f: (x: number) => `${x.toFixed(0)} pts`, t: 'drop in satisfaction between on-time and 2-hour+ delayed flights', c: 'var(--warn)' },
            ].map((s, i) => (
              <Reveal key={s.t} delay={i * 0.1}>
                <Card className="h-full">
                  <div className="font-display text-6xl font-semibold tracking-tight" style={{ color: s.c }}><CountUp value={s.v} format={s.f} onView /></div>
                  <p className="mt-4 text-lg text-muted">{s.t}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>

        <section>
          <Section eyebrow="How it works" title="Predict. Explain. Recover." />
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { i: BrainCircuit, h: 'Predict', p: 'A tuned machine-learning model scores every passenger’s risk of leaving unhappy — live, as events happen on the flight.' },
              { i: Radar, h: 'Explain', p: 'SHAP shows which experience is pushing each passenger towards unhappy, in plain English.' },
              { i: Wallet, h: 'Recover', p: 'SkyPulse picks a recovery action per passenger and an optimizer spends the budget where it saves the most.' },
            ].map(({ i: I, h, p }, k) => (
              <Reveal key={h} delay={k * 0.1}>
                <Card className="h-full">
                  <div className="flex items-center gap-4">
                    <span className="bg-accent grid h-12 w-12 place-items-center rounded-2xl text-[var(--on-accent)]"><I size={22} /></span>
                    <span className="font-display text-5xl font-semibold text-line-strong">0{k + 1}</span>
                  </div>
                  <h3 className="mt-6 font-display text-2xl font-semibold">{h}</h3>
                  <p className="mt-3 text-base text-muted">{p}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>

        <section>
          <Section eyebrow="Live from our models" title="Real numbers from a real dataset.">
            Every number below is read from the trained models' saved results — nothing is typed in by hand.
          </Section>
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {!ins && !err && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
            {ins && best && [
              { v: best.accuracy * 100, f: (x: number) => x.toFixed(1) + '%', l: 'Accuracy', s: ins.metrics.best_model },
              { v: best.roc_auc, f: (x: number) => x.toFixed(3), l: 'ROC-AUC', s: '1.0 = perfect ranking' },
              { v: Object.keys(ins.metrics.models).length, f: (x: number) => Math.round(x).toString(), l: 'Models compared', s: 'LR · SVM · RF · XGBoost' },
              { v: ins.segments.k, f: (x: number) => Math.round(x).toString(), l: 'Passenger personas', s: 'found by K-Means' },
            ].map((s, i) => (
              <Reveal key={s.l} delay={i * 0.08}>
                <Card className="h-full">
                  <div className="text-gradient font-display text-5xl font-semibold sm:text-6xl"><CountUp value={s.v} format={s.f} onView /></div>
                  <div className="mt-3 text-lg font-semibold">{s.l}</div>
                  <div className="text-sm text-muted">{s.s}</div>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>

        <section>
          <Section eyebrow="Explore" title="Four ways to see it work." />
          <div className="grid gap-5 sm:grid-cols-2">
            {FEATURES.map(({ to, icon: I, title, text }, i) => (
              <Reveal key={to} delay={i * 0.08}>
                <Link to={to} className="group block h-full">
                  <Tilt className="glass h-full rounded-3xl p-7 transition-colors sm:p-9">
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand ring-1 ring-inset ring-line"><I size={26} /></span>
                    <h3 className="mt-6 font-display text-[28px] font-semibold">{title}</h3>
                    <p className="mt-2 text-lg text-muted">{text}</p>
                    <span className="mt-6 inline-flex items-center gap-2 font-semibold text-brand">Open <ArrowRight size={18} className="transition group-hover:translate-x-1" /></span>
                  </Tilt>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>

        <section>
          <Section eyebrow="Team 11" title="Built by" />
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {TEAM.map((n, i) => (
              <Reveal key={n} delay={i * 0.08}>
                <Card className="h-full text-center">
                  <span className="bg-accent mx-auto grid h-16 w-16 place-items-center rounded-full font-display text-xl font-semibold text-[var(--on-accent)]">{n.split(' ').map((w) => w[0]).join('')}</span>
                  <div className="mt-4 font-display text-lg font-semibold">{n}</div>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>

        <Reveal>
          <div className="glass relative overflow-hidden rounded-[2rem] px-7 py-14 text-center sm:px-14 sm:py-20">
            <div aria-hidden className="absolute inset-0 opacity-60" style={{ background: 'radial-gradient(600px 300px at 50% 0%, color-mix(in srgb, var(--a2) 30%, transparent), transparent 70%)' }} />
            <Sparkles className="relative mx-auto text-brand" size={30} />
            <h2 className="relative mt-5 font-display text-4xl font-semibold tracking-tight sm:text-5xl">See it on a live cabin.</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-lg text-muted">Load 120 real passengers, throw a two-hour delay at them, and watch SkyPulse recover the flight.</p>
            <div className="relative mt-8 flex justify-center">
              <Magnetic><Link to="/monitor" className="bg-accent inline-flex h-14 items-center gap-2 rounded-full px-8 text-base font-semibold text-[var(--on-accent)] shadow-[0_14px_50px_-12px_var(--a1)]">
                Launch Flight Monitor <ArrowRight size={18} /></Link></Magnetic>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
