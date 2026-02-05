<script lang="ts">
import { T, useThrelte, useTask } from '@threlte/core'
import { onMount, onDestroy, untrack } from 'svelte'
import * as THREE from 'three/webgpu'
import { coreStore } from 'core-vfx'
import {
  Appearance,
  Blending,
  EmitterShape,
  Lighting,
  VFXParticleSystem,
  isNonDefaultRotation,
  normalizeProps,
  updateUniforms,
  updateUniformsPartial,
  resolveFeatures,
  type VFXParticleSystemOptions,
  type TurbulenceConfig,
  type AttractorConfig,
  type CollisionConfig,
  type FrictionConfig,
  type FlipbookConfig,
  type StretchConfig,
  type Rotation3DInput,
} from 'core-vfx'

// Props
let {
  name = undefined,
  debug = false,
  maxParticles = 10000,
  size = [0.1, 0.3],
  colorStart = ['#ffffff'],
  colorEnd = null,
  fadeSize = [1, 0],
  fadeSizeCurve = null,
  fadeOpacity = [1, 0],
  fadeOpacityCurve = null,
  velocityCurve = null,
  gravity = [0, 0, 0],
  lifetime = [1, 2],
  direction = [[-1, 1], [0, 1], [-1, 1]],
  startPosition = [[0, 0], [0, 0], [0, 0]],
  speed = [0.1, 0.1],
  friction = { intensity: 0, easing: 'linear' },
  appearance = Appearance.GRADIENT,
  alphaMap = null,
  flipbook = null,
  rotation = [0, 0],
  rotationSpeed = [0, 0],
  rotationSpeedCurve = null,
  geometry = null,
  orientToDirection = false,
  orientAxis = 'z',
  stretchBySpeed = null,
  lighting = Lighting.STANDARD,
  shadow = false,
  blending = Blending.NORMAL,
  intensity = 1,
  position = [0, 0, 0],
  autoStart = true,
  delay = 0,
  backdropNode = null,
  opacityNode = null,
  colorNode = null,
  alphaTestNode = null,
  castShadowNode = null,
  emitCount = 1,
  emitterShape = EmitterShape.BOX,
  emitterRadius = [0, 1],
  emitterAngle = Math.PI / 4,
  emitterHeight = [0, 1],
  emitterSurfaceOnly = false,
  emitterDirection = [0, 1, 0],
  turbulence = null,
  attractors = null,
  attractToCenter = false,
  startPositionAsDirection = false,
  softParticles = false,
  softDistance = 0.5,
  collision = null,
  curveTexturePath = null,
  depthTest = true,
  renderOrder = 0,
}: {
  name?: string
  debug?: boolean
  maxParticles?: number
  size?: [number, number] | number
  colorStart?: string[]
  colorEnd?: string[] | null
  fadeSize?: [number, number]
  fadeSizeCurve?: unknown[] | null
  fadeOpacity?: [number, number]
  fadeOpacityCurve?: unknown[] | null
  velocityCurve?: unknown[] | null
  gravity?: [number, number, number]
  lifetime?: [number, number]
  direction?: VFXParticleSystemOptions['direction']
  startPosition?: VFXParticleSystemOptions['startPosition']
  speed?: [number, number] | number
  friction?: FrictionConfig
  appearance?: string | number
  alphaMap?: THREE.Texture | null
  flipbook?: FlipbookConfig | null
  rotation?: Rotation3DInput
  rotationSpeed?: Rotation3DInput
  rotationSpeedCurve?: unknown[] | null
  geometry?: THREE.BufferGeometry | null
  orientToDirection?: boolean
  orientAxis?: string
  stretchBySpeed?: StretchConfig | null
  lighting?: string | number
  shadow?: boolean
  blending?: string | number
  intensity?: number
  position?: [number, number, number]
  autoStart?: boolean
  delay?: number
  backdropNode?: unknown
  opacityNode?: unknown
  colorNode?: unknown
  alphaTestNode?: unknown
  castShadowNode?: unknown
  emitCount?: number
  emitterShape?: string | number
  emitterRadius?: [number, number]
  emitterAngle?: number
  emitterHeight?: [number, number]
  emitterSurfaceOnly?: boolean
  emitterDirection?: [number, number, number]
  turbulence?: TurbulenceConfig | null
  attractors?: AttractorConfig[] | null
  attractToCenter?: boolean
  startPositionAsDirection?: boolean
  softParticles?: boolean
  softDistance?: number
  collision?: CollisionConfig | null
  curveTexturePath?: string | null
  depthTest?: boolean
  renderOrder?: number
} = $props()

