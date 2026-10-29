import { ContactShadows, Environment, OrbitControls, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { RotateCcw } from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitImpl } from 'three-stdlib'
import type { Seat } from '../api'
import { quietGL, useFrameloop } from '../lib/motion'
import { preload } from './assets'
import { CabinModel, useSeatOutline } from './CabinModel'
import { RISK_HEX } from './colors'
import { flightLayout, type CabinExtent, type Slot } from './layout'

preload('seatEco', 'seatBiz', 'segment', 'front', 'rear', 'divider')
const EMPTY = '#3a4258'

/** Corners of the cabin's bounding box (in the rotated frame used on portrait screens). */
function corners(extent: CabinExtent, portrait: boolean) {
  const out: THREE.Vector3[] = []
  for (const x of [extent.rear - 1.25, extent.front + (extent.nose ? 5.8 : 1.2)]) for (const y of [0, 2.5]) for (const z of [-2.6, 2.6]) {
    const v = new THREE.Vector3(x, y, z)
    if (portrait) v.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
    out.push(v)
  }
  return out
}

/** Places the camera so the whole cabin fits and is centred; reruns on resize and on "Reset view". */
function CameraFit({ extent, portrait, controls, resetKey, onFit }: { extent: CabinExtent; portrait: boolean; controls: React.RefObject<OrbitImpl | null>; resetKey: number; onFit: (d: number) => void }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    const pts = corners(extent, portrait)
    const target = pts.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / pts.length)
    target.y = 0.6
    const az = portrait ? 0.18 : 0.3, el = portrait ? 1.05 : 0.95
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
    cam.aspect = size.width / size.height
    cam.updateProjectionMatrix()
    let lo = 2, hi = 300
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      cam.position.copy(target).addScaledVector(dir, mid)
      cam.lookAt(target)
      cam.updateMatrixWorld()
      const fits = pts.every((c) => { const p = c.clone().project(cam); return Math.abs(p.x) <= 0.92 && Math.abs(p.y) <= (portrait ? 0.78 : 0.8) && p.z < 1 })
      if (fits) hi = mid; else lo = mid
    }
    cam.position.copy(target).addScaledVector(dir, hi)
    cam.lookAt(target)
    if (controls.current) { controls.current.target.copy(target); controls.current.update() }
    onFit(hi)
  }, [camera, size, portrait, controls, extent, resetKey, onFit])
  return null
}

/** Keeps a DOM label pinned above a seat (no React re-render per frame). */
function LabelTracker({ slot, group, label }: { slot: Slot | null; group: React.RefObject<THREE.Group | null>; label: React.RefObject<HTMLDivElement | null> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    const el = label.current
    if (!el) return
    if (!slot || !group.current) { el.style.opacity = '0'; return }
    v.set(slot.x, slot.kind === 'biz' ? 1.55 : 1.4, slot.z).applyMatrix4(group.current.matrixWorld).project(camera)
    el.style.opacity = '1'
    el.style.transform = `translate(${(v.x * 0.5 + 0.5) * size.width}px, ${(-v.y * 0.5 + 0.5) * size.height}px) translate(-50%, -100%)`
  })
  return null
}

function Outline({ slot, lift }: { slot: Slot; lift: number }) {
  const geo = useSeatOutline(slot.kind)
  return (
    <mesh geometry={geo} position={[slot.x, lift, slot.z]} scale={1.045} renderOrder={-1}>
      <meshBasicMaterial color="#bae6fd" side={THREE.BackSide} transparent opacity={0.95} toneMapped={false} />
    </mesh>
  )
}

function Lifts({ lifts, active }: { lifts: Float32Array; active: number[] }) {
  useFrame(() => {
    for (let i = 0; i < lifts.length; i++) {
      const target = active.includes(i) ? 0.12 : 0
      const v = lifts[i] + (target - lifts[i]) * 0.2
      lifts[i] = Math.abs(v - target) < 0.002 ? target : v
    }
  })
  return null
}

