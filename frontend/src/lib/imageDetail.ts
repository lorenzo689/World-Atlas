import { Group, Mesh, MeshPhongMaterial, PerspectiveCamera, SphereGeometry, SRGBColorSpace, TextureLoader, type Texture } from 'three'
import type { Pose } from '@/lib/geo'
import { GLOBE_RADIUS } from '@/lib/globeLayers'
import { TileStore } from '@/lib/tileStore'

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

type Cached = { mesh: Mesh; texture: Texture }

/** Camera-local imagery. The original 4k map remains visible until a high-res patch is ready. */
export class ImageDetail {
  private group = new Group()
  private loader = new TextureLoader()
  private tiles: TileStore<Cached>
  private lastPose: Pose = { lat: 0, lng: 0, altitude: 3 }
  private lastUpdate = 0
  private enabled = true
  private satellite = false
  private lite = false
  private disposed = false

  constructor(globe: Mesh, private camera: PerspectiveCamera, private requestRender: () => void) {
    globe.add(this.group) // same prime-meridian rotation as the global texture
    this.tiles = new TileStore({
      maxCache: MAX_CACHE,
      maxRequests: MAX_REQUESTS,
      load: (key, signal) => this.load(key, signal),
      dispose: (entry) => {
        entry.mesh.removeFromParent()
        entry.mesh.geometry.dispose()
        ;(entry.mesh.material as MeshPhongMaterial).dispose()
        entry.texture.dispose()
      },
      onLoaded: (_key, entry) => { this.group.add(entry.mesh); this.requestRender() },
    })
  }

  setEnabled(enabled: boolean) { this.enabled = enabled; this.update(this.lastPose, true) }
  setSatellite(satellite: boolean) { this.satellite = satellite; this.update(this.lastPose, true) }
  setLite(lite: boolean) { this.lite = lite; this.update(this.lastPose, true) }

  getDiagnostics() { return { imageTiles: this.group.children.length } }

  update(pose: Pose, force = false) {
    this.lastPose = pose
    if (this.disposed) return
    const now = performance.now()
    if (!force && now - this.lastUpdate < 150) return
    this.lastUpdate = now
    if (!this.enabled || !this.satellite || this.lite || pose.altitude > 0.45) {
      if (this.tiles.wantedKeys().size) this.hide()
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
    this.tiles.setWanted(wanted, now)
    for (const [key, entry] of this.tiles.entries()) {
      if (wanted.has(key)) this.group.add(entry.mesh)
      else this.group.remove(entry.mesh)
    }
  }

  private async load(key: string, signal: AbortSignal): Promise<Cached> {
    const texture = await this.loader.loadAsync(`${BASE}${key}.webp`)
    if (signal.aborted || this.disposed) {
      texture.dispose()
      throw new DOMException('Image tile cancelled', 'AbortError')
    }
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
    return { mesh, texture }
  }

  private hide() {
    this.tiles.setWanted([])
    this.group.clear()
    this.requestRender()
  }

  dispose() {
    this.disposed = true
    this.group.removeFromParent()
    this.tiles.dispose()
  }
}
