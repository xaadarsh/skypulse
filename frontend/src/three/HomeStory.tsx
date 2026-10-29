import { Environment, Stars, useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { MotionValue } from 'framer-motion'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { quietGL, useFrameloop } from '../lib/motion'
import { preload, useModelScene } from './assets'
import { CabinModel } from './CabinModel'
import { CABIN, cabinProgress, clamp01, focusIndex, HERO, rippleX, scanX, seatRisk, smooth } from './story'

preload('airliner', 'seatEco', 'seatBiz', 'segment', 'front', 'rear', 'divider')

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

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


/** Plane origin in the scene and its scale (the models are in metres). */
const P = v3(0.3, 0.15, 0), K = 0.135
/** The 25-row cabin (metres, nose tip at x = 7.1) sits inside the fuselage at 0.75 scale, floor 1.1 m below the axis. */
const CAB_POS = v3(9, -1.1, 0), CAB_S = 0.75
/** cabin metres -> scene units */
const cab = (x: number, y: number, z: number) => v3(CAB_POS.x + CAB_S * x, CAB_POS.y + CAB_S * y, CAB_S * z).multiplyScalar(K).add(P)
const CORNERS = [-24.2, 7.2].flatMap((x) => [0, 2.3].flatMap((y) => [-1.95, 1.95].map((z) => cab(x, y, z))))
const CENTRE = cab(-8.5, 0.9, 0)
const FOCUS = CABIN.slots[focusIndex]

/** Where the text is not: wide screens keep the left 40% for captions, narrow ones the top ~30% (and the chip the bottom).
 *  The camera's optical centre is moved to the middle of the free area with a view offset. */
function frame(w: number, h: number) {
  const wide = w >= 1024
  return wide ? { wide, fullW: w * 1.4, fullH: h, bx: 0.39, by: 0.74 } : { wide, fullW: w, fullH: h * 1.2, bx: 0.9, by: 0.45 }
}

function fitDistance(target: THREE.Vector3, dir: THREE.Vector3, aspect: number, bx: number, by: number) {
  const cam = new THREE.PerspectiveCamera(40, aspect, 0.01, 500), v = new THREE.Vector3()
  let lo = 0.1, hi = 80
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2
    cam.position.copy(target).addScaledVector(dir, mid)
    cam.lookAt(target)
    cam.updateMatrixWorld()
    const fits = CORNERS.every((c) => { v.copy(c).project(cam); return Math.abs(v.x) <= bx && Math.abs(v.y) <= by && v.z < 1 })
    if (fits) hi = mid; else lo = mid
  }
  return hi
}

/** Camera spline (Catmull-Rom through key views) for the current screen. Key times are page progress. */
function buildPath(w: number, h: number) {
  const f = frame(w, h), aspect = f.fullW / f.fullH
  const at = (s: number) => HERO + s * (1 - HERO)
  const dir = (az: number, el: number) => v3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
  const view = (az: number, el: number, frac: number, look = CENTRE) => {
    const d = dir(az, el)
    return [look.clone().addScaledVector(d, fitDistance(CENTRE, d, aspect, f.bx, f.by) * frac), look] as const
  }
  const far = (pos: THREE.Vector3, look: THREE.Vector3, k: number) => [pos.clone().sub(look).multiplyScalar(k).add(look), look] as const
  const n = f.wide ? 1 : 1.6, na = f.wide ? 1 : 2.4
  const side = Math.sign(FOCUS.z) || 1
  const seat = cab(FOCUS.x, 0.6, FOCUS.z)
  const keys: [number, readonly [THREE.Vector3, THREE.Vector3]][] = [
    // phones: the hero text fills the top, so the plane sits lower
    [0, far(v3(-4.2, f.wide ? 1.2 : 2.6, 8.2), v3(0.3, f.wide ? 0.1 : 1.5, 0), n)],
    [at(0), far(v3(-2.4, 1.6, 7.0), v3(0.4, 0.05, 0), na)],
    [at(0.13), far(v3(2.2, 2.8, 5.6), v3(0.5, 0, 0), na)],
    [at(0.2), f.wide ? view(0.38, 0.78, 1) : view(1.2, 0.95, 1)],
    [at(0.38), f.wide ? view(0.38, 0.74, 0.86) : view(1.2, 0.9, 0.88)],
    [at(0.5), f.wide ? view(0.22, 0.64, 0.8) : view(1.05, 0.82, 0.8)],
    [at(0.57), f.wide ? view(0.1, 0.55, 0.56, CENTRE.clone().lerp(seat, 0.5)) : view(0.95, 0.72, 0.62, CENTRE.clone().lerp(seat, 0.5))],
    [at(0.66), [cab(FOCUS.x + 2.4, 2.2, -side * 0.15), seat]],
    [at(0.77), [cab(FOCUS.x + 2.0, 2.05, -side * 0.35), seat]],
    [at(0.87), f.wide ? view(0.28, 0.88, 0.8) : view(1.15, 0.95, 0.85)],
    [at(1), f.wide ? view(0.3, 0.95, 1) : view(1.2, 1.0, 1)],
  ]
  return {
    f, times: keys.map((k) => k[0]),
    pos: new THREE.CatmullRomCurve3(keys.map((k) => k[1][0]), false, 'centripetal'),
    look: new THREE.CatmullRomCurve3(keys.map((k) => k[1][1]), false, 'centripetal'),
  }
}

