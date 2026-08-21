# goodvibes hooks

Plain `.mjs` hooks with no build step, wired via `hooks.json`, which the plugin loader
auto-discovers rather than reading from `plugin.json`. This single plugin ships the union of the
intel, analytics, and connect lifecycle hooks side by side.

The `Origin` column below records which server a hook was built for. It has no runtime effect;
all ten run from the same directory, and it is there so a reader can tell which capability a hook
belongs to when only one of the three is in use.

| Hook | Event | Origin | What it does |
|---|---|---|---|
| `session-start.mjs` | SessionStart | intel | One value line (last session's cost recap), plus project-health notes, the host-health nudge, and native-dep handling: probes each server, silently relinks the durable install after a plugin update, and otherwise kicks `lib/deps-install.mjs` detached (never blocks on npm) with a one-line notice, or reports a recent failed install with the log path. Emits `hookSpecificOutput.additionalContext` (the corrected schema). |
| `session-start-open-mode.mjs` | SessionStart | connect | Announces when the connect trust boundary is in OPEN (unrestricted) mode, and whether it persists across sessions. Observe-only. |
| `setup.mjs` | Setup (`init`) | intel | When any server's native deps are missing, kicks `lib/deps-install.mjs` detached and stays silent. SessionStart owns the user-visible install lines; `/goodvibes:setup` is the manual foreground repair path. |
| `subagent-start.mjs` | SubagentStart | intel | Names the skills relevant to the agent type, capped at 500 tokens, so a subagent gets pointers rather than a wall of instructions. Records a tracking entry in `.goodvibes/state/agent-tracking.json` that other hooks correlate against. |
| `post-tool-use-failure.mjs` | PostToolUseFailure (`Bash`) | intel | 3-phase fix loop (existing knowledge → official docs → community docs) keyed by a stable error signature; logs exhausted errors to `.goodvibes/memory/failures.jsonl`. |
| `commit-guard.mjs` | PreToolUse (`Bash`) | connect | Warn-first secrets commit guard, and the one hook that can stop a command. Catches `goodvibes.secrets.json` and `goodvibes.cookies.json` named directly, or swept in by `git add -A`, `git add .`, `git add -u`, or `git commit -a`, which it detects by reading `git status --porcelain`. The first risky attempt is allowed with a warning and leaves a marker at `.goodvibes/.commit-guard-warned`; a repeat is denied. |
| `session-end.mjs` | SessionEnd | analytics | Writes a session-close marker under `.goodvibes/cache/`, prunes old ones. Nothing else. |
| `stop.mjs` | Stop | analytics | Appends one silent telemetry line per stop event to a monthly JSONL log under `.goodvibes/telemetry/`. No injection. |
| `subagent-stop.mjs` | SubagentStop | analytics | Telemetry only. Correlates with the tracking entry `subagent-start.mjs` wrote, runs a bounded `tsc --noEmit` when TypeScript files were touched, and writes one JSONL record. Emits no `systemMessage` and no `additionalContext`. |
| `pre-compact.mjs` | PreCompact | analytics | Observe-only: writes a session summary (`.goodvibes/state/last-session-summary.md`) and a small backup marker. Never mutates the working tree. |

`lib/common.mjs`: shared stdin, response, and state helpers, plus the `.goodvibes/` path
namespacing every hook writes through.

Every hook is fail-open. A bug in a handler still emits a valid `{ continue: true }` response, so
a broken hook cannot block the tool call it observes. That is about failure, not intent. The
commit guard above still denies a repeat attempt when it is working correctly, and it is the only
hook that ever withholds a command.

`lib/deps-link.mjs`: the per-server native-dep probes and `linkDeps(pluginRoot, server)`.
Points `server/<name>/node_modules` at the durable home `~/.claude/.goodvibes/deps/<name>/`
(symlink, then junction, then recursive copy, Windows-safe). Also a CLI:
`node deps-link.mjs <pluginRoot> <server>`.

`lib/deps-install.mjs`: installs every missing server's native deps into the durable home
(`npm install --omit=dev --no-audit --no-fund --prefix ...`) and links the plugin copy to it.
Single-instance via `.install.lock` (stale after 10 minutes), logs to `install.log`, records
the outcome in `.last-result.json`, hard-timeouts each npm run. Never prompts; safe to re-run.
CLI: `node deps-install.mjs <pluginRoot>` (spawned detached by the SessionStart/Setup hooks;
run in the foreground by `/goodvibes:setup`).

Smoke tests: `packages/intel/src/__tests__/hooks-smoke.test.ts` and
`packages/analytics/src/__tests__/hooks-smoke.test.ts` spawn each hook as a real `node` subprocess
with synthetic stdin and assert valid JSON output and the correct schema where applicable.
connect's hooks are covered by `packages/connect/src/__tests__/hooks/`.