const { renderer } = useThrelte()

let mounted = false

// Internal state — NOT tracked by effects (plain variables)
let _system: VFXParticleSystem | null = null
let _renderObject: THREE.Object3D | null = null
let _emitting = autoStart

// Reactive state for the template only
let renderObjectForTemplate: THREE.Object3D | null = $state(null)

let debugValues: Record<string, unknown> | null = null

// Track structural props for recreation
let activeMaxParticles = $state(maxParticles)
let activeLighting: string | number = $state(lighting)
let activeAppearance: string | number = $state(appearance)
let activeOrientToDirection = $state(orientToDirection)
let activeGeometry: THREE.BufferGeometry | null = $state(geometry)
let activeShadow = $state(shadow)
let activeFadeSizeCurve: unknown[] | null = $state(fadeSizeCurve)
let activeFadeOpacityCurve: unknown[] | null = $state(fadeOpacityCurve)
let activeVelocityCurve: unknown[] | null = $state(velocityCurve)
let activeRotationSpeedCurve: unknown[] | null = $state(rotationSpeedCurve)
let activeTurbulence = $state(
  turbulence !== null && (turbulence?.intensity ?? 0) > 0
)
let activeAttractors = $state(
  attractors !== null && (attractors?.length ?? 0) > 0
)
let activeCollision = $state(collision !== null)
let activeNeedsPerParticleColor = $state(
  colorStart.length > 1 || colorEnd !== null
)
let activeNeedsRotation = $state(
  isNonDefaultRotation(rotation) || isNonDefaultRotation(rotationSpeed)
)

// Debug panel refs
let prevGeometryType: unknown = null
let prevGeometryArgs: unknown = null

