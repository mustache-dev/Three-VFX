import type * as THREE from 'three/webgpu'

/**
 * Sample a curve from a DataTexture at a given progress (0-1).
 * Reads directly from the Float32Array pixel data with linear interpolation.
 * Returns { r, g, b, a } matching the RGBA channels:
 *   R = fade size curve
 *   G = fade opacity curve
 *   B = velocity curve
 *   A = rotation speed curve
 */
export const sampleCurve = (
  curveTexture: THREE.DataTexture,
  progress: number
): { r: number; g: number; b: number; a: number } => {
  const data = curveTexture.image.data as Float32Array
  const width = curveTexture.image.width

  // Clamp progress to [0, 1]
  const t = Math.max(0, Math.min(1, progress))

  // Map to texel coordinates
  const texelPos = t * (width - 1)
  const idx0 = Math.floor(texelPos)
  const idx1 = Math.min(idx0 + 1, width - 1)
  const frac = texelPos - idx0

  // Each texel is 4 floats (RGBA)
  const base0 = idx0 * 4
  const base1 = idx1 * 4

  return {
    r: data[base0] * (1 - frac) + data[base1] * frac,
    g: data[base0 + 1] * (1 - frac) + data[base1 + 1] * frac,
    b: data[base0 + 2] * (1 - frac) + data[base1 + 2] * frac,
    a: data[base0 + 3] * (1 - frac) + data[base1 + 3] * frac,
  }
}
