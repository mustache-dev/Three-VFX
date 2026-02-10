// Types
export type {
  ParticleStorageArrays,
  ParticleUniforms,
  MaterialOptions,
  ShaderFeatures,
} from './types'

// Helper functions
export { selectColor } from './helpers'

// Compute shader factories
export { createInitCompute } from './init'
export { createSpawnCompute } from './spawn'
export { createUpdateCompute } from './update'

// Trail shader factories
export {
  createTrailProceduralPositionNode,
  createTrailHistoryCompute,
  createTrailHistoryPositionNode,
} from './trail'

// Material factory
export { createParticleMaterial } from './material'