function buildOptions(): VFXParticleSystemOptions {
  const dbg = debug ? debugValues : null
  return {
    maxParticles: untrack(() => activeMaxParticles) as number,
    size: (dbg?.size ?? size) as VFXParticleSystemOptions['size'],
    colorStart: (dbg?.colorStart ?? colorStart) as string[],
    colorEnd:
      dbg?.colorEnd !== undefined
        ? (dbg.colorEnd as string[] | null)
        : colorEnd,
    fadeSize: (dbg?.fadeSize ?? fadeSize) as [number, number],
    fadeSizeCurve: untrack(() => activeFadeSizeCurve) as VFXParticleSystemOptions['fadeSizeCurve'],
    fadeOpacity: (dbg?.fadeOpacity ?? fadeOpacity) as [number, number],
    fadeOpacityCurve: untrack(() => activeFadeOpacityCurve) as VFXParticleSystemOptions['fadeOpacityCurve'],
    velocityCurve: untrack(() => activeVelocityCurve) as VFXParticleSystemOptions['velocityCurve'],
    gravity: (dbg?.gravity ?? gravity) as [number, number, number],
    lifetime: (dbg?.lifetime ?? lifetime) as [number, number],
    direction: (dbg?.direction ?? direction) as VFXParticleSystemOptions['direction'],
    startPosition: (dbg?.startPosition ?? startPosition) as VFXParticleSystemOptions['startPosition'],
    speed: (dbg?.speed ?? speed) as VFXParticleSystemOptions['speed'],
    friction: (dbg?.friction ?? friction) as FrictionConfig,
    appearance: untrack(() => activeAppearance) as VFXParticleSystemOptions['appearance'],
    alphaMap,
    flipbook,
    rotation: (dbg?.rotation ?? rotation) as Rotation3DInput,
    rotationSpeed: (dbg?.rotationSpeed ?? rotationSpeed) as Rotation3DInput,
    rotationSpeedCurve: untrack(() => activeRotationSpeedCurve) as VFXParticleSystemOptions['rotationSpeedCurve'],
    geometry: untrack(() => activeGeometry),
    orientToDirection: untrack(() => activeOrientToDirection) as boolean,
    orientAxis: (dbg?.orientAxis ?? orientAxis) as string,
    stretchBySpeed: (dbg?.stretchBySpeed ?? stretchBySpeed) as StretchConfig | null,
    lighting: untrack(() => activeLighting) as VFXParticleSystemOptions['lighting'],
    shadow: untrack(() => activeShadow) as boolean,
    blending: (dbg?.blending ?? blending) as VFXParticleSystemOptions['blending'],
    intensity: (dbg?.intensity ?? intensity) as number,
    position: (dbg?.position ?? position) as [number, number, number],
    autoStart: (dbg?.autoStart ?? autoStart) as boolean,
    delay: (dbg?.delay ?? delay) as number,
    emitCount: (dbg?.emitCount ?? emitCount) as number,
    emitterShape: (dbg?.emitterShape ?? emitterShape) as VFXParticleSystemOptions['emitterShape'],
    emitterRadius: (dbg?.emitterRadius ?? emitterRadius) as [number, number],
    emitterAngle: (dbg?.emitterAngle ?? emitterAngle) as number,
    emitterHeight: (dbg?.emitterHeight ?? emitterHeight) as [number, number],
    emitterSurfaceOnly: (dbg?.emitterSurfaceOnly ?? emitterSurfaceOnly) as boolean,
    emitterDirection: (dbg?.emitterDirection ?? emitterDirection) as [number, number, number],
    turbulence: (dbg?.turbulence ?? turbulence) as TurbulenceConfig | null,
    attractors: (dbg?.attractors ?? attractors) as AttractorConfig[] | null,
    attractToCenter: (dbg?.attractToCenter ?? attractToCenter) as boolean,
    startPositionAsDirection: (dbg?.startPositionAsDirection ?? startPositionAsDirection) as boolean,
    softParticles: (dbg?.softParticles ?? softParticles) as boolean,
    softDistance: (dbg?.softDistance ?? softDistance) as number,
    collision: (dbg?.collision ?? collision) as CollisionConfig | null,
    backdropNode: backdropNode as VFXParticleSystemOptions['backdropNode'],
    opacityNode: opacityNode as VFXParticleSystemOptions['opacityNode'],
    colorNode: colorNode as VFXParticleSystemOptions['colorNode'],
    alphaTestNode: alphaTestNode as VFXParticleSystemOptions['alphaTestNode'],
    castShadowNode: castShadowNode as VFXParticleSystemOptions['castShadowNode'],
    depthTest: (dbg?.depthTest ?? depthTest) as boolean,
    renderOrder: (dbg?.renderOrder ?? renderOrder) as number,
    curveTexturePath,
  }
}

function createSystem() {
  const r = renderer as unknown as THREE.WebGPURenderer
  if (!r) return null
  return new VFXParticleSystem(r, buildOptions())
}

function destroySystem() {
  if (!_system) return
  if (name) {
    coreStore.getState().unregisterParticles(name)
  }
  _system.dispose()
  _system = null
  _renderObject = null
  renderObjectForTemplate = null
}

