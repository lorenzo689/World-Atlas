#!/usr/bin/env node
// World Atlas PreToolUse guard for Claude Code (configured in .claude/settings.json).
//
// Reads one hook event as JSON on stdin and answers with one of:
//   - no output, exit 0          -> no opinion; Claude Code's permission rules decide
//   - {"hookSpecificOutput": {"permissionDecision": "ask", ...}} on stdout, exit 0
//                                -> the user must approve (an allow rule does not skip this)
//   - message on stderr, exit 2  -> blocked before permission rules are evaluated
//
// Malformed input, an unknown input shape for a guarded tool, or an internal error blocks (exit 2):
// the hook fails closed. Node built-ins only; runs on Windows and Linux.
//
// Scope and limits are documented in docs/AGENT-GUARDRAILS.md. In short: file tools (Edit, Write,
// MultiEdit, NotebookEdit) are checked precisely; shell commands (Bash, PowerShell) are checked by a
// best-effort parser that covers the forms an agent normally writes, not every way a program can
// modify a file (a Node or Python script, a generator, a git patch can still write anywhere).

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HOOK = 'World Atlas guard (.claude/hooks/guard.mjs)'
const APPROVAL = 'Needs explicit approval (CLAUDE.md, "Approval boundaries").'

// ---------------------------------------------------------------------------------------------
// Protected paths, repository-relative, POSIX separators, matched case-insensitively.
// `**` matches across directories, `*` within one segment. `decision` is 'ask' or 'deny'.

export const PROTECTED_PATHS = [
  { glob: '.git/**', decision: 'deny', why: 'Git internals are never edited directly.' },
  { glob: 'frontend/perf-budget.json', decision: 'ask', why: 'Performance budget (frontend/CLAUDE.md: never raise a budget without approval).' },
  { glob: 'frontend/scripts/map-audit-baseline.json', decision: 'ask', why: 'Map audit baseline: changing it changes what counts as a geometry regression.' },
  { glob: 'backend/src/main/resources/db/migration/**', decision: 'ask', why: 'Flyway migration (backend/CLAUDE.md: migrations need approval; never edit an applied one).' },
  { glob: 'backend/src/main/java/dev/worldexplorer/common/security/**', decision: 'ask', why: 'Security configuration (authentication, authorization, JWT).' },
  { glob: 'backend/src/main/resources/application*.yml', decision: 'ask', why: 'Backend configuration with security settings (JWT, CORS, rate limits, production profile).' },
  { glob: 'backend/src/main/resources/application*.yaml', decision: 'ask', why: 'Backend configuration with security settings.' },
  { glob: 'backend/src/main/resources/application*.properties', decision: 'ask', why: 'Backend configuration with security settings.' },
  { glob: 'deploy/**', decision: 'ask', why: 'Production deployment configuration.' },
  { glob: '.github/workflows/**', decision: 'ask', why: 'GitHub Actions workflow (CI gates, Pages and image publishing).' },
  { glob: 'frontend/public/data/**', decision: 'ask', why: 'Generated data: change it only through its generator (frontend/CLAUDE.md).' },
  { glob: 'frontend/scripts/source/**', decision: 'ask', why: 'Upstream source input for historical or map data.' },
  { glob: 'frontend/scripts/data/**', decision: 'ask', why: 'Pinned historical input data.' },
  { glob: '.claude/settings.json', decision: 'ask', why: 'Agent permission and hook configuration.' },
  { glob: '.claude/settings.local.json', decision: 'ask', why: 'Local agent settings can disable hooks or add permissions.' },
  { glob: '.claude/hooks/**', decision: 'ask', why: 'Agent guard hooks.' },
]

const globCache = new Map()
function globToRegExp(glob) {
  let re = globCache.get(glob)
  if (!re) {
    // A trailing /** also matches the directory itself (deleting or replacing it is a change too).
    const body = glob.split(/(\/\*\*$|\/\*\*\/|\*\*|\*)/).map((part) => {
      if (part === '/**') return '(?:/.*)?'
      if (part === '/**/') return '/(?:.*/)?'
      if (part === '**') return '.*'
      if (part === '*') return '[^/]*'
      return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    }).join('')
    re = new RegExp(`^${body}$`, 'i')
    globCache.set(glob, re)
  }
  return re
}

// ---------------------------------------------------------------------------------------------
// Path normalisation

const isWindowsLike = (p) => /^[a-z]:\//i.test(p)

