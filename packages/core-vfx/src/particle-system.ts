import * as THREE from 'three/webgpu'
import { instancedArray, uniform } from 'three/tsl'
import type {
  VFXParticleSystemOptions,
  NormalizedParticleProps,
  BaseParticleProps,
} from './types'
import type {
  ParticleStorageArrays,
  ParticleUniforms,
  ShaderFeatures,
} from './shaders/types'
import { normalizeProps } from './utils'
import { createUniforms, updateUniforms, applySpawnOverrides } from './uniforms'
import {
  resolveFeatures,
  createStorageArrays,
  createRenderObject,
} from './storage'
import {
  createInitCompute,
  createSpawnCompute,
  createUpdateCompute,
  createSortInitCompute,
  createDistanceCompute,
  createSortStepCompute,
  createParticleMaterial,
  createTrailHistoryCompute,
  createTrailHistoryPositionNode,
} from './shaders'
import {
  createCombinedCurveTexture,
  createDefaultCurveTexture,
  loadCurveTextureFromPath,
  CurveChannel,
} from './curves'
import { isWebGPUBackend } from './utils'
import {
  cpuInit,
  cpuSpawn,
  cpuUpdate,
  extractCPUArrays,
  markAllDirty,
  markUpdateDirty,
  type CPUStorageArrays,
} from './webgl-fallback'
import {
  cpuRadixSortParticles,
  createSortScratch,
  type SortScratch,
} from './cpu-sort'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UniformAccessor = Record<string, { value: any }>

export class VFXParticleSystem {
  // GPU resources (public, read-only)
  readonly uniforms: ParticleUniforms
  readonly storage: ParticleStorageArrays
  readonly features: ShaderFeatures
  renderObject: THREE.Sprite | THREE.InstancedMesh
  material: THREE.Material
  curveTexture: THREE.DataTexture
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  computeInit: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  computeSpawn: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  computeUpdate: any
  readonly options: VFXParticleSystemOptions
  readonly normalizedProps: NormalizedParticleProps

  // Trail state
  trailRenderObject: THREE.Object3D | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private computeTrailHistory: any = null
  private trailHeadValue = 0
  private trailSegments = 0

  // Internal state
  private renderer: THREE.WebGPURenderer
  nextIndex = 0
  initialized = false
  isEmitting: boolean
  private emitAccumulator = 0
  private turbulenceSpeed: number
  position: [number, number, number]
  private isWebGL: boolean
  private cpuArrays: CPUStorageArrays | null = null

  // Sort state
  private sortEnabled: boolean
  private gpuSortEnabled: boolean = false
  private sortScratch: SortScratch | null = null
  private cameraPosition: [number, number, number] = [0, 0, 0]
  private sortIndices: ReturnType<typeof instancedArray> | null = null
  private sortDistances: ReturnType<typeof instancedArray> | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private computeSortInit: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private computeSortDistance: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private computeSortStep: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sortCameraPosUniform: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sortBlockSizeUniform: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sortSubBlockSizeUniform: any = null
  private sortPasses: Array<{ blockSize: number; subBlockSize: number }> = []
  private gpuSortFrameInterval = 1
  private gpuSortFrameCounter = 0
  private gpuSortUrgentFrames = 0
  // True when using CPU simulation (WebGL backend only)
  private useCPUSimulation: boolean = false
  private pendingUpdateDelta = 0
  private updateInFlight: Promise<void> | null = null

