<script lang="ts">
import { T } from '@threlte/core'
import SceneLight from './SceneLight.svelte'
import Floor from './Floor.svelte'
import Player from './Player.svelte'
import Boom from './Boom.svelte'
import Particles from './Particles.svelte'
</script>

<SceneLight />
<Floor />
<Player />
<Boom />
<T.Group position={[5, 0, 0]}>
  <Particles />
</T.Group>