function initSystem() {
  const oldSystem = _system
  if (oldSystem) {
    oldSystem.initialized = false
    if (name) {
      coreStore.getState().unregisterParticles(name)
    }
  }
  _system = null
  _renderObject = null

  if (!renderer) {
    console.warn('threlte-vfx: No renderer instance available')
    return
  }

  const newSystem = createSystem()
  if (!newSystem) return

  _system = newSystem
  _renderObject = newSystem.renderObject

  newSystem.init()

  if (name) {
    coreStore.getState().registerParticles(name, {
      spawn: (x = 0, y = 0, z = 0, count = 20, overrides = null) => {
        const [px, py, pz] = newSystem.position
        newSystem.spawn(px + x, py + y, pz + z, count, overrides)
      },
      start: () => {
        newSystem.start()
        _emitting = true
      },
      stop: () => {
        newSystem.stop()
        _emitting = false
      },
      get isEmitting() {
        return _emitting
      },
      clear: () => newSystem.clear(),
      uniforms: newSystem.uniforms,
    })
  }

  if (debug) {
    initDebugPanel()
  }

  // Update template-facing reactive state last
  renderObjectForTemplate = newSystem.renderObject
}

// Debug panel support
function handleDebugUpdate(newValues: Record<string, unknown>) {
  debugValues = { ...debugValues, ...newValues }
  if (!_system) return

  if ('colorStart' in newValues && newValues.colorStart) {
    const currentColorEnd = debugValues?.colorEnd
    if (!currentColorEnd) {
      newValues = { ...newValues, colorEnd: null }
    }
  }
  if ('colorEnd' in newValues && !newValues.colorEnd) {
    newValues = {
      ...newValues,
      colorEnd: null,
      colorStart:
        newValues.colorStart ??
        debugValues?.colorStart ?? ['#ffffff'],
    }
  }

  updateUniformsPartial(_system.uniforms, newValues)

  if ('fadeSizeCurve' in newValues) {
    activeFadeSizeCurve = newValues.fadeSizeCurve as unknown[] | null
  }
  if ('fadeOpacityCurve' in newValues) {
    activeFadeOpacityCurve = newValues.fadeOpacityCurve as unknown[] | null
  }
  if ('velocityCurve' in newValues) {
    activeVelocityCurve = newValues.velocityCurve as unknown[] | null
  }
  if ('rotationSpeedCurve' in newValues) {
    activeRotationSpeedCurve = newValues.rotationSpeedCurve as unknown[] | null
  }

  if ('turbulence' in newValues) {
    _system.setTurbulenceSpeed(
      (newValues.turbulence as TurbulenceConfig | null)?.speed ?? 1
    )
  }

  const newFeatures = resolveFeatures(
    debugValues as Record<string, unknown>
  )
  if (newFeatures.needsRotation !== activeNeedsRotation) {
    activeNeedsRotation = newFeatures.needsRotation
  }
  if (newFeatures.needsPerParticleColor !== activeNeedsPerParticleColor) {
    activeNeedsPerParticleColor = newFeatures.needsPerParticleColor
  }
  if (newFeatures.turbulence !== activeTurbulence) {
    activeTurbulence = newFeatures.turbulence
  }
  if (newFeatures.attractors !== activeAttractors) {
    activeAttractors = newFeatures.attractors
  }
  if (newFeatures.collision !== activeCollision) {
    activeCollision = newFeatures.collision
  }

  if (newValues.position) {
    _system.setPosition(newValues.position as [number, number, number])
  }

  if ('delay' in newValues) _system.setDelay((newValues.delay as number) ?? 0)
  if ('emitCount' in newValues)
    _system.setEmitCount((newValues.emitCount as number) ?? 1)

  if (newValues.autoStart !== undefined) {
    _emitting = newValues.autoStart as boolean
  }

  if (_system.material && newValues.blending !== undefined) {
    ;(_system.material as any).blending = newValues.blending
    ;(_system.material as any).needsUpdate = true
  }

  if (
    newValues.maxParticles !== undefined &&
    newValues.maxParticles !== activeMaxParticles
  ) {
    activeMaxParticles = newValues.maxParticles as number
    _system.initialized = false
    _system.nextIndex = 0
  }
  if (
    newValues.lighting !== undefined &&
    newValues.lighting !== activeLighting
  ) {
    activeLighting = newValues.lighting as string | number
  }
  if (
    newValues.appearance !== undefined &&
    newValues.appearance !== activeAppearance
  ) {
    activeAppearance = newValues.appearance as string | number
  }
  if (
    newValues.orientToDirection !== undefined &&
    newValues.orientToDirection !== activeOrientToDirection
  ) {
    activeOrientToDirection = newValues.orientToDirection as boolean
  }
  if (
    newValues.shadow !== undefined &&
    newValues.shadow !== activeShadow
  ) {
    activeShadow = newValues.shadow as boolean
  }

  if ('geometryType' in newValues || 'geometryArgs' in newValues) {
    const geoType =
      newValues.geometryType ?? prevGeometryType
    const geoArgs =
      newValues.geometryArgs ?? prevGeometryArgs
    const geoTypeChanged =
      'geometryType' in newValues &&
      geoType !== prevGeometryType
    const geoArgsChanged =
      'geometryArgs' in newValues &&
      JSON.stringify(geoArgs) !==
        JSON.stringify(prevGeometryArgs)

    if (geoTypeChanged || geoArgsChanged) {
      prevGeometryType = geoType
      prevGeometryArgs = geoArgs

      import('debug-vfx').then((mod) => {
        const { createGeometry, GeometryType } = mod
        if (geoType === GeometryType.NONE || !geoType) {
          if (activeGeometry !== null && !geometry) {
            activeGeometry.dispose()
          }
          activeGeometry = null
        } else {
          const newGeometry = createGeometry(geoType as string, geoArgs as Record<string, number> | undefined)
          if (newGeometry) {
            if (
              activeGeometry !== null &&
              activeGeometry !== geometry
            ) {
              activeGeometry.dispose()
            }
            activeGeometry = newGeometry
          }
        }
      })
    }
  }
}

