import { Environment, PerformanceMonitor, Stars, useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, DepthOfField, EffectComposer } from '@react-three/postprocessing'
import type { MotionValue } from 'framer-motion'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { quietGL, useFrameloop } from '../lib/motion'
import { preload, useModelScene } from './assets'
import { CabinModel } from './CabinModel'
import { storyLayout } from './layout'

preload('airliner')

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// camera keyframes [progress, position, look-at]
const PATH: [number, THREE.Vector3, THREE.Vector3][] = [
  [0.0, v3(-4.2, 1.2, 8.2), v3(0.3, 0.1, 0)],
  [0.18, v3(-2.0, 2.0, 7.0), v3(0, 0.1, 0)],
  [0.36, v3(5.2, 1.0, 5.2), v3(0, 0.0, 0)],
  [0.5, v3(1.0, 0.25, 1.4), v3(0.2, 0.1, 0.4)],
]
const CABIN_PATH: [number, THREE.Vector3, THREE.Vector3][] = [
  [0.55, v3(7.5, 8.5, 10.5), v3(-3.2, 0.4, 0)],
  [0.8, v3(2.0, 12.5, 9.5), v3(-3.2, 0.3, 0)],
  [1.0, v3(-11.5, 11.0, 8.5), v3(-3.2, 0.3, 0)],
]
function sample(path: typeof PATH, p: number, pos: THREE.Vector3, look: THREE.Vector3) {
  let i = 0
  while (i < path.length - 2 && p > path[i + 1][0]) i++
  const [p0, a, la] = path[i], [p1, b, lb] = path[i + 1]
  const t = smooth(p0, p1, p)
  pos.lerpVectors(a, b, t); look.lerpVectors(la, lb, t)
}

const SUN = new THREE.Vector3(-0.6, 0.55, 0.6).normalize()

