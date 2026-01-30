import * as THREE from 'three/webgpu'
import {
  VFXParticleSystem,
  isNonDefaultRotation,
  toRange,
  toRotation3D,
  hexToRgb,
  easingToType,
  axisToNumber,
  EmitterShape,
} from 'core-vfx'
import type { VFXParticleSystemOptions, BaseParticleProps } from 'core-vfx'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UniformAccessor = Record<string, { value: any }>

export type VFXParticlesOptions = BaseParticleProps & {
  debug?: boolean
}

// Structural keys that require full system recreation
const STRUCTURAL_KEYS = [
  'maxParticles',
  'lighting',
  'appearance',
  'shadow',
  'orientToDirection',
]

export class VFXParticles {
  readonly group: THREE.Group
  private _renderer: THREE.WebGPURenderer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _config: Record<string, any>
  private _system: VFXParticleSystem | null = null
  private _emitting = true
  private _emitAccumulator = 0
  private _debug: boolean
  private _initialized = false

  constructor(renderer: THREE.WebGPURenderer, options?: VFXParticlesOptions) {
    this._renderer = renderer
    this._debug = options?.debug ?? false
    this._config = { ...options }
    delete this._config.debug
    this.group = new THREE.Group()
  }

  get object3D(): THREE.Group {
    return this.group
  }

  get system(): VFXParticleSystem | null {
    return this._system
  }

  get uniforms(): UniformAccessor | null {
    return this._system
      ? (this._system.uniforms as unknown as UniformAccessor)
      : null
  }

  get isEmitting(): boolean {
    return this._emitting
  }

  async init(): Promise<void> {
    if (this._initialized) return

    if (this._debug) {
      const { DEFAULT_VALUES } = await import('debug-vfx')
      this._config = { ...DEFAULT_VALUES, ...this._config }
    }

    await this._recreateSystem()
    this._initialized = true

    if (this._debug) {
      const { renderDebugPanel } = await import('debug-vfx')
      renderDebugPanel({ ...this._config }, (newValues: Record<string, unknown>) =>
        this.setProps(newValues)
      )
    }
  }

  update(delta: number): void {
    if (!this._system || !this._system.initialized) return

    // Auto-emission
    if (this._emitting) {
      const delay = this._system.normalizedProps.delay
      const emitCount = this._system.normalizedProps.emitCount
      const [px, py, pz] = this._system.position

      if (!delay) {
        this._system.spawn(px, py, pz, emitCount)
      } else {
        this._emitAccumulator += delta
        if (this._emitAccumulator >= delay) {
          this._emitAccumulator -= delay
          this._system.spawn(px, py, pz, emitCount)
        }
      }
    }

    this._system.update(delta)
  }

  dispose(): void {
    if (this._system) {
      this.group.remove(this._system.renderObject)
      this._system.dispose()
      this._system = null
    }
    if (this._debug) {
      import('debug-vfx').then(({ destroyDebugPanel }) => {
        destroyDebugPanel()
      })
    }
    this._initialized = false
  }

  spawn(
    x = 0,
    y = 0,
    z = 0,
    count?: number,
    overrides?: Record<string, unknown> | null
  ): void {
    if (!this._system) return
    this._system.spawn(
      x,
      y,
      z,
      count ?? this._system.normalizedProps.emitCount,
      overrides ?? null
    )
  }

  start(): void {
    this._emitting = true
    this._emitAccumulator = 0
    if (this._system) this._system.start()
  }

  stop(): void {
    this._emitting = false
    if (this._system) this._system.stop()
  }

