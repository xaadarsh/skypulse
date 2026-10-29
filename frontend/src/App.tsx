import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion'
import { Menu, Moon, Plane, Sun, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Skeleton } from './components/ui'
import { CursorGlow, ease, useSmoothScroll } from './lib/motion'

const SpaceBackground = lazy(() => import('./three/SpaceBackground'))
const Home = lazy(() => import('./pages/Home'))
const Monitor = lazy(() => import('./pages/Monitor'))
const Predictor = lazy(() => import('./pages/Predictor'))
const Insights = lazy(() => import('./pages/Insights'))
const Bulk = lazy(() => import('./pages/Bulk'))
const About = lazy(() => import('./pages/About'))

const NAV = [['/', 'Home'], ['/monitor', 'Flight Monitor'], ['/predictor', 'Predictor'], ['/insights', 'Insights'], ['/bulk', 'Bulk'], ['/about', 'About']] as const

export const TEAM = ['Aadarsh Raj', 'Pranjal Jaiswal', 'Gaurav Singh', 'Ansh Singh'] as const

function useDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('theme', dark ? 'dark' : 'light') } catch { /* storage blocked */ }
  }, [dark])
  return [dark, setDark] as const
}

function Nav({ dark, setDark }: { dark: boolean; setDark: (d: boolean) => void }) {
  const [small, setSmall] = useState(false)
  const [open, setOpen] = useState(false)
  const { scrollY } = useScroll()
  const loc = useLocation()
  useMotionValueEvent(scrollY, 'change', (y) => setSmall(y > 40))
  useEffect(() => setOpen(false), [loc.pathname])
  const active = (to: string) => (to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to))
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3 sm:pt-4">
      {/* blurred band behind the pill so scrolled content never shows through around it */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-24 sm:h-28" style={{
        background: 'linear-gradient(180deg, var(--bg) 0%, color-mix(in srgb, var(--bg) 75%, transparent) 55%, transparent 100%)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        maskImage: 'linear-gradient(180deg, #000 55%, transparent)', WebkitMaskImage: 'linear-gradient(180deg, #000 55%, transparent)',
      }} />
      <motion.nav aria-label="Main" animate={{ paddingTop: small ? 6 : 10, paddingBottom: small ? 6 : 10 }} transition={{ duration: 0.35, ease }}
        className="glass-strong pointer-events-auto relative flex w-full max-w-[1100px] items-center gap-2 rounded-full pl-3 pr-2 shadow-[0_20px_60px_-25px_rgba(0,0,0,0.8)] sm:pl-4">
        <NavLink to="/" className="mr-2 flex shrink-0 items-center gap-2.5 font-display text-lg font-semibold">
          <span className="bg-accent grid h-8 w-8 place-items-center rounded-full text-[var(--on-accent)]"><Plane size={16} /></span>
          <span>SkyPulse</span>
        </NavLink>
        <div className="mx-auto hidden items-center gap-1 lg:flex">
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} className={`relative rounded-full px-4 py-2 text-[15px] font-medium transition-colors ${active(to) ? 'text-ink' : 'text-muted hover:text-ink'}`}>
              {active(to) && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-brand-soft ring-1 ring-inset ring-a1/40" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
              <span className="relative">{label}</span>
            </NavLink>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
          <button onClick={() => setDark(!dark)} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-surface-hover hover:text-ink">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-surface-hover lg:hidden" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </motion.nav>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }}
            className="glass-strong pointer-events-auto absolute inset-x-3 top-[72px] rounded-3xl p-3 lg:hidden">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} className={`block rounded-2xl px-4 py-3.5 text-lg font-medium ${active(to) ? 'bg-brand-soft text-ink' : 'text-muted'}`}>{label}</NavLink>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PageFallback() {
  return (
    <div className="mx-auto max-w-[1280px] space-y-5 px-5 pt-36 sm:px-8" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-16 w-[min(640px,100%)]" />
      <Skeleton className="h-6 w-[min(480px,100%)]" />
      <div className="grid gap-5 pt-6 md:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
    </div>
  )
}

export default function App() {
  const [dark, setDark] = useDark()
  const loc = useLocation()
  useSmoothScroll()
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  const full = loc.pathname === '/'

  return (
    <div className="relative flex min-h-screen flex-col">
      <div aria-hidden className="fixed inset-0 z-0" style={{
        background: dark
          ? 'radial-gradient(1000px 700px at 80% -10%, rgba(99,102,241,0.18), transparent 60%), radial-gradient(900px 600px at -10% 40%, rgba(56,189,248,0.10), transparent 60%), var(--bg)'
          : 'radial-gradient(1000px 700px at 80% -10%, rgba(167,139,250,0.25), transparent 60%), radial-gradient(900px 600px at -10% 40%, rgba(56,189,248,0.22), transparent 60%), var(--bg)',
      }} />
      {!full && <div aria-hidden className="fixed inset-0 z-0"><Suspense fallback={null}><SpaceBackground dark={dark} /></Suspense></div>}
      <CursorGlow />
      <Nav dark={dark} setDark={setDark} />

      <main className={`relative z-10 min-h-[100svh] flex-1 ${full ? '' : 'mx-auto w-full max-w-[1280px] px-5 pb-24 pt-24 sm:px-8 sm:pt-28'}`}>
        <Suspense fallback={<PageFallback />}>
          {/* enter-only transition: an exit + Suspense combination can leave a page stuck invisible */}
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease }}>
              <Routes location={loc}>
                <Route path="/" element={<Home />} />
                <Route path="/monitor" element={<Monitor />} />
                <Route path="/predictor" element={<Predictor />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/strategy" element={<Navigate to="/insights?tab=strategy" replace />} />
                <Route path="/segments" element={<Navigate to="/insights?tab=segments" replace />} />
                <Route path="/lab" element={<Navigate to="/insights?tab=lab" replace />} />
                <Route path="/bulk" element={<Bulk />} />
                <Route path="/about" element={<About />} />
                <Route path="*" element={<div className="py-40 text-center text-lg text-muted">Page not found. <NavLink className="text-brand underline" to="/">Go home</NavLink></div>} />
              </Routes>
          </motion.div>
        </Suspense>
      </main>

      <footer className="relative z-10 border-t border-line">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span><strong className="font-display text-ink">SkyPulse</strong> · AI Passenger Care · ML Final Review · Team 11</span>
          <span>{TEAM.join(' · ')}</span>
        </div>
      </footer>
    </div>
  )
}
