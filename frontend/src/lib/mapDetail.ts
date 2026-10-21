import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, PerspectiveCamera, Scene, Vector3 } from 'three'
import type { Pose } from '@/lib/geo'
import { GLOBE_RADIUS, polarToXYZ } from '@/lib/globeLayers'
import { TileStore } from '@/lib/tileStore'
import { projectPlace } from './placeProjection'

type Kind = 'borders' | 'admin1' | 'rivers' | 'lakes' | 'roads'
type Manifest = { cols: number; rows: number; step: number; kinds: Record<Kind, Record<string, number>> }
type Place = { name: string; lng: number; lat: number; population: number; capital: boolean }
const BASE = `${import.meta.env.BASE_URL}data/map-detail/`
const MAX_CACHE = 40
const MAX_REQUESTS = 6
const LIMITS: Record<Kind, number> = { borders: 18, admin1: 5, rivers: 5, lakes: 5, roads: 4 }
const RAD = Math.PI / 180
const angle = (a: Pose, lat: number, lng: number) => Math.acos(Math.max(-1, Math.min(1,
  Math.sin(a.lat * RAD) * Math.sin(lat * RAD) + Math.cos(a.lat * RAD) * Math.cos(lat * RAD) * Math.cos((a.lng - lng) * RAD),
))) / RAD

/** Extra current-day map data. Nothing is fetched until the camera enters a close zoom. */
export class MapDetail {
  private group = new Group()
  private manifest: Manifest | null = null
  private manifestRequest: Promise<void> | null = null
  private places: Place[] = []
  private labels = new Map<Place, { element: HTMLDivElement; anchor: Vector3 }>()
  private projection = new Vector3()
  private overlay: HTMLDivElement
  private tiles: TileStore<LineSegments>
  private worker: Worker | null = null
  private decodeId = 0
  private pending = new Map<number, (positions: Float32Array) => void>()
  private active = false
  private fullBorderCoverage = false
  private enabled = true
  private disposed = false
  private lastUpdate = 0
  private lastPose: Pose = { lat: 0, lng: 0, altitude: 3 }
  private materials: Record<Kind, LineBasicMaterial> = {
    borders: new LineBasicMaterial({ color: '#d6e7ff', transparent: true, opacity: 0.72, depthWrite: false }),
    admin1: new LineBasicMaterial({ color: '#d8e0e8', transparent: true, opacity: 0.26, depthWrite: false }),
    rivers: new LineBasicMaterial({ color: '#70baff', transparent: true, opacity: 0.68, depthWrite: false }),
    lakes: new LineBasicMaterial({ color: '#91c8ff', transparent: true, opacity: 0.55, depthWrite: false }),
    roads: new LineBasicMaterial({ color: '#f5d8a8', transparent: true, opacity: 0.34, depthWrite: false }),
  }

