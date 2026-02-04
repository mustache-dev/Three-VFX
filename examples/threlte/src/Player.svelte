<script lang="ts">
import { T, useThrelte, useTask } from '@threlte/core'
import { useGltf } from '@threlte/extras'
import { onDestroy } from 'svelte'
import * as THREE from 'three/webgpu'
import { damp } from 'three/src/math/MathUtils.js'

const { camera } = useThrelte()

const gltf = useGltf('/witch-test.glb')

let meshRef: THREE.Group | null = $state(null)
let modelRef: THREE.Group | null = $state(null)

// Keyboard state
let keys = $state({
  forward: false,
  backward: false,
  left: false,
  right: false,
  run: false,
  attack: false,
})

const keyMap: Record<string, string> = {
  ArrowUp: 'forward',
  KeyW: 'forward',
  ArrowDown: 'backward',
  KeyS: 'backward',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  KeyE: 'attack',
}

function onKeyDown(e: KeyboardEvent) {
  const action = keyMap[e.code]
  if (action) keys[action] = true
}

function onKeyUp(e: KeyboardEvent) {
  const action = keyMap[e.code]
  if (action) keys[action] = false
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
}

onDestroy(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
  }
  if (mixer) {
    mixer.removeEventListener('finished', onAnimationFinished as any)
    mixer.stopAllAction()
  }
})

// Animation state
let currentAnimName = 'idle-sword'
let baseAnimName = 'idle-sword'
let isAttackingFlag = false
let comboIdx = 0
let nextAttackQueuedFlag = false
let targetRot = 0
let attackPressedPrev = false

let mixer: THREE.AnimationMixer | null = null
let animActions: Record<string, THREE.AnimationAction> = {}
const velocity = new THREE.Vector3()

const ATTACK_COMBO = ['sword-attack-01', 'sword-attack-03', 'sword-attack-04']
const walkSpeed = 5
const runSpeed = 10

function playAnimation(name: string, fadeIn = 0.2) {
  if (currentAnimName === name) return

  if (currentAnimName && animActions[currentAnimName]) {
    animActions[currentAnimName].fadeOut(fadeIn)
  }

  if (animActions[name]) {
    const action = animActions[name].reset().fadeIn(fadeIn).play()
    if (name === 'run') {
      action.setEffectiveTimeScale(2)
    }
    if (ATTACK_COMBO.includes(name)) {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
    }
  }

  currentAnimName = name
}

function doAttack() {
  if (!isAttackingFlag) {
    isAttackingFlag = true
    comboIdx = 0
    nextAttackQueuedFlag = false
    playAnimation(ATTACK_COMBO[0], 0.1)
  } else {
    nextAttackQueuedFlag = true
  }
}

function onAnimationFinished(e: { action: THREE.AnimationAction }) {
  const finishedName = e.action.getClip().name
  if (ATTACK_COMBO.includes(finishedName)) {
    if (nextAttackQueuedFlag && comboIdx < ATTACK_COMBO.length - 1) {
      comboIdx++
      nextAttackQueuedFlag = false
      playAnimation(ATTACK_COMBO[comboIdx], 0.1)
    } else {
      isAttackingFlag = false
      comboIdx = 0
      nextAttackQueuedFlag = false
      playAnimation(baseAnimName, 0.2)
    }
  }
}

// Setup model when loaded
$effect(() => {
  const data = $gltf
  if (!data?.scene) return

  const scene = data.scene

  scene.traverse((child: THREE.Object3D) => {
    if ('isMesh' in child && (child as THREE.Mesh).isMesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
    if (child.name === 'Cylinder001') {
      child.visible = false
    }
  })

  mixer = new THREE.AnimationMixer(scene)
  mixer.addEventListener('finished', onAnimationFinished as any)

  animActions = {}
  for (const clip of data.animations) {
    animActions[clip.name] = mixer.clipAction(clip)
  }

  if (animActions['wind']) {
    animActions['wind'].play()
  }
  playAnimation('idle-sword')
})

// Frame loop
useTask((delta) => {
  if (!meshRef) return

  if (mixer) {
    mixer.update(delta)
  }

  const k = keys

  if (k.attack && !attackPressedPrev) {
    doAttack()
  }
  attackPressedPrev = k.attack

  const moveX = (k.right ? 1 : 0) - (k.left ? 1 : 0)
  const moveZ = (k.backward ? 1 : 0) - (k.forward ? 1 : 0)
  const speed = k.run ? runSpeed : walkSpeed

  velocity.set(moveX, 0, moveZ).normalize().multiplyScalar(speed * delta)

  const isMoving = moveX !== 0 || moveZ !== 0

  meshRef.position.add(velocity)
  meshRef.position.y = -1.2

  if (isMoving && modelRef) {
    targetRot = Math.atan2(-moveX, -moveZ)

    const cur = modelRef.rotation.y
    const diff = targetRot - cur
    let shortestDiff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI
    if (shortestDiff < -Math.PI) shortestDiff += Math.PI * 2

    modelRef.rotation.y = damp(cur, cur + shortestDiff, 10, delta)
  }

  const newAnim = isMoving ? (k.run ? 'run' : 'walk') : 'idle'
  const animName = newAnim === 'idle' ? 'idle-sword' : newAnim
  if (animName !== baseAnimName) {
    baseAnimName = animName
    if (!isAttackingFlag) {
      playAnimation(animName)
    }
  }

  const cam = camera.current
  if (cam && meshRef) {
    cam.position.x = damp(cam.position.x, meshRef.position.x, 4, delta)
    cam.position.z = damp(cam.position.z, meshRef.position.z + 5, 4, delta)
  }
})
</script>

<T.PerspectiveCamera
  makeDefault
  position={[0, 3, 10]}
  fov={45}
  rotation={[-Math.PI / 6, 0, 0]}
/>

<T.Group bind:ref={meshRef}>
  <T.Group bind:ref={modelRef}>
    {#if $gltf?.scene}
      <T is={$gltf.scene} />
    {/if}
  </T.Group>
</T.Group>
