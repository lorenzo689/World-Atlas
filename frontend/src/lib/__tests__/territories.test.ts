import { describe, expect, it } from 'vitest'
import today from '../../../public/data/territories-today.json'
import history from '../../../public/data/territories-history.json'
import { pickTerritory, territorySnapshot, validateTerritories, type TerritoryDataset } from '../territories'

const current = today as TerritoryDataset
const historic = history as TerritoryDataset

describe('dated territorial control', () => {
  it('requires valid geometry, attribution, source dates and actor identity in shipped data', () => {
    expect(() => validateTerritories(current)).not.toThrow()
    expect(() => validateTerritories(historic)).not.toThrow()
    for (const data of [current, historic]) for (const snapshot of data.snapshots) {
      expect(snapshot.features.length).toBeGreaterThan(0)
      expect(snapshot.date <= new Date().toISOString().slice(0, 10)).toBe(true)
    }
  })
  it('has every supported war year and never substitutes another year', () => {
    for (let year = 1914; year <= 1918; year++) expect(territorySnapshot(historic, 'ww1', year)?.year).toBe(year)
    for (let year = 1939; year <= 1945; year++) expect(territorySnapshot(historic, 'ww2', year)?.year).toBe(year)
    expect(territorySnapshot(historic, 'ww1', 1942)).toBeNull()
    expect(territorySnapshot(historic, 'borders', 1991)).toBeNull()
    expect(territorySnapshot(current, 'ww2', 1942)).toBeNull()
    expect(territorySnapshot(historic, 'borders', 1916)?.scenario).toBe('ww1')
  })
  it('keeps estimated current control separate from schematic historical occupation', () => {
    expect(new Set(current.snapshots[0].features.map((f) => f.actorId))).toEqual(new Set(['RU', 'UA', 'CONTESTED']))
    expect(current.snapshots[0].features.every((f) => f.precision === 'settlement-estimate')).toBe(true)
    expect(historic.snapshots.every((s) => s.features.every((f) => f.precision === 'schematic'))).toBe(true)
    expect(territorySnapshot(historic, 'ww2', 1939)?.features.some((f) => f.actorId === 'sovietUnion')).toBe(false)
  })
  it('rejects unclosed rings, unsafe source links, missing attribution and invalid coordinates', () => {
    for (const change of [
      (d: TerritoryDataset) => { d.snapshots[0].features[0].source.url = 'javascript:alert(1)' },
      (d: TerritoryDataset) => { d.snapshots[0].features[0].source.date = '1914-01-01' },
      (d: TerritoryDataset) => { d.snapshots[0].features[0].actorId = '' },
      (d: TerritoryDataset) => { d.snapshots[0].features[0].geometry = { type: 'Polygon', coordinates: [[[0,0], [1,0], [999,1], [0,0]]] } },
      (d: TerritoryDataset) => { d.snapshots[0].features[0].geometry = { type: 'Polygon', coordinates: [[[0,0], [1,0], [1,1], [0,1]]] } },
    ]) {
      const copy = structuredClone(historic)
      change(copy)
      expect(() => validateTerritories(copy)).toThrow()
    }
  })
  it('picks actors within sourced regions while preserving holes and actor visibility', () => {
    const snapshot = territorySnapshot(historic, 'ww2', 1942)!
    const visible = new Set(snapshot.features.map((feature) => feature.id))
    expect(pickTerritory(snapshot.features, visible, 4.35, 50.85)?.actorId).toBe('naziGermany')
    expect(pickTerritory(snapshot.features, visible, 27.56, 53.9)?.actorId).toBe('axisEast')
    expect(pickTerritory(snapshot.features, visible, 13.4, 52.5)).toBeNull()
    expect(pickTerritory(snapshot.features, new Set(), 4.35, 50.85)).toBeNull()
    const area = structuredClone(snapshot.features[0])
    area.geometry = { type: 'Polygon', coordinates: [[[0,0],[5,0],[5,5],[0,5],[0,0]], [[1,1],[3,1],[3,3],[1,3],[1,1]]] }
    expect(pickTerritory([area], new Set([area.id]), 2, 2)).toBeNull()
    expect(pickTerritory([area], new Set([area.id]), 4, 4)?.id).toBe(area.id)
  })
})
