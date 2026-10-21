import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { BORDER_SURFACE, clipSegment, decodeBorders } from '../osmGeometry'
import { viewportTiles } from '../osmViewport'

describe('camera-local OSM borders', () => {
  it('keeps date-line requests local and enforces the tile budget', () => {
    const keys = viewportTiles(178, 182, -4, 4, 40)
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.length).toBeLessThanOrEqual(40)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.some((key) => key.split('/')[1] === '0')).toBe(true)
    expect(viewportTiles(-30, 30, 80, 89, 40)).toEqual([])
    expect(viewportTiles(-170, 170, -50, 50, 40)).toEqual([])
  })

  it('clips buffered lines without inventing coast segments outside the tile', () => {
    expect(clipSegment(-10, 20, 110, 20, 100)).toEqual([0, 20, 100, 20])
    expect(clipSegment(-10, -10, -2, 80, 100)).toBeNull()
  })

  it('projects an actual OSM international boundary to its geographic surface position', () => {
    const bytes = readFileSync(resolve('src/lib/__tests__/fixtures/osm-6-34-21.pbf'))
    const buffer = Uint8Array.from(bytes).buffer
    const source = new VectorTile(new PbfReader(buffer)).layers.boundary
    let first: { x: number; y: number } | undefined
    for (let i = 0; i < source.length; i++) {
      const f = source.feature(i)
      if (Number(f.properties.admin_level) === 2 && Number(f.properties.maritime ?? 0) === 0 && Number(f.properties.disputed ?? 0) !== 1) {
        first = f.loadGeometry().flat().find((p) => p.x >= 0 && p.x <= source.extent && p.y >= 0 && p.y <= source.extent)
        if (first) break
      }
    }
    expect(first).toBeDefined()
    const tile = decodeBorders(buffer, 6, 34, 21)
    expect(tile.borders.length).toBeGreaterThan(100)
    const lng = ((34 + first!.x / source.extent) / 64 * 360 - 180) * Math.PI / 180
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (21 + first!.y / source.extent) / 64)))
    const expected = [BORDER_SURFACE * Math.cos(lat) * Math.sin(lng), BORDER_SURFACE * Math.sin(lat), BORDER_SURFACE * Math.cos(lat) * Math.cos(lng)]
    let nearest = Infinity
    for (let i = 0; i < tile.borders.length; i += 3) {
      nearest = Math.min(nearest, Math.hypot(...expected.map((v, j) => v - tile.borders[i + j])))
      expect(Math.hypot(...tile.borders.slice(i, i + 3))).toBeCloseTo(BORDER_SURFACE, 4)
    }
    expect(nearest).toBeLessThan(0.00001)
    expect(() => decodeBorders(new Uint8Array([255, 255]).buffer, 6, 34, 21)).toThrow()
  })
})
