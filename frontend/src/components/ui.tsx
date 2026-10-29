import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Info, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Band } from '../api'
import { CountUp, ease, Magnetic, Reveal } from '../lib/motion'

const glowMove = (e: React.PointerEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div onPointerMove={glowMove} className={`glass glow-card rounded-3xl p-5 sm:p-7 transition-colors ${className}`} {...rest}>{children}</div>
}

export function Section({ eyebrow, title, children, className = '' }: { eyebrow?: string; title: string; children?: ReactNode; className?: string }) {
  return (
    <Reveal className={`mb-8 ${className}`}>
      {eyebrow && <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">{eyebrow}</p>}
      <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-[40px] sm:leading-[1.1]">{title}</h2>
      {children && <p className="mt-3 max-w-2xl text-lg text-muted">{children}</p>}
    </Reveal>
  )
}

/** Top of every page: what it is, what it does, and how to use it in 3 steps. */
export function PageHero({ eyebrow, title, children, steps }: { eyebrow: string; title: ReactNode; children: ReactNode; steps?: string[] }) {
  return (
    <header className="pb-8 pt-4 sm:pb-10 sm:pt-8">
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}
        className="text-sm font-semibold uppercase tracking-[0.22em] text-brand">{eyebrow}</motion.p>
      <motion.h1 initial={{ opacity: 0, y: 24, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.9, delay: 0.05, ease }}
        className="mt-3 max-w-4xl font-display text-[40px] font-semibold leading-[1.04] tracking-tight sm:text-5xl lg:text-[56px]">{title}</motion.h1>
      <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease }}
        className="mt-4 max-w-2xl text-lg text-muted">{children}</motion.p>
      {steps && (
        <motion.ol initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.3 } } }}
          className="mt-6 flex flex-wrap items-center gap-2 sm:gap-3" aria-label="How to use this page">
          {steps.map((s, i) => (
            <motion.li key={s} variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }} className="flex items-center gap-2 sm:gap-3">
              <span className="glass flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 text-sm font-medium">
                <span className="bg-accent grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold text-[var(--on-accent)]">{i + 1}</span>{s}
              </span>
              {i < steps.length - 1 && <ArrowRight size={16} className="text-muted" aria-hidden />}
            </motion.li>
          ))}
        </motion.ol>
      )}
    </header>
  )
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'soft'; size?: 'md' | 'lg'; magnetic?: boolean }
export function Button({ variant = 'primary', size = 'md', magnetic = false, className = '', ...p }: BtnProps) {
  const v = {
    primary: 'bg-accent text-[var(--on-accent)] shadow-[0_10px_40px_-12px_var(--a1)] hover:shadow-[0_14px_50px_-10px_var(--a2)] hover:brightness-110',
    ghost: 'glass text-ink hover:bg-surface-hover',
    soft: 'bg-brand-soft text-ink ring-1 ring-inset ring-line hover:ring-line-strong',
    danger: 'border border-risk/50 text-risk hover:bg-risk/10',
  }[variant]
  const s = size === 'lg' ? 'h-14 px-7 text-base' : 'h-11 px-5 text-sm'
  const btn = (
    <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition duration-200 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-45 ${s} ${v} ${className}`} />
  )
  return magnetic ? <Magnetic>{btn}</Magnetic> : btn
}

/** Small "i" with a plain-English explanation for jargon. */
export function InfoTip({ children, label = 'What does this mean?' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={label} aria-describedby={open ? id : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onClick={() => setOpen(!open)} className="ml-1 grid h-5 w-5 place-items-center rounded-full text-muted transition hover:text-ink">
        <Info size={15} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.span id={id} role="tooltip" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
            className="glass-strong absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-xl px-3.5 py-2.5 text-left text-[13px] font-normal normal-case leading-snug tracking-normal text-ink shadow-2xl">
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

export function Tabs<T extends string>({ value, onChange, options, label, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: ReactNode }[]; label: string; size?: 'md' | 'lg' }) {
  const uid = useId()
  return (
    <div role="tablist" aria-label={label} className="glass inline-flex max-w-full gap-1 overflow-x-auto rounded-full p-1.5">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`relative flex shrink-0 items-center gap-2 rounded-full font-semibold transition-colors ${size === 'lg' ? 'px-4 py-2 text-sm sm:px-5 sm:py-2.5 sm:text-base' : 'px-3.5 py-2 text-sm sm:px-4'} ${value === o.value ? 'text-[var(--on-accent)]' : 'text-muted hover:text-ink'}`}>
          {value === o.value && <motion.span layoutId={`tab-${uid}`} className="bg-accent absolute inset-0 rounded-full" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
          <span className="relative flex items-center gap-2">{o.icon}{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Toggle2({ value, onChange, options, label }: { value: number; onChange: (v: number) => void; options: string[]; label: string }) {
  const uid = useId()
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-2xl bg-surface p-1 ring-1 ring-inset ring-line">
      {options.map((o, i) => (
        <button key={o} type="button" role="radio" aria-checked={value === i} onClick={() => onChange(i)}
          className={`relative flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${value === i ? 'text-ink' : 'text-muted hover:text-ink'}`}>
          {value === i && <motion.span layoutId={`t2-${uid}`} className="absolute inset-0 rounded-xl bg-brand-soft ring-1 ring-inset ring-a1/50" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
          <span className="relative">{o}</span>
        </button>
      ))}
    </div>
  )
}

export const bandColor = (b: Band) => (b === 'high' ? 'var(--risk)' : b === 'medium' ? 'var(--warn)' : 'var(--safe)')
export const bandText = (b: Band) => (b === 'high' ? 'At risk' : b === 'medium' ? 'Watch' : 'Safe')
export const bandOf = (risk: number): Band => (risk >= 0.5 ? 'high' : risk >= 0.3 ? 'medium' : 'low')

export function RiskPill({ band, risk, className = '' }: { band: Band; risk?: number; className?: string }) {
  const c = bandColor(band)
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold ${className}`}
      style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 35%, transparent)` }}>
      <span className="h-2 w-2 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
      {bandText(band)}{risk != null && <span className="num opacity-90">{(risk * 100).toFixed(0)}%</span>}
    </span>
  )
}

/** Big ring gauge for P(satisfied). */
export function Gauge({ value, label, size = 220 }: { value: number; label: string; size?: number }) {
  const r = 44, C = 2 * Math.PI * r
  const color = value >= 0.7 ? 'var(--safe)' : value >= 0.5 ? 'var(--warn)' : 'var(--risk)'
  const id = useId().replace(/:/g, '')
  return (
    <div className="relative mx-auto mb-8" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${(value * 100).toFixed(0)} percent`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <defs><filter id={`g${id}`}><feGaussianBlur stdDeviation="2.2" /></filter></defs>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="7" />
        <motion.circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={C} opacity={0.55}
          filter={`url(#g${id})`} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - value), stroke: color }} transition={{ type: 'spring', stiffness: 50, damping: 15 }} />
        <motion.circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={C}
          initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - value), stroke: color }} transition={{ type: 'spring', stiffness: 50, damping: 15 }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-semibold" style={{ color, fontSize: size * 0.24 }}><CountUp value={value * 100} format={(v) => `${Math.round(v)}%`} /></span>
      </div>
      <div className="absolute inset-x-0 -bottom-7 text-center text-sm text-muted">{label}</div>
    </div>
  )
}

