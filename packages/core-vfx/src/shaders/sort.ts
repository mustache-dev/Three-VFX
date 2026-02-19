import { Fn, If, int, uint, float, instanceIndex } from 'three/tsl'
import type { StorageBufferNode, Node } from 'three/webgpu'
import type { ParticleStorageArrays } from './types'

/**
 * GPU bitonic sort for back-to-front particle rendering.
 *
 * Pipeline (each frame):
 * 1. createDistanceCompute — compute camera distance per particle
 * 2. createSortStepCompute — bitonic sort passes on index array (3 buffers)
 * 3. createReorderCompute — for each buffer pair: gather src→tmp, then copy tmp→src
 *    Each pass uses only 3 storage buffers to stay within WebGPU limits.
 *
 * After reorder, source buffers are in sorted order and the material reads them normally.
 */

export const createSortInitCompute = (
  sortIndices: StorageBufferNode,
  maxParticles: number
) => {
  return Fn(() => {
    sortIndices.element(instanceIndex).assign(float(instanceIndex))
  })().compute(maxParticles)
}

export const createDistanceCompute = (
  storage: ParticleStorageArrays,
  cameraPosUniform: Node,
  sortDistances: StorageBufferNode,
  maxParticles: number
) => {
  return Fn(() => {
    const position = storage.positions.element(instanceIndex)
    const lifetime = storage.lifetimes.element(instanceIndex)

    const diff = position.sub(cameraPosUniform)
    const distSq = diff.dot(diff)

    sortDistances.element(instanceIndex).assign(
      lifetime.greaterThan(0).select(distSq, float(1e10))
    )
  })().compute(maxParticles)
}

export const createSortStepCompute = (
  sortIndices: StorageBufferNode,
  sortDistances: StorageBufferNode,
  sortBlockSizeUniform: Node,
  sortSubBlockSizeUniform: Node,
  maxParticles: number
) => {
  return Fn(() => {
    const idx = uint(instanceIndex)
    const blockSize = uint(sortBlockSizeUniform)
    const subBlockSize = uint(sortSubBlockSizeUniform)

    const halfSub = subBlockSize.div(uint(2))
    const blockIndex = idx.div(halfSub)
    const localIndex = idx.mod(halfSub)

    const leftIdx = blockIndex.mul(subBlockSize).add(localIndex)
    const rightIdx = leftIdx.add(halfSub)

    If(rightIdx.lessThan(uint(maxParticles)), () => {
      const leftSortIdx = sortIndices.element(leftIdx)
      const rightSortIdx = sortIndices.element(rightIdx)

      const leftParticle = int(leftSortIdx)
      const rightParticle = int(rightSortIdx)

      const leftDist = sortDistances.element(leftParticle)
      const rightDist = sortDistances.element(rightParticle)

      const blockDir = leftIdx.div(blockSize).mod(uint(2))

      const shouldSwap = blockDir
        .equal(uint(0))
        .select(
          leftDist.lessThan(rightDist),
          leftDist.greaterThan(rightDist)
        )

      If(shouldSwap, () => {
        const temp = float(leftSortIdx)
        leftSortIdx.assign(rightSortIdx)
        rightSortIdx.assign(temp)
      })
    })
  })().compute(Math.ceil(maxParticles / 2))
}

/**
 * Creates a gather compute: reads from `src` at sortIndices order, writes to `dst` linearly.
 * Uses only 3 storage buffers: sortIndices(r), src(r), dst(w).
 */
export const createGatherCompute = (
  sortIndices: StorageBufferNode,
  src: StorageBufferNode,
  dst: StorageBufferNode,
  maxParticles: number
) => {
  return Fn(() => {
    const srcIdx = int(sortIndices.element(instanceIndex))
    dst.element(instanceIndex).assign(src.element(srcIdx))
  })().compute(maxParticles)
}

/**
 * Creates a copy compute: copies from `src` to `dst` linearly.
 * Uses only 2 storage buffers: src(r), dst(w).
 */
export const createCopyCompute = (
  src: StorageBufferNode,
  dst: StorageBufferNode,
  maxParticles: number
) => {
  return Fn(() => {
    dst.element(instanceIndex).assign(src.element(instanceIndex))
  })().compute(maxParticles)
}
