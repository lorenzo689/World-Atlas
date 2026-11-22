# Agent skills (Claude Code)

Project skills are reusable workflows in `.claude/skills/<name>/SKILL.md`, invoked as `/<name>` in
Claude Code. They sequence the rules in [CLAUDE.md](../CLAUDE.md) and the scoped files. They do not
repeat or relax those rules. The permission rules and the guard hook
([AGENT-GUARDRAILS.md](AGENT-GUARDRAILS.md)) apply unchanged while a skill runs.

Checked against Claude Code **2.1.330** and code.claude.com/docs/en/skills.

## Skills

| Skill | Use | Stops at |
| --- | --- | --- |
| `/implement-feature <description>` | One feature request → understand, plan, implement, verify, review, report | A reviewed local diff and a structured report. It never commits, pushes, opens a PR or deploys |

Example: `/implement-feature In the explorer, R resets the camera to the scenario's default view`.
For Git actions after the report, ask separately ("commit this on a feature branch").

## Project policy for skills

Enforced by `frontend/scripts/lib/__tests__/agent-skills.test.mjs` for every directory under
`.claude/skills/`:

- Frontmatter starts on line 1 and uses flat `key: value` lines (a strict YAML subset). `name` equals
  the directory name; `description` is required; unknown fields (typos) fail.
- `disable-model-invocation: true`: a skill that edits code runs only when a person types it. Its
  description is then not in the model's context.
- Forbidden: `allowed-tools` (pre-approves tools, skipping prompts), `context`/`agent`/`background`
  (forked agents), `hooks` (a skill must not change the guardrails). No permission rule may allow a
  `Skill(…)`.
- No `` !`command` `` or ` ```! ` shell injection: it runs before anyone has seen the skill's output.
- No permission or hook bypass keywords. Body under 500 lines.

For `implement-feature` the test also checks: the request arrives through one `$ARGUMENTS` inside
`<feature-request>`; the six phases are in order; every npm script and repository path it names
exists; every command it names passes the guard hook without a prompt and none is a Git write;
frontend, backend and historical verification are separate sections with the right commands
(historical: every `DATA_CHECKS` verifier, `--require-external`, control points, byte-identical
snapshots); the four statuses (passed, failed, blocked, not run); the nine report sections; and the
final stop before any Git action. A negative suite proves the linter rejects each forbidden form.

## Benchmark with the real Claude Code (opt-in)

```sh
node .claude/skills/implement-feature/benchmark.mjs [--model sonnet] [--case frontend|history]
```

Needs a Claude login and costs money (about $0.55–0.65 for both cases with Sonnet, two runs on 2026-11-22).
It is not part of `npm test` or CI. It runs `claude -p "/implement-feature …"` in this repository in
**planning-only** mode (`--permission-mode plan`, Edit/Write disallowed, a system prompt limiting the
run to phases 1 and 2) for a frontend UI request and a historical-data request. It then runs a
tool-less Haiku probe.

Hard checks come from Claude Code's event stream, the session transcript and git state: the skill
is listed in the init event; the expanded skill text, with the request substituted into
`<feature-request>`, reached the model; no Edit/Write inside the repository; no Git write command;
`git status` and `git diff` unchanged; a final plan exists; the probe model does not see the skill.
Plan checks look for each case's expected verification commands and measure plan quality. Streams
and plans are kept in the OS temp directory.

Observed 2026-11-22 (Sonnet; frontend case re-scored from the saved stream after a fix to read the
last `result` event):

| Check | Frontend | History |
| --- | --- | --- |
| Discovered, expanded, `$ARGUMENTS` substituted | pass | pass |
| No repository edits, no Git writes, tree unchanged | pass | pass |
| Plan with AC, matching verification, negative tests | pass (10 AC, 5 negative) | pass (`verify:data`, `data:ww2:verify`, `--require-external` reported as not run when inputs are absent) |
| Model cannot auto-load the skill (Haiku probe answered "none") | pass | |

Findings from building the benchmark: `stream-json` does not echo the expanded skill prompt (use
the transcript); plan mode writes its own plan file under `~/.claude/plans/` (outside the repository,
so it is not a repository edit); with a background subagent, Claude Code emits an early `result`
event before the final one.

## Limits

- The static test checks the instructions, not the model's behaviour. Only the benchmark observes
  behaviour, and only for planning. A full implementation run is not benchmarked (cost, and it would
  change the tree).
- Model behaviour varies between runs and models. One passing run is evidence, not a guarantee.
- `.claude/skills/**` is not a protected path in the guard hook, so an agent could edit a skill
  without a prompt. The test and review catch a weakened skill. See the follow-up below.

## Follow-up: protect `.claude/skills/**`

Open, not done in Sprint 3.1 (it changes the guardrails, which needs approval). Add
`.claude/skills/**` with decision `ask` to the protected paths in `.claude/hooks/guard.mjs` and an
`Edit(/.claude/skills/**)` rule under `permissions.ask` in `.claude/settings.json`. Add matching cases
to `agent-guard.test.mjs` (every path spelling, Write and Edit, plus a read-only command that stays
allowed), and list the path in [AGENT-GUARDRAILS.md](AGENT-GUARDRAILS.md). A skill edit then needs a
human decision, as an edit to the hook itself already does.
