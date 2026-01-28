# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

r3f-vfx is a high-performance GPU-accelerated particle system for Three.js WebGPU with React Three Fiber. All particle simulation runs on the GPU using WebGPU compute shaders.

## Commands

```bash
# Development (runs all packages and example concurrently)
bun run dev

# Build all packages
bun run build

# Type checking
bun run typecheck

# Format code
bun run format

# Run just the example app
bun run start  # or: bun run -F r3f-example dev
```

Individual package development:

```bash
bun run -F core-vfx dev       # Core store only
bun run -F r3f-vfx dev        # React Three Fiber package
bun run -F r3f-example dev    # Example app
```

## Architecture

This is a monorepo with Bun workspaces containing:

### Packages (`packages/`)

- **core-vfx**: Framework-agnostic core library containing:
  - `coreStore` - Zustand store for managing particle systems by name
  - Constants and enums (`Appearance`, `Blending`, `EmitterShape`, `Lighting`, etc.)
  - Utility functions (`hexToRgb`, `toRange`, `toRotation3D`, etc.)
  - Curve utilities (`bakeCurveToArray`, `createCombinedCurveTexture`)
  - **Shader factories** (`createInitCompute`, `createSpawnCompute`, `createUpdateCompute`, `createParticleMaterial`) - TSL-based compute shader and material creation

- **r3f-vfx**: Thin React Three Fiber wrapper around core-vfx. Exports:
  - `VFXParticles` - Main particle system component (uses core-vfx shader factories)
  - `VFXEmitter` - Decoupled emitter that links to a named VFXParticles system
  - `useVFXEmitter` - Hook for programmatic emission control
  - `useVFXStore` - React wrapper around coreStore

- **vanilla-vfx, threlte-vfx, tres-vfx**: Placeholder packages for future vanilla JS, Svelte (Threlte), and Vue (TresJS) bindings.

### Examples (`examples/`)

- **r3f**: Vite-based React example app demonstrating the particle system

### Key Architectural Patterns

1. **Named Registration System**: Particle systems register by name in the store, allowing multiple `VFXEmitter` components to share a single `VFXParticles` instance (avoiding extra draw calls).

2. **GPU-First Design**: Particle simulation uses Three.js TSL (Three Shading Language) nodes for WebGPU compute shaders. Import Three.js from `three/webgpu` and TSL from `three/tsl`.

3. **Instanced Rendering**: Uses `instancedArray` from TSL for efficient particle data management.

4. **Shader Factory Pattern**: core-vfx provides factory functions that create TSL compute shaders and materials. Framework wrappers (r3f-vfx, etc.) just call these factories with the appropriate uniforms and storage arrays, keeping framework-specific code minimal.

## Version Management

Uses Changesets for versioning. Create changesets with:

```bash
bunx changeset
bunx changeset version  # apply changesets
```
