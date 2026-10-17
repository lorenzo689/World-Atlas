import { Group, Mesh, MeshPhongMaterial, PerspectiveCamera, SphereGeometry, SRGBColorSpace, TextureLoader, type Texture } from 'three'
import type { Pose } from '@/lib/geo'
import { GLOBE_RADIUS } from '@/lib/globeLayers'

const COLS = 16
const ROWS = 8
const MAX_ACTIVE = 12
const MAX_CACHE = 18
const MAX_REQUESTS = 4
const RAD = Math.PI / 180
const BASE = `${import.meta.env.BASE_URL}textures/earth-detail/`
const angle = (a: Pose, lat: number, lng: number) => Math.acos(Math.max(-1, Math.min(1,
  Math.sin(a.lat * RAD) * Math.sin(lat * RAD) + Math.cos(a.lat * RAD) * Math.cos(lat * RAD) * Math.cos((a.lng - lng) * RAD),
))) / RAD

type Cached = { mesh: Mesh; texture: Texture; used: number }

/** Camera-local imagery. The original 4k map remains visible until a high-res patch is ready. */
export class ImageDetail {
  private group = new Group()
  private loader = new TextureLoader()
  private cache = new Map<string, Cached>()
  private loading = new Set<string>()
  private failed = new Set<string>()
  private queue: string[] = []
  private wanted = new Set<string>()
  private lastPose: Pose = { lat: 0, lng: 0, altitude: 3 }
  private lastUpdate = 0
  private enabled = true
  private satellite = false
  private lite = false
  private disposed = false

  constructor(globe: Mesh, private camera: PerspectiveCamera, private requestRender: () => void) {
    globe.add(this.group) // same prime-meridian rotation as the global texture
  }

  setEnabled(enabled: boolean) { this.enabled = enabled; this.update(this.lastPose, true) }
  setSatellite(satellite: boolean) { this.satellite = satellite; this.update(this.lastPose, true) }
  setLite(lite: boolean) { this.lite = lite; this.update(this.lastPose, true) }

  update(pose: Pose, force = false) {
    this.lastPose = pose
    if (this.disposed) return
    const now = performance.now()
    if (!force && now - this.lastUpdate < 150) return
    this.lastUpdate = now
    if (!this.enabled || !this.satellite || this.lite || pose.altitude > 0.45) {
      if (this.wanted.size) this.hide()
      return
    }
    const horizon = Math.acos(1 / (1 + pose.altitude)) / RAD
    const viewRadius = Math.atan(Math.tan(this.camera.fov * RAD / 2) * pose.altitude * Math.max(1, this.camera.aspect)) / RAD
    const nearest: { key: string; distance: number }[] = []
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const lat = 90 - (y + 0.5) * 180 / ROWS
      const lng = -180 + (x + 0.5) * 360 / COLS
      const distance = angle(pose, lat, lng)
      if (distance < Math.min(horizon, viewRadius) + 17) nearest.push({ key: `${x}-${y}`, distance })
    }
    nearest.sort((a, b) => a.distance - b.distance)
    const wanted = new Set(nearest.slice(0, MAX_ACTIVE).map((v) => v.key))
    this.wanted = wanted
    for (const [key, entry] of this.cache) {
      if (wanted.has(key)) { entry.used = now; this.group.add(entry.mesh) }
      else this.group.remove(entry.mesh)
    }
    this.queue = [...wanted].filter((key) => !this.cache.has(key) && !this.loading.has(key) && !this.failed.has(key))
    this.pump()
    this.trim()
  }

  private pump() {
    while (!this.disposed && this.loading.size < MAX_REQUESTS && this.queue.length) {
      const key = this.queue.shift()!
      if (!this.wanted.has(key) || this.loading.has(key)) continue
      this.loading.add(key)
      this.load(key).finally(() => { this.loading.delete(key); this.pump() })
    }
  }

  private async load(key: string) {
    try {
      const texture = await this.loader.loadAsync(`${BASE}${key}.webp`)
      if (this.disposed || !this.wanted.has(key)) { texture.dispose(); return }
      texture.colorSpace = SRGBColorSpace
      texture.anisotropy = 4
      const [x, y] = key.split('-').map(Number)
      const geometry = new SphereGeometry(
        GLOBE_RADIUS * 1.00025, 24, 24,
        x * 2 * Math.PI / COLS, 2 * Math.PI / COLS,
        y * Math.PI / ROWS, Math.PI / ROWS,
      )
      const material = new MeshPhongMaterial({ map: texture, specular: '#35527a', shininess: 14 })
      const mesh = new Mesh(geometry, material)
      mesh.raycast = () => {}
      this.cache.set(key, { mesh, texture, used: performance.now() })
      this.group.add(mesh)
      this.trim()
      this.requestRender()
    } catch { this.failed.add(key) /* the low-res sphere remains available */ }
  }

  private hide() {
    this.wanted.clear()
    this.queue.length = 0
    this.group.clear()
    this.requestRender()
  }

  private trim() {
    if (this.cache.size <= MAX_CACHE) return
    const stale = [...this.cache].filter(([key]) => !this.wanted.has(key)).sort((a, b) => a[1].used - b[1].used)
    for (const [key, entry] of stale.slice(0, this.cache.size - MAX_CACHE)) {
      entry.mesh.removeFromParent()
      entry.mesh.geometry.dispose()
      ;(entry.mesh.material as MeshPhongMaterial).dispose()
      entry.texture.dispose()
      this.cache.delete(key)
    }
  }

  dispose() {
    this.disposed = true
    this.group.removeFromParent()
    for (const entry of this.cache.values()) {
      entry.mesh.geometry.dispose()
      ;(entry.mesh.material as MeshPhongMaterial).dispose()
      entry.texture.dispose()
    }
    this.cache.clear()
  }
}
