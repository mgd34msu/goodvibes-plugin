# Runtime Engine v3 — Implementation Guide

> Generated: 2026-02-26 | Source: `updated-planning.md`
> Codebase: `plugins/goodvibes/tools/implementations/runtime-engine/src/`

---

## Existing Codebase Summary

85 source files, 11 subsystems, ~954KB. Key modules:

| Module | Files | Key Classes | Status |
|--------|-------|-------------|--------|
| events/ | 4+3t | EventBus, EventLog, EventQueue | Evolve |
| triggers/ | 5+3t | TriggerRegistry, ConditionEvaluator, ActionExecutor | Evolve |
| workflow/ | 8+1t | WorkflowEngine, 4 definitions | Keep |
| directives/ | 8+3t | DirectiveQueue, WRFC/fix/review handlers | Repackage |
| agents/ | 3 | AgentCoordinator, BudgetTracker | Evolve |
| ipc/ | 7+3t | IPCServer, IPCRouter, protocol | Evolve |
| lifecycle/ | 4+1t | ProcessManager, HealthChecker | Evolve |
| persistence/ | 5 | StateStore, SnapshotManager | Evolve |
| server/ | 11+1t | MCP server, 7 tool handlers | Extend |
| shared/ | 4+1t | Config, Logger, Utils | Extend |

---

## Architecture: New Directory Structure

```
src/
├── core/                    # Layer 1 — NEVER changes after v3
│   ├── types.ts             # Base RuntimeEvent, Trigger, Action, Condition schemas
│   ├── event-queue.ts       # Priority queue with dedup, cancel, causal ordering
│   ├── trigger-registry.ts  # Generic trigger matching, conditions, circuit breakers
│   ├── state-store.ts       # State persistence interface + JSON implementation
│   ├── lifecycle.ts         # Start, pause, resume, drain, shutdown
│   ├── metrics.ts           # Observability hooks and stats
│   ├── dead-letter.ts       # Dead-letter queue for failed events
│   ├── error-handler.ts     # Handler failure contract, retry, escalation
│   ├── event-processor.ts   # The main loop: drain queue → match triggers → execute → persist
│   └── index.ts             # Barrel exports
│
├── extensions/              # Layer 2 — Type extensions
│   ├── events/
│   │   ├── hook-event.ts    # HookEvent extends RuntimeEvent
│   │   ├── time-event.ts    # TimeEvent extends RuntimeEvent (heartbeat, cron, schedule)
│   │   ├── agent-event.ts   # AgentEvent extends RuntimeEvent
│   │   ├── human-event.ts   # HumanEvent extends RuntimeEvent
│   │   ├── external-event.ts # ExternalEvent extends RuntimeEvent (webhooks)
│   │   └── index.ts
│   ├── triggers/
│   │   ├── wrfc-trigger.ts  # WRFCTrigger extends Trigger
│   │   ├── cron-trigger.ts  # CronTrigger extends Trigger
│   │   ├── webhook-trigger.ts # WebhookTrigger extends Trigger
│   │   └── index.ts
│   └── index.ts
│
├── plugins/                 # Layer 3 — Implementations
│   ├── wrfc/                # WRFC workflow plugin
│   │   ├── wrfc-plugin.ts   # Plugin registration (events, triggers, handlers)
│   │   ├── handlers.ts      # Repackaged from directives/wrfc-handlers.ts
│   │   ├── score-evaluator.ts # Review score parsing and evaluation
│   │   ├── directive-builder.ts # Repackaged from directives/directive-builder.ts
│   │   └── index.ts
│   ├── hooks/               # Hook processing plugin (original v3 plan)
│   │   ├── hook-processor.ts # HookProcessor.process() entry point
│   │   ├── hook-registry.ts  # Handler registration by hook type
│   │   ├── handlers/
│   │   │   ├── pre-tool-use.ts      # Native tool blocker + directive delivery
│   │   │   ├── subagent-start.ts    # Agent registration + WRFC binding
│   │   │   ├── subagent-stop.ts     # Quality gates + WRFC advancement
│   │   │   ├── session-start.ts     # Session initialization
│   │   │   ├── session-end.ts       # Cleanup
│   │   │   ├── pre-compact.ts       # State preservation
│   │   │   ├── post-tool-use.ts     # File tracking, build events
│   │   │   ├── user-prompt-submit.ts # State recovery, directive delivery
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── time/                # Time events plugin
│   │   ├── time-plugin.ts   # Plugin registration
│   │   ├── heartbeat.ts     # Default heartbeat management
│   │   ├── scheduler.ts     # Scheduled events and cron-like scheduling
│   │   └── index.ts
│   ├── external/            # External events plugin
│   │   ├── external-plugin.ts # Plugin registration
│   │   ├── file-watcher.ts  # File drop directory watcher
│   │   ├── http-listener.ts # Optional Express webhook server
│   │   ├── normalizers/     # Payload normalizers per source
│   │   │   ├── github.ts
│   │   │   ├── generic.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   └── index.ts
│
├── events/          # Existing — evolves to use core interfaces
├── triggers/        # Existing — evolves to use core interfaces  
├── workflow/        # Existing — minimal changes
├── directives/      # Existing — WRFC handlers move to plugins/wrfc/
├── agents/          # Existing — evolves
├── ipc/             # Existing — evolves (add hook_event routing to HookProcessor)
├── lifecycle/       # Existing — evolves to implement core lifecycle
├── persistence/     # Existing — evolves
├── server/          # Existing — extend with new tools
└── shared/          # Existing — extend
```