function Airliner({ fade }: { fade: RefObject<number> }) {
  const scene = useModelScene('airliner')
  const group = useRef<THREE.Group>(null)
  const { model, mats } = useMemo(() => {
    const s = scene.clone(true), mats: THREE.MeshStandardMaterial[] = []
    s.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      // transparent from the start so fading the fuselage never recompiles a shader mid-scroll
      const m = (mesh.material as THREE.MeshStandardMaterial).clone()
      if (m.name === 'Window') { m.emissiveIntensity = 3; m.toneMapped = false }
      m.envMapIntensity = 1.3
      m.transparent = true
      mesh.material = m
      mats.push(m)
    })
    return { model: s, mats }
  }, [scene])
  const trail = useMemo(trailTexture, [])
  const trailMat = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(() => {
    const o = fade.current
    for (const m of mats) { m.opacity = o; m.depthWrite = o > 0.95 }
    if (trailMat.current) trailMat.current.opacity = 0.55 * o
    if (group.current) group.current.visible = o > 0.01
  })
  return (
    <group ref={group}>
      <primitive object={model} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-2.8 - 22, -1.9, s * 5.9]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.45, 0.08, 44, 12, 1, true]} />
          <meshBasicMaterial ref={s < 0 ? trailMat : undefined} map={trail} alphaMap={trail} transparent opacity={0.55} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

const DIM = new THREE.Color('#262b36'), NEUTRAL = new THREE.Color('#9aa4b8'), RED = new THREE.Color('#ff5d52'), AMBER = new THREE.Color('#f6b23c'), GREEN = new THREE.Color('#2fd08f')
const bandColor = (r: number, low: THREE.Color) => (r >= 0.5 ? RED : r >= 0.3 ? AMBER : low)
const tmp = new THREE.Color()

