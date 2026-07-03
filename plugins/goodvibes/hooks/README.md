# goodvibes hooks

Plain `.mjs` hooks, no build step (§7 R8), wired via `hooks.json` (auto-discovered by the plugin
loader — not referenced from `plugin.json`). This single plugin ships the union of the intel,
analytics, and connect lifecycle hooks side by side.

| Hook | Event | Origin | What it does |
|---|---|---|---|
| `session-start.mjs` | SessionStart | intel | Fresh git/stack signals every call (bounded to 4s); TODO count / host-health notes served from `.goodvibes/v2/cache/session-context.json`, refreshed by a detached background child so a slow scan never blows the timeout. Emits `hookSpecificOutput.additionalContext` (the corrected schema). |
| `session-start-open-mode.mjs` | SessionStart | connect | Announces when the connect trust boundary is in OPEN (unrestricted) mode, and whether it persists across sessions. Observe-only. |
| `setup.mjs` | Setup (`init`) | intel | Runs once per project (marker in `.goodvibes/v2/`), never touches the global home directory. Points at `/goodvibes:plugin setup` for native-dependency install — that command is the consent point, not this hook. |
| `subagent-start.mjs` | SubagentStart | intel | ≤500-token skill-name pointers for the agent type (no doctrine dump). Records a tracking entry in `.goodvibes/v2/state/agent-tracking.json` that other hooks correlate against. |
| `post-tool-use-failure.mjs` | PostToolUseFailure (`Bash`) | intel | 3-phase fix loop (existing knowledge → official docs → community docs) keyed by a stable error signature; logs exhausted errors to `.goodvibes/v2/memory/failures.jsonl`. |
| `commit-guard.mjs` | PreToolUse (`Bash`) | connect | Warn-first secrets commit guard: a `git add`/`commit` of a known credential file warns once, then blocks. |
| `session-end.mjs` | SessionEnd | analytics | Writes a session-close marker under `.goodvibes/v2/cache/`, prunes old ones. Nothing else. |
| `stop.mjs` | Stop | analytics | Appends one silent telemetry line per stop event to a monthly JSONL log under `.goodvibes/v2/telemetry/`. No injection. |
| `subagent-stop.mjs` | SubagentStop | analytics | Telemetry-only: correlates with the SubagentStart tracking entry (R15), runs a bounded `tsc --noEmit` when TypeScript files were touched, writes one JSONL record. No systemMessage/additionalContext. |
| `pre-compact.mjs` | PreCompact | analytics | Observe-only: writes a session summary (`.goodvibes/v2/state/last-session-summary.md`) and a small backup marker. Never mutates the working tree. |

`lib/common.mjs` — shared stdin/response/state helpers and `.goodvibes/v2/` path namespacing
(R15). Every hook is fail-open: a bug in the handler still emits a valid `{ continue: true }`
response and never blocks the native tool it observes.

Smoke tests: `packages/intel/src/__tests__/hooks-smoke.test.ts` and
`packages/analytics/src/__tests__/hooks-smoke.test.ts` spawn each hook as a real `node` subprocess
with synthetic stdin and assert valid JSON output and the correct schema where applicable.
connect's hooks are covered by `packages/connect/src/__tests__/hooks/`.
