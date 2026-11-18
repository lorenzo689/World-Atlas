import { readFileSync } from 'node:fs'
import { decodeTopologySnapshots, pickTerritory, type TerritoryDataset } from '../territories'

// Shared by the WWII control-point tests: which side holds a place on a map date, from the shipped
// territory file.
export type Side = 'axis' | 'allied' | 'soviet' | 'contested' | 'none'
export const data = decodeTopologySnapshots(JSON.parse(readFileSync('public/data/territories-history.json', 'utf8')) as TerritoryDataset)
const SIDE_OF: Record<string, Side> = { axisState: 'axis', axisOccupied: 'axis', alliedState: 'allied', alliedControl: 'allied', sovietPact: 'soviet', contested: 'contested' }

export function sideAt(date: string, lng: number, lat: number): Side {
  const snapshot = data.snapshots.find((s) => s.scenario === 'ww2' && s.date === date)!
  const hit = pickTerritory(snapshot.features, new Set(snapshot.features.map((f) => f.id)), lng, lat)
  return hit ? SIDE_OF[hit.actorId] : 'none'
}
