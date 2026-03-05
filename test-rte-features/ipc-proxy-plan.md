# IPC Proxy Plan: Events, Schedule, External Handlers

## Overview

Three MCP handlers bypass the transport layer and access plugin instances directly.
This breaks in daemon/remote mode where plugins live in a separate process.
The fix follows the established pattern from the workflow handler: add transport
methods, implement in both transports, add daemon-server switch cases, update handlers.

## Reference Pattern (from workflow handler)

```typescript
// In MCP handler:
if (ctx.transport) {
  const result = await ctx.transport.cancelWorkflow(workflowId, reason);
  // ...
} else {
  const engine = ctx.getWorkflowEngine();
  // direct access fallback
}
```

---

## Files to Modify (7 total)

| File | Changes |
|------|--------|
| `transport/types.ts` | Add 4 new methods to `RuntimeTransport` interface |
| `transport/local-transport.ts` | Implement 4 methods with direct engine access |
| `transport/remote-transport.ts` | Implement 4 methods via `this.rpc()` |
| `transport/daemon-server.ts` | Add 4 switch cases in `dispatchRPC()` |
| `handlers/events.ts` | Route `tail` and `stats` through transport |
| `handlers/schedule.ts` | Route `heartbeat` action through transport |
| `handlers/external.ts` | Route `status` action through transport |

All paths relative to:
`plugins/goodvibes/tools/implementations/runtime-engine/src/`

---

## 1. Transport Interface Changes (`transport/types.ts`)

Add after the `getQueueDepth()` method (line 86), within the `// ─── Events` section:

```typescript
  // ─── Events (extended) ───────────────────────────────────────

  /** Get event history from the in-memory EventBus ring buffer. */
  getEventHistory(filter?: EventFilter): Promise<RuntimeEvent[]>;

  /** Get combined stats from EventLog and EventQueue. */
  getEventStats(): Promise<{
    log: {
      total_events: number;
      file_size_bytes: number;
      oldest_event?: number;
      newest_event?: number;
      events_per_type: Record<string, number>;
    };
    queue: {
      pending: number;
      max_depth: number;
      dedup_cache_size: number;
    };
  }>;
```

Add a new section after `// ─── Directives` (after line 141):

```typescript
  // ─── Schedule ──────────────────────────────────────────────

  /** Get heartbeat status and scheduler summary. */
  getHeartbeat(): Promise<{
    enabled: boolean;
    tick_count: number;
    last_tick_at: number;
    scheduled_count: number;
    interval_ms: number;
  }>;

  /** Set the heartbeat interval (ms). Must be >= 1000. */
  setHeartbeatInterval(intervalMs: number): Promise<void>;

  // ─── External ──────────────────────────────────────────────

  /** Get external plugin status (HTTP listener, normalizers). */
  getExternalStatus(): Promise<{
    http_listener: {
      running: boolean;
      port: number | null;
      address: string | null;
    };
    normalizer_count: number;
    normalizer_sources: string[];
  }>;
```

### Import Note

`EventFilter` and `RuntimeEvent` are already imported in `types.ts` (line 5).
No new imports needed.

---

## 2. LocalTransport Implementation (`transport/local-transport.ts`)

Add after the `getQueueDepth()` method (line 100), within the Events section:

```typescript
  async getEventHistory(filter?: EventFilter): Promise<RuntimeEvent[]> {
    return this.engine.getEventBus().getHistory(filter);
  }

  async getEventStats(): Promise<{
    log: { total_events: number; file_size_bytes: number; oldest_event?: number; newest_event?: number; events_per_type: Record<string, number> };
    queue: { pending: number; max_depth: number; dedup_cache_size: number };
  }> {
    return {
      log: this.engine.getEventLog().getStats(),
      queue: this.engine.getEventQueue().getStats(),
    };
  }
```

Add at the end (before closing brace), new sections:

