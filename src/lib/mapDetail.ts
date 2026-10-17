import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, PerspectiveCamera, Scene, Vector3 } from 'three'
import type { Pose } from '@/lib/geo'
import { GLOBE_RADIUS, polarToXYZ } from '@/lib/globeLayers'

type Kind = 'borders' | 'admin1' | 'rivers' | 'lakes'
type Manifest = { cols: number; rows: number; step: number; kinds: Record<Kind, Record<string, number>> }
type Place = { name: string; lng: number; lat: number; population: number; capital: boolean }
type Tile = { mesh: LineSegments; used: number }
const BASE = `${import.meta.env.BASE_URL}data/map-detail/`
const MAX_CACHE = 40
const MAX_REQUESTS = 6
const LIMITS: Record<Kind, number> = { borders: 18, admin1: 5, rivers: 5, lakes: 5 }
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
  private labels: HTMLDivElement[] = []
  private overlay: HTMLDivElement
  private cache = new Map<string, Tile>()
  private wanted = new Set<string>()
  private queue: string[] = []
  private loading = new Set<string>()
  private failed = new Set<string>()
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
  }

  constructor(scene: Scene, private camera: PerspectiveCamera, container: HTMLElement, private requestRender: () => void, private lowEnd = false) {
    this.group.renderOrder = 1
    scene.add(this.group)
    this.overlay = document.createElement('div')
    this.overlay.className = 'globe-place-labels'
    container.appendChild(this.overlay)
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
    this.requestRender()
  }

  coversBorders() {
    const borderTiles = [...this.wanted].filter((key) => key.startsWith('borders/'))
    return this.enabled && this.fullBorderCoverage && borderTiles.length > 0 && borderTiles.every((key) => this.cache.has(key))
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
    const horizon = Math.acos(1 / (1 + pose.altitude)) / RAD + 25
    const candidates: { tile: string; distance: number }[] = []
    for (let y = 0; y < this.manifest.rows; y++) for (let x = 0; x < this.manifest.cols; x++) {
      const tile = `${x}-${y}`
      const lat = 90 - (y + 0.5) * this.manifest.step
      const lng = -180 + (x + 0.5) * this.manifest.step
      const distance = angle(pose, lat, lng)
      if (distance <= horizon) candidates.push({ tile, distance })
    }
    candidates.sort((a, b) => a.distance - b.distance)
    const limits = this.lowEnd ? { borders: 8, admin1: 2, rivers: 2, lakes: 2 } : LIMITS
    this.fullBorderCoverage = candidates.filter(({ tile }) => this.manifest!.kinds.borders?.[tile]).length <= limits.borders
    for (const kind of ['borders', 'admin1', 'rivers', 'lakes'] as Kind[]) {
      let count = 0
      for (const { tile } of candidates) {
        if (count >= limits[kind]) break
        if (kind === 'admin1' && pose.altitude > 0.34) continue
        if ((kind === 'rivers' || kind === 'lakes') && pose.altitude > 0.5) continue
        if (this.manifest.kinds[kind]?.[tile]) { want.add(`${kind}/${tile}`); count++ }
      }
    }
    this.wanted = want
    for (const [key, entry] of this.cache) {
      if (want.has(key)) { entry.used = now; this.group.add(entry.mesh) }
      else this.group.remove(entry.mesh)
    }
    this.queue = [...want].filter((key) => !this.cache.has(key) && !this.loading.has(key) && !this.failed.has(key))
    this.pump()
    this.trim()
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
    } catch {
      // The 1:50m base map remains usable when an optional detail tile is unavailable.
    }
  }

  private pump() {
    while (!this.disposed && this.loading.size < MAX_REQUESTS && this.queue.length) {
      const key = this.queue.shift()!
      if (!this.wanted.has(key) || this.loading.has(key)) continue
      this.loading.add(key)
      this.loadTile(key).finally(() => { this.loading.delete(key); this.pump() })
    }
  }

  private async loadTile(key: string) {
    try {
      const response = await fetch(`${BASE}${key}.bin`)
      if (!response.ok) { this.failed.add(key); return }
      const packed = await response.arrayBuffer()
      if (this.disposed || !this.wanted.has(key)) return
      const [kind, tile] = key.split('/') as [Kind, string]
      const [x, y] = tile.split('-').map(Number)
      const positions = await this.decode(packed, x, y)
      if (this.disposed || !this.wanted.has(key)) return
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
      geometry.computeBoundingSphere()
      const mesh = new LineSegments(geometry, this.materials[kind])
      mesh.renderOrder = 1
      mesh.raycast = () => {}
      this.cache.set(key, { mesh, used: performance.now() })
      this.group.add(mesh)
      this.trim()
      this.requestRender()
    } catch { this.failed.add(key) /* keep the base map if a tile fails */ }
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
    if (pose.altitude > 0.38 || !this.places.length) { this.overlay.replaceChildren(); this.labels = []; return }
    const selected: { place: Place; x: number; y: number }[] = []
    const occupied: { x: number; y: number }[] = []
    const width = this.overlay.clientWidth
    const height = this.overlay.clientHeight
    const v = new Vector3()
    for (const place of this.places) {
      if (selected.length >= 24) break
      if (angle(pose, place.lat, place.lng) > 52) continue
      const xyz: number[] = []
      polarToXYZ(place.lat, place.lng, GLOBE_RADIUS * 1.01, xyz)
      v.set(xyz[0], xyz[1], xyz[2]).project(this.camera)
      const x = (v.x + 1) * width / 2
      const y = (1 - v.y) * height / 2
      if (v.z > 1 || x < 35 || x > width - 35 || y < 35 || y > height - 35) continue
      if (occupied.some((p) => Math.abs(p.x - x) < 90 && Math.abs(p.y - y) < 25)) continue
      occupied.push({ x, y })
      selected.push({ place, x, y })
    }
    while (this.labels.length < selected.length) {
      const el = document.createElement('div')
      el.className = 'globe-place-label'
      this.overlay.appendChild(el)
      this.labels.push(el)
    }
    while (this.labels.length > selected.length) this.labels.pop()!.remove()
    selected.forEach(({ place, x, y }, i) => {
      const el = this.labels[i]
      el.textContent = place.name
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`
    })
  }

  private trim() {
    if (this.cache.size <= MAX_CACHE) return
    const stale = [...this.cache].filter(([key]) => !this.wanted.has(key)).sort((a, b) => a[1].used - b[1].used)
    for (const [key, entry] of stale.slice(0, this.cache.size - MAX_CACHE)) {
      this.group.remove(entry.mesh)
      entry.mesh.geometry.dispose()
      this.cache.delete(key)
    }
  }

  private hide() {
    if (!this.active) return
    this.active = false
    this.wanted.clear()
    this.queue.length = 0
    this.group.clear()
    this.overlay.replaceChildren()
    this.labels = []
    this.requestRender()
  }

  dispose() {
    this.disposed = true
    this.worker?.terminate()
    for (const done of this.pending.values()) done(new Float32Array())
    this.pending.clear()
    this.group.removeFromParent()
    this.overlay.remove()
    for (const { mesh } of this.cache.values()) mesh.geometry.dispose()
    Object.values(this.materials).forEach((m) => m.dispose())
    this.cache.clear()
  }
}