---

## Phase 1: Core (Layer 1)

### 1.1 `src/core/types.ts`

Base schemas. All events and triggers in the system extend these.

```typescript
// Event sources
export type EventSource = 'time' | 'human' | 'external' | 'internal' | 'agent';

// Base event — Layer 2 extends this with source-specific fields
export interface RuntimeEvent {
  id: string;
  source: EventSource;
  type: string;                // Namespaced: 'hook:subagent_stop', 'cron:daily_review'
  payload: unknown;
  timestamp: number;
  priority: number;            // Higher = processed sooner
  context?: EventContext;
}

export interface EventContext {
  workflow_id?: string;
  agent_id?: string;
  parent_event_id?: string;    // Causal chain
  chain_depth?: number;
  ref?: string;                // Cancel reference tag
}

// Trigger schemas
export interface EventMatcher {
  source?: EventSource | EventSource[];
  type: string | RegExp;
  payload_match?: Record<string, unknown>;
}

export type ConditionOp = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'exists';

export interface Condition {
  field: string;
  op: ConditionOp;
  value: unknown;
}

export type ActionType = 'spawn_agent' | 'emit_event' | 'send_message' | 'schedule'
  | 'update_state' | 'update_memory' | 'block' | 'notify_human' | 'cancel_event';

export interface Action {
  type: ActionType;
  params: Record<string, unknown>;
}

export interface RetryPolicy {
  max_attempts: number;
  backoff: 'fixed' | 'exponential';
  delay_ms: number;
}

export interface Trigger {
  id: string;
  event_match: EventMatcher;
  conditions?: Condition[];
  actions: Action[];
  max_fires?: number;
  cooldown_ms?: number;
  chain_depth_limit?: number;
  retry?: RetryPolicy;
  enabled: boolean;
  priority?: number;           // Handler priority (higher = runs first)
}

// Handler result
export interface HandlerResult {
  actions?: Action[];
  state_updates?: StateUpdate[];
  events?: RuntimeEvent[];     // Chain: new events to enqueue
  error?: Error;
}

export interface StateUpdate {
  key: string;
  value: unknown;
  op: 'set' | 'delete' | 'merge';
}

// Queue interfaces
export interface EventQueueInterface {
  enqueue(event: RuntimeEvent): void;
  drain(): RuntimeEvent[];
  peek(): RuntimeEvent | null;
  depth(): number;
  deduplicate(event: RuntimeEvent): boolean;
  cancel(event_id: string): boolean;
  cancelByRef(ref: string): number;
}

// State interfaces
export interface StateStoreInterface {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
  snapshot(): Record<string, unknown>;
  restore(snapshot: Record<string, unknown>): void;
}

// Lifecycle
export type LoopStatus = 'running' | 'paused' | 'draining' | 'stopped';

export interface LoopLifecycle {
  start(): void;
  pause(): void;
  resume(): void;
  drain(): Promise<void>;
  shutdown(): Promise<void>;
  status(): LoopStatus;
}

// Metrics
export interface MetricsSnapshot {
  events_processed: number;
  events_failed: number;
  events_dead_lettered: number;
  avg_latency_ms: number;
  queue_depth: number;
  active_chains: number;
  active_workflows: number;
  triggers_fired: number;
}

export interface MetricsCollector {
  onEventProcessed(event: RuntimeEvent, duration_ms: number): void;
  onHandlerError(trigger_id: string, error: Error, event: RuntimeEvent): void;
  onQueueDepthChange(depth: number): void;
  onTriggerFired(trigger_id: string, event: RuntimeEvent): void;
  onEventDeadLettered(event: RuntimeEvent, reason: string): void;
  getStats(): MetricsSnapshot;
  reset(): void;
}
```

