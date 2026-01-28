import type * as THREE from 'three/webgpu';
import type { Node, StorageBufferNode } from 'three/webgpu';

// Storage arrays for particle data (uses StorageBufferNode for proper .toAttribute() typing)
export type ParticleStorageArrays = {
  positions: StorageBufferNode;
  velocities: StorageBufferNode;
  lifetimes: StorageBufferNode;
  fadeRates: StorageBufferNode;
  particleSizes: StorageBufferNode;
  particleRotations: StorageBufferNode;
  particleColorStarts: StorageBufferNode;
  particleColorEnds: StorageBufferNode;
};

// All uniforms used by the particle system
// These are TSL uniform nodes created by uniform(), which extend Node
export type ParticleUniforms = Record<string, Node>;

// Material creation options
export type MaterialOptions = {
  alphaMap: THREE.Texture | null;
  flipbook: { rows: number; columns: number } | null;
  appearance: string;
  lighting: string;
  softParticles: boolean;
  geometry: THREE.BufferGeometry | null;
  orientToDirection: boolean;
  shadow: boolean;
  blending: THREE.Blending;
  // Custom nodes
  opacityNode: Node | ((data: Record<string, Node>) => Node) | null;
  colorNode: Node | ((data: Record<string, Node>, defaultColor: Node) => Node) | null;
  backdropNode: Node | ((data: Record<string, Node>) => Node) | null;
  alphaTestNode: Node | ((data: Record<string, Node>) => Node) | null;
  castShadowNode: Node | ((data: Record<string, Node>) => Node) | null;
};
