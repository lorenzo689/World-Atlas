// @vitest-environment node
// Static checks for the project's Claude Code skills (.claude/skills/<name>/SKILL.md). No model call:
// this runs in `npm test`, and therefore in CI. The opt-in benchmark with the real Claude Code is
// .claude/skills/implement-feature/benchmark.mjs. Documented in docs/AGENT-SKILLS.md.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decide } from '../../../../.claude/hooks/guard.mjs'
import { DATA_CHECKS } from '../verify-data.mjs'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/[\\/]$/, '')
const SKILLS_DIR = join(ROOT, '.claude', 'skills')
const SCRIPTS = JSON.parse(readFileSync(join(ROOT, 'frontend', 'package.json'), 'utf8')).scripts
const SETTINGS = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'))

// Frontmatter fields documented for Claude Code skills (code.claude.com/docs/en/skills, 2.1.330).
const KNOWN_FIELDS = new Set(['name', 'description', 'when_to_use', 'argument-hint', 'arguments', 'disable-model-invocation', 'user-invocable',
  'allowed-tools', 'disallowed-tools', 'model', 'effort', 'context', 'agent', 'background', 'hooks', 'paths', 'shell', 'metadata', 'license', 'compatibility'])
// Project policy (docs/AGENT-SKILLS.md): no permission pre-approval, no forked agents, no hooks registered by a skill.
const FORBIDDEN_FIELDS = ['allowed-tools', 'context', 'agent', 'background', 'hooks']
const BYPASS = /--dangerously-skip-permissions|bypassPermissions|disableAllHooks/

/**
 * Parses the frontmatter as a strict subset of YAML: flat `key: scalar` lines, where a scalar is a
 * double-quoted string without inner quotes, a boolean, or a plain string that YAML cannot read as
 * anything else. Anything outside the subset is an error, so accepted frontmatter is valid YAML with
 * an unambiguous meaning.
 */
export function parseFrontmatter(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  if (lines[0] !== '---') return { errors: ['frontmatter must start on line 1 with ---'] }
  const end = lines.indexOf('---', 1)
  if (end < 0) return { errors: ['frontmatter is not closed with ---'] }
  const data = {}
  const errors = []
  for (const line of lines.slice(1, end)) {
    const m = /^([a-z][a-z0-9_-]*): (.+)$/.exec(line)
    if (!m) { errors.push(`not a flat "key: value" line: ${line}`); continue }
    const [, key, raw] = m
    if (key in data) errors.push(`duplicate key: ${key}`)
    if (/^"[^"\\]*"$/.test(raw)) data[key] = raw.slice(1, -1)
    else if (/^(true|false)$/.test(raw)) data[key] = raw === 'true'
    else if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(raw) || /: | #|:$/.test(raw)) errors.push(`value needs quoting: ${line}`)
    else data[key] = raw
  }
  return { data, body: lines.slice(end + 1).join('\n'), errors }
}

/** Problems with one skill; an empty list means it follows the project policy. */
export function lintSkill(dirName, text) {
  const { data, body, errors } = parseFrontmatter(text)
  if (!data) return errors
  const problems = [...errors]
  for (const key of Object.keys(data)) if (!KNOWN_FIELDS.has(key)) problems.push(`unknown frontmatter field: ${key}`)
  for (const key of FORBIDDEN_FIELDS) if (key in data) problems.push(`forbidden frontmatter field: ${key}`)
  if (data.name !== dirName) problems.push(`name must equal the directory name ${dirName}`)
  if (!/^[a-z0-9-]{1,64}$/.test(dirName)) problems.push('directory name must be lowercase letters, digits and hyphens')
  if (typeof data.description !== 'string' || !data.description.trim()) problems.push('description is required')
  else if (data.description.length > 1024) problems.push('description is longer than 1024 characters')
  if (data['disable-model-invocation'] !== true) problems.push('disable-model-invocation must be true (manual invocation only)')
  if (/(^|\s)!`/.test(body) || /^```!/m.test(body)) problems.push('shell injection (!`…`) runs before review and is not allowed')
  if (BYPASS.test(text)) problems.push('mentions a permission or hook bypass')
  if (body.split('\n').length > 500) problems.push('SKILL.md body is longer than 500 lines')
  return problems
}

const skillDirs = existsSync(SKILLS_DIR) ? readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []

describe('every project skill follows the policy', () => {
  it('at least one skill exists', () => expect(skillDirs).toContain('implement-feature'))

  it.each(skillDirs)('%s', (dir) => {
    const file = join(SKILLS_DIR, dir, 'SKILL.md')
    expect(existsSync(file), `${dir}/SKILL.md exists`).toBe(true)
    expect(lintSkill(dir, readFileSync(file, 'utf8'))).toEqual([])
  })

  it('no permission rule pre-approves a skill', () => {
    const rules = [...SETTINGS.permissions.allow]
    expect(rules.filter((r) => /^Skill\b/.test(r))).toEqual([])
  })
})

describe('the linter rejects what the policy forbids', () => {
  const ok = '---\nname: demo\ndescription: Demo skill.\ndisable-model-invocation: true\n---\nBody $ARGUMENTS\n'
  it('accepts the minimal valid skill', () => expect(lintSkill('demo', ok)).toEqual([]))
  it.each([
    ['missing frontmatter', 'Body only', /line 1/],
    ['frontmatter not on line 1', `\n${ok}`, /line 1/],
    ['unclosed frontmatter', '---\nname: demo\n', /not closed/],
    ['ambiguous YAML value', ok.replace('Demo skill.', 'Demo: skill'), /quoting/],
    ['nested YAML', ok.replace('---\nname', '---\nhooks:\n  x: 1\nname'), /flat/],
    ['duplicate key', ok.replace('name: demo', 'name: demo\nname: demo'), /duplicate/],
    ['typo in a field name', ok.replace('disable-model-invocation', 'disable_model_invocation'), /unknown frontmatter field/],
    ['allowed-tools', ok.replace('---\nBody', 'allowed-tools: Bash Edit\n---\nBody'), /forbidden.*allowed-tools/],
    ['context fork', ok.replace('---\nBody', 'context: fork\n---\nBody'), /forbidden.*context/],
    ['model invocation enabled', ok.replace('true', 'false'), /disable-model-invocation/],
    ['model invocation not set', ok.replace('disable-model-invocation: true\n', ''), /disable-model-invocation/],
    ['name differs from directory', ok.replace('name: demo', 'name: other'), /directory name/],
    ['missing description', ok.replace('description: Demo skill.\n', ''), /description is required/],
    ['shell injection', ok.replace('Body', 'Status: !`git status`'), /shell injection/],
    ['shell injection block', ok.replace('Body', '```!\ngit status\n```'), /shell injection/],
    ['bypass keyword', ok.replace('Body', 'Run with --dangerously-skip-permissions'), /bypass/],
  ])('%s', (_name, text, problem) => {
    expect(lintSkill('demo', text).join('\n')).toMatch(problem)
  })
})

