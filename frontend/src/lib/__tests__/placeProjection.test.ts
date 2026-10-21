import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { projectPlace } from '../placeProjection'

describe('geographic label anchors', () => {
  it('projects the surface anchor with the current camera, independent of camera distance', () => {
    const camera = new PerspectiveCamera(50, 2, 0.1, 2000)
    const output = new Vector3()
    for (const distance of [108, 120, 150]) {
      camera.position.set(0, 0, distance)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld()
      expect(projectPlace(new Vector3(0, 0, 100), camera, 1200, 600, output)).toEqual({ x: 600, y: 300 })
    }
  })
  it('rejects the far side and accounts for panel view offsets', () => {
    const camera = new PerspectiveCamera(50, 2, 0.1, 2000)
    camera.position.set(0, 0, 120)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const output = new Vector3()
    expect(projectPlace(new Vector3(0, 0, -100), camera, 1200, 600, output)).toBeNull()
    expect(projectPlace(new Vector3(100, 0, 0), camera, 1200, 600, output)).toBeNull()
    camera.setViewOffset(1200, 600, 180, 0, 1200, 600)
    expect(projectPlace(new Vector3(0, 0, 100), camera, 1200, 600, output)?.x).toBeCloseTo(420)
  })
})
