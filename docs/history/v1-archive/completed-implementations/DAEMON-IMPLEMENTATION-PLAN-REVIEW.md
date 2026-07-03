# Review: DAEMON-IMPLEMENTATION-PLAN.md

**Document**: Phase 9 — 5 work items, 702 lines

---

## Verified Claims

- **RemoteTransport** — `onClose()` at line 120 confirmed: rejects all pending, sets `_connected = false`, no reconnection logic. Doc is accurate.
- **DaemonLifecycle** — `isRunning()`, `readPid()`, `probeSocket()` all confirmed at stated locations. On-demand only, no caching.
- **DaemonTransportConfig** — `auto_start`, `rpc_timeout_ms`, `migrate_state_on_join` confirmed in config.ts:135-143.
- **ExecutorModeManager** — Exists, reads from env var or config. Confirmed.
- **DaemonServer RPC methods** — Already has 20+ methods including `drainDirectives`, `ping`, `listSessions`, plus all state/event/workflow/trigger/agent operations. Much richer than the doc suggests.
- **Hook discovery** — `RuntimeClient.discoverSocket()` confirmed in `shared/ipc/client.ts` with pointer file scanning.
- **IPC router** — Handles `hook_event`, `get_directives`, `get_system_message`, `processHookEvent`. All confirmed.

---

## Issues

### 1. HIGH — WI 5 underestimates the IPC proxy complexity

The plan says the proxy needs to handle `get_directives`, `get_system_message`, `processHookEvent`, and `mcp_call`. But the IPC router protocol is significantly more complex:

- `hook_event` messages go through `processHookEvent` which calls into the EventBus, evaluates triggers, and processes immediate hook callbacks — all before returning the response. This is **not** a simple request/response proxy.
- `get_directives` involves `holdDrain()` on the DirectiveQueue which blocks until directives are available or timeout. The proxy would need to handle this async hold pattern.
- Session registration (`registeredSessions.add()`) happens as a side effect of `hook_event` processing. The proxy needs to relay session identity correctly.

The daemon already has `drainDirectives` RPC, but it doesn't have `processHookEvent` as an RPC — this is a local callback pattern, not a remote-callable method. **This is the biggest gap in WI 5.**

### 2. MEDIUM — WI 3 reconnection should re-send `session_join`, not raw session message

Line 379 shows reconnection re-registering via:
```typescript
this.socket!.write(JSON.stringify({ type: 'session', sessionId: this.sessionId }) + '\n');
```

But the actual daemon protocol uses `session_join` message type (from `daemon-protocol.ts`), not `type: 'session'`. This would be silently ignored by the server. Should be:
```typescript
{ type: 'session_join', sessionId: this.sessionId }
```

### 3. MEDIUM — WI 1 integration tests assume `daemon.cjs` exists

Line 183: "The daemon entry (`dist/daemon.cjs`) must exist — run build before tests or skip with condition."

The build currently only produces `dist/index.cjs`. The daemon build entry (from Phase 8 operational design) hasn't been implemented yet in `build.mjs`. WI 1 has a hard dependency on the build.mjs changes from DAEMON-OPERATIONAL-DESIGN Gap 1 — this should be called out explicitly, or WI 1 should include the build.mjs change.

### 4. MEDIUM — WI 5 Option B (proxy) has a session identity problem

The IPC proxy creates a local socket that hooks connect to. But hooks carry their own `session_id` in payloads. The proxy would be forwarding hook events from **multiple** Claude Code sessions through a **single** daemon RPC connection. The daemon's `drainDirectives` is session-scoped — the proxy needs to maintain per-session context and route responses back to the correct hook connection.

This is solvable but the plan doesn't address it. Consider: should the proxy maintain one daemon RPC connection per hook session, or multiplex?

### 5. MEDIUM — WI 2 says `auto_start` is "not read anywhere" — it IS read

Line 228: "`DaemonTransportConfig.auto_start` is defined but not read anywhere."

But `mcp-server.ts` (from Phase 8) already has `ensureDaemonRunning()` which checks `config.executor.transport.auto_start` (visible in the operational design doc). If Phase 8 is the prerequisite, this may already be wired. Verify before duplicating work.

### 6. LOW — WI 4 health polling adds complexity for minimal value

The health check polling in DaemonLifecycle adds a `setInterval` timer, cached state, staleness logic, and cleanup concerns — all for a status that's already correct on-demand via `isRunning()`. The `runtime_daemon status` tool already calls `isRunning()` + `probeSocket()` per request.

Consider whether cached health is actually needed, or if on-demand probing is sufficient. The 30s polling interval means the cache is stale most of the time anyway.

### 7. LOW — WI 3 pending RPC hold during reconnection risks memory leak

The plan says to hold pending RPCs during reconnection instead of rejecting them. With `maxAttempts: 10` and `maxDelayMs: 10_000`, reconnection could take up to ~20 seconds. During this time, all RPC callers are blocked. If the caller is a tool handler with its own timeout, you get a timeout error AND a lingering pending promise.

Consider adding a `pendingTimeoutMs` that rejects individual RPCs if they've been waiting too long, independent of reconnection attempts.

### 8. LOW — Missing `drainDirectives` in WI 5 proxy mapping

Line 615 maps `get_directives` → `drainDirectives` RPC. But the IPC router's `get_directives` handler also does agent-scoped filtering and WRFC-aware enrichment (building system messages with minimum score, files, etc.) via `buildDirectivesResponse()`. A raw `drainDirectives` proxy would lose this enrichment logic. The daemon would need its own `get_directives` RPC that replicates this behavior.

### 9. INFO — Execution order diagram shows WI 5 as HIGH but positions it last

WI 5 is labeled HIGH priority in line 669 but placed last in execution. This is correct given dependencies (needs WI 3 reconnection), but the priority label is misleading. Consider labeling it MEDIUM or noting "HIGH priority but blocked by WI 3."

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| HIGH | 1 | WI 5 IPC proxy complexity underestimated |
| MEDIUM | 4 | session_join typo, daemon.cjs dependency, proxy session routing, auto_start already wired |
| LOW | 3 | health polling value, pending RPC timeout, directive enrichment |
| INFO | 1 | Priority label vs execution position |

## Overall Assessment

WI 1 (integration tests) and WI 2 (config wiring) are well-scoped and ready to implement. WI 3 (reconnection) is solid but has a protocol typo. WI 4 (health polling) may be over-engineering for the current stage.

**WI 5 is the concern.** The IPC proxy approach (Option B) is the right architectural choice, but the plan significantly underestimates what needs to be proxied. The IPC router does substantial server-side processing (trigger evaluation, directive enrichment, session tracking) that can't be naively forwarded as RPC calls. This needs a deeper design pass before implementation — consider whether the daemon should expose a dedicated hook-compatible IPC endpoint rather than proxying through the MCP server.
