import { SvelteComponent } from 'svelte'
import type {
  VFXParticleSystemOptions,
  TurbulenceConfig,
  AttractorConfig,
  CollisionConfig,
  FrictionConfig,
  FlipbookConfig,
  StretchConfig,
  Rotation3DInput,
} from 'core-vfx'
import type { Texture, BufferGeometry } from 'three'

export interface VFXParticlesProps {
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
  alphaMap?: Texture | null
  flipbook?: FlipbookConfig | null
  rotation?: Rotation3DInput
  rotationSpeed?: Rotation3DInput
  rotationSpeedCurve?: unknown[] | null
  geometry?: BufferGeometry | null
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
}

export default class VFXParticles extends SvelteComponent<VFXParticlesProps> {
  spawn(
    x?: number,
    y?: number,
    z?: number,
    count?: number,
    overrides?: Record<string, unknown> | null
  ): void
  start(): void
  stop(): void
  clear(): void
}
