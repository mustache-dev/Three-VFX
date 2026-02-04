import { useThrelte } from '@threlte/core'
import { coreStore, isWebGPUBackend } from 'core-vfx'

export function useVFXEmitter(name: string) {
  const { renderer } = useThrelte()

  const checkWebGPU = () => {
    return renderer && isWebGPUBackend(renderer)
  }

  const getParticles = () => coreStore.getState().getParticles(name)

  const emit = (
    position: [number, number, number] = [0, 0, 0],
    count = 20,
    overrides: Record<string, unknown> | null = null
  ) => {
    if (!checkWebGPU()) return false
    const [x, y, z] = position
    return coreStore.getState().emit(name, { x, y, z, count, overrides })
  }

  const burst = (
    position: [number, number, number] = [0, 0, 0],
    count = 50,
    overrides: Record<string, unknown> | null = null
  ) => {
    if (!checkWebGPU()) return false
    const [x, y, z] = position
    return coreStore.getState().emit(name, { x, y, z, count, overrides })
  }

  const start = () => {
    if (!checkWebGPU()) return false
    return coreStore.getState().start(name)
  }

  const stop = () => {
    if (!checkWebGPU()) return false
    return coreStore.getState().stop(name)
  }

  const clear = () => {
    if (!checkWebGPU()) return false
    return coreStore.getState().clear(name)
  }

  const isEmitting = () => {
    if (!checkWebGPU()) return false
    const particles = getParticles()
    return particles?.isEmitting ?? false
  }

  const getUniforms = () => {
    if (!checkWebGPU()) return null
    const particles = getParticles()
    return particles?.uniforms ?? null
  }

  return {
    emit,
    burst,
    start,
    stop,
    clear,
    isEmitting,
    getUniforms,
    getParticles: () => (checkWebGPU() ? getParticles() : null),
  }
}
