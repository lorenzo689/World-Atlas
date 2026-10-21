import { decodeBorders } from './osmGeometry'
self.onmessage = (event: MessageEvent<{ id: number; packed: ArrayBuffer; z: number; x: number; y: number }>) => {
  const { id, packed, z, x, y } = event.data
  try {
    const tile = decodeBorders(packed, z, x, y)
    self.postMessage({ id, tile }, { transfer: [tile.borders.buffer, tile.disputed.buffer, tile.coast.buffer] })
  } catch { self.postMessage({ id, error: 'Invalid border tile' }) }
}
