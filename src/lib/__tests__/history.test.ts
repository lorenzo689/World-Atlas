import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { geoCentroid } from 'd3-geo'
import { describe, expect, it } from 'vitest'
import { flagAtYear, snapshotForYear, type HistoryData } from '../history'
import { changedEntities, readHistoryLink } from '../historyCompare'

const asset = (name: string) => readFileSync(resolve(process.cwd(), 'public/data', name))
const metadata = JSON.parse(asset('historical-geometry.json').toString()) as {
  vertices: number
  indices: number
  ranges: [number, number, number, number, number][]
}
const binary = asset('historical-geometry.bin')
const buffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength)
const data: HistoryData = {
  topology: JSON.parse(asset('historical-topology.json').toString()),
  geometry: {
    lnglat: new Float32Array(buffer, 0, metadata.vertices * 2),
    indices: (() => {
      const local = new Uint16Array(buffer, metadata.vertices * 8, metadata.indices)
      const global = new Uint32Array(local.length)
      for (const [, vStart, , iStart, iCount] of metadata.ranges) {
        for (let i = iStart; i < iStart + iCount; i++) global[i] = local[i] + vStart
      }
      return global
    })(),
    ranges: metadata.ranges,
  },
  flags: JSON.parse(asset('historical-flags.json').toString()),
}

describe('historical globe snapshots', () => {
  it('changes the German borders and flags after reunification', () => {
    const before = snapshotForYear(data, 1990)
    const after = snapshotForYear(data, 1991)
    expect(before.entities.get('H260')?.name).toBe('West Germany')
    expect(before.entities.get('H265')?.name).toBe('East Germany')
    expect(before.entities.get('H265')?.flagFile).toBe('Flag of East Germany.svg')
    const eastGermany = before.boundaries.features.find((feature) => feature.properties.code === 'H265')!
    const [lng, lat] = geoCentroid(eastGermany)
    expect(lng).toBeGreaterThan(10)
    expect(lng).toBeLessThan(16)
    expect(lat).toBeGreaterThan(50)
    expect(lat).toBeLessThan(55)
    expect(after.entities.get('H260')?.name).toBe('Germany')
    expect(after.entities.has('H265')).toBe(false)
    expect(before.boundaries.borders).not.toEqual(after.boundaries.borders)
  })

  it('switches the Soviet and Russian flag on the dated transition', () => {
    expect(snapshotForYear(data, 1991).entities.get('H365')?.flagFile).toBe('Flag of the Soviet Union.svg')
    expect(snapshotForYear(data, 1992).entities.get('H365')?.flagFile).toBe('Flag of Russia (1991–1993).svg')
  })

  it('provides valid GPU ranges for each active state', () => {
    const snapshot = snapshotForYear(data, 1945)
    const geometry = snapshot.boundaries.geometry!
    expect(geometry.ranges.length).toBe(snapshot.boundaries.features.length)
    for (const [, start, count, indexStart, indexCount] of geometry.ranges) {
      expect(start + count).toBeLessThanOrEqual(geometry.lnglat.length / 2)
      expect(indexStart + indexCount).toBeLessThanOrEqual(geometry.indices.length)
    }
    let maxIndex = 0
    for (const index of geometry.indices) maxIndex = Math.max(maxIndex, index)
    expect(maxIndex).toBeLessThan(geometry.lnglat.length / 2)
  })

  it('does not display a flag without a verified date', () => {
    expect(flagAtYear([{ file: 'current.svg', start: null, end: null }], 1900)).toBeNull()
  })

  it('marks changed source periods and safely parses share links', () => {
    const changed = changedEntities(snapshotForYear(data, 1990), snapshotForYear(data, 1991))
    expect(changed.has('H265')).toBe(true)
    expect(changed.has('H260')).toBe(true)
    expect(readHistoryLink('?year=1990&compare=1991')).toEqual({ year: 1990, compare: 1991 })
    expect(readHistoryLink('?year=9999&compare=oops')).toEqual({ year: null, compare: null })
  })
})
