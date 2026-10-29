import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import Lenis from 'lenis'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export const ease = [0.16, 1, 0.3, 1] as const

/** Lenis smooth scrolling for the whole page (skipped for reduced motion). */
export function useSmoothScroll() {
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) return
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true })
    let id = 0
    const raf = (t: number) => { lenis.raf(t); id = requestAnimationFrame(raf) }
    id = requestAnimationFrame(raf)
    ;(window as unknown as { lenis?: Lenis }).lenis = lenis
    return () => { cancelAnimationFrame(id); lenis.destroy() }
  }, [reduce])
}

/** Fade + rise when scrolled into view. CSS-driven and fail-safe: IntersectionObserver plus a
 *  scroll-position check, and content shows immediately if IO is missing or motion is reduced. */
export function Reveal({ children, delay = 0, className = '', as = 'div', ...rest }: { children: ReactNode; delay?: number; className?: string; as?: 'div' | 'li' | 'section' } & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(true); return }
    let raf = 0
    const check = () => { if (el.getBoundingClientRect().top < innerHeight * 0.96) show() }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) show() }, { rootMargin: '0px 0px -4% 0px' })
    const cleanup = () => { io.disconnect(); removeEventListener('scroll', check); removeEventListener('resize', check); cancelAnimationFrame(raf) }
    function show() { setShown(true); cleanup() }
    io.observe(el)
    addEventListener('scroll', check, { passive: true })
    addEventListener('resize', check)
    raf = requestAnimationFrame(check)
    return cleanup
  }, [])
  const Tag = as as 'div'
  return (
    <Tag ref={ref as React.RefObject<HTMLDivElement>} className={`reveal ${shown ? 'in' : ''} ${className}`} style={{ '--d': `${delay}s` } as React.CSSProperties} {...rest}>
      {children}
    </Tag>
  )
}

export const stagger = {
  container: { hidden: {}, show: { transition: { staggerChildren: 0.08 } } },
  item: { hidden: { opacity: 0, y: 20, filter: 'blur(6px)' }, show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.7, ease } } },
}

/** Number that counts up to `value` (on change, or when first in view if onView). */
export function CountUp({ value, format = (v) => Math.round(v).toLocaleString('en-IN'), className = '', onView = false }: { value: number; format?: (v: number) => string; className?: string; onView?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const mv = useMotionValue(reduce ? value : 0)
  const text = useTransform(mv, format)
  useEffect(() => {
    if (onView && !inView) return
    if (reduce) { mv.set(value); return }
    const c = animate(mv, value, { duration: 1.2, ease })
    return () => c.stop()
  }, [value, inView, mv, onView, reduce])
  return <motion.span ref={ref} className={`num ${className}`}>{text}</motion.span>
}

/** Element that leans towards the pointer (used for primary buttons). */
export function Magnetic({ children, strength = 0.25, className = '' }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const x = useSpring(0, { stiffness: 200, damping: 15 }), y = useSpring(0, { stiffness: 200, damping: 15 })
  return (
    <motion.div ref={ref} style={{ x, y }} className={`inline-flex ${className}`}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== 'mouse') return
        const r = ref.current!.getBoundingClientRect()
        x.set((e.clientX - r.left - r.width / 2) * strength); y.set((e.clientY - r.top - r.height / 2) * strength)
      }}
      onPointerLeave={() => { x.set(0); y.set(0) }}>
      {children}
    </motion.div>
  )
}

/** Card with 3D tilt + pointer-following inner glow. */
export function Tilt({ children, className = '', max = 8 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const rx = useSpring(0, { stiffness: 150, damping: 15 }), ry = useSpring(0, { stiffness: 150, damping: 15 })
  return (
    <motion.div ref={ref} style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }} className={`glow-card ${className}`}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect()
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height
        ref.current!.style.setProperty('--mx', `${px * 100}%`); ref.current!.style.setProperty('--my', `${py * 100}%`)
        if (reduce || e.pointerType !== 'mouse') return
        ry.set((px - 0.5) * max * 2); rx.set(-(py - 0.5) * max * 2)
      }}
      onPointerLeave={() => { rx.set(0); ry.set(0) }}>
      {children}
    </motion.div>
  )
}

/** Soft glow that follows the mouse (desktop only). */
export function CursorGlow() {
  const reduce = useReducedMotion()
  const x = useSpring(-500, { stiffness: 120, damping: 20 }), y = useSpring(-500, { stiffness: 120, damping: 20 })
  useEffect(() => {
    if (reduce || !matchMedia('(pointer: fine)').matches) return
    const move = (e: PointerEvent) => { x.set(e.clientX - 250); y.set(e.clientY - 250) }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [reduce, x, y])
  if (reduce) return null
  return (
    <motion.div aria-hidden style={{ x, y }}
      className="pointer-events-none fixed left-0 top-0 z-0 h-[500px] w-[500px] rounded-full opacity-60 blur-3xl"
      >
      <div className="h-full w-full rounded-full" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--a1) 16%, transparent), transparent 65%)' }} />
    </motion.div>
  )
}

/** 'always' while the tab is visible, 'never' when hidden: pass to <Canvas frameloop>. */
export function useFrameloop(): 'always' | 'never' {
  const [visible, setVisible] = useState(!document.hidden)
  useEffect(() => {
    const f = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [])
  return visible ? 'always' : 'never'
}

/** Canvas onCreated: skip three's shader info-log dump (driver precision notes show up as console warnings). */
export const quietGL = ({ gl }: { gl: { debug: { checkShaderErrors: boolean } } }) => { gl.debug.checkShaderErrors = false }

