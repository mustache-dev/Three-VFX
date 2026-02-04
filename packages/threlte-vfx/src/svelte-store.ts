import { coreStore, type CoreState } from 'core-vfx'
import type { Readable } from 'svelte/store'

export function useVFXStore(): Readable<CoreState>
export function useVFXStore<T>(selector: (state: CoreState) => T): Readable<T>
export function useVFXStore<T>(
  selector?: (state: CoreState) => T
): Readable<T> {
  const pick = selector ?? ((s: CoreState) => s as unknown as T)

  return {
    subscribe(run: (value: T) => void) {
      // Svelte store contract: call immediately with current value
      run(pick(coreStore.getState()))

      // Subscribe to future changes
      const unsubscribe = coreStore.subscribe((state) => {
        run(pick(state))
      })

      return unsubscribe
    },
  }
}

// Attach static methods for imperative usage
useVFXStore.getState = coreStore.getState
useVFXStore.setState = coreStore.setState
useVFXStore.subscribe = coreStore.subscribe
