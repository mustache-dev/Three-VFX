import type { ParticleStorageArrays } from './shaders/types'
import { extractCPUArrays, markAllDirty } from './webgl-fallback/buffer-utils'

/**
 * Pre-allocated scratch buffers for CPU radix sort.
 * Reused across frames to avoid GC pressure.
 */
export type SortScratch = {
  indices: Uint32Array
  tempIndices: Uint32Array
  distances: Float32Array
  keys: Uint32Array
  tempKeys: Uint32Array
  tempReorder: Float32Array // maxParticles * max vector stride (supports vec3 padded to 4)
}

export function createSortScratch(maxParticles: number): SortScratch {
  return {
    indices: new Uint32Array(maxParticles),
    tempIndices: new Uint32Array(maxParticles),
    distances: new Float32Array(maxParticles),
    keys: new Uint32Array(maxParticles),
    tempKeys: new Uint32Array(maxParticles),
    tempReorder: new Float32Array(maxParticles * 4),
  }
}

// Shared conversion buffers (avoid allocation per particle)
const _f32 = new Float32Array(1)
const _u32 = new Uint32Array(_f32.buffer)

function floatToSortableUintFast(f: number): number {
  _f32[0] = f
  const bits = _u32[0]
  return bits & 0x80000000 ? ~bits >>> 0 : (bits | 0x80000000) >>> 0
}

/**
 * LSB Radix sort on float distances (converted to sortable uints).
 * 4 passes, 8 bits each. Sorts in descending order (back-to-front).
 */
function radixSort(
  indices: Uint32Array,
  tempIndices: Uint32Array,
  keys: Uint32Array,
  tempKeys: Uint32Array,
  n: number
): void {
  const RADIX_BITS = 8
  const RADIX_SIZE = 1 << RADIX_BITS // 256
  const MASK = RADIX_SIZE - 1
  const counts = new Uint32Array(RADIX_SIZE)

  for (let pass = 0; pass < 4; pass++) {
    const shift = pass * RADIX_BITS

    // Count occurrences
    counts.fill(0)
    for (let i = 0; i < n; i++) {
      counts[(keys[i] >>> shift) & MASK]++
    }

    // Prefix sum
    let sum = 0
    for (let i = 0; i < RADIX_SIZE; i++) {
      const c = counts[i]
      counts[i] = sum
      sum += c
    }

    // Scatter
    for (let i = 0; i < n; i++) {
      const bucket = (keys[i] >>> shift) & MASK
      const dest = counts[bucket]++
      tempIndices[dest] = indices[i]
      tempKeys[dest] = keys[i]
    }

    // Swap buffers (copy back)
    indices.set(tempIndices.subarray(0, n))
    keys.set(tempKeys.subarray(0, n))
  }
}

/**
 * Reorder a Float32Array in-place using a permutation of indices.
 * `stride` is the number of floats per element (1 for float, 3 for vec3).
 */
function reorderFloat32(
  arr: Float32Array,
  indices: Uint32Array,
  n: number,
  stride: number,
  temp: Float32Array
): void {
  // Copy reordered data into temp
  for (let i = 0; i < n; i++) {
    const src = indices[i] * stride
    const dst = i * stride
    for (let s = 0; s < stride; s++) {
      temp[dst + s] = arr[src + s]
    }
  }
  // Copy back
  arr.set(temp.subarray(0, n * stride))
}

/**
 * CPU radix sort particles back-to-front by distance to camera.
 * Reorders all storage buffer arrays in-place and marks them dirty for GPU upload.
 */
export function cpuRadixSortParticles(
  storage: ParticleStorageArrays,
  cameraPosition: [number, number, number],
  maxParticles: number,
  scratch: SortScratch
): void {
  const cpu = extractCPUArrays(storage, maxParticles)
  const { indices, tempIndices, distances, keys, tempKeys } = scratch
  const [cx, cy, cz] = cameraPosition
  const posStride = cpu.strides.positions
  const lifetimeStride = cpu.strides.lifetimes

  // Compute squared distances and initialize indices
  for (let i = 0; i < maxParticles; i++) {
    indices[i] = i

    if (cpu.lifetimes[i * lifetimeStride] > 0) {
      const base = i * posStride
      const px = cpu.positions[base] - cx
      const py = cpu.positions[base + 1] - cy
      const pz = cpu.positions[base + 2] - cz
      distances[i] = px * px + py * py + pz * pz
    } else {
      // Dead particles: distance 0 → sorted to front (rendered first, behind everything)
      distances[i] = 0
    }

    keys[i] = floatToSortableUintFast(distances[i])
  }

  // Radix sort (ascending by key = ascending by distance)
  radixSort(indices, tempIndices, keys, tempKeys, maxParticles)

  // We want back-to-front (descending distance), so reverse the order
  for (let i = 0, j = maxParticles - 1; i < j; i++, j--) {
    const tmp = indices[i]
    indices[i] = indices[j]
    indices[j] = tmp
  }

  // Reorder all storage arrays using the sorted indices
  const { tempReorder } = scratch

  reorderFloat32(
    cpu.positions,
    indices,
    maxParticles,
    cpu.strides.positions,
    tempReorder
  )
  reorderFloat32(
    cpu.velocities,
    indices,
    maxParticles,
    cpu.strides.velocities,
    tempReorder
  )
  reorderFloat32(
    cpu.lifetimes,
    indices,
    maxParticles,
    cpu.strides.lifetimes,
    tempReorder
  )
  reorderFloat32(
    cpu.fadeRates,
    indices,
    maxParticles,
    cpu.strides.fadeRates,
    tempReorder
  )
  reorderFloat32(
    cpu.particleSizes,
    indices,
    maxParticles,
    cpu.strides.particleSizes,
    tempReorder
  )
  if (cpu.particleSeeds) {
    reorderFloat32(
      cpu.particleSeeds,
      indices,
      maxParticles,
      cpu.strides.particleSeeds,
      tempReorder
    )
  }

  if (cpu.particleRotations) {
    reorderFloat32(
      cpu.particleRotations,
      indices,
      maxParticles,
      cpu.strides.particleRotations,
      tempReorder
    )
  }
  if (cpu.particleColorStarts) {
    reorderFloat32(
      cpu.particleColorStarts,
      indices,
      maxParticles,
      cpu.strides.particleColorStarts,
      tempReorder
    )
  }
  if (cpu.particleColorEnds) {
    reorderFloat32(
      cpu.particleColorEnds,
      indices,
      maxParticles,
      cpu.strides.particleColorEnds,
      tempReorder
    )
  }

  // Mark all storage buffers dirty so Three.js uploads the reordered data
  markAllDirty(storage)
}
