/**
 * JS implementation of TSL hash() function.
 * Returns a pseudo-random value in [0, 1) for a given input.
 * Matches the GPU behavior closely enough for particle visuals.
 */
export const hash = (n: number): number => {
  const x = Math.sin(n) * 43758.5453123
  return x - Math.floor(x)
}
