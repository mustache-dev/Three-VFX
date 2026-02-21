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
export {
  createSortInitCompute,
  createDistanceCompute,
  createSortStepCompute,
  createGatherCompute,
  createCopyCompute,
} from './sort'

// Trail shader factories
export {
  createTrailHistoryCompute,
  createTrailHistoryPositionNode,
} from './trail'

// Material factory
export { createParticleMaterial } from './material'
