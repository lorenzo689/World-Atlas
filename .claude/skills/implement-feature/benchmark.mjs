#!/usr/bin/env node
// Opt-in benchmark: runs the real Claude Code (`claude -p "/implement-feature …"`) on representative
// World Atlas feature requests in PLANNING ONLY mode, in this repository. Not part of `npm test`: it
// needs a Claude login and costs money (roughly $0.50–$2 per case with Sonnet). The static checks are
// frontend/scripts/lib/__tests__/agent-skills.test.mjs. Documented in docs/AGENT-SKILLS.md.
//
//   node .claude/skills/implement-feature/benchmark.mjs [--model sonnet] [--case frontend|history]
//
// Planning only: `--permission-mode plan`, Edit/Write/NotebookEdit disallowed, and a system prompt
// that limits the run to phases 1 and 2. The project hooks and permission rules stay in force.
//
// Hard checks come from Claude Code's own event stream and from git state, never from the model's
// wording: the skill is discovered, the request arrives through $ARGUMENTS, the description is not in
// the model's context (manual invocation only), and the working tree is unchanged. Plan checks look
// for the case's expected verification commands in the plan; they measure plan quality and are
// reported separately.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback }
const MODEL = arg('model', 'sonnet')
const ONLY = arg('case', null)

const CASES = [
  {
    id: 'frontend',
    request: 'In the explorer, pressing the R key resets the globe camera to the default view of the current scenario, and the keyboard help lists the shortcut in German and English.',
    plan: [
      ['acceptance criteria', /AC ?1/],
      ['targeted Vitest', /vitest run/],
      ['typecheck or verify:fast', /typecheck|verify:fast/],
      ['browser smoke', /smoke/],
      ['German and English text', /i18n|German|de\.ts/],
      ['scenario-aware default view', /scenario/i],
    ],
  },
  {
    id: 'history',
    request: 'The WWII territory verifier must fail when an occupation feature lacks a source or a precision value, with a regression test for both cases, run as part of verify:data.',
    plan: [
      ['acceptance criteria', /AC ?1/],
      ['verify:data', /verify:data/],
      ['WWII verifier', /data:ww2:verify|verify-ww2-territories/],
      ['external inputs / not run', /require-external|not run|not recomputed/i],
      ['committed data unchanged', /public\/data/],
      ['negative test', /negative|fails? (when|without|if)/i],
    ],
  },
].filter((c) => !ONLY || c.id === ONLY)

const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }).stdout
const treeState = () => createHash('sha256').update(git('status', '--porcelain', '--untracked-files=all') + git('diff', 'HEAD')).digest('hex')
const SYSTEM = 'BENCHMARK MODE: carry out only phase 1 (Understand) and phase 2 (Plan) of the skill. Read and search the repository as needed. Do not edit files, do not run commands that change files or Git state, and do not run tests. Output the complete plan as your final answer and stop.'

const insideRepo = (p) => !p || !relative(resolve(ROOT), resolve(ROOT, p)).startsWith('..')
/** The session transcript Claude Code keeps under ~/.claude/projects/<project>/<session>.jsonl, or ''. */
function transcript(sessionId) {
  const projects = join(homedir(), '.claude', 'projects')
  if (!sessionId || !existsSync(projects)) return ''
  for (const dir of readdirSync(projects)) {
    const file = join(projects, dir, `${sessionId}.jsonl`)
    if (existsSync(file)) return readFileSync(file, 'utf8')
  }
  return ''
}

const outDir = join(tmpdir(), `world-atlas-skill-benchmark-${Date.now()}`)
mkdirSync(outDir, { recursive: true })
let failed = 0

