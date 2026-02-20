import * as THREE from 'three/webgpu'
import { Canvas, useLoader } from '@react-three/fiber'
import SceneLight from './SceneLight'
import { Suspense, useMemo } from 'react'
import { KeyboardControls, Loader } from '@react-three/drei'
import { WebGPUPostProcessing } from './WebGPUPostprocessing'
import { Floor } from './Floor'
import Player from './Player'
import { Boom } from './Boom'
import { Side, VFXParticles } from 'r3f-vfx'
import {
  abs,
  cos,
  fract,
  mix,
  mul,
  normalGeometry,
  positionLocal,
  rotate,
  sin,
  texture,
  time,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import { OrbitControls, useTexture } from '@react-three/drei/webgpu'

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
  const noiseTex = useLoader(THREE.TextureLoader, './marble.png')
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping
  return (
    <>
      <Canvas shadows renderer={{ forceWebGL: false }}>
        <Suspense fallback={null}>
          <SceneLight />
          <WebGPUPostProcessing />
          {/* <Floor />*/}
          {/* <KeyboardControls map={keyboardMap}>
            <Player />
          </KeyboardControls>*/}
          <OrbitControls />
          {/* <Boom />*/}
          <VFXParticles
            geometry={new THREE.BoxGeometry(0.5, 0.5, 0.5)}
            delay={1}
            fadeOpacity={[1, 1]}
            maxParticles={20}
            side={Side.FRONT}
            gravity={[0, 1, 0]}
            speed={[1.2, 1.5]}
            fadeSize={[1, 1]}
            size={[2, 2]}
            direction={[
              [-1, -0.2],
              [-0, 0],
              [-0.2, 0.2],
            ]}
            appearance="gradient"
            lighting="standard"
            emitterShape={1}
            geometryNode={({ progress, position }, defaultPosition) => {
              const local = defaultPosition.sub(position)
              const rotated = rotate(local, vec3(0, 0, sin(time.mul(3))))
              return rotated.add(position)
            }}
          />
          <group position={[-4, -0.2, 0]}>
            {/* <VFXParticles
              maxParticles={1200}
              autoStart
              emitCount={3}
              delay={0.02}
              geometry={crystalGeometry}
              lighting="standard"
              size={[0.14, 0.3]}
              speed={[10, 0.9]}
              lifetime={[1, 1.8]}
              gravity={[0, 0.8, 0]}
              colorStart={['#66ccff', '#bffcff']}
              colorEnd={['#2244aa']}
              rotation={[
                [0, Math.PI * 2],
                [0, Math.PI * 2],
                [0, Math.PI * 2],
              ]}
              geometryNode={({ progress }, defaultPosition) =>
                defaultPosition.add(
                  vec3(0, sin(time.mul(6).add(progress.mul(8))).mul(0.12), 0)
                )
              }
            />*/}
          </group>

          <group position={[4, -0.2, 0]}>
            {/* <VFXParticles
              maxParticles={1200}
              autoStart
              emitCount={3}
              delay={0.02}
              geometry={ribbonGeometry}
              lighting="physical"
              lightingParams={{
                roughness: 0.3,
                metalness: 0.8,
                clearcoat: 1,
                clearcoatRoughness: 0.1,
                iridescence: 1,
                iridescenceIOR: 1.5,
              }}
              size={[0.12, 0.24]}
              speed={[0.3, 0.9]}
              lifetime={[1, 1.8]}
              gravity={[0, 0.8, 0]}
              colorStart={['#ffb36b', '#ffe5b2']}
              colorEnd={['#d34f1f']}
              geometryNode={({ progress }, defaultPosition) => {
                const bend = sin(
                  defaultPosition.z.mul(5).add(time.mul(4)).add(progress.mul(6))
                ).mul(0.18)
                return vec3(
                  defaultPosition.x.add(bend),
                  defaultPosition.y,
                  defaultPosition.z
                )
              }}
            />*/}
          </group>
          {/* <VFXParticles
            delay={0.48}
            gravity={[0, -10.7, 0]}
            speed={[4.67, 4.67]}
            appearance="gradient"
            lighting="standard"
            emitterShape={1}
            collision={{
              plane: {
                y: -0.89,
              },
              bounce: 0.57,
              friction: 0.14,
              die: false,
              sizeBasedGravity: 0,
            }}
            debug
            trail={{
              segments: 32,
              width: 0.1,
              taper: false,
              opacity: 1,
              length: 0.5,
              showParticles: true,
            }}
          /> */}

          {/* <group position={[5, 0, 0]}>
            <VFXParticles debug fallback={<FallbackSprite />} />
          </group>*/}
        </Suspense>
      </Canvas>

      {/* <Loader />*/}
    </>
  )
}
