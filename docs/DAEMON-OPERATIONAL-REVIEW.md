# Review: DAEMON-OPERATIONAL-DESIGN.md

**Document**: Phase 8 — Making the Daemon Operational (1012 lines, 6 gaps)

---

## Verified Claims

All source code references checked out:

- **build.mjs** — Correctly identifies single entry point (`src/server.ts` → `dist/index.cjs`), no daemon entry
- **MCP server** — `processManager` is `readonly` and always created in constructor (line 51/61). Accurate that it always creates a `RuntimeEngine`
- **HandlerContext** — Interface matches doc's description (types.ts:31-62). `transport` field exists as optional
- **IPC router** — `registeredSessions` set confirmed (ipc-router.ts:130). Session-scoped operations confirmed
- **Hook socket discovery** — `discoverSocket()` in client.ts scans `runtime-{id}.socket` pointer files, mtime ordered. Confirmed
- **DaemonTransportConfig** — `auto_start`, `rpc_timeout_ms`, `migrate_state_on_join` all exist in config.ts:135-143
- **ExecutorConfig.transport** — Confirmed at config.ts:165
- **daemon.ts** — Entry point exists at `src/transport/daemon.ts`

---

## Issues Found

### 1. HIGH — `require()` in ESM context (lines 810-811)

`discoverDaemonSocket` uses `require('node:fs').unlinkSync()` inside a function that already imports `{ existsSync, readFileSync }` from `node:fs` at the top. The project is ESM (`"type": "module"`). Should use the already-imported `unlinkSync` or add it to the import.

```typescript
// Line 810-811: require() will fail in ESM
try { require('node:fs').unlinkSync(pointerPath); } catch { /* ignore */ }
```

### 2. MEDIUM — `processManager` is `readonly`, doc says make it optional

The doc proposes `private processManager: RuntimeEngine | null = null` (line 121), but the actual field is `private readonly processManager: RuntimeEngine` (mcp-server.ts:51). The doc's approach is correct for the refactor, but should explicitly note the `readonly` removal and that this is a breaking change to the class invariant.

### 3. MEDIUM — Missing `migrate_state_on_join` from DaemonTransportConfig

The actual `DaemonTransportConfig` has three fields: `auto_start`, `rpc_timeout_ms`, and `migrate_state_on_join`. The doc references the first two but never mentions `migrate_state_on_join`. Gap 2 (hybrid mode) is exactly where state migration would matter — when falling back from daemon to local, or reconnecting to daemon. Should address or explicitly defer.

### 4. MEDIUM — Hybrid mode creates engine then might not use it

In Gap 2's MCP server restructuring (lines 148-159), hybrid mode always creates a `RuntimeEngine` + calls `startup()` before trying the daemon. If daemon is available, the local engine is wasted work (full subsystem initialization). Consider lazy initialization — only create local engine if daemon connection fails.

### 5. LOW — `getSessionId()` env var order inconsistent with existing code

The doc proposes checking `SESSION_ID` first, then `CLAUDE_SESSION_ID` (lines 188-190). But event-bus.ts:364-365 checks `CLAUDE_SESSION_ID` first, then `SESSION_ID`. Should be consistent.

### 6. LOW — Dependency graph doesn't match recommended order

The dependency graph (line 856) shows Gap 2 depending on Gap 3 and Gap 4. But the recommended order (line 871) puts Gap 2 at position 5 and Gap 6 at position 3, even though Gap 6 depends on Gap 3 in the graph. The graph itself is fine, but the recommended order doesn't match the arrows.

### 7. LOW — `daemon.socket` vs `goodvibes-runtime.sock` naming

The doc uses two different socket path conventions:
- Gap 3/6: `.goodvibes/goodvibes-runtime.pid` and `.goodvibes/daemon.socket` (pointer file)
- ADR at line 1008: `.goodvibes/goodvibes-runtime.sock` (actual socket)

The pointer file vs actual socket distinction is clear in context, but having `daemon.socket` (pointer) and `goodvibes-runtime.sock` (actual) with different extensions (`.socket` vs `.sock`) could be confusing. Consider standardizing.

### 8. INFO — `DaemonStatus.uptime`/`sessions` always null

`getStatus()` (lines 420-433) returns `uptime: null, sessions: null` with a comment "Populated via RPC if running" — but the method itself never does the RPC. The daemon handler in Gap 4 only enriches `uptime` (line 578), not `sessions`. Either `getStatus()` should do the RPC itself, or the handler should populate both.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| HIGH | 1 | `require()` in ESM |
| MEDIUM | 3 | readonly removal, missing migrate_state_on_join, eager engine init |
| LOW | 3 | env var order, dep graph order, socket naming |
| INFO | 1 | Incomplete status enrichment |

Overall: solid design. The gap analysis is thorough, the ADRs are well-reasoned, and the two-socket architecture (daemon RPC vs hook IPC) is the right call. The issues are all fixable without architectural changes.