  constructor(scene: Scene, private camera: PerspectiveCamera, container: HTMLElement, private requestRender: () => void, private lowEnd = false) {
    this.group.renderOrder = 1
    scene.add(this.group)
    this.overlay = document.createElement('div')
    this.overlay.className = 'globe-place-labels'
    container.appendChild(this.overlay)
    this.tiles = new TileStore({
      maxCache: MAX_CACHE,
      maxRequests: MAX_REQUESTS,
      load: (key, signal) => this.loadTile(key, signal),
      dispose: (mesh) => { mesh.removeFromParent(); mesh.geometry.dispose() },
      onLoaded: (_key, mesh) => { this.group.add(mesh); this.requestRender() },
    })
  }

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return
    this.enabled = enabled
    if (!enabled) this.hide()
    else this.update(this.lastPose, true)
  }

  setSatellite(satellite: boolean) {
    this.materials.borders.color.set(satellite ? '#d6e7ff' : '#172136')
    this.materials.borders.opacity = satellite ? 0.72 : 0.82
    this.materials.admin1.color.set(satellite ? '#e1e9f2' : '#24324b')
    this.materials.roads.color.set(satellite ? '#f5d8a8' : '#766345')
    this.requestRender()
  }

  coversBorders() {
    const borderTiles = [...this.tiles.wantedKeys()].filter((key) => key.startsWith('borders/'))
    const ready = this.enabled && this.fullBorderCoverage && borderTiles.length > 0 && borderTiles.every((key) => this.tiles.has(key))
    // Switch the two border levels together, including while tiles are streaming in.
    for (const key of borderTiles) {
      const tile = this.tiles.get(key)
      if (tile) tile.visible = ready
    }
    return ready
  }

  getDiagnostics() {
    let labelMaxErrorPx = 0; let labelsProjected = 0
    const rect = this.overlay.getBoundingClientRect()
    for (const { element, anchor } of this.labels.values()) {
      if (element.style.visibility !== 'visible') continue
      const expected = projectPlace(anchor, this.camera, rect.width, rect.height, this.projection)
      if (!expected) continue
      const actual = element.getBoundingClientRect()
      labelMaxErrorPx = Math.max(labelMaxErrorPx, Math.hypot(actual.left + actual.width / 2 - rect.left - expected.x, actual.top + actual.height / 2 - rect.top - expected.y))
      labelsProjected++
    }
    return {
      labelMaxErrorPx, labelsProjected,
      bordersReady: this.coversBorders(),
      borderTiles: [...this.tiles.wantedKeys()].filter((key) => key.startsWith('borders/')).length,
      roadsVisible: [...this.tiles.wantedKeys()].filter((key) => key.startsWith('roads/') && this.tiles.has(key)).length,
    }
  }

  update(pose: Pose, force = false) {
    this.lastPose = pose
    if (this.disposed || !this.enabled) return
    const now = performance.now()
    if (!force && now - this.lastUpdate < 120) return
    this.lastUpdate = now
    if (pose.altitude > 0.85) { this.hide(); return }
    this.active = true
    if (!this.manifest) {
      if (!this.manifestRequest) this.manifestRequest = this.loadManifest()
      return
    }
    const want = new Set<string>()
    const horizon = Math.acos(1 / (1 + pose.altitude)) / RAD
    const halfFov = this.camera.fov * RAD / 2
    const viewRadius = Math.atan(Math.tan(halfFov) * pose.altitude * Math.max(1, this.camera.aspect)) / RAD
    // A 30-degree tile can intersect the screen even when its centre is outside it.
    const reach = Math.min(horizon, viewRadius) + 23
    const candidates: { tile: string; distance: number }[] = []
    for (let y = 0; y < this.manifest.rows; y++) for (let x = 0; x < this.manifest.cols; x++) {
      const tile = `${x}-${y}`
      const lat = 90 - (y + 0.5) * this.manifest.step
      const lng = -180 + (x + 0.5) * this.manifest.step
      const distance = angle(pose, lat, lng)
      if (distance <= reach) candidates.push({ tile, distance })
    }
    candidates.sort((a, b) => a.distance - b.distance)
    const limits = this.lowEnd ? { borders: 12, admin1: 2, rivers: 2, lakes: 2, roads: 2 } : LIMITS
    this.fullBorderCoverage = candidates.filter(({ tile }) => this.manifest!.kinds.borders?.[tile]).length <= limits.borders
    for (const kind of ['borders', 'admin1', 'rivers', 'lakes', 'roads'] as Kind[]) {
      if (kind === 'borders' && !this.fullBorderCoverage) continue
      let count = 0
      for (const { tile } of candidates) {
        if (count >= limits[kind]) break
        if (kind === 'admin1' && pose.altitude > 0.34) continue
        if ((kind === 'rivers' || kind === 'lakes') && pose.altitude > 0.5) continue
        if (kind === 'roads' && pose.altitude > 0.16) continue
        if (this.manifest.kinds[kind]?.[tile]) { want.add(`${kind}/${tile}`); count++ }
      }
    }
    this.tiles.setWanted(want, now)
    for (const [key, mesh] of this.tiles.entries()) {
      if (want.has(key)) this.group.add(mesh)
      else this.group.remove(mesh)
    }
    this.updateLabels(pose)
  }

  private async loadManifest() {
    try {
      const [manifest, places] = await Promise.all([
        fetch(`${BASE}manifest.json`).then((r) => { if (!r.ok) throw Error('Map detail unavailable'); return r.json() }),
        fetch(`${BASE}places.json`).then((r) => r.ok ? r.json() : []),
      ])
      if (this.disposed) return
      this.manifest = manifest
      this.places = places
      this.update(this.lastPose, true)
      this.requestRender()
    } catch {
      // The 1:50m base map remains usable when an optional detail tile is unavailable.
    }
  }

  private async loadTile(key: string, signal: AbortSignal): Promise<LineSegments> {
    const response = await fetch(`${BASE}${key}.bin`, { signal })
    if (!response.ok) throw new Error(`Map tile ${key}: HTTP ${response.status}`)
    const packed = await response.arrayBuffer()
    if (signal.aborted) throw new DOMException('Map tile cancelled', 'AbortError')
    const [kind, tile] = key.split('/') as [Kind, string]
    const [x, y] = tile.split('-').map(Number)
    const positions = await this.decode(packed, x, y)
    if (signal.aborted || this.disposed) throw new DOMException('Map tile cancelled', 'AbortError')
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.computeBoundingSphere()
    const mesh = new LineSegments(geometry, this.materials[kind])
    mesh.renderOrder = 1
    mesh.raycast = () => {}
    if (kind === 'borders') mesh.visible = false
    return mesh
  }

  private decode(packed: ArrayBuffer, x: number, y: number): Promise<Float32Array> {
    if (!this.worker) {
      this.worker = new Worker(new URL('./mapDetail.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (event: MessageEvent<{ id: number; positions: Float32Array }>) => {
        const done = this.pending.get(event.data.id)
        this.pending.delete(event.data.id)
        done?.(event.data.positions)
      }
    }
    const id = ++this.decodeId
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      this.worker!.postMessage({ id, packed, x, y }, [packed])
    })
  }

  private updateLabels(pose: Pose) {
    if (pose.altitude > 0.38 || !this.places.length) { this.overlay.replaceChildren(); this.labels.clear(); return }
    const selected = new Set<Place>()
    const occupied: { x: number; y: number }[] = []
    const width = this.overlay.clientWidth
    const height = this.overlay.clientHeight
    const v = new Vector3()
    const nearby = this.places
      .map((place) => ({ place, distance: angle(pose, place.lat, place.lng) }))
      .filter(({ distance }) => distance < Math.min(52, 8 + pose.altitude * 100))
      .sort((a, b) => Number(b.place.capital) - Number(a.place.capital) || b.place.population - a.place.population || a.place.name.localeCompare(b.place.name))
    for (const { place } of nearby) {
      if (selected.size >= (pose.altitude < 0.16 ? 36 : 24)) break
      const xyz: number[] = []
      polarToXYZ(place.lat, place.lng, GLOBE_RADIUS, xyz)
      const anchor = this.labels.get(place)?.anchor ?? new Vector3(...xyz as [number, number, number])
      const screen = projectPlace(anchor, this.camera, width, height, v)
      if (!screen) continue
      const { x, y } = screen
      if (x < 35 || x > width - 35 || y < 35 || y > height - 35) continue
      if (occupied.some((p) => Math.abs(p.x - x) < 90 && Math.abs(p.y - y) < 25)) continue
      occupied.push({ x, y })
      selected.add(place)
      if (!this.labels.has(place)) {
        const element = document.createElement('div')
        element.className = 'globe-place-label'
        element.textContent = place.name
        element.dataset.lat = String(place.lat)
        element.dataset.lng = String(place.lng)
        element.style.visibility = 'hidden'
        this.overlay.appendChild(element)
        this.labels.set(place, { element, anchor })
      }
    }
    for (const [place, label] of this.labels) if (!selected.has(place)) { label.element.remove(); this.labels.delete(place) }
  }

  /** Run once per rendered frame, independently of tile loading and collision/selection throttles. */
  projectLabels() {
    if (!this.active || !this.enabled) return
    const width = this.overlay.clientWidth; const height = this.overlay.clientHeight
    for (const { element, anchor } of this.labels.values()) {
      const screen = projectPlace(anchor, this.camera, width, height, this.projection)
      element.style.visibility = screen ? 'visible' : 'hidden'
      if (screen) element.style.transform = `translate(${screen.x.toFixed(2)}px, ${screen.y.toFixed(2)}px) translate(-50%, -50%)`
    }
  }

  private hide() {
    if (!this.active) return
    this.active = false
    this.fullBorderCoverage = false
    this.tiles.setWanted([])
    this.group.clear()
    this.overlay.replaceChildren()
    this.labels.clear()
    this.requestRender()
  }

  dispose() {
    this.disposed = true
    this.worker?.terminate()
    for (const done of this.pending.values()) done(new Float32Array())
    this.pending.clear()
    this.group.removeFromParent()
    this.overlay.remove()
    this.tiles.dispose()
    Object.values(this.materials).forEach((m) => m.dispose())
  }
}
