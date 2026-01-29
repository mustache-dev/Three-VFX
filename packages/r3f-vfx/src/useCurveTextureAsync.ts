import { useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three/webgpu'
import {
  createDefaultCurveTexture,
  createCombinedCurveTexture,
  loadCurveTextureFromPath,
  type CurveData,
} from 'core-vfx'

/**
 * Hook for curve texture loading/baking
 * Returns a STABLE texture reference that updates in place
 *
 * If curveTexturePath is provided, loads pre-baked texture from file
 * If curves are defined, bakes them synchronously on the main thread
 * If no curves AND no path, returns default texture (no baking needed)
 */
export const useCurveTextureAsync = (
  sizeCurve: CurveData | null,
  opacityCurve: CurveData | null,
  velocityCurve: CurveData | null,
  rotationSpeedCurve: CurveData | null,
  curveTexturePath: string | null = null
): THREE.DataTexture => {
  const hasAnyCurve =
    sizeCurve || opacityCurve || velocityCurve || rotationSpeedCurve

  // Create texture with baked curve data synchronously during render.
  // This ensures the texture has the correct data before downstream useMemo
  // hooks (createUpdateCompute, createParticleMaterial) consume it.
  const textureRef = useRef<THREE.DataTexture | null>(null)
  if (!textureRef.current) {
    if (!curveTexturePath && hasAnyCurve) {
      // Bake curves directly into the initial texture
      textureRef.current = createCombinedCurveTexture(
        sizeCurve as CurveData,
        opacityCurve as CurveData,
        velocityCurve as CurveData,
        rotationSpeedCurve as CurveData
      )
    } else {
      // Default linear 1→0 fallback (curveTexturePath will update it async)
      textureRef.current = createDefaultCurveTexture()
    }
  }

  // Re-bake synchronously when curve props change after initial mount
  useMemo(() => {
    if (!curveTexturePath && hasAnyCurve && textureRef.current) {
      const bakedTexture = createCombinedCurveTexture(
        sizeCurve as CurveData,
        opacityCurve as CurveData,
        velocityCurve as CurveData,
        rotationSpeedCurve as CurveData
      )
      const srcData = bakedTexture.image.data as Float32Array | null
      const dstData = textureRef.current.image.data as Float32Array | null
      if (srcData && dstData) {
        dstData.set(srcData)
        textureRef.current.needsUpdate = true
      }
      bakedTexture.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizeCurve, opacityCurve, velocityCurve, rotationSpeedCurve])

  // Load pre-baked texture from path (requires async fetch)
  useEffect(() => {
    if (!curveTexturePath || !textureRef.current) return

    loadCurveTextureFromPath(curveTexturePath, textureRef.current).catch(
      (err) => {
        console.warn(
          `Failed to load curve texture: ${curveTexturePath}, falling back to baking`,
          err
        )
        if (hasAnyCurve && textureRef.current) {
          const bakedTexture = createCombinedCurveTexture(
            sizeCurve as CurveData,
            opacityCurve as CurveData,
            velocityCurve as CurveData,
            rotationSpeedCurve as CurveData
          )
          const srcData = bakedTexture.image.data as Float32Array | null
          const dstData = textureRef.current.image.data as Float32Array | null
          if (srcData && dstData) {
            dstData.set(srcData)
            textureRef.current.needsUpdate = true
          }
          bakedTexture.dispose()
        }
      }
    )
  }, [
    curveTexturePath,
    sizeCurve,
    opacityCurve,
    velocityCurve,
    rotationSpeedCurve,
    hasAnyCurve,
  ])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      textureRef.current?.dispose()
      textureRef.current = null
    }
  }, [])

  return textureRef.current!
}

export default useCurveTextureAsync
