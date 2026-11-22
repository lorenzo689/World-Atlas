# Agent guardrails (Claude Code)

Coding agents should be able to do ordinary feature work without constant prompts. High-risk
operations need a human decision. This document covers the two layers that enforce that, how they
are tested, and where they stop working. The approval list itself is in [CLAUDE.md](../CLAUDE.md)
("Approval boundaries"). These guardrails support that list; they do not replace review, CI or
GitHub protection.

Checked against Claude Code **2.1.330** and its documentation for hooks (code.claude.com/docs/en/hooks)
and permissions (code.claude.com/docs/en/permissions).

## Layers

| Layer | File | Decides | Stops working when |
| --- | --- | --- | --- |
| Permission rules | `.claude/settings.json` (`permissions`) | Exact or prefix matches on tool, command or path: `allow`, `ask`, `deny` | The command is spelled differently (`git -C . push`), runs inside a script, or the rule is pattern-matched around |
| Guard hook | `.claude/hooks/guard.mjs` (`PreToolUse`, matcher `Bash\|PowerShell\|Edit\|Write\|MultiEdit\|NotebookEdit`) | Content- and parse-based checks the rules cannot express | The write happens in a process the hook cannot see (see [Limits](#limits-and-known-bypasses)) |
| Review and CI | PR review, `.github/workflows/ci.yml`, branch protection | Everything, after the fact | Branch protection is missing (see [GitHub](#github-protection)) |

How the layers combine (Claude Code documentation, confirmed by the end-to-end test below):

- A `deny` rule blocks the call even when the hook allows it. Hook exit code 2 blocks it before any
  rule is evaluated.
- An `ask` rule prompts. A hook `ask` also prompts, even when an `allow` rule matches. In
  non-interactive mode (`claude -p`) nobody can answer, so the call is denied.
- A hook never returns `allow`, so it can only make a decision stricter.
- `permissions.allow` in a project file applies only after the workspace trust dialog has been
  accepted. `ask` and `deny` apply immediately.

## Permission configuration

- **allow**: edits under `frontend/src`, `frontend/scripts`, `backend/src` and `docs`; named
  verification commands (`npm run verify:fast`, `verify:data`, `typecheck`, `build`, `audit:map`,
  `perf`, each `data:*:verify`, `npm test`, `npx vitest run …`, `./mvnw test|verify`); read-only
  git and gh (`status`, `diff`, `log`, `show`, `pr view|checks|diff`, `run list|view`); creating a
  feature branch. There is no bare `Bash`, `Bash(npm *)`, `Bash(git *)` or `Edit` rule; a test
  enforces this.
- **ask**: the protected paths below, plus `git push|merge|commit|tag|rebase|cherry-pick|restore`,
  `git checkout -- …`, `gh pr create|merge|close|comment|review`, `gh workflow …`, `gh release`,
  `gh secret|variable`, `npm publish|install|ci|uninstall|update`, `docker push`, `ssh|scp|rsync`.
- **deny**: `git reset --hard`, `git clean`, force or mirror pushes, `git branch -D`,
  `filter-branch`, `reflog expire`, `stash clear`, `update-ref -d`, `docker compose down -v`, all
  `docker … prune`, `docker volume rm`, `gh repo delete`, any command containing
  `--dangerously-skip-permissions`, editing `.git/**`, and reading `deploy/.env`.
- `disableBypassPermissionsMode: "disable"`: bypass mode cannot be turned on in this project.

## Guard hook

`node "${CLAUDE_PROJECT_DIR}/.claude/hooks/guard.mjs"` runs in exec form (no shell, the same on
Windows and Linux) with `onFailure: "block"`. It uses Node built-ins only; Node is already required
by the frontend.

| Output | Meaning |
| --- | --- |
| exit 0, no output | No opinion; the permission rules decide |
| exit 0, `hookSpecificOutput.permissionDecision: "ask"` | The user must approve; the reason appears in the prompt |
| exit 2, reason on stderr | Blocked; the reason is shown to the agent |

### File tools (Edit, Write, MultiEdit, NotebookEdit)

Protected paths. Matching is case-insensitive and anchored at the repository root:

| Path | Decision | Reason |
| --- | --- | --- |
| `frontend/perf-budget.json` | ask | Performance budget |
| `frontend/scripts/map-audit-baseline.json` | ask | Map audit baseline |
| `backend/src/main/resources/db/migration/**` | ask | Flyway migrations |
| `backend/src/main/java/dev/worldexplorer/common/security/**`, `backend/src/main/resources/application*.{yml,yaml,properties}` | ask | Security-sensitive backend configuration |
| `deploy/**` | ask | Production deployment |
| `.github/workflows/**` | ask | CI gates, Pages and image publishing |
| `frontend/public/data/**`, `frontend/scripts/source/**`, `frontend/scripts/data/**` | ask | Generated data and pinned upstream inputs |
| `.claude/settings.json`, `.claude/settings.local.json`, `.claude/hooks/**`, `~/.claude/settings*.json` | ask | The guardrails themselves |
| `.git/**` | deny | Git internals |

**Pinned upstream hashes.** The digests sit inside generator code (`build-history.mjs`,
`build-map-detail.mjs`, `build-ww2-atlas.mjs`, `provenance.mjs`, …). Asking for every edit of a
generator would be noise, so the hook compares the set of 64-digit hex strings (SHA-256) in the
whole file before and after the edit. It applies the `Edit`/`MultiEdit` replacements to the current
content first, so changing half of a digest is caught too. Adding, removing or altering a digest
anywhere in the repository asks for approval. Shorter hex strings, such as git SHAs and colours,
do not count.

**Path normalisation.** Separators are converted (`\` → `/`). The hook resolves `.`, `..` and
repeated separators, and accepts drive letters in any case, Git Bash `/c/…`, `/cygdrive/c/…` and
`\\?\C:\…`. It strips trailing dots and spaces, which Windows ignores, and resolves relative paths
against the event's `cwd`. Symlinks and junctions are resolved for the longest existing prefix.
Paths inside `.claude/worktrees/<name>/` map to the same protected paths. A Windows 8.3 short name
(`PERF-B~1.JSO`) cannot be checked, so it asks.

### Shell tools (Bash, PowerShell)

A small tokenizer follows the shell's quoting rules and splits on `&&`, `||`, `;`, `|`, `&`,
newlines, subshells, `$(…)` and backticks. Contents of `$(…)` are checked even inside double
quotes. The checker:

- removes environment assignments and wrappers (`sudo`, `env`, `timeout`, `nohup`, `xargs`, `&`),
  and git's global options (`-C`, `-c`, `--git-dir`, …);
- recurses into `bash -c`, `sh -lc`, `cmd /c`, `powershell -Command` (and the positional form),
  `pwsh -c`, `eval`, `Invoke-Expression`. An `-EncodedCommand` asks;
- classifies each heredoc and PowerShell here-string body by what consumes it:
  - **executed** (`bash <<EOF`, `cat <<EOF | sh`, `node <<EOF`, `eval "$(cat <<EOF …)"`,
    `@'…'@ | iex`): analysed as commands, with every rule applied;
  - **written to a file** (`cat > run.sh <<EOF`, `tee`, `Set-Content`): keeps the
    permission-bypass keyword check, because the file may run or configure Claude Code later;
  - **inert data** (commit messages, `gh pr create --body`): ignored. So a message that mentions
    `git push --force` or `disableAllHooks` does not block the commit or the PR;
- follows a literal `cd` / `Set-Location` within the command line.

Decisions: deny for the destructive commands listed under the permission configuration, plus
`rm -rf` on `/`, `~`, `$HOME`, a drive root, the repository or `.git`; `curl|wget|iwr … | sh|bash|iex`;
and any command whose executable text (outside inert heredoc data) contains
`--dangerously-skip-permissions`, `bypassPermissions` or `disableAllHooks`. A quoted argument such as
`git commit -m "… disableAllHooks …"` is still executable text and is blocked; use a heredoc
(`git commit -F - <<'EOF'`) for such messages. Ask for publishing, merging and history changes (push, merge, pull, rebase,
commit, tag, restore, checkout of paths, `gh` writes, `gh api` with a non-GET method or fields);
dependency changes and `npx` of a package that is not installed locally; data generators
(`npm run data*` other than `*:verify`, `node scripts/build-*.mjs`); `docker push|stop|kill|rm`;
`ssh`/`scp`/`rsync`; starting `claude`. Ask also for any command that is not read-only and names a
protected path (`cp`, `mv`, `sed -i`, `>`, `tee`, `Set-Content`, `git rm`, …). Read-only commands
(`cat`, `grep`, `git diff`, `Get-Content`, …) may name protected paths freely.

The hook fails closed. It exits 2 when stdin is not a JSON object, when `tool_name` or the project
directory is missing, when `tool_input` is not an object, or when a guarded tool lacks its required
fields (`file_path`, `command`, string `old_string`/`new_string`, `content`, an `edits` array). It
also exits 2 on an internal error. Tools it does not guard, and events other than `PreToolUse`,
pass through.

The hook does **not** run verification on edits. Verification stays a deliberate step
(`npm run verify:fast`, see CLAUDE.md).

## Tests

| Command | What it proves |
| --- | --- |
| `npx vitest run scripts/lib/__tests__/agent-guard.test.mjs` (from `frontend/`; also part of `npm test` and therefore CI on Linux) | Allowed ordinary edits and commands, protected paths in every spelling, digest changes, destructive commands (deny), publishing (ask), false-positive cases, malformed input (exit 2), the process protocol (spawns the hook: exit codes, stdout JSON, stderr), and the settings file (no bypass, no broad allow, required ask/deny rules, matcher covers every guarded tool, each deny rule agrees with the hook) |
| `node .claude/hooks/e2e-claude.mjs` (from the repository root; opt-in, needs a Claude login, costs about $0.005 with Haiku) | Real Claude Code in headless mode: in a temporary repository whose rules allow every Edit and git command, an ordinary edit lands, while the perf-budget edit, `git reset --hard` and `git push` are stopped by the hook and reported in `permission_denials`. Verdict comes from file and git state |

Approval path versus headless denial (one-off run, 2026-11-22, not committed): the same scenario was
run with `--permission-prompt-tool`, Claude Code's programmatic stand-in for the interactive dialog,
pointing to an MCP tool that approves every prompt. The perf-budget edit and `git push` reached the
prompt and ran after approval, while `git reset --hard` never reached the prompt and stayed blocked.
So a hook `ask` means "a human decides" (denied only when nobody can answer), and a `deny` cannot be
approved.

## Limits and known bypasses

The guardrails make the usual mistakes hard. They are not a sandbox:

- **Writes the hook cannot see.** A Node or Python script, an npm script, a generator, `git apply`
  or `patch` with a patch file, `git stash pop`, `git checkout <branch>`, a build tool or a test can
  write to any path without naming it on the command line. `npm run data*` and
  `node scripts/build-*.mjs` ask; any other script runs unchecked. CI's geometry rebuild and diff,
  `verify:data`, and review are the backstop.
- **Shell parsing is best effort.** Variables (`$F`, `$env:F`), globs (`frontend/perf-*`),
  aliases, functions, `find -exec`, `xargs` with stdin arguments, a path built at run time, and
  commands in a script file are not resolved. A protected path that is not written literally is not
  seen. The Claude Code documentation says the same of its own rules: a Bash rule "isn't a security
  boundary around the program".
- **MCP tools and other agents' tools** are not matched. Subagents run the same hooks (Claude Code
  documentation), but an MCP server that writes files does not go through `Edit`.
- **Hooks can be switched off** by the user: `disableAllHooks` in user or local settings, `--bare`,
  `--settings '{"disableAllHooks": true}'`, or by editing these files. The hook asks before an agent
  edits any of them and blocks commands that contain `disableAllHooks`, but a human (or an
  unchecked script) can still change them. Only managed (organisation) settings can enforce hooks.
- **Timeouts.** `onFailure: "block"` turns a crash into a block. The documentation says a
  *timed-out* `PreToolUse` hook does not block, but the hook takes well under a second. Without
  Node on `PATH`, every guarded tool is blocked (fail closed).
- **"Don't ask again" on Windows** writes the approval to `.claude/settings.json`, the shared
  project file. That adds an allow rule, which does not override a hook `ask` or `deny`, and the
  change shows up in the diff. Review it before committing.
- **Worktrees.** Claude Code worktrees under `.claude/worktrees/` are covered. A git worktree
  elsewhere has its own root and is only covered when a session starts there with this
  configuration.
- **Not covered by intent:** historical classifications and dates in data files (protected through
  `frontend/public/data/**`, `scripts/data/**` and review, not by content), dependency changes made
  by editing `package.json` or `pom.xml` directly (review and `npm audit` in CI), and reading
  arbitrary files (only `deploy/.env` is denied).

## GitHub protection

As of 2026-11-22 (`gh api …/branches/main/protection`, `…/rulesets`, `…/rules/branches/main`),
`main` has **no branch protection and no rulesets**. The repository is public, and pushes and
merges to `main` are possible without a pull request or green CI. The CLAUDE.md rule "merging
requires green CI" is therefore a convention only.

Minimum ruleset for `main` (Settings → Rules → Rulesets, target: default branch), to be applied by
the owner:

1. **Require a pull request before merging** (0 approvals is acceptable for a single maintainer).
2. **Require status checks to pass**: `frontend`, `backend`, `e2e` (workflow `CI`, source GitHub
   Actions), with **Require branches to be up to date before merging**.
3. **Block force pushes** and **Restrict deletions**.
4. Leave the bypass list empty, or limit it to the repository admin for emergencies. Bypasses are
   logged.

Optional: enable "Allow auto-merge", so a PR merges itself once the checks pass, and restrict tag
creation (`v*`), because tags trigger `publish-images.yml`.
