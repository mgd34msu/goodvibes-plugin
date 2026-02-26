# GoodVibes Runtime Engine — Complete Technical Analysis

> **Version**: 1.0.0 (ENGINE_VERSION)
> **Source Location**: `plugins/goodvibes/tools/implementations/runtime-engine/src/`
> **Analysis Date**: 2026-02-26

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Layer 1: Core](#3-layer-1-core)
4. [Layer 2: Extensions](#4-layer-2-extensions)
5. [Layer 3: Plugins](#5-layer-3-plugins)
6. [Lifecycle & Executor Modes](#6-lifecycle--executor-modes)
7. [IPC System](#7-ipc-system)
8. [Directive System](#8-directive-system)
9. [Workflow Engine](#9-workflow-engine)
10. [Agent Coordination](#10-agent-coordination)
11. [Persistence & Recovery](#11-persistence--recovery)
12. [MCP Server](#12-mcp-server)
13. [Event Flow Walkthrough](#13-event-flow-walkthrough)
14. [Configuration](#14-configuration)
15. [Testing Strategy](#15-testing-strategy)
16. [Design Decisions](#16-design-decisions)

---

## 1. Executive Summary

The GoodVibes Runtime Engine is an event-driven orchestration system that runs as an MCP (Model Context Protocol) server within the Claude Code plugin ecosystem. It provides automated quality assurance workflows — most notably the WRFC (Work-Review-Fix-Check) loop — that coordinate AI agent lifecycles, enforce code review scoring thresholds, and manage fix iteration budgets.

The engine processes events from Claude Code hooks (SessionStart, SubagentStart, SubagentStop, PreToolUse, PostToolUse, etc.) through a three-layer architecture:

- **Layer 1 (Core)**: Generic event loop with priority queue, trigger registry, state store, metrics, and error handling. No domain knowledge.
- **Layer 2 (Extensions)**: Typed events and typed triggers that specialize Layer 1 for the Claude Code domain (~80 event types, 3 trigger extension types).
- **Layer 3 (Plugins)**: Domain-specific plugins (WRFC, Hooks, Time, External) that compose Layer 1 and Layer 2 into complete features.

The engine communicates with Claude Code hook scripts via a Unix domain socket IPC channel using newline-delimited JSON. It persists state via atomic JSON file writes and recovers from crashes using snapshot + event log replay.

Key capabilities:
- **WRFC Orchestration**: Automated work → review → fix → check cycles with configurable score thresholds (default 9.5/10) and fix attempt budgets (default 3)
- **Workflow State Machine**: Declarative workflow definitions with guard expressions, on-enter/on-exit actions, and max-transition safety limits
- **Agent Coordination**: Budget tracking, dependency graphs, WRFC phase management, concurrent agent limits (default 6)
- **16 Built-in Triggers**: Covering build/test failure recovery, WRFC chain automation, budget warnings, and spawn rate limiting
- **4 Built-in Workflow Definitions**: `wrfc_loop`, `fix_loop`, `test_then_fix`, `review_only`
- **Crash Recovery**: Snapshot + replay engine restoring workflows, agent bindings, and trigger fire counts

---

## 2. Architecture Overview

### Three-Layer Architecture

```
+------------------------------------------------------------------+
|  LAYER 3: PLUGINS                                                 |
|  +-----------+  +----------+  +----------+  +-----------+        |
|  | WRFC      |  | Hooks    |  | Time     |  | External  |        |
|  | Plugin    |  | Plugin   |  | Plugin   |  | Plugin    |        |
|  +-----------+  +----------+  +----------+  +-----------+        |
|                                                                   |
|  +------------------+  +-------------------+  +--------------+   |
|  | Directive System |  | Workflow Engine   |  | Agent Coord  |   |
|  | (Queue, Builder, |  | (State Machine,  |  | (Budget,     |   |
|  |  GvTagParser,    |  |  Definitions,    |  |  WRFC Chains,|   |
|  |  WRFC Handlers)  |  |  Guards)         |  |  Dependencies|   |
|  +------------------+  +-------------------+  +--------------+   |
+------------------------------------------------------------------+
|  LAYER 2: EXTENSIONS                                              |
|  +--------------------+     +--------------------+                |
|  | Typed Events       |     | Typed Triggers     |                |
|  | - HookEvent        |     | - WRFCTrigger      |                |
|  | - TimeEvent        |     | - CronTrigger      |                |
|  | - AgentEvent       |     | - WebhookTrigger   |                |
|  | - ExternalEvent    |     +--------------------+                |
|  | - HumanEvent       |                                           |
|  +--------------------+                                           |
|  +--------------------+     +--------------------+                |
|  | EventBus (pub-sub) |     | EventQueue (prio)  |                |
|  | - Pattern matching |     | - Priority buckets |                |
|  | - Ring buffer hist |     | - Dead letters     |                |
|  +--------------------+     +--------------------+                |
|  +--------------------+                                           |
|  | EventLog (append)  |                                           |
|  | - Write buffering  |                                           |
|  | - Compaction       |                                           |
|  +--------------------+                                           |
+------------------------------------------------------------------+
|  LAYER 1: CORE                                                    |
|  +----------+ +----------+ +----------+ +----------+ +---------+ |
|  | Event    | | Trigger  | | State    | | Metrics  | | Error   | |
|  | Queue    | | Registry | | Store    | | Collector| | Handler | |
|  | (heap)   | | (match)  | | (memory) | | (window) | | (retry) | |
|  +----------+ +----------+ +----------+ +----------+ +---------+ |
|  +----------+ +----------+                                        |
|  | Lifecycle| | Dead     |                                        |
|  | (FSM)    | | Letter Q |                                        |
|  +----------+ +----------+                                        |
+------------------------------------------------------------------+
|  SHARED INFRASTRUCTURE                                            |
|  +----------+ +----------+ +----------+ +----------+             |
|  | Config   | | Logger   | | Utils    | | Constants|             |
|  +----------+ +----------+ +----------+ +----------+             |
+------------------------------------------------------------------+
```

### Directory Structure

```
src/
  # ── Layer 1: Core (generic event loop — never changes) ──────────
  core/               Event queue, processor, trigger registry, state store,
                      lifecycle, error handler, metrics, dead-letter queue

  # ── Layer 2: Extensions (typed event/trigger factories) ─────────
  extensions/         Typed event and trigger factory modules
    events/           Agent, hook, time, external, human event factories
    triggers/         WRFC, cron, webhook, generic trigger factories
  events/             EventBus, EventQueue, EventLog
  triggers/           Trigger definitions, condition evaluation, action execution

  # ── Layer 3: Implementations (domain-specific behavior) ─────────
  plugins/            Domain plugins
    wrfc/             Score evaluation, directive building, quality gates
    hooks/            Hook event → runtime event mapping, handler registry
      handlers/       Per-hook-type handlers (8 types)
    time/             Heartbeat monitoring, cron scheduling
    external/         File watcher, HTTP webhook listener, normalizers
  workflow/           Workflow engine, WRFC and fix-loop state machines
  directives/         Directive queue, builder, WRFC handlers
  agents/             Agent coordinator, budget tracker

  # ── Infrastructure (cross-cutting) ──────────────────────────────
  ipc/                Unix domain socket IPC, query routing
  lifecycle/          ProcessManager, health checks, signals, executor modes
  persistence/        Snapshots, replay, state store
  server/             MCP server and 7 tool handlers
  shared/             Config, logger, utils, constants

  types.ts            Public API types (RuntimeResult, HealthStatus)
  index.ts            Public entry point
```

### Key Design Principles

1. **Layered independence**: Layer 1 has zero domain knowledge. Layer 2 adds types. Layer 3 adds behavior.
2. **Event-driven**: All communication between subsystems flows through events. No direct cross-module function calls except through well-defined interfaces.
3. **Graceful degradation**: Every subsystem dependency is nullable. The engine starts with whatever subsystems are available.
4. **Atomic persistence**: All file writes use tmp + rename to prevent partial state corruption on crash.
5. **Structured logging to stderr**: Following MCP convention, all log output goes to stderr as JSON to avoid corrupting the MCP stdio transport.

---

## 3. Layer 1: Core

Layer 1 provides the generic event processing infrastructure. It knows nothing about Claude Code, WRFC, or agents. It only understands: events have sources, types, payloads, and priorities; triggers match events and execute actions; state is a key-value store.

### 3.1 Core Types (`core/types.ts`)

The foundation of the entire engine. Every other module imports from here.

**RuntimeEvent** — the universal event envelope:
```typescript
interface RuntimeEvent {
  id: string;            // Unique event ID (evt_<uuid>)
  source: EventSource;   // 'time' | 'human' | 'external' | 'internal' | 'agent'
  type: string;          // Dot-namespaced type (e.g. 'hook:agent:spawned')
  payload: unknown;      // Type-specific data
  timestamp: string;     // ISO 8601
  priority?: number;     // 0 = highest, 100 = lowest
  context?: EventContext; // Workflow/agent correlation
}

interface EventContext {
  workflow_id?: string;
  agent_id?: string;
  parent_event_id?: string;
  chain_depth?: number;  // Circuit breaker counter
  ref?: string;          // External reference
}
```

**Trigger** — the rule that reacts to events:
```typescript
interface Trigger {
  id: string;
  event_match: EventMatcher;      // Source/type/payload match
  conditions?: Condition[];        // Additional conditions
  actions: Action[];               // What to do when matched
  max_fires?: number;              // Fire budget (undefined = unlimited)
  cooldown_ms?: number;            // Minimum interval between fires
  chain_depth_limit?: number;      // Max chain depth before circuit break
  retry?: { max_attempts: number; delay_ms: number; backoff: 'fixed' | 'exponential' };
  enabled?: boolean;
  priority?: number;
}
```

**Action** — the effect of a trigger firing:
```typescript
interface Action {
  type: ActionType; // 'emit_event' | 'update_state' | 'invoke_handler' |
                    // 'spawn_agent' | 'start_workflow' | 'composite'
  params: Record<string, unknown>;
}
```

Factory helpers `createEvent()` and `createTrigger()` provide defaults and generate IDs.

### 3.2 Event Queue (`core/event-queue.ts`)

A priority queue implemented as a **binary min-heap** ordered by `(priority ASC, sequence ASC)` — lower priority numbers process first, with FIFO ordering within the same priority level.

```
Complexity:
  enqueue:  O(log n) — heap insertion
  dequeue:  O(log n) — heap extraction
  peek:     O(1)
  cancel:   O(n)     — linear scan + mark
  drain:    O(n log n) — repeated extraction
```

**Deduplication**: Events within a configurable TTL window (default 60s) are rejected if their ID has been seen before. A dedup cache is swept every 30 seconds to prevent unbounded growth.

**Backpressure**: When queue depth exceeds `max_depth` (default 1000), `enqueue()` returns false instead of blocking, allowing the caller to decide how to handle the overflow.

**Requeue**: The `requeue()` method bypasses dedup for cut-down batches — used by the event processor when retry is needed.

### 3.3 Event Processor (`core/event-processor.ts`)

The main processing loop that drains events and matches triggers:

```
Loop:
  1. Drain events from queue (batch)
  2. For each event:
     a. Check chain depth → reject if > max (default 10)
     b. Acquire workflow-level lock (timeout 30s)
     c. Match triggers via TriggerRegistry
     d. Execute matched trigger actions
     e. Collect state updates
     f. Enqueue chained events (with incremented chain_depth)
     g. Update metrics
     h. Release lock
```

**Workflow-level locking** prevents concurrent trigger execution for the same workflow, ensuring state consistency. Lock timeout prevents deadlocks.

**Budget tracking** integrates with the executor budget system. The processor checks `canProcess()` before processing and emits `budget_warning`/`budget_exceeded` events at configurable thresholds.

**Rate limiting** caps event processing rate per configurable window to prevent runaway chains.

**Priority floor** allows load shedding during overload — events below a threshold priority are silently dropped.

### 3.4 Trigger Registry (`core/trigger-registry.ts`)

The matching engine that evaluates triggers against events. Evaluation follows a strict order:

```
Match evaluation order:
  1. enabled? (skip disabled triggers)
  2. max_fires exceeded? (skip exhausted triggers)
  3. cooldown_ms elapsed since last fire? (skip cooling triggers)
  4. chain_depth_limit exceeded? (circuit breaker)
  5. source filter match? (EventMatcher.source)
  6. type match? (exact string, RegExp, or glob pattern)
  7. payload match? (deep partial match)
  8. conditions match? (dot-path comparison operators)
```

**Glob pattern matching** uses an LRU cache (max 500 entries) to avoid recompiling patterns on every evaluation.

**Deep partial payload matching** walks the expected payload structure and checks that every specified field exists and matches in the actual event payload. Missing expected fields cause a mismatch; extra actual fields are ignored.

**Condition evaluation** supports operators: `eq`, `neq`, `gt`, `lt`, `gte`, `lte`, `in`, `exists`. Values are resolved via dot-path traversal on the event payload.

**`resetAllFireCounts()`** is called on `session:started` to give each session a fresh trigger budget.

### 3.5 State Store (`core/state-store.ts`)

An in-memory `Map<string, unknown>` backed by a JSON file at `.goodvibes/memory/runtime-state.json`.

- **Dot-path operations**: `get('a.b.c')`, `set('a.b.c', value)`, `delete('a.b.c')`, `merge('a.b', partial)`.
- **Debounced auto-save**: Mutations trigger a 1-second debounced write to disk, coalescing rapid changes into a single I/O operation.
- **Atomic persistence**: Writes to a `.tmp` file first, then `rename()` to the final path. This guarantees the file is either fully written or unchanged on crash.
- **Snapshot/Restore**: `snapshot()` returns a `structuredClone()` of the entire state; `restore()` replaces it.

### 3.6 Lifecycle State Machine (`core/lifecycle.ts`)

A finite state machine governing the engine's operational state:

```
                   start()
  [stopped] ─────────────────> [running]
                                  │  │
                          pause() │  │ drain()
                                  v  │
                              [paused] │
                                  │    │
                          resume()│    v
                                  │ [draining]
                                  │    │
                                  v    v
                              [stopped]

  any state ──── forceTransition('shutdown') ──> [stopped]
```

Callbacks:
- `onTransition(from, to)` — fired on every state change
- `onShutdown()` — fired when entering stopped state
- `onDrain()` — fired when entering draining state

### 3.7 Metrics (`core/metrics.ts`)

Rolling-window metrics using a **circular buffer** for latency and chain depth tracking:

```typescript
interface MetricsSnapshot {
  events_processed: number;
  events_failed: number;
  events_dead_lettered: number;
  avg_latency_ms: number;
  queue_depth: number;
  active_chains: number;
  active_workflows: number;
  triggers_fired: Record<string, number>; // Per-trigger fire counts
}
```

The `RollingWindow` class stores the last N samples in a pre-allocated array, providing O(1) insertion and O(N) aggregation. Window size and time span are configurable.

### 3.8 Dead Letter Queue (`core/dead-letter.ts`)

Events that exhaust their retry budget are moved to the DLQ rather than being silently dropped.

- **Max size**: 500 entries, with oldest-first eviction when full
- **JSON file persistence**: Survives engine restarts
- **Replay**: `replay(eventId)` removes the event from the DLQ and returns it for re-enqueueing
- **Inspection**: Full DLQ contents are queryable for operational debugging

### 3.9 Error Handler (`core/error-handler.ts`)

Retry orchestration with two backoff strategies:

- **Fixed backoff**: Constant delay between retries
- **Exponential backoff**: Delay doubles with each attempt (capped)

When all retry attempts are exhausted, the event is routed to the Dead Letter Queue. The error handler emits `core:handler_error` events for observability. **It never throws** — all errors are captured and routed.

---

## 4. Layer 2: Extensions

Layer 2 adds domain-specific types on top of Layer 1's generic primitives.

### 4.1 Event Type System (`events/types.ts`)

Defines ~80 event types organized by namespace:

| Namespace | Examples | Count |
|-----------|----------|-------|
| `session` | `session:started`, `session:ended`, `session:compact` | ~3 |
| `hook` | `hook:agent:spawned`, `hook:agent:completed`, `hook:pre_tool_use` | ~10 |
| `workflow` | `workflow:created`, `workflow:completed`, `workflow:cancelled` | ~4 |
| `wrfc` | `wrfc:gathering_started`, `wrfc:review_completed`, `wrfc:fix_completed` | ~10 |
| `test_fix` | `test_fix:testing_started`, `test_fix:tests_passed`, `test_fix:fix_completed` | ~8 |
| `review_only` | `review_only:review_started`, `review_only:review_completed` | ~3 |
| `agent` | `agent:spawned`, `agent:completed`, `agent:progress`, `agent:budget_warning` | ~6 |
| `trigger` | `trigger:fired`, `trigger:error` | ~2 |
| `build` | `build:started`, `build:completed`, `build:failed` | ~3 |
| `test` | `test:started`, `test:passed`, `test:failed` | ~3 |
| `system` | `system:startup`, `system:shutdown`, `system:error` | ~3 |
| `executor` | `executor:budget_warning`, `executor:budget_exceeded` | ~2 |
| Others | `file:*`, `devserver:*`, `engine:*`, `config:*` | ~10+ |

**Discriminated union `EventPayload`**: Each event type maps to a strongly-typed payload via a discriminated union on the `type` field. This ensures compile-time type safety when handlers narrow on event type.

**Discriminated union `EventSource`**: Rather than a simple string, sources carry structured context:
```typescript
type EventSource =
  | { kind: 'hook'; hook_name: string }
  | { kind: 'workflow'; workflow_id: string }
  | { kind: 'agent'; agent_id: string }
  | { kind: 'trigger'; trigger_id: string }
  | { kind: 'system' }
  | { kind: 'mcp_tool' }
  | { kind: 'ipc' };
```

**EventMetadata** adds correlation and sequencing:
```typescript
interface EventMetadata {
  session_id?: string;
  correlation_id?: string;
  causation_id?: string;
  sequence: number;        // Auto-incremented by EventBus
  version: number;         // Schema version (always 1)
}
```

### 4.2 EventBus (`events/event-bus.ts`)

Pub-sub event distribution with pattern matching:

- **Exact matching**: `bus.on('hook:agent:spawned', handler)`
- **Namespace wildcard**: `bus.on('hook:*', handler)` — matches all `hook:*` events
- **Global wildcard**: `bus.on('*', handler)` — receives every event

**Ring buffer history**: The last 10,000 events are retained in memory for querying:
```typescript
bus.getHistory({
  types: ['hook:agent:completed'],
  source: { kind: 'hook' },
  since: '2026-02-25T00:00:00Z',
  limit: 50,
});
```

**Sequence numbering**: Each emitted event receives a monotonically increasing sequence number, enabling total ordering.

**Persistent event log integration**: When an `EventLog` is attached via `setEventLog()`, every emitted event is also appended to the persistent log for crash recovery.

### 4.3 EventQueue v2 (`events/event-queue.ts`)

A higher-level event queue (different from the core heap queue) with:

- **Priority buckets**: CRITICAL(0), HIGH(1), NORMAL(2), LOW(3) — each bucket is a FIFO queue
- **Exponential backoff retries** for failed events
- **Dead-letter queue** integration for events that exhaust retries
- **Handler registration** for dispatching events to type-specific handlers
- **Statistics tracking**: processed, failed, dead-lettered, per-type counts

### 4.4 EventLog (`events/event-log.ts`)

An append-only persistent event log used for crash recovery:

- **Write buffering**: Events are buffered in memory and flushed at configurable thresholds (default: 100ms interval or 64KB buffer size)
- **Compaction**: Old segments are compacted to reduce disk usage
- **Querying**: Stream-based line processing for filtering events by type, source, or time range
- **Archiving**: Old log segments can be archived to a separate location

### 4.5 Extension Events

Five specialized event constructors that wrap Layer 1's `RuntimeEvent` with domain-specific defaults:

| Extension | Source | Priority | Key Fields |
|-----------|--------|----------|------------|
| `HookEvent` | `internal` | 50 | `hook_type` (11 types), `hook_input`, `session_id` |
| `TimeEvent` | `time` | 10 | `time_type` (`heartbeat`, `cron`, `scheduled`, `one_shot`) |
| `AgentEvent` | `agent` | 60 | `agent_id`, `agent_type`, `result`, `score`, `artifacts` |
| `ExternalEvent` | `external` | 30 | `external_source`, `raw_payload`, `normalized` |
| `HumanEvent` | `human` | 100 | `prompt`, `command`, `approval` |

Human events have the highest priority (100) because user intent should always be processed before system events.

### 4.6 Extension Triggers

Three trigger specializations:

**WRFCTrigger** extends `Trigger` with:
- `score_threshold?: number` — minimum review score (0-10)
- `max_fix_attempts?: number` — iteration budget
- `workflow_state_filter?: string[]` — only fire in specific states

**CronTrigger** extends `Trigger` with:
- `schedule: string` — standard cron expression
- `active_hours?: string` — time window filter
- `timezone?: string` — IANA timezone

**WebhookTrigger** extends `Trigger` with:
- `url_pattern: string` — URL path matching
- `method_filter?: string[]` — HTTP method filter
- `headers_match?: Record<string, string>` — required headers

---

## 5. Layer 3: Plugins

### 5.1 WRFC Plugin (`plugins/wrfc/wrfc-plugin.ts`)

Registers the WRFC quality loop as a Layer 1 trigger with the event processor. The plugin:

1. Creates a `WRFCTrigger` that listens for `wrfc:review_started` events
2. Evaluates review scores using `ScoreEvaluator`
3. Routes to fix or complete based on the score threshold (default 9.5)
4. Builds directives using `DirectiveBuilder`

Configuration:
```typescript
interface WRFCPluginConfig {
  score_threshold: number;       // Default: 9.5
  max_fix_attempts: number;      // Default: 3
  enable_quality_gates: boolean; // Default: true
}
```

### 5.2 Hooks Plugin (`plugins/hooks/`, 8+ files)

**HookProcessor** (`hook-processor.ts`): Dispatches hook events to registered handlers and merges their responses. The response format follows Claude Code's hook protocol:

```typescript
interface ClaudeHookResponse {
  decision?: 'allow' | 'block';      // For PreToolUse gating
  reason?: string;                     // Human-readable explanation
  additionalContext?: string;          // Injected into prompt
  hookSpecificOutput?: Record<string, unknown>; // UPS directive delivery
  suppressOutput?: boolean;            // Skip Claude Code's default output
}
```

When multiple handlers respond, `mergeResponses()` combines them:
- If any handler returns `block`, the merged response is `block`
- `additionalContext` strings are concatenated with newlines
- `hookSpecificOutput` objects are shallow-merged

**HookRegistry**: Maps hook types to handler functions. Supports the 11 Claude Code hook types:
`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `SessionStart`, `SessionEnd`, `PreCompact`, `UserPromptSubmit`, `Notification`, `Stop`.

**Individual Handlers** (one file each):
- `session-start.ts` — emits `session:started`, stores session metadata
- `session-end.ts` — emits `session:ended`, triggers cleanup
- `subagent-start.ts` — emits `hook:agent:spawned` with agent metadata
- `subagent-stop.ts` — emits `hook:agent:completed` with agent output
- `pre-tool-use.ts` — evaluates tool gating rules
- `post-tool-use.ts` — tracks tool usage metrics
- `pre-compact.ts` — handles context window compaction
- `user-prompt-submit.ts` — processes user prompts

### 5.3 Time Plugin (`plugins/time/time-plugin.ts`)

Manages time-based events:

- **HeartbeatManager**: Emits periodic heartbeat events at configurable intervals
- **EventScheduler**: Schedules one-shot and cron-based events
- `onTick()` method: Called by the engine's tick timer; checks heartbeat due times, evaluates scheduled events, enqueues any that fire

### 5.4 External Plugin (`plugins/external/external-plugin.ts`)

Bridges external event sources into the runtime:

- **FileWatcher**: Monitors directories for file changes and emits `file:*` events
- **HttpListener**: Optional HTTP server that accepts webhook payloads
- **NormalizerRegistry**: Transforms raw payloads (GitHub, generic) into the engine's event format

---

## 6. Lifecycle & Executor Modes

### 6.1 ProcessManager (`lifecycle/process-manager.ts`)

The central orchestrator that owns all subsystem lifecycles. It is the only module that instantiates other modules; all other modules receive their dependencies via constructor injection.

**Startup sequence** (13 steps):
```
 1. Load config from disk (merge with defaults)
 2. Initialize state store (JsonStateStore)
 3. Initialize event system (EventBus + EventLog + EventQueue)
 4. Check for crash recovery
 5. Write PID lock file
 6. Start periodic checkpoint timer
 7. Initialize workflow engine + trigger registry (if enabled)
    - Register 4 built-in workflow definitions
    - Register checkReviewScore guard
    - Load custom workflows from goodvibes.json
    - Register 16 built-in triggers
    - Wire EventBus → TriggerRegistry evaluation
 8. Initialize agent coordinator (if enabled)
    - Register WRFC handlers
    - Register test-fix handlers
    - Register review-only handlers
 9. Initialize snapshot manager + startup recovery
    - Snapshot + replay for crash recovery
    - Start periodic snapshots (60s)
10. Initialize executor subsystem (mode, budget, daemon tick)
10b. Initialize v3 plugins (WRFC, Hooks, Time, External)
10c. Restore executor budget from v3StateStore
11. Start IPC server (Unix domain socket)
12. Start v3 tick timer
13. Emit system:startup event
```

**Shutdown sequence** (reverse order):
```
 1. Stop checkpoint timer
 2. Save final state checkpoint
 3. Stop tick timer
 4. Stop v3 plugins
 5. Stop IPC server
 6. Stop event queue
 7. Close event log
 8. Remove PID lock file
 9. Emit system:shutdown event
```

### 6.2 Executor Modes (`lifecycle/executor-mode.ts`)

Three operational modes:

| Mode | Behavior | Use Case |
|------|----------|----------|
| **Engaged** | Interactive, processes events in real-time | Active Claude Code session |
| **Daemon** | Background, processes on tick intervals | Unattended operation |
| **Hybrid** | Switches between engaged/daemon based on activity | Default |

Mode detection order:
1. Explicit config value (`config.executor.mode`)
2. Environment inference (CI detection, TTY detection)
3. Default: `engaged`

Key methods:
- `shouldProcessQueue()` — whether the event processor should drain
- `shouldClearContext()` — whether the daemon should clear context between ticks

### 6.3 Executor Budget (`lifecycle/executor-budget.ts`)

Tracks spending across sessions to enforce cost limits:

```typescript
interface SpendingRecord {
  total_usd: number;       // Lifetime spend
  daily_usd: number;       // Current day spend
  daily_reset_at: string;  // When daily counter resets
  last_updated: string;    // Last update timestamp
}
```

- `recordSpending(amount)` — adds to both total and daily counters
- `canProcess()` — checks against configured daily/total limits
- `checkDailyReset()` — resets daily counter at midnight
- Emits `executor:budget_warning` at 80% and `executor:budget_exceeded` at 100%
- Persists spending record to the state store

### 6.4 Daemon Tick Handler (`lifecycle/daemon-tick-handler.ts`)

Processes one "tick" of daemon-mode operation:

```typescript
interface TickResult {
  tick_number: number;
  events_processed: number;
  duration_ms: number;
  context_cleared: boolean;
  budget_status: { can_process: boolean; daily_usd: number };
}
```

`handleTick()` checks the budget, drains the queue, processes events, optionally clears context via tmux, and returns the result.

### 6.5 Context Clearer (`lifecycle/context-clearer.ts`)

Clears Claude Code's context window via `tmux send-keys`. Used in daemon mode to prevent context window exhaustion during long unattended runs.

### 6.6 Signal Handlers (`lifecycle/signals.ts`)

Registers OS signal handlers for graceful shutdown:

| Signal | Grace Period | Action |
|--------|-------------|--------|
| SIGTERM | 10 seconds | Graceful shutdown |
| SIGINT | 5 seconds | Graceful shutdown (Ctrl+C) |
| SIGUSR1 | — | Checkpoint request (stub) |
| SIGUSR2 | — | Dump health status to stderr |
| uncaughtException | 10 seconds | Log + graceful shutdown |
| unhandledRejection | 10 seconds | Log + graceful shutdown |

A watchdog timer (`unref`'d) forces `process.exit(1)` if shutdown hangs past the grace period.

Note: `process.stderr.write()` is used directly in signal handlers because async operations (including the structured logger) cannot be safely awaited in the restricted signal context.

### 6.7 Health Checker (`lifecycle/health.ts`)

Returns aggregated health status with individual check results:

```typescript
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime_ms: number;
  pid: number;
  memory_usage_mb: number;
  event_queue_depth: number;
  active_workflows: number;
  active_agents: number;
  ipc_clients: number;
  last_event_at: string | null;
  checks: HealthCheck[];
  features: Record<string, boolean>;
  version: string;
}
```

Individual checks:
- **Memory check**: warn at 70% of configured limit, fail at 90%
- **Uptime check**: warn if < 1 second (still initializing)
- **Feature flags**: Reports current state of all feature toggles

---

## 7. IPC System

### 7.1 Protocol (`ipc/protocol.ts`)

Newline-delimited JSON over Unix domain sockets. Four message types:

**HookEventMessage** — delivers a Claude Code hook event:
```typescript
{
  id: string;
  type: 'hook_event';
  timestamp: string;
  hook_name: string;       // e.g. 'session:started', 'agent:completed'
  hook_input: unknown;     // Raw hook payload
}
```

**QueryMessage** — requests information from the engine:
```typescript
{
  id: string;
  type: 'query';
  timestamp: string;
  query: {
    kind: QueryKind;  // see table below
    // kind-specific fields
  };
}
```

| QueryKind | Purpose | Response Data |
|-----------|---------|---------------|
| `get_system_message` | Get pending directives | `{ message: string, directives: Directive[] }` |
| `get_directives` | Same as above (alias) | Same |
| `get_workflow_state` | Inspect a workflow | `{ instance: WorkflowInstance }` |
| `get_agent_status` | Inspect an agent | `{ agent: CoordinatedAgent }` |
| `should_block_tool` | Tool gating decision | `{ allow: boolean }` |
| `get_context_injection` | Get context to inject | `{ context: string }` |
| `resolve_pending_bind` | WRFC agent-workflow binding | `{ workflow_id: string \| null }` |
| `get_executor_mode` | Current executor mode | `{ mode: string }` |
| `get_executor_budget` | Spending info | `{ spending, can_process }` |
| `process_tick` | Trigger a daemon tick | `{ result: TickResult }` |

**Directive** — instruction for the orchestrator:
```typescript
interface Directive {
  type: 'inject_system_message' | 'block_tool' | 'modify_input' | 'warn' | 'suggest';
  content: string;
  priority: number;    // Higher = more important
  source: string;      // Handler that created this directive
}
```

### 7.2 IPC Router (`ipc/ipc-router.ts`)

Routes incoming IPC messages to the appropriate subsystem. Key routing logic:

**`hook_event` messages**:
1. Emit as `hook:*` event on the EventBus
2. Await trigger evaluation (synchronous — ensures directives are enqueued before the hook's follow-up query)
3. If `session:started`: reset trigger fire counts, write session-keyed pointer file
4. If `config:loaded`: validate and store WRFC config in DirectiveQueue
5. Optionally route through v3 HookProcessor (bridge v2 to v3)

**`query` messages**:
- `get_directives` / `get_system_message`: Drain directive queue, sort by priority, join content strings
- `get_workflow_state`: Look up workflow instance by ID
- `should_block_tool`: Currently always returns `allow: true`
- `resolve_pending_bind`: Resolves FIFO pending bind queue for agent-workflow binding

**Session pointer files**: On `session:started`, the router writes the socket path to `.goodvibes/state/runtime-{session_id}.socket`. This allows hook scripts to discover the runtime engine's socket even when multiple sessions run concurrently.

### 7.3 IPC Server (`ipc/ipc-server.ts`)

Unix domain socket server:
- Listens on `.goodvibes/state/runtime.socket`
- Accepts multiple concurrent connections
- Parses newline-delimited JSON from each connection
- Routes messages through the IPCRouter
- Serializes responses back as newline-delimited JSON

### 7.4 IPC Client (`ipc/client.ts`)

Client library used by hook scripts to communicate with the runtime engine:
- **Socket discovery**: Tries session-keyed pointer file first, falls back to default socket path
- **Connection pooling**: Reuses connections across requests
- **Timeout handling**: Configurable per-request timeout

### 7.5 File Fallback (`ipc/file-fallback.ts`)

File-based IPC fallback for environments where Unix domain sockets are unavailable. Uses atomic file writes for request/response exchange. Significantly slower than sockets but functional everywhere.

---

## 8. Directive System

The directive system is how the runtime engine instructs the Claude Code orchestrator to take specific actions (spawn agents, complete workflows, escalate).

### 8.1 DirectiveQueue (`directives/directive-queue.ts`)

A FIFO queue partitioned by target hook name (e.g., `'subagent_stop'`):

```
Operations:
  enqueue(target, directive)  — add to end of target's queue
  drain(target)               — destructive read of all directives
  peek(target)                — non-destructive read
  clear()                     — remove all directives
  size(target?)               — count pending directives
```

**Per-target capacity**: 100 directives max. When full, the oldest directive is evicted with a warning log.

**WRFC Config Storage** (v1 pragmatic violation of SRP): The DirectiveQueue also stores WRFC configuration received via `config:loaded` hook events. This is acknowledged in code comments as a design debt — should be extracted to a dedicated service in v2.

### 8.2 DirectiveBuilder (`directives/directive-builder.ts`)

Functions that construct structured `<gv>` directive strings:

```typescript
// Spawn a new agent
buildSpawnDirectiveMessage('reviewer', task, budget, context)
// Output: <gv>{"action":"spawn","wid":"wrfc_abc","type":"reviewer","task":"..."}</gv>

// Mark workflow complete
buildWorkflowCompleteMessage(workflowId, state)
// Output: <gv>{"action":"complete","wid":"wrfc_abc"}</gv>

// Escalate (fix budget exhausted)
buildEscalationMessage(workflowId, fixAttempts, lastScore)
// Output: <gv>{"action":"escalate","wid":"wrfc_abc","reason":"3 fix attempts failed, last score 7.5/10"}</gv>
```

The `<gv>` tag format is parsed mechanically by the orchestrator — no LLM interpretation needed.

### 8.3 GvTagParser (`directives/gv-tag-parser.ts`)

Parses `<gv>` JSON tags from agent output text:

```typescript
interface GvTagData {
  score?: number;    // 0-10, clamped
  pass?: boolean;    // Pass/fail signal
  files?: string[];  // Modified files
  count?: number;    // Item count (e.g., tests)
  [key: string]: unknown; // Extra fields
}
```

Convenience extractors:
- `extractReviewScore(text)` — tries `<gv>` tag first, falls back to `SCORE: X/10` regex
- `extractFiles(text)` — extracts file list from `<gv>` tag
- `extractTestResults(text)` — extracts pass/count from `<gv>` tag

### 8.4 WRFC Handlers (`directives/wrfc-handlers.ts`)

The core orchestration logic. Four registered handlers drive the WRFC chain:

**Handler 0: `wrfc_agent_spawned`** (on `hook:agent:spawned`):
```
1. Extract agent_id from event
2. Determine workflow_id:
   - Use incoming workflow_id if present (chain agent)
   - Otherwise generate wrfc_{agent_id} (originator)
3. Bind agent_id → workflow_id in AgentWorkflowMap
4. If originator (no incoming workflow_id):
   a. Create wrfc_loop workflow instance
   b. Seed WRFC config (min_review_score, max_fix_attempts) from user's goodvibes.json
   c. Auto-advance: IDLE → GATHERING → PLANNING → WRITING
```

**Handler 1: `wrfc_chain_next`** (on `hook:agent:completed`):
```
1. Look up workflow via AgentWorkflowMap
2. Fall back to most-recent active workflow (backward compat)
3. Auto-complete whitelist check:
   - Explore, Plan, Bash, general-purpose, reviewer → auto-complete
4. Route by workflow state:
   - WRITING: spawn reviewer → advance to REVIEWING
   - REVIEWING: extract score → handleReviewResult()
   - FIXING: extract files → handleFixResult()
```

**Auto-complete whitelist**:
```typescript
AUTO_COMPLETE_AGENT_TYPES = new Set([
  'Explore', 'Plan', 'Bash', 'general-purpose',
  'reviewer', 'goodvibes:reviewer',
]);
```

Non-work agents auto-complete because they produce no reviewable output. Reviewers auto-complete their own WRFC workflow (they drive the parent workflow's REVIEWING branch instead).

**`handleReviewResult()`** — shared helper:
```
1. Read min_review_score from context (default 9.5)
2. Write review_score + thresholds into context
3. Advance state machine: wrfc:review_completed
4. If score >= threshold: enqueue complete directive
5. If score < threshold: enqueue fixer spawn directive + pending bind
```

**`handleFixResult()`** — shared helper:
```
1. Increment fix_attempts
2. If attempts >= max: advance state, enqueue escalation directive
3. If attempts < max: advance state, enqueue re-review spawn + pending bind
```

### 8.5 AgentWorkflowMap (`directives/agent-workflow-map.ts`)

In-memory bidirectional map from `agent_id` to `workflow_id`:

```
Lifecycle:
  bind(agentId, workflowId)      — on agent spawn
  lookup(agentId) → workflowId   — on agent completion
  unbind(agentId)                — after workflow resolution
```

**Pending bind queue**: Solves the timing problem where a spawn directive is enqueued but the agent hasn't started yet. When a WRFC handler enqueues a spawn directive, it also calls `addPendingBind(agentType, workflowId)`. When `SubagentStart` fires for the new agent, the hook script queries `resolve_pending_bind` to get the workflow_id.

```
Pending bind flow:
  1. wrfc_chain_next enqueues spawn:reviewer directive
  2. wrfc_chain_next calls agentWorkflowMap.addPendingBind('reviewer', workflowId)
  3. Orchestrator spawns reviewer agent
  4. SubagentStart hook queries: resolve_pending_bind('reviewer')
  5. Runtime returns workflowId, removes pending bind
  6. SubagentStart includes workflow_id in hook event
  7. wrfc_agent_spawned binds the new agent to the existing workflow
```

**Dual-key pattern**: Both `'reviewer'` and `'goodvibes:reviewer'` are enqueued as pending binds for the same workflow. When either resolves, the sibling is removed to prevent stale entries.

**TTL**: Pending binds expire after 60 seconds to prevent unbounded memory growth.

### 8.6 Review-Only Handlers (`directives/review-only-handlers.ts`)

Single handler: `review_only_agent_completed`
- Only processes agents in `review_only` workflows
- Extracts review score from agent output
- Emits `review_only:review_completed` to advance state machine
- Enqueues informational complete directive
- Cleans up agent-workflow binding

### 8.7 Test-Fix Handlers (`directives/test-fix-handlers.ts`)

Three handlers driving the test-then-fix chain:

1. **`test_fix_agent_completed`**: Parses test output (`<gv>` tag or regex fallback), emits `tests_passed` or `tests_failed`
2. **`test_fix_handle_failure`**: Increments fix_attempts, spawns engineer or escalates
3. **`test_fix_handle_retest`**: Re-evaluates test results after a fix

---

## 9. Workflow Engine

### 9.1 Types (`workflow/types.ts`)

The workflow type system is a declarative state machine DSL:

```typescript
interface WorkflowDefinition {
  id: string;                          // e.g., 'wrfc_loop'
  name: string;                        // Human-readable name
  version: number;                     // Schema version
  states: Record<string, StateDefinition>;
  initial_state: string;               // Must exist in states
  terminal_states: string[];           // Auto-complete on entry
  max_duration_ms?: number;            // Wall-clock timeout
  max_transitions?: number;            // Infinite-loop safety
}

interface StateDefinition {
  name: string;
  on_enter?: ActionDefinition[];       // Execute on entering state
  on_exit?: ActionDefinition[];        // Execute on leaving state
  transitions: TransitionDefinition[]; // Ordered, first match wins
  timeout_ms?: number;                 // State-level timeout
  timeout_transition?: string;         // Target state on timeout
}

interface TransitionDefinition {
  event: EventType;                    // Triggering event
  target: string;                      // Target state
  guard?: GuardCondition;              // Optional gate
  actions?: ActionDefinition[];        // Transition actions
}
```

**Guard conditions** support two modes:
- **Expression**: DSL string like `context.review_score >= context.min_review_score` evaluated without `eval()`
- **Function**: Named guard function registered via `registerGuard()`

**Action types**: `emit_event`, `update_context`, `invoke_handler`, `spawn_agent`

### 9.2 WorkflowEngine (`workflow/workflow-engine.ts`)

Manages workflow definitions, instances, guards, and actions:

**Instance lifecycle**:
```
create(definitionId, context, workflowId?)
  → WorkflowInstance { id, definition_id, current_state, context, history, status: 'active' }

sendEvent(workflowId, event)
  → Find first matching transition (event type + guard)
  → Execute on_exit actions
  → Execute transition actions
  → Move to target state
  → Execute on_enter actions
  → If terminal state: mark completed
  → Record transition in history

cancel(workflowId, reason)
  → Mark status 'cancelled', set error
```

**Guard expression evaluation** (`evaluateExpression`):
```
Parser supports:
  Operators: >=, <=, >, <, ===, !==
  Left side: context.field (dot-path)
  Right side: number, boolean (true/false), string, null, context.field

  Example: "context.review_score >= context.min_review_score"
  → resolveValue("context.review_score", context) >= resolveValue("context.min_review_score", context)
```

No `eval()` is used — the expression is parsed by splitting on the operator and resolving each side via dot-path traversal.

**Pruning**: `prune(maxAge)` removes completed/failed/cancelled instances older than `maxAge` (default 1 hour) to prevent unbounded memory growth.

### 9.3 Built-in Workflow Definitions

#### WRFC Loop (`wrfc_loop`, 8 states, max 20 transitions)

```
  IDLE ──workflow:created──> GATHERING
  GATHERING ──wrfc:plan_submitted──> PLANNING
  PLANNING ──wrfc:writing_started──> WRITING
  WRITING ──wrfc:review_started──> REVIEWING

  REVIEWING:
    ├── wrfc:review_completed [score >= min] ──> COMPLETE
    └── wrfc:review_completed [score < min]  ──> FIXING

  FIXING:
    ├── wrfc:fix_completed [attempts < max] ──> REVIEWING
    └── wrfc:fix_completed [attempts >= max] ──> ESCALATED

  COMPLETE: terminal (emits wrfc:completed)
  ESCALATED: terminal (emits wrfc:escalated)
```

#### Fix Loop (`fix_loop`, 6 states, max 30 transitions)

```
  IDLE ──fix:diagnosing──> DIAGNOSING
  DIAGNOSING ──fix:applying──> APPLYING
  APPLYING ──fix:verifying──> VERIFYING

  VERIFYING:
    ├── fix:resolved ──> RESOLVED
    ├── fix:retrying [attempts < max] ──> RETRYING
    └── fix:failed [attempts >= max] ──> FAILED

  RETRYING ──fix:diagnosing──> DIAGNOSING
  RESOLVED: terminal
  FAILED: terminal
```

#### Test-Then-Fix (`test_then_fix`, 6 states, max 15 transitions)

```
  IDLE ──workflow:created──> TESTING
  TESTING:
    ├── test_fix:tests_passed ──> COMPLETE
    └── test_fix:tests_failed ──> FIXING

  FIXING:
    ├── test_fix:fix_completed [attempts < max] ──> RE_TESTING
    └── test_fix:fix_completed [attempts >= max] ──> ESCALATED

  RE_TESTING:
    ├── test_fix:tests_passed ──> COMPLETE
    ├── test_fix:tests_failed [attempts < max] ──> FIXING
    └── test_fix:tests_failed [attempts >= max] ──> ESCALATED

  COMPLETE: terminal (emits test_fix:completed)
  ESCALATED: terminal (emits test_fix:escalated)
```

#### Review Only (`review_only`, 3 states, max 10 transitions)

```
  IDLE ──workflow:created──> REVIEWING
  REVIEWING ──review_only:review_completed──> COMPLETE
  COMPLETE: terminal (emits review_only:completed)
```

#### Custom Workflows

Users can define custom workflows in `goodvibes.json` under the `workflows.custom` key. The `custom-loader.ts` module validates workflow definitions at startup:

- All referenced states exist in the states map
- Initial state exists
- Terminal states exist
- Transitions reference valid target states
- Guard expressions are syntactically valid

---

## 10. Agent Coordination

### 10.1 Agent Types (`agents/types.ts`)

```typescript
interface CoordinatedAgent {
  id: string;
  type: string;          // 'engineer', 'reviewer', 'tester'
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  budget: AgentBudgetSnapshot;
  workflow_id?: string;
  wrfc_phase?: 'gather' | 'plan' | 'write' | 'review' | 'fix';
  depends_on: string[];      // Agent IDs that must complete first
  depended_by: string[];     // Agents waiting on this one
  files_modified: string[];
  tools_called: number;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
}

interface AgentBudgetSnapshot {
  allocated: number;
  spent: number;
  remaining: number;
  exhausted: boolean;
  usage_percent: number;
  input_tokens: number;
  output_tokens: number;
  cache_tokens: number;
  cost_usd: number;
}
```

### 10.2 AgentCoordinator (`agents/agent-coordinator.ts`)

Manages the lifecycle of coordinated agents:

- **`spawn(options)`**: Creates a new agent entry, checks concurrency limits (default max 6), registers with budget tracker, emits `agent:spawned`
- **`updateStatus(agentId, status)`**: Validates state transition, emits status event, resolves dependencies
- **`updateBudget(agentId, budget)`**: Updates budget snapshot, checks thresholds
- **`getExecutionPlan(workflowId)`**: Computes critical path and estimated resource usage

**Valid state transitions**:
```
pending  → running, cancelled
running  → completed, failed, cancelled
completed → (none)
failed   → (none)
cancelled → (none)
```

**WRFC chain tracking**: The coordinator maintains `WRFCChain` objects that group agents across phases for a workflow:
```typescript
interface WRFCChain {
  id: string;
  workflow_id: string;
  task: string;
  phases: WRFCPhase[];        // gather, plan, write, review, fix
  current_phase: number;
  review_iterations: number;
  max_review_iterations: number;
}
```

**Critical path computation**: `computeCriticalPath()` performs a topological sort of the dependency graph and returns the longest path — the sequence of agents that determines minimum completion time.

**Pruning**: Completed agents older than 1 hour are pruned to prevent unbounded memory growth.

### 10.3 BudgetTracker (`agents/budget-tracker.ts`)

Tracks per-agent and aggregate token budgets:

- **Per-agent records**: `AgentBudgetRecord` with allocated/spent/remaining tokens
- **Threshold warnings**: Emits events at 50%, 80%, and 95% usage
- **Aggregate summary**: `getBudgetSummary()` returns breakdown by workflow and agent type
- **Budget check**: `hasBudget(requiredAmount?)` checks if session budget allows more work

Default cost per token: `$0.000003` (used for USD estimation).

---

## 11. Persistence & Recovery

### 11.1 Types (`persistence/types.ts`)

**StateStore interface** — generic key-value store:
```typescript
interface StateStore {
  initialize(): Promise<void>;
  set(key: string, state: unknown): Promise<void>;
  get<T>(key: string): Promise<T | null>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  update<T>(key, updater: (current: T | null) => T): Promise<void>;
}
```

**CrashRecovery interface**:
```typescript
interface CrashRecovery {
  checkpoint(): Promise<void>;
  recover(): Promise<RecoveryResult>;
  needsRecovery(): Promise<boolean>;
}

interface RecoveryResult {
  recovered_workflows: number;
  recovered_agents: number;
  recovered_queue_items: number;
  replayed_events: number;
  data_loss: boolean;
  warnings: string[];
}
```

### 11.2 JsonStateStore (`persistence/state-store.ts`)

File-system implementation of the StateStore interface:
- **Storage**: One JSON file per key in `.goodvibes/state/` directory
- **Atomic writes**: Write to `{key}.tmp` then `rename()` to `{key}.json`
- **Key sanitization**: Keys map to filesystem paths (`/` → safe characters)
- **Auto-initialization**: Creates state directory on first use

### 11.3 SnapshotManager (`persistence/snapshot-manager.ts`)

Takes and restores point-in-time snapshots of engine state:

```typescript
interface RuntimeSnapshot {
  version: number;           // Schema version (1)
  timestamp: string;
  lastEventSequence: number; // For replay-after-snapshot
  workflows: WorkflowInstance[];
  agentWorkflowBindings: Record<string, string>;
  triggerState: TriggerStateSnapshot[];
}
```

**Periodic snapshots**: Every 60 seconds, the manager captures:
1. All workflow instances (via WorkflowEngine)
2. Agent-workflow bindings (via AgentWorkflowMap)
3. Trigger fire counts and last-fired timestamps (via TriggerRegistry)

**Restoration**: `restoreFromSnapshot()` replays the snapshot into the live subsystems:
- Workflows restored via `workflowEngine.restoreInstance()`
- Agent bindings restored via `agentWorkflowMap.restoreBindings()`
- Trigger state restored via `triggerRegistry.restoreState()`

### 11.4 Replay Engine (`persistence/replay-engine.ts`)

Replays events from the EventLog to reconstruct state:

```typescript
interface ReplayOptions {
  skipActions?: boolean;    // Don't execute trigger actions during replay
  afterSequence?: number;   // Only replay events after this sequence
  eventTypes?: string[];    // Filter to specific event types
}

interface ReplayResult {
  eventsReplayed: number;
  workflowsRestored: number;
  agentBindingsRestored: number;
  triggerCountsRestored: number;
  replayDurationMs: number;
  lastSequence: number;
  skippedEvents: number;
}
```

The replay engine processes events by type:
- `workflow:*` events → restore workflow instances
- `agent:*` events → restore agent bindings and budget snapshots
- `trigger:*` events → restore fire counts
- Other events → tracked for sequence numbering

### 11.5 Startup Recovery (`persistence/startup-recovery.ts`)

Orchestrates the recovery strategy on engine startup:

```
Recovery methods (tried in order):
  1. snapshot_plus_replay — Load snapshot, replay events after lastEventSequence
  2. full_replay          — No snapshot available, replay entire event log
  3. cold_start           — No snapshot or event log, start fresh
```

```typescript
type RecoveryMethod = 'snapshot_plus_replay' | 'full_replay' | 'cold_start';

interface RecoveryResult {
  method: RecoveryMethod;
  snapshot?: SnapshotRecoveryInfo;
  replay?: ReplayRecoveryInfo;
  recoveryDurationMs: number;
}
```

The recovery function `recoverState()`:
1. Attempts to load the most recent snapshot
2. If found: restore from snapshot, then replay events after `lastEventSequence`
3. If not found: attempt full replay of the event log
4. If no event log: cold start (no-op)
5. Returns detailed recovery result for logging

---

## 12. MCP Server

### 12.1 RuntimeEngineServer (`server/mcp-server.ts`)

The MCP server entry point that:
1. Creates an MCP `Server` instance with `SERVER_NAME = 'goodvibes-runtime-engine'`
2. Initializes the ProcessManager (which owns all subsystems)
3. Registers `ListTools` and `CallTool` handlers
4. Connects via stdio transport (stdin/stdout)

**Startup flow**:
```
RuntimeEngineServer.start()
  → processManager.startup()  // Initialize all subsystems
  → server.connect(transport) // Start accepting MCP requests
```

**Shutdown flow**:
```
RuntimeEngineServer.stop()
  → processManager.shutdown()  // Graceful shutdown of all subsystems
  → server.close()            // Close MCP transport
```

### 12.2 Tool Handlers (`server/handlers/`, 10+ files)

Seven registered MCP tools:

| Tool | Handler | Purpose |
|------|---------|---------|
| `runtime_status` | `handleRuntimeStatus` | Health check, metrics, feature flags |
| `runtime_config` | `handleRuntimeConfig` | Get/set/reload configuration |
| `runtime_events` | `handleRuntimeEvents` | Query event history and directives |
| `runtime_emit` | `handleRuntimeEmit` | Emit custom events |
| `runtime_workflow` | `handleRuntimeWorkflow` | Create/inspect/cancel workflows |
| `runtime_triggers` | `handleRuntimeTriggers` | List/register/modify triggers |
| `runtime_agents` | `handleRuntimeAgents` | Agent lifecycle management |

Each tool follows the pattern:
```typescript
type ToolHandler = (
  args: Record<string, unknown>,
  context: HandlerContext,
) => Promise<RuntimeResult>;
```

The `HandlerContext` provides access to all subsystems (ProcessManager, EventBus, WorkflowEngine, etc.).

All tools return `RuntimeResult<T>`:
```typescript
interface RuntimeResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta: {
    engine: 'runtime-engine';
    version: string;
    uptime_ms: number;
    execution_ms: number;
  };
}
```

---

## 13. Event Flow Walkthrough

### End-to-end trace: Engineer agent completes → WRFC review cycle

This traces what happens when a Claude Code agent finishes its work and the WRFC quality loop kicks in.

```
Step 1: Claude Code's SubagentStop hook fires
  ↓
  Hook script sends IPC message:
  {
    type: 'hook_event',
    hook_name: 'agent:completed',
    hook_input: {
      agent_id: 'agent_123',
      agent_type: 'goodvibes:engineer',
      last_assistant_message: '...<gv>{"files":["src/auth.ts"],"score":null,...}</gv>'
    }
  }

Step 2: IPCRouter.route() receives the message
  ↓
  Creates RuntimeEvent:
    type: 'hook:agent:completed'
    source: { kind: 'hook', hook_name: 'agent:completed' }
    payload: { type: 'hook:agent:completed', data: { ...hook_input } }
  ↓
  Emits on EventBus (async notification)
  ↓
  Awaits triggerRegistry.evaluate(event)

Step 3: TriggerRegistry evaluates all 16 built-in triggers
  ↓
  Trigger #7 (builtin_wrfc_spawn_reviewer) matches:
    condition: { type: 'event', event_type: 'hook:agent:completed' }
    action: { type: 'invoke_handler', handler: 'wrfc_chain_next' }
  ↓
  Template resolution:
    args.hook_input.agent_id = '$event.payload.data.agent_id' → 'agent_123'
    args.hook_input.agent_type = '$event.payload.data.agent_type' → 'goodvibes:engineer'
  ↓
  Invokes registered handler: wrfc_chain_next(args)

Step 4: wrfc_chain_next handler executes
  ↓
  Looks up workflow via AgentWorkflowMap: agent_123 → wrfc_agent_123
  ↓
  Workflow state: WRITING (engineer was the writer)
  ↓
  Agent type 'goodvibes:engineer' NOT in auto-complete whitelist
  ↓
  WRITING branch: Spawn reviewer
  ↓
  Builds spawn directive:
    <gv>{"action":"spawn","wid":"wrfc_agent_123","type":"reviewer","task":"Review the work..."}</gv>
  ↓
  directiveQueue.enqueue('subagent_stop', {
    type: 'inject_system_message',
    content: '<gv>{"action":"spawn",...}</gv>',
    priority: 20,
    source: 'wrfc_chain_next'
  })
  ↓
  agentWorkflowMap.addPendingBind('reviewer', 'wrfc_agent_123')
  agentWorkflowMap.addPendingBind('goodvibes:reviewer', 'wrfc_agent_123')
  ↓
  Advances workflow: WRITING → REVIEWING
    via sendEvent('wrfc_agent_123', { type: 'wrfc:review_started' })

Step 5: Hook script sends follow-up query
  ↓
  { type: 'query', query: { kind: 'get_directives' } }
  ↓
  IPCRouter drains directive queue for 'subagent_stop' target
  ↓
  Returns: { message: '<gv>{"action":"spawn",...}</gv>', directives: [...] }

Step 6: Hook script returns hookSpecificOutput to Claude Code
  ↓
  Claude Code's orchestrator parses <gv> tag
  ↓
  Spawns reviewer agent with workflow_id context

Step 7: SubagentStart fires for the new reviewer
  ↓
  Hook script queries: resolve_pending_bind('goodvibes:reviewer')
  ↓
  Runtime returns: { workflow_id: 'wrfc_agent_123' }
  ↓
  Hook sends hook_event with workflow_id in hook_input
  ↓
  Trigger #10 fires → wrfc_agent_spawned handler
  ↓
  Binds reviewer_456 → wrfc_agent_123 (existing workflow)

Step 8: Reviewer completes → wrfc_chain_next fires again
  ↓
  Workflow state: REVIEWING
  ↓
  Agent type 'goodvibes:reviewer' IS a reviewer
  ↓
  Extracts review score from <gv> tag: 9.8
  ↓
  handleReviewResult():
    min_review_score: 9.5 (from context)
    9.8 >= 9.5 → PASS
  ↓
  Enqueues complete directive:
    <gv>{"action":"complete","wid":"wrfc_agent_123"}</gv>
  ↓
  Unbinds reviewer from workflow map
  ↓
  Workflow transitions to COMPLETE (terminal)
```

---

## 14. Configuration

### 14.1 RuntimeConfig (`shared/config.ts`)

The configuration is loaded from `.goodvibes/state/runtime-config.json` and deep-merged with defaults.

```typescript
interface RuntimeConfig {
  ipc: IpcConfig;
  queue: QueueConfig;
  persistence: PersistenceConfig;
  workflows: WorkflowsConfig;
  triggers: TriggersConfig;
  health: HealthConfig;
  features: FeaturesConfig;
  agents: AgentsConfig;
  executor: ExecutorConfig;
}
```

### 14.2 Config Sections

**IPC Config**:
```typescript
{
  socket_path: '.goodvibes/state/runtime.socket',
  max_connections: 10,
  message_timeout_ms: 5000,
}
```

**Queue Config**:
```typescript
{
  max_size: 10000,
  max_depth: 1000,           // Backpressure threshold
  dedup_ttl_ms: 60000,       // Dedup window
  processing_interval_ms: 100,
}
```

**Persistence Config**:
```typescript
{
  state_dir: '.goodvibes/state',
  snapshot_interval_ms: 60000,
  max_event_log_size_bytes: 10485760, // 10 MB
  compaction_threshold: 0.5,
}
```

**Workflows Config**:
```typescript
{
  max_active: 10,
  max_transitions: 50,  // Global safety limit
}
```

**Triggers Config**:
```typescript
{
  max_triggers: 100,
  evaluation_timeout_ms: 5000,
  max_chain_depth: 10,
}
```

**Health Config**:
```typescript
{
  memory_warn_mb: 256,
  memory_fail_mb: 512,
  check_interval_ms: 30000,
}
```

**Features Config** (feature flags):
```typescript
{
  ipc_enabled: true,
  workflows_enabled: true,
  triggers_enabled: true,
  agents_enabled: true,
  persistence_enabled: true,
  time_plugin_enabled: false,
  external_plugin_enabled: false,
}
```

**Agents Config**:
```typescript
{
  max_concurrent: 6,
  default_budget: 200000,     // tokens
  session_budget: 0,          // 0 = unlimited
  budget_warning_threshold: 0.8,
  cost_per_token: 0.000003,
}
```

**Executor Config**:
```typescript
{
  mode: 'engaged',  // 'engaged' | 'daemon' | 'hybrid'
  daemon: {
    tick_interval_ms: 60000,
    clear_context: true,
    min_events_per_tick: 1,
  },
  budget: {
    daily_limit_usd: 0,     // 0 = unlimited
    total_limit_usd: 0,     // 0 = unlimited
    warn_threshold: 0.8,
  },
}
```

### 14.3 Config Loading

`loadConfig(projectRoot)`:
1. Reads `.goodvibes/state/runtime-config.json`
2. Deep-merges with `DEFAULT_CONFIG`
3. Returns merged config

`saveConfig(projectRoot, config)`:
1. Writes to `.goodvibes/state/runtime-config.json.tmp`
2. Renames to `.goodvibes/state/runtime-config.json`
3. Atomic — either fully written or unchanged

---

## 15. Testing Strategy

The engine has approximately 1,853 tests organized by module:

```
Test file locations:
  src/core/__tests__/            — Core layer tests
  src/events/__tests__/          — Event system tests
  src/workflow/__tests__/        — Workflow engine tests
  src/directives/__tests__/      — Directive system tests
  src/plugins/__tests__/         — Plugin tests
  src/server/handlers/__tests__/ — MCP tool handler tests
```

Key test files:
- `workflow-engine.test.ts` — State machine transitions, guard evaluation, action execution
- `directive-queue.test.ts` — Queue operations, capacity limits, WRFC config storage
- `wrfc-handlers.test.ts` — Full WRFC chain orchestration (spawn, review, fix, escalate)
- `agent-workflow-map.test.ts` — Binding lifecycle, pending binds, TTL expiry
- `wrfc-plugin.test.ts` — Plugin registration, score evaluation
- `hooks-plugin.test.ts` — Hook processing, response merging
- `time-plugin.test.ts` — Heartbeat, scheduling
- `external-plugin.test.ts` — File watching, HTTP listener, normalizers
- `events-directives.test.ts` — Event query and directive integration

Testing approach:
- **Unit tests**: Each module tested in isolation with mock dependencies
- **Integration tests**: Multi-subsystem tests verifying event flow end-to-end
- **State machine tests**: Exhaustive transition coverage for all 4 workflow definitions
- **Edge cases**: Concurrent workflows, budget exhaustion, timeout handling, crash recovery

---

## 16. Design Decisions

### Decision 1: Three-Layer Architecture

**What**: Separate generic event loop (Core), typed events/triggers (Extensions), and domain plugins.

**Why**: Layer 1 can be reused for non-WRFC workflows. Layer 2 types prevent runtime type errors. Layer 3 plugins can be enabled/disabled independently. This mirrors the extension model of many event-driven systems (VS Code, webpack).

**Tradeoff**: More files and indirection than a monolithic design, but pays off in testability and modularity.

### Decision 2: Agent-to-Workflow Binding Map

**What**: Use an explicit `AgentWorkflowMap` (agent_id → workflow_id) instead of "find most recent active workflow."

**Why**: When multiple WRFC chains run concurrently, the "most recent" heuristic routes events to the wrong workflow. The explicit map ensures deterministic routing.

**Implementation**: Binding on spawn, lookup on completion, unbind on resolution. Pending bind queue solves the timing gap.

### Decision 3: Auto-Complete Whitelist

**What**: Non-work agent types (Explore, Plan, Bash, reviewer) skip the WRFC review cycle.

**Why**: These agents don't produce reviewable code output. Reviewing them wastes tokens and creates spurious review cycles. Reviewers auto-complete their own WRFC workflow because they drive the parent workflow's review phase.

**Safety net**: If unsure whether an agent type should be on the whitelist, err toward review (false negatives are harmless; false positives are dangerous).

### Decision 4: Structured `<gv>` Tag Protocol

**What**: Agent output includes `<gv>{"score":9.5,"files":["src/auth.ts"]}</gv>` tags that the orchestrator and runtime parse mechanically.

**Why**: Regex-based score parsing (`SCORE: 9.5/10`) is fragile and locale-dependent. JSON tags are unambiguous and extensible. The runtime extracts score/files/pass/count; the orchestrator extracts action/wid/type/task.

**Backward compatibility**: `extractReviewScore()` falls back to the legacy regex when no `<gv>` tag is found.

### Decision 5: Newline-Delimited JSON IPC

**What**: Unix domain sockets with `\n`-delimited JSON messages.

**Why**: Simpler than HTTP, lower latency than file-based IPC, natively supported in Node.js. The `\n` delimiter allows streaming multiple messages over a single connection. File-based fallback exists for environments without socket support.

### Decision 6: Synchronous Trigger Evaluation in IPC

**What**: When a hook event arrives via IPC, trigger evaluation is `await`ed before returning the response.

**Why**: The hook script's next IPC call is typically `get_directives`. If triggers are evaluated asynchronously, directives haven't been enqueued yet when the query arrives. The synchronous `await` ensures directives are ready.

**Tradeoff**: Slight increase in hook response latency, but eliminates race conditions in the directive delivery pipeline.

### Decision 7: DirectiveQueue Stores WRFC Config (SRP Violation)

**What**: WRFC configuration (min_review_score, max_fix_attempts) is stored inside the DirectiveQueue.

**Why**: Pragmatic v1 choice to avoid a separate config-store module. The config arrives via the `config:loaded` hook event and needs to be accessible to WRFC handlers that receive the DirectiveQueue as a dependency.

**Acknowledged debt**: Code comments explicitly call this out as a v2 extraction target.

### Decision 8: Per-Session Trigger Fire Count Reset

**What**: `triggerRegistry.resetAllFireCounts()` is called on every `session:started` event.

**Why**: Trigger budgets (max_fires) should be per-session, not per-engine-lifetime. A trigger that fires 5 times in session A should have a fresh budget for session B. Without reset, the engine would need to be restarted to recover fire budgets.

### Decision 9: Atomic File Persistence

**What**: All file writes use `writeFileSync(tmpPath)` + `renameSync(tmpPath, finalPath)`.

**Why**: If the process crashes during a write, the file is either:
- The old version (rename didn't happen yet)
- The new version (rename is atomic on POSIX)
It is never a partially-written corrupt file.

### Decision 10: Structured JSON Logging to stderr

**What**: All log output goes to stderr as JSON objects, never to stdout.

**Why**: The MCP protocol uses stdout for JSON-RPC communication. Any non-JSON output on stdout corrupts the transport. stderr is the safe channel for diagnostic output, and JSON format enables structured log aggregation.

---

## Appendix A: File Reference

| File | Purpose |
|------|---------|
| `core/types.ts` | Layer 1 interfaces and factories |
| `core/event-queue.ts` | Binary min-heap priority queue |
| `core/event-processor.ts` | Main event processing loop |
| `core/trigger-registry.ts` | Generic trigger matching engine |
| `core/state-store.ts` | In-memory state with JSON persistence |
| `core/lifecycle.ts` | Engine state machine |
| `core/metrics.ts` | Rolling window metrics |
| `core/dead-letter.ts` | Dead letter queue |
| `core/error-handler.ts` | Retry and dead-letter routing |
| `events/types.ts` | ~80 event types, discriminated unions |
| `events/event-bus.ts` | Pub-sub with pattern matching |
| `events/event-queue.ts` | Priority-bucketed event queue |
| `events/event-log.ts` | Persistent append-only event log |
| `workflow/types.ts` | Workflow type system |
| `workflow/workflow-engine.ts` | State machine engine |
| `workflow/definitions/wrfc-loop.ts` | WRFC workflow definition |
| `workflow/definitions/fix-loop.ts` | Fix loop definition |
| `workflow/definitions/test-then-fix.ts` | Test-then-fix definition |
| `workflow/definitions/review-only.ts` | Review-only definition |
| `workflow/definitions/chain-types.ts` | Chain type constants |
| `workflow/definitions/custom-loader.ts` | Custom workflow loading/validation |
| `directives/directive-queue.ts` | FIFO directive queue |
| `directives/directive-builder.ts` | `<gv>` tag directive builders |
| `directives/gv-tag-parser.ts` | `<gv>` tag parser |
| `directives/wrfc-handlers.ts` | WRFC chain orchestration handlers |
| `directives/agent-workflow-map.ts` | Agent-workflow binding map |
| `directives/review-only-handlers.ts` | Review-only handlers |
| `directives/test-fix-handlers.ts` | Test-then-fix handlers |
| `agents/types.ts` | Agent coordination types |
| `agents/agent-coordinator.ts` | Agent lifecycle management |
| `agents/budget-tracker.ts` | Token budget tracking |
| `ipc/protocol.ts` | IPC message types |
| `ipc/ipc-router.ts` | Message routing |
| `ipc/ipc-server.ts` | Unix socket server |
| `ipc/client.ts` | Client library |
| `ipc/file-fallback.ts` | File-based IPC fallback |
| `lifecycle/process-manager.ts` | Central orchestrator |
| `lifecycle/executor-mode.ts` | Engaged/daemon/hybrid modes |
| `lifecycle/executor-budget.ts` | Spending tracking |
| `lifecycle/daemon-tick-handler.ts` | Daemon mode tick processing |
| `lifecycle/context-clearer.ts` | Tmux context clearing |
| `lifecycle/health.ts` | Health checking |
| `lifecycle/signals.ts` | OS signal handling |
| `persistence/types.ts` | Persistence interfaces |
| `persistence/state-store.ts` | JSON file state store |
| `persistence/snapshot-manager.ts` | Snapshot capture/restore |
| `persistence/replay-engine.ts` | Event log replay |
| `persistence/startup-recovery.ts` | Crash recovery orchestration |
| `plugins/wrfc/wrfc-plugin.ts` | WRFC quality loop plugin |
| `plugins/hooks/hook-processor.ts` | Hook event processing |
| `plugins/time/time-plugin.ts` | Time-based events |
| `plugins/external/external-plugin.ts` | External event bridge |
| `server/mcp-server.ts` | MCP server entry point |
| `server/handlers/index.ts` | Handler registry |
| `shared/config.ts` | Configuration loading |
| `shared/logger.ts` | Structured JSON logger |
| `shared/utils.ts` | Utility functions |
| `shared/constants.ts` | Engine version |
| `types.ts` | Public API types |
| `index.ts` | Public entry point |

## Appendix B: Built-in Triggers Reference

| # | ID | Event | Action | Cooldown | Max Fires |
|---|-----|-------|--------|----------|-----------|
| 1 | `builtin_auto_fix_build` | `build:failed` (threshold: 2 in 60s) | Start `fix_loop` | 120s | 5 |
| 2 | `builtin_auto_fix_test` | `agent:completed` → `test:failed` (sequence) | Start `fix_loop` | 120s | 5 |
| 3 | `builtin_budget_warning` | `agent:progress` | Emit `agent:budget_warning` | 30s | 20 |
| 4 | `builtin_sequential_spawn_alert` | `agent:spawned` (threshold: 3 in 30s) | Emit `system:error` | 60s | 10 |
| 5 | `builtin_devserver_recovery` | `devserver:error` | Invoke `restartDevServer` | 30s | 10 |
| 6 | `builtin_wrfc_auto_review` | `wrfc:writing_started` → `agent:completed` (sequence) | Send `wrfc:review_started` | 60s | 20 |
| 7 | `builtin_wrfc_spawn_reviewer` | `hook:agent:completed` | Invoke `wrfc_chain_next` | 5s | 500 |
| 8 | `builtin_wrfc_spawn_fixer` | `wrfc:review_completed` | Invoke `wrfc_review_response` | 5s | 500 |
| 9 | `builtin_wrfc_fix_review_loop` | `wrfc:fix_completed` | Invoke `wrfc_fix_response` | 5s | 500 |
| 10 | `builtin_wrfc_start_workflow` | `hook:agent:spawned` | Invoke `wrfc_agent_spawned` | 5s | 500 |
| 11 | `builtin_test_fix_start` | `test:failed` | Start `test_then_fix` | 60s | 10 |
| 12 | `builtin_test_fix_agent_completed` | `hook:agent:completed` | Invoke `test_fix_agent_completed` | 5s | 50 |
| 13 | `builtin_review_only_start` | `review:requested` | Start `review_only` | 60s | 20 |
| 14 | `builtin_test_fix_handle_failure` | `test_fix:tests_failed` | Invoke `test_fix_handle_failure` | 5s | 50 |
| 15 | `builtin_test_fix_handle_retest` | `test_fix:fix_completed` | Invoke `test_fix_handle_retest` | 5s | 50 |
| 16 | `builtin_review_only_agent_completed` | `hook:agent:completed` | Invoke `review_only_agent_completed` | 5s | 50 |