### 1.2 `src/core/event-queue.ts`

Priority queue with deduplication, cancellation, causal ordering.

- Priority ordering: higher priority events drain first
- Causal ordering: events within same workflow_id maintain insertion order
- Deduplication: event ID-based, configurable TTL window
- Cancel by ID or by ref tag
- Max depth with backpressure (emit warning event at threshold)

### 1.3 `src/core/trigger-registry.ts`

Generic trigger matching engine.

- Register/unregister/enable/disable triggers
- Match events against triggers (type match, source filter, payload match)
- Evaluate conditions against state
- Circuit breakers: max_fires, cooldown_ms, chain_depth_limit
- Priority ordering: higher priority triggers evaluated first
- Fire counting with reset capability

### 1.4 `src/core/state-store.ts`

State persistence interface + JSON file implementation.

- get/set/delete with type safety
- snapshot/restore for checkpointing
- File-backed JSON (`.goodvibes/memory/runtime-state.json`)

### 1.5 `src/core/lifecycle.ts`

Loop lifecycle management.

- Start: begin processing events
- Pause: stop processing, keep accepting events
- Resume: continue from where paused
- Drain: process all remaining events, then stop
- Shutdown: graceful stop, persist state, clean up
- Status reporting

### 1.6 `src/core/metrics.ts`

Observability.

- Event processing metrics (count, latency, failures)
- Queue depth tracking
- Trigger fire tracking
- Chain depth tracking
- Dead letter metrics
- Stats snapshot for reporting

### 1.7 `src/core/dead-letter.ts`

Dead-letter queue for failed events.

- Store failed events with error context
- Retry capability (manual replay)
- Max size with oldest-first eviction
- Persistence to disk

### 1.8 `src/core/error-handler.ts`

Handler failure contract.

- Try/catch wrapper for trigger handlers
- Retry policy evaluation
- Dead-letter routing on exhaustion
- Error events emission (handler failures become events)

### 1.9 `src/core/event-processor.ts`

The main event processing loop.

```
drain queue
  → for each event:
    → check chain depth (circuit breaker)
    → match against triggers
    → evaluate conditions
    → execute handlers (with error handling)
    → collect results (new events, state updates)
    → persist state updates
    → enqueue new events
    → update metrics
```

- Workflow-level locking: events in same workflow serialize
- Parallel across workflows: events in different workflows can process concurrently
- Budget checking: pause if cost threshold exceeded

### Phase 1 Tests

Every core module gets comprehensive tests:

| Test File | Coverage |
|-----------|----------|
| `src/core/__tests__/types.test.ts` | Schema validation, type guards |
| `src/core/__tests__/event-queue.test.ts` | Priority ordering, dedup, cancel, causal ordering, backpressure |
| `src/core/__tests__/trigger-registry.test.ts` | Matching, conditions, circuit breakers, priority |
| `src/core/__tests__/state-store.test.ts` | CRUD, snapshot/restore, file persistence |
| `src/core/__tests__/lifecycle.test.ts` | All state transitions, edge cases |
| `src/core/__tests__/metrics.test.ts` | All metric types, stats snapshot |
| `src/core/__tests__/dead-letter.test.ts` | Store, replay, eviction |
| `src/core/__tests__/error-handler.test.ts` | Retry, dead-letter routing, error events |
| `src/core/__tests__/event-processor.test.ts` | Full loop, chaining, parallel, locking, budget |

---

## Phase 2: Type Extensions (Layer 2)

### 2.1 Event Type Extensions

Each extends `RuntimeEvent` with source-specific fields:

**HookEvent** (`source: 'internal'`):
```typescript
interface HookEvent extends RuntimeEvent {
  source: 'internal';
  hook_type: string;           // PreToolUse, SubagentStop, etc.
  hook_input: Record<string, unknown>;
  session_id: string;
}
```

**TimeEvent** (`source: 'time'`):
```typescript
interface TimeEvent extends RuntimeEvent {
  source: 'time';
  time_type: 'heartbeat' | 'cron' | 'scheduled';
  interval_ms?: number;        // For heartbeats
  schedule?: string;           // For crons (cron expression)
  ttl?: number;                // Max fires before expiry
  fires_remaining?: number;
}
```

**AgentEvent** (`source: 'agent'`):
```typescript
interface AgentEvent extends RuntimeEvent {
  source: 'agent';
  agent_id: string;
  agent_type: string;
  result?: unknown;
  score?: number;
  artifacts?: string[];
}
```

**HumanEvent** (`source: 'human'`):
```typescript
interface HumanEvent extends RuntimeEvent {
  source: 'human';
  prompt?: string;
  command?: string;
  approval?: boolean;
}
```

**ExternalEvent** (`source: 'external'`):
```typescript
interface ExternalEvent extends RuntimeEvent {
  source: 'external';
  external_source: string;     // 'github', 'slack', 'ci', etc.
  raw_payload: unknown;
  normalized: boolean;
}
```

### 2.2 Trigger Type Extensions

**WRFCTrigger**:
```typescript
interface WRFCTrigger extends Trigger {
  score_threshold?: number;
  max_fix_attempts?: number;
  workflow_state_filter?: string[];
}
```

**CronTrigger**:
```typescript
interface CronTrigger extends Trigger {
  schedule: string;            // Cron expression
  active_hours?: string;       // e.g., '9am-10pm'
  timezone?: string;
}
```

**WebhookTrigger**:
```typescript
interface WebhookTrigger extends Trigger {
  url_pattern?: string;
  payload_schema?: Record<string, unknown>;
  normalize_with?: string;     // Normalizer name
}
```

### Phase 2 Tests

| Test File | Coverage |
|-----------|----------|
| `src/extensions/__tests__/events.test.ts` | All 5 event types, type guards, validation |
| `src/extensions/__tests__/triggers.test.ts` | All 3 trigger types, extension fields |

---

## Phase 3: WRFC Port + Hook Processing (Layer 3)

### 3.1 WRFC Plugin

Repackage existing `src/directives/wrfc-handlers.ts` (935 lines) as a Layer 3 plugin.

**wrfc-plugin.ts**: Plugin registration function that:
1. Registers WRFC event types with the core
2. Registers WRFC triggers with the trigger registry
3. Registers WRFC handlers
4. Sets up quality gate configuration

The actual handler logic stays the same — score evaluation, fix loops, directive building. Just repackaged as trigger handlers that produce `HandlerResult` objects.

### 3.2 Hook Processing Plugin

From the original `rte-v3-plan.md` — move hook processing into the runtime engine.

**hook-processor.ts**: Main entry point.
- Receives hook events from IPC
- Normalizes hook_name to HookType
- Emits to EventBus (preserves v1 behavior)
- Evaluates triggers
- Runs registered handlers
- Merges responses
- Returns ClaudeHookResponse

**hook-registry.ts**: Handler registration by hook type.
- Priority-sorted handler lists per hook type
- Enable/disable per handler
- Handler signature: `(input, ctx) => HandlerResponse`