```typescript
  // ─── Schedule ───────────────────────────────────────────────

  async getHeartbeat(): Promise<{
    enabled: boolean;
    tick_count: number;
    last_tick_at: number;
    scheduled_count: number;
    interval_ms: number;
  }> {
    const timePlugin = this.engine.getTimePlugin();
    if (!timePlugin) throw new Error('TimePlugin not available');
    const heartbeat = timePlugin.getHeartbeat();
    const scheduler = timePlugin.getScheduler();
    return {
      enabled: heartbeat.isEnabled(),
      tick_count: heartbeat.getTickCount(),
      last_tick_at: heartbeat.getLastTickAt(),
      scheduled_count: scheduler.size(),
      interval_ms: heartbeat.getInterval(),
    };
  }

  async setHeartbeatInterval(intervalMs: number): Promise<void> {
    const timePlugin = this.engine.getTimePlugin();
    if (!timePlugin) throw new Error('TimePlugin not available');
    timePlugin.getHeartbeat().setInterval(intervalMs);
  }

  // ─── External ───────────────────────────────────────────────

  async getExternalStatus(): Promise<{
    http_listener: { running: boolean; port: number | null; address: string | null };
    normalizer_count: number;
    normalizer_sources: string[];
  }> {
    const externalPlugin = this.engine.getExternalPlugin();
    if (!externalPlugin) throw new Error('ExternalPlugin not available');
    const normalizerSources = externalPlugin.getNormalizerRegistry().sources();
    return {
      http_listener: {
        running: externalPlugin.isHttpListenerRunning(),
        port: externalPlugin.getHttpPort(),
        address: externalPlugin.getHttpAddress(),
      },
      normalizer_count: normalizerSources.length,
      normalizer_sources: normalizerSources,
    };
  }
```

### Engine Accessor Prerequisite

LocalTransport calls `this.engine.getTimePlugin()` and `this.engine.getExternalPlugin()`.
Verify these accessors exist on `RuntimeEngine` (from `bootstrap.ts`). If they don't exist,
add them:

```typescript
// In bootstrap.ts (RuntimeEngine class)
getTimePlugin(): TimePlugin | null { return this.timePlugin ?? null; }
getExternalPlugin(): ExternalPlugin | null { return this.externalPlugin ?? null; }
```

These likely already exist since `HandlerContext` has `getTimePlugin` and `getExternalPlugin`
callbacks that reference them.

---

## 3. RemoteTransport Implementation (`transport/remote-transport.ts`)

Add after `getQueueDepth()` (line 509):

```typescript
  async getEventHistory(filter?: EventFilter): Promise<RuntimeEvent[]> {
    return this.rpc<RuntimeEvent[]>('getEventHistory', { filter });
  }

  async getEventStats(): Promise<{
    log: { total_events: number; file_size_bytes: number; oldest_event?: number; newest_event?: number; events_per_type: Record<string, number> };
    queue: { pending: number; max_depth: number; dedup_cache_size: number };
  }> {
    return this.rpc('getEventStats');
  }
```

Add at the end (before closing brace):

```typescript
  async getHeartbeat(): Promise<{
    enabled: boolean;
    tick_count: number;
    last_tick_at: number;
    scheduled_count: number;
    interval_ms: number;
  }> {
    return this.rpc('getHeartbeat');
  }

  async setHeartbeatInterval(intervalMs: number): Promise<void> {
    return this.rpc<void>('setHeartbeatInterval', { intervalMs });
  }

  async getExternalStatus(): Promise<{
    http_listener: { running: boolean; port: number | null; address: string | null };
    normalizer_count: number;
    normalizer_sources: string[];
  }> {
    return this.rpc('getExternalStatus');
  }
```

---

## 4. Daemon Server Switch Cases (`transport/daemon-server.ts`)

Add before the `case 'ping':` block (line 336), within `dispatchRPC()`:

```typescript
      case 'getEventHistory': {
        const filter = args['filter'] as Parameters<ReturnType<typeof e.getEventBus>['getHistory']>[0];
        return e.getEventBus().getHistory(filter);
      }
      case 'getEventStats': {
        return {
          log: e.getEventLog().getStats(),
          queue: e.getEventQueue().getStats(),
        };
      }
      case 'getHeartbeat': {
        const tp = e.getTimePlugin();
        if (!tp) throw new Error('TimePlugin not available');
        const hb = tp.getHeartbeat();
        const sched = tp.getScheduler();
        return {
          enabled: hb.isEnabled(),
          tick_count: hb.getTickCount(),
          last_tick_at: hb.getLastTickAt(),
          scheduled_count: sched.size(),
          interval_ms: hb.getInterval(),
        };
      }
      case 'setHeartbeatInterval': {
        const tp = e.getTimePlugin();
        if (!tp) throw new Error('TimePlugin not available');
        tp.getHeartbeat().setInterval(args['intervalMs'] as number);
        return;
      }
      case 'getExternalStatus': {
        const ep = e.getExternalPlugin();
        if (!ep) throw new Error('ExternalPlugin not available');
        const sources = ep.getNormalizerRegistry().sources();
        return {
          http_listener: {
            running: ep.isHttpListenerRunning(),
            port: ep.getHttpPort(),
            address: ep.getHttpAddress(),
          },
          normalizer_count: sources.length,
          normalizer_sources: sources,
        };
      }
```

