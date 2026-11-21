// Verify that the shipped WWII territory layer matches its dated stronghold sources.
// Run from frontend/: npm run data:ww2:verify
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { STRONGHOLDS } from './lib/ww2-strongholds.mjs'
import { WW2_MOMENTS } from '../src/lib/ww2.ts'

// Hash the text with LF line endings: a Windows checkout (core.autocrlf) has CRLF, the CI checkout LF.
const source = readFileSync('scripts/lib/ww2-strongholds.mjs', 'utf8').replace(/\r\n/g, '\n')
const sourceHash = createHash('sha256').update(source).digest('hex')
const data = JSON.parse(readFileSync('public/data/territories-history.json', 'utf8'))
const errors = []
const fail = (message) => errors.push(message)

if (data.sourceSha256?.['ww2-strongholds.mjs'] !== sourceHash) {
  fail('Shipped territories-history.json is not generated from the current ww2-strongholds.mjs. Run npm run data:ww2:occupation, then npm run data:territories, and commit the regenerated file.')
}

const ww2Snapshots = data.snapshots?.filter((s) => s.scenario === 'ww2') ?? []
const expectedDates = WW2_MOMENTS.map((moment) => moment.date)
const expectedSet = new Set(expectedDates)
const actualSet = new Set(ww2Snapshots.map((s) => s.date))

for (const date of expectedDates) {
  if (!actualSet.has(date)) fail(`Missing WWII snapshot: ${date}`)
}
for (const date of actualSet) {
  if (!expectedSet.has(date)) fail(`Unexpected WWII snapshot: ${date}`)
}
if (ww2Snapshots.length !== expectedDates.length) {
  fail(`Expected ${expectedDates.length} WWII snapshots, found ${ww2Snapshots.length}`)
}

for (const snapshot of ww2Snapshots) {
  if (snapshot.id !== `ww2-${snapshot.date}`) {
    fail(`Unexpected snapshot ID: ${snapshot.id}`)
  }
  if (!Array.isArray(snapshot.features)) {
    fail(`Missing features in WWII snapshot ${snapshot.date}`)
    continue
  }
  const ids = snapshot.features.map((f) => f.id)
  const idSet = new Set(ids)
  if (idSet.size !== ids.length) fail(`Duplicate feature IDs in ${snapshot.date}`)

  // The generator emits stronghold IDs as `${snapshot.id}-${stronghold.id}`.
  // A source-date change must never leave an out-of-range area in the shipped map.
  for (const stronghold of STRONGHOLDS) {
    const featureId = `${snapshot.id}-${stronghold.id}`
    if (idSet.has(featureId) && !(stronghold.from <= snapshot.date && snapshot.date < stronghold.to)) {
      fail(`Out-of-date stronghold ${stronghold.id} in ${snapshot.date}; valid ${stronghold.from} to ${stronghold.to} (exclusive)`)
    }
  }
}

// Regression for the source corrections made on 21 November 2026:
// Wewak and Madang are not evidenced for the 18 November 1942 snapshot.
const november1942 = ww2Snapshots.find((s) => s.date === '1942-11-18')
if (november1942?.features) {
  for (const id of ['wewak', 'madang']) {
    if (november1942.features.some((feature) => feature.id === `${november1942.id}-${id}`)) {
      fail(`1942-11-18 must not contain ${id}; its source dates start in December 1942`)
    }
  }
}

if (errors.length) {
  for (const error of errors) console.error(`WWII integrity: ${error}`)
  process.exitCode = 1
} else {
  console.log(`Verified ${ww2Snapshots.length} WWII territory snapshots, ${STRONGHOLDS.length} dated stronghold definitions and their source hash`)
}
