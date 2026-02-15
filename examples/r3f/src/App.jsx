import * as THREE from 'three/webgpu'
import { Canvas, useLoader } from '@react-three/fiber'
import SceneLight from './SceneLight'
import { Suspense } from 'react'
import { KeyboardControls, Loader } from '@react-three/drei'
import { WebGPUPostProcessing } from './WebGPUPostprocessing'
import { Floor } from './Floor'
import Player from './Player'
import { Boom } from './Boom'
import { VFXParticles } from 'r3f-vfx'
import {
  fract,
  mix,
  mul,
  sin,
  texture,
  time,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'

function FallbackSprite() {
  const texture = useLoader(THREE.TextureLoader, './fallback.png')
  return (
    <sprite scale={[3, 3, 1]}>
      <spriteMaterial map={texture} />
    </sprite>
  )
}

const keyboardMap = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
  { name: 'attack', keys: ['KeyE'] },
]

export default function App() {
  const tex = useLoader(THREE.TextureLoader, './trail.png')
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return (
    <>
      <Canvas shadows renderer={{ forceWebGL: false }}>
        <Suspense fallback={null}>
          <SceneLight />
          <WebGPUPostProcessing />
          <Floor />
          <KeyboardControls map={keyboardMap}>
            <Player />
          </KeyboardControls>
          {/* <Boom />*/}
          <VFXParticles
            emitCount={100}
            delay={1}
            intensity={9.8}
            colorStart={['#ff6600']}
            gravity={[0, -20, 0]}
            speed={[1, 4]}
            lifetime={[3.3, 4.7]}
            appearance="gradient"
            lighting="standard"
            emitterShape={1}
            collision={{
              plane: {
                y: -1,
              },
              bounce: 0.6,
              friction: 0.8,
              die: false,
              sizeBasedGravity: 0,
            }}
            trail={{
              segments: 32,
              width: 0.1,
              taper: true,
              opacity: 1,
              mode: 'history',
              length: 0.5,
              showParticles: false,
            }}
          />

          {/* <group position={[5, 0, 0]}>
            <VFXParticles debug fallback={<FallbackSprite />} />
          </group>*/}
        </Suspense>
      </Canvas>

      <Loader />
    </>
  )
}