### Engine Accessor Prerequisite (Same as LocalTransport)

`e.getTimePlugin()` and `e.getExternalPlugin()` must exist on RuntimeEngine.
Same check as noted in section 2.

---

## 5. MCP Handler Changes

### 5a. `handlers/events.ts` — `tail` action

**Current code (lines 146-177):**
```typescript
    if (action === 'tail') {
      const limit = typeof filterRaw.limit === 'number' ? filterRaw.limit : DEFAULT_EVENT_QUERY_LIMIT;
      // ... builds historyFilter ...
      let events = ctx.getEventBus().getHistory(historyFilter);  // <-- DIRECT ACCESS
      // ... applies type pattern filtering ...
      // ... applies source_kind filter ...
      const data = applyVerbosity(events, verbosity);
      return toSuccess(data, ctx.version, uptimeMs, Date.now() - start);
    }
```

**Change line 161:**

Find:
```typescript
      let events = ctx.getEventBus().getHistory(historyFilter);
```

Replace:
```typescript
      let events = ctx.transport
        ? await ctx.transport.getEventHistory(historyFilter)
        : ctx.getEventBus().getHistory(historyFilter);
```

### 5b. `handlers/events.ts` — `stats` action

**Current code (lines 134-141):**
```typescript
    if (action === 'stats') {
      const logStats = ctx.getEventLog().getStats();      // <-- DIRECT ACCESS
      const queueStats = ctx.getEventQueue().getStats();   // <-- DIRECT ACCESS
      const data = verbosity === 'count_only'
        ? { event_count: logStats.total_events, queue_pending: queueStats.pending }
        : { log: logStats, queue: queueStats };
      return toSuccess(data, ctx.version, uptimeMs, Date.now() - start);
    }
```

Find:
```typescript
    if (action === 'stats') {
      const logStats = ctx.getEventLog().getStats();
      const queueStats = ctx.getEventQueue().getStats();
      const data = verbosity === 'count_only'
        ? { event_count: logStats.total_events, queue_pending: queueStats.pending }
        : { log: logStats, queue: queueStats };
      return toSuccess(data, ctx.version, uptimeMs, Date.now() - start);
    }
```

Replace:
```typescript
    if (action === 'stats') {
      let logStats: { total_events: number; file_size_bytes: number; oldest_event?: number; newest_event?: number; events_per_type: Record<string, number> };
      let queueStats: { pending: number; max_depth: number; dedup_cache_size: number };

      if (ctx.transport) {
        const stats = await ctx.transport.getEventStats();
        logStats = stats.log;
        queueStats = stats.queue;
      } else {
        logStats = ctx.getEventLog().getStats();
        queueStats = ctx.getEventQueue().getStats();
      }

      const data = verbosity === 'count_only'
        ? { event_count: logStats.total_events, queue_pending: queueStats.pending }
        : { log: logStats, queue: queueStats };
      return toSuccess(data, ctx.version, uptimeMs, Date.now() - start);
    }
```

### 5c. `handlers/schedule.ts` — `heartbeat` action

**Current code (lines 266-302):**
The entire handler requires `ctx.getTimePlugin()` to be non-null (line 47-55),
which fails in remote mode. The `heartbeat` action specifically:

```typescript
      case 'heartbeat': {
        const subAction = params.sub_action as string | undefined;

        if (subAction === 'set_interval') {
          // ... validates intervalMs ...
          heartbeat.setInterval(intervalMs);   // <-- DIRECT ACCESS
          // ...
        }

        // Default: return current heartbeat status
        return toSuccess(
          {
            enabled: heartbeat.isEnabled(),         // <-- DIRECT ACCESS
            tick_count: heartbeat.getTickCount(),    // <-- DIRECT ACCESS
            last_tick_at: heartbeat.getLastTickAt(), // <-- DIRECT ACCESS
            scheduled_count: scheduler.size(),       // <-- DIRECT ACCESS
            interval_ms: heartbeat.getInterval(),    // <-- DIRECT ACCESS
          },
          // ...
        );
      }
```

**Strategy:** The `heartbeat` action needs special handling because the entire handler
currently early-returns if `getTimePlugin()` is null. We need to allow the `heartbeat`
action to proceed via transport even when the plugin is unavailable locally.

**Find (lines 47-55):**
```typescript
  const timePlugin = ctx.getTimePlugin?.();
  if (!timePlugin) {
    return toError(
      'TimePlugin is not available (engine may not be running in local mode)',
      version,
      uptime,
      Date.now() - start,
    );
  }
  const scheduler = timePlugin.getScheduler();
  const heartbeat = timePlugin.getHeartbeat();
```

