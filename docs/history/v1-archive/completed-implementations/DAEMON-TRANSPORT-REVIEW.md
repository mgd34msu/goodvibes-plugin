# Daemon Transport Design — Review Notes

**Reviewer:** Session 8b5e7370 (pane %0)  
**Date:** 2026-03-03  
**Document:** docs/DAEMON-TRANSPORT-DESIGN.md  
**Verdict:** Solid design with 8 issues (2 High, 3 Medium, 3 Low)

---

## Issues Found

### 1. [HIGH] `require()` in ESM Module (daemon-server.ts line 787)

The `stop()` method uses `require('node:fs')` but the runtime-engine is `"type": "module"` (confirmed in package.json line 5). This will throw `ERR_REQUIRE_ESM` at runtime.

```typescript
// Line 787 — BROKEN in ESM
const { unlinkSync } = require('node:fs');
```

**Fix:** Use dynamic `await import('node:fs')` (already done correctly in `start()` at line 756) or hoist the import to the top of the file.

### 2. [HIGH] DaemonConfig Schema Mismatch

The design proposes adding `auto_start`, `rpc_timeout_ms`, and `migrate_state_on_join` to `DaemonConfig` (Section 9, line 1204-1227). But the actual `DaemonConfig` interface (shared/config.ts:119-132) has a completely different shape focused on tmux/tick scheduling:

```typescript
// Actual DaemonConfig (config.ts:119-132)
export interface DaemonConfig {
  clear_context_after_batch: boolean;
  tmux_session_name: string;
  tick_command: string;
  tick_interval_ms: number;
  auto_tick: boolean;
  eval_interval_ms: number;
}
```

The design doc shows the existing fields correctly but the proposed additions assume `DaemonConfig` is the right home for transport-level settings. However, the existing `DaemonConfig` is specifically about the tmux-based tick/eval daemon — a different concept from the transport daemon.

**Recommendation:** Create a separate `DaemonTransportConfig` interface (or nest under `executor.transport`) to avoid conflating two different daemon concepts. The tmux daemon ticks commands into a Claude session; the transport daemon hosts the RuntimeEngine as a standalone process. These are orthogonal.

### 3. [MEDIUM] LocalTransport.drainDirectives — Directive Type Assumption

Line 443-447:
```typescript
const message = result.directives
  .filter((d) => d.type === 'inject_system_message')
  .sort((a, b) => b.priority - a.priority)
  .map((d) => d.content)
  .join('\n\n');
```

This logic duplicates and hardcodes directive filtering/sorting that should live in a single place. The actual holdDrain (directive-queue.ts:115) returns raw `Directive[]`. The transport shouldn't be responsible for message assembly — that's a presentation concern. If the directive format changes, this breaks silently.

**Recommendation:** Either move the message assembly into DirectiveQueue itself (a `drainAsMessage()` method) or keep it in the MCP handler layer where it currently lives. The transport should return raw directives.

### 4. [MEDIUM] RemoteTransport.sendRaw — Connection-Per-Call Scalability

The design explicitly calls out "one connection per call" (line 527-528) matching the existing IPC pattern. While correct for hook scripts (which fire rarely), MCP tool calls can be frequent and bursty. Each `sendRaw()` creates a new socket, does DNS-free connect, writes, reads, destroys.

For local Unix sockets this is ~0.5-1ms overhead per call, which is acceptable. But under burst (e.g., 20 rapid state queries), the connection churn could bottleneck.

**Recommendation:** Document this as a known limitation with a "Future: connection pooling" note in the risk assessment. Not a blocker for v1 but should be on the radar.

### 5. [MEDIUM] No Session Validation on RPC Calls

In DaemonServer.handleRPCCall (line 869-888), the `session_id` from the RPC request is not validated against the session registry. A client that never sent `session_join` can still make RPC calls. The session registry tracks joins but doesn't gate access.

```typescript
private async handleRPCCall(msg: DaemonRPCRequest): Promise<DaemonRPCResponse> {
  const { method, args } = msg;
  // NOTE: msg.session_id is never checked against this.sessions
  ...
}
```

**Recommendation:** Add a guard:
```typescript
if (!this.sessions.has(msg.session_id)) {
  return { id: msg.id, status: 'error', error: 'Session not registered. Send session_join first.' };
}
```

### 6. [LOW] RuntimeTransport.getWorkflow Return Type Too Loose

Lines 193-194:
```typescript
getWorkflow(workflowId: string): Promise<Record<string, unknown> | null>;
listWorkflows(): Promise<Record<string, unknown>[]>;
```