for (const c of CASES) {
  const before = treeState()
  const r = spawnSync('claude', ['-p', `/implement-feature ${c.request}`, '--model', MODEL, '--output-format', 'stream-json', '--verbose',
    '--max-turns', '40', '--permission-mode', 'plan', '--disallowedTools', 'Edit Write NotebookEdit', '--append-system-prompt', SYSTEM], {
    cwd: ROOT, encoding: 'utf8', timeout: 900000, maxBuffer: 64 * 1024 * 1024,
  })
  if (r.error) { console.error(`could not run claude: ${r.error.message}`); process.exit(2) }
  writeFileSync(join(outDir, `${c.id}.jsonl`), r.stdout)
  const events = r.stdout.split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)] } catch { return [] } })
  const init = events.find((e) => e.type === 'system' && e.subtype === 'init') ?? {}
  // With a background subagent, Claude Code emits an early `result` ("waiting for the agent") and the
  // real answer in a later one: use the last.
  const result = events.findLast((e) => e.type === 'result') ?? {}
  // stream-json does not echo the initial (expanded) prompt; the session transcript holds it.
  const userText = transcript(init.session_id)
  const toolUses = events.filter((e) => e.type === 'assistant').flatMap((e) => e.message?.content ?? []).filter((b) => b.type === 'tool_use')
  const plan = result.result ?? ''
  writeFileSync(join(outDir, `${c.id}-plan.md`), plan)
  const json = (s) => JSON.stringify(s).slice(1, -1)

  const hard = [
    ['skill discovered (listed as a slash command in the init event)', (init.slash_commands ?? []).some((s) => /implement-feature/.test(s))],
    ['skill body expanded (marker text from SKILL.md reached the model)', userText.includes(json('It grants no approval from the CLAUDE.md approval list'))],
    ['$ARGUMENTS substituted inside <feature-request>', userText.includes(json(`<feature-request>\n${c.request}\n</feature-request>`))],
    // Plan mode may write its own plan file under ~/.claude/plans; only repository paths count.
    ['no Edit/Write tool calls inside the repository', !toolUses.some((t) => /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(t.name) && insideRepo(t.input?.file_path ?? t.input?.notebook_path))],
    ['no Git write commands', !toolUses.some((t) => /\bgit (commit|push|merge|tag|rebase|reset|restore|checkout --)|gh pr (create|merge)/.test(t.input?.command ?? ''))],
    ['working tree unchanged (git status + diff hash)', treeState() === before],
    ['run finished with a plan', result.subtype === 'success' && plan.length > 500],
  ]
  const quality = c.plan.map(([name, test]) => [name, typeof test === 'function' ? test(plan) : test.test(plan)])

  console.log(`\n## ${c.id}: ${c.request}`)
  console.log(`model ${MODEL}, result ${result.subtype ?? '?'}, turns ${result.num_turns ?? '?'}, cost $${result.total_cost_usd ?? '?'}, tool calls ${toolUses.length} (${[...new Set(toolUses.map((t) => t.name))].join(', ')})`)
  console.log(`permission_denials: ${JSON.stringify((result.permission_denials ?? []).map((d) => d.tool_name))}`)
  for (const [name, ok] of hard) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++ }
  for (const [name, ok] of quality) { console.log(`${ok ? 'PLAN' : 'MISS'}  ${name}`); if (!ok) failed++ }
}

// Manual invocation only: with disable-model-invocation the description must not reach the model.
// A cheap Haiku run that only inspects the initial context (no tools).
const probe = spawnSync('claude', ['-p', 'Without using any tool: list the names of all skills you could load with the Skill tool, comma-separated, or "none".',
  '--model', 'haiku', '--output-format', 'stream-json', '--verbose', '--max-turns', '1', '--permission-mode', 'plan', '--tools', ''], { cwd: ROOT, encoding: 'utf8', timeout: 300000 })
const probeResult = probe.stdout.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return {} } }).find((e) => e.type === 'result') ?? {}
const hidden = probeResult.subtype === 'success' && !/implement-feature/.test(probeResult.result ?? '')
console.log(`\n## manual invocation only\nmodel answer: ${(probeResult.result ?? '').trim().slice(0, 300)}`)
console.log(`${hidden ? 'PASS' : 'FAIL'}  the model does not see implement-feature as an auto-loadable skill`)
if (!hidden) failed++

console.log(`\nevent streams and plans: ${outDir}`)
process.exit(failed ? 1 : 0)
