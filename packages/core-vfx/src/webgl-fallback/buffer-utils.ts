import type { ParticleStorageArrays } from '../shaders/types'

/**
 * CPU-side typed array references extracted from TSL storage nodes.
 * Each field corresponds to a ParticleStorageArrays entry.
 */
export type CPUStorageArrays = {
  positions: Float32Array
  velocities: Float32Array
  lifetimes: Float32Array // float → stride 1
  fadeRates: Float32Array // float → stride 1
  particleSizes: Float32Array // float → stride 1
  particleSeeds: Float32Array | null // float → stride 1
  particleRotations: Float32Array | null
  particleColorStarts: Float32Array | null
  particleColorEnds: Float32Array | null
  strides: {
    positions: number
    velocities: number
    lifetimes: number
    fadeRates: number
    particleSizes: number
    particleSeeds: number
    particleRotations: number
    particleColorStarts: number
    particleColorEnds: number
  }
}

/**
 * Extract raw Float32Array references from TSL instancedArray storage nodes.
 * The underlying buffer is at `(node as any).value.array`.
 */
export const extractCPUArrays = (
  storage: ParticleStorageArrays,
  maxParticles: number
): CPUStorageArrays => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getArray = (node: any): Float32Array => node.value.array as Float32Array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getArrayOrNull = (node: any): Float32Array | null =>
    node ? (node.value.array as Float32Array) : null
  // WebGPU backend may mutate storage vec3 arrays to vec4-aligned arrays.
  // For CPU simulation, we restore a compact vec3 layout each frame so
  // per-frame uploads don't repack from an already-padded source.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ensureCompactVec3 = (node: any): Float32Array => {
    const attr = node.value
    const arr = attr.array as Float32Array
    const count = (attr.count as number) ?? maxParticles

    if (arr.length === count * 4) {
      const compact = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        const src = i * 4
        const dst = i * 3
        compact[dst] = arr[src]
        compact[dst + 1] = arr[src + 1]
        compact[dst + 2] = arr[src + 2]
      }
      attr.array = compact
      attr.itemSize = 3
      return compact
    }

    return arr
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ensureCompactVec3OrNull = (node: any): Float32Array | null =>
    node ? ensureCompactVec3(node) : null

  const positions = ensureCompactVec3(storage.positions)
  const velocities = ensureCompactVec3(storage.velocities)
  const lifetimes = getArray(storage.lifetimes)
  const fadeRates = getArray(storage.fadeRates)
  const particleSizes = getArray(storage.particleSizes)
  const particleSeeds = getArrayOrNull(storage.particleSeeds)
  const particleRotations = ensureCompactVec3OrNull(storage.particleRotations)
  const particleColorStarts = ensureCompactVec3OrNull(
    storage.particleColorStarts
  )
  const particleColorEnds = ensureCompactVec3OrNull(storage.particleColorEnds)

  const strideOf = (arr: Float32Array | null): number =>
    arr ? Math.max(1, Math.floor(arr.length / Math.max(1, maxParticles))) : 0

  return {
    positions,
    velocities,
    lifetimes,
    fadeRates,
    particleSizes,
    particleSeeds,
    particleRotations,
    particleColorStarts,
    particleColorEnds,
    strides: {
      positions: strideOf(positions),
      velocities: strideOf(velocities),
      lifetimes: strideOf(lifetimes),
      fadeRates: strideOf(fadeRates),
      particleSizes: strideOf(particleSizes),
      particleSeeds: strideOf(particleSeeds),
      particleRotations: strideOf(particleRotations),
      particleColorStarts: strideOf(particleColorStarts),
      particleColorEnds: strideOf(particleColorEnds),
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mark = (node: any) => {
  if (node?.value) node.value.needsUpdate = true
}

/**
 * Mark all storage buffers as needing upload to GPU.
 * After CPU writes, Three.js needs `.needsUpdate = true` to sync.
 */
export const markAllDirty = (storage: ParticleStorageArrays): void => {
  mark(storage.positions)
  mark(storage.velocities)
  mark(storage.lifetimes)
  mark(storage.fadeRates)
  mark(storage.particleSizes)
  if (storage.particleSeeds) mark(storage.particleSeeds)
  mark(storage.particleRotations)
  mark(storage.particleColorStarts)
  mark(storage.particleColorEnds)
}

/**
 * Mark only buffers that change during update (per-frame simulation).
 * Skips fadeRates, particleSizes, and colors which only change at spawn time.
 */
export const markUpdateDirty = (
  storage: ParticleStorageArrays,
  hasRotation: boolean
): void => {
  mark(storage.positions)
  mark(storage.velocities)
  mark(storage.lifetimes)
  if (hasRotation) mark(storage.particleRotations)
}
