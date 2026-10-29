import { Stars } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { quietGL, useFrameloop } from '../lib/motion'

function glowTexture(inner: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grd.addColorStop(0, inner)
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const NEBULA = [
  { pos: [-9, 4, -22], scale: 26, color: 'rgba(56,189,248,0.55)', speed: 0.03 },
  { pos: [10, -3, -26], scale: 30, color: 'rgba(139,92,246,0.55)', speed: -0.025 },
  { pos: [2, 8, -30], scale: 22, color: 'rgba(99,102,241,0.45)', speed: 0.02 },
  { pos: [-4, -9, -24], scale: 20, color: 'rgba(14,165,233,0.35)', speed: -0.035 },
  { pos: [14, 9, -32], scale: 24, color: 'rgba(168,85,247,0.35)', speed: 0.015 },
] as const

function Nebula({ dark }: { dark: boolean }) {
  const group = useRef<THREE.Group>(null)
  const textures = useMemo(() => NEBULA.map((n) => glowTexture(dark ? n.color : n.color.replace(/0\.\d+\)/, '0.28)'))), [dark])
  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const t = clock.getElapsedTime()
    g.children.forEach((m, i) => {
      const n = NEBULA[i]
      m.position.x = n.pos[0] + Math.sin(t * n.speed * 6 + i) * 2.5
      m.position.y = n.pos[1] + Math.cos(t * n.speed * 5 + i) * 1.5
      m.rotation.z = t * n.speed
    })
  })
  return (
    <group ref={group}>
      {NEBULA.map((n, i) => (
        <mesh key={i} position={n.pos as unknown as [number, number, number]} scale={n.scale}>
          <planeGeometry />
          <meshBasicMaterial map={textures[i]} transparent depthWrite={false} blending={dark ? THREE.AdditiveBlending : THREE.NormalBlending} />
        </mesh>
      ))}
    </group>
  )
}

function Rig() {
  const stars = useRef<THREE.Group>(null)
  useFrame(({ camera, pointer }, d) => {
    camera.position.x += (pointer.x * 0.9 - camera.position.x) * 0.03
    camera.position.y += (pointer.y * 0.6 - camera.position.y) * 0.03
    camera.lookAt(0, 0, -20)
    if (stars.current) {
      stars.current.rotation.y += d * 0.006
      stars.current.rotation.x = window.scrollY * 0.00012
    }
  })
  return <group ref={stars}><Stars radius={90} depth={60} count={3500} factor={3.2} saturation={0.4} fade speed={0.5} /></group>
}

export default function SpaceBackground({ dark }: { dark: boolean }) {
  const frameloop = useFrameloop()
  return (
    <Canvas onCreated={quietGL} frameloop={frameloop} camera={{ position: [0, 0, 5], fov: 60 }} dpr={[1, 1.5]} gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}>
      {dark && <Rig />}
      <Nebula dark={dark} />
    </Canvas>
  )
}
