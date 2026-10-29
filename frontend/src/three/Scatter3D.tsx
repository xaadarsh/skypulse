import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitImpl } from 'three-stdlib'
import { quietGL, useFrameloop } from '../lib/motion'
import { SEG_COLORS } from './colors'

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')!, grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

function Cloud({ pts, color, dim }: { pts: number[][]; color: string; dim: boolean }) {
  const mat = useRef<THREE.PointsMaterial>(null)
  const tex = useMemo(dotTexture, [])
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap(([x, y, z]) => [x, z, y]), 3))
    return g
  }, [pts])
  useFrame(() => { if (mat.current) mat.current.opacity += ((dim ? 0.08 : 0.95) - mat.current.opacity) * 0.12 })
  return (
    <points geometry={geo}>
      <pointsMaterial ref={mat} color={color} size={0.24} map={tex} transparent depthWrite={false} sizeAttenuation blending={THREE.AdditiveBlending} />
    </points>
  )
}

export default function Scatter3D({ points, focus }: { points: [number, number, number, number][]; focus: number | null }) {
  const frameloop = useFrameloop()
  const wrap = useRef<HTMLDivElement>(null)
  const controls = useRef<OrbitImpl | null>(null)
  const coarse = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches, [])
  const groups = useMemo(() => {
    const m = new Map<number, number[][]>()
    points.forEach(([x, y, z, k]) => { if (!m.has(k)) m.set(k, []); m.get(k)!.push([x, y, z]) })
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [points])
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const wheel = (e: WheelEvent) => e.preventDefault() // wheel zooms the chart, not the page
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])
  return (
    <div ref={wrap} data-lenis-prevent data-testid="scatter-canvas" className="relative h-full w-full select-none" style={{ touchAction: 'pan-y' }}>
      <Canvas onCreated={quietGL} frameloop={frameloop} camera={{ position: [7, 5, 9], fov: 45 }} dpr={[1, 1.75]}>
        <gridHelper args={[14, 14, '#334155', '#1e293b']} position={[0, -3.5, 0]} />
        {groups.map(([k, pts]) => <Cloud key={k} pts={pts} color={SEG_COLORS[k % 6]} dim={focus != null && focus !== k} />)}
        <OrbitControls ref={controls as never} autoRotate autoRotateSpeed={0.6} enablePan={false} minDistance={5} maxDistance={22} enableDamping
          touches={coarse ? { ONE: -1 as unknown as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_ROTATE } : undefined} />
      </Canvas>
      <button type="button" onClick={() => controls.current?.reset()} aria-label="Reset 3D view"
        className="glass absolute bottom-4 right-4 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-surface-hover">
        <RotateCcw size={15} />Reset view
      </button>
      <span className="glass pointer-events-none absolute left-4 top-4 rounded-full px-3 py-1.5 text-[13px] text-muted"><span className="hidden md:inline">Scroll to zoom · drag to rotate</span><span className="md:hidden">Pinch to zoom</span></span>
    </div>
  )
}
