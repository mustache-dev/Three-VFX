<script lang="ts">
import { T } from '@threlte/core'
</script>

<T.DirectionalLight
  castShadow
  position={[5, 10, 5]}
  intensity={3}
  color="#ffe7bd"
  shadow.bias={-0.0001}
  shadow.mapSize.width={2048}
  shadow.mapSize.height={2048}
  shadow.camera.left={-20}
  shadow.camera.right={20}
  shadow.camera.top={20}
  shadow.camera.bottom={-20}
  shadow.camera.near={0.1}
  shadow.camera.far={50}
/>
<T.AmbientLight intensity={0.3} />
