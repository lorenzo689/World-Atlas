// Verify the present-day conflict data pair (scripts/lib/conflict-data.mjs).
// Run from frontend/: npm run data:conflicts:verify [-- --dir dist/data] [-- --today YYYY-MM-DD]
//   --dir    directory holding conflict-lines.json and territories-today.json (default public/data)
//   --today  reference date for the "not in the future" check (default: today, UTC)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { utcToday, validateConflictData } from './lib/conflict-data.mjs'

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const dir = arg('--dir') ?? 'public/data'
const today = arg('--today') ?? utcToday()
const read = (name) => {
  try { return JSON.parse(readFileSync(join(dir, name), 'utf8')) } catch (error) { return { error: `${join(dir, name)}: ${error.message}` } }
}
const lines = read('conflict-lines.json')
const territories = read('territories-today.json')
const errors = [lines, territories].filter((doc) => doc?.error && Object.keys(doc).length === 1).map((doc) => doc.error)
if (!errors.length) {
  try { errors.push(...validateConflictData({ lines, today: territories }, { today })) } catch (error) { errors.push(`validation failed: ${error.message}`) }
}

if (errors.length) {
  for (const error of errors) console.error(`Conflict data: ${error}`)
  process.exitCode = 1
} else {
  const areas = territories.snapshots[0].features.map((f) => f.actorId).join(', ')
  console.log(`Conflict data verified (${dir}): VIINA as of ${lines.asOf}, ${lines.lines.length} boundary lines, areas ${areas}`)
}
