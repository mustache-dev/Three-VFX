import type { CPUStorageArrays } from './buffer-utils'

/**
 * CPU equivalent of shaders/init.ts.
 * Sets all particles to dead state (below visible range).
 */
export const cpuInit = (cpu: CPUStorageArrays, maxParticles: number): void => {
  for (let i = 0; i < maxParticles; i++) {
    const i3 = i * 3

    // position = (0, -1000, 0) — below visible range
    cpu.positions[i3] = 0
    cpu.positions[i3 + 1] = -1000
    cpu.positions[i3 + 2] = 0

    // velocity = (0, 0, 0)
    cpu.velocities[i3] = 0
    cpu.velocities[i3 + 1] = 0
    cpu.velocities[i3 + 2] = 0

    // lifetime = 0 (dead)
    cpu.lifetimes[i] = 0

    // fadeRate = 0
    cpu.fadeRates[i] = 0

    // particleSize = 0
    cpu.particleSizes[i] = 0

    // Optional arrays
    if (cpu.particleRotations) {
      cpu.particleRotations[i3] = 0
      cpu.particleRotations[i3 + 1] = 0
      cpu.particleRotations[i3 + 2] = 0
    }

    if (cpu.particleColorStarts) {
      cpu.particleColorStarts[i3] = 1
      cpu.particleColorStarts[i3 + 1] = 1
      cpu.particleColorStarts[i3 + 2] = 1
    }

    if (cpu.particleColorEnds) {
      cpu.particleColorEnds[i3] = 1
      cpu.particleColorEnds[i3 + 1] = 1
      cpu.particleColorEnds[i3 + 2] = 1
    }
  }
}