  constructor(
    renderer: THREE.WebGPURenderer,
    options: VFXParticleSystemOptions
  ) {
    this.renderer = renderer
    this.options = options

    // Normalize props
    this.normalizedProps = normalizeProps(options)

    // Apply depthTest and renderOrder overrides
    if (options.depthTest !== undefined) {
      this.normalizedProps.depthTest = options.depthTest
    }
    if (options.renderOrder !== undefined) {
      this.normalizedProps.renderOrder = options.renderOrder
    }

    const np = this.normalizedProps

    // Resolve features
    this.features = resolveFeatures(options)

    // Create uniforms
    this.uniforms = createUniforms(np)

    // Trail config
    this.trailSegments = options.trail?.segments ?? 32

    // Create storage arrays
    this.storage = createStorageArrays(
      np.maxParticles,
      this.features,
      this.trailSegments
    )

    // Handle curve texture synchronously (bake inline curves or use defaults)
    if (
      options.fadeSizeCurve ||
      options.fadeOpacityCurve ||
      options.velocityCurve ||
      options.rotationSpeedCurve
    ) {
      this.curveTexture = createCombinedCurveTexture(
        options.fadeSizeCurve ?? null,
        options.fadeOpacityCurve ?? null,
        options.velocityCurve ?? null,
        options.rotationSpeedCurve ?? null
      )
    } else {
      this.curveTexture = createDefaultCurveTexture()
    }

    // Set curve enabled flags from inline curve data
    const u = this.uniforms as unknown as UniformAccessor
    u.fadeSizeCurveEnabled.value = options.fadeSizeCurve ? 1 : 0
    u.fadeOpacityCurveEnabled.value = options.fadeOpacityCurve ? 1 : 0
    u.velocityCurveEnabled.value = options.velocityCurve ? 1 : 0
    u.rotationSpeedCurveEnabled.value = options.rotationSpeedCurve ? 1 : 0

    // Detect backend
    this.isWebGL = !isWebGPUBackend(renderer)

    // Sort setup
    this.sortEnabled = options.sortParticles ?? false
    if (this.sortEnabled) {
      this.storage.particleSeeds = instancedArray(np.maxParticles, 'float')
      // GPU sort currently relies on storage reads in material vertex path,
      // which is stable in instanced-geometry mode.
      this.gpuSortEnabled = !this.isWebGL && !!np.geometry
      if (!this.gpuSortEnabled) {
        this.sortScratch = createSortScratch(np.maxParticles)
      } else {
        this.sortIndices = instancedArray(np.maxParticles, 'float')
        this.sortDistances = instancedArray(np.maxParticles, 'float')
        this.sortCameraPosUniform = uniform(new THREE.Vector3())
        this.sortBlockSizeUniform = uniform(2)
        this.sortSubBlockSizeUniform = uniform(2)
        this.computeSortInit = createSortInitCompute(
          this.sortIndices,
          np.maxParticles
        )
        this.computeSortDistance = createDistanceCompute(
          this.storage,
          this.sortCameraPosUniform,
          this.sortDistances,
          np.maxParticles
        )
        this.computeSortStep = createSortStepCompute(
          this.sortIndices,
          this.sortDistances,
          this.sortBlockSizeUniform,
          this.sortSubBlockSizeUniform,
          np.maxParticles
        )
        this.sortPasses = this.buildSortPasses(np.maxParticles)
        this.gpuSortFrameInterval = this.resolveGpuSortInterval(np.maxParticles)
        if (options.sortFrameInterval !== undefined) {
          this.setSortFrameInterval(options.sortFrameInterval)
        }
      }
    }

    // CPU simulation when:
    // - WebGL backend
    // - sort is enabled but GPU sort path is unavailable
    this.useCPUSimulation =
      this.isWebGL || (this.sortEnabled && !this.gpuSortEnabled)
    const useCPUSimulation = this.useCPUSimulation

    if (useCPUSimulation) {
      // CPU path: extract typed arrays, skip compute shader creation
      this.cpuArrays = extractCPUArrays(
        this.storage,
        this.normalizedProps.maxParticles
      )
      this.computeInit = null
      this.computeSpawn = null
      this.computeUpdate = null

      // On WebGPU with CPU simulation, set DynamicDrawUsage so the renderer
      // re-uploads buffer data every frame without relying on version checks
      if (!this.isWebGL) {
        this.setStorageDynamicUsage()
      }
    } else {
      // Create compute shaders (WebGPU path)
      this.computeInit = createInitCompute(this.storage, np.maxParticles)
      this.computeSpawn = createSpawnCompute(
        this.storage,
        this.uniforms,
        np.maxParticles
      )
      this.computeUpdate = createUpdateCompute(
        this.storage,
        this.uniforms,
        this.curveTexture,
        np.maxParticles,
        {
          turbulence: this.features.turbulence,
          attractors: this.features.attractors,
          collision: this.features.collision,
          rotation: this.features.rotation,
          perParticleColor: this.features.perParticleColor,
        }
      )
    }

    // Create material
    this.material = createParticleMaterial(
      this.storage,
      this.uniforms,
      this.curveTexture,
      {
        alphaMap: np.alphaMap,
        flipbook: np.flipbook,
        appearance: np.appearance,
        lighting: np.lighting,
        lightingParams: np.lightingParams,
        softParticles: np.softParticles,
        geometry: np.geometry,
        orientToDirection: np.orientToDirection,
        shadow: np.shadow,
        blending: np.blending,
        side: np.side,
        geometryNode: options.geometryNode ?? null,
        opacityNode: options.opacityNode ?? null,
        colorNode: options.colorNode ?? null,
        backdropNode: options.backdropNode ?? null,
        alphaTestNode: options.alphaTestNode ?? null,
        castShadowNode: options.castShadowNode ?? null,
        renderOrderIndices: this.gpuSortEnabled ? this.sortIndices : null,
      }
    )

    // Create render object
    this.renderObject = createRenderObject(
      np.geometry,
      this.material,
      np.maxParticles,
      np.shadow
    )

    // Internal state
    this.isEmitting = np.autoStart
    this.turbulenceSpeed = np.turbulence?.speed ?? 1
    this.position = [...np.position]
  }

