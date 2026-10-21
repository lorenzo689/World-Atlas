import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, PerspectiveCamera, Ray, Scene, Sphere, Vector3 } from 'three'
import { TileStore } from './tileStore'
import type { BorderTile } from './osmGeometry'
import { viewportTiles } from './osmViewport'
import type { Pose } from './geo'
const BORDER_SURFACE = 100.0005

/** Modern borders only. Network/decode work is bounded and the local map remains the fallback. */
export class OsmBorders {
  private group = new Group()
  private store: TileStore<BorderTile>
  private worker: Worker | null = null
  private pending = new Map<number, { resolve: (tile: BorderTile) => void; reject: (error: Error) => void }>()
  private id = 0
  private template: string | null = null
  private sourceRequest: Promise<void> | null = null
  private controller = new AbortController()
  private disposed = false
  private ready = false
  private signature = ''
  private dirty = true
  private lastUpdate = 0
  private credit: HTMLDivElement
  private meshes = (['borders', 'disputed', 'coast'] as const).map((kind) => {
    const material = new LineBasicMaterial({ color: kind === 'disputed' ? '#ffc66d' : '#d6e7ff', transparent: true, opacity: kind === 'coast' ? 0.65 : 0.9, depthWrite: false })
    const mesh = new LineSegments(new BufferGeometry(), material)
    mesh.raycast = () => {}
    return { kind, mesh }
  })

  constructor(scene: Scene, private camera: PerspectiveCamera, container: HTMLElement, private render: () => void, private lowEnd: boolean) {
    scene.add(this.group)
    for (const { mesh } of this.meshes) this.group.add(mesh)
    this.group.visible = false
    this.credit = document.createElement('div')
    this.credit.className = 'globe-border-credit'
    this.credit.hidden = true
    for (const [label, url] of [['OpenFreeMap', 'https://openfreemap.org/'], ['OpenMapTiles', 'https://openmaptiles.org/'], ['© OpenStreetMap', 'https://www.openstreetmap.org/copyright']]) {
      const link = document.createElement('a'); link.textContent = label; link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'
      this.credit.append(link, document.createTextNode(' · '))
    }
    this.credit.append(document.createTextNode('Amber: disputed boundary'))
    container.append(this.credit)
    this.store = new TileStore({ maxCache: lowEnd ? 32 : 64, maxRequests: 4,
      load: (key, signal) => this.load(key, signal), dispose: () => {},
      onLoaded: () => { this.dirty = true; this.render() },
    })
  }

  setSatellite(satellite: boolean) {
    this.group.scale.setScalar((satellite ? BORDER_SURFACE : 100.305) / BORDER_SURFACE)
    for (const { kind, mesh } of this.meshes) if (kind !== 'disputed') mesh.material.color.set(satellite ? '#d6e7ff' : '#172136')
  }

