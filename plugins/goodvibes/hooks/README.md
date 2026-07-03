# goodvibes hooks

Plain `.mjs` hooks, no build step (§7 R8), wired via `hooks.json` (auto-discovered by the plugin
loader — not referenced from `plugin.json`). This single plugin ships the union of the intel,
analytics, and connect lifecycle hooks side by side.

| Hook | Event | Origin | What it does |
|---|---|---|---|
| `session-start.mjs` | SessionStart | intel | One value line (last session's cost recap), plus project-health notes, the host-health nudge, and native-dep handling: probes each server, silently relinks the durable install after a plugin update, and otherwise kicks `lib/deps-install.mjs` detached (never blocks on npm) with a one-line notice — or reports a recent failed install with the log path. Emits `hookSpecificOutput.additionalContext` (the corrected schema). |
| `session-start-open-mode.mjs` | SessionStart | connect | Announces when the connect trust boundary is in OPEN (unrestricted) mode, and whether it persists across sessions. Observe-only. |
| `setup.mjs` | Setup (`init`) | intel | When any server's native deps are missing, kicks `lib/deps-install.mjs` detached and stays silent — SessionStart owns the user-visible install lines; `/goodvibes:setup` is the manual foreground repair path. |
| `subagent-start.mjs` | SubagentStart | intel | ≤500-token skill-name pointers for the agent type (no doctrine dump). Records a tracking entry in `.goodvibes/state/agent-tracking.json` that other hooks correlate against. |
| `post-tool-use-failure.mjs` | PostToolUseFailure (`Bash`) | intel | 3-phase fix loop (existing knowledge → official docs → community docs) keyed by a stable error signature; logs exhausted errors to `.goodvibes/memory/failures.jsonl`. |
| `commit-guard.mjs` | PreToolUse (`Bash`) | connect | Warn-first secrets commit guard: a `git add`/`commit` of a known credential file warns once, then blocks. |
| `session-end.mjs` | SessionEnd | analytics | Writes a session-close marker under `.goodvibes/cache/`, prunes old ones. Nothing else. |
| `stop.mjs` | Stop | analytics | Appends one silent telemetry line per stop event to a monthly JSONL log under `.goodvibes/telemetry/`. No injection. |
| `subagent-stop.mjs` | SubagentStop | analytics | Telemetry-only: correlates with the SubagentStart tracking entry (R15), runs a bounded `tsc --noEmit` when TypeScript files were touched, writes one JSONL record. No systemMessage/additionalContext. |
| `pre-compact.mjs` | PreCompact | analytics | Observe-only: writes a session summary (`.goodvibes/state/last-session-summary.md`) and a small backup marker. Never mutates the working tree. |

`lib/common.mjs` — shared stdin/response/state helpers and `.goodvibes/` path namespacing
(R15). Every hook is fail-open: a bug in the handler still emits a valid `{ continue: true }`
response and never blocks the native tool it observes.

`lib/deps-link.mjs` — the per-server native-dep probes and `linkDeps(pluginRoot, server)`:
points `server/<name>/node_modules` at the durable home `~/.claude/.goodvibes/deps/<name>/`
(symlink, then junction, then recursive copy — Windows-safe). Also a CLI:
`node deps-link.mjs <pluginRoot> <server>`.

`lib/deps-install.mjs` — installs every missing server's native deps into the durable home
(`npm install --omit=dev --no-audit --no-fund --prefix ...`) and links the plugin copy to it.
Single-instance via `.install.lock` (stale after 10 minutes), logs to `install.log`, records
the outcome in `.last-result.json`, hard-timeouts each npm run. Never prompts; safe to re-run.
CLI: `node deps-install.mjs <pluginRoot>` (spawned detached by the SessionStart/Setup hooks;
run in the foreground by `/goodvibes:setup`).

Smoke tests: `packages/intel/src/__tests__/hooks-smoke.test.ts` and
`packages/analytics/src/__tests__/hooks-smoke.test.ts` spawn each hook as a real `node` subprocess
with synthetic stdin and assert valid JSON output and the correct schema where applicable.
connect's hooks are covered by `packages/connect/src/__tests__/hooks/`.
