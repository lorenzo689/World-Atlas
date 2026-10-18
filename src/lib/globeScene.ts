import {
  AmbientLight,
  BackSide,
  BufferAttribute,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  Mesh,
  MeshPhongMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  ShaderMaterial,
  Sphere,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Texture,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { CountryFeature, Pose } from '@/lib/geo'
import { BaseLayers, GLOBE_RADIUS, polarToXYZ, xyzToPolar, type PrecomputedGeometry } from '@/lib/globeLayers'
import { perfFrame } from '@/lib/perf'
import { MapDetail } from '@/lib/mapDetail'
import { ImageDetail } from '@/lib/imageDetail'

const OCEAN = '#0b1626'
const MIN_DPR = 1

export interface SceneTextures {
  day: string
  bump: string
  water: string
  sky: string
}

export interface SceneCallbacks {
  onPose(pose: Pose): void
  /** Hover changed (code or null). x/y are relative to the canvas. */
  onHover(code: string | null, x: number, y: number): void
  onClick(code: string): void
  onGlobeClick?(lat: number, lng: number): boolean
  onReady(): void
}

export interface SceneOptions {
  textures: SceneTextures
  features: CountryFeature[]
  borders?: number[][][]
  precomputed?: PrecomputedGeometry | null
  satellite: boolean
  detailEnabled?: boolean
  detailLowEnd?: boolean
  imageDetailEnabled?: boolean
  /** Disable the frame-time governor (reproducible perf runs). */
  fixedQuality?: boolean
  reducedMotion?: boolean
}

// Atmosphere glow: Fresnel shader adapted from three-globe (MIT, vasturiano).
const GLOW_VERTEX = `
uniform float hollowRadius;
varying vec3 vVertexWorldPosition;
varying vec3 vVertexNormal;
varying float vCameraDistanceToObjCenter;
varying float vVertexAngularDistanceToHollowRadius;
void main() {
  vVertexNormal = normalize(normalMatrix * normal);
  vVertexWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 objCenterViewPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vCameraDistanceToObjCenter = length(objCenterViewPosition);
  float edgeAngle = atan(hollowRadius / vCameraDistanceToObjCenter);
  float vertexAngle = acos(dot(normalize(modelViewMatrix * vec4(position, 1.0)), normalize(objCenterViewPosition)));
  vVertexAngularDistanceToHollowRadius = vertexAngle - edgeAngle;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const GLOW_FRAGMENT = `
uniform vec3 color;
uniform float coefficient;
uniform float power;
uniform float hollowRadius;
varying vec3 vVertexNormal;
varying vec3 vVertexWorldPosition;
varying float vCameraDistanceToObjCenter;
varying float vVertexAngularDistanceToHollowRadius;
void main() {
  if (vCameraDistanceToObjCenter < hollowRadius) discard;
  if (vVertexAngularDistanceToHollowRadius < 0.0) discard;
  vec3 worldCameraToVertex = vVertexWorldPosition - cameraPosition;
  vec3 viewCameraToVertex = (viewMatrix * vec4(worldCameraToVertex, 0.0)).xyz;
  viewCameraToVertex = normalize(viewCameraToVertex);
  float intensity = pow(coefficient + dot(vVertexNormal, viewCameraToVertex), power);
  gl_FragColor = vec4(color, intensity);
}`

const cubicInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * Plain three.js globe: one sphere, one atmosphere, the merged country layers and OrbitControls.
 *
 * The render loop runs on demand: it only schedules frames while something is moving (drag,
 * damping, camera tween, hover change) and goes completely idle otherwise.
 * An adaptive governor lowers the pixel ratio (and finally drops bump/specular) when frames
 * take too long.
 */
export class GlobeScene {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly camera: PerspectiveCamera
  readonly controls: OrbitControls
  layers: BaseLayers
  private detail: MapDetail
  private imageDetail: ImageDetail

  private canvas: HTMLCanvasElement
  private globe: Mesh
  private atmosphere: Mesh
  private satMaterial: MeshPhongMaterial
  private flatMaterial: MeshPhongMaterial
  private loader = new TextureLoader()
  private textures = new Map<string, Promise<Texture>>()
  private loaded: Texture[] = []

  private width = 1
  private height = 1
  private baseDpr: number
  private dpr: number
  private lite = false
  private satellite: boolean

  // loop state
  private raf = 0
  private needsRender = true
  private busyUntil = 0
  private pointerDown = false
  private disposed = false
  private readySent = false

  // camera tween
  private tween: { from: Pose; to: Pose; start: number; dur: number } | null = null
  // view offset (keeps the focused country centred beside the info panel)
  private inset = { x: 0, y: 0, tx: 0, ty: 0 }
  private reduced: boolean

  // hover / click
  private raycaster = new Raycaster()
  private sphere = new Sphere(new Vector3(), GLOBE_RADIUS)
  private ndc = new Vector2()
  private hit = new Vector3()
  private hoverCode: string | null = null
  private moveEvent: PointerEvent | null = null
  private moveRaf = 0
  private downAt = { x: 0, y: 0, t: 0 }

  // pose emission
  private poseTimer = 0
  private lastPose: Pose = { lat: 0, lng: 0, altitude: 2.3 }

  // governor
  private fixedQuality: boolean
  private lastRenderAt = 0
  private winSum = 0
  private winCount = 0
  private winStart = 0
  private calmWindows = 0
  private slowWindows = 0

  constructor(
    container: HTMLElement,
    private opts: SceneOptions,
    private cb: SceneCallbacks,
  ) {
    this.satellite = opts.satellite
    this.reduced = !!opts.reducedMotion
    this.fixedQuality = !!opts.fixedQuality
    const coarse = window.matchMedia?.('(pointer: coarse)').matches
    const rawDpr = window.devicePixelRatio || 1
    this.baseDpr = Math.min(rawDpr, coarse ? 1.5 : 2)
    this.dpr = this.baseDpr

    this.renderer = new WebGLRenderer({
      antialias: rawDpr < 1.5, // MSAA is wasted fill-rate on dense displays
      powerPreference: 'high-performance',
    })
    // Shader error checks call getProgramInfoLog right after linking, which blocks until the driver
    // has compiled the program (≈1.5 s for 9 programs on integrated GPUs). Keep them in dev only.
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV
    this.renderer.setPixelRatio(this.dpr)
    this.canvas = this.renderer.domElement
    this.canvas.style.display = 'block'
    this.canvas.style.cursor = 'grab'
    container.appendChild(this.canvas)

    this.camera = new PerspectiveCamera(50, 1, 1, 3000)
    this.camera.position.set(0, 0, GLOBE_RADIUS * 3.3)

    // lights as in globe.gl
    this.scene.add(new AmbientLight(0xcccccc, Math.PI))
    this.scene.add(new DirectionalLight(0xffffff, 0.6 * Math.PI))

    // globe
    const segments = coarse ? 48 : 64
    const geometry = new SphereGeometry(GLOBE_RADIUS, segments, segments / 2)
    this.flatMaterial = new MeshPhongMaterial({ color: new Color(OCEAN), specular: new Color('#0d1b2e'), shininess: 4 })
    this.satMaterial = new MeshPhongMaterial({ color: new Color(0x000000), specular: new Color('#35527a'), shininess: 14 })
    this.globe = new Mesh(geometry, this.satellite ? this.satMaterial : this.flatMaterial)
    this.globe.rotation.y = -Math.PI / 2 // prime meridian along +z
    this.globe.raycast = () => {}
    this.scene.add(this.globe)
    this.imageDetail = new ImageDetail(this.globe, this.camera, () => this.requestRender())
    this.imageDetail.setSatellite(this.satellite)
    this.imageDetail.setEnabled(opts.imageDetailEnabled !== false)

    // atmosphere
    const glowGeo = new SphereGeometry(GLOBE_RADIUS, 48, 24)
    const size = GLOBE_RADIUS * 0.17
    const p = glowGeo.attributes.position
    const n = glowGeo.attributes.normal
    const grown = new Float32Array(p.count * 3)
    for (let i = 0; i < grown.length; i++) grown[i] = p.array[i] + n.array[i] * size
    glowGeo.setAttribute('position', new BufferAttribute(grown, 3))
    this.atmosphere = new Mesh(
      glowGeo,
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        transparent: true,
        vertexShader: GLOW_VERTEX,
        fragmentShader: GLOW_FRAGMENT,
        uniforms: {
          coefficient: { value: 0.1 },
          color: { value: new Color('#5b9bff') },
          power: { value: 3.5 },
          hollowRadius: { value: GLOBE_RADIUS },
        },
      }),
    )
    this.atmosphere.raycast = () => {}
    this.scene.add(this.atmosphere)

    // countries
    this.layers = new BaseLayers(opts.features, opts.borders, opts.precomputed)
    this.scene.add(this.layers.group)
    this.detail = new MapDetail(this.scene, this.camera, container, () => this.requestRender(), opts.detailLowEnd)
    this.detail.setSatellite(this.satellite)
    this.detail.setEnabled(opts.detailEnabled !== false)

    // controls
    const c = (this.controls = new OrbitControls(this.camera, this.canvas))
    c.enablePan = false
    c.enableDamping = true
    c.dampingFactor = 0.08
    c.rotateSpeed = 0.3
    c.zoomSpeed = 0.3
    c.zoomToCursor = true
    c.minDistance = 108
    c.maxDistance = 520
    c.autoRotate = false
    c.addEventListener('change', this.onControlsChange)
    c.addEventListener('end', this.onControlsEnd)

    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerCancel)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerleave', this.onPointerLeave)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: true })

    // textures: sky + (day when satellite) gate "ready"; bump/specular stream in afterwards
    const needed: Promise<Texture>[] = [this.texture(opts.textures.sky, true).then((t) => this.setSky(t))]
    if (this.satellite) needed.push(this.loadSatellite())
    Promise.all(needed).then(async () => {
      if (this.disposed) return
      await this.warmUp()
      if (this.disposed) return
      this.needsRender = true
      this.wake(1000)
      if (!this.readySent) {
        this.readySent = true
        setTimeout(() => !this.disposed && this.cb.onReady(), 0)
      }
    })
    this.wake(500)
  }

  /** Swap the map without recreating WebGL, textures, controls or the current camera pose. */
  replaceMap(features: CountryFeature[], borders?: number[][][], precomputed?: PrecomputedGeometry | null) {
    this.scene.remove(this.layers.group)
    this.layers.dispose()
    this.layers = new BaseLayers(features, borders, precomputed)
    this.scene.add(this.layers.group)
    this.hoverCode = null
    this.cb.onHover(null, 0, 0)
    this.requestRender()
  }

  setMapDetailEnabled(enabled: boolean) {
    this.detail.setEnabled(enabled)
  }

  setImageDetailEnabled(enabled: boolean) {
    this.imageDetail.setEnabled(enabled)
  }

  // ---- textures --------------------------------------------------------------------------------
  private texture(url: string, srgb: boolean): Promise<Texture> {
    let p = this.textures.get(url)
    if (!p) {
      p = this.loader.loadAsync(url).then((t) => {
        if (srgb) t.colorSpace = SRGBColorSpace
        t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
        this.loaded.push(t)
        return t
      })
      this.textures.set(url, p)
    }
    return p
  }

  private setSky(t: Texture) {
    t.mapping = EquirectangularReflectionMapping
    this.scene.background = t
    return t
  }

  private async loadSatellite() {
    const day = await this.texture(this.opts.textures.day, true)
    const m = this.satMaterial
    m.map = day
    m.color = new Color(0xffffff)
    m.needsUpdate = true
    if (!this.lite) this.loadSatelliteDetail()
    return day
  }

  private loadSatelliteDetail() {
    const m = this.satMaterial
    this.texture(this.opts.textures.bump, false).then((t) => {
      if (this.disposed || this.lite) return
      m.bumpMap = t
      m.needsUpdate = true
      this.requestRender()
    })
    this.texture(this.opts.textures.water, false).then((t) => {
      if (this.disposed || this.lite) return
      m.specularMap = t
      m.needsUpdate = true
      this.requestRender()
    })
  }

  /**
   * Compile every program once (incl. hidden highlight/cap materials) so the first hover doesn't
   * hitch. Async: programs compile in parallel without blocking the main thread.
   */
  private async warmUp() {
    const l = this.layers
    const prev = [l.caps.visible, l.hover.group.visible, l.selected.group.visible]
    l.caps.visible = true
    l.hover.group.visible = true
    l.selected.group.visible = true
    try {
      // compileAsync collects the materials synchronously, so visibility can be restored right away
      const done = this.renderer.compileAsync(this.scene, this.camera)
      ;[l.caps.visible, l.hover.group.visible, l.selected.group.visible] = prev as [boolean, boolean, boolean]
      await done
    } catch {
      ;[l.caps.visible, l.hover.group.visible, l.selected.group.visible] = prev as [boolean, boolean, boolean]
    }
  }

  // ---- public API ------------------------------------------------------------------------------
  setSatellite(on: boolean) {
    this.detail.setSatellite(on)
    this.imageDetail.setSatellite(on)
    if (on === this.satellite) return
    this.satellite = on
    this.globe.material = on ? this.satMaterial : this.flatMaterial
    if (on) this.loadSatellite().then(() => this.wake(300))
    this.wake(300)
  }

  setSize(width: number, height: number) {
    if (width === this.width && height === this.height) return
    this.width = width
    this.height = height
    this.renderer.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.applyViewOffset()
    this.detail.update(this.getPose(), true)
    this.imageDetail.update(this.getPose(), true)
    this.wake(200)
  }

  /** Keeps the globe centred in the free area beside the info panel. */
  setInsets(right: number, bottom: number) {
    this.inset.tx = right / 2
    this.inset.ty = bottom / 2
    if (this.reduced) {
      this.inset.x = this.inset.tx
      this.inset.y = this.inset.ty
      this.applyViewOffset()
    }
    this.wake(1200)
  }

  private applyViewOffset() {
    const { x, y } = this.inset
    if (x === 0 && y === 0) this.camera.clearViewOffset()
    else this.camera.setViewOffset(this.width, this.height, x, y, this.width, this.height)
  }

  getPose(): Pose {
    return xyzToPolar(this.camera.position.x, this.camera.position.y, this.camera.position.z)
  }

  pointOfView(pose: Partial<Pose>, ms = 0) {
    const cur = this.getPose()
    const to = { ...cur, ...pose }
    this.tween = null
    if (!ms) {
      this.setCamera(to)
      this.requestRender()
      return
    }
    const from = { ...cur }
    while (from.lng - to.lng > 180) from.lng -= 360
    while (from.lng - to.lng < -180) from.lng += 360
    this.tween = { from, to, start: performance.now(), dur: ms }
    this.wake(ms + 200)
  }

  private setCamera(p: Pose) {
    const v: number[] = []
    polarToXYZ(p.lat, p.lng, GLOBE_RADIUS * (1 + p.altitude), v)
    this.camera.position.set(v[0], v[1], v[2])
    this.controls.update()
  }

  /** Client coordinates → lat/lng on the globe, or null if the pointer is off the sphere. */
  toGlobeCoords(clientX: number, clientY: number): { lat: number; lng: number } | null {
    const rect = this.canvas.getBoundingClientRect()
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    if (!this.raycaster.ray.intersectSphere(this.sphere, this.hit)) return null
    const { lat, lng } = xyzToPolar(this.hit.x, this.hit.y, this.hit.z)
    return { lat, lng }
  }

  requestRender() {
    this.needsRender = true
    if (!this.raf && !this.disposed) this.raf = requestAnimationFrame(this.tick)
  }

  getDetailDiagnostics() {
    return { ...this.detail.getDiagnostics(), baseBordersVisible: this.layers.borders.visible, autoRotate: this.controls.autoRotate }
  }

  /** Keep the loop alive for `ms` (damping tails, texture uploads, tweens …). */
  wake(ms = 0) {
    this.busyUntil = Math.max(this.busyUntil, performance.now() + ms)
    this.requestRender()
  }

  // ---- loop ------------------------------------------------------------------------------------
  private chained = false // true when this tick was scheduled by the previous tick (loop already running)

  private tick = (now: number) => {
    const chained = this.chained
    this.chained = false
    this.raf = 0
    if (this.disposed) return
    const t0 = performance.now()
    let moving = false

    if (this.tween) {
      const t = Math.min(1, (now - this.tween.start) / this.tween.dur)
      const e = cubicInOut(t)
      const { from, to } = this.tween
      this.setCamera({
        lat: from.lat + (to.lat - from.lat) * e,
        lng: from.lng + (to.lng - from.lng) * e,
        altitude: from.altitude + (to.altitude - from.altitude) * e,
      })
      moving = true
      if (t >= 1) this.tween = null
    }

    const { inset } = this
    if (inset.x !== inset.tx || inset.y !== inset.ty) {
      inset.x += (inset.tx - inset.x) * 0.12
      inset.y += (inset.ty - inset.y) * 0.12
      if (Math.abs(inset.tx - inset.x) < 0.4) inset.x = inset.tx
      if (Math.abs(inset.ty - inset.y) < 0.4) inset.y = inset.ty
      this.applyViewOffset()
      moving = true
    }

    if (this.controls.update()) moving = true

    this.detail.update(this.getPose())
    this.imageDetail.update(this.getPose())
    const detailedBorders = this.detail.coversBorders()
    this.layers.borders.visible = !detailedBorders
    this.layers.selected.setOutlineVisible(!detailedBorders)
    this.layers.hover.setOutlineVisible(!detailedBorders)
    this.layers.secondary.setOutlineVisible(!detailedBorders)

    if (this.needsRender || moving) {
      this.needsRender = false
      this.renderer.render(this.scene, this.camera)
      perfFrame(chained, performance.now() - t0)
      this.sampleFrame(now, moving)
    }

    const keep = moving || this.pointerDown || now < this.busyUntil || this.needsRender
    if (keep) {
      this.chained = true
      this.raf = requestAnimationFrame(this.tick)
    }
  }

  // ---- quality governor ------------------------------------------------------------------------
  private sampleFrame(now: number, continuous: boolean) {
    const dt = now - this.lastRenderAt
    this.lastRenderAt = now
    if (this.fixedQuality || !continuous || dt > 100 || dt <= 0) return
    if (!this.winStart) this.winStart = now
    this.winSum += dt
    this.winCount++
    if (now - this.winStart < 1000) return
    const avg = this.winSum / this.winCount
    const enough = this.winCount >= 20
    this.winSum = this.winCount = 0
    this.winStart = now
    if (!enough) return
    if (avg > 24) {
      this.calmWindows = 0
      if (this.dpr > MIN_DPR) this.setDpr(Math.max(MIN_DPR, this.dpr - 0.25))
      else if (++this.slowWindows >= 3) this.setLite(true)
    } else if (avg < 12) {
      this.slowWindows = 0
      if (++this.calmWindows >= 6 && this.dpr < this.baseDpr) {
        this.calmWindows = 0
        this.setDpr(Math.min(this.baseDpr, this.dpr + 0.25))
      }
    } else {
      this.calmWindows = 0
      this.slowWindows = 0
    }
  }

  private setDpr(v: number) {
    this.dpr = v
    this.renderer.setPixelRatio(v)
    this.needsRender = true
  }

  /** Last resort: drop bump + specular maps and the atmosphere. */
  private setLite(on: boolean) {
    if (this.lite === on) return
    this.lite = on
    this.imageDetail.setLite(on)
    const m = this.satMaterial
    if (on) {
      m.bumpMap = null
      m.specularMap = null
      m.shininess = 4
      this.atmosphere.visible = false
      m.needsUpdate = true
    }
    this.needsRender = true
  }

  // ---- input -----------------------------------------------------------------------------------
  private onControlsChange = () => {
    const c = this.controls
    c.target.setScalar(0)
    const pose = this.getPose()
    c.rotateSpeed = pose.altitude * 0.3
    c.zoomSpeed = Math.sqrt(pose.altitude) * 0.5
    this.lastPose = pose
    if (!this.poseTimer) {
      this.poseTimer = window.setTimeout(() => {
        this.poseTimer = 0
        this.cb.onPose(this.lastPose)
      }, 150)
    }
  }

  private onControlsEnd = () => {
    this.wake(1500) // let damping settle
    this.cb.onPose(this.getPose())
  }

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDown = true
    this.tween = null
    this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() }
    this.setHover(null, e)
    this.wake(500)
  }

  private onPointerUp = (e: PointerEvent) => {
    this.pointerDown = false
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y)
    if (moved < 5 && performance.now() - this.downAt.t < 600) {
      const g = this.toGlobeCoords(e.clientX, e.clientY)
      if (g && this.cb.onGlobeClick?.(g.lat, g.lng)) { this.wake(1500); return }
      const code = g ? this.layers.pick(g.lng, g.lat) : null
      if (code) this.cb.onClick(code)
    }
    this.wake(1500)
  }

  private onPointerCancel = () => {
    this.pointerDown = false
    this.wake(1500)
  }

  private onWheel = () => {
    this.wake(1500)
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.pointerDown || e.buttons !== 0) return
    this.moveEvent = e
    if (!this.moveRaf) {
      this.moveRaf = requestAnimationFrame(() => {
        this.moveRaf = 0
        const ev = this.moveEvent
        if (!ev || this.disposed) return
        const g = this.toGlobeCoords(ev.clientX, ev.clientY)
        this.setHover(g ? this.layers.pick(g.lng, g.lat) : null, ev)
      })
    }
  }

  private onPointerLeave = (e: PointerEvent) => this.setHover(null, e)

  private setHover(code: string | null, e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (code !== this.hoverCode) {
      this.hoverCode = code
      this.canvas.style.cursor = code ? 'pointer' : 'grab'
      this.layers.hover.set(code)
      this.requestRender()
    }
    this.cb.onHover(code, x, y)
  }

  /** Re-apply highlight state after styles/selection changed from outside. */
  refresh() {
    this.requestRender()
  }

  // ---- teardown --------------------------------------------------------------------------------
  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    cancelAnimationFrame(this.moveRaf)
    window.clearTimeout(this.poseTimer)
    this.controls.removeEventListener('change', this.onControlsChange)
    this.controls.removeEventListener('end', this.onControlsEnd)
    this.controls.dispose()
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.layers.dispose()
    this.detail.dispose()
    this.imageDetail.dispose()
    this.globe.geometry.dispose()
    this.atmosphere.geometry.dispose()
    ;(this.atmosphere.material as ShaderMaterial).dispose()
    this.satMaterial.dispose()
    this.flatMaterial.dispose()
    for (const t of this.loaded) t.dispose()
    this.scene.background = null
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.canvas.remove()
  }
}