export default function Cabin({ seats, selected, onSelect, wave }: {
  seats: Seat[]; selected: string | null; onSelect: (seat: string | null) => void; wave: number
}) {
  const { slots, extent } = useMemo(flightLayout, [])
  const bySeat = useMemo(() => new Map(seats.map((s) => [s.seat, s])), [seats])
  const [hover, setHover] = useState<number | null>(null)
  const [portrait, setPortrait] = useState(false)
  const [quality, setQuality] = useState<'high' | 'low'>('high')
  const [reset, setReset] = useState(0)
  const [fitDist, setFitDist] = useState(40)
  const frameloop = useFrameloop()
  const wrap = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLDivElement>(null)
  const group = useRef<THREE.Group>(null)
  const controls = useRef<OrbitImpl | null>(null)
  const coarse = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches, [])

  // colour animation state per slot
  const anim = useRef(slots.map(() => ({ from: new THREE.Color(EMPTY), to: new THREE.Color(EMPTY), cur: new THREE.Color(EMPTY), start: -1, key: '' })))
  const lastWave = useRef(-1)
  useEffect(() => {
    const restart = wave !== lastWave.current
    lastWave.current = wave
    slots.forEach((s, i) => {
      const p = bySeat.get(s.key)
      const key = p ? RISK_HEX[p.band] : EMPTY
      const a = anim.current[i]
      if (a.key !== key || restart) { a.from.copy(a.cur); a.to.set(key); a.key = key; a.start = -2 }
    })
  }, [seats, wave, slots, bySeat])
  const selIdx = selected ? slots.findIndex((s) => s.key === selected) : -1
  const lifts = useMemo(() => new Float32Array(slots.length), [slots.length])
  const paint = (i: number, t: number, out: THREE.Color) => {
    const a = anim.current[i]
    if (a.start === -2) a.start = t + slots[i].row * 0.06 // ripple front to back
    let pulse = 0
    if (a.start >= 0) {
      const k = (t - a.start) / 0.75
      if (k >= 1) { a.cur.copy(a.to); a.start = -1 }
      else if (k > 0) { a.cur.copy(a.from).lerp(a.to, k); pulse = Math.sin(k * Math.PI) }
    }
    out.copy(a.cur)
    return (a.key !== EMPTY ? 0.32 : 0) + pulse * 1.1 + (i === selIdx ? 0.45 : i === hover ? 0.3 : 0)
  }

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setPortrait(e.contentRect.width < e.contentRect.height * 0.9))
    ro.observe(el)
    // wheel over the cabin zooms the camera and never scrolls the page
    const wheel = (e: WheelEvent) => e.preventDefault()
    el.addEventListener('wheel', wheel, { passive: false })
    return () => { ro.disconnect(); el.removeEventListener('wheel', wheel) }
  }, [])

  const labelSlot = hover != null ? slots[hover] : selIdx >= 0 ? slots[selIdx] : null
  const labelSeat = labelSlot ? bySeat.get(labelSlot.key) : undefined
  const outlineSlot = selIdx >= 0 ? slots[selIdx] : hover != null ? slots[hover] : null
  const active = [selIdx, hover ?? -1]

  return (
    <div ref={wrap} data-lenis-prevent data-testid="cabin-canvas" className="relative h-full w-full select-none" style={{ touchAction: 'pan-y' }}>
      <Canvas onCreated={quietGL} frameloop={frameloop} dpr={quality === 'high' ? [1, 1.75] : 1} camera={{ position: [0, 30, 30], fov: 36, near: 0.1, far: 400 }}
        gl={{ stencil: false, antialias: true, powerPreference: 'high-performance' }} onPointerMissed={() => onSelect(null)}>
        <PerformanceMonitor onDecline={() => setQuality('low')} onIncline={() => setQuality('high')} flipflops={3} onFallback={() => setQuality('low')} />
        <Suspense fallback={null}>
          <Environment files="/hdri/studio.hdr" environmentIntensity={0.85} />
          <hemisphereLight args={['#dbe7ff', '#141a2a', 0.35]} />
          <directionalLight position={[8, 16, 10]} intensity={1.1} />
          <group ref={group} rotation={[0, portrait ? Math.PI / 2 : 0, 0]}>
            <CabinModel slots={slots} extent={extent} paint={paint} lifts={lifts}
              onPick={(i) => bySeat.has(slots[i].key) && onSelect(slots[i].key)}
              onHover={(i) => { const ok = i != null && bySeat.has(slots[i].key); setHover(ok ? i : null); document.body.style.cursor = ok ? 'pointer' : '' }} />
            {outlineSlot && <Outline slot={outlineSlot} lift={0.12} />}
            <ContactShadows position={[(extent.front + extent.rear) / 2, 0.02, 0]} scale={[extent.front - extent.rear + 2, 6]} opacity={0.5} blur={2.2} far={1.6} frames={1} resolution={1024} />
          </group>
          <Lifts lifts={lifts} active={active} />
          <LabelTracker slot={labelSeat ? labelSlot : null} group={group} label={label} />
          {quality === 'high' && (
            <EffectComposer multisampling={4}>
              <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.85} luminanceSmoothing={0.2} />
            </EffectComposer>
          )}
        </Suspense>
        <CameraFit extent={extent} portrait={portrait} controls={controls} resetKey={reset} onFit={setFitDist} />
        <OrbitControls ref={controls as never} makeDefault enablePan={false} enableDamping dampingFactor={0.08}
          minDistance={fitDist * 0.25} maxDistance={fitDist * 1.5} maxPolarAngle={Math.PI / 2.08}
          touches={coarse ? { ONE: -1 as unknown as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_ROTATE } : undefined} />
      </Canvas>
      <div ref={label} aria-hidden className="pointer-events-none absolute left-0 top-0 z-10 opacity-0">
        {labelSeat && (
          <div className="glass-strong mb-2 whitespace-nowrap rounded-2xl px-3.5 py-2 text-sm shadow-2xl">
            <span className="font-semibold">Seat {labelSeat.seat}</span>
            <span className="ml-2 font-semibold" style={{ color: RISK_HEX[labelSeat.band] }}>{(labelSeat.risk * 100).toFixed(0)}% risk</span>
            {labelSeat.action_label && <span className="ml-2 text-brand">· {labelSeat.action_label}</span>}
          </div>
        )}
      </div>
      <button type="button" onClick={() => setReset((r) => r + 1)} aria-label="Reset camera view"
        className="glass absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full p-2.5 text-sm font-semibold transition hover:bg-surface-hover md:bottom-4 md:top-auto md:px-4 md:py-2">
        <RotateCcw size={15} /><span className="hidden md:inline">Reset view</span>
      </button>
    </div>
  )
}