All workflow/trigger/agent methods return `Record<string, unknown>` — losing all type information. This makes the transport interface harder to consume correctly. Consider importing and using the actual types (`WorkflowInstance`, `TriggerDefinition`, `AgentRecord` etc.) in the interface, then having RemoteTransport cast from JSON.

**Recommendation:** Low priority but would improve DX significantly. At minimum, add JSDoc `@returns` with the actual shape.

### 7. [LOW] daemon.ts Entry Point — Missing PID File

The daemon entry point (line 925-973) writes a pointer file for socket discovery but doesn't write a PID file. The design references `core/utils/pid-file.ts` as existing infrastructure (Section 1, line 86) but never uses it.

**Recommendation:** Write a PID file in `.goodvibes/state/daemon.pid` for:
- Crash detection (stale socket file with no process)
- Process management (kill, status checks)
- Preventing duplicate daemons for the same project

### 8. [LOW] Graceful Degradation Race in Hybrid Mode

In the factory (line 1124-1141), if `remote.connect()` throws, the factory falls back to `LocalTransport(engine)`. But by this point, the `engine` has already been `startup()`'d. The local transport wraps the same engine instance.

This works correctly — the engine was already created for potential local use. But the factory signature requires `engine: RuntimeEngine` even in pure `daemon` mode where it's never used. Consider making `engine` optional and throwing explicitly in daemon mode if no engine is provided.

**This is cosmetic** — functionally sound as-is.

---

## Verified Claims (Correct)

1. **HandlerContext returns subsystem objects** — Confirmed. types.ts:30-59 returns `EventBus`, `WorkflowEngine`, `DirectiveQueue` etc. as instances, not operations.
2. **ExecutorMode enum** — Confirmed at config.ts:116: `'engaged' | 'daemon' | 'hybrid'`.
3. **DaemonConfig existing fields** — Confirmed at config.ts:119-132. All 6 fields match.
4. **IPC protocol types** — Confirmed at protocol.ts. `IPCMessage`, `IPCResponse`, `IPCQuery`, `Directive` all exist.
5. **RuntimeClient** — Confirmed at shared/ipc/client.ts.
6. **PID file utility** — Confirmed at core/utils/pid-file.ts.
7. **RuntimeEngine class** — Confirmed at bootstrap.ts:133-623 with all referenced accessor methods: `getUptime`, `getConfig`, `getHealthChecker`, `getProjectRoot`, `isRunning`, `getEventBus`, `getEventLog`, `getEventQueue`, `getWorkflowEngine`, `getTriggerRegistry`, `getAgentCoordinator`, `getDirectiveQueue`, `getCoreStateStore`.
8. **CoreStateStore API** — Confirmed: `get()`, `set()`, `delete()`, `keys(prefix?)`, `snapshot()` all exist.
9. **EventBus.emit()** — Confirmed at event-bus.ts:349.
10. **EventLog.query()** — Confirmed at event-log.ts:283.
11. **EventQueue.depth()** — Confirmed at event-queue.ts:177.
12. **DirectiveQueue.holdDrain()** — Confirmed at directive-queue.ts:115.
13. **ENGINE_VERSION constant** — Confirmed at shared/constants.ts:17.
14. **RuntimeEngineServer class** — Confirmed at mcp-server.ts:47.
15. **Socket pointer files** — Confirmed in IPC subsystem setup.

---

## Architecture Assessment

**Strengths:**
- Clean separation of transport from engine — LocalTransport is genuinely zero-overhead
- Reuses existing IPC infrastructure patterns rather than reinventing
- ADRs are well-reasoned, especially ADR-3 (no bidirectional sync) and ADR-5 (zero local overhead)
- Phased implementation plan with sensible dependency graph
- Session join/leave lifecycle is straightforward

**Concerns:**
- Two daemon concepts (tmux tick daemon vs transport daemon) need clearer separation
- The transport interface is very wide (20+ methods). Consider grouping into sub-interfaces if it grows further
- No mention of how the WRFC flow (specifically the session_id propagation bug we've been tracking) interacts with daemon mode. Multiple sessions sharing a daemon will ALL share the same session state namespace unless the existing session_id bug is fixed first.

---

## Summary

| Severity | Count | Blocking? |
|----------|-------|-----------|
| HIGH | 2 | Yes — must fix before implementation |
| MEDIUM | 3 | No — should fix during implementation |
| LOW | 3 | No — nice-to-have improvements |

The design is architecturally sound and well-aligned with the existing codebase. The two high issues (ESM require() and DaemonConfig conflation) are straightforward to fix. Ready for implementation after addressing highs.
