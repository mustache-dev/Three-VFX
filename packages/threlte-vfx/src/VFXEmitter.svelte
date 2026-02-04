<script lang="ts">
import { T, useThrelte, useTask } from '@threlte/core'
import { onMount } from 'svelte'
import { Vector3, Quaternion, Group } from 'three/webgpu'
import {
  EmitterController,
  coreStore,
  type EmitterControllerOptions,
} from 'core-vfx'

// Reusable temp objects for transforms (avoid allocations in render loop)
const worldPos = new Vector3()
const worldQuat = new Quaternion()

let {
  name = undefined,
  particlesRef = undefined,
  position = [0, 0, 0],
  emitCount = 10,
  delay = 0,
  autoStart = true,
  loop = true,
  localDirection = false,
  direction = undefined,
  overrides = null,
  onEmit = undefined,
  children,
}: {
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
  children?: import('svelte').Snippet
} = $props()

const { renderer } = useThrelte()

let groupRef: Group | null = $state(null)

const controller = new EmitterController({
  emitCount,
  delay,
  autoStart,
  loop,
  localDirection,
  direction,
  overrides,
  onEmit,
})

function getParticleSystem() {
  if (particlesRef) {
    return particlesRef.value || particlesRef
  }
  return name ? coreStore.getState().getParticles(name) : undefined
}

// Watch option changes
$effect(() => {
  const _deps = [
    emitCount,
    delay,
    autoStart,
    loop,
    localDirection,
    direction,
    overrides,
    onEmit,
  ]

  controller.updateOptions({
    emitCount,
    delay,
    autoStart,
    loop,
    localDirection,
    direction,
    overrides,
    onEmit,
  })
})

onMount(() => {
  const system = getParticleSystem()
  if (system) controller.setSystem(system)
})

// Frame loop
useTask((delta) => {
  if (!controller.getSystem()) {
    const system = getParticleSystem()
    if (system) controller.setSystem(system)
  }

  if (!groupRef) return

  groupRef.getWorldPosition(worldPos)
  groupRef.getWorldQuaternion(worldQuat)
  controller.update(delta, worldPos, worldQuat)
})

// Exposed API
export function emit(emitOverrides: Record<string, unknown> | null = null) {
  if (!groupRef) return false

  if (!controller.getSystem()) {
    const system = getParticleSystem()
    if (system) controller.setSystem(system)
  }

  if (!controller.getSystem()) {
    if (name) {
      console.warn(
        `VFXEmitter: No particle system found for name "${name}"`
      )
    }
    return false
  }

  groupRef.getWorldPosition(worldPos)
  groupRef.getWorldQuaternion(worldQuat)
  return controller.emitAtPosition(worldPos, worldQuat, emitOverrides)
}

export function burst(count: number) {
  if (!groupRef) return false

  if (!controller.getSystem()) {
    const system = getParticleSystem()
    if (system) controller.setSystem(system)
  }

  if (!controller.getSystem()) return false

  groupRef.getWorldPosition(worldPos)
  groupRef.getWorldQuaternion(worldQuat)
  return controller.burst(count, worldPos, worldQuat)
}

export function start() {
  controller.start()
}

export function stop() {
  controller.stop()
}
</script>

<T.Group bind:ref={groupRef} position={position}>
  {#if children}
    {@render children()}
  {/if}
</T.Group>