**Replace:**
```typescript
  const timePlugin = ctx.getTimePlugin?.();
  if (!timePlugin && !ctx.transport) {
    return toError(
      'TimePlugin is not available (engine may not be running in local mode)',
      version,
      uptime,
      Date.now() - start,
    );
  }
  const scheduler = timePlugin?.getScheduler();
  const heartbeat = timePlugin?.getHeartbeat();
```

**Then update the heartbeat case. Find (lines 266-302):**
```typescript
      case 'heartbeat': {
        const subAction = params.sub_action as string | undefined;

        if (subAction === 'set_interval') {
          const intervalMs = params.interval_ms as number | undefined;
          if (intervalMs == null || intervalMs < 1000) {
            return toError(
              'interval_ms must be a number >= 1000 (minimum 1 second to prevent excessive CPU usage)',
              version,
              uptime,
              Date.now() - start,
            );
          }
          heartbeat.setInterval(intervalMs);
          logger.info('runtime_schedule: heartbeat interval updated', { interval_ms: intervalMs });
          return toSuccess(
            { action: 'heartbeat', sub_action: 'set_interval', interval_ms: intervalMs },
            version,
            uptime,
            Date.now() - start,
          );
        }

        // Default: return current heartbeat status
        return toSuccess(
          {
            enabled: heartbeat.isEnabled(),
            tick_count: heartbeat.getTickCount(),
            last_tick_at: heartbeat.getLastTickAt(),
            scheduled_count: scheduler.size(),
            interval_ms: heartbeat.getInterval(),
          },
          version,
          uptime,
          Date.now() - start,
        );
      }
```

**Replace:**
```typescript
      case 'heartbeat': {
        const subAction = params.sub_action as string | undefined;

        if (subAction === 'set_interval') {
          const intervalMs = params.interval_ms as number | undefined;
          if (intervalMs == null || intervalMs < 1000) {
            return toError(
              'interval_ms must be a number >= 1000 (minimum 1 second to prevent excessive CPU usage)',
              version,
              uptime,
              Date.now() - start,
            );
          }
          if (ctx.transport) {
            await ctx.transport.setHeartbeatInterval(intervalMs);
          } else {
            heartbeat!.setInterval(intervalMs);
          }
          logger.info('runtime_schedule: heartbeat interval updated', { interval_ms: intervalMs });
          return toSuccess(
            { action: 'heartbeat', sub_action: 'set_interval', interval_ms: intervalMs },
            version,
            uptime,
            Date.now() - start,
          );
        }

        // Default: return current heartbeat status
        if (ctx.transport) {
          const hbStatus = await ctx.transport.getHeartbeat();
          return toSuccess(hbStatus, version, uptime, Date.now() - start);
        }
        return toSuccess(
          {
            enabled: heartbeat!.isEnabled(),
            tick_count: heartbeat!.getTickCount(),
            last_tick_at: heartbeat!.getLastTickAt(),
            scheduled_count: scheduler!.size(),
            interval_ms: heartbeat!.getInterval(),
          },
          version,
          uptime,
          Date.now() - start,
        );
      }
```

**Note on other schedule actions:** The `list`, `get`, `create`, `cancel`, `pause`, `resume`
actions also use TimePlugin directly. However, these are scheduler operations (not heartbeat),
and the task scope is limited to the `heartbeat` action. Full schedule proxying can be done
in a follow-up if needed.

### 5d. `handlers/external.ts` — `status` action

**Current code (lines 44-52):**
```typescript
  const externalPlugin = ctx.getExternalPlugin?.();
  if (!externalPlugin) {
    return toError(
      'ExternalPlugin is not available (engine may not be running in local mode)',
      version,
      uptime,
      Date.now() - start,
    );
  }
```

**Replace:**
```typescript
  const externalPlugin = ctx.getExternalPlugin?.();
  if (!externalPlugin && !ctx.transport) {
    return toError(
      'ExternalPlugin is not available (engine may not be running in local mode)',
      version,
      uptime,
      Date.now() - start,
    );
  }
```

**Then update the status case. Find (lines 56-72):**
```typescript
      case 'status': {
        const httpRunning = externalPlugin.isHttpListenerRunning();
        const normalizerSources = externalPlugin.getNormalizerRegistry().sources();
        return toSuccess(
          {
            http_listener: {
              running: httpRunning,
              port: externalPlugin.getHttpPort(),
              address: externalPlugin.getHttpAddress(),
            },
            normalizer_count: normalizerSources.length,
            normalizer_sources: normalizerSources,
          },
          version,
          uptime,
          Date.now() - start,
        );
      }
```

