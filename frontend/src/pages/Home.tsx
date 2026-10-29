import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import { Armchair, ArrowDown, ArrowRight, BarChart3, BrainCircuit, FileSpreadsheet, Gauge as GaugeIcon, Luggage, MessageSquare, PlaneTakeoff, Radar, Sofa, Sparkles, UtensilsCrossed, Wallet, Wifi } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { TEAM } from '../App'
import { api, type Insights } from '../api'
import { Card, ErrorBox, Section, Skeleton } from '../components/ui'
import { CountUp, Magnetic, Reveal, Tilt } from '../lib/motion'
import { atRiskFound, atRiskNow, cabinProgress, HERO, STORY } from '../three/story'

const HomeStory = lazy(() => import('../three/HomeStory'))

const ACTION_ICON = { apology: MessageSquare, meal: UtensilsCrossed, wifi: Wifi, baggage: Luggage, lounge: Sofa, upgrade: Armchair } as const
const at = (s: number) => HERO + s * (1 - HERO)

/** Story caption: left column on wide screens (the 3D sits centre-right), top on narrower ones; always on a solid card. */
function Caption({ p, range, children, reduce }: { p: MotionValue<number>; range: [number, number]; children: ReactNode; reduce: boolean }) {
  const [a, b] = range
  const end = b >= 1 // the last caption stays until the section unpins
  const opacity = useTransform(p, end ? [a, a + 0.03] : [a, a + 0.03, b - 0.03, b], end ? [0, 1] : [0, 1, 1, 0])
  const y = useTransform(p, [a, b], reduce ? [0, 0] : [18, -18])
  return (
    <motion.div style={{ opacity, y }} className="pointer-events-none absolute inset-x-0 top-24 mx-auto max-w-[1280px] px-5 sm:px-8 lg:top-1/2 lg:-translate-y-1/2">
      <div data-caption className="glass-strong max-w-[min(26rem,100%)] rounded-3xl px-6 py-5 shadow-2xl lg:max-w-[min(26rem,34vw)]">
        <p className="font-display text-xl font-medium leading-snug sm:text-2xl lg:text-[26px]">{children}</p>
      </div>
    </motion.div>
  )
}

function Story() {
  const ref = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const reduce = !!useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const heroOpacity = useTransform(scrollYProgress, [0, 0.07], [1, 0])
  const heroY = useTransform(scrollYProgress, [0, 0.08], [0, reduce ? 0 : -80])
  const hint = useTransform(scrollYProgress, [0, 0.03], [1, 0])
  const chipOpacity = useTransform(scrollYProgress, [at(0.13), at(0.17)], [0, 1])
  const chip = useTransform(scrollYProgress, (p) => {
    const s = cabinProgress(p, reduce)
    if (s < 0.4) return `${STORY.passengers} passengers · ${STORY.event.toLowerCase()}`
    if (s < 0.8) return `At risk: ${atRiskFound(s)}`
    return `At risk: ${STORY.at_risk_before} → ${atRiskNow(s)}`
  })
  const chipDot = useTransform(scrollYProgress, (p) => { const s = cabinProgress(p, reduce); return s < 0.4 ? 'var(--a1)' : s < 0.9 ? 'var(--risk)' : 'var(--safe)' })
  const F = STORY.focus, ActionIcon = ACTION_ICON[F.action as keyof typeof ACTION_ICON] ?? Sparkles
  return (
    <section ref={ref} className="relative h-[430vh]" aria-label="SkyPulse story">
      <div className="sticky top-0 h-svh overflow-hidden">
        <div className="absolute inset-0"><Suspense fallback={null}><HomeStory progress={scrollYProgress} reduce={reduce} card={card} /></Suspense></div>
        <motion.div aria-hidden style={{ opacity: heroOpacity, background: 'linear-gradient(90deg, var(--bg) 0%, color-mix(in srgb, var(--bg) 70%, transparent) 38%, transparent 62%)' }} className="pointer-events-none absolute inset-0 hidden lg:block" />
        <motion.div aria-hidden style={{ opacity: heroOpacity, background: 'linear-gradient(180deg, var(--bg) 0%, color-mix(in srgb, var(--bg) 75%, transparent) 50%, transparent 72%)' }} className="pointer-events-none absolute inset-0 lg:hidden" />
        <motion.div style={{ opacity: heroOpacity, y: heroY }} className="absolute inset-0 mx-auto flex max-w-[1280px] flex-col justify-start px-5 pt-28 sm:px-8 lg:justify-center lg:pt-0">
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
        <motion.div style={{ opacity: hint }} className="absolute inset-x-0 bottom-8 hidden flex-col items-center gap-2 text-sm text-muted sm:flex">
          Scroll to fly <motion.span animate={reduce ? undefined : { y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.6 }}><ArrowDown size={18} /></motion.span>
        </motion.div>
        <Caption p={scrollYProgress} reduce={reduce} range={[at(0), at(0.15)]}>SkyPulse looks inside the cabin — while the flight is still in the air.</Caption>
        <Caption p={scrollYProgress} reduce={reduce} range={[at(0.15), at(0.4)]}>Every seat is a real passenger from our data.</Caption>
        <Caption p={scrollYProgress} reduce={reduce} range={[at(0.4), at(0.6)]}><span className="text-risk">Red seats</span> are passengers our model predicts will leave unhappy.</Caption>
        <Caption p={scrollYProgress} reduce={reduce} range={[at(0.6), at(0.8)]}>For each one, SkyPulse explains why — and picks a recovery action.</Caption>
        <Caption p={scrollYProgress} reduce={reduce} range={[at(0.8), 1]}>Recovery actions turn <span className="num">{STORY.saved}</span> of them <span className="text-safe">green</span> — before landing.</Caption>
        {/* focus card: positioned next to its seat every frame by the 3D scene */}
        <div ref={card} aria-hidden className="glass-strong pointer-events-none absolute left-0 top-0 w-64 rounded-2xl p-4 shadow-2xl" style={{ opacity: 0, visibility: 'hidden' }}>
          <div className="flex items-center justify-between text-sm"><span className="font-semibold">Seat {F.seat}</span><span className="num text-risk">{Math.floor(F.risk_before * 100)}% risk</span></div>
          <p className="mt-2 text-sm text-muted">Top reason: <span className="text-ink">{F.reason}</span></p>
          <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-safe"><span className="grid h-8 w-8 place-items-center rounded-full bg-[color-mix(in_srgb,var(--safe)_18%,transparent)]"><ActionIcon size={16} /></span>{F.action_label} → <span className="num">{Math.floor(F.risk_after * 100)}%</span></div>
        </div>
        <motion.div style={{ opacity: chipOpacity }} className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center lg:justify-end lg:px-10">
          <div className="glass-strong flex items-center gap-3 rounded-full px-5 py-3 shadow-xl">
            <motion.span className="h-2.5 w-2.5 rounded-full" style={{ background: chipDot }} />
            <motion.span className="num font-semibold">{chip}</motion.span>
            <span className="hidden text-sm text-muted sm:inline">{STORY.flight} · {STORY.route}</span>
          </div>
        </motion.div>
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
