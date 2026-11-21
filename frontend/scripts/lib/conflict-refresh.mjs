// Safe refresh of the present-day conflict data for deployment (npm run data:conflicts:refresh).
//
// Policy:
//  1. The committed snapshot must verify first. If it does not, there is no safe fallback and the
//     refresh is blocked (the deployment fails).
//  2. The generator runs; its two outputs are accepted only together and only if they verify on
//     their own and against the committed snapshot (no older date, no drastic change).
//  3. Any failure (download, crash, invalid or partial output) restores the committed pair byte for
//     byte and reports a visible fallback.
//  4. The generator must not change any other file under public/: if it does, the refresh is
//     blocked, because the deployment would publish an unverified artifact.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { CONFLICT_FILES, validateConflictData } from './conflict-data.mjs'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

function fingerprints(root, dir, skip) {
  const out = new Map()
  const walk = (path) => {
    if (!existsSync(path)) return
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name)
      const key = relative(root, full).replaceAll('\\', '/')
      if (entry.isDirectory()) walk(full)
      else if (!skip.has(key)) out.set(key, sha256(readFileSync(full)))
    }
  }
  walk(join(root, dir))
  return out
}

function changedFiles(before, after) {
  const changed = []
  for (const [path, hash] of before) if (after.get(path) !== hash) changed.push(path)
  for (const path of after.keys()) if (!before.has(path)) changed.push(path)
  return changed.sort()
}

/** A validator crash on unexpected input is a rejection, never an acceptance or a blocked deploy. */
const check = (docs, options) => {
  try { return validateConflictData(docs, options) } catch (error) { return [`validation failed: ${error.message}`] }
}

const parse = (bytes, path) => {
  try { return { value: JSON.parse(bytes.toString('utf8')) } } catch (error) { return { error: `${path}: invalid JSON (${error.message})` } }
}

/**
 * @param {object} options
 * @param {string} [options.root]   frontend directory
 * @param {() => Promise<{ ok: boolean, detail?: string }>} options.build  runs the generator
 * @param {string} options.today    reference date YYYY-MM-DD
 * @param {string} [options.guard]  directory whose other files the generator must not change
 * @returns {Promise<{ status: 'refreshed' | 'fallback' | 'blocked', reasons: string[], asOf?: string, previousAsOf?: string }>}
 */
export async function refreshConflictData({ root = '.', build, today, guard = 'public' }) {
  const paths = CONFLICT_FILES.map((file) => join(root, file))
  // 1. The committed snapshot is the only fallback; it must be present and valid.
  if (!paths.every(existsSync)) return { status: 'blocked', reasons: ['The committed conflict snapshot is missing; no safe fallback exists'] }
  const committed = paths.map((path) => readFileSync(path))
  const parsed = committed.map((bytes, i) => parse(bytes, CONFLICT_FILES[i]))
  const parseErrors = parsed.filter((p) => p.error).map((p) => p.error)
  const baseline = parseErrors.length ? null : { lines: parsed[0].value, today: parsed[1].value }
  const baselineErrors = baseline ? check(baseline, { today }) : parseErrors
  if (baselineErrors.length) return { status: 'blocked', reasons: ['The committed conflict snapshot does not verify; no safe fallback exists', ...baselineErrors] }

  const others = new Set(CONFLICT_FILES)
  const before = fingerprints(root, guard, others)
  const restore = () => paths.forEach((path, i) => writeFileSync(path, committed[i]))
  const fallback = (reasons) => {
    restore()
    if (!paths.every((path, i) => existsSync(path) && readFileSync(path).equals(committed[i]))) {
      return { status: 'blocked', reasons: [...reasons, 'Restoring the committed snapshot failed'] }
    }
    return { status: 'fallback', reasons, asOf: baseline.lines.asOf, previousAsOf: baseline.lines.asOf }
  }

  // 2. Generate.
  let result
  try { result = await build() } catch (error) { result = { ok: false, detail: error.message } }
  // 4. Nothing else may change, whatever the generator's outcome.
  const unexpected = changedFiles(before, fingerprints(root, guard, others))
  if (unexpected.length) {
    restore()
    return { status: 'blocked', reasons: [`The conflict generator changed files outside its outputs: ${unexpected.join(', ')}`] }
  }
  if (!result?.ok) return fallback([`Upstream refresh failed${result?.detail ? `: ${result.detail}` : ''}`])

  // 3. Accept the new pair only if it verifies, on its own and against the committed snapshot.
  if (!paths.every(existsSync)) return fallback(['The generator did not write both outputs'])
  const fresh = paths.map((path, i) => parse(readFileSync(path), CONFLICT_FILES[i]))
  const freshParse = fresh.filter((p) => p.error).map((p) => p.error)
  if (freshParse.length) return fallback(freshParse)
  const docs = { lines: fresh[0].value, today: fresh[1].value }
  const errors = check(docs, { today, baseline })
  if (errors.length) return fallback(errors)
  return { status: 'refreshed', reasons: [], asOf: docs.lines.asOf, previousAsOf: baseline.lines.asOf }
}
