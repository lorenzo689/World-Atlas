// Deployment-safe refresh of the VIINA conflict data (policy in scripts/lib/conflict-refresh.mjs).
// Run from frontend/: npm run data:conflicts:refresh
// Exit 0: refreshed and verified, or fell back to the verified committed snapshot (with a warning).
// Exit 1: no safe snapshot to publish; the deployment must stop.
import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { refreshConflictData } from './lib/conflict-refresh.mjs'
import { utcToday } from './lib/conflict-data.mjs'

const build = () => new Promise((resolve) => {
  const child = spawn(process.execPath, ['scripts/build-conflict-lines.mjs', '--refresh'], { stdio: 'inherit' })
  const timer = setTimeout(() => child.kill(), 15 * 60 * 1000)
  child.on('error', (error) => { clearTimeout(timer); resolve({ ok: false, detail: error.message }) })
  child.on('exit', (code, signal) => { clearTimeout(timer); resolve({ ok: code === 0, detail: code === 0 ? undefined : `generator exited with ${signal ?? `code ${code}`}` }) })
})

const result = await refreshConflictData({ build, today: utcToday() })
const github = process.env.GITHUB_ACTIONS === 'true'
const summary = (line) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`) }
const oneLine = (reasons) => reasons.slice(0, 10).join('; ').replace(/\r?\n/g, ' ')
// Workflow-command data must escape % (and line breaks, already removed above).
const annotate = (kind, title, message) => `::${kind} title=${title}::${message.replaceAll('%', '%25')}`

if (result.status === 'refreshed') {
  console.log(`Conflict data refreshed and verified: ${result.previousAsOf} -> ${result.asOf}`)
  summary(`Conflict data refreshed and verified: ${result.previousAsOf} → ${result.asOf}`)
} else if (result.status === 'fallback') {
  for (const reason of result.reasons) console.warn(`  ${reason}`)
  const message = `Conflict refresh rejected; publishing the verified committed snapshot of ${result.asOf}. ${oneLine(result.reasons)}`
  console.warn(github ? annotate('warning', 'Conflict data fallback', message) : message)
  summary(`⚠️ ${message}`)
} else {
  for (const reason of result.reasons) console.error(`  ${reason}`)
  const message = `No safe conflict snapshot to publish: ${oneLine(result.reasons)}`
  console.error(github ? annotate('error', 'Conflict data blocked', message) : message)
  summary(`❌ ${message}`)
  process.exitCode = 1
}
