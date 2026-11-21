// Input fingerprints for the generated historical territory data.
//
//   build-ww2-occupation.mjs  ->  scripts/data/ww2-occupation.json   (gitignored intermediate)
//   build-territories.mjs     ->  public/data/territories-history.json (shipped)
//
// Each generator records the SHA-256 of every input that can change its output. The shipped file
// carries its own inputs plus, transitively, those of the intermediate, so the verifier
// (npm run data:ww2:verify) can recompute them from a clean checkout and fail when the shipped data
// is older than any input. Inputs are listed per stage below; when a generator starts reading a new
// file, add it here (the verifier then demands a regeneration).
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const PROVENANCE_VERSION = 1

/** Committed inputs of build-ww2-occupation.mjs (directly read or imported at runtime). */
export const OCCUPATION_INPUTS = [
  'scripts/build-ww2-occupation.mjs',
  'scripts/lib/ohm.mjs', // OHM relation assembly
  'scripts/lib/ww2-sides.mjs', // side of every CShapes unit by date
  'scripts/lib/ww2-strongholds.mjs', // dated strongholds and pockets
  'src/lib/ww2.ts', // WW2_MOMENTS: the map dates and front lines
  'src/lib/ww2-atlas-fronts.json', // imported by ww2.ts at runtime
  'scripts/data/ww2-atlas.json', // georeferenced atlas sheets (npm run data:ww2:atlas)
  'scripts/data/ww2-annexations.geojson.gz', // Reich footprint per day (npm run data:ww2)
  'scripts/data/ww2-free-city-danzig.geojson',
  'public/data/boundaries.json', // Natural Earth land for strongholds (npm run data)
]
/** Committed inputs of build-territories.mjs itself; the WWII part comes from the intermediate. */
export const TERRITORIES_INPUTS = ['scripts/build-territories.mjs']
/** npm packages whose geometry code shapes the output, pinned by package-lock.json. */
export const OCCUPATION_PACKAGES = ['polygon-clipping', 'topojson-client']
export const TERRITORIES_PACKAGES = ['polygon-clipping', 'topojson-client', 'topojson-server', 'topojson-simplify']

/** Gitignored upstream file both generators read; its pin mirrors the check in both build scripts. */
export const CSHAPES_PATH = 'scripts/source/historical/CShapes-2.0.geojson'
export const CSHAPES_SHA256 = '384b1ea90b9419f30a858d7ec237c85a22c60d1b35b5f85f215a1204f9989d42'

const BINARY = /\.(gz|bin|png|jpe?g|webp)$/i
export const sha256 = (value) => createHash('sha256').update(value).digest('hex')

/**
 * Hash of a committed input. Text is hashed with LF line endings, so a Windows checkout
 * (core.autocrlf) and the CI checkout agree; binary files are hashed as bytes.
 */
export function inputHash(path, root = '.') {
  const bytes = readFileSync(join(root, path))
  return sha256(BINARY.test(path) ? bytes : bytes.toString('utf8').replace(/\r\n/g, '\n'))
}

export function packageVersions(names, root = '.') {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
  return Object.fromEntries(names.map((name) => {
    const version = lock.packages?.[`node_modules/${name}`]?.version
    if (!version) throw new Error(`package-lock.json has no entry for ${name}`)
    return [name, version]
  }))
}

const sortKeys = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))

/**
 * Provenance record: committed inputs (recomputable anywhere), package versions and external
 * (gitignored) inputs (recomputable only where the files exist), with one fingerprint over all.
 */
export function provenanceRecord({ inputs, packages, external }) {
  const body = { version: PROVENANCE_VERSION, inputs: sortKeys(inputs), packages: sortKeys(packages), external: sortKeys(external) }
  return { ...body, fingerprint: sha256(JSON.stringify(body)) }
}

/** Current record of the committed inputs of one stage (external inputs are added by the caller). */
export function currentInputs(paths, root = '.') {
  return Object.fromEntries(paths.map((path) => {
    if (!existsSync(join(root, path))) throw new Error(`Missing committed generator input ${path}`)
    return [path, inputHash(path, root)]
  }))
}

/**
 * Compares a provenance record from generated data with the inputs as they are now.
 * Returns { errors, unverified }: errors make verification fail; unverified lists external inputs
 * that are absent here (a clean CI checkout) and could therefore not be recomputed.
 */
export function checkProvenance(record, { inputs, packages, root = '.', strictExternal = false }) {
  const errors = []
  const unverified = []
  if (!record || typeof record !== 'object') return { errors: ['No provenance record'], unverified }
  if (record.version !== PROVENANCE_VERSION) errors.push(`Provenance version ${record.version}, expected ${PROVENANCE_VERSION}`)
  const { fingerprint, ...body } = record
  if (fingerprint !== provenanceRecord({ inputs: body.inputs ?? {}, packages: body.packages ?? {}, external: body.external ?? {} }).fingerprint) {
    errors.push('Provenance fingerprint does not match its recorded inputs (edited by hand?)')
  }
  const recorded = record.inputs ?? {}
  for (const path of inputs) {
    if (!(path in recorded)) errors.push(`Input ${path} is not in the recorded provenance`)
    else if (!existsSync(join(root, path))) errors.push(`Committed input ${path} is missing`)
    else if (recorded[path] !== inputHash(path, root)) errors.push(`Input ${path} changed since the data was generated`)
  }
  for (const path of Object.keys(recorded)) if (!inputs.includes(path)) errors.push(`Recorded input ${path} is no longer a declared input`)
  const lock = packageVersions(packages, root)
  const recordedPackages = record.packages ?? {}
  for (const name of packages) {
    if (recordedPackages[name] !== lock[name]) errors.push(`Package ${name} is ${lock[name]} in package-lock.json, data was generated with ${recordedPackages[name] ?? 'nothing recorded'}`)
  }
  for (const name of Object.keys(recordedPackages)) if (!packages.includes(name)) errors.push(`Recorded package ${name} is no longer a declared input`)
  const external = record.external ?? {}
  if (external[CSHAPES_PATH] !== CSHAPES_SHA256) errors.push(`Recorded CShapes hash ${external[CSHAPES_PATH] ?? '(none)'} differs from the pinned revision`)
  for (const [path, hash] of Object.entries(external)) {
    if (existsSync(join(root, path))) {
      if (sha256(readFileSync(join(root, path))) !== hash) errors.push(`External input ${path} differs from the revision the data was generated from`)
    } else {
      unverified.push(path)
      if (strictExternal) errors.push(`External input ${path} is not present, so it cannot be verified`)
    }
  }
  return { errors, unverified }
}
