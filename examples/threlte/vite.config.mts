import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'path'

export default defineConfig({
  plugins: [svelte()],
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
    // Don't try to optimize svelte internals
    exclude: ['svelte'],
  },
  build: {
    target: 'esnext',
  },
  resolve: {
    alias: {
      // Resolve threlte-vfx Svelte components to source during dev
      'threlte-vfx/VFXParticles.svelte': path.resolve(
        __dirname,
        '../../packages/threlte-vfx/src/VFXParticles.svelte'
      ),
      'threlte-vfx/VFXEmitter.svelte': path.resolve(
        __dirname,
        '../../packages/threlte-vfx/src/VFXEmitter.svelte'
      ),
      // Specific three aliases must come BEFORE the generic 'three' alias
      'three/addons': path.resolve(
        __dirname,
        '../../node_modules/three/examples/jsm'
      ),
      'three/tsl': path.resolve(
        __dirname,
        '../../node_modules/three/build/three.tsl.js'
      ),
      'three/webgpu': path.resolve(
        __dirname,
        '../../node_modules/three/build/three.webgpu.js'
      ),
      three: path.resolve(__dirname, '../../node_modules/three'),
    },
  },
})