/** Seat colours follow the story: neutral, then the scan line reveals red/amber, then a ripple turns them green. */
function StoryCabin({ s }: { s: RefObject<number> }) {
  const { slots, extent } = CABIN
  const line = useRef<THREE.Mesh>(null), lineMat = useRef<THREE.MeshBasicMaterial>(null)
  const ring = useRef<THREE.Mesh>(null), ringMat = useRef<THREE.MeshBasicMaterial>(null)
  const paint = (i: number, t: number, out: THREE.Color) => {
    const v = s.current, [rb, ra] = seatRisk[i], x = slots[i].x
    const found = clamp01((x - scanX(v)) / 0.8), fixed = clamp01((x - rippleX(v)) / 0.8)
    out.copy(NEUTRAL).lerp(bandColor(rb, NEUTRAL), found).lerp(tmp.copy(bandColor(ra, GREEN)), fixed)
    const focus = smooth(0.6, 0.64, v) * (1 - smooth(0.78, 0.82, v))
    const isFocus = i === focusIndex
    if (!isFocus) out.lerp(DIM, 0.8 * focus)
    const hot = rb >= 0.3 ? 1 : 0
    return (isFocus ? 1 : 1 - 0.8 * focus) * (0.06 + found * hot * 0.22 + Math.sin(found * Math.PI) * hot * 0.8 + Math.sin(fixed * Math.PI) * 0.9) + (isFocus ? focus * (0.7 + 0.35 * Math.sin(t * 4)) : 0)
  }
  useFrame(({ clock }) => {
    const v = s.current
    const scan = v > 0.41 && v < 0.58, rip = v > 0.81 && v < 0.96
    if (line.current && lineMat.current) {
      line.current.visible = scan || rip
      line.current.position.x = scan ? scanX(v) : rippleX(v)
      lineMat.current.color.set(scan ? '#5eead4' : '#2fd08f')
    }
    const focus = smooth(0.6, 0.64, v) * (1 - smooth(0.78, 0.82, v))
    if (ring.current && ringMat.current) {
      ring.current.visible = focus > 0.01
      ringMat.current.opacity = focus * (0.6 + 0.3 * Math.sin(clock.getElapsedTime() * 4))
    }
  })
  return (
    <>
      <CabinModel slots={slots} extent={extent} paint={paint} fadeNear lod={0.12} />
      <mesh ref={line} position={[0, 1.15, 0]} rotation={[0, Math.PI / 2, 0]} visible={false}>
        <planeGeometry args={[3.9, 2.3]} />
        <meshBasicMaterial ref={lineMat} transparent opacity={0.28} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh ref={ring} position={[FOCUS.x, 0.03, FOCUS.z]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.36, 0.46, 48]} />
        <meshBasicMaterial ref={ringMat} color="#ff5d52" transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  )
}