**Handlers** (11 total, from rte-v3-plan.md):

| Handler | Hook Type | Priority | Key Logic |
|---------|-----------|----------|----------|
| native-tool-blocker | PreToolUse | 100 | Sync Set lookup, deny with alternative |
| directive-delivery | PreToolUse | 50 | Drain DirectiveQueue, inject as additionalContext |
| subagent-lifecycle (start) | SubagentStart | 50 | Register agent, resolve pending bind, inject WRFC binding |
| subagent-lifecycle (stop) | SubagentStop | 50 | Quality gate (decision:block), WRFC advancement, directive delivery |
| session-init | SessionStart | 50 | Emit event, build session context, inject additionalContext |
| session-cleanup | SessionEnd | 50 | Emit event, flush telemetry |
| state-preservation | PreCompact | 50 | Persist active state, attempt additionalContext |
| state-recovery | UserPromptSubmit | 50 | Detect missing state, re-inject |
| file-tracker | PostToolUse | 50 | Track modified files, detect build/test results |
| error-classifier | PostToolUseFailure | 50 | Classify error, emit event, return recovery hints |
| stop-handler | Stop | 50 | Emit event, graceful shutdown |

### 3.3 IPC Changes

IPCRouter gains hook_event delegation:
```typescript
if (msg.type === 'hook_event' && this.deps.hookProcessor) {
  return this.deps.hookProcessor.process(msg);
}
```

New IPC response kind: `hook_response` with `ClaudeHookResponse`.

### Phase 3 Tests

| Test File | Coverage |
|-----------|----------|
| `src/plugins/wrfc/__tests__/wrfc-plugin.test.ts` | Plugin registration, handler routing |
| `src/plugins/wrfc/__tests__/handlers.test.ts` | Score evaluation, fix loops, directive building |
| `src/plugins/hooks/__tests__/hook-processor.test.ts` | Event emission, trigger evaluation, response merging |
| `src/plugins/hooks/__tests__/hook-registry.test.ts` | Registration, priority, enable/disable |
| `src/plugins/hooks/handlers/__tests__/pre-tool-use.test.ts` | Block native tools, directive injection |
| `src/plugins/hooks/handlers/__tests__/subagent-start.test.ts` | Agent registration, WRFC binding |
| `src/plugins/hooks/handlers/__tests__/subagent-stop.test.ts` | Quality gate, WRFC advancement |
| `src/plugins/hooks/handlers/__tests__/session.test.ts` | Start/end handlers |

---

## Phase 4: Time Events + Executor (Layer 3)

### 4.1 Time Plugin

**heartbeat.ts**: Default heartbeat manager.
- Configurable interval (default 60s)
- Emits `tick:heartbeat` events on each tick
- No internal timer — driven externally by system scheduler
- Receives tick signal via IPC or event queue

**scheduler.ts**: Scheduled event manager.
- Register scheduled heartbeats (interval + TTL + max_fires)
- Register one-shot delayed events
- Register cron-like recurring events
- On each tick: evaluate all schedules, emit due events
- Cancel scheduled events by ID or ref
- Persist schedule state to StateStore

### 4.2 Executor Mode

Add to runtime config:
```typescript
executor: {
  mode: 'engaged' | 'daemon' | 'hybrid';
  daemon: {
    clear_context_after_batch: boolean;
    tmux_session_name: string;
    tick_command: string;      // e.g., 'tick'
  };
  budget: {
    flat_cap_usd?: number;
    daily_cap_usd?: number;
    warning_threshold: number; // 0.8 = 80%
  };
}
```

### Phase 4 Tests

| Test File | Coverage |
|-----------|----------|
| `src/plugins/time/__tests__/heartbeat.test.ts` | Tick emission, interval management |
| `src/plugins/time/__tests__/scheduler.test.ts` | Schedule, one-shot, cron, cancel, TTL, persistence |

---

## Phase 5: External Events (Layer 3)

### 5.1 External Plugin