function initDebugPanel() {
  import('debug-vfx').then((mod) => {
    const { renderDebugPanel, detectGeometryTypeAndArgs } = mod

    if (!debugValues) {
      const initialValues: Record<string, unknown> = {
        name,
        maxParticles,
        size,
        colorStart,
        colorEnd,
        fadeSize,
        fadeSizeCurve: fadeSizeCurve || null,
        fadeOpacity,
        fadeOpacityCurve: fadeOpacityCurve || null,
        velocityCurve: velocityCurve || null,
        gravity,
        lifetime,
        direction,
        startPosition,
        startPositionAsDirection,
        speed,
        friction,
        appearance,
        rotation,
        rotationSpeed,
        rotationSpeedCurve: rotationSpeedCurve || null,
        orientToDirection,
        orientAxis,
        stretchBySpeed: stretchBySpeed || null,
        lighting,
        shadow,
        blending,
        intensity,
        position,
        autoStart,
        delay,
        emitCount,
        emitterShape,
        emitterRadius,
        emitterAngle,
        emitterHeight,
        emitterSurfaceOnly,
        emitterDirection,
        turbulence,
        attractToCenter,
        softParticles,
        softDistance,
        collision,
        ...detectGeometryTypeAndArgs(geometry),
      }

      debugValues = initialValues
      prevGeometryType = initialValues.geometryType
      prevGeometryArgs = initialValues.geometryArgs
    }

    renderDebugPanel(debugValues, handleDebugUpdate, 'threlte')
  })
}

// Watch structural props for recreation (skip in debug mode)
$effect(() => {
  // Read all structural props to track them
  const _deps = [
    maxParticles,
    lighting,
    appearance,
    orientToDirection,
    geometry,
    shadow,
    fadeSizeCurve,
    fadeOpacityCurve,
    velocityCurve,
    rotationSpeedCurve,
    colorStart.length,
    colorEnd,
    rotation,
    rotationSpeed,
    turbulence,
    attractors,
    collision,
  ]

  if (debug) return

  // Use untrack for writes to avoid circular dependencies
  untrack(() => {
    activeMaxParticles = maxParticles
    activeLighting = lighting
    activeAppearance = appearance
    activeOrientToDirection = orientToDirection
    activeGeometry = geometry
    activeShadow = shadow
    activeFadeSizeCurve = fadeSizeCurve
    activeFadeOpacityCurve = fadeOpacityCurve
    activeVelocityCurve = velocityCurve
    activeRotationSpeedCurve = rotationSpeedCurve
    activeNeedsPerParticleColor =
      colorStart.length > 1 || colorEnd !== null
    activeNeedsRotation =
      isNonDefaultRotation(rotation) ||
      isNonDefaultRotation(rotationSpeed)
    activeTurbulence =
      turbulence !== null && (turbulence?.intensity ?? 0) > 0
    activeAttractors =
      attractors !== null && (attractors?.length ?? 0) > 0
    activeCollision = collision !== null
  })
})

