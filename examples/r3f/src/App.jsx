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
  clamp,
  color,
  cos,
  dot,
  float,
  Fn,
  fract,
  mix,
  mul,
  normalGeometry,
  normalView,
  oneMinus,
  positionLocal,
  positionViewDirection,
  pow,
  rotate,
  sin,
  smoothstep,
  texture,
  time,
  triplanarTexture,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import { OrbitControls, useGLTF, useTexture } from '@react-three/drei/webgpu'

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
  const noiseTex = useLoader(THREE.TextureLoader, './voronoi.png')
  const noiseTex2 = useLoader(THREE.TextureLoader, './noise.png')
  noiseTex2.wrapS = noiseTex2.wrapT = THREE.RepeatWrapping
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping

  const { nodes } = useGLTF('./flame.glb')

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
          <Boom />
          {/* <mesh geometry={nodes.Sphere.geometry}>
            <meshBasicNodeMaterial
              transparent
              // colorNode={Fn(() => {
              //   const noise = texture(noiseTex)
              //   const n = triplanarTexture(
              //     noise,
              //     noise,
              //     noise,
              //     positionLocal,
              //     normalGeometry
              //   )

              //   return n
              // })()}
              colorNode={Fn(() => {
                const color1 = color('#00AAFF')
                const n = texture(
                  noiseTex2,
                  vec2(uv().x, uv().y.mul(0.3).add(time.mul(0.5)))
                )
                  .blur(0.4)
                  .r.pow(4)
                const fresnel = dot(
                  normalView,
                  positionViewDirection
                ).oneMinus()

                const col = color1.mul(n.smoothstep(0, 0.2).add(n.add(0.1)))
                const finalCol = mix(
                  col,
                  vec3(0),
                  fresnel.step(float(0.7).add(n.sub(0.5).mul(0.1)))
                )
                const isRim = fresnel.step(float(0.7).add(n.sub(0.5).mul(0.1)))
                const alpha = mix(float(0.7), float(1), isRim)
                return vec4(finalCol, alpha)
              })()}
              positionNode={Fn(() => {
                const n = texture(
                  noiseTex,
                  vec2(normalGeometry.x, normalGeometry.y.sub(time.mul(2))).mul(
                    0.8
                  )
                ).r

                const displacement = vec3(0, n.sub(0.5).mul(0.5), 0).mul(1.7)
                return positionLocal.add(
                  displacement.mul(uv().y.smoothstep(1, 0.4))
                )
              })()}
            />
          </mesh>*/}
          <VFXParticles
            geometry={nodes.Sphere.geometry}
            delay={1}
            fadeOpacity={[1, 1]}
            maxParticles={20}
            side={Side.FRONT}
            gravity={[0, 1, 0]}
            speed={[1.2, 1.5]}
            fadeSize={[0, 1]}
            size={[2, 2]}
            direction={[
              [-1, -0.2],
              [-0, 0],
              [-0.2, 0.2],
            ]}
            appearance="gradient"
            lighting="standard"
            emitterShape={1}
            colorNode={Fn(() => {
              const color1 = color('#00AAFF')
              const n = texture(
                noiseTex2,
                vec2(uv().x, uv().y.mul(0.3).add(time.mul(0.5)))
              )
                .blur(0.4)
                .r.pow(4)
              const fresnel = dot(normalView, positionViewDirection).oneMinus()

              const col = color1.mul(n.smoothstep(0, 0.2).add(n.add(0.1)))
              const finalCol = mix(
                col,
                vec3(0),
                fresnel.step(float(0.7).add(n.sub(0.5).mul(0.1)))
              )
              const isRim = fresnel.step(float(0.7).add(n.sub(0.5).mul(0.1)))
              const alpha = mix(float(0.7), float(1), isRim)
              return vec4(finalCol, alpha)
            })()}
            geometryNode={({ progress, position }, defaultPosition) => {
              const local = defaultPosition
              const n = texture(
                noiseTex,
                vec2(normalGeometry.x, normalGeometry.y.sub(time.mul(2))).mul(
                  0.8
                )
              ).r

              const displacement = vec3(0, n.sub(0.5).mul(0.5), 0).mul(1.7)
              return local.add(displacement.mul(uv().y.smoothstep(1, 0.4)))
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
