import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useParts, type Part } from './assets'
import { armrests, type CabinExtent, type Slot } from './layout'

/** Fabric: matte upholstery tinted per seat (instanceColor) plus a per-seat emissive glow (aGlow). */
function fabricMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.82, metalness: 0 })
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance += vColor.rgb * vGlow;\n#endif')
  }
  m.customProgramCacheKey = () => 'skypulse-fabric'
  return m
}

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(1, 1, 1), tmpP = new THREE.Vector3()
const tmpC = new THREE.Color(), camLocal = new THREE.Vector3()

type Paint = (i: number, t: number, out: THREE.Color) => number

function SeatSet({ parts, slots, offset, paint, onPick, onHover, lifts, fabric }: {
  parts: Part[]; slots: Slot[]; offset: number; paint: Paint; lifts: Float32Array; fabric: THREE.Material
  onPick?: (i: number) => void; onHover?: (i: number | null, e?: ThreeEvent<PointerEvent>) => void
}) {
  const refs = useRef<(THREE.InstancedMesh | null)[]>([])
  const shown = useRef(new Float32Array(slots.length).fill(-1))
  const ready = useRef(new WeakSet<THREE.InstancedMesh>()) // meshes whose matrices have been uploaded
  const glow = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(slots.length), 1), [slots.length])
  const geos = useMemo(() => parts.map((p) => {
    const g = p.geometry.clone()
    if (p.name === 'Fabric') g.setAttribute('aGlow', glow)
    return g
  }), [parts, glow])
  const mats = useMemo(() => parts.map((p) => {
    if (p.name === 'Fabric') return fabric
    const m = (p.material as THREE.MeshStandardMaterial).clone()
    if (p.name === 'Screen' || p.name === 'Light') m.emissiveIntensity = 2.2
    return m
  }), [parts, fabric])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const fab = refs.current[parts.findIndex((p) => p.name === 'Fabric')]
    // a re-created mesh starts with identity matrices: force a full upload for it
    if (refs.current.some((m) => m && !ready.current.has(m))) {
      shown.current.fill(-1)
      refs.current.forEach((m) => m && ready.current.add(m))
    }
    for (let i = 0; i < slots.length; i++) {
      const g = paint(offset + i, t, tmpC)
      if (fab) fab.setColorAt(i, tmpC)
      glow.array[i] = g
      const lift = lifts[offset + i]
      if (lift !== shown.current[i]) {
        shown.current[i] = lift
        tmpP.set(slots[i].x, lift, slots[i].z)
        tmpM.compose(tmpP, tmpQ, tmpS)
        refs.current.forEach((m) => { if (m) { m.setMatrixAt(i, tmpM); m.instanceMatrix.needsUpdate = true } })
      }
    }
    glow.needsUpdate = true
    if (fab?.instanceColor) fab.instanceColor.needsUpdate = true
  })
  useLayoutEffect(() => { shown.current.fill(-1) }, [slots])

  const events = onPick ? {
    onPointerMove: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover?.(offset + (e.instanceId ?? 0), e) },
    onPointerOut: () => onHover?.(null),
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onPick(offset + (e.instanceId ?? 0)) },
  } : {}
  return (
    <>
      {parts.map((p, k) => (
        <instancedMesh key={`${p.group}-${p.name}-${slots.length}`} ref={(m) => { refs.current[k] = m }} args={[geos[k], mats[k], slots.length]}
          frustumCulled={false} {...(p.name === 'Fabric' || p.name === 'Shell' || p.name === 'PodShell' ? events : {})} />
      ))}
    </>
  )
}

/** Static instanced copies of one part (armrests, fuselage segments). */
function Instances({ part, matrices, material }: { part: Part; matrices: THREE.Matrix4[]; material: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    matrices.forEach((m, i) => ref.current!.setMatrixAt(i, m))
    ref.current!.instanceMatrix.needsUpdate = true
  }, [matrices])
  return <instancedMesh ref={ref} args={[part.geometry, material, matrices.length]} frustumCulled={false} />
}

function wallMaterials(parts: Part[]) {
  return parts.map((p) => {
    const m = (p.material as THREE.MeshStandardMaterial).clone()
    if (p.name === 'Window') { m.emissiveIntensity = 2.4; m.toneMapped = false }
    if (p.name === 'AisleLight') { m.emissiveIntensity = 3; m.toneMapped = false }
    if (/^[LR]_(upper|win)/.test(p.group)) { m.transparent = true }
    return m
  })
}