  clear(): void {
    if (this._system) this._system.clear()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setProps(newValues: Record<string, any>): void {
    this._config = { ...this._config, ...newValues }

    // Check if any structural key changed
    const needsRecreate = STRUCTURAL_KEYS.some((key) => key in newValues)

    // Feature flags that also require recreation
    if ('turbulence' in newValues) {
      const newHasTurbulence =
        newValues.turbulence !== null &&
        (newValues.turbulence?.intensity ?? 0) > 0
      const oldHasTurbulence = this._system?.features.turbulence ?? false
      if (newHasTurbulence !== oldHasTurbulence) {
        this._recreateSystem()
        return
      }
    }
    if ('attractors' in newValues) {
      const newHasAttractors =
        newValues.attractors !== null && newValues.attractors?.length > 0
      const oldHasAttractors = this._system?.features.attractors ?? false
      if (newHasAttractors !== oldHasAttractors) {
        this._recreateSystem()
        return
      }
    }
    if ('collision' in newValues) {
      const newHasCollision =
        newValues.collision !== null && newValues.collision !== undefined
      const oldHasCollision = this._system?.features.collision ?? false
      if (newHasCollision !== oldHasCollision) {
        this._recreateSystem()
        return
      }
    }
    if ('rotation' in newValues || 'rotationSpeed' in newValues) {
      const rot = this._config.rotation ?? [0, 0]
      const rotSpeed = this._config.rotationSpeed ?? [0, 0]
      const newNeedsRotation =
        isNonDefaultRotation(rot) || isNonDefaultRotation(rotSpeed)
      const oldNeedsRotation = this._system?.features.needsRotation ?? false
      if (newNeedsRotation !== oldNeedsRotation) {
        this._recreateSystem()
        return
      }
    }
    if ('colorStart' in newValues || 'colorEnd' in newValues) {
      const startLen = this._config.colorStart?.length ?? 1
      const hasColorEnd =
        this._config.colorEnd !== null && this._config.colorEnd !== undefined
      const newNeedsPerParticleColor = startLen > 1 || hasColorEnd
      const oldNeedsPerParticleColor =
        this._system?.features.needsPerParticleColor ?? false
      if (newNeedsPerParticleColor !== oldNeedsPerParticleColor) {
        this._recreateSystem()
        return
      }
    }

    // Handle geometry type changes from debug panel
    if ('geometryType' in newValues || 'geometryArgs' in newValues) {
      import('debug-vfx').then(({ createGeometry, GeometryType }) => {
        const geoType = this._config.geometryType
        if (geoType === GeometryType.NONE || !geoType) {
          this._config.geometry = null
        } else {
          this._config.geometry = createGeometry(geoType, this._config.geometryArgs)
        }
        this._recreateSystem()
      })
      return
    }

    if (needsRecreate) {
      this._recreateSystem()
      return
    }

    // Uniform-level updates (no recreation needed)
    this._applyUniformUpdates(newValues)
  }

  private async _recreateSystem(): Promise<void> {
    if (this._system) {
      this.group.remove(this._system.renderObject)
      this._system.dispose()
    }
    const s = new VFXParticleSystem(
      this._renderer,
      this._config as VFXParticleSystemOptions
    )
    await s.init()
    this._system = s
    this.group.add(s.renderObject)
    this._emitAccumulator = 0
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _applyUniformUpdates(newValues: Record<string, any>): void {
    if (!this._system) return
    const u = this._system.uniforms as unknown as UniformAccessor

    if ('size' in newValues) {
      const sizeR = toRange(newValues.size, [0.1, 0.3])
      u.sizeMin.value = sizeR[0]
      u.sizeMax.value = sizeR[1]
    }
    if ('fadeSize' in newValues) {
      const fadeSizeR = toRange(newValues.fadeSize, [1, 0])
      u.fadeSizeStart.value = fadeSizeR[0]
      u.fadeSizeEnd.value = fadeSizeR[1]
    }
    if ('fadeOpacity' in newValues) {
      const fadeOpacityR = toRange(newValues.fadeOpacity, [1, 0])
      u.fadeOpacityStart.value = fadeOpacityR[0]
      u.fadeOpacityEnd.value = fadeOpacityR[1]
    }
    if ('fadeSizeCurve' in newValues) {
      u.fadeSizeCurveEnabled.value = newValues.fadeSizeCurve ? 1 : 0
    }
    if ('fadeOpacityCurve' in newValues) {
      u.fadeOpacityCurveEnabled.value = newValues.fadeOpacityCurve ? 1 : 0
    }
    if ('velocityCurve' in newValues) {
      u.velocityCurveEnabled.value = newValues.velocityCurve ? 1 : 0
    }
    if ('rotationSpeedCurve' in newValues) {
      u.rotationSpeedCurveEnabled.value = newValues.rotationSpeedCurve ? 1 : 0
    }
    if ('orientAxis' in newValues) {
      u.orientAxisType.value = axisToNumber(newValues.orientAxis)
    }
    if ('stretchBySpeed' in newValues) {
      u.stretchEnabled.value = newValues.stretchBySpeed ? 1 : 0
      u.stretchFactor.value = newValues.stretchBySpeed?.factor ?? 1
      u.stretchMax.value = newValues.stretchBySpeed?.maxStretch ?? 5
    }
    if (newValues.gravity && Array.isArray(newValues.gravity)) {
      u.gravity.value.x = newValues.gravity[0]
      u.gravity.value.y = newValues.gravity[1]
      u.gravity.value.z = newValues.gravity[2]
    }
    if ('speed' in newValues) {
      const speedR = toRange(newValues.speed, [0.1, 0.1])
      u.speedMin.value = speedR[0]
      u.speedMax.value = speedR[1]
    }
    if ('lifetime' in newValues) {
      const lifetimeR = toRange(newValues.lifetime, [1, 2])
      u.lifetimeMin.value = 1 / lifetimeR[1]
      u.lifetimeMax.value = 1 / lifetimeR[0]
    }
    if ('friction' in newValues && newValues.friction) {
      const frictionR = toRange(newValues.friction.intensity, [0, 0])
      u.frictionIntensityStart.value = frictionR[0]
      u.frictionIntensityEnd.value = frictionR[1]
      u.frictionEasingType.value = easingToType(newValues.friction.easing)
    }
    if ('direction' in newValues) {
      const dir3D = toRotation3D(newValues.direction)
      u.dirMinX.value = dir3D[0][0]
      u.dirMaxX.value = dir3D[0][1]
      u.dirMinY.value = dir3D[1][0]
      u.dirMaxY.value = dir3D[1][1]
      u.dirMinZ.value = dir3D[2][0]
      u.dirMaxZ.value = dir3D[2][1]
    }
    if ('startPosition' in newValues) {
      const startPos3D = toRotation3D(newValues.startPosition)
      u.startPosMinX.value = startPos3D[0][0]
      u.startPosMaxX.value = startPos3D[0][1]
      u.startPosMinY.value = startPos3D[1][0]
      u.startPosMaxY.value = startPos3D[1][1]
      u.startPosMinZ.value = startPos3D[2][0]
      u.startPosMaxZ.value = startPos3D[2][1]
    }
    if ('rotation' in newValues) {
      const rot3D = toRotation3D(newValues.rotation)
      u.rotationMinX.value = rot3D[0][0]
      u.rotationMaxX.value = rot3D[0][1]
      u.rotationMinY.value = rot3D[1][0]
      u.rotationMaxY.value = rot3D[1][1]
      u.rotationMinZ.value = rot3D[2][0]
      u.rotationMaxZ.value = rot3D[2][1]
    }
    if ('rotationSpeed' in newValues) {
      const rotSpeed3D = toRotation3D(newValues.rotationSpeed)
      u.rotationSpeedMinX.value = rotSpeed3D[0][0]
      u.rotationSpeedMaxX.value = rotSpeed3D[0][1]
      u.rotationSpeedMinY.value = rotSpeed3D[1][0]
      u.rotationSpeedMaxY.value = rotSpeed3D[1][1]
      u.rotationSpeedMinZ.value = rotSpeed3D[2][0]
      u.rotationSpeedMaxZ.value = rotSpeed3D[2][1]
    }
    if ('intensity' in newValues) {
      u.intensity.value = newValues.intensity || 1
    }
    if ('colorStart' in newValues && newValues.colorStart) {
      const sColors = newValues.colorStart.slice(0, 8).map(hexToRgb)
      while (sColors.length < 8)
        sColors.push(sColors[sColors.length - 1] || [1, 1, 1])
      u.colorStartCount.value = newValues.colorStart.length
      sColors.forEach((c: [number, number, number], i: number) => {
        if (u[`colorStart${i}`]) u[`colorStart${i}`].value.setRGB(...c)
      })
      if (!this._config.colorEnd) {
        u.colorEndCount.value = newValues.colorStart.length
        sColors.forEach((c: [number, number, number], i: number) => {
          if (u[`colorEnd${i}`]) u[`colorEnd${i}`].value.setRGB(...c)
        })
      }
    }
    if ('colorEnd' in newValues) {
      const effectiveEndColors =
        newValues.colorEnd || this._config.colorStart || ['#ffffff']
      const eColors = effectiveEndColors.slice(0, 8).map(hexToRgb)
      while (eColors.length < 8)
        eColors.push(eColors[eColors.length - 1] || [1, 1, 1])
      u.colorEndCount.value = effectiveEndColors.length
      eColors.forEach((c: [number, number, number], i: number) => {
        if (u[`colorEnd${i}`]) u[`colorEnd${i}`].value.setRGB(...c)
      })
    }
    if ('emitterShape' in newValues) {
      u.emitterShapeType.value = newValues.emitterShape ?? EmitterShape.BOX
    }
    if ('emitterRadius' in newValues) {
      const emitterRadiusR = toRange(newValues.emitterRadius, [0, 1])
      u.emitterRadiusInner.value = emitterRadiusR[0]
      u.emitterRadiusOuter.value = emitterRadiusR[1]
    }
    if ('emitterAngle' in newValues) {
      u.emitterAngle.value = newValues.emitterAngle ?? Math.PI / 4
    }
    if ('emitterHeight' in newValues) {
      const emitterHeightR = toRange(newValues.emitterHeight, [0, 1])
      u.emitterHeightMin.value = emitterHeightR[0]
      u.emitterHeightMax.value = emitterHeightR[1]
    }
    if ('emitterSurfaceOnly' in newValues) {
      u.emitterSurfaceOnly.value = newValues.emitterSurfaceOnly ? 1 : 0
    }
    if (
      'emitterDirection' in newValues &&
      newValues.emitterDirection &&
      Array.isArray(newValues.emitterDirection)
    ) {
      const dir = new THREE.Vector3(
        ...newValues.emitterDirection
      ).normalize()
      u.emitterDir.value.x = dir.x
      u.emitterDir.value.y = dir.y
      u.emitterDir.value.z = dir.z
    }
    if ('turbulence' in newValues) {
      u.turbulenceIntensity.value = newValues.turbulence?.intensity ?? 0
      u.turbulenceFrequency.value = newValues.turbulence?.frequency ?? 1
      u.turbulenceSpeed.value = newValues.turbulence?.speed ?? 1
    }
    if ('attractToCenter' in newValues) {
      u.attractToCenter.value = newValues.attractToCenter ? 1 : 0
    }
    if ('startPositionAsDirection' in newValues) {
      u.startPositionAsDirection.value = newValues.startPositionAsDirection
        ? 1
        : 0
    }
    if ('softParticles' in newValues) {
      u.softParticlesEnabled.value = newValues.softParticles ? 1 : 0
    }
    if ('softDistance' in newValues) {
      u.softDistance.value = newValues.softDistance ?? 0.5
    }
    if ('collision' in newValues) {
      u.collisionEnabled.value = newValues.collision ? 1 : 0
      u.collisionPlaneY.value = newValues.collision?.plane?.y ?? 0
      u.collisionBounce.value = newValues.collision?.bounce ?? 0.3
      u.collisionFriction.value = newValues.collision?.friction ?? 0.8
      u.collisionDie.value = newValues.collision?.die ? 1 : 0
      u.sizeBasedGravity.value = newValues.collision?.sizeBasedGravity ?? 0
    }
    if (newValues.position) {
      this._system!.setPosition(newValues.position)
    }
    if ('delay' in newValues) {
      this._system!.setDelay(newValues.delay ?? 0)
    }
    if ('emitCount' in newValues) {
      this._system!.setEmitCount(newValues.emitCount ?? 1)
    }
    if (newValues.autoStart !== undefined) {
      this._emitting = newValues.autoStart
      if (this._emitting) this._system!.start()
      else this._system!.stop()
    }
    if (this._system!.material && newValues.blending !== undefined) {
      this._system!.material.blending = newValues.blending
      this._system!.material.needsUpdate = true
    }
  }
}
