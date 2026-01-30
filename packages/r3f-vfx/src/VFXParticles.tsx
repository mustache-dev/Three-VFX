import {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useState,
} from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { useVFXStore } from './react-store'
import { useCurveTextureAsync } from './useCurveTextureAsync'
import {
  Appearance,
  Blending,
  EmitterShape,
  Lighting,
  VFXParticleSystem,
  isNonDefaultRotation,
  toRange,
  toRotation3D,
  hexToRgb,
  easingToType,
  axisToNumber,
  lifetimeToFadeRate,
  MAX_ATTRACTORS,
  type CurveData,
  type Rotation3DInput,
  type ParticleData,
  type AttractorConfig,
} from 'core-vfx'

// Re-export constants and utilities for backwards compatibility
export {
  Appearance,
  Blending,
  EmitterShape,
  AttractorType,
  Easing,
  Lighting,
  bakeCurveToArray,
  createCombinedCurveTexture,
  buildCurveTextureBin,
  CurveChannel,
} from 'core-vfx'

export type { CurveTextureResult } from 'core-vfx'

export type VFXParticlesProps = {
  /** Optional name for registering with useVFXStore (enables VFXEmitter linking) */
  name?: string
  /** Maximum number of particles */
  maxParticles?: number
  /** Particle size [min, max] or single value */
  size?: number | [number, number]
  /** Array of hex color strings for start color */
  colorStart?: string[]
  /** Array of hex color strings for end color (null = use colorStart) */
  colorEnd?: string[] | null
  /** Fade size [start, end] multiplier over lifetime */
  fadeSize?: number | [number, number]
  /** Curve data for size over lifetime */
  fadeSizeCurve?: CurveData
  /** Fade opacity [start, end] multiplier over lifetime */
  fadeOpacity?: number | [number, number]
  /** Curve data for opacity over lifetime */
  fadeOpacityCurve?: CurveData
  /** Curve data for velocity over lifetime */
  velocityCurve?: CurveData
  /** Gravity vector [x, y, z] */
  gravity?: [number, number, number]
  /** Particle lifetime in seconds [min, max] or single value */
  lifetime?: number | [number, number]
  /** Direction ranges for velocity */
  direction?: Rotation3DInput
  /** Start position offset ranges */
  startPosition?: Rotation3DInput
  /** Speed [min, max] or single value */
  speed?: number | [number, number]
  /** Friction settings */
  friction?: { intensity?: number | [number, number]; easing?: string }
  /** Particle appearance type */
  appearance?: (typeof Appearance)[keyof typeof Appearance]
  /** Alpha map texture */
  alphaMap?: THREE.Texture | null
  /** Flipbook animation settings */
  flipbook?: { rows: number; columns: number } | null
  /** Rotation [min, max] in radians or 3D rotation ranges */
  rotation?: Rotation3DInput
  /** Rotation speed [min, max] in radians/second or 3D ranges */
  rotationSpeed?: Rotation3DInput
  /** Curve data for rotation speed over lifetime */
  rotationSpeedCurve?: CurveData
  /** Custom geometry for 3D particles */
  geometry?: THREE.BufferGeometry | null
  /** Rotate geometry to face velocity direction */
  orientToDirection?: boolean
  /** Which local axis aligns with velocity */
  orientAxis?: string
  /** Stretch particles based on speed */
  stretchBySpeed?: { factor: number; maxStretch: number } | null
  /** Material lighting type for geometry mode */
  lighting?: (typeof Lighting)[keyof typeof Lighting]
  /** Enable shadows on geometry instances */
  shadow?: boolean
  /** Blending mode */
  blending?: THREE.Blending
  /** Color intensity multiplier */
  intensity?: number
  /** Emitter position [x, y, z] */
  position?: [number, number, number]
  /** Start emitting automatically */
  autoStart?: boolean
  /** Delay between emissions in seconds */
  delay?: number
  /** TSL node or function for backdrop sampling */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  backdropNode?: any | ((data: ParticleData) => any) | null
  /** TSL node or function for custom opacity */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opacityNode?: any | ((data: ParticleData) => any) | null
  /** TSL node or function to override color */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colorNode?: any | ((data: ParticleData, defaultColor: any) => any) | null
  /** TSL node or function for alpha test/discard */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  alphaTestNode?: any | ((data: ParticleData) => any) | null
  /** TSL node or function for shadow map output */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  castShadowNode?: any | ((data: ParticleData) => any) | null
  /** Number of particles to emit per frame */
  emitCount?: number
  /** Emitter shape type */
  emitterShape?: (typeof EmitterShape)[keyof typeof EmitterShape]
  /** Emitter radius [inner, outer] */
  emitterRadius?: number | [number, number]
  /** Cone angle in radians */
  emitterAngle?: number
  /** Cone height [min, max] */
  emitterHeight?: number | [number, number]
  /** Emit from surface only */
  emitterSurfaceOnly?: boolean
  /** Direction for cone/disk normal */
  emitterDirection?: [number, number, number]
  /** Turbulence settings */
  turbulence?: { intensity: number; frequency?: number; speed?: number } | null
  /** Array of attractors (max 4) */
  attractors?: Array<{
    position?: [number, number, number]
    strength?: number
    radius?: number
    type?: 'point' | 'vortex'
    axis?: [number, number, number]
  }> | null
  /** Particles move from spawn position to center over lifetime */
  attractToCenter?: boolean
  /** Use start position offset as direction */
  startPositionAsDirection?: boolean
  /** Fade particles when intersecting scene geometry */
  softParticles?: boolean
  /** Distance over which to fade soft particles */
  softDistance?: number
  /** Plane collision settings */
  collision?: {
    plane?: { y: number }
    bounce?: number
    friction?: number
    die?: boolean
    sizeBasedGravity?: number
  } | null
  /** Show debug control panel */
  debug?: boolean
  /** Path to pre-baked curve texture (skips runtime baking for faster load) */
  curveTexturePath?: string | null
  /** Depth test */
  depthTest?: boolean
  /** Render order (higher values render on top) */
  renderOrder?: number
}

