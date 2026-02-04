import { SvelteComponent, type Snippet } from 'svelte'
import type { EmitterControllerOptions } from 'core-vfx'

export interface VFXEmitterProps {
  name?: string
  particlesRef?: any
  position?: [number, number, number]
  emitCount?: number
  delay?: number
  autoStart?: boolean
  loop?: boolean
  localDirection?: boolean
  direction?: EmitterControllerOptions['direction']
  overrides?: Record<string, unknown> | null
  onEmit?: EmitterControllerOptions['onEmit']
  children?: Snippet
}

export default class VFXEmitter extends SvelteComponent<VFXEmitterProps> {
  emit(emitOverrides?: Record<string, unknown> | null): boolean
  burst(count: number): boolean
  start(): void
  stop(): void
}