**Replace:**
```typescript
      case 'status': {
        if (ctx.transport) {
          const status = await ctx.transport.getExternalStatus();
          return toSuccess(status, version, uptime, Date.now() - start);
        }
        const httpRunning = externalPlugin!.isHttpListenerRunning();
        const normalizerSources = externalPlugin!.getNormalizerRegistry().sources();
        return toSuccess(
          {
            http_listener: {
              running: httpRunning,
              port: externalPlugin!.getHttpPort(),
              address: externalPlugin!.getHttpAddress(),
            },
            normalizer_count: normalizerSources.length,
            normalizer_sources: normalizerSources,
          },
          version,
          uptime,
          Date.now() - start,
        );
      }
```

**Note on other external actions:** The `normalizers`, `test_normalize`, `stats`, and
`queue` actions also use ExternalPlugin directly. The task scope is limited to `status`.
Full external proxying can be done in a follow-up.

---

## 6. Error Handling Patterns

### Plugin Null Guards

In **LocalTransport** and **daemon-server**, plugin access can fail if the plugin
is not initialized. Follow the existing pattern:

```typescript
// LocalTransport:
const timePlugin = this.engine.getTimePlugin();
if (!timePlugin) throw new Error('TimePlugin not available');

// daemon-server:
const tp = e.getTimePlugin();
if (!tp) throw new Error('TimePlugin not available');
```

These errors propagate through the RPC layer and become MCP tool errors in the handler.

### Handler Null Safety

In MCP handlers, after making `timePlugin` and `externalPlugin` nullable
(because transport may handle the call), use non-null assertions (`!`) for
local-mode code paths since we know the plugin is non-null if `!ctx.transport`.

---

## 7. Dependency Graph

```
transport/types.ts (interface)
    |
    +---> transport/local-transport.ts (implementation)
    |         |
    |         +---> may need bootstrap.ts accessors (getTimePlugin, getExternalPlugin)
    |
    +---> transport/remote-transport.ts (implementation, trivial RPC wrappers)
    |
    +---> transport/daemon-server.ts (switch cases)
              |
              +---> may need bootstrap.ts accessors

All transport changes MUST complete before handler changes.

Handlers are independent of each other:
    handlers/events.ts     -- can be done in parallel
    handlers/schedule.ts   -- can be done in parallel
    handlers/external.ts   -- can be done in parallel
```

### Execution Order

1. **Phase 1** (sequential): Verify `bootstrap.ts` has `getTimePlugin()` and `getExternalPlugin()` accessors
2. **Phase 2** (sequential): Update `transport/types.ts` (interface must compile first)
3. **Phase 3** (parallel): Update `local-transport.ts`, `remote-transport.ts`, `daemon-server.ts`
4. **Phase 4** (parallel): Update `events.ts`, `schedule.ts`, `external.ts`
5. **Phase 5** (sequential): Run `npx tsc --noEmit` to verify compilation

---

## 8. Testing Considerations

- Existing handler tests may need updates if they mock `HandlerContext` without transport
- Transport unit tests should verify new methods exist and delegate correctly
- The daemon-server integration tests should verify new switch cases
- No new test files required, just updates to existing test suites

---

## 9. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `getTimePlugin`/`getExternalPlugin` missing from engine | Low | Medium | Check bootstrap.ts first |
| TypeScript errors from nullable plugin refs | Medium | Low | Non-null assertions in guarded paths |
| Breaking existing local-mode behavior | Low | High | Keep fallback paths unchanged |
| Other schedule/external actions still bypass transport | Known | Low | Documented as follow-up scope |

---

## 10. Summary of New Transport Methods

| Method | Return Type | Used By |
|--------|-------------|--------|
| `getEventHistory(filter?)` | `Promise<RuntimeEvent[]>` | events.ts `tail` action |
| `getEventStats()` | `Promise<{log: EventLogStats, queue: QueueStats}>` | events.ts `stats` action |
| `getHeartbeat()` | `Promise<{enabled, tick_count, last_tick_at, scheduled_count, interval_ms}>` | schedule.ts `heartbeat` action (status) |
| `setHeartbeatInterval(ms)` | `Promise<void>` | schedule.ts `heartbeat` action (set_interval) |
| `getExternalStatus()` | `Promise<{http_listener, normalizer_count, normalizer_sources}>` | external.ts `status` action |

Total: 5 new transport methods, 4 daemon-server switch cases (getHeartbeat + setHeartbeatInterval share the schedule concern but are separate RPC methods).
