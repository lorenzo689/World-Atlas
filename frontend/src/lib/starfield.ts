import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Group, Mesh, Points, ShaderMaterial, SphereGeometry, Vector3 } from 'three'

/**
 * The real night sky around the globe:
 *  - stars from the Yale Bright Star Catalogue (public/data/stars.bin, built by
 *    scripts/build-stars.mjs): every naked-eye star at its J2000 position, sized by brightness and
 *    coloured by its B–V index. Points have a fixed pixel size, so they stay crisp at any zoom.
 *  - a soft Milky Way band, computed in a shader from galactic latitude/longitude, so it lies where
 *    the galactic plane really is (centre in Sagittarius).
 * The celestial pole is aligned with the globe's axis (+Y), like the real sky. The globe does not
 * model sidereal time, so right ascension is anchored at an arbitrary meridian.
 */
const SKY_RADIUS = 1900 // inside the camera's far plane (3000) from every camera position

/** Same convention as polarToXYZ in globeLayers.ts: declination as latitude, RA as longitude. */
function toXYZ(raDeg: number, decDeg: number, r: number): Vector3 {
  const phi = ((90 - decDeg) * Math.PI) / 180
  const theta = ((90 - raDeg) * Math.PI) / 180
  return new Vector3(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta))
}

/** Approximate star colour from the B–V colour index (blue-white … white … orange-red). */
export function starColor(bv: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [-0.3, [0.62, 0.72, 1.0]], [0.0, [0.85, 0.9, 1.0]], [0.4, [1.0, 1.0, 1.0]],
    [0.8, [1.0, 0.94, 0.82]], [1.2, [1.0, 0.82, 0.6]], [2.0, [1.0, 0.66, 0.45]],
  ]
  if (bv <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    if (bv <= stops[i][0]) {
      const [x0, c0] = stops[i - 1], [x1, c1] = stops[i]
      const t = (bv - x0) / (x1 - x0)
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t]
    }
  }
  return stops.at(-1)![1]
}

/** Pixel size and opacity from visual magnitude (Sirius −1.46 … the faintest naked-eye stars ~6.5). */
export function starAppearance(mag: number): { size: number; alpha: number } {
  return { size: Math.min(8, Math.max(1.3, 6.2 - 0.7 * mag)), alpha: Math.min(1, Math.max(0.45, 1.3 - 0.12 * mag)) }
}

export function createStarfield(data: Float32Array, pixelRatio: number): Group {
  const count = data.length / 4
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 4)
  const sizes = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const ra = (data[i * 4] * 180) / Math.PI, dec = (data[i * 4 + 1] * 180) / Math.PI
    const p = toXYZ(ra, dec, SKY_RADIUS)
    positions.set([p.x, p.y, p.z], i * 3)
    const { size, alpha } = starAppearance(data[i * 4 + 2])
    const [r, g, b] = starColor(data[i * 4 + 3])
    colors.set([r, g, b, alpha], i * 4)
    sizes[i] = size * pixelRatio
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('aColor', new BufferAttribute(colors, 4))
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1))
  const stars = new Points(geometry, new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec4 aColor; attribute float aSize; varying vec4 vColor;
      void main() { vColor = aColor; gl_PointSize = aSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec4 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float core = smoothstep(0.55, 0.0, d);          // bright centre
        float halo = smoothstep(1.0, 0.2, d) * 0.35;    // soft glow around it
        gl_FragColor = vec4(vColor.rgb, vColor.a * (core + halo));
      }`,
  }))
  stars.frustumCulled = false
  stars.renderOrder = -2
  stars.raycast = () => {}

  // Galactic north pole and centre (IAU, J2000) in the same frame as the stars.
  const pole = toXYZ(192.85948, 27.12825, 1).normalize()
  const centre = toXYZ(266.40499, -28.93617, 1).normalize()
  const milkyWay = new Mesh(new SphereGeometry(SKY_RADIUS * 1.02, 64, 32), new ShaderMaterial({
    side: BackSide, transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uPole: { value: pole }, uCentre: { value: centre }, uThird: { value: new Vector3().crossVectors(pole, centre).normalize() } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uPole; uniform vec3 uCentre; uniform vec3 uThird; varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir);
        float b = asin(clamp(dot(d, uPole), -1.0, 1.0));          // galactic latitude
        float l = atan(dot(d, uThird), dot(d, uCentre));            // galactic longitude, 0 at the centre
        float band = exp(-pow(b / 0.16, 2.0));
        float bulge = 0.45 + 0.55 * exp(-pow(l / 0.75, 2.0)) * exp(-pow(b / 0.22, 2.0));
        float clouds = 0.45 + 0.75 * fbm(d * 7.0);
        float dust = 1.0 - 0.55 * exp(-pow((b - 0.012) / 0.03, 2.0)) * smoothstep(1.6, 0.0, abs(l)) * fbm(d * 13.0 + 3.0);
        float glow = band * bulge * clouds * dust;
        // Faint star dust: statistical, not catalogued. Density rises towards the galactic plane like
        // the real sky; the catalogued naked-eye stars are drawn as points on top.
        vec3 cell = floor(d * 900.0);
        float r = hash(cell);
        float threshold = 0.9965 - 0.006 * band * bulge;
        float speck = step(threshold, r) * (0.35 + 0.65 * hash(cell + 17.0));
        vec3 speckColor = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.88, 0.72), hash(cell + 5.0));
        gl_FragColor = vec4(vec3(0.62, 0.68, 0.86) * glow * 0.36 + speckColor * speck * 0.55, 1.0);
      }`,
  }))
  milkyWay.renderOrder = -3
  milkyWay.raycast = () => {}

  const group = new Group()
  group.add(milkyWay, stars)
  return group
}