export const VFXParticles = forwardRef<unknown, VFXParticlesProps>(
  function VFXParticles(
    {
      name,
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
      direction = [
        [-1, 1],
        [0, 1],
        [-1, 1],
      ],
      startPosition = [
        [0, 0],
        [0, 0],
        [0, 0],
      ],
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
      debug = false,
      curveTexturePath = null,
      depthTest = true,
      renderOrder = 0,
    },
    ref
  ) {
    const { gl: renderer } = useThree()
    const spriteRef = useRef<THREE.Sprite | THREE.InstancedMesh | null>(null)
    const [emitting, setEmitting] = useState(autoStart)

    // Refs for runtime values that can be updated by debug panel
    const delayRef = useRef(delay)
    const emitCountRef = useRef(emitCount)
    const turbulenceRef = useRef(turbulence)

    // State for "remount-required" values - changing these recreates GPU resources
    const [activeMaxParticles, setActiveMaxParticles] = useState(maxParticles)
    const [activeLighting, setActiveLighting] = useState(lighting)
    const [activeAppearance, setActiveAppearance] = useState(appearance)
    const [activeOrientToDirection, setActiveOrientToDirection] =
      useState(orientToDirection)
    const [activeGeometry, setActiveGeometry] = useState(geometry)
    const [activeShadow, setActiveShadow] = useState(shadow)
    const [activeFadeSizeCurve, setActiveFadeSizeCurve] =
      useState(fadeSizeCurve)
    const [activeFadeOpacityCurve, setActiveFadeOpacityCurve] =
      useState(fadeOpacityCurve)
    const [activeVelocityCurve, setActiveVelocityCurve] =
      useState(velocityCurve)
    const [activeRotationSpeedCurve, setActiveRotationSpeedCurve] =
      useState(rotationSpeedCurve)
    const [activeTurbulence, setActiveTurbulence] = useState(
      turbulence !== null && (turbulence?.intensity ?? 0) > 0
    )
    const [activeAttractors, setActiveAttractors] = useState(
      attractors !== null && attractors.length > 0
    )
    const [activeCollision, setActiveCollision] = useState(collision !== null)
    const [activeNeedsPerParticleColor, setActiveNeedsPerParticleColor] =
      useState(colorStart.length > 1 || colorEnd !== null)
    const [activeNeedsRotation, setActiveNeedsRotation] = useState(
      isNonDefaultRotation(rotation) || isNonDefaultRotation(rotationSpeed)
    )

    // Keep refs in sync with props (when not in debug mode)
    useEffect(() => {
      delayRef.current = delay
      emitCountRef.current = emitCount
      turbulenceRef.current = turbulence
    }, [delay, emitCount, turbulence])

    // Keep remount-required state in sync with props (when not in debug mode)
    useEffect(() => {
      if (!debug) {
        setActiveMaxParticles(maxParticles)
        setActiveLighting(lighting)
        setActiveAppearance(appearance)
        setActiveOrientToDirection(orientToDirection)
        setActiveGeometry(geometry)
        setActiveShadow(shadow)
        setActiveFadeSizeCurve(fadeSizeCurve)
        setActiveFadeOpacityCurve(fadeOpacityCurve)
        setActiveVelocityCurve(velocityCurve)
        setActiveRotationSpeedCurve(rotationSpeedCurve)
        setActiveNeedsPerParticleColor(
          colorStart.length > 1 || colorEnd !== null
        )
        setActiveNeedsRotation(
          isNonDefaultRotation(rotation) || isNonDefaultRotation(rotationSpeed)
        )
        setActiveTurbulence(
          turbulence !== null && (turbulence?.intensity ?? 0) > 0
        )
        setActiveAttractors(attractors !== null && attractors.length > 0)
        setActiveCollision(collision !== null)
      }
    }, [
      debug,
      maxParticles,
      lighting,
      appearance,
      orientToDirection,
      geometry,
      colorStart.length,
      colorEnd,
      shadow,
      fadeSizeCurve,
      fadeOpacityCurve,
      velocityCurve,
      rotationSpeedCurve,
      rotation,
      rotationSpeed,
      turbulence,
      attractors,
      collision,
    ])

    // Curve texture (React-specific hook)
    const {
      texture: curveTexture,
      sizeEnabled: curveTextureSizeEnabled,
      opacityEnabled: curveTextureOpacityEnabled,
      velocityEnabled: curveTextureVelocityEnabled,
      rotationSpeedEnabled: curveTextureRotationSpeedEnabled,
    } = useCurveTextureAsync(
      activeFadeSizeCurve,
      activeFadeOpacityCurve,
      activeVelocityCurve,
      activeRotationSpeedCurve,
      curveTexturePath
    )

    // Create/recreate system when structural props change
    const system = useMemo(
      () =>
        new VFXParticleSystem(
          renderer as unknown as THREE.WebGPURenderer,
          {
            maxParticles: activeMaxParticles,
            size,
            colorStart,
            colorEnd,
            fadeSize,
            fadeSizeCurve: activeFadeSizeCurve,
            fadeOpacity,
            fadeOpacityCurve: activeFadeOpacityCurve,
            velocityCurve: activeVelocityCurve,
            gravity,
            lifetime,
            direction,
            startPosition,
            speed,
            friction,
            appearance: activeAppearance,
            alphaMap,
            flipbook,
            rotation,
            rotationSpeed,
            rotationSpeedCurve: activeRotationSpeedCurve,
            geometry: activeGeometry,
            orientToDirection: activeOrientToDirection,
            orientAxis,
            stretchBySpeed,
            lighting: activeLighting,
            shadow: activeShadow,
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
            attractors,
            attractToCenter,
            startPositionAsDirection,
            softParticles,
            softDistance,
            collision,
            backdropNode,
            opacityNode,
            colorNode,
            alphaTestNode,
            castShadowNode,
            depthTest,
            renderOrder,
          },
          curveTexture,
          {
            sizeEnabled: curveTextureSizeEnabled,
            opacityEnabled: curveTextureOpacityEnabled,
            velocityEnabled: curveTextureVelocityEnabled,
            rotationSpeedEnabled: curveTextureRotationSpeedEnabled,
          }
        ),
      // Only recreate when structural props change (features, maxParticles, etc.)
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [
        renderer,
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
        curveTexture,
        alphaMap,
        flipbook,
        blending,
        backdropNode,
        opacityNode,
        colorNode,
        alphaTestNode,
        castShadowNode,
        softParticles,
      ]
    )

    // Initialize on mount
    useEffect(() => {
      system.init()
    }, [system])

    // Store position prop for use in spawn
    const positionRef = useRef(position)

    // Update uniforms when non-structural props change (skip in debug mode)
    useEffect(() => {
      if (debug) return

      positionRef.current = position
      system.setPosition(position)

      // Normalize and update all uniforms
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const u = system.uniforms as Record<string, any>
      const sizeRange = toRange(size, [0.1, 0.3])
      const speedRange = toRange(speed, [0.1, 0.1])
      const fadeSizeRange = toRange(fadeSize, [1, 0])
      const fadeOpacityRange = toRange(fadeOpacity, [1, 0])
      const lifetimeRange = toRange(lifetime, [1, 2])
      const direction3D = toRotation3D(direction)
      const startPosition3D = toRotation3D(startPosition)
      const rotation3D = toRotation3D(rotation)
      const rotationSpeed3D = toRotation3D(rotationSpeed)
      const emitterRadiusRange = toRange(emitterRadius, [0, 1])
      const emitterHeightRange = toRange(emitterHeight, [0, 1])

      const frictionIntensityRange: [number, number] =
        typeof friction === 'object' &&
        friction !== null &&
        'intensity' in friction
          ? toRange(friction.intensity, [0, 0])
          : [0, 0]
      const frictionEasingType =
        typeof friction === 'object' &&
        friction !== null &&
        'easing' in friction
          ? easingToType(friction.easing ?? 'linear')
          : 0

      const startColors: [number, number, number][] = colorStart
        .slice(0, 8)
        .map(hexToRgb)
      while (startColors.length < 8)
        startColors.push(startColors[startColors.length - 1] || [1, 1, 1])

      const effectiveColorEnd = colorEnd ?? colorStart
      const endColors: [number, number, number][] = effectiveColorEnd
        .slice(0, 8)
        .map(hexToRgb)
      while (endColors.length < 8)
        endColors.push(endColors[endColors.length - 1] || [1, 1, 1])

      // Size
      u.sizeMin.value = sizeRange[0]
      u.sizeMax.value = sizeRange[1]
      // Fade
      u.fadeSizeStart.value = fadeSizeRange[0]
      u.fadeSizeEnd.value = fadeSizeRange[1]
      u.fadeOpacityStart.value = fadeOpacityRange[0]
      u.fadeOpacityEnd.value = fadeOpacityRange[1]
      // Physics
      u.gravity.value.set(...gravity)
      u.frictionIntensityStart.value = frictionIntensityRange[0]
      u.frictionIntensityEnd.value = frictionIntensityRange[1]
      u.frictionEasingType.value = frictionEasingType
      u.speedMin.value = speedRange[0]
      u.speedMax.value = speedRange[1]
      // Lifetime
      u.lifetimeMin.value = lifetimeToFadeRate(lifetimeRange[1])
      u.lifetimeMax.value = lifetimeToFadeRate(lifetimeRange[0])
      // Direction
      u.dirMinX.value = direction3D[0][0]
      u.dirMaxX.value = direction3D[0][1]
      u.dirMinY.value = direction3D[1][0]
      u.dirMaxY.value = direction3D[1][1]
      u.dirMinZ.value = direction3D[2][0]
      u.dirMaxZ.value = direction3D[2][1]
      // Start position offset
      u.startPosMinX.value = startPosition3D[0][0]
      u.startPosMaxX.value = startPosition3D[0][1]
      u.startPosMinY.value = startPosition3D[1][0]
      u.startPosMaxY.value = startPosition3D[1][1]
      u.startPosMinZ.value = startPosition3D[2][0]
      u.startPosMaxZ.value = startPosition3D[2][1]
      // Rotation
      u.rotationMinX.value = rotation3D[0][0]
      u.rotationMaxX.value = rotation3D[0][1]
      u.rotationMinY.value = rotation3D[1][0]
      u.rotationMaxY.value = rotation3D[1][1]
      u.rotationMinZ.value = rotation3D[2][0]
      u.rotationMaxZ.value = rotation3D[2][1]
      // Rotation speed
      u.rotationSpeedMinX.value = rotationSpeed3D[0][0]
      u.rotationSpeedMaxX.value = rotationSpeed3D[0][1]
      u.rotationSpeedMinY.value = rotationSpeed3D[1][0]
      u.rotationSpeedMaxY.value = rotationSpeed3D[1][1]
      u.rotationSpeedMinZ.value = rotationSpeed3D[2][0]
      u.rotationSpeedMaxZ.value = rotationSpeed3D[2][1]
      // Intensity
      u.intensity.value = intensity
      // Colors
      u.colorStartCount.value = colorStart.length
      u.colorEndCount.value = effectiveColorEnd.length
      startColors.forEach((c: [number, number, number], i: number) => {
        u[`colorStart${i}`]?.value.setRGB(...c)
      })
      endColors.forEach((c: [number, number, number], i: number) => {
        u[`colorEnd${i}`]?.value.setRGB(...c)
      })
      // Emitter shape
      u.emitterShapeType.value = emitterShape
      u.emitterRadiusInner.value = emitterRadiusRange[0]
      u.emitterRadiusOuter.value = emitterRadiusRange[1]
      u.emitterAngle.value = emitterAngle
      u.emitterHeightMin.value = emitterHeightRange[0]
      u.emitterHeightMax.value = emitterHeightRange[1]
      u.emitterSurfaceOnly.value = emitterSurfaceOnly ? 1 : 0
      u.emitterDir.value.set(...emitterDirection).normalize()
      // Turbulence
      u.turbulenceIntensity.value = turbulence?.intensity ?? 0
      u.turbulenceFrequency.value = turbulence?.frequency ?? 1
      u.turbulenceSpeed.value = turbulence?.speed ?? 1
      // Attractors
      const attractorList = attractors ?? []
      u.attractorCount.value = Math.min(attractorList.length, MAX_ATTRACTORS)
      for (let i = 0; i < MAX_ATTRACTORS; i++) {
        const a: AttractorConfig | undefined = attractorList[i]
        if (a) {
          ;(u[`attractor${i}Pos`].value as THREE.Vector3).set(
            ...(a.position ?? [0, 0, 0])
          )
          u[`attractor${i}Strength`].value = a.strength ?? 1
          u[`attractor${i}Radius`].value = a.radius ?? 0
          u[`attractor${i}Type`].value = a.type === 'vortex' ? 1 : 0
          ;(u[`attractor${i}Axis`].value as THREE.Vector3)
            .set(...(a.axis ?? [0, 1, 0]))
            .normalize()
        } else {
          u[`attractor${i}Strength`].value = 0
        }
      }
      // Simple attract to center
      u.attractToCenter.value = attractToCenter ? 1 : 0
      // Start position as direction
      u.startPositionAsDirection.value = startPositionAsDirection ? 1 : 0
      // Soft particles
      u.softParticlesEnabled.value = softParticles ? 1 : 0
      u.softDistance.value = softDistance
      // Curve enabled flags
      u.velocityCurveEnabled.value = curveTextureVelocityEnabled ? 1 : 0
      u.rotationSpeedCurveEnabled.value = curveTextureRotationSpeedEnabled
        ? 1
        : 0
      u.fadeSizeCurveEnabled.value = curveTextureSizeEnabled ? 1 : 0
      u.fadeOpacityCurveEnabled.value = curveTextureOpacityEnabled ? 1 : 0
      // Orient axis
      u.orientAxisType.value = axisToNumber(orientAxis)
      // Stretch by speed
      u.stretchEnabled.value = stretchBySpeed ? 1 : 0
      u.stretchFactor.value = stretchBySpeed?.factor ?? 1
      u.stretchMax.value = stretchBySpeed?.maxStretch ?? 5
      // Collision
      u.collisionEnabled.value = collision ? 1 : 0
      u.collisionPlaneY.value = collision?.plane?.y ?? 0
      u.collisionBounce.value = collision?.bounce ?? 0.3
      u.collisionFriction.value = collision?.friction ?? 0.8
      u.collisionDie.value = collision?.die ? 1 : 0
      u.sizeBasedGravity.value = collision?.sizeBasedGravity ?? 0
    }, [
      debug,
      system,
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
      curveTextureVelocityEnabled,
      curveTextureRotationSpeedEnabled,
      curveTextureSizeEnabled,
      curveTextureOpacityEnabled,
      orientAxis,
      stretchBySpeed,
    ])

    // Keep computeUpdate in a ref so useFrame always has the latest version
    const computeUpdateRef = useRef(system.computeUpdate)
    useEffect(() => {
      computeUpdateRef.current = system.computeUpdate
    }, [system.computeUpdate])

    // Spawn function - internal
    const spawnInternal = useCallback(
      (
        x: number,
        y: number,
        z: number,
        count = 20,
        overrides: Record<string, unknown> | null = null
      ) => {
        system.spawn(x, y, z, count, overrides)
      },
      [system]
    )

    // Public spawn - uses position prop as offset, supports overrides
    const spawn = useCallback(
      (
        x = 0,
        y = 0,
        z = 0,
        count = 20,
        overrides: Record<string, unknown> | null = null
      ) => {
        const [px, py, pz] = positionRef.current ?? [0, 0, 0]
        spawnInternal(px + x, py + y, pz + z, count, overrides)
      },
      [spawnInternal]
    )

    // Update each frame + auto emit
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emitAccumulator = useRef(0)
    useFrame(async (state, delta) => {
      if (!system.initialized || !renderer) return

      // Update deltaTime uniform for framerate independence
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const uFrame = system.uniforms as Record<string, any>
      uFrame.deltaTime.value = delta

      // Update turbulence time (animated noise field)
      const turbSpeed = turbulenceRef.current?.speed ?? 1
      uFrame.turbulenceTime.value += delta * turbSpeed

      // Update particles - use ref to always get latest computeUpdate
      // @ts-expect-error - WebGPU computeAsync not in WebGL types
      await renderer.computeAsync(computeUpdateRef.current)

      // Auto emit if enabled
      if (emitting) {
        const [px, py, pz] = positionRef.current
        const currentDelay = delayRef.current
        const currentEmitCount = emitCountRef.current

        if (!currentDelay) {
          spawnInternal(px, py, pz, currentEmitCount)
        } else {
          emitAccumulator.current += delta
          if (emitAccumulator.current >= currentDelay) {
            emitAccumulator.current -= currentDelay
            spawnInternal(px, py, pz, currentEmitCount)
          }
        }
      }
    })

    // Start/stop functions
    const start = useCallback(() => {
      setEmitting(true)
      emitAccumulator.current = 0
    }, [])

    const stop = useCallback(() => {
      setEmitting(false)
    }, [])

    // Cleanup old material/renderObject when they change (not on unmount)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevMaterialRef = useRef<any>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevRenderObjectRef = useRef<any>(null)

    useEffect(() => {
      // Dispose previous material if it changed
      if (
        prevMaterialRef.current &&
        prevMaterialRef.current !== system.material
      ) {
        prevMaterialRef.current.dispose()
      }
      prevMaterialRef.current = system.material

      // Dispose previous renderObject if it changed
      if (
        prevRenderObjectRef.current &&
        prevRenderObjectRef.current !== system.renderObject
      ) {
        if (prevRenderObjectRef.current.material) {
          prevRenderObjectRef.current.material.dispose()
        }
      }
      prevRenderObjectRef.current = system.renderObject
    }, [system.material, system.renderObject])

    // Cleanup on actual unmount only
    useEffect(() => {
      return () => {
        system.dispose()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Expose methods via ref
    const particleAPI = useMemo(
      () => ({
        spawn,
        start,
        stop,
        get isEmitting() {
          return emitting
        },
        clear() {
          system.clear()
        },
        uniforms: system.uniforms,
      }),
      [spawn, start, stop, emitting, system]
    )

    useImperativeHandle(ref, () => particleAPI, [particleAPI])

    // Register with VFX store when name prop is provided
    const registerParticles = useVFXStore((s) => s.registerParticles)
    const unregisterParticles = useVFXStore((s) => s.unregisterParticles)

    useEffect(() => {
      if (!name) return

      registerParticles(name, particleAPI)

      return () => {
        unregisterParticles(name)
      }
    }, [name, particleAPI, registerParticles, unregisterParticles])

    // Debug panel - no React state, direct ref mutation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const debugValuesRef = useRef<any>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevGeometryTypeRef = useRef<any>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevGeometryArgsRef = useRef<any>(null)

    // Imperative update function called by debug panel
    const handleDebugUpdate = useCallback(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (newValues: any) => {
        // Merge new values into existing (dirty tracking only sends changed keys)
        debugValuesRef.current = { ...debugValuesRef.current, ...newValues }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u = system.uniforms as Record<string, any>

        // Size
        if ('size' in newValues) {
          const sizeR = toRange(newValues.size, [0.1, 0.3])
          u.sizeMin.value = sizeR[0]
          u.sizeMax.value = sizeR[1]
        }

        // Fade Size
        if ('fadeSize' in newValues) {
          const fadeSizeR = toRange(newValues.fadeSize, [1, 0])
          u.fadeSizeStart.value = fadeSizeR[0]
          u.fadeSizeEnd.value = fadeSizeR[1]
        }

        // Fade Opacity
        if ('fadeOpacity' in newValues) {
          const fadeOpacityR = toRange(newValues.fadeOpacity, [1, 0])
          u.fadeOpacityStart.value = fadeOpacityR[0]
          u.fadeOpacityEnd.value = fadeOpacityR[1]
        }

        // Curves
        if ('fadeSizeCurve' in newValues) {
          setActiveFadeSizeCurve(newValues.fadeSizeCurve)
          u.fadeSizeCurveEnabled.value = newValues.fadeSizeCurve ? 1 : 0
        }
        if ('fadeOpacityCurve' in newValues) {
          setActiveFadeOpacityCurve(newValues.fadeOpacityCurve)
          u.fadeOpacityCurveEnabled.value = newValues.fadeOpacityCurve ? 1 : 0
        }
        if ('velocityCurve' in newValues) {
          setActiveVelocityCurve(newValues.velocityCurve)
          u.velocityCurveEnabled.value = newValues.velocityCurve ? 1 : 0
        }
        if ('rotationSpeedCurve' in newValues) {
          setActiveRotationSpeedCurve(newValues.rotationSpeedCurve)
          u.rotationSpeedCurveEnabled.value = newValues.rotationSpeedCurve
            ? 1
            : 0
        }

        // Orient axis
        if ('orientAxis' in newValues) {
          u.orientAxisType.value = axisToNumber(newValues.orientAxis)
        }

        // Stretch by speed
        if ('stretchBySpeed' in newValues) {
          u.stretchEnabled.value = newValues.stretchBySpeed ? 1 : 0
          u.stretchFactor.value = newValues.stretchBySpeed?.factor ?? 1
          u.stretchMax.value = newValues.stretchBySpeed?.maxStretch ?? 5
        }

        // Physics
        if (newValues.gravity && Array.isArray(newValues.gravity)) {
          u.gravity.value.x = newValues.gravity[0]
          u.gravity.value.y = newValues.gravity[1]
          u.gravity.value.z = newValues.gravity[2]
        }

        // Speed
        if ('speed' in newValues) {
          const speedR = toRange(newValues.speed, [0.1, 0.1])
          u.speedMin.value = speedR[0]
          u.speedMax.value = speedR[1]
        }

        // Lifetime
        if ('lifetime' in newValues) {
          const lifetimeR = toRange(newValues.lifetime, [1, 2])
          u.lifetimeMin.value = 1 / lifetimeR[1]
          u.lifetimeMax.value = 1 / lifetimeR[0]
        }

        // Friction
        if ('friction' in newValues && newValues.friction) {
          const frictionR = toRange(newValues.friction.intensity, [0, 0])
          u.frictionIntensityStart.value = frictionR[0]
          u.frictionIntensityEnd.value = frictionR[1]
          u.frictionEasingType.value = easingToType(newValues.friction.easing)
        }

        // Direction 3D
        if ('direction' in newValues) {
          const dir3D = toRotation3D(newValues.direction)
          u.dirMinX.value = dir3D[0][0]
          u.dirMaxX.value = dir3D[0][1]
          u.dirMinY.value = dir3D[1][0]
          u.dirMaxY.value = dir3D[1][1]
          u.dirMinZ.value = dir3D[2][0]
          u.dirMaxZ.value = dir3D[2][1]
        }

        // Start position 3D
        if ('startPosition' in newValues) {
          const startPos3D = toRotation3D(newValues.startPosition)
          u.startPosMinX.value = startPos3D[0][0]
          u.startPosMaxX.value = startPos3D[0][1]
          u.startPosMinY.value = startPos3D[1][0]
          u.startPosMaxY.value = startPos3D[1][1]
          u.startPosMinZ.value = startPos3D[2][0]
          u.startPosMaxZ.value = startPos3D[2][1]
        }

        // Rotation 3D
        if ('rotation' in newValues) {
          const rot3D = toRotation3D(newValues.rotation)
          u.rotationMinX.value = rot3D[0][0]
          u.rotationMaxX.value = rot3D[0][1]
          u.rotationMinY.value = rot3D[1][0]
          u.rotationMaxY.value = rot3D[1][1]
          u.rotationMinZ.value = rot3D[2][0]
          u.rotationMaxZ.value = rot3D[2][1]
        }

        // Rotation speed 3D
        if ('rotationSpeed' in newValues) {
          const rotSpeed3D = toRotation3D(newValues.rotationSpeed)
          u.rotationSpeedMinX.value = rotSpeed3D[0][0]
          u.rotationSpeedMaxX.value = rotSpeed3D[0][1]
          u.rotationSpeedMinY.value = rotSpeed3D[1][0]
          u.rotationSpeedMaxY.value = rotSpeed3D[1][1]
          u.rotationSpeedMinZ.value = rotSpeed3D[2][0]
          u.rotationSpeedMaxZ.value = rotSpeed3D[2][1]
        }

        // Update rotation storage state
        if ('rotation' in newValues || 'rotationSpeed' in newValues) {
          const rot = newValues.rotation ??
            debugValuesRef.current?.rotation ?? [0, 0]
          const rotSpeed = newValues.rotationSpeed ??
            debugValuesRef.current?.rotationSpeed ?? [0, 0]
          const needsRotation =
            isNonDefaultRotation(rot) || isNonDefaultRotation(rotSpeed)
          if (needsRotation !== activeNeedsRotation) {
            setActiveNeedsRotation(needsRotation)
          }
        }

        // Intensity
        if ('intensity' in newValues) {
          u.intensity.value = newValues.intensity || 1
        }

        // Colors
        if ('colorStart' in newValues && newValues.colorStart) {
          const sColors = newValues.colorStart.slice(0, 8).map(hexToRgb)
          while (sColors.length < 8)
            sColors.push(sColors[sColors.length - 1] || [1, 1, 1])
          u.colorStartCount.value = newValues.colorStart.length
          sColors.forEach((c: [number, number, number], i: number) => {
            if (u[`colorStart${i}`]) {
              u[`colorStart${i}`].value.setRGB(...c)
            }
          })

          const currentColorEnd = debugValuesRef.current?.colorEnd
          if (!currentColorEnd) {
            u.colorEndCount.value = newValues.colorStart.length
            sColors.forEach((c: [number, number, number], i: number) => {
              if (u[`colorEnd${i}`]) {
                u[`colorEnd${i}`].value.setRGB(...c)
              }
            })
          }
        }

        // Color End
        if ('colorEnd' in newValues) {
          const effectiveEndColors = newValues.colorEnd ||
            newValues.colorStart ||
            debugValuesRef.current?.colorStart || ['#ffffff']
          if (effectiveEndColors) {
            const eColors = effectiveEndColors.slice(0, 8).map(hexToRgb)
            while (eColors.length < 8)
              eColors.push(eColors[eColors.length - 1] || [1, 1, 1])
            u.colorEndCount.value = effectiveEndColors.length
            eColors.forEach((c: [number, number, number], i: number) => {
              if (u[`colorEnd${i}`]) {
                u[`colorEnd${i}`].value.setRGB(...c)
              }
            })
          }
        }

        // Update per-particle color state
        if ('colorStart' in newValues || 'colorEnd' in newValues) {
          const startLen =
            newValues.colorStart?.length ??
            debugValuesRef.current?.colorStart?.length ??
            1
          const hasColorEnd =
            'colorEnd' in newValues
              ? newValues.colorEnd !== null
              : debugValuesRef.current?.colorEnd !== null
          const needsPerParticle = startLen > 1 || hasColorEnd
          if (needsPerParticle !== activeNeedsPerParticleColor) {
            setActiveNeedsPerParticleColor(needsPerParticle)
          }
        }

        // Emitter shape
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

        // Turbulence
        if ('turbulence' in newValues) {
          u.turbulenceIntensity.value = newValues.turbulence?.intensity ?? 0
          u.turbulenceFrequency.value = newValues.turbulence?.frequency ?? 1
          u.turbulenceSpeed.value = newValues.turbulence?.speed ?? 1
          turbulenceRef.current = newValues.turbulence
          const needsTurbulence =
            newValues.turbulence !== null &&
            (newValues.turbulence?.intensity ?? 0) > 0
          if (needsTurbulence !== activeTurbulence) {
            setActiveTurbulence(needsTurbulence)
          }
        }

        // Attract to center
        if ('attractToCenter' in newValues) {
          u.attractToCenter.value = newValues.attractToCenter ? 1 : 0
        }

        // Start position as direction
        if ('startPositionAsDirection' in newValues) {
          u.startPositionAsDirection.value = newValues.startPositionAsDirection
            ? 1
            : 0
        }

        // Soft particles
        if ('softParticles' in newValues) {
          u.softParticlesEnabled.value = newValues.softParticles ? 1 : 0
        }
        if ('softDistance' in newValues) {
          u.softDistance.value = newValues.softDistance ?? 0.5
        }

        // Collision
        if ('collision' in newValues) {
          u.collisionEnabled.value = newValues.collision ? 1 : 0
          u.collisionPlaneY.value = newValues.collision?.plane?.y ?? 0
          u.collisionBounce.value = newValues.collision?.bounce ?? 0.3
          u.collisionFriction.value = newValues.collision?.friction ?? 0.8
          u.collisionDie.value = newValues.collision?.die ? 1 : 0
          u.sizeBasedGravity.value = newValues.collision?.sizeBasedGravity ?? 0
          const needsCollision =
            newValues.collision !== null && newValues.collision !== undefined
          if (needsCollision !== activeCollision) {
            setActiveCollision(needsCollision)
          }
        }

        // Attractors
        if ('attractors' in newValues) {
          const needsAttractors =
            newValues.attractors !== null && newValues.attractors?.length > 0
          if (needsAttractors !== activeAttractors) {
            setActiveAttractors(needsAttractors)
          }
        }

        // Position ref update
        if (newValues.position) {
          positionRef.current = newValues.position
          system.setPosition(newValues.position)
        }

        // Runtime refs update
        if ('delay' in newValues) delayRef.current = newValues.delay ?? 0
        if ('emitCount' in newValues)
          emitCountRef.current = newValues.emitCount ?? 1

        // Update emitting state
        if (newValues.autoStart !== undefined) {
          setEmitting(newValues.autoStart)
        }

        // Update material blending directly
        if (system.material && newValues.blending !== undefined) {
          system.material.blending = newValues.blending
          system.material.needsUpdate = true
        }

        // Remount-required values
        if (
          newValues.maxParticles !== undefined &&
          newValues.maxParticles !== activeMaxParticles
        ) {
          setActiveMaxParticles(newValues.maxParticles)
          system.initialized = false
          system.nextIndex = 0
        }
        if (
          newValues.lighting !== undefined &&
          newValues.lighting !== activeLighting
        ) {
          setActiveLighting(newValues.lighting)
        }
        if (
          newValues.appearance !== undefined &&
          newValues.appearance !== activeAppearance
        ) {
          setActiveAppearance(newValues.appearance)
        }
        if (
          newValues.orientToDirection !== undefined &&
          newValues.orientToDirection !== activeOrientToDirection
        ) {
          setActiveOrientToDirection(newValues.orientToDirection)
        }
        if (
          newValues.shadow !== undefined &&
          newValues.shadow !== activeShadow
        ) {
          setActiveShadow(newValues.shadow)
        }

        // Handle geometry type and args changes
        if ('geometryType' in newValues || 'geometryArgs' in newValues) {
          const geoType = newValues.geometryType ?? prevGeometryTypeRef.current
          const geoArgs = newValues.geometryArgs ?? prevGeometryArgsRef.current
          const geoTypeChanged =
            'geometryType' in newValues &&
            geoType !== prevGeometryTypeRef.current
          const geoArgsChanged =
            'geometryArgs' in newValues &&
            JSON.stringify(geoArgs) !==
              JSON.stringify(prevGeometryArgsRef.current)

          if (geoTypeChanged || geoArgsChanged) {
            prevGeometryTypeRef.current = geoType
            prevGeometryArgsRef.current = geoArgs

            import('debug-vfx').then(({ createGeometry, GeometryType }) => {
              if (geoType === GeometryType.NONE || !geoType) {
                if (activeGeometry !== null && !geometry) {
                  activeGeometry.dispose()
                }
                setActiveGeometry(null)
              } else {
                const newGeometry = createGeometry(geoType, geoArgs)
                if (newGeometry) {
                  if (activeGeometry !== null && activeGeometry !== geometry) {
                    activeGeometry.dispose()
                  }
                  setActiveGeometry(newGeometry)
                }
              }
            })
          }
        }
      },
      [
        system,
        activeMaxParticles,
        activeLighting,
        activeAppearance,
        activeOrientToDirection,
        activeShadow,
        activeGeometry,
        activeNeedsPerParticleColor,
        activeNeedsRotation,
        activeTurbulence,
        activeAttractors,
        activeCollision,
        geometry,
      ]
    )

    // Initialize debug panel once on mount if debug is enabled
    useEffect(() => {
      if (!debug) return

      // Helper to detect geometry type from THREE.js geometry object
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function detectGeometryTypeAndArgs(geo: any) {
        if (!geo) return { geometryType: 'none', geometryArgs: null }

        const name = geo.constructor.name
        const params = geo.parameters || {}

        switch (name) {
          case 'BoxGeometry':
            return {
              geometryType: 'box',
              geometryArgs: {
                width: params.width ?? 1,
                height: params.height ?? 1,
                depth: params.depth ?? 1,
                widthSegments: params.widthSegments ?? 1,
                heightSegments: params.heightSegments ?? 1,
                depthSegments: params.depthSegments ?? 1,
              },
            }
          case 'SphereGeometry':
            return {
              geometryType: 'sphere',
              geometryArgs: {
                radius: params.radius ?? 0.5,
                widthSegments: params.widthSegments ?? 16,
                heightSegments: params.heightSegments ?? 12,
              },
            }
          case 'CylinderGeometry':
            return {
              geometryType: 'cylinder',
              geometryArgs: {
                radiusTop: params.radiusTop ?? 0.5,
                radiusBottom: params.radiusBottom ?? 0.5,
                height: params.height ?? 1,
                radialSegments: params.radialSegments ?? 16,
                heightSegments: params.heightSegments ?? 1,
              },
            }
          case 'ConeGeometry':
            return {
              geometryType: 'cone',
              geometryArgs: {
                radius: params.radius ?? 0.5,
                height: params.height ?? 1,
                radialSegments: params.radialSegments ?? 16,
                heightSegments: params.heightSegments ?? 1,
              },
            }
          case 'TorusGeometry':
            return {
              geometryType: 'torus',
              geometryArgs: {
                radius: params.radius ?? 0.5,
                tube: params.tube ?? 0.2,
                radialSegments: params.radialSegments ?? 12,
                tubularSegments: params.tubularSegments ?? 24,
              },
            }
          case 'PlaneGeometry':
            return {
              geometryType: 'plane',
              geometryArgs: {
                width: params.width ?? 1,
                height: params.height ?? 1,
                widthSegments: params.widthSegments ?? 1,
                heightSegments: params.heightSegments ?? 1,
              },
            }
          case 'CircleGeometry':
            return {
              geometryType: 'circle',
              geometryArgs: {
                radius: params.radius ?? 0.5,
                segments: params.segments ?? 16,
              },
            }
          case 'RingGeometry':
            return {
              geometryType: 'ring',
              geometryArgs: {
                innerRadius: params.innerRadius ?? 0.25,
                outerRadius: params.outerRadius ?? 0.5,
                thetaSegments: params.thetaSegments ?? 16,
              },
            }
          case 'DodecahedronGeometry':
            return {
              geometryType: 'dodecahedron',
              geometryArgs: {
                radius: params.radius ?? 0.5,
                detail: params.detail ?? 0,
              },
            }
          case 'IcosahedronGeometry':
            return {
              geometryType: 'icosahedron',
              geometryArgs: {
                radius: params.radius ?? 0.5,
                detail: params.detail ?? 0,
              },
            }
          case 'OctahedronGeometry':
            return {
              geometryType: 'octahedron',
              geometryArgs: {
                radius: params.radius ?? 0.5,
                detail: params.detail ?? 0,
              },
            }
          case 'TetrahedronGeometry':
            return {
              geometryType: 'tetrahedron',
              geometryArgs: {
                radius: params.radius ?? 0.5,
                detail: params.detail ?? 0,
              },
            }
          case 'CapsuleGeometry':
            return {
              geometryType: 'capsule',
              geometryArgs: {
                radius: params.radius ?? 0.25,
                length: params.length ?? 0.5,
                capSegments: params.capSegments ?? 4,
                radialSegments: params.radialSegments ?? 8,
              },
            }
          default:
            return { geometryType: 'none', geometryArgs: null }
        }
      }

      const initialValues = {
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

      debugValuesRef.current = initialValues
      prevGeometryTypeRef.current = initialValues.geometryType
      prevGeometryArgsRef.current = initialValues.geometryArgs

      import('debug-vfx').then(({ renderDebugPanel }) => {
        renderDebugPanel(initialValues, handleDebugUpdate)
      })

      return () => {
        import('debug-vfx').then(({ destroyDebugPanel }) => {
          destroyDebugPanel()
        })
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debug, geometry])

    // Update debug panel callback when handleDebugUpdate changes
    useEffect(() => {
      if (!debug) return
      import('debug-vfx').then(({ updateDebugPanel }) => {
        if (debugValuesRef.current) {
          updateDebugPanel({ ...debugValuesRef.current }, handleDebugUpdate)
        }
      })
    }, [debug, handleDebugUpdate])

    // @ts-expect-error
    return <primitive ref={spriteRef} object={system.renderObject} />
  }
)
