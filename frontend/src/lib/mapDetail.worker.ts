// Decode quantised line tiles away from the rendering thread. One tile is transferred, never copied.
self.onmessage = (event: MessageEvent<{ id: number; packed: ArrayBuffer; x: number; y: number }>) => {
  const { id, packed, x, y } = event.data
  const numbers = new Int16Array(packed)
  const positions = new Float32Array(numbers.length / 4 * 6)
  const west = -180 + x * 30
  const north = 90 - y * 30
  const radius = 100 * 1.0038
  const toXYZ = (lat: number, lng: number, at: number) => {
    const phi = (90 - lat) * Math.PI / 180
    const theta = (90 - lng) * Math.PI / 180
    const s = Math.sin(phi)
    positions[at] = radius * s * Math.cos(theta)
    positions[at + 1] = radius * Math.cos(phi)
    positions[at + 2] = radius * s * Math.sin(theta)
  }
  for (let i = 0, j = 0; i < numbers.length; i += 4, j += 6) {
    toXYZ(north - numbers[i + 1] / 1000, west + numbers[i] / 1000, j)
    toXYZ(north - numbers[i + 3] / 1000, west + numbers[i + 2] / 1000, j + 3)
  }
  self.postMessage({ id, positions }, { transfer: [positions.buffer] })
}
