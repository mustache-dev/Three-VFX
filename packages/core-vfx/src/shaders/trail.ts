import { Fn, If, clamp, float, vec3, instanceIndex } from 'three/tsl'
import type { ParticleStorageArrays, ParticleUniforms } from './types'

/**
 * Creates a compute shader that writes the current particle position
 * into the trail history ring buffer.
 * Called once per frame after the particle update compute.
 */
export const createTrailHistoryCompute = (
  storage: ParticleStorageArrays,
  uniforms: ParticleUniforms,
  maxParticles: number,
  segments: number
) => {
  return Fn(() => {
    const pos = storage.positions.element(instanceIndex)
    const lifetime = storage.lifetimes.element(instanceIndex)

    // Write position into ring buffer at current head pointer
    const writeIdx = instanceIndex.mul(segments).add(uniforms.trailHead)
    If(lifetime.greaterThan(0), () => {
      storage.trailHistory!.element(writeIdx).assign(pos)
    })
  })().compute(maxParticles)
}

/**
 * Creates a TSL function for MeshLine's gpuPositionNode (history mode).
 * Reads chronologically from the ring buffer using modular indexing.
 */
export const createTrailHistoryPositionNode = (
  storage: ParticleStorageArrays,
  uniforms: ParticleUniforms,
  segments: number
) => {
  return Fn(([progress]: [any]) => {
    const lifetime = storage.lifetimes.element(instanceIndex)
    // MeshLine queries previous/next with out-of-range progress values.
    // Clamp so first/last segment does not wrap around the ring buffer
    // (which creates a visible tail-to-head connection on some platforms).
    const p = clamp(progress, float(0), float(1))

    // Map progress (0→1) to segment index (0 = newest, segments-1 = oldest)
    const segIdx = p.mul(float(segments - 1)).floor()

    // `trailHead` uniform points to the NEXT write slot (it is incremented
    // after writing each frame), so newest sample is trailHead-1.
    // Read backwards from newest to oldest.
    const baseIdx = instanceIndex.mul(segments)
    const latestHead = uniforms.trailHead
      .sub(float(1))
      .add(float(segments))
      .mod(float(segments))
      .floor()
    const readOffset = latestHead
      .sub(segIdx)
      .add(float(segments))
      .mod(float(segments))
      .floor()
    const readIdx = baseIdx.add(readOffset)

    const trailPos = storage.trailHistory!.element(readIdx)

    // Dead particles: collapse offscreen
    return lifetime.greaterThan(0).select(trailPos, vec3(0, -1000, 0))
  })
}