function Globe() {
  const [day, night] = useTexture(['/textures/earth_day.jpg', '/textures/earth_night.jpg'])
  day.colorSpace = THREE.SRGBColorSpace
  night.colorSpace = THREE.SRGBColorSpace
  const ref = useRef<THREE.Mesh>(null)
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { day: { value: day }, night: { value: night }, sun: { value: SUN } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position,1.); vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform sampler2D day; uniform sampler2D night; uniform vec3 sun; varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main(){ float l = dot(normalize(vN), sun);
        vec3 d = texture2D(day, vUv).rgb * (smoothstep(-0.15, 0.7, l) * 0.85 + 0.03);
        vec3 n = texture2D(night, vUv).rgb * smoothstep(0.15, -0.25, l) * 2.2;
        float rim = pow(1. - max(dot(normalize(vN), vView), 0.), 3.);
        vec3 col = d + n + vec3(0.3, 0.55, 1.0) * rim * 0.45 * (0.3 + 0.7 * smoothstep(-0.3, 0.5, l));
        gl_FragColor = vec4(col, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), [day, night])
  const atmo = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { sun: { value: SUN } }, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 sun; varying vec3 vN; varying vec3 vW;
      void main(){ vec3 v = normalize(cameraPosition - vW); float i = pow(max(0., 0.68 - dot(vN, v)), 3.0) * 1.6;
        float lit = 0.35 + 0.65 * smoothstep(-0.4, 0.6, dot(vN, sun));
        gl_FragColor = vec4(vec3(0.3, 0.55, 1.0) * i * lit, clamp(i * lit, 0., 0.85)); }`,
  }), [])
  useFrame((_, d) => { if (ref.current) ref.current.rotation.y += d * 0.02 })
  return (
    <group position={[0, -7.6, -1]}>
      <mesh ref={ref} material={mat} rotation={[-0.25, 2.4, 0.1]}><sphereGeometry args={[6, 96, 64]} /></mesh>
      <mesh material={atmo} scale={1.06}><sphereGeometry args={[6, 64, 48]} /></mesh>
    </group>
  )
}

function Clouds() {
  const tex = useTexture('/textures/cloud.png')
  tex.colorSpace = THREE.SRGBColorSpace
  const items = useMemo(() => Array.from({ length: 22 }, (_, i) => ({
    x: (i / 22) * 36 - 18, y: -2.3 + ((i * 37) % 10) / 10 * 0.9, z: -13 + ((i * 53) % 17) / 17 * 9, s: 1.4 + ((i * 29) % 7) / 7 * 1.6, flip: i % 2 ? 1 : -1,
  })), [])
  const group = useRef<THREE.Group>(null)
  useFrame((_, d) => {
    group.current?.children.forEach((c) => { c.position.x -= d * 1.5; if (c.position.x < -19) c.position.x += 38 })
  })
  return (
    <group ref={group}>
      {items.map((c, i) => (
        <sprite key={i} position={[c.x, c.y, c.z]} scale={[c.s * 1.9 * c.flip, c.s, 1]}>
          <spriteMaterial map={tex} color="#c9d4ea" transparent opacity={0.8} depthWrite={false} fog />
        </sprite>
      ))}
    </group>
  )
}

function trailTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128
  const g = c.getContext('2d')!, grd = g.createLinearGradient(0, 0, 0, 128)
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.75, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0.0)')
  g.fillStyle = grd; g.fillRect(0, 0, 4, 128)
  return new THREE.CanvasTexture(c)
}

function Airliner() {
  const scene = useModelScene('airliner')
  const model = useMemo(() => {
    const s = scene.clone(true)
    s.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (!m) return
      if (m.name === 'Window') { m.emissiveIntensity = 3; m.toneMapped = false }
      m.envMapIntensity = 1.3
    })
    return s
  }, [scene])
  const trail = useMemo(trailTexture, [])
  return (
    <group scale={0.135}>
      <primitive object={model} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-2.8 - 22, -1.9, s * 5.9]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.45, 0.08, 44, 12, 1, true]} />
          <meshBasicMaterial map={trail} alphaMap={trail} transparent opacity={0.55} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

function StoryCabin({ progress }: { progress: MotionValue<number> }) {
  const { slots, extent } = useMemo(() => storyLayout(9), [])
  const risk = useMemo(() => slots.map((_, i) => ((i * 7919) % 100) / 100), [slots])
  const red = useMemo(() => new THREE.Color('#ff5d52'), []), amber = useMemo(() => new THREE.Color('#f6b23c'), []), green = useMemo(() => new THREE.Color('#2fd08f'), [])
  const paint = (i: number, _t: number, out: THREE.Color) => {
    const p = progress.get(), r = slots[i].row
    const reveal = smooth(0.58, 0.68, p)
    const fix = smooth(0.78 + r * 0.018, 0.82 + r * 0.018, p)
    out.copy(risk[i] > 0.35 ? red : amber).lerp(green, fix).multiplyScalar(0.45 + 0.55 * reveal)
    return 0.12 + reveal * 0.15 + Math.sin(fix * Math.PI) * 0.9
  }
  return <CabinModel slots={slots} extent={extent} paint={paint} fadeNear />
}

function Scene({ progress, quality, effects }: { progress: MotionValue<number>; quality: 'high' | 'low'; effects: boolean }) {
  const plane = useRef<THREE.Group>(null)
  const world = useRef<THREE.Group>(null)
  const cabin = useRef<THREE.Group>(null)
  const { camera, size } = useThree()
  const pos = useMemo(() => new THREE.Vector3(), []), look = useMemo(() => new THREE.Vector3(), [])
  const right = useMemo(() => new THREE.Vector3(), [])
  const ptr = useRef({ x: 0, y: 0 })
  const [inCabin, setInCabin] = useState(false)
  const [cabinReady, setCabinReady] = useState(false)
  useFrame(({ clock, pointer }) => {
    const p = progress.get(), t = clock.getElapsedTime()
    ptr.current.x += (pointer.x - ptr.current.x) * 0.05; ptr.current.y += (pointer.y - ptr.current.y) * 0.05
    if (!cabinReady && p > 0.3) setCabinReady(true)
    const cab = p > 0.53
    if (cab !== inCabin) setInCabin(cab)
    world.current!.visible = !cab
    cabin.current!.visible = cab
    if (cab) sample(CABIN_PATH, p, pos, look); else sample(PATH, p, pos, look)
    const portrait = size.width < size.height
    if (portrait) pos.sub(look).multiplyScalar(cab ? 1.75 : 1.6).add(look)
    // keep the subject clear of the text: hero/captions sit on the left (top on phones)
    right.subVectors(look, pos).cross(camera.up).normalize()
    const intro = 1 - smooth(0, 0.2, p)
    if (portrait) look.y += (cab ? 1.6 : 3.0 * intro + 0.6)
    else look.addScaledVector(right, -(cab ? 2.6 : 2.4 * intro + 0.8))
    pos.x += ptr.current.x * 0.4; pos.y += ptr.current.y * 0.25
    camera.position.copy(pos)
    camera.lookAt(look)
    const g = plane.current!
    g.position.set(0.3, 0.15 + Math.sin(t * 1.2) * 0.06, 0)
    g.rotation.set(-smooth(0.12, 0.34, p) * 0.5 + Math.sin(t * 0.9) * 0.025, 0, Math.sin(t * 0.7) * 0.015 + 0.1 * smooth(0.2, 0.4, p))
  })
  return (
    <>
      <color attach="background" args={['#03050d']} />
      <fog attach="fog" args={['#03050d', 16, 60]} />
      <Stars radius={70} depth={40} count={2500} factor={3} saturation={0.3} fade speed={0.4} />
      <Environment files="/hdri/studio.hdr" environmentIntensity={0.6} />
      <hemisphereLight args={['#dbe7ff', '#0b1020', 0.45]} />
      <directionalLight position={[-6, 6, 6]} intensity={2.4} color="#fff1dc" />
      <directionalLight position={[6, 2, -4]} intensity={0.6} color="#8b9cff" />
      <group ref={world}>
        <Globe />
        <Clouds />
        <group ref={plane}><Airliner /></group>
      </group>
      <group ref={cabin} visible={false}>
        {cabinReady && <Suspense fallback={null}><StoryCabin progress={progress} /></Suspense>}
      </group>
      {quality === 'high' && effects && (
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur intensity={0.45} luminanceThreshold={1.0} luminanceSmoothing={0.15} />
          <DepthOfField target={inCabin ? [-3.2, 0.5, 0] : [0.3, 0.15, 0]} focalLength={inCabin ? 0.03 : 0.015} bokehScale={inCabin ? 2.2 : 0.8} />
        </EffectComposer>
      )}
    </>
  )
}

/** Rendered after the scene's assets have loaded: compiles every shader in parallel
 *  (KHR_parallel_shader_compile) before the first frame, so the first render does not block the page. */
function Warmup({ onReady }: { onReady: () => void }) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    let live = true
    const done = () => { if (live) onReady() }
    gl.compileAsync(scene, camera).then(done, done)
    return () => { live = false }
  }, [gl, scene, camera, onReady])
  return null
}

export default function HomeStory({ progress }: { progress: MotionValue<number> }) {
  const frameloop = useFrameloop()
  const [quality, setQuality] = useState<'high' | 'low'>('high')
  const [warm, setWarm] = useState(false)
  const ready = useCallback(() => setWarm(true), [])
  // bloom compiles several big shaders: add it on the first scroll or mouse move, not during page load
  const [effects, setEffects] = useState(false)
  useEffect(() => {
    const on = () => setEffects(true)
    const unsub = progress.on('change', (v) => { if (v > 0.005) on() })
    addEventListener('pointermove', on, { once: true })
    addEventListener('touchstart', on, { once: true, passive: true })
    return () => { unsub(); removeEventListener('pointermove', on); removeEventListener('touchstart', on) }
  }, [progress])
  return (
    <Canvas onCreated={quietGL} frameloop={warm ? frameloop : 'never'} camera={{ position: [-4.2, 1.2, 8.2], fov: 40, near: 0.05, far: 200 }} dpr={quality === 'high' ? [1, 1.75] : 1}
      gl={{ stencil: false, antialias: true, alpha: true, powerPreference: 'high-performance' }}>
      <PerformanceMonitor onDecline={() => setQuality('low')} onIncline={() => setQuality('high')} flipflops={3} onFallback={() => setQuality('low')} />
      <Suspense fallback={null}><Scene progress={progress} quality={quality} effects={effects} /><Warmup onReady={ready} /></Suspense>
    </Canvas>
  )
}