  async init(): Promise<void> {
    if (this.initialized) return

    // Reset trail ring pointer on (re)init so history starts from a known state.
    this.trailHeadValue = 0
    ;(this.uniforms as unknown as UniformAccessor).trailHead.value = 0

    if (this.useCPUSimulation) {
      const cpu = this.ensureCPUArrays()
      cpuInit(cpu, this.normalizedProps.maxParticles)
      markAllDirty(this.storage)
    } else {
      const renderer = this.renderer as unknown as {
        computeAsync: (c: unknown) => Promise<void>
      }
      await renderer.computeAsync(this.computeInit)
      if (this.gpuSortEnabled && this.computeSortInit) {
        await renderer.computeAsync(this.computeSortInit)
      }
    }
    this.gpuSortFrameCounter = 0
    this.gpuSortUrgentFrames = 0

    // If curveTexturePath is set, load async and update texture in-place
    if (this.options.curveTexturePath) {
      try {
        const result = await loadCurveTextureFromPath(
          this.options.curveTexturePath
        )
        // Copy loaded RGBA data into existing texture in-place
        const src = result.texture.image.data as Float32Array
        const dst = this.curveTexture.image.data as Float32Array
        dst.set(src)
        this.curveTexture.needsUpdate = true
        result.texture.dispose()

        // Update curve-enabled uniforms from loaded channel bitmask
        const u = this.uniforms as unknown as UniformAccessor
        u.fadeSizeCurveEnabled.value =
          result.activeChannels & CurveChannel.SIZE ? 1 : 0
        u.fadeOpacityCurveEnabled.value =
          result.activeChannels & CurveChannel.OPACITY ? 1 : 0
        u.velocityCurveEnabled.value =
          result.activeChannels & CurveChannel.VELOCITY ? 1 : 0
        u.rotationSpeedCurveEnabled.value =
          result.activeChannels & CurveChannel.ROTATION_SPEED ? 1 : 0
      } catch (err) {
        console.warn(
          `Failed to load curve texture: ${this.options.curveTexturePath}, using baked/default`,
          err
        )
        // Keep the synchronously created texture (baked or default)
      }
    }

    // Initialize trail MeshLine if trails are enabled (WebGPU only)
    if (this.features.trails && !this.isWebGL) {
      try {
        const { MeshLine } = await import('makio-meshline')
        const { Fn, float, instanceIndex } = await import('three/tsl')

        const trail = this.options.trail!
        const segments = this.trailSegments
        const maxParticles = this.normalizedProps.maxParticles

        // Trails are history-based only.
        this.computeTrailHistory = createTrailHistoryCompute(
          this.storage,
          this.uniforms,
          maxParticles,
          segments
        )
        const positionNode = createTrailHistoryPositionNode(
          this.storage,
          this.uniforms,
          segments
        )

        // Width function: taper trail from head to tail
        const taper = trail.taper !== false
        const widthFn = taper
          ? Fn(([width]: [any]) => {
              const lifetime = this.storage.lifetimes.element(instanceIndex)
              // Hide dead particles by setting width to 0
              return lifetime.greaterThan(0).select(
                width
                  .mul(
                    float(1)
                      .sub(
                        width.div(width)
                        // width comes in as the interpolated width value
                        // We use the built-in progress for tapering
                      )
                      .add(float(1))
                  )
                  .mul(float(0.5)),
                float(0)
              )
            })
          : undefined

        // Color function: replicate particle material color logic
        const { mix } = await import('three/tsl')
        const colorFn = Fn(([color, trailProgress]: [any, any]) => {
          const lifetime = this.storage.lifetimes.element(instanceIndex)

          // Compute particle lifetime progress (same as material.ts)
          const lifeProgress = float(1).sub(lifetime)

          // Resolve particle color: mix(colorStart, colorEnd, lifeProgress)
          const pColorStart =
            this.storage.particleColorStarts?.element(instanceIndex)
          const pColorEnd =
            this.storage.particleColorEnds?.element(instanceIndex)

          const particleColor =
            pColorStart && pColorEnd
              ? mix(pColorStart, pColorEnd, lifeProgress)
              : mix(
                  this.uniforms.colorStart0,
                  this.uniforms.colorEnd0 ?? this.uniforms.colorStart0,
                  lifeProgress
                )

          // Apply intensity
          const intensified = particleColor.mul(this.uniforms.intensity)

          // Fade along trail (head=1, tail=0) and hide dead particles
          const fade = float(1)
            .sub(trailProgress)
            .mul(lifetime.greaterThan(0).select(float(1), float(0)))

          return intensified.mul(fade)
        })

        // Fragment color function: wraps user callback with particle data
        let fragmentColorFnWrapped
        if (trail.fragmentColorFn) {
          const userFragFn = trail.fragmentColorFn
          fragmentColorFnWrapped = Fn(
            ([color, uvCoords, vProgress, side]: [any, any, any, any]) => {
              const lifetime2 = this.storage.lifetimes.element(instanceIndex)
              const lifeProgress2 = float(1).sub(lifetime2)
              const pColorStart2 =
                this.storage.particleColorStarts?.element(instanceIndex)
              const pColorEnd2 =
                this.storage.particleColorEnds?.element(instanceIndex)
              const pColor =
                pColorStart2 && pColorEnd2
                  ? mix(pColorStart2, pColorEnd2, lifeProgress2)
                  : mix(
                      this.uniforms.colorStart0,
                      this.uniforms.colorEnd0 ?? this.uniforms.colorStart0,
                      lifeProgress2
                    )
              const intensified2 = pColor.mul(this.uniforms.intensity)

              return userFragFn({
                color,
                uv: uvCoords,
                trailProgress: vProgress,
                side,
                progress: lifeProgress2,
                lifetime: lifetime2,
                position: this.storage.positions.element(instanceIndex),
                velocity: this.storage.velocities.element(instanceIndex),
                size: this.storage.particleSizes.element(instanceIndex),
                ...(pColorStart2 && { colorStart: pColorStart2 }),
                ...(pColorEnd2 && { colorEnd: pColorEnd2 }),
                particleColor: pColor,
                intensifiedColor: intensified2,
                index: instanceIndex,
              })
            }
          )
        }

        // Build MeshLine
        const line = new MeshLine()
          .segments(segments)
          .gpuPositionNode(positionNode)
          .colorFn(colorFn)
          .instances(maxParticles)
          .lineWidth(trail.width ?? 0.1)
          .sizeAttenuation(true)
          .opacity(trail.opacity ?? 1)
          .transparent(true)

        if (fragmentColorFnWrapped) {
          line.fragmentColorFn(fragmentColorFnWrapped)
          line.needsUV(true)
        }

        if (taper) {
          line.widthCallback((t: number) => 1 - t)
        }

        // @ts-ignore - MeshLine types declare frustumCulled as method, but build() expects the property
        line.frustumCulled = false
        line.build()

        const mat = line.material as THREE.Material
        mat.blending = THREE.AdditiveBlending
        mat.depthWrite = false

        this.trailRenderObject = line as unknown as THREE.Object3D
      } catch (err) {
        if (
          err instanceof Error &&
          (err.message.includes('Failed to fetch') ||
            err.message.includes('Cannot find') ||
            err.message.includes('Failed to resolve') ||
            err.message.includes('Module not found'))
        ) {
          console.warn(
            'makio-meshline not found. Install it to enable trail rendering: bun add makio-meshline'
          )
        } else {
          console.error('Trail initialization failed:', err)
        }
      }
    }

    this.initialized = true
  }

