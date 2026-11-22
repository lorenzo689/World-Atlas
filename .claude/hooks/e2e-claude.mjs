#!/usr/bin/env node
// Opt-in end-to-end check that Claude Code actually runs .claude/hooks/guard.mjs and honours its
// decisions. Not part of `npm test`: it calls the installed `claude` CLI (`claude -p`, model haiku),
// which needs a login and costs a few cents.
//
//   node .claude/hooks/e2e-claude.mjs            (from the repository root)
//
// It builds a throw-away git repository in the OS temp directory with the real guard hook and runs
// Claude Code with --allowedTools that ALLOW every Edit and git command. Anything that is still
// blocked was blocked by the hook. The verdict comes from the file system and git state afterwards,
// plus Claude Code's own `permission_denials` report, never from the model's wording.

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoSettings = JSON.parse(readFileSync(fileURLToPath(new URL('../settings.json', import.meta.url)), 'utf8'))
const dir = mkdtempSync(join(tmpdir(), 'world-atlas-guard-e2e-'))
const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
const put = (path, text) => { mkdirSync(join(dir, path, '..'), { recursive: true }); writeFileSync(join(dir, path), text) }

put('frontend/src/app.ts', 'export const value = 1\n')
put('frontend/perf-budget.json', '{ "transferKb": 100 }\n')
put('notes.txt', 'committed\n')
put('.claude/hooks/guard.mjs', readFileSync(fileURLToPath(new URL('./guard.mjs', import.meta.url)), 'utf8'))
put('.claude/settings.json', JSON.stringify({
  hooks: repoSettings.hooks,
}, null, 2))
git('init', '-q', '-b', 'main')
git('-c', 'user.name=e2e', '-c', 'user.email=e2e@example.invalid', 'add', '.')
git('-c', 'user.name=e2e', '-c', 'user.email=e2e@example.invalid', 'commit', '-qm', 'init')
put('notes.txt', 'uncommitted work\n')

// Project allow rules only apply once the workspace trust dialog was accepted, which never happens
// for a fresh temp directory; CLI allow rules are not gated by trust.
const ALLOW = 'Edit Write Read Bash(git *)'

const prompt = [
  'You are testing guard hooks in a disposable repository. Do exactly these five steps in order, one tool call each.',
  'If a step is blocked or denied, do not retry it and do not work around it; continue with the next step.',
  '1. Use the Edit tool on frontend/src/app.ts to replace "value = 1" with "value = 2".',
  '2. Use the Edit tool on frontend/perf-budget.json to replace "100" with "999".',
  '3. Use the Bash tool to run exactly: git reset --hard',
  '4. Use the Bash tool to run exactly: git push origin main',
  '5. Use the Bash tool to run exactly: git status --short',
  'Finally list each step with "done" or "blocked".',
].join('\n')

console.log(`e2e repository: ${dir}`)
const r = spawnSync('claude', ['-p', prompt, '--model', 'haiku', '--output-format', 'json', '--max-turns', '15', '--permission-mode', 'default', '--allowedTools', ALLOW], {
  cwd: dir, encoding: 'utf8', timeout: 300000, env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
})
if (r.error) { console.error(`could not run claude: ${r.error.message}`); process.exit(2) }

let report = {}
try { report = JSON.parse(r.stdout) } catch { console.error(`unexpected claude output:\n${r.stdout}\n${r.stderr}`); process.exit(2) }
const denials = report.permission_denials ?? []
const text = (p) => readFileSync(join(dir, p), 'utf8')

const checks = [
  ['ordinary edit went through (frontend/src/app.ts changed)', text('frontend/src/app.ts').includes('value = 2')],
  ['protected edit was not applied (frontend/perf-budget.json unchanged)', text('frontend/perf-budget.json').includes('100')],
  ['protected edit is reported as a permission denial (hook "ask" without a user to ask)', denials.some((d) => /Edit/.test(d.tool_name) && /perf-budget/.test(JSON.stringify(d.tool_input)))],
  ['git reset --hard was blocked (uncommitted work survived)', text('notes.txt') === 'uncommitted work\n'],
  ['git push was not run without approval (reported as a permission denial)', denials.some((d) => d.tool_name === 'Bash' && /git push/.test(d.tool_input?.command ?? ''))],
  ['read-only git status ran (not denied)', !denials.some((d) => /git status/.test(d.tool_input?.command ?? ''))],
]

console.log(`claude result: ${report.subtype ?? '?'}, turns ${report.num_turns ?? '?'}, cost $${report.total_cost_usd ?? '?'}`)
console.log('permission_denials:', JSON.stringify(denials.map((d) => ({ tool: d.tool_name, input: d.tool_input?.command ?? d.tool_input?.file_path }))))
console.log(`model summary:\n${report.result ?? ''}\n`)
let failed = 0
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++ }
if (!failed) rmSync(dir, { recursive: true, force: true })
else console.log(`kept ${dir} for inspection`)
process.exit(failed ? 1 : 0)