/** Converts any spelling of a path to an absolute, normalised, forward-slash path. */
export function normalizePath(raw, base) {
  let p = String(raw).trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/')
  p = p.replace(/^\/\/[?.]\//, '') // Win32 device/long-path prefixes: \\?\C:\ and \\.\C:\
  p = p.replace(/^\/([a-z])\//i, '$1:/') // Git Bash / MSYS: /c/Users -> c:/Users
  p = p.replace(/^\/cygdrive\/([a-z])\//i, '$1:/')
  if (p === '~' || p.startsWith('~/')) p = homedir().replace(/\\/g, '/') + p.slice(1)
  const absolute = p.startsWith('/') || isWindowsLike(p)
  if (!absolute) p = `${normalizePath(base ?? process.cwd())}/${p}`
  const drive = isWindowsLike(p) ? p.slice(0, 2).toLowerCase() : ''
  const rest = drive ? p.slice(2) : p
  const out = []
  for (let seg of rest.split('/')) {
    // Windows ignores trailing dots and spaces in a name: "perf-budget.json." is the same file.
    if (seg !== '.' && seg !== '..') seg = seg.replace(/[. ]+$/, '')
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return `${drive}/${out.join('/')}`
}

/** Resolves symlinks/junctions of the longest existing prefix, so an alias cannot hide a target. */
function realpathPrefix(abs) {
  const parts = abs.split('/')
  for (let i = parts.length; i > 1; i--) {
    const head = parts.slice(0, i).join('/') || '/'
    try {
      if (!existsSync(head)) continue
      const real = normalizePath(realpathSync.native(head))
      return i === parts.length ? real : `${real}/${parts.slice(i).join('/')}`
    } catch {
      return abs
    }
  }
  return abs
}

/**
 * Repository-relative path (lower-case, forward slashes) or null when outside the repository.
 * Paths inside Claude Code worktrees (.claude/worktrees/<name>/...) map to the worktree's own
 * repository-relative path, so the same rules apply there.
 */
export function repoRelative(raw, { projectDir, cwd, resolveLinks = true }) {
  const root = normalizePath(projectDir).toLowerCase()
  let abs = normalizePath(raw, cwd ?? projectDir)
  if (resolveLinks) abs = realpathPrefix(abs)
  const lower = abs.toLowerCase()
  let rel
  if (lower === root) rel = ''
  else if (lower.startsWith(`${root}/`)) rel = lower.slice(root.length + 1)
  else {
    let realRoot = root
    try { realRoot = normalizePath(realpathSync.native(projectDir)).toLowerCase() } catch { /* keep */ }
    if (realRoot !== root && lower.startsWith(`${realRoot}/`)) rel = lower.slice(realRoot.length + 1)
    else return null
  }
  const wt = rel.match(/^\.claude\/worktrees\/[^/]+\/(.*)$/)
  return wt ? wt[1] : rel
}

/** Protection rule for a path, or null. 8.3 short names (PERF-B~1.JSO) cannot be matched: ask. */
export function protectedRule(raw, ctx) {
  const rel = repoRelative(raw, ctx)
  if (rel === null) {
    // The user's own Claude Code settings live outside the repository but control this guard.
    const abs = normalizePath(raw, ctx.cwd ?? ctx.projectDir).toLowerCase()
    const home = normalizePath(homedir()).toLowerCase()
    if (abs.startsWith(`${home}/.claude/settings`)) return { glob: '~/.claude/settings*.json', decision: 'ask', why: 'User-level Claude Code settings can disable hooks or add permissions.' }
    return null
  }
  if (rel.split('/').some((seg) => /~\d/.test(seg))) {
    return { glob: '(8.3 short name)', decision: 'ask', why: 'Windows 8.3 short names cannot be checked against protected paths.' }
  }
  return PROTECTED_PATHS.find((rule) => globToRegExp(rule.glob).test(rel)) ?? null
}

// ---------------------------------------------------------------------------------------------
// Pinned upstream hashes: any change to the set of SHA-256 hex digests in a file needs approval.
// Compared on the whole file before and after the edit, so an edit of half a digest is caught.

const SHA256 = /(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/gi
const digests = (text) => (String(text).match(SHA256) ?? []).map((d) => d.toLowerCase()).sort()
const sameDigests = (a, b) => {
  const x = digests(a)
  const y = digests(b)
  return x.length === y.length && x.every((d, i) => d === y[i])
}

function applyEdit(content, { old_string: oldS, new_string: newS, replace_all: all }) {
  if (typeof oldS !== 'string' || typeof newS !== 'string') return null
  if (oldS === '') return newS + content // creating content in an empty file
  if (!content.includes(oldS)) return content // the tool itself will reject the edit
  return all ? content.split(oldS).join(newS) : content.replace(oldS, () => newS)
}

// ---------------------------------------------------------------------------------------------
// Decisions

const NONE = { decision: 'none' }
const ask = (reason) => ({ decision: 'ask', reason })
const deny = (reason) => ({ decision: 'deny', reason })
const RANK = { none: 0, ask: 1, deny: 2 }
const strongest = (results) => results.reduce((a, b) => (RANK[b.decision] > RANK[a.decision] ? b : a), NONE)

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
export const GUARDED_TOOLS = [...FILE_TOOLS, ...SHELL_TOOLS]

/** Decision for one parsed hook event. Throws nothing; malformed input yields deny. */
export function decide(event, { projectDir, readFile = (p) => readFileSync(p, 'utf8') } = {}) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return deny('Malformed hook input: expected a JSON object.')
  const { tool_name: tool, tool_input: input } = event
  if (typeof tool !== 'string' || !tool) return deny('Malformed hook input: tool_name is missing.')
  if (!FILE_TOOLS.has(tool) && !SHELL_TOOLS.has(tool)) return NONE
  if (!input || typeof input !== 'object' || Array.isArray(input)) return deny(`Malformed hook input: tool_input for ${tool} is not an object.`)
  const root = projectDir || event.cwd
  if (typeof root !== 'string' || !root) return deny('Malformed hook input: no project directory (CLAUDE_PROJECT_DIR or cwd).')
  const ctx = { projectDir: root, cwd: typeof event.cwd === 'string' && event.cwd ? event.cwd : root }
  try {
    return FILE_TOOLS.has(tool) ? decideFile(tool, input, ctx, readFile) : decideShell(tool, input, ctx)
  } catch (error) {
    return deny(`Internal error while checking ${tool}: ${error?.message ?? error}`)
  }
}

function decideFile(tool, input, ctx, readFile) {
  const path = tool === 'NotebookEdit' ? input.notebook_path : input.file_path
  if (typeof path !== 'string' || !path.trim()) return deny(`Malformed hook input: ${tool} has no ${tool === 'NotebookEdit' ? 'notebook_path' : 'file_path'}.`)
  const rule = protectedRule(path, ctx)
  if (rule) {
    const shown = repoRelative(path, ctx) ?? path
    const message = `${shown} is protected: ${rule.why}`
    return rule.decision === 'deny' ? deny(`${message} This operation is blocked.`) : ask(`${message} ${APPROVAL}`)
  }
  if (tool === 'NotebookEdit') return NONE

  let before = ''
  const abs = normalizePath(path, ctx.cwd)
  if (existsSync(abs)) {
    try { before = readFile(abs) } catch (error) {
      return ask(`Could not read ${path} to check pinned hashes (${error.message}). ${APPROVAL}`)
    }
  }
  let after
  if (tool === 'Write') {
    if (typeof input.content !== 'string') return deny('Malformed hook input: Write has no string content.')
    after = input.content
  } else if (tool === 'Edit') {
    after = applyEdit(before, input)
    if (after === null) return deny('Malformed hook input: Edit needs string old_string and new_string.')
  } else {
    if (!Array.isArray(input.edits)) return deny('Malformed hook input: MultiEdit needs an edits array.')
    after = before
    for (const edit of input.edits) {
      after = edit && typeof edit === 'object' ? applyEdit(after, edit) : null
      if (after === null) return deny('Malformed hook input: every MultiEdit edit needs string old_string and new_string.')
    }
  }
  if (!sameDigests(before, after)) {
    return ask(`This change adds, removes or alters a SHA-256 digest in ${repoRelative(path, ctx) ?? path}. Pinned upstream hashes change only with sources and approval (frontend/CLAUDE.md). ${APPROVAL}`)
  }
  return NONE
}

// ---------------------------------------------------------------------------------------------
// Shell commands

/** Splits a command line into simple commands (argv arrays), roughly like a shell would. */
export function splitCommands(command, { powershell = false } = {}) {
  const commands = []
  let argv = []
  let word = null
  let quote = null
  const endWord = () => { if (word !== null) argv.push(word); word = null }
  const endCommand = () => { endWord(); if (argv.length) commands.push(argv); argv = [] }
  const escape = powershell ? '`' : '\\'
  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    if (quote) {
      if (c === quote) quote = null
      else if (c === escape && quote === '"' && i + 1 < command.length && !powershell && /["\\$`]/.test(command[i + 1])) word += command[++i]
      else word += c
      continue
    }
    if (c === '"' || c === "'") { quote = c; word ??= ''; continue }
    if (c === escape && i + 1 < command.length && (powershell || /[\s"'\\;&|()<>{}`$]/.test(command[i + 1]))) {
      word = (word ?? '') + command[++i]
      continue
    }
    if (/\s/.test(c) && c !== '\n' && c !== '\r') { endWord(); continue }
    if ('\n\r;&|(){}`'.includes(c)) { endCommand(); continue }
    if (c === '$' && command[i + 1] === '(') { endCommand(); i++; continue }
    if (c === '>' || c === '<') {
      // Redirection: one token (`>`, `>>`, `2>`, `2>&1`, `<<`) so callers can see output targets.
      let op = ''
      if (word !== null && /^\d$/.test(word)) { op = word; word = null } else endWord()
      op += c
      while (command[i + 1] === c) op += command[++i]
      if (command[i + 1] === '&') { op += command[++i]; while (/[\d-]/.test(command[i + 1] ?? '')) op += command[++i] }
      argv.push(op)
      continue
    }
    word = (word ?? '') + c
  }
  endCommand()
  return commands
}

const SHELL_LINE = /(^|[\s;&|(])(sh|bash|zsh|dash|ksh|pwsh|powershell|cmd|python3?|node|iex|invoke-expression)(\.exe)?(\s|$)/i

/**
 * Removes heredoc and PowerShell here-string bodies (commit messages, file contents), which are data,
 * not commands. A body fed to a shell or interpreter (`bash <<EOF`) is returned for analysis instead.
 */
export function stripHeredocs(command) {
  const scripts = []
  let text = command.replace(/<<-?[ \t]*(['"]?)([A-Za-z_][\w-]*)\1([^\n]*)\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/g, (_all, _q, _tag, rest, body, offset) => {
    const line = command.slice(command.lastIndexOf('\n', offset) + 1, offset)
    if (SHELL_LINE.test(line) || SHELL_LINE.test(rest)) scripts.push(body)
    return `<< HEREDOC${rest}`
  })
  text = text.replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, "''")
  return { text, scripts }
}

/** Removes redirection operators and their targets from an argv. */
function stripRedirects(argv) {
  const out = []
  for (let i = 0; i < argv.length; i++) {
    if (/^\d?(>>?|<<?)(&[\d-]*)?$/.test(argv[i])) { if (!argv[i].includes('&')) i++; continue }
    out.push(argv[i])
  }
  return out
}

/** Contents of $(...) and `...` spans, also inside double quotes, analysed as commands of their own. */
function nestedCommands(command, powershell) {
  const found = []
  for (const m of command.matchAll(/\$\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) found.push(m[1])
  if (!powershell) for (const m of command.matchAll(/`([^`]+)`/g)) found.push(m[1])
  return found
}

const WRAPPERS = new Set(['sudo', 'env', 'command', 'builtin', 'exec', 'nohup', 'time', 'nice', 'stdbuf', 'noglob', 'xargs', 'doas', 'call', 'start-process'])
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'cmd', 'powershell', 'pwsh', 'wsl'])

const base = (word) => word.replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, '')

/** Drops env assignments and wrappers such as `sudo`, `env X=1`, `timeout 10`. */
function unwrap(argv) {
  let a = argv.slice()
  for (;;) {
    while (a.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(a[0])) a = a.slice(1)
    if (!a.length) return a
    const name = base(a[0])
    if (name === '&' || name === '.') { a = a.slice(1); continue }
    if (WRAPPERS.has(name)) {
      a = a.slice(1)
      while (a.length && a[0].startsWith('-')) a = a.slice(1)
      continue
    }
    if (name === 'timeout') { a = a.slice(1); while (a.length && (a[0].startsWith('-') || /^\d/.test(a[0]))) a = a.slice(1); continue }
    return a
  }
}

const GIT_OPTS_WITH_VALUE = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix', '--config-env'])

/** `git -C dir -c k=v --no-pager push x` -> ['push', 'x']. */
function gitArgs(args) {
  let i = 0
  while (i < args.length && args[i].startsWith('-')) {
    const opt = args[i]
    i += GIT_OPTS_WITH_VALUE.has(opt) ? 2 : 1
  }
  return args.slice(i)
}

const hasShortFlag = (args, letter) => args.some((a) => /^-[a-z]+$/i.test(a) && a.slice(1).includes(letter))
const hasFlag = (args, ...names) => args.some((a) => names.some((n) => a === n || a.startsWith(`${n}=`)))

function checkGit(args) {
  const [sub = '', ...rest] = gitArgs(args)
  const s = sub.toLowerCase()
  const cmd = `git ${[s, ...rest].join(' ')}`.trim()
  const blocked = (why) => deny(`\`${cmd}\` is blocked: ${why} Ask the user to run it themselves if it is really needed.`)
  const approval = (why) => ask(`\`${cmd}\`: ${why} ${APPROVAL}`)
  switch (s) {
    case 'reset':
      if (hasFlag(rest, '--hard', '--merge', '--keep')) return blocked('it discards uncommitted work.')
      return NONE
    case 'clean':
      if (hasFlag(rest, '-n', '--dry-run') && !hasFlag(rest, '--force') && !hasShortFlag(rest, 'f')) return NONE
      return blocked('it deletes untracked files, including local data inputs and backups.')
    case 'push':
      if (hasFlag(rest, '--force', '--force-with-lease', '--force-if-includes', '--mirror', '--delete', '--prune') || hasShortFlag(rest, 'f') || hasShortFlag(rest, 'd') || rest.some((a) => /^\+/.test(a) || /^:/.test(a))) {
        return blocked('it rewrites or deletes published history.')
      }
      return approval('publishing to a remote.')
    case 'branch':
      if (hasShortFlag(rest, 'D') || (hasFlag(rest, '--delete', '-d') && hasFlag(rest, '--force', '-f'))) return blocked('it force-deletes a branch and may lose unmerged commits.')
      if (hasFlag(rest, '--delete', '-d', '-m', '-M', '--move', '-c', '-C', '--copy') || hasShortFlag(rest, 'd')) return approval('branch deletion or rename.')
      return NONE
    case 'filter-branch': case 'filter-repo':
      return blocked('it rewrites repository history.')
    case 'reflog':
      return /^(expire|delete)$/i.test(rest[0] ?? '') ? blocked('it destroys recovery information.') : NONE
    case 'update-ref':
      return hasFlag(rest, '-d', '--stdin') ? blocked('it deletes or rewrites references directly.') : approval('direct reference update.')
    case 'stash':
      if (/^clear$/i.test(rest[0] ?? '')) return blocked('it drops every stash.')
      if (/^drop$/i.test(rest[0] ?? '')) return approval('dropping a stash loses its changes.')
      return NONE
    case 'gc': case 'prune':
      return hasFlag(rest, '--prune') || s === 'prune' ? blocked('it prunes unreachable objects that may still be needed for recovery.') : NONE
    case 'checkout':
      if (rest.includes('--') || rest.includes('.') || hasFlag(rest, '-f', '--force', '--ours', '--theirs', '-p', '--patch')) return approval('checking out paths overwrites uncommitted changes.')
      return NONE
    case 'switch':
      return hasFlag(rest, '-f', '--force', '--discard-changes') ? approval('switching with --force discards uncommitted changes.') : NONE
    case 'restore':
      return approval('restoring paths overwrites uncommitted changes.')
    case 'commit':
      return approval('committing.')
    case 'merge': case 'rebase': case 'cherry-pick': case 'revert': case 'am': case 'pull':
      return approval(`${s} changes branch history.`)
    case 'tag':
      if (!rest.length || hasFlag(rest, '-l', '--list', '-v', '--verify', '--contains', '--points-at')) return NONE
      return approval('tagging (tags trigger image publishing).')
    case 'worktree':
      return /^remove$/i.test(rest[0] ?? '') && hasFlag(rest, '--force', '-f') ? approval('force-removing a worktree discards its changes.') : NONE
    case 'config':
      return /hookspath|core\.editor|alias\./i.test(rest.join(' ')) && rest.length > 1 && !hasFlag(rest, '--get', '--list', '-l', '--get-all') ? approval('changing git hooks, editor or aliases.') : NONE
    default:
      return NONE
  }
}

function checkGh(args) {
  const [group = '', sub = '', ...rest] = args.map((a, i) => (i < 2 ? a.toLowerCase() : a))
  const cmd = `gh ${args.join(' ')}`
  const approval = (why) => ask(`\`${cmd}\`: ${why} ${APPROVAL}`)
  if (group === 'repo' && sub === 'delete') return deny(`\`${cmd}\` is blocked: deleting the repository has no role in feature development.`)
  if (group === 'api') {
    const all = args.slice(1)
    const method = all.find((_a, i) => all[i - 1] === '-X' || all[i - 1] === '--method') ?? all.find((a) => /^--method=/.test(a))?.split('=')[1] ?? (all.find((a) => /^-X./.test(a))?.slice(2))
    const writes = method ? !/^(get|head)$/i.test(method) : hasFlag(all, '-f', '-F', '--field', '--raw-field', '--input')
    return writes ? approval('a GitHub API write.') : NONE
  }
  const writes = {
    pr: ['create', 'merge', 'close', 'reopen', 'edit', 'comment', 'review', 'ready', 'update-branch'],
    issue: ['create', 'close', 'reopen', 'edit', 'comment', 'delete', 'transfer', 'lock'],
    workflow: ['run', 'enable', 'disable'],
    run: ['rerun', 'cancel', 'delete'],
    release: ['create', 'delete', 'edit', 'upload', 'delete-asset'],
    repo: ['create', 'edit', 'rename', 'archive', 'fork', 'sync', 'set-default'],
    secret: ['set', 'delete', 'remove'],
    variable: ['set', 'delete'],
    ruleset: [], label: ['create', 'delete', 'edit'], cache: ['delete'],
  }
  if (writes[group]?.includes(sub)) return approval(group === 'pr' && sub === 'merge' ? 'merging (requires green CI).' : 'publishing to GitHub.')
  return NONE
}

const LOCAL_NPX = new Set(['vitest', 'tsc', 'vite'])
const NPM_OPTS_WITH_VALUE = new Set(['--prefix', '-C', '-w', '--workspace', '--userconfig', '--cache', '--registry', '--loglevel', '--dir', '--filter', '--cwd'])
function checkNpm(name, rawArgs, ctx) {
  let i = 0
  while (name !== 'npx' && i < rawArgs.length && rawArgs[i].startsWith('-')) i += NPM_OPTS_WITH_VALUE.has(rawArgs[i]) ? 2 : 1
  const args = rawArgs.slice(i)
  const [sub = '', ...rest] = args
  const cmd = `${name} ${args.join(' ')}`
  const approval = (why) => ask(`\`${cmd}\`: ${why} ${APPROVAL}`)
  if (name === 'npx' || (name === 'npm' && /^(exec|x)$/.test(sub))) {
    const list = name === 'npx' ? args : rest
    if (hasFlag(list, '-p', '--package', '-y', '--yes')) return approval('npx may download and execute a package.')
    const pkg = list.find((a) => !a.startsWith('-'))
    if (!pkg) return NONE
    const bin = normalizePath(`${ctx.projectDir}/frontend/node_modules/.bin/${pkg}`)
    if (LOCAL_NPX.has(pkg.toLowerCase()) || existsSync(bin)) return NONE
    return approval('npx may download and execute a package that is not in the lockfile.')
  }
  if (name === 'npm') {
    if (/^(publish|unpublish|deprecate|dist-tag|owner|access|token|adduser|login)$/.test(sub)) return approval('publishing to the npm registry.')
    if (/^(install|i|in|ins|inst|insta|instal|isnt|isntall|add|ci|update|up|upgrade|udpate|uninstall|un|unlink|remove|rm|r|link|ln|dedupe|audit)$/.test(sub)) {
      if (sub === 'audit' && !hasFlag(rest, 'fix') && rest[0] !== 'fix') return NONE
      return approval('dependency changes or install scripts.')
    }
    if (/^(run|run-script|rum|urn)$/.test(sub)) {
      const script = rest.find((a) => !a.startsWith('-')) ?? ''
      if (/^(data|data:(?!.*:verify$).+|icons)$/.test(script)) return approval(`\`npm run ${script}\` regenerates committed data; only within the task's scope.`)
    }
    return NONE
  }
  if (/^(yarn|pnpm|bun)$/.test(name) && /^(add|remove|install|up|upgrade|dlx|publish)$/.test(sub)) return approval('dependency changes or downloaded code.')
  if (name === 'bunx' || name === 'pnpx') return approval('may download and execute a package.')
  return NONE
}

function checkNodeScript(args) {
  const script = args.find((a) => !a.startsWith('-')) ?? ''
  if (/(^|\/)scripts\/(build-[\w-]+|refresh-conflicts|optimize-textures)\.mjs$/i.test(script.replace(/\\/g, '/'))) {
    return ask(`\`node ${script}\` regenerates committed data; only within the task's scope. ${APPROVAL}`)
  }
  return NONE
}

function checkDocker(name, args) {
  let a = args
  if (name === 'docker' && a[0] === 'compose') a = a.slice(1)
  else if (name !== 'docker-compose' && name !== 'docker' && name !== 'podman') return NONE
  while (a.length && a[0].startsWith('-')) a = a.slice(a[0] === '-f' || a[0] === '-p' || a[0] === '--file' || a[0] === '--project-name' ? 2 : 1)
  const [sub = '', ...rest] = a
  const cmd = `${name} ${args.join(' ')}`
  const blocked = (why) => deny(`\`${cmd}\` is blocked: ${why} Ask the user to run it themselves if it is really needed.`)
  if (sub === 'down' && (hasFlag(rest, '-v', '--volumes') || hasShortFlag(rest, 'v'))) return blocked('it deletes database and search volumes.')
  if (rest[0] === 'prune' && /^(system|volume|image|container|builder|network|buildx)$/.test(sub)) return blocked('pruning can delete data and images of other projects.')
  if (sub === 'prune') return blocked('pruning can delete data and images of other projects.')
  if (sub === 'volume' && /^(rm|remove)$/.test(rest[0] ?? '')) return blocked('it deletes a data volume.')
  if (/^(push|login)$/.test(sub)) return ask(`\`${cmd}\`: publishing images. ${APPROVAL}`)
  if (/^(stop|kill|rm)$/.test(sub) && name !== 'docker-compose' && args[0] !== 'compose') return ask(`\`${cmd}\`: may stop containers of other projects. ${APPROVAL}`)
  return NONE
}

const RM_NAMES = new Set(['rm', 'rmdir', 'remove-item', 'ri', 'del', 'erase', 'rd'])
function checkRemove(name, args, ctx, powershell) {
  const flags = args.filter((a) => a.startsWith('-') || /^\/[a-z]$/i.test(a))
  const recursive = powershell || name !== 'rm'
    ? flags.some((f) => /^-r(e(c(u(r(s(e)?)?)?)?)?)?$/i.test(f) || /^\/s$/i.test(f)) || name === 'rmdir' || name === 'rd'
    : hasShortFlag(flags, 'r') || hasShortFlag(flags, 'R') || hasFlag(flags, '--recursive')
  const targets = args.filter((a) => !a.startsWith('-') && !/^\/[a-z]$/i.test(a))
  const results = []
  for (const target of targets) {
    const t = target.replace(/\\/g, '/').replace(/\/+$/, '')
    if (recursive && (t === '' || t === '/' || t === '/*' || t === '~' || t === '~/*' || /^\$(home|env:userprofile|\{home\})(\/\*)?$/i.test(t) || /^[a-z]:(\/\*?)?$/i.test(t) || t === '*' && ctx.cwd && repoRelative(ctx.cwd, ctx) === '')) {
      results.push(deny(`\`${name} ${args.join(' ')}\` is blocked: recursive deletion of a root, home or repository directory.`))
      continue
    }
    if (/[$`]/.test(t)) continue
    const rel = repoRelative(t, ctx)
    if (rel === '' && recursive) results.push(deny(`\`${name} ${args.join(' ')}\` is blocked: it would delete the repository.`))
    else if (rel === '.git' || rel?.startsWith('.git/')) results.push(deny(`\`${name} ${args.join(' ')}\` is blocked: it deletes Git internals.`))
  }
  return strongest(results)
}

const READ_ONLY = new Set([
  'cat', 'head', 'tail', 'less', 'more', 'grep', 'egrep', 'fgrep', 'rg', 'ls', 'dir', 'wc', 'diff', 'cmp', 'stat', 'file',
  'sha256sum', 'shasum', 'md5sum', 'echo', 'printf', 'pwd', 'cd', 'test', 'true', 'jq', 'sort', 'uniq', 'cut', 'tr', 'awk',
  'get-content', 'gc', 'type', 'select-string', 'sls', 'get-childitem', 'gci', 'test-path', 'get-item', 'gi', 'get-filehash',
  'measure-object', 'select-object', 'where-object', 'format-list', 'format-table', 'convertfrom-json', 'write-output', 'set-location', 'sl', 'resolve-path',
])
const READ_ONLY_GIT = new Set(['diff', 'log', 'show', 'status', 'blame', 'grep', 'ls-files', 'cat-file', 'rev-parse', 'check-ignore', 'shortlog', 'describe', 'ls-tree'])

function isReadOnly(argv) {
  const a = unwrap(argv)
  if (!a.length) return true
  // Output redirections write, except into the null device; `2>&1` only duplicates a descriptor.
  if (a.some((w, i) => /^\d?>>?$/.test(w) && !/^(\/dev\/null|\$null|nul)$/i.test(a[i + 1] ?? ''))) return false
  const name = base(a[0])
  if (name === 'git') return READ_ONLY_GIT.has((gitArgs(a.slice(1))[0] ?? '').toLowerCase())
  if (name === 'sed') return !a.some((w) => /^-[a-z]*i|^--in-place/i.test(w))
  if (name === 'awk') return !a.some((w) => /system|print[^>]*>/.test(w))
  if (name === 'find') return !a.some((w) => /^-(exec|execdir|delete|fprint|fprintf|fls|ok|okdir)/.test(w))
  return READ_ONLY.has(name)
}

/** Protected path rules a command line mentions (literal paths; relative ones resolved from cwd). */
function mentionedProtected(argvs, ctx) {
  const hits = []
  for (const argv of argvs) {
    for (const word of argv) {
      for (const piece of word.split(/[=,]/)) {
        if (!/[\w.~]/.test(piece) || /^-/.test(piece) || /[$`*?]/.test(piece) && !/[/\\]/.test(piece)) continue
        let rule = null
        try { rule = protectedRule(piece.replace(/[*?].*$/, '') || piece, { ...ctx, resolveLinks: false }) } catch { rule = null }
        if (rule && rule.glob !== '(8.3 short name)') hits.push({ rule, path: piece })
      }
    }
  }
  return hits
}

const DOWNLOADERS = new Set(['curl', 'wget', 'invoke-webrequest', 'iwr', 'invoke-restmethod', 'irm', 'fetch'])
const EXECUTORS = new Set(['sh', 'bash', 'zsh', 'dash', 'iex', 'invoke-expression', 'python', 'python3', 'node', 'pwsh', 'powershell', 'perl', 'ruby'])

function decideShell(tool, input, ctx, depth = 0) {
  const { command } = input
  if (typeof command !== 'string') return deny(`Malformed hook input: ${tool} has no string command.`)
  const powershell = tool === 'PowerShell'
  if (/--dangerously-skip-permissions|bypassPermissions|disableAllHooks/i.test(command)) {
    return deny('Commands that bypass permissions or disable hooks are blocked.')
  }
  const { text, scripts } = stripHeredocs(command)
  const argvs = splitCommands(text, { powershell })
  const results = []

  for (const nested of [...nestedCommands(text, powershell), ...scripts]) {
    if (depth < 4) results.push(decideShell(tool, { command: nested }, ctx, depth + 1))
  }

  // Download-and-execute pipelines: curl ... | sh, iwr ... | iex.
  const names = argvs.map((a) => { const u = unwrap(a); return u.length ? base(u[0]) : '' })
  const downloadAt = names.findIndex((n) => DOWNLOADERS.has(n))
  if (downloadAt >= 0 && names.slice(downloadAt + 1).some((n) => EXECUTORS.has(n))) {
    results.push(deny('Downloading and executing code in one pipeline is blocked.'))
  }

  // `here` follows literal `cd` / `Set-Location` / `pushd` within the command line.
  let here = ctx
  for (const raw of argvs) {
    const argv = unwrap(raw)
    if (!argv.length) continue
    const name = base(argv[0])
    const args = stripRedirects(argv.slice(1))
    if (/^(cd|chdir|pushd|set-location|sl)$/.test(name)) {
      const target = args.find((a) => !a.startsWith('-'))
      if (target && !/[$`%]/.test(target)) here = { ...here, cwd: normalizePath(target, here.cwd) }
      continue
    }
    // Nested shells: bash -c "...", powershell -Command "..." (or positional), cmd /c ...
    if (SHELLS.has(name)) {
      const ps = /^(powershell|pwsh)$/.test(name)
      if (ps && args.some((a) => /^-(e|ec|en|enc|encodedcommand)$/i.test(a))) {
        results.push(ask(`Encoded PowerShell commands cannot be checked. ${APPROVAL}`))
        continue
      }
      const flag = args.findIndex((a) => (ps ? /^-c(o(m(m(a(n(d)?)?)?)?)?)?$/i.test(a) : name === 'cmd' ? /^\/[ck]$/i.test(a) : /^-[a-z]*c$/.test(a)))
      let inner = null
      if (flag >= 0) inner = args.slice(flag + 1).join(' ')
      else if ((ps || name === 'wsl') && args.length && !args.some((a) => /^-f(i(l(e)?)?)?$/i.test(a))) inner = args.filter((a) => !a.startsWith('-')).join(' ')
      if (inner && depth < 4) results.push(decideShell(ps ? 'PowerShell' : 'Bash', { command: inner }, here, depth + 1))
      continue
    }
    if (name === 'eval' || name === 'invoke-expression' || name === 'iex') {
      if (depth < 4) results.push(decideShell(tool, { command: args.join(' ') }, here, depth + 1))
      continue
    }
    if (name === 'git') results.push(checkGit(args))
    else if (name === 'gh') results.push(checkGh(args))
    else if (/^(npm|npx|yarn|pnpm|pnpx|bun|bunx)$/.test(name)) results.push(checkNpm(name, args, here))
    else if (name === 'node') results.push(checkNodeScript(args))
    else if (/^(docker|docker-compose|podman)$/.test(name)) results.push(checkDocker(name, args))
    else if (RM_NAMES.has(name)) results.push(checkRemove(name, args, here, powershell))
    else if (/^(ssh|scp|rsync|sftp)$/.test(name)) results.push(ask(`\`${argv.join(' ')}\`: remote access or deployment. ${APPROVAL}`))
    else if (name === 'claude') results.push(ask(`\`${argv.join(' ')}\`: starting another Claude Code session. ${APPROVAL}`))

    // Commands that mention a protected path and are not read-only (cp, mv, sed -i, >, tee,
    // Set-Content, git mv/rm/apply, ...). A command that writes without naming the path is not
    // seen. A mention is a heuristic, so it asks rather than blocks.
    if (!isReadOnly(raw)) {
      for (const { rule, path } of mentionedProtected([argv], here)) {
        results.push(ask(`This command may modify ${path}: ${rule.why} ${APPROVAL}`))
      }
    }
  }
  return strongest(results)
}

// ---------------------------------------------------------------------------------------------
// Hook protocol

/** Turns a decision into the process result Claude Code expects. */
export function render(result) {
  if (result.decision === 'deny') return { exitCode: 2, stdout: '', stderr: `${HOOK}: ${result.reason}\n` }
  if (result.decision === 'ask') {
    return {
      exitCode: 0,
      stderr: '',
      stdout: `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: `${HOOK}: ${result.reason}` } })}\n`,
    }
  }
  return { exitCode: 0, stdout: '', stderr: '' }
}

/** Full hook run on raw stdin text. */
export function run(stdinText, env = process.env) {
  let event
  try { event = JSON.parse(stdinText) } catch (error) {
    return render(deny(`Malformed hook input: stdin is not valid JSON (${error.message}).`))
  }
  if (event && typeof event === 'object' && event.hook_event_name && event.hook_event_name !== 'PreToolUse') return render(NONE)
  return render(decide(event, { projectDir: env.CLAUDE_PROJECT_DIR || event?.cwd }))
}

if (process.argv[1] && normalizePath(process.argv[1]).toLowerCase() === normalizePath(fileURLToPath(import.meta.url)).toLowerCase()) {
  const chunks = []
  process.stdin.on('data', (c) => chunks.push(c))
  process.stdin.on('error', () => { process.stderr.write(`${HOOK}: could not read stdin.\n`); process.exit(2) })
  process.stdin.on('end', () => {
    let out
    try { out = run(Buffer.concat(chunks).toString('utf8')) } catch (error) {
      out = { exitCode: 2, stdout: '', stderr: `${HOOK}: internal error: ${error?.stack ?? error}\n` }
    }
    if (out.stdout) process.stdout.write(out.stdout)
    if (out.stderr) process.stderr.write(out.stderr)
    process.exitCode = out.exitCode
  })
}