  dispose(): void {
    if (this.material) {
      this.material.dispose()
    }
    if (this.renderObject) {
      if (this.renderObject.geometry && !this.normalizedProps.geometry) {
        this.renderObject.geometry.dispose()
      }
    }
    if (this.trailRenderObject) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trail = this.trailRenderObject as any
      if (trail.dispose) trail.dispose()
      this.trailRenderObject = null
    }
    this.computeTrailHistory = null
    this.initialized = false
    this.nextIndex = 0
  }

  spawn(
    x: number,
    y: number,
    z: number,
    count = 20,
    overrides: Record<string, unknown> | null = null
  ): void {
    if (!this.initialized || !this.renderer) return

    const restore = applySpawnOverrides(this.uniforms, overrides)

    const u = this.uniforms as unknown as UniformAccessor

    const startIdx = this.nextIndex
    const endIdx = (startIdx + count) % this.normalizedProps.maxParticles

    u.spawnPosition.value.set(x, y, z)
    u.spawnIndexStart.value = startIdx
    u.spawnIndexEnd.value = endIdx
    u.spawnSeed.value = Math.random() * 10000

    this.nextIndex = endIdx

    if (this.useCPUSimulation) {
      const cpu = this.ensureCPUArrays()
      cpuSpawn(cpu, this.uniforms, this.normalizedProps.maxParticles)
      markAllDirty(this.storage)
    } else {
      ;(
        this.renderer as unknown as {
          computeAsync: (c: unknown) => Promise<void>
        }
      ).computeAsync(this.computeSpawn)
    }
    if (this.sortEnabled && this.gpuSortEnabled) {
      this.gpuSortUrgentFrames = Math.max(this.gpuSortUrgentFrames, 2)
    }

    if (restore) restore()
  }

  async update(delta: number): Promise<void> {
    if (!this.initialized || !this.renderer) return

    this.pendingUpdateDelta += delta
    if (this.updateInFlight) return this.updateInFlight

    this.updateInFlight = (async () => {
      while (this.pendingUpdateDelta > 0) {
        const mergedDelta = this.pendingUpdateDelta
        this.pendingUpdateDelta = 0
        await this.runUpdate(mergedDelta)
      }
    })().finally(() => {
      this.updateInFlight = null
    })

    return this.updateInFlight
  }

  private async runUpdate(delta: number): Promise<void> {
    if (!this.initialized || !this.renderer) return

    const u = this.uniforms as unknown as UniformAccessor
    u.deltaTime.value = delta
    u.turbulenceTime.value += delta * this.turbulenceSpeed

    if (this.useCPUSimulation) {
      const cpu = this.ensureCPUArrays()
      cpuUpdate(
        cpu,
        this.uniforms,
        this.curveTexture,
        this.normalizedProps.maxParticles,
        {
          turbulence: this.features.turbulence,
          attractors: this.features.attractors,
          collision: this.features.collision,
          rotation: this.features.rotation,
        }
      )

      // CPU depth sort (CPU arrays are in sync since we use CPU simulation)
      if (this.sortEnabled) {
        if (!this.sortScratch) {
          this.sortScratch = createSortScratch(
            this.normalizedProps.maxParticles
          )
        }
        cpuRadixSortParticles(
          this.storage,
          this.cameraPosition,
          this.normalizedProps.maxParticles,
          this.sortScratch
        )
        // After sort reorders, mark all buffers dirty for GPU upload
        markAllDirty(this.storage)
      } else {
        markUpdateDirty(this.storage, this.features.rotation)
      }
    } else {
      const renderer = this.renderer as unknown as {
        computeAsync: (c: unknown) => Promise<void>
      }
      await renderer.computeAsync(this.computeUpdate)

      if (this.sortEnabled && this.gpuSortEnabled && this.computeSortDistance) {
        const shouldSortThisFrame =
          this.gpuSortUrgentFrames > 0 ||
          this.gpuSortFrameCounter % this.gpuSortFrameInterval === 0

        this.gpuSortFrameCounter++
        if (shouldSortThisFrame) {
          this.sortCameraPosUniform.value.set(
            this.cameraPosition[0],
            this.cameraPosition[1],
            this.cameraPosition[2]
          )
          await renderer.computeAsync(this.computeSortDistance)

          for (const pass of this.sortPasses) {
            this.sortBlockSizeUniform.value = pass.blockSize
            this.sortSubBlockSizeUniform.value = pass.subBlockSize
            await renderer.computeAsync(this.computeSortStep)
          }
        }
        if (this.gpuSortUrgentFrames > 0) {
          this.gpuSortUrgentFrames--
        }
      }

      // Trail history mode: write current positions to ring buffer
      if (this.computeTrailHistory) {
        await renderer.computeAsync(this.computeTrailHistory)

        // Advance ring buffer head pointer
        this.trailHeadValue = (this.trailHeadValue + 1) % this.trailSegments
        u.trailHead.value = this.trailHeadValue
      }
    }
  }

  autoEmit(delta: number): void {
    if (!this.isEmitting) return

    const [px, py, pz] = this.position
    const currentDelay = this.normalizedProps.delay
    const currentEmitCount = this.normalizedProps.emitCount

    if (!currentDelay) {
      this.spawn(px, py, pz, currentEmitCount)
    } else {
      this.emitAccumulator += delta

      if (this.emitAccumulator >= currentDelay) {
        this.emitAccumulator -= currentDelay
        this.spawn(px, py, pz, currentEmitCount)
      }
    }
  }

  start(): void {
    this.isEmitting = true
    this.emitAccumulator = 0
  }

  stop(): void {
    this.isEmitting = false
  }

  clear(): void {
    // Reset trail ring pointer when clearing particles.
    this.trailHeadValue = 0
    ;(this.uniforms as unknown as UniformAccessor).trailHead.value = 0

    if (this.useCPUSimulation) {
      const cpu = this.ensureCPUArrays()
      cpuInit(cpu, this.normalizedProps.maxParticles)
      markAllDirty(this.storage)
    } else {
      const renderer = this.renderer as unknown as {
        computeAsync: (c: unknown) => Promise<void>
      }
      renderer.computeAsync(this.computeInit)
      if (this.gpuSortEnabled && this.computeSortInit) {
        renderer.computeAsync(this.computeSortInit)
      }
    }
    this.pendingUpdateDelta = 0
    this.gpuSortFrameCounter = 0
    this.gpuSortUrgentFrames = 0
    this.nextIndex = 0
  }

  updateProps(props: Partial<BaseParticleProps>): void {
    const np = normalizeProps({ ...this.options, ...props })
    updateUniforms(this.uniforms, np)
  }

  setPosition(position: [number, number, number]): void {
    this.position = [...position]
  }

  setDelay(delay: number): void {
    this.normalizedProps.delay = delay
  }

  setEmitCount(emitCount: number): void {
    this.normalizedProps.emitCount = emitCount
  }

  setTurbulenceSpeed(speed: number): void {
    this.turbulenceSpeed = speed
  }

  setSortEnabled(enabled: boolean): void {
    // Note: sort must be enabled at construction time via sortParticles option.
    if (enabled && !this.sortEnabled) {
      console.warn(
        'VFXParticleSystem: sortParticles must be enabled at construction time. ' +
          'Use the sortParticles option in the constructor.'
      )
      return
    }
    this.sortEnabled = enabled
  }

  setSortFrameInterval(interval: number | null | undefined): void {
    if (!this.gpuSortEnabled) return
    if (interval === null || interval === undefined || interval <= 0) {
      this.gpuSortFrameInterval = this.resolveGpuSortInterval(
        this.normalizedProps.maxParticles
      )
      return
    }
    this.gpuSortFrameInterval = Math.max(1, Math.floor(interval))
  }

  setCameraPosition(pos: [number, number, number]): void {
    this.cameraPosition[0] = pos[0]
    this.cameraPosition[1] = pos[1]
    this.cameraPosition[2] = pos[2]
  }

  setCurveTexture(texture: THREE.DataTexture): void {
    this.curveTexture = texture
  }

  private ensureCPUArrays(): CPUStorageArrays {
    if (!this.cpuArrays || this.haveCPUStorageRefsChanged()) {
      this.cpuArrays = extractCPUArrays(
        this.storage,
        this.normalizedProps.maxParticles
      )
    }
    return this.cpuArrays
  }

  private haveCPUStorageRefsChanged(): boolean {
    if (!this.cpuArrays) return true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arrOf = (node: any): Float32Array | null =>
      (node?.value?.array as Float32Array) ?? null

    const currentPositions = arrOf(this.storage.positions)
    const currentVelocities = arrOf(this.storage.velocities)
    const currentLifetimes = arrOf(this.storage.lifetimes)
    const currentFadeRates = arrOf(this.storage.fadeRates)
    const currentSizes = arrOf(this.storage.particleSizes)

    if (
      currentPositions !== this.cpuArrays.positions ||
      currentVelocities !== this.cpuArrays.velocities ||
      currentLifetimes !== this.cpuArrays.lifetimes ||
      currentFadeRates !== this.cpuArrays.fadeRates ||
      currentSizes !== this.cpuArrays.particleSizes
    ) {
      return true
    }

    return false
  }

  private resolveGpuSortInterval(maxParticles: number): number {
    if (maxParticles >= 200000) return 4
    if (maxParticles >= 100000) return 3
    if (maxParticles >= 50000) return 2
    return 1
  }

  private buildSortPasses(
    count: number
  ): Array<{ blockSize: number; subBlockSize: number }> {
    const passes: Array<{ blockSize: number; subBlockSize: number }> = []
    let sortExtent = 1
    while (sortExtent < count) sortExtent <<= 1

    for (let blockSize = 2; blockSize <= sortExtent; blockSize <<= 1) {
      for (let subBlockSize = blockSize; subBlockSize > 1; subBlockSize >>= 1) {
        passes.push({ blockSize, subBlockSize })
      }
    }
    return passes
  }

  /**
   * Set DynamicDrawUsage on all storage buffers so the WebGPU renderer
   * re-uploads CPU-side array data every frame.
   */
  private setStorageDynamicUsage(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setUsage = (node: any) => {
      if (node?.value) node.value.usage = THREE.DynamicDrawUsage
    }
    setUsage(this.storage.positions)
    setUsage(this.storage.velocities)
    setUsage(this.storage.lifetimes)
    setUsage(this.storage.fadeRates)
    setUsage(this.storage.particleSizes)
    if (this.storage.particleSeeds) setUsage(this.storage.particleSeeds)
    if (this.storage.particleRotations) setUsage(this.storage.particleRotations)
    if (this.storage.particleColorStarts)
      setUsage(this.storage.particleColorStarts)
    if (this.storage.particleColorEnds) setUsage(this.storage.particleColorEnds)
    if (this.storage.trailHistory) setUsage(this.storage.trailHistory)
  }
}