// Watch structural active values for system recreation
$effect(() => {
  // Read all active values to track them
  const _deps = [
    activeMaxParticles,
    activeLighting,
    activeAppearance,
    activeOrientToDirection,
    activeGeometry,
    activeShadow,
    activeNeedsPerParticleColor,
    activeNeedsRotation,
    activeTurbulence,
    activeAttractors,
    activeCollision,
    activeFadeSizeCurve,
    activeFadeOpacityCurve,
    activeVelocityCurve,
    activeRotationSpeedCurve,
  ]

  if (!mounted) return

  // Use untrack for the actual init to avoid reading/writing
  // reactive state that would re-trigger this effect
  untrack(() => {
    initSystem()
  })
})

// Watch non-structural props for uniform updates (skip in debug mode)
$effect(() => {
  const _deps = [
    position,
    size,
    fadeSize,
    fadeOpacity,
    gravity,
    friction,
    speed,
    lifetime,
    direction,
    rotation,
    rotationSpeed,
    intensity,
    colorStart,
    colorEnd,
    collision,
    emitterShape,
    emitterRadius,
    emitterAngle,
    emitterHeight,
    emitterSurfaceOnly,
    emitterDirection,
    turbulence,
    startPosition,
    attractors,
    attractToCenter,
    startPositionAsDirection,
    softParticles,
    softDistance,
    orientAxis,
    stretchBySpeed,
    delay,
    emitCount,
  ]

  if (debug) return

  untrack(() => {
    if (!_system) return

    _system.setPosition(position as [number, number, number])
    _system.setDelay(delay)
    _system.setEmitCount(emitCount)
    _system.setTurbulenceSpeed(turbulence?.speed ?? 1)

    const normalized = normalizeProps({
      size,
      speed,
      fadeSize,
      fadeOpacity,
      lifetime,
      gravity,
      direction,
      startPosition,
      rotation,
      rotationSpeed,
      friction,
      intensity,
      colorStart,
      colorEnd,
      emitterShape,
      emitterRadius,
      emitterAngle,
      emitterHeight,
      emitterSurfaceOnly,
      emitterDirection,
      turbulence,
      attractors,
      attractToCenter,
      startPositionAsDirection,
      softParticles,
      softDistance,
      collision,
      orientAxis,
      stretchBySpeed,
    } as any)
    updateUniforms(_system.uniforms, normalized)
  })
})

// Frame loop
useTask((delta) => {
  if (!_system || !_system.initialized) return
  _system.update(delta)
  if (_emitting) {
    _system.autoEmit(delta)
  }
})

onMount(() => {
  mounted = true
  initSystem()
})

onDestroy(() => {
  mounted = false
  if (debug) {
    import('debug-vfx').then((mod) => {
      mod.destroyDebugPanel()
    })
  }
  destroySystem()
})

// Exposed API
export function spawn(
  x = 0,
  y = 0,
  z = 0,
  count = 20,
  overrides: Record<string, unknown> | null = null
) {
  if (!_system) return
  const [px, py, pz] = _system.position
  _system.spawn(px + x, py + y, pz + z, count, overrides)
}

export function start() {
  if (!_system) return
  _system.start()
  _emitting = true
}

export function stop() {
  if (!_system) return
  _system.stop()
  _emitting = false
}

export function clear() {
  _system?.clear()
}
</script>

{#if renderObjectForTemplate}
  <T is={renderObjectForTemplate} />
{/if}
