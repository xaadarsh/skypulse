import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Plane, Sparkles, Star, User } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { LABELS, RATING_KEYS, type Features } from '../api'
import { Toggle2 } from './ui'

export function Slider({ id, label, min, max, step = 1, value, onChange, unit = '' }: { id: string; label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void; unit?: string }) {
  const fill = `${((value - min) / (max - min)) * 100}%`
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-[15px] font-medium text-muted">{label}</label>
        <span className="num font-display text-lg font-semibold">{value}<span className="text-sm text-muted">{unit}</span></span>
      </div>
      <input id={id} type="range" className="slider" min={min} max={max} step={step} value={value}
        style={{ '--fill': fill } as React.CSSProperties} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

/** 1–5 star rating with a "not used" (0) option, as in the survey. */
export function Stars({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-[15px] font-medium">{label}</span>
      <div className="flex items-center gap-1" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(0)}>
        <button type="button" role="radio" aria-checked={value === 0} onClick={() => onChange(0)}
          className={`mr-1 rounded-full px-2 py-0.5 text-[13px] font-semibold transition ${value === 0 ? 'bg-brand-soft text-ink ring-1 ring-inset ring-a1/50' : 'text-muted hover:text-ink'}`}
          title="Passenger did not use this service">N/A</button>
        {[1, 2, 3, 4, 5].map((n) => (
          <motion.button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
            whileTap={{ scale: 0.8 }} onMouseEnter={() => setHover(n)} onClick={() => onChange(n)} className="p-0.5">
            <Star size={22} strokeWidth={1.8} className="transition-colors"
              style={{ color: n <= shown ? (shown <= 2 ? 'var(--risk)' : shown === 3 ? 'var(--warn)' : 'var(--safe)') : 'var(--line-strong)', fill: n <= shown ? 'currentColor' : 'transparent' }} />
          </motion.button>
        ))}
      </div>
    </div>
  )
}

function Group({ title, icon, open, onToggle, children, hint }: { title: string; icon: ReactNode; open: boolean; onToggle: () => void; children: ReactNode; hint: string }) {
  return (
    <div className="glass overflow-hidden rounded-3xl">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-4 px-6 py-5 text-left transition hover:bg-surface-hover">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-soft text-brand">{icon}</span>
        <span className="flex-1">
          <span className="block font-display text-xl font-semibold">{title}</span>
          <span className="block text-sm text-muted">{hint}</span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }}><ChevronDown size={20} className="text-muted" /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35 }}>
            <div className="px-6 pb-6">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function PassengerInputs({ value, onChange, bookingOnly = false, idPrefix = 'p' }: { value: Features; onChange: (f: Features) => void; bookingOnly?: boolean; idPrefix?: string }) {
  const [open, setOpen] = useState({ passenger: true, flight: true, services: true })
  const set = (k: keyof Features) => (v: number) => onChange({ ...value, [k]: v })
  const tog = (k: keyof typeof open) => () => setOpen({ ...open, [k]: !open[k] })
  return (
    <div className="space-y-4">
      <Group title="Passenger" icon={<User size={20} />} hint="Who is flying" open={open.passenger} onToggle={tog('passenger')}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div><div className="mb-2 text-[15px] font-medium text-muted">Gender</div><Toggle2 label="Gender" value={value.gender} onChange={set('gender')} options={['Female', 'Male']} /></div>
          <div><div className="mb-2 text-[15px] font-medium text-muted">Customer type</div><Toggle2 label="Customer type" value={value.customer_type} onChange={set('customer_type')} options={['First-time', 'Loyal']} /></div>
          <div className="sm:col-span-2"><Slider id={`${idPrefix}-age`} label="Age" min={7} max={85} value={value.age} onChange={set('age')} unit=" yrs" /></div>
        </div>
      </Group>
      <Group title="Flight" icon={<Plane size={20} />} hint={bookingOnly ? 'Trip details known at booking' : 'Trip details and delays'} open={open.flight} onToggle={tog('flight')}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div><div className="mb-2 text-[15px] font-medium text-muted">Purpose of trip</div><Toggle2 label="Type of travel" value={value.travel_type} onChange={set('travel_type')} options={['Personal', 'Business']} /></div>
          <div><div className="mb-2 text-[15px] font-medium text-muted">Cabin class</div><Toggle2 label="Class" value={value.travel_class} onChange={set('travel_class')} options={['Eco', 'Eco Plus', 'Business']} /></div>
          <div className="sm:col-span-2"><Slider id={`${idPrefix}-dist`} label="Flight distance" min={31} max={5000} step={10} value={value.flight_distance} onChange={set('flight_distance')} unit=" mi" /></div>
          {!bookingOnly && (<>
            <Slider id={`${idPrefix}-dep`} label="Departure delay" min={0} max={500} step={5} value={value.dep_delay} onChange={set('dep_delay')} unit=" min" />
            <Slider id={`${idPrefix}-arr`} label="Arrival delay" min={0} max={500} step={5} value={value.arr_delay} onChange={set('arr_delay')} unit=" min" />
          </>)}
        </div>
      </Group>
      {!bookingOnly && (
        <Group title="Services" icon={<Sparkles size={20} />} hint="How the passenger rated each service (1–5 stars)" open={open.services} onToggle={tog('services')}>
          <div className="grid gap-x-10 divide-y divide-line md:grid-cols-2 md:divide-y-0">
            {RATING_KEYS.map((k) => <Stars key={k} label={LABELS[k]} value={value[k]} onChange={set(k)} />)}
          </div>
        </Group>
      )}
    </div>
  )
}
