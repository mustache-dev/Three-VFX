import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  float,
  vec2,
  vec3,
  hash,
  mix,
  texture,
  instanceIndex,
  mx_noise_vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { ParticleStorageArrays, ParticleUniforms } from './types';

/**
 * Creates the update compute shader that simulates particle physics each frame.
 * Handles gravity, turbulence, attractors, collision, rotation, and lifetime.
 */
export const createUpdateCompute = (
  storage: ParticleStorageArrays,
  uniforms: ParticleUniforms,
  curveTexture: THREE.DataTexture,
  maxParticles: number
) => {
  return Fn(() => {
    const position = storage.positions.element(instanceIndex);
    const velocity = storage.velocities.element(instanceIndex);
    const lifetime = storage.lifetimes.element(instanceIndex);
    const fadeRate = storage.fadeRates.element(instanceIndex);
    const particleRotation = storage.particleRotations.element(instanceIndex);
    const particleSize = storage.particleSizes.element(instanceIndex);
    const dt = uniforms.deltaTime;

    If(lifetime.greaterThan(0), () => {
      // All operations use deltaTime for framerate independence
      // Size-based gravity: gravity * (1 + size * sizeBasedGravity)
      const gravityMultiplier = float(1).add(
        particleSize.mul(uniforms.sizeBasedGravity)
      );
      velocity.addAssign(uniforms.gravity.mul(dt).mul(gravityMultiplier));

      // Velocity control: either via curve texture or friction
      // Calculate particle progress (0 at birth, 1 at death)
      const progress = float(1).sub(lifetime);

      // Sample velocity curve from B channel of combined texture (R=size, G=opacity, B=velocity)
      // Velocity curve value: 1 = full speed, 0 = stopped
      const velocityCurveSample = texture(
        curveTexture,
        vec2(progress, float(0.5))
      ).z;

      // Choose between velocity curve (if enabled) or friction (legacy)
      const speedScale = uniforms.velocityCurveEnabled
        .greaterThan(0.5)
        .select(
          // Use velocity curve directly as speed multiplier
          velocityCurveSample,
          // Legacy friction behavior
          (() => {
            // Apply easing function based on frictionEasingType
            // 0 = linear, 1 = easeIn, 2 = easeOut, 3 = easeInOut
            const easingType = uniforms.frictionEasingType;
            const easedProgress = easingType
              .lessThan(0.5)
              .select(
                progress,
                easingType
                  .lessThan(1.5)
                  .select(
                    progress.mul(progress),
                    easingType
                      .lessThan(2.5)
                      .select(
                        float(1).sub(
                          float(1).sub(progress).mul(float(1).sub(progress))
                        ),
                        progress
                          .lessThan(0.5)
                          .select(
                            float(2).mul(progress).mul(progress),
                            float(1).sub(
                              float(-2).mul(progress).add(2).pow(2).div(2)
                            )
                          )
                      )
                  )
              );
            // Interpolate friction intensity
            const currentIntensity = mix(
              uniforms.frictionIntensityStart,
              uniforms.frictionIntensityEnd,
              easedProgress
            );
            // Map intensity to speed scale
            return float(1).sub(currentIntensity.mul(0.9));
          })()
        );

      // Curl noise turbulence
      const turbIntensity = uniforms.turbulenceIntensity;
      const turbFreq = uniforms.turbulenceFrequency;
      const turbTime = uniforms.turbulenceTime;

      // Only apply if turbulence intensity > 0
      If(turbIntensity.greaterThan(0.001), () => {
        // Sample position in noise space (scaled by frequency, offset by time)
        const noisePos = position
          .mul(turbFreq)
          .add(vec3(turbTime, turbTime.mul(0.7), turbTime.mul(1.3)));

        // Compute curl of noise field using finite differences
        // curl(F) = (dFz/dy - dFy/dz, dFx/dz - dFz/dx, dFy/dx - dFx/dy)
        const eps = float(0.01); // Small offset for derivatives

        // Sample noise at offset positions for partial derivatives
        const nPosX = mx_noise_vec3(noisePos.add(vec3(eps, 0, 0)));
        const nNegX = mx_noise_vec3(noisePos.sub(vec3(eps, 0, 0)));
        const nPosY = mx_noise_vec3(noisePos.add(vec3(0, eps, 0)));
        const nNegY = mx_noise_vec3(noisePos.sub(vec3(0, eps, 0)));
        const nPosZ = mx_noise_vec3(noisePos.add(vec3(0, 0, eps)));
        const nNegZ = mx_noise_vec3(noisePos.sub(vec3(0, 0, eps)));

        // Compute partial derivatives
        const dFx_dy = nPosY.x.sub(nNegY.x).div(eps.mul(2));
        const dFx_dz = nPosZ.x.sub(nNegZ.x).div(eps.mul(2));
        const dFy_dx = nPosX.y.sub(nNegX.y).div(eps.mul(2));
        const dFy_dz = nPosZ.y.sub(nNegZ.y).div(eps.mul(2));
        const dFz_dx = nPosX.z.sub(nNegX.z).div(eps.mul(2));
        const dFz_dy = nPosY.z.sub(nNegY.z).div(eps.mul(2));

        // Curl = (dFz/dy - dFy/dz, dFx/dz - dFz/dx, dFy/dx - dFx/dy)
        const curlX = dFz_dy.sub(dFy_dz);
        const curlY = dFx_dz.sub(dFz_dx);
        const curlZ = dFy_dx.sub(dFx_dy);
        const curl = vec3(curlX, curlY, curlZ);

        // Add curl force to velocity (scaled by intensity and deltaTime)
        velocity.addAssign(curl.mul(turbIntensity).mul(uniforms.deltaTime));
      });

      // Attractors - apply force from each active attractor
      const attractorCount = uniforms.attractorCount;

      // Helper function to apply a single attractor's force
      const applyAttractor = (
        aPos: Node,
        aStrength: Node,
        aRadius: Node,
        aType: Node,
        aAxis: Node
      ) => {
        If(aStrength.abs().greaterThan(0.001), () => {
          // Vector from particle to attractor
          const toAttractor = aPos.sub(position);
          const dist = toAttractor.length();

          // Avoid division by zero
          const safeDist = dist.max(0.01);
          const direction = toAttractor.div(safeDist);

          // Calculate falloff (1 at center, 0 at radius edge)
          // If radius is 0, no falloff (infinite range with inverse square)
          const falloff = aRadius.greaterThan(0.001).select(
            float(1).sub(dist.div(aRadius)).max(0), // Linear falloff within radius
            float(1).div(safeDist.mul(safeDist).add(1)) // Inverse square falloff (softened)
          );

          // Type 0: Point attractor - pull toward position
          // Type 1: Vortex - swirl around axis
          const force = aType.lessThan(0.5).select(
            // Point attractor: force along direction to attractor
            direction.mul(aStrength).mul(falloff),
            // Vortex: force perpendicular to both (toAttractor) and (axis)
            // cross(axis, toAttractor) gives tangent direction
            (() => {
              const tangent = vec3(
                aAxis.y.mul(toAttractor.z).sub(aAxis.z.mul(toAttractor.y)),
                aAxis.z.mul(toAttractor.x).sub(aAxis.x.mul(toAttractor.z)),
                aAxis.x.mul(toAttractor.y).sub(aAxis.y.mul(toAttractor.x))
              );
              const tangentLen = tangent.length().max(0.001);
              return tangent.div(tangentLen).mul(aStrength).mul(falloff);
            })()
          );

          velocity.addAssign(force.mul(uniforms.deltaTime));
        });
      };

      // Apply each attractor (unrolled for shader compatibility)
      If(attractorCount.greaterThan(0), () => {
        applyAttractor(
          uniforms.attractor0Pos,
          uniforms.attractor0Strength,
          uniforms.attractor0Radius,
          uniforms.attractor0Type,
          uniforms.attractor0Axis
        );
      });
      If(attractorCount.greaterThan(1), () => {
        applyAttractor(
          uniforms.attractor1Pos,
          uniforms.attractor1Strength,
          uniforms.attractor1Radius,
          uniforms.attractor1Type,
          uniforms.attractor1Axis
        );
      });
      If(attractorCount.greaterThan(2), () => {
        applyAttractor(
          uniforms.attractor2Pos,
          uniforms.attractor2Strength,
          uniforms.attractor2Radius,
          uniforms.attractor2Type,
          uniforms.attractor2Axis
        );
      });
      If(attractorCount.greaterThan(3), () => {
        applyAttractor(
          uniforms.attractor3Pos,
          uniforms.attractor3Strength,
          uniforms.attractor3Radius,
          uniforms.attractor3Type,
          uniforms.attractor3Axis
        );
      });

      // Apply velocity to position, scaled by speedScale (friction/curve)
      position.addAssign(velocity.mul(dt).mul(speedScale));

      // Plane collision detection
      If(uniforms.collisionEnabled.greaterThan(0.5), () => {
        const planeY = uniforms.collisionPlaneY;
        const bounce = uniforms.collisionBounce;
        const friction = uniforms.collisionFriction;
        const shouldDie = uniforms.collisionDie;

        // Check if particle is below the plane
        If(position.y.lessThan(planeY), () => {
          If(shouldDie.greaterThan(0.5), () => {
            // Kill the particle
            lifetime.assign(float(0));
            position.y.assign(float(-1000));
          }).Else(() => {
            // Bounce the particle
            // Move particle back above the plane
            position.y.assign(planeY);

            // Reflect Y velocity and apply bounce factor
            velocity.y.assign(velocity.y.abs().mul(bounce));

            // Apply friction to horizontal velocity
            velocity.x.mulAssign(friction);
            velocity.z.mulAssign(friction);
          });
        });
      });

      // Calculate rotation speed per-particle using hash (consistent per particle)
      const idx = float(instanceIndex);
      const rotSpeedX = mix(
        uniforms.rotationSpeedMinX,
        uniforms.rotationSpeedMaxX,
        hash(idx.add(8888))
      );
      const rotSpeedY = mix(
        uniforms.rotationSpeedMinY,
        uniforms.rotationSpeedMaxY,
        hash(idx.add(9999))
      );
      const rotSpeedZ = mix(
        uniforms.rotationSpeedMinZ,
        uniforms.rotationSpeedMaxZ,
        hash(idx.add(10101))
      );

      // Sample rotation speed curve from A channel (R=size, G=opacity, B=velocity, A=rotSpeed)
      const rotSpeedCurveSample = texture(
        curveTexture,
        vec2(progress, float(0.5))
      ).w;
      const rotSpeedMultiplier = uniforms.rotationSpeedCurveEnabled
        .greaterThan(0.5)
        .select(rotSpeedCurveSample, float(1));

      // Apply rotation speed (radians/second * deltaTime * curve multiplier)
      particleRotation.addAssign(
        vec3(rotSpeedX, rotSpeedY, rotSpeedZ)
          .mul(uniforms.deltaTime)
          .mul(rotSpeedMultiplier)
      );

      // fadeRate is per-second, multiply by actual deltaTime
      lifetime.subAssign(fadeRate.mul(uniforms.deltaTime));

      If(lifetime.lessThanEqual(0), () => {
        lifetime.assign(float(0));
        position.y.assign(float(-1000));
      });
    });
  })().compute(maxParticles);
};
