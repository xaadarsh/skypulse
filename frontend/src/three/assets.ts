import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Models are built by tools/blender/*.py and Draco-compressed; the decoder is bundled in /draco/ (works offline). */
const DRACO = '/draco/'
export const MODELS = {
  seatEco: '/models/seat_eco.glb',
  seatBiz: '/models/seat_business.glb',
  segment: '/models/cabin_segment.glb',
  front: '/models/cabin_front.glb',
  rear: '/models/cabin_rear.glb',
  divider: '/models/cabin_divider.glb',
  airliner: '/models/airliner.glb',
}
export const preload = (...keys: (keyof typeof MODELS)[]) => keys.forEach((k) => useGLTF.preload(MODELS[k], DRACO))

export type Part = { geometry: THREE.BufferGeometry; material: THREE.Material; name: string; group: string }

/** Merge every mesh of a glTF scene into one geometry per (top-level node prefix, material). */
export function splitParts(scene: THREE.Object3D): Part[] {
  scene.updateMatrixWorld(true)
  const buckets = new Map<string, { geos: THREE.BufferGeometry[]; material: THREE.Material; name: string; group: string }>()
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    let top: THREE.Object3D = mesh
    while (top.parent && top.parent !== scene) top = top.parent
    const group = top.name // "L_upper", "R_lower", "core", "SeatEco", "Armrest"...
    const mat = mesh.material as THREE.Material
    const key = `${group}|${mat.name}`
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
    // keep only the attributes every part shares
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(a)) g.deleteAttribute(a)
    if (!buckets.has(key)) buckets.set(key, { geos: [], material: mat, name: mat.name, group })
    buckets.get(key)!.geos.push(g)
  })
  return [...buckets.values()].map((b) => {
    const hasColor = b.geos.every((g) => g.attributes.color)
    if (!hasColor) b.geos.forEach((g) => g.deleteAttribute('color'))
    const allIndexed = b.geos.every((g) => g.index)
    const geos = allIndexed ? b.geos : b.geos.map((g) => (g.index ? g.toNonIndexed() : g))
    return { geometry: mergeGeometries(geos), material: b.material, name: b.name, group: b.group }
  })
}

export function useParts(key: keyof typeof MODELS) {
  const { scene } = useGLTF(MODELS[key], DRACO)
  return useMemo(() => splitParts(scene), [scene])
}

export function useModelScene(key: keyof typeof MODELS) {
  return useGLTF(MODELS[key], DRACO).scene
}