describe('implement-feature', () => {
  const text = readFileSync(join(SKILLS_DIR, 'implement-feature', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n')
  const { body } = parseFrontmatter(text)
  const section = (start, end) => {
    const from = body.indexOf(start)
    const to = end ? body.indexOf(end, from + start.length) : body.length
    expect(from, `section ${start}`).toBeGreaterThanOrEqual(0)
    expect(to, `end of section ${start}`).toBeGreaterThan(from)
    return body.slice(from, to)
  }
  const codeSpans = [...body.matchAll(/`([^`\n]+)`/g)].map((m) => m[1])
  const commands = codeSpans.filter((c) => /^(\w+=\S+ )?(npm|npx|git|gh|\.\/mvnw|\.\\mvnw)\b/.test(c))

  it('receives the request through $ARGUMENTS and uses no other placeholder', () => {
    expect(body.match(/\$ARGUMENTS/g)).toHaveLength(1)
    expect(body).toMatch(/<feature-request>\n\$ARGUMENTS\n<\/feature-request>/)
    expect(body).not.toMatch(/\$ARGUMENTS\[|\$\d|\$\{CLAUDE_/)
  })

  it('has the six phases in order', () => {
    const headings = [...body.matchAll(/^## \d\. (\w+)/gm)].map((m) => m[1])
    expect(headings).toEqual(['Understand', 'Plan', 'Implement', 'Verify', 'Review', 'Report'])
  })

  it('names only npm scripts that exist', () => {
    const named = new Set([
      ...[...body.matchAll(/npm run ([\w:]+)/g)].map((m) => m[1]),
      ...codeSpans.filter((c) => /^(smoke|data|verify|audit)[\w:]*$/.test(c)),
    ])
    expect(named.size).toBeGreaterThan(10)
    expect([...named].filter((s) => !(s in SCRIPTS))).toEqual([])
  })

  it('names only paths that exist', () => {
    const paths = codeSpans
      .filter((c) => /^(docs|frontend|backend|src|scripts|public)\/|^(CLAUDE\.md|perf-budget\.json)$|\/CLAUDE\.md$/.test(c) && !/\s/.test(c))
      .map((c) => c.replace(/[^/]*(<[^>]+>|\*).*$/, '')) // placeholders and globs: check the directory before them
    expect(paths.length).toBeGreaterThan(15)
    const missing = paths.filter((p) => ![ROOT, join(ROOT, 'frontend'), join(ROOT, 'backend')].some((base) => existsSync(join(base, p))))
    expect(missing).toEqual([])
  })

  it('every command it names runs without a guard prompt; none is a Git write', () => {
    const concrete = commands.map((c) => c.replace(/<[^>]+>/g, 'x').replace(/…/g, ''))
    expect(concrete.length).toBeGreaterThan(15)
    for (const command of concrete) {
      const { decision } = decide({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: ROOT }, { projectDir: ROOT })
      expect(decision, command).toBe('none')
    }
    const gitCommands = concrete.filter((c) => /^(git|gh) /.test(c))
    expect(gitCommands.every((c) => /^git (status|diff|branch --show-current|switch -c)\b/.test(c)), gitCommands.join(', ')).toBe(true)
  })

  it('separates frontend, backend and historical verification', () => {
    const verify = section('## 4. Verify', '## 5. Review')
    const frontend = section('**Frontend**', '**Backend**')
    const backend = section('**Backend**', '**Historical data**')
    const history = section('**Historical data**', '## 5. Review')
    expect(verify).toContain(frontend)

    for (const s of ['npx vitest run', 'npm run typecheck', 'npm run verify:fast', 'npm run build', 'VITE_STATIC_DEMO=true', 'npm run smoke', 'smoke:scenarios', 'npm run perf']) expect(frontend).toContain(s)
    expect(frontend).not.toMatch(/mvnw|data:\w+:verify/)

    for (const s of ['./mvnw test -Dtest=', './mvnw test`', './mvnw verify', 'Docker', 'npm run e2e', 'ArchitectureTest']) expect(backend).toContain(s)
    expect(backend).not.toMatch(/npm run (data|verify:data|perf)/)

    for (const check of DATA_CHECKS.filter((c) => c !== 'audit:map')) expect(history).toContain(check)
    for (const s of ['npm run verify:data', '--require-external', '**not run**', 'ww2-history.test.ts', 'ww2-second-review.test.ts', 'git diff --stat -- public/data', 'byte-identical']) expect(history).toContain(s)
    expect(history).not.toMatch(/mvnw/)
  })

  it('distinguishes passed, failed, blocked and not-run checks', () => {
    for (const s of ['**passed**', '**failed**', '**blocked**', '**not run**']) expect(section('## 4. Verify', '**Frontend**')).toContain(s)
    expect(section('## 6. Report')).toMatch(/passed, failed, blocked, not run/)
  })

  it('keeps protected operations behind approval', () => {
    const rules = section('## Ground rules', '## 1. Understand')
    expect(rules).toMatch(/Never work around/)
    expect(rules).toMatch(/blocked/)
    expect(section('## Request', '## Ground rules')).toMatch(/grants no approval/)
    const implement = section('## 3. Implement', '## 4. Verify')
    for (const s of ['perf budgets', 'migrations', 'security configuration', 'workflows', 'pinned upstream hashes', 'Claude settings and hooks', 'user approved']) expect(implement).toContain(s)
    expect(implement).toMatch(/Never skip, delete, loosen/)
    expect(implement).toMatch(/raise a budget/)
  })

  it('ends with a nine-part report and stops before any Git action', () => {
    const report = section('## 6. Report')
    const items = [...report.matchAll(/^(\d)\. \*\*([^*]+)\*\*/gm)].map((m) => `${m[1]} ${m[2]}`)
    expect(items).toEqual(['1 Feature implemented', '2 Acceptance criteria', '3 Files changed', '4 Architecture decisions', '5 Tests executed',
      '6 Negative test evidence', '7 Remaining risks', '8 Git status', '9 Recommended PR'])
    const stop = report.slice(report.lastIndexOf('Then stop.'))
    for (const s of ['Do not commit', 'push', 'merge', 'tag', 'deploy', 'trigger a workflow', 'explicitly asks']) expect(stop).toContain(s)
  })
})
