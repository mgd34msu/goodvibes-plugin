# goodvibes-intel hooks

Plain `.mjs` hooks, no build step (§7 R8), wired via `hooks.json` (auto-discovered
by the plugin loader — not referenced from `plugin.json`, matching the v1 convention).

| Hook | Event | What it does |
|---|---|---|
| `session-start.mjs` | SessionStart | Fresh git/stack signals every call (bounded to 4s); TODO count/health notes served from `.goodvibes/v2/cache/session-context.json`, refreshed by a detached background child so a slow scan can never blow the hook's timeout (the v1 "10s-timeout silent loss" bug). Emits `hookSpecificOutput.additionalContext` (the v1 schema bug — v1 put it top-level). |
| `setup.mjs` | Setup (`init`) | Runs once per project (marker file in `.goodvibes/v2/`), never touches the global home directory. Points at `/goodvibes-intel:plugin setup` for native-dependency install — that command is the actual consent point, not this hook. |
| `subagent-start.mjs` | SubagentStart | ≤500-token skill-name pointers for the agent type (no skill content, no doctrine dump). Also records a tracking entry other plugins' hooks can correlate against (`.goodvibes/v2/state/agent-tracking.json`). |
| `post-tool-use-failure.mjs` | PostToolUseFailure (`Bash`) | Ported as-is: 3-phase fix loop (existing knowledge → official docs → community docs) keyed by a stable error signature, logging exhausted errors to `.goodvibes/v2/memory/failures.jsonl`. |

`lib/common.mjs` — shared stdin/response/state helpers, the R16 v1-yield guard,
and `.goodvibes/v2/` path namespacing (R15). Every hook is fail-open: a bug in
the handler still emits a valid `{ continue: true }` response.

Smoke tests: `packages/intel/src/__tests__/hooks-smoke.test.ts` spawns each
hook as a real `node` subprocess with synthetic stdin and asserts valid JSON
output, the correct `hookSpecificOutput.additionalContext` schema where
applicable, and the R16 yield path.