export function CabinModel({ slots, extent, paint, lifts, onPick, onHover, fadeNear = true }: {
  slots: Slot[]; extent: CabinExtent; paint: Paint; lifts?: Float32Array
  onPick?: (i: number) => void; onHover?: (i: number | null, e?: ThreeEvent<PointerEvent>) => void; fadeNear?: boolean
}) {
  const eco = useParts('seatEco'), biz = useParts('seatBiz'), seg = useParts('segment'), front = useParts('front'), rear = useParts('rear'), div = useParts('divider')
  const fabric = useMemo(fabricMaterial, [])
  useEffect(() => () => fabric.dispose(), [fabric])
  const ecoSlots = useMemo(() => slots.filter((s) => s.kind === 'eco'), [slots])
  const bizSlots = useMemo(() => slots.filter((s) => s.kind === 'biz'), [slots])
  // slot index -> position inside its kind (the parent passes indices into `slots`)
  const order = useMemo(() => [...bizSlots, ...ecoSlots], [bizSlots, ecoSlots])
  const remap = useMemo(() => order.map((s) => slots.indexOf(s)), [order, slots])
  const liftArr = useMemo(() => lifts ?? new Float32Array(slots.length), [lifts, slots.length])
  const orderedLifts = useRef(new Float32Array(order.length))
  const paintOrdered: Paint = (i, t, c) => paint(remap[i], t, c)
  useFrame(() => { for (let i = 0; i < order.length; i++) orderedLifts.current[i] = liftArr[remap[i]] })
  const pick = onPick && ((i: number) => onPick(remap[i]))
  const hover = onHover && ((i: number | null, e?: ThreeEvent<PointerEvent>) => onHover(i == null ? null : remap[i], e))

  const ecoSeat = eco.filter((p) => p.group !== 'Armrest'), arm = eco.find((p) => p.group === 'Armrest')
  const armMats = useMemo(() => armrests(ecoSlots).map(([x, z]) => new THREE.Matrix4().makeTranslation(x, 0, z)), [ecoSlots])
  const armMat = useMemo(() => arm && (arm.material as THREE.Material).clone(), [arm])

  const length = extent.front - extent.rear
  const nSeg = Math.ceil(length)
  const segMats = useMemo(() => Array.from({ length: nSeg }, (_, k) =>
    new THREE.Matrix4().compose(new THREE.Vector3(extent.rear + (k + 0.5) * (length / nSeg), 0, 0), new THREE.Quaternion(), new THREE.Vector3(length / nSeg, 1, 1))), [extent.rear, length, nSeg])
  const segM = useMemo(() => wallMaterials(seg), [seg])
  const frontM = useMemo(() => wallMaterials(front), [front])
  const rearM = useMemo(() => wallMaterials(rear), [rear])
  const divM = useMemo(() => wallMaterials(div), [div])
  const group = useRef<THREE.Group>(null)
  const sideMats = useMemo(() => [...seg.map((p, i) => [p, segM[i]] as const), ...front.map((p, i) => [p, frontM[i]] as const), ...rear.map((p, i) => [p, rearM[i]] as const)]
    .filter(([p]) => /^[LR]_(upper|win)/.test(p.group)), [seg, front, rear, segM, frontM, rearM])

  // fade the upper wall + bins on the side nearest the camera (cut-away view)
  useFrame(({ camera }) => {
    if (!group.current) return
    camLocal.copy(camera.position)
    group.current.worldToLocal(camLocal)
    const near = camLocal.z > 0 ? 'L' : 'R' // Blender +Y ("L") is three -Z
    for (const [p, m] of sideMats) {
      const isNear = fadeNear && p.group[0] !== near && camLocal.y > 1.2
      const target = isNear ? 0.06 : 1
      const mm = m as THREE.MeshStandardMaterial
      mm.opacity += (target - mm.opacity) * 0.12
      mm.depthWrite = mm.opacity > 0.9
    }
  })

  return (
    <group ref={group}>
      <SeatSet parts={biz} slots={bizSlots} offset={0} paint={paintOrdered} lifts={orderedLifts.current} fabric={fabric} onPick={pick} onHover={hover} />
      <SeatSet parts={ecoSeat} slots={ecoSlots} offset={bizSlots.length} paint={paintOrdered} lifts={orderedLifts.current} fabric={fabric} onPick={pick} onHover={hover} />
      {arm && armMat && armMats.length > 0 && <Instances part={arm} matrices={armMats} material={armMat} />}
      {seg.map((p, i) => <Instances key={`seg${i}`} part={p} matrices={segMats} material={segM[i]} />)}
      {extent.nose ? front.map((p, i) => <mesh key={`f${i}`} geometry={p.geometry} material={frontM[i]} position={[extent.front, 0, 0]} />)
        : rear.map((p, i) => <mesh key={`fc${i}`} geometry={p.geometry} material={rearM[i]} position={[extent.front, 0, 0]} rotation={[0, Math.PI, 0]} />)}
      {rear.map((p, i) => <mesh key={`r${i}`} geometry={p.geometry} material={rearM[i]} position={[extent.rear, 0, 0]} />)}
      {extent.dividers.map((x) => div.map((p, i) => <mesh key={`d${x}${i}`} geometry={p.geometry} material={divM[i]} position={[x, 0, 0]} />))}
    </group>
  )
}

/** One merged geometry of a whole seat (for the hover / selection outline). */
export function useSeatOutline(kind: 'eco' | 'biz') {
  const parts = useParts(kind === 'eco' ? 'seatEco' : 'seatBiz')
  return useMemo(() => {
    const geos = parts.filter((p) => p.group !== 'Armrest').map((p) => {
      const g = p.geometry.clone()
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a)
      return g.index ? g.toNonIndexed() : g
    })
    return mergeGeometries(geos)
  }, [parts])
}
