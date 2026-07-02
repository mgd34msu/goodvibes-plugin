# goodvibes-analytics hooks

Plain `.mjs` hooks, no build step (§7 R8), wired via `hooks.json` (auto-discovered
by the plugin loader — not referenced from `plugin.json`).

| Hook | Event | What it does |
|---|---|---|
| `session-end.mjs` | SessionEnd | KEEP (slim): writes a session-close marker under `.goodvibes/v2/cache/`, prunes old ones. Nothing else — no dashboard-pane teardown, no automation IPC (both retired). |
| `stop.mjs` | Stop | KEEP: appends one silent telemetry line per stop event to a monthly JSONL log in its own `.goodvibes/v2/telemetry/` namespace. No injection. |
| `subagent-stop.mjs` | SubagentStop | REBUILD, telemetry-only: correlates with the tracking entry goodvibes-intel's SubagentStart wrote (shared project state, R15), runs a bounded `tsc --noEmit` when TypeScript files were touched, writes one JSONL telemetry record. The ~1.5KB v1 orchestrator-context injection is deleted outright — this hook returns no systemMessage/additionalContext. |
| `pre-compact.mjs` | PreCompact | REBUILD, observe-only: writes a session summary (`.goodvibes/v2/state/last-session-summary.md`) and a small backup marker. The v1 automatic git checkpoint commit is removed — hooks inform, never mutate the working tree. |

`lib/common.mjs` — shared stdin/response/state helpers, the R16 v1-yield guard,
and `.goodvibes/v2/` path namespacing (R15), mirroring goodvibes-intel's
`lib/common.mjs` (each plugin is self-contained; small deliberate duplication).

Smoke tests: `packages/analytics/src/__tests__/hooks-smoke.test.ts` spawns each
hook as a real `node` subprocess with synthetic stdin and asserts valid,
silent-where-required JSON output and the R16 yield path.
