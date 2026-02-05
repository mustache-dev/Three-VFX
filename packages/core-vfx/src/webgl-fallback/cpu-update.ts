import type * as THREE from 'three/webgpu'
import type { ParticleUniforms, ShaderFeatures } from '../shaders/types'
import type { CPUStorageArrays } from './buffer-utils'
import { hash } from './hash'
import { curlNoise } from './noise'
import { sampleCurve } from './curve-sampler'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type U = Record<string, { value: any }>

/**
 * CPU equivalent of shaders/update.ts.
 * Simulates particle physics each frame: gravity, velocity control,
 * turbulence, attractors, collision, rotation, lifetime decay.
 */
export const cpuUpdate = (
  cpu: CPUStorageArrays,
  uniforms: ParticleUniforms,
  curveTexture: THREE.DataTexture,
  maxParticles: number,
  features: Partial<ShaderFeatures> = {}
): void => {
  const u = uniforms as unknown as U
  const dt = u.deltaTime.value as number

  const gravityX = u.gravity.value.x as number
  const gravityY = u.gravity.value.y as number
  const gravityZ = u.gravity.value.z as number
  const sizeBasedGravity = u.sizeBasedGravity.value as number
  const velocityCurveEnabled = (u.velocityCurveEnabled.value as number) > 0.5
  const frictionEasingType = u.frictionEasingType.value as number
  const frictionIntensityStart = u.frictionIntensityStart.value as number
  const frictionIntensityEnd = u.frictionIntensityEnd.value as number

  // Turbulence uniforms (read once)
  const hasTurbulence = features.turbulence !== false
  const turbIntensity = hasTurbulence
    ? (u.turbulenceIntensity.value as number)
    : 0
  const turbFreq = hasTurbulence ? (u.turbulenceFrequency.value as number) : 0
  const turbTime = hasTurbulence ? (u.turbulenceTime.value as number) : 0

  // Attractor uniforms (read once)
  const hasAttractors = features.attractors !== false
  const attractorCount = hasAttractors ? (u.attractorCount.value as number) : 0

  // Collision uniforms (read once)
  const hasCollision = features.collision !== false
  const collisionEnabled = hasCollision
    ? (u.collisionEnabled.value as number) > 0.5
    : false
  const collisionPlaneY = hasCollision ? (u.collisionPlaneY.value as number) : 0
  const collisionBounce = hasCollision ? (u.collisionBounce.value as number) : 0
  const collisionFriction = hasCollision
    ? (u.collisionFriction.value as number)
    : 0
  const collisionDie = hasCollision
    ? (u.collisionDie.value as number) > 0.5
    : false

  // Rotation uniforms (read once)
  const hasRotation =
    features.rotation !== false && cpu.particleRotations !== null
  const rotSpeedMinX = hasRotation ? (u.rotationSpeedMinX.value as number) : 0
  const rotSpeedMaxX = hasRotation ? (u.rotationSpeedMaxX.value as number) : 0
  const rotSpeedMinY = hasRotation ? (u.rotationSpeedMinY.value as number) : 0
  const rotSpeedMaxY = hasRotation ? (u.rotationSpeedMaxY.value as number) : 0
  const rotSpeedMinZ = hasRotation ? (u.rotationSpeedMinZ.value as number) : 0
  const rotSpeedMaxZ = hasRotation ? (u.rotationSpeedMaxZ.value as number) : 0
  const rotSpeedCurveEnabled = hasRotation
    ? (u.rotationSpeedCurveEnabled.value as number) > 0.5
    : false

  // Pre-read attractor data
  const attractors: {
    px: number
    py: number
    pz: number
    strength: number
    radius: number
    type: number
    ax: number
    ay: number
    az: number
  }[] = []
  if (hasAttractors) {
    for (let a = 0; a < attractorCount && a < 4; a++) {
      const pos = u[`attractor${a}Pos`].value
      const axis = u[`attractor${a}Axis`].value
      attractors.push({
        px: pos.x,
        py: pos.y,
        pz: pos.z,
        strength: u[`attractor${a}Strength`].value,
        radius: u[`attractor${a}Radius`].value,
        type: u[`attractor${a}Type`].value,
        ax: axis.x,
        ay: axis.y,
        az: axis.z,
      })
    }
  }

  for (let i = 0; i < maxParticles; i++) {
    const lifetime = cpu.lifetimes[i]
    if (lifetime <= 0) continue

    const i3 = i * 3

    let px = cpu.positions[i3]
    let py = cpu.positions[i3 + 1]
    let pz = cpu.positions[i3 + 2]

    let vx = cpu.velocities[i3]
    let vy = cpu.velocities[i3 + 1]
    let vz = cpu.velocities[i3 + 2]

    const particleSize = cpu.particleSizes[i]

    // Gravity (with size-based multiplier)
    const gravMult = 1 + particleSize * sizeBasedGravity
    vx += gravityX * dt * gravMult
    vy += gravityY * dt * gravMult
    vz += gravityZ * dt * gravMult

    // Velocity control: curve or friction
    const progress = 1 - lifetime

    let speedScale: number

    if (velocityCurveEnabled) {
      const sample = sampleCurve(curveTexture, progress)
      speedScale = sample.b // B channel = velocity curve
    } else {
      // Friction with easing
      let easedProgress: number
      if (frictionEasingType < 0.5) {
        easedProgress = progress // linear
      } else if (frictionEasingType < 1.5) {
        easedProgress = progress * progress // easeIn
      } else if (frictionEasingType < 2.5) {
        easedProgress = 1 - (1 - progress) * (1 - progress) // easeOut
      } else {
        // easeInOut
        easedProgress =
          progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2
      }
      const currentIntensity =
        frictionIntensityStart +
        (frictionIntensityEnd - frictionIntensityStart) * easedProgress
      speedScale = 1 - currentIntensity * 0.9
    }

    // Turbulence (curl noise)
    if (hasTurbulence && turbIntensity > 0.001) {
      const nx = px * turbFreq + turbTime
      const ny = py * turbFreq + turbTime * 0.7
      const nz = pz * turbFreq + turbTime * 1.3

      const [cx, cy, cz] = curlNoise(nx, ny, nz, 0.01)

      vx += cx * turbIntensity * dt
      vy += cy * turbIntensity * dt
      vz += cz * turbIntensity * dt
    }

    // Attractors
    for (let a = 0; a < attractors.length; a++) {
      const att = attractors[a]
      if (Math.abs(att.strength) <= 0.001) continue

      const toX = att.px - px
      const toY = att.py - py
      const toZ = att.pz - pz
      const dist = Math.sqrt(toX * toX + toY * toY + toZ * toZ)
      const safeDist = Math.max(dist, 0.01)
      const dirX = toX / safeDist
      const dirY = toY / safeDist
      const dirZ = toZ / safeDist

      const falloff =
        att.radius > 0.001
          ? Math.max(0, 1 - dist / att.radius)
          : 1 / (safeDist * safeDist + 1)

      let fx: number
      let fy: number
      let fz: number

      if (att.type < 0.5) {
        // Point attractor
        fx = dirX * att.strength * falloff
        fy = dirY * att.strength * falloff
        fz = dirZ * att.strength * falloff
      } else {
        // Vortex attractor — cross(axis, toAttractor)
        const tangentX = att.ay * toZ - att.az * toY
        const tangentY = att.az * toX - att.ax * toZ
        const tangentZ = att.ax * toY - att.ay * toX
        const tangentLen = Math.max(
          Math.sqrt(
            tangentX * tangentX + tangentY * tangentY + tangentZ * tangentZ
          ),
          0.001
        )
        fx = (tangentX / tangentLen) * att.strength * falloff
        fy = (tangentY / tangentLen) * att.strength * falloff
        fz = (tangentZ / tangentLen) * att.strength * falloff
      }

      vx += fx * dt
      vy += fy * dt
      vz += fz * dt
    }

    // Position integration with speed scale
    px += vx * dt * speedScale
    py += vy * dt * speedScale
    pz += vz * dt * speedScale

    // Collision
    if (collisionEnabled && py < collisionPlaneY) {
      if (collisionDie) {
        cpu.lifetimes[i] = 0
        cpu.positions[i3 + 1] = -1000
        cpu.velocities[i3] = vx
        cpu.velocities[i3 + 1] = vy
        cpu.velocities[i3 + 2] = vz
        cpu.positions[i3] = px
        cpu.positions[i3 + 2] = pz
        continue
      } else {
        py = collisionPlaneY
        vy = Math.abs(vy) * collisionBounce
        vx *= collisionFriction
        vz *= collisionFriction
      }
    }

    // Rotation
    if (hasRotation && cpu.particleRotations) {
      const rotSpeedX =
        rotSpeedMinX + (rotSpeedMaxX - rotSpeedMinX) * hash(i + 8888)
      const rotSpeedY =
        rotSpeedMinY + (rotSpeedMaxY - rotSpeedMinY) * hash(i + 9999)
      const rotSpeedZ =
        rotSpeedMinZ + (rotSpeedMaxZ - rotSpeedMinZ) * hash(i + 10101)

      let rotSpeedMult = 1
      if (rotSpeedCurveEnabled) {
        const sample = sampleCurve(curveTexture, progress)
        rotSpeedMult = sample.a // A channel = rotation speed curve
      }

      cpu.particleRotations[i3] += rotSpeedX * dt * rotSpeedMult
      cpu.particleRotations[i3 + 1] += rotSpeedY * dt * rotSpeedMult
      cpu.particleRotations[i3 + 2] += rotSpeedZ * dt * rotSpeedMult
    }

    // Write back position and velocity
    cpu.positions[i3] = px
    cpu.positions[i3 + 1] = py
    cpu.positions[i3 + 2] = pz
    cpu.velocities[i3] = vx
    cpu.velocities[i3 + 1] = vy
    cpu.velocities[i3 + 2] = vz

    // Lifetime decay: fadeRate is per-second
    const fadeRate = cpu.fadeRates[i]
    const newLifetime = lifetime - fadeRate * dt

    if (newLifetime <= 0) {
      cpu.lifetimes[i] = 0
      cpu.positions[i3 + 1] = -1000
    } else {
      cpu.lifetimes[i] = newLifetime
    }
  }
}