function Scene({ progress, reduce, card }: { progress: MotionValue<number>; reduce: boolean; card?: RefObject<HTMLDivElement | null> }) {
  const craft = useRef<THREE.Group>(null), cabin = useRef<THREE.Group>(null)
  const { camera, size } = useThree()
  const path = useMemo(() => buildPath(size.width, size.height), [size.width, size.height])
  const cur = useRef(progress.get())
  const s = useRef(cabinProgress(progress.get(), reduce)), fade = useRef(1)
  const pos = useMemo(() => new THREE.Vector3(), []), look = useMemo(() => new THREE.Vector3(), []), v = useMemo(() => new THREE.Vector3(), [])
  const seatWorld = useMemo(() => cab(FOCUS.x, 1.25, FOCUS.z), [])
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.aspect = path.f.fullW / path.f.fullH
    cam.setViewOffset(path.f.fullW, path.f.fullH, 0, 0, size.width, size.height)
    cam.updateProjectionMatrix()
  }, [camera, path, size.width, size.height])
  useFrame(({ clock }, dt) => {
    // damped scroll progress (no jumps); reduced motion snaps to one finished view per stage
    const target = progress.get()
    if (reduce) { const sv = cabinProgress(target, true); cur.current = sv < 0 ? target : HERO + sv * (1 - HERO) }
    else cur.current += (target - cur.current) * (1 - Math.exp(-dt * 7))
    const p = Math.min(1, Math.max(0, cur.current))
    s.current = cabinProgress(p)
    const sv = s.current
    fade.current = 1 - 0.86 * smooth(0.02, 0.12, sv) - 0.14 * smooth(0.14, 0.2, sv)
    const { times } = path
    let i = 0
    while (i < times.length - 2 && p > times[i + 1]) i++
    const u = (i + clamp01((p - times[i]) / (times[i + 1] - times[i]))) / (times.length - 1)
    path.pos.getPoint(u, pos); path.look.getPoint(u, look)
    camera.position.copy(pos)
    camera.lookAt(look)
    const t = clock.getElapsedTime(), calm = 1 - smooth(-0.1, 0.05, sv)
    craft.current!.position.set(P.x, P.y + Math.sin(t * 1.2) * 0.06 * calm, P.z)
    cabin.current!.visible = sv > -0.03 // hidden inside the opaque fuselage during the hero: don't draw it
    // the focus card follows its seat on screen
    const el = card?.current
    if (el) {
      const o = smooth(0.62, 0.66, sv) * (1 - smooth(0.77, 0.8, sv))
      el.style.opacity = String(o)
      el.style.visibility = o > 0.01 ? 'visible' : 'hidden'
      if (o > 0.01) {
        camera.updateMatrixWorld()
        v.copy(seatWorld).project(camera)
        const x = (v.x + 1) / 2 * size.width, y = (1 - v.y) / 2 * size.height, w = el.offsetWidth, h = el.offsetHeight
        const left = path.f.wide ? Math.min(size.width - w - 16, Math.max(size.width * 0.42, x + 36)) : Math.min(size.width - w - 12, Math.max(12, x - w / 2))
        const top = path.f.wide ? Math.min(size.height - h - 90, Math.max(96, y - h - 20)) : Math.min(size.height - h - 80, Math.max(size.height * 0.31, y - h - 36))
        el.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`
      }
    }
  })
  return (
    <>
      <color attach="background" args={['#03050d']} />
      <fog attach="fog" args={['#03050d', 16, 60]} />
      <Stars radius={70} depth={40} count={2500} factor={3} saturation={0.3} fade speed={reduce ? 0 : 0.4} />
      <Environment files="/hdri/studio.hdr" environmentIntensity={0.6} />
      <hemisphereLight args={['#dbe7ff', '#0b1020', 0.6]} />
      <directionalLight position={[-6, 6, 6]} intensity={2.4} color="#fff1dc" />
      <directionalLight position={[6, 2, -4]} intensity={0.6} color="#8b9cff" />
      <Globe />
      <Clouds />
      <group ref={craft} position={P} scale={K}>
        <Airliner fade={fade} />
        <group ref={cabin} position={CAB_POS} scale={CAB_S}><StoryCabin s={s} /></group>
      </group>
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
    // like gl.compileAsync, but the readiness poll stops when the canvas unmounts (three's own keeps polling
    // disposed materials and throws) and it does not warn on GPUs without KHR_parallel_shader_compile
    const pending = gl.compile(scene, camera)
    let timer = 0
    const poll = () => {
      if (!live) return
      for (const m of pending) {
        const program = (gl.properties.get(m) as { currentProgram?: { isReady(): boolean } }).currentProgram
        if (!program || program.isReady()) pending.delete(m)
      }
      if (pending.size) timer = window.setTimeout(poll, 10)
      else done()
    }
    poll()
    return () => { live = false; clearTimeout(timer) }
  }, [gl, scene, camera, onReady])
  return null
}

/** Home story canvas. One canvas, fixed pixel ratio (no resolution drops while scrolling, so nothing goes soft),
 *  no post-processing, and it stops rendering whenever the pinned section is off screen. */
export default function HomeStory({ progress, reduce = false, card }: { progress: MotionValue<number>; reduce?: boolean; card?: RefObject<HTMLDivElement | null> }) {
  const tab = useFrameloop()
  const [warm, setWarm] = useState(false)
  const [onScreen, setOnScreen] = useState(true)
  const wrap = useRef<HTMLDivElement>(null)
  const ready = useCallback(() => setWarm(true), [])
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting))
    io.observe(wrap.current!)
    return () => io.disconnect()
  }, [])
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
  return (
    <div ref={wrap} className="h-full w-full">
      <Canvas onCreated={quietGL} frameloop={warm && onScreen ? tab : 'never'} camera={{ position: [-4.2, 1.2, 8.2], fov: 40, near: 0.02, far: 200 }} dpr={dpr}
        gl={{ stencil: false, antialias: true, alpha: true, powerPreference: 'high-performance' }}>
        <Suspense fallback={null}><Scene progress={progress} reduce={reduce} card={card} /><Warmup onReady={ready} /></Suspense>
      </Canvas>
    </div>
  )
}