  update(pose: Pose, enabled: boolean) {
    if (this.disposed) return
    if (!enabled || pose.altitude > 0.45) { this.hide(); return }
    if (!this.template) {
      this.sourceRequest ??= this.loadSource()
      return
    }
    if (performance.now() - this.lastUpdate < 120) return
    this.lastUpdate = performance.now()
    const hit = new Vector3(); const direction = new Vector3(); const ray = new Ray(); const sphere = new Sphere(new Vector3(), 100)
    let west = Infinity; let east = -Infinity; let south = Infinity; let north = -Infinity
    for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) {
      direction.set(x, y, 0.5).unproject(this.camera).sub(this.camera.position).normalize()
      ray.set(this.camera.position, direction)
      if (!ray.intersectSphere(sphere, hit)) { this.hide(); return }
      const lat = Math.asin(hit.y / 100) * 180 / Math.PI
      let lng = Math.atan2(hit.x, hit.z) * 180 / Math.PI
      lng = pose.lng + ((lng - pose.lng + 540) % 360) - 180
      west = Math.min(west, lng); east = Math.max(east, lng); south = Math.min(south, lat); north = Math.max(north, lat)
    }
    const keys = viewportTiles(west - 0.15, east + 0.15, south - 0.15, north + 0.15, this.lowEnd ? 20 : 40)
    const signature = keys.join(',')
    if (signature !== this.signature) { this.signature = signature; this.dirty = true }
    this.store.setWanted(keys)
    this.refresh()
  }

  private refresh() {
    if (!this.dirty) return
    const keys = [...this.store.wantedKeys()]
    const complete = keys.length > 0 && keys.every((key) => this.store.has(key))
    // A pathological coastal tile must not turn a bounded request count into unbounded GPU work.
    const floats = complete ? keys.reduce((sum, key) => {
      const tile = this.store.get(key)!
      return sum + tile.borders.length + tile.disputed.length + tile.coast.length
    }, 0) : 0
    const ready = complete && floats <= 2_000_000
    if (ready && this.dirty) {
      for (const { kind, mesh } of this.meshes) {
        const arrays = keys.map((key) => this.store.get(key)![kind])
        const joined = new Float32Array(arrays.reduce((sum, a) => sum + a.length, 0))
        let offset = 0
        for (const a of arrays) { joined.set(a, offset); offset += a.length }
        const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(joined, 3)); geometry.computeBoundingSphere()
        mesh.geometry.dispose(); mesh.geometry = geometry
      }
      this.dirty = false
    }
    if (this.ready !== ready) this.render()
    this.ready = ready; this.group.visible = ready; this.credit.hidden = !ready
  }

  private async loadSource() {
    try {
      const response = await fetch('https://tiles.openfreemap.org/planet', { signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(10000)]) })
      if (!response.ok) return
      const source = await response.json()
      const template = source.tiles?.[0]
      if (typeof template !== 'string' || !/^https:\/\/tiles\.openfreemap\.org\/planet\/[\w-]+\/\{z\}\/\{x\}\/\{y\}\.pbf$/.test(template)) return
      if (this.disposed) return
      this.template = template; this.render()
    } catch { /* Offline: retain the packaged Natural Earth data. */ }
  }

  private async load(key: string, signal: AbortSignal): Promise<BorderTile> {
    const [z, x, y] = key.split('/').map(Number)
    const url = this.template!.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) })
    if (!response.ok) throw Error('Border tile unavailable')
    const packed = await response.arrayBuffer()
    if (signal.aborted || packed.byteLength > 8_000_000) throw Error('Border tile cancelled or oversized')
    if (!this.worker) {
      this.worker = new Worker(new URL('./osmBorders.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (event: MessageEvent<{ id: number; tile: BorderTile; error?: string }>) => {
        const task = this.pending.get(event.data.id); this.pending.delete(event.data.id)
        if (event.data.error) task?.reject(Error(event.data.error)); else task?.resolve(event.data.tile)
      }
      this.worker.onerror = () => {
        for (const task of this.pending.values()) task.reject(Error('Border decoder unavailable'))
        this.pending.clear(); this.worker?.terminate(); this.worker = null
      }
    }
    return new Promise((resolve, reject) => {
      const id = ++this.id; this.pending.set(id, { resolve, reject })
      this.worker!.postMessage({ id, packed, z, x, y }, [packed])
    })
  }

  coversBorders() { this.refresh(); return this.ready }
  getDiagnostics() { return { osmReady: this.ready, osmTiles: this.store.wantedKeys().size } }
  hide() {
    this.store.setWanted([]); this.ready = false; this.group.visible = false; this.credit.hidden = true
    this.signature = ''; this.dirty = true
  }
  dispose() {
    this.disposed = true; this.controller.abort(); this.store.dispose(); this.worker?.terminate()
    for (const task of this.pending.values()) task.reject(Error('Border layer disposed'))
    this.pending.clear(); this.group.removeFromParent(); this.credit.remove()
    for (const { mesh } of this.meshes) { mesh.geometry.dispose(); mesh.material.dispose() }
  }
}
