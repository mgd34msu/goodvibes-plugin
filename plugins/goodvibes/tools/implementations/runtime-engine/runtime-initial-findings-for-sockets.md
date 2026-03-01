# Runtime Engine Socket Discovery — Root Cause Analysis

## Problem

WRFC directives are not delivered to the orchestrator after work agents complete. The entire WRFC chain (work → review → fix → check) never starts because the SubagentStop hook cannot communicate with the runtime engine.

## Root Cause

`RuntimeClient.discoverSocket()` in the hook scripts cannot find the runtime engine's Unix domain socket. The socket pointer files on disk are session-keyed (UUID-based), but RuntimeClient only scans for PID-based filenames.

## Complete Inventory

### Producers (Who Writes Pointer Files)

| Writer | File | Pattern | When Written | When Cleaned Up |
|--------|------|---------|--------------|-----------------|
| `bootstrap.ts:836` | `runtime-${process.pid}.socket` | PID-based | Engine startup, after IPC server binds | `removeSocketPointerFile()` during shutdown (line 494) |
| `ipc-router.ts:290` | `runtime-${sessionId}.socket` | UUID-based | When `session:started` hook event arrives via IPC | `removeSessionPointers()` during shutdown (line 496) |

Both files contain identical data — the absolute path to the Unix domain socket file (e.g., `/tmp/goodvibes-runtime-a1b2c3d4-12345.sock`).

### Consumers (Who Reads Pointer Files)

| Consumer | File | Has Session-Keyed? | Has PID Scan? | Status |
|----------|------|--------------------|---------------|--------|
| `hooks/scripts/src/shared/runtime-client.ts` | Hook-side TS client | **NO** | Yes (`/^runtime-\d+\.socket$/`) | **BROKEN** — can't find UUID files |
| `runtime-engine/src/shared/ipc/client.ts` | Engine-side TS client | **NO** | Yes (`/^runtime-\d+\.socket$/`) | Same bug, but only re-exported from `index.ts`, not used internally |
| `hooks/scripts/src/user-prompt-submit-directives.mjs` | UPS directive hook | **YES** (Strategy 2, line 66-70) | Yes (fallback) | **WORKS** |
| `hooks/scripts/src/pre-tool-use-directive-drain.mjs` | PreToolUse drain hook | **YES** (Strategy 2, line 66-70) | Yes (fallback) | **WORKS** |

### Discovery Strategy Comparison

**RuntimeClient (BROKEN — hooks/scripts/src/shared/runtime-client.ts:266-319):**
1. `GOODVIBES_RUNTIME_SOCKET` env var
2. PID scan: `/^runtime-\d+\.socket$/` ← **Only matches digits, misses UUIDs**
3. Legacy: `runtime.socket`
4. tmpdir: `{tmpdir}/goodvibes-runtime/runtime.sock`

**UPS/PreToolUse hooks (WORKING — user-prompt-submit-directives.mjs:55-100):**
1. `GOODVIBES_RUNTIME_SOCKET` env var
2. **Session-keyed exact match: `runtime-${sessionId}.socket`** ← Has this, RuntimeClient doesn't
3. PID scan: `/^runtime-\d+\.socket$/`
4. Legacy: `runtime.socket`
5. tmpdir: `{tmpdir}/goodvibes-runtime/runtime.sock`

### Engine-Side Client (runtime-engine/src/shared/ipc/client.ts)

- Exported as `RuntimeClient` from `index.ts` (line 45)
- **Not used internally** by the runtime engine — it's a public API export
- Has the same PID-only regex at line 307
- Less critical since engine-side code typically has direct socket access
- Should still be fixed for API consumers

## Impact Assessment: Removing PID-Based Files

### Timing Difference

- **PID file**: Written at engine startup (line 836), before any session connects
- **Session file**: Written when `session:started` fires via IPC (line 290), after session connects

There is a brief window between engine startup and `session:started` where only the PID file exists. However, hooks that need the socket (SubagentStop, SubagentStart, PreToolUse, UPS) only fire AFTER session start, so this window has zero practical impact.

### If We Remove PID Files Entirely

| Component | Impact | Risk |
|-----------|--------|------|
| `bootstrap.ts` writer | Remove write + cleanup code | None — cleanup path also removed |
| `RuntimeClient` (hook) PID scan | Finds nothing | **Already broken** — no regression |
| `client.ts` (engine) PID scan | Finds nothing | Not used internally — no regression |
| `UPS/PreToolUse` PID fallback | Finds nothing | Session-keyed works first — no regression |
| Stale file accumulation | Stops | Positive — fewer orphan files |

### Edge Case: Session Reconnect

If the runtime engine stays running but a Claude Code session disconnects and reconnects:
- Old session's UUID pointer is stale (but points to the same socket — still valid)
- New session's UUID pointer doesn't exist until `session:started` fires
- PID pointer would still exist and point to the live socket

This is the only scenario where PID files provide value. Mitigation: the new `session:started` fires within milliseconds of reconnect, creating the new UUID pointer immediately.

## Recommendation

### Minimal Fix (Unblock WRFC)

Add session-keyed lookup to `RuntimeClient`. This is a one-line strategy addition — the hook input already has `session_id`:

1. **`RuntimeClient` constructor** — accept optional `sessionId` parameter
2. **`discoverSocket()`** — add Strategy 2 (session-keyed exact match) before PID scan
3. **`subagent-stop/index.ts`** — pass `input.session_id` to `new RuntimeClient(input.session_id)`
4. **`subagent-start/index.ts`** — same
5. **Also fix `client.ts`** — same PID-only regex at line 307

### Full Cleanup (Optional, Later)

1. Remove PID-based file writing from `bootstrap.ts:836`
2. Remove `removeSocketPointerFile()` from `bootstrap.ts:854-870`
3. Remove PID scan strategy from all consumers (keep as dead-last fallback or remove)
4. Clean up stale PID files from `.goodvibes/state/`
