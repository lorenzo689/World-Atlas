import { PerspectiveCamera, Vector3 } from 'three'

/** Project a geographic surface anchor using the same camera matrices as the rendered globe. */
export function projectPlace(point: Vector3, camera: PerspectiveCamera, width: number, height: number, projected: Vector3): { x: number; y: number } | null {
  // Surface normal dotted with the direction towards the camera: hide the far side of Earth.
  if (point.dot(camera.position) <= point.lengthSq()) return null
  projected.copy(point).project(camera)
  if (projected.z < -1 || projected.z > 1) return null
  const x = (projected.x + 1) * width / 2
  const y = (1 - projected.y) * height / 2
  return x >= 0 && x <= width && y >= 0 && y <= height ? { x, y } : null
}