**file-watcher.ts**: Watch a directory for JSON event files.
- Monitor `.goodvibes/events/incoming/` directory
- On each tick: scan for new `.json` files
- Parse, validate, normalize to RuntimeEvent
- Enqueue to event queue
- Move processed files to `.goodvibes/events/processed/`

**http-listener.ts**: Optional Express webhook server.
- Start/stop via system events (`system:http_listener_start/stop`)
- Receive POST requests with webhook payloads
- Normalize via source-specific normalizers
- Write to file drop directory (converges with file-watcher)
- Configurable port, auth, allowed origins

**normalizers/**: Payload normalizers.
- `github.ts`: GitHub webhook → ExternalEvent
- `generic.ts`: Passthrough normalizer for unknown sources

### Phase 5 Tests

| Test File | Coverage |
|-----------|----------|
| `src/plugins/external/__tests__/file-watcher.test.ts` | Scan, parse, enqueue, move |
| `src/plugins/external/__tests__/http-listener.test.ts` | Start/stop, receive, normalize |
| `src/plugins/external/__tests__/normalizers.test.ts` | GitHub, generic |

---

## Integration: Wiring It Together

### ProcessManager Changes

Startup sequence adds:
1. Initialize core EventQueue, TriggerRegistry, StateStore, Lifecycle, Metrics
2. Initialize EventProcessor with core components
3. Register Layer 2 type extensions
4. Register Layer 3 plugins (WRFC, hooks, time, external)
5. Initialize HookProcessor and pass to IPCRouter
6. Start lifecycle

### Backward Compatibility

- Existing EventBus continues to work alongside core EventQueue
- Existing TriggerRegistry methods are preserved
- Existing IPC protocol extended, not replaced
- Existing MCP tools continue to work
- All existing tests must pass

---

## Implementation Order

| Step | What | Depends On | Agent Type |
|------|------|-----------|------------|
| 1 | `src/core/types.ts` | Nothing | engineer |
| 2 | `src/core/event-queue.ts` | types | engineer |
| 3 | `src/core/trigger-registry.ts` | types | engineer |
| 4 | `src/core/state-store.ts` | types | engineer |
| 5 | `src/core/metrics.ts` | types | engineer |
| 6 | `src/core/dead-letter.ts` | types | engineer |
| 7 | `src/core/error-handler.ts` | types, dead-letter | engineer |
| 8 | `src/core/lifecycle.ts` | types | engineer |
| 9 | `src/core/event-processor.ts` | ALL core modules | engineer |
| 10 | `src/core/__tests__/*` | ALL core modules | tester |
| 11 | `src/extensions/events/*` | core types | engineer |
| 12 | `src/extensions/triggers/*` | core types | engineer |
| 13 | `src/extensions/__tests__/*` | extensions | tester |
| 14 | `src/plugins/wrfc/*` | core + extensions | engineer |
| 15 | `src/plugins/hooks/*` | core + extensions | engineer |
| 16 | `src/plugins/time/*` | core + extensions | engineer |
| 17 | `src/plugins/external/*` | core + extensions | engineer |
| 18 | `src/plugins/__tests__/*` | ALL plugins | tester |
| 19 | Integration wiring (ProcessManager, IPCRouter) | ALL | engineer |
| 20 | Build verification | ALL | engineer |

### Parallelization Strategy

Steps 1-8 can be done by one agent (core types + implementations).
Steps 11-12 can parallel with step 10 (extensions while core tests run).
Steps 14-17 can each be a separate agent (4 plugins in parallel, max 4 agents).
Step 18-20 sequential after all plugins complete.

---

## Critical Constraints

1. **Source code only** — never modify dist/, never build/install the plugin
2. **Existing tests must pass** — no breaking changes to existing modules
3. **No placeholders or stubs** — every file is complete, production-ready
4. **Full test coverage** — every new module gets comprehensive tests
5. **TypeScript strict mode** — all code passes `npx tsc --noEmit`
6. **Build must succeed** — `node build.mjs` produces clean output
7. **Use precision tools** — follow GPA loop, batch operations
8. **Check .goodvibes/memory/** — consult before starting work