export function Kpi({ label, value, format, tone, hint, icon }: { label: ReactNode; value: number; format?: (v: number) => string; tone?: string; hint?: string; icon?: ReactNode }) {
  return (
    <Card className="!p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-muted">{icon}{label}</div>
      <div className="mt-2 font-display text-[32px] font-semibold leading-none sm:text-[40px]" style={{ color: tone }}><CountUp value={value} format={format} /></div>
      {hint && <div className="mt-2 text-[13px] text-muted">{hint}</div>}
    </Card>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />
}

export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-risk/40 bg-risk/10 px-5 py-4 text-base">
      <strong className="text-risk">Something went wrong.</strong> <span className="text-ink">{error}</span>
      {retry && <button onClick={retry} className="ml-3 font-semibold text-brand underline underline-offset-4">Try again</button>}
    </div>
  )
}

/** Empty state: small illustration + one clear action. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center" role="status">
      <svg width="132" height="96" viewBox="0 0 132 96" aria-hidden className="mb-5">
        <defs><linearGradient id="eg" x1="0" x2="1"><stop offset="0" stopColor="var(--a1)" /><stop offset="1" stopColor="var(--a2)" /></linearGradient></defs>
        <ellipse cx="66" cy="54" rx="58" ry="22" fill="none" stroke="var(--line-strong)" strokeDasharray="4 6" />
        <circle cx="66" cy="54" r="16" fill="url(#eg)" opacity="0.25" />
        <circle cx="66" cy="54" r="9" fill="url(#eg)" />
        <motion.g animate={{ x: [0, 40, 0, -40, 0], y: [0, 8, 16, 8, 0] }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}>
          <path d="M60 22 l14 -6 -4 10 -3 -4 -4 3z" fill="var(--ink)" opacity="0.85" />
        </motion.g>
      </svg>
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      {children && <p className="mt-2 max-w-sm text-base text-muted">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

/** Right-side slide-over panel. */
export function Drawer({ open, onClose, title, children, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    setTimeout(() => closeRef.current?.focus(), 60)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('keydown', esc); prev?.focus?.() }
  }, [open, onClose])
  // portal: page transitions use transforms, which would trap a fixed panel inside the page
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60]">
          <motion.div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Details'} data-lenis-prevent
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 260, damping: 32 }}
            className="glass-strong absolute right-0 top-0 flex h-full w-full flex-col border-y-0 border-r-0 shadow-2xl" style={{ maxWidth: width }}>
            <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
              <div className="min-w-0 font-display text-xl font-semibold">{title}</div>
              <button ref={closeRef} onClick={onClose} aria-label="Close panel" className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-surface-hover hover:text-ink"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export const fieldCls = 'h-12 w-full rounded-2xl border border-line bg-surface-strong px-4 text-base text-ink placeholder:text-muted/70 transition focus:border-a1/60'
