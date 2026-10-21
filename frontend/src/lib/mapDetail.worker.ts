// Decode quantised line tiles away from the rendering thread. One tile is transferred, never copied.
self.onmessage = (event: MessageEvent<{ id: number; packed: ArrayBuffer; x: number; y: number }>) => {
  const { id, packed, x, y } = event.data
  const numbers = new Int16Array(packed)
  const points: number[] = []
  const west = -180 + x * 30
  const north = 90 - y * 30
  const radius = 100 * 1.0038
  const toXYZ = (lat: number, lng: number) => {
    const phi = (90 - lat) * Math.PI / 180
    const theta = (90 - lng) * Math.PI / 180
    const s = Math.sin(phi)
    points.push(radius * s * Math.cos(theta), radius * Math.cos(phi), radius * s * Math.sin(theta))
  }
  for (let i = 0; i < numbers.length; i += 4) {
    const aLat = north - numbers[i + 1] / 1000; const aLng = west + numbers[i] / 1000
    const bLat = north - numbers[i + 3] / 1000; const bLng = west + numbers[i + 2] / 1000
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bLat - aLat), Math.abs(bLng - aLng)) / 0.06))
    for (let k = 0; k < steps; k++) {
      toXYZ(aLat + (bLat - aLat) * k / steps, aLng + (bLng - aLng) * k / steps)
      toXYZ(aLat + (bLat - aLat) * (k + 1) / steps, aLng + (bLng - aLng) * (k + 1) / steps)
    }
  }
  const positions = new Float32Array(points)
  self.postMessage({ id, positions }, { transfer: [positions.buffer] })
}
