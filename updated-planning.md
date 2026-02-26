# Runtime Engine v3 — The Event Loop

> Date: 2026-02-25 | Status: Vision & architecture document
> Predecessor: `rte-v3-plan.md` (hook processing refactor — now scoped as implementation detail within Layer 3)

---

## Vision

From the outside, it looks like sentience — a system that acts on its own, makes decisions, seems alive. From the inside, it's inputs, queues, and a loop.

---

## Design Principles

1. **One queue.** Not two flows, not reactive vs proactive. Everything is an event entering a single queue. The queue doesn't care where the event came from.
2. **Broad and modular.** The core knows nothing about WRFC, agents, hooks, or any specific workflow. It's just events in, triggers match, actions out, state persists.
3. **Extensible through layers.** Base schemas define the contract. Specific types extend functionality. New capabilities plug in without touching the core.
4. **Configurable executor mode.** The session operates in one of two modes: **Engaged** (human present, context accumulates, interactive coding session) or **Daemon** (processing event queue, context clears after each batch, memory is the only persistence). Mode is set explicitly via config/command or inferred from event source.
5. **Infrastructure is context.** CLAUDE.md, output style, skills, MCP servers — they all load fresh every session. The runtime memory is only "what were we doing," not "how to work."

---

## Three-Layer Architecture

### Layer 1: Core

Completely generic. Knows nothing about WRFC, agents, hooks, or anything specific. Just events in, triggers match, actions out, state persists. This is the last thing you'd ever need to rewrite.

### Layer 2: Event Types & Trigger Types

Extensions of the base schemas. `HookEvent extends Event`, `TimeEvent extends Event`, `AgentEvent extends Event`. `WRFCTrigger extends Trigger`, `CronTrigger extends Trigger`, `WebhookTrigger extends Trigger`. Each adds its own fields and its own handler. Pluggable — you register them with the core, the core doesn't import them.

### Layer 3: Implementations

The actual business logic. WRFC orchestration, heartbeat checkers, webhook normalizers, agent coordinators. These are consumers of Layer 2. They create specific events, register specific triggers, handle specific actions.

WRFC becomes a plugin to the event system rather than a hardwired feature. You could rip it out entirely and the core still works. You could add a completely different workflow pattern — deployment pipeline, content publishing, monitoring — by registering new types and handlers at Layers 2 and 3. Zero changes to Layer 1.

```
┌─────────────────────────────────────────────────────┐
│  Layer 3: Implementations                           │
│  WRFC logic, heartbeat checker, webhook normalizer, │
│  agent coordinator, deployment pipeline, etc.       │
├─────────────────────────────────────────────────────┤
│  Layer 2: Event Types & Trigger Types               │
│  HookEvent, TimeEvent, AgentEvent, HumanEvent,      │
│  ExternalEvent, WRFCTrigger, CronTrigger, etc.      │
├─────────────────────────────────────────────────────┤
│  Layer 1: Core                                      │
│  Event, Trigger, Queue, Registry, State, Lifecycle  │
└─────────────────────────────────────────────────────┘
```

---

## Event Sources

Everything that happens is an event. Five sources:

| Source | Mechanism | Examples |
|--------|-----------|----------|
| **Time** | Heartbeats, crons, scheduled events | Default heartbeat on configured cadence, scheduled heartbeats spawned by triggers with TTL, one-shot delayed checks |
| **Humans** | Messages, approvals, commands | User prompt, slash command, approval/rejection, "stop" |
| **External systems** | Webhooks | GitHub PR opened, CI build failed, Stripe payment received, Slack message |
| **Internal state** | Hooks | Tool used, agent started/stopped, session compacted, context changed |
| **Agents** | Inter-agent events | "Review complete, score 8.8", "Need clarification on X", "Subtask finished" |

All five are just events. Different origins, same destination. The queue doesn't care.

---

## Core (Layer 1) — Complete Feature List

### Event System

- **Event schema** — id, source, type, payload, timestamp, priority, context chain
- **Event queue** — enqueue, drain, peek
- **Priority ordering** — higher priority processed first
- **Causal ordering** — events within the same workflow processed in sequence
- **Deduplication** — event ID-based idempotency at the queue level, configurable time window

### Trigger System

- **Trigger schema** — id, matcher, conditions, actions, circuit breakers
- **Trigger registry** — register, unregister, enable/disable, match
- **Event matching** — exact, glob, regex on event type; optional source filter
- **Condition evaluation** — state guards (field/op/value)
- **Action dispatch** — emit results back to the queue or to an executor

### Chaining

- **Parent event tracking** — parent_event_id on every event
- **Chain depth tracking** — how deep the current chain is
- **Circuit breakers** — max chain depth, max fires per trigger, cooldowns
- **Global queue depth limit** — backpressure, pause processing if queue overflows

### Error Handling

- **Handler failure contract** — retry, dead-letter, escalate
- **Dead-letter queue** — failed events stored for inspection/replay
- **Retry policy** — configurable per-trigger (max attempts, backoff)
- **Error events** — handler failures become events themselves (Layer 2/3 can react)

### Concurrency

- **Processing model** — parallel by default across workflows, serial within a workflow. Events in different workflows can't interfere with each other — different state, different triggers, different chains. The workflow boundary is the natural isolation boundary. No complex dependency graphs or shared-state locking needed.
- **Isolation** — parallel handlers don't share mutable state. Each handler receives a snapshot or scoped view of state, never a shared reference. Writes are reconciled after handler completion.
- **Locking contract** — workflow-level locks prevent concurrent mutation of same workflow. Two events in the same workflow are always serialized. This is the minimum guarantee that prevents state corruption without requiring full global serialization.
- **Session vs agents** — the session is the dispatcher, agents are the workers. The session processes events from the queue, produces "spawn agent" actions, and agents run concurrently as background subagents. Six agents running in parallel, one session, one queue. Parallelism comes from the workers, not the queue.
- **Global events** (no workflow context) — events like heartbeats are stateless scanners. They read state, evaluate conditions, and emit new events. The emitted events carry workflow context and go through the normal locking path. Heartbeats themselves don't need locks — they don't mutate state, they just produce events that do.

### Idempotency

- **Event deduplication** — by event ID, within a configurable time window
- **At-least-once delivery** — handlers must tolerate replays

### State

- **State persistence interface** — read/write contract (core defines interface, Layer 2/3 provides implementation)
- **State snapshots** — periodic or on-demand
- **State access in conditions** — triggers can gate on current state

### Lifecycle

- **Start** — begin processing
- **Pause** — stop processing, keep accepting events
- **Resume** — continue processing from where paused
- **Drain** — process all remaining events, then stop
- **Shutdown** — graceful stop, persist state, clean up

### Observability

- **Metrics hooks** — event count, queue depth, processing latency, handler execution time
- **Event log** — append-only record of all processed events
- **Chain tracing** — reconstruct full causal chain from any event

### Filtering / Backpressure

- **Priority floor** — skip low-priority events during high load
- **Rate limiting** — max events processed per unit time
- **Queue depth alerts** — emit warning event when queue exceeds threshold

---

## Core Interfaces

### Event Schema (Base)

```typescript
interface RuntimeEvent {
  id: string;
  source: 'time' | 'human' | 'external' | 'internal' | 'agent';
  type: string;                // Namespaced (e.g., 'hook:subagent_stop', 'cron:review_prs')
  payload: unknown;
  timestamp: number;
  priority: number;            // Higher = processed sooner
  context?: {
    workflow_id?: string;
    agent_id?: string;
    parent_event_id?: string;  // Causal chain
    chain_depth?: number;
  };
}
```

### Trigger Schema (Base)

```typescript
interface Trigger {
  id: string;
  event_match: EventMatcher;
  conditions?: Condition[];
  actions: Action[];
  max_fires?: number;
  cooldown_ms?: number;
  chain_depth_limit?: number;
  retry?: RetryPolicy;
  enabled: boolean;
}

interface EventMatcher {
  source?: EventSource | EventSource[];
  type: string | RegExp;
  payload_match?: Record<string, unknown>;
}

interface Condition {
  field: string;    // State path (e.g., 'workflow.state', 'review.score')
  op: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'exists';
  value: unknown;
}

interface Action {
  type: 'spawn_agent' | 'emit_event' | 'send_message' | 'schedule'
      | 'update_state' | 'update_memory' | 'block' | 'notify_human';
  params: Record<string, unknown>;
}

interface RetryPolicy {
  max_attempts: number;
  backoff: 'fixed' | 'exponential';
  delay_ms: number;
}
```

### Queue Interface

```typescript
interface EventQueue {
  enqueue(event: RuntimeEvent): void;
  drain(): RuntimeEvent[];           // Returns events sorted by priority
  peek(): RuntimeEvent | null;
  depth(): number;
  deduplicate(event: RuntimeEvent): boolean;  // Returns true if duplicate
  cancel(event_id: string): boolean;          // Remove a scheduled/pending event before it fires
  cancelByRef(ref: string): number;           // Cancel all events matching a reference tag, returns count removed
}
```

### Lifecycle Interface

```typescript
interface LoopLifecycle {
  start(): void;
  pause(): void;     // Stop processing, keep accepting
  resume(): void;
  drain(): Promise<void>;   // Process all, then stop
  shutdown(): Promise<void>; // Graceful stop, persist, clean up
  status(): 'running' | 'paused' | 'draining' | 'stopped';
}
```

### State Interface

```typescript
interface StateStore {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
  snapshot(): Record<string, unknown>;
  restore(snapshot: Record<string, unknown>): void;
}
```

### Observability Interface

```typescript
interface Metrics {
  onEventProcessed(event: RuntimeEvent, duration_ms: number): void;
  onHandlerError(trigger_id: string, error: Error, event: RuntimeEvent): void;
  onQueueDepthChange(depth: number): void;
  getStats(): {
    events_processed: number;
    events_failed: number;
    avg_latency_ms: number;
    queue_depth: number;
    active_chains: number;
  };
}
```

---

## Trigger Taxonomy (Layer 2)

### Time Triggers (`tick:*`, `cron:*`, `schedule:*`)

Three kinds of time events:

- **Default heartbeat** — configured cadence (30s, 60s, etc.), always ticking, never stops. The system's clock.
- **Scheduled heartbeats** — spawned by triggers, have a TTL or max-fires, run at their own cadence, expire when done. Example: "build deployed, check CI every 10s for 5 minutes."
- **One-shot scheduled events** — fire once at a delay and disappear. Example: "check this in 60 seconds."

All three enter the same queue as time events. The default heartbeat is just a scheduled heartbeat with no expiry. Triggers can schedule additional heartbeats or one-shots dynamically.

| Trigger | Event Match | Condition | Action |
|---------|------------|-----------|--------|
| `heartbeat_check_agents` | `tick:heartbeat` | sleeping agents exist | wake agents with pending work |
| `heartbeat_stale_cleanup` | `tick:heartbeat` | workflow idle > 1hr | close workflow, notify human |
| `heartbeat_build_monitor` | `tick:heartbeat` | active build pending | check CI status |
| `cron_daily_pr_review` | `cron:daily_review` | watched repos have open PRs | spawn reviewer agents |
| `scheduled_agent_wake` | `schedule:agent_wake` | agent has memory | spawn agent with memory injected |

### Human Triggers (`human:*`)

| Trigger | Event Match | Condition | Action |
|---------|------------|-----------|--------|
| `human_prompt` | `human:prompt` | — | parse intent, emit task event |
| `human_approval` | `human:approval` | workflow waiting for approval | unblock workflow, continue chain |
| `human_rejection` | `human:rejection` | workflow waiting for approval | halt workflow, notify agents |
| `human_stop` | `human:stop` | active workflows exist | preempt queue, halt all active work |
| `human_command` | `human:command` | — | route to command handler |

**Priority**: Human events are highest priority. `human:stop` preempts everything.

### External Triggers (`webhook:*`)

| Trigger | Event Match | Condition | Action |
|---------|------------|-----------|--------|
| `github_pr_opened` | `webhook:github:pr_opened` | repo in watched list | spawn reviewer agent |
| `github_pr_review` | `webhook:github:pr_review_requested` | — | spawn reviewer agent |
| `ci_build_failed` | `webhook:ci:build_failed` | — | spawn debugger agent |
| `ci_build_passed` | `webhook:ci:build_passed` | workflow waiting on build | advance workflow |
| `slack_message` | `webhook:slack:message` | mentions bot | parse and route |

**Normalization**: Raw webhook payloads are normalized to `RuntimeEvent` by source-specific adapters before entering the queue.

### Internal Triggers (`hook:*`)

| Trigger | Event Match | Condition | Action |
|---------|------------|-----------|--------|
| `tool_blocked` | `hook:pre_tool_use` | tool in blocked set | deny with alternative |
| `directive_delivery` | `hook:pre_tool_use` | directives pending | inject via additionalContext |
| `agent_registered` | `hook:subagent_start` | — | register agent, inject WRFC binding |
| `agent_completed` | `hook:subagent_stop` | — | evaluate result, advance workflow |
| `quality_gate` | `hook:subagent_stop` | agent is reviewer, score < threshold | block agent, force continuation |
| `session_init` | `hook:session_start` | — | inject session context |
| `context_compacted` | `hook:pre_compact` | — | persist state for recovery |
| `state_recovery` | `hook:user_prompt_submit` | post-compaction state missing | re-inject runtime state |

### Agent Triggers (`agent:*`)

| Trigger | Event Match | Condition | Action |
|---------|------------|-----------|--------|
| `review_complete` | `agent:review_complete` | workflow in REVIEWING state | evaluate score, route to fix or complete |
| `fix_complete` | `agent:fix_complete` | workflow in FIXING state | spawn re-reviewer |
| `subtask_complete` | `agent:subtask_complete` | parent task exists | update parent, check if all subtasks done |
| `agent_blocked` | `agent:blocked` | — | escalate to human or retry |
| `agent_needs_input` | `agent:needs_input` | — | notify human, pause workflow |

---

## Event Chaining

Trigger handlers produce new events. Those events enter the queue. Other triggers match them. The chain continues. Events always go through the queue — no direct handler-to-handler calls. That's what keeps it debuggable and prevents infinite loops.

### Chain Example: Full WRFC Cycle

```
human:prompt "build a rate limiter"
  → agent:spawned (engineer)                    [source: internal]
    → agent:completed (engineer)                 [source: agent]
      → agent:spawned (reviewer)                 [source: internal]
        → agent:completed (reviewer, score: 8.8) [source: agent]
          → agent:spawned (fixer)                [source: internal]
            → agent:completed (fixer)            [source: agent]
              → agent:spawned (reviewer)         [source: internal]
                → agent:completed (reviewer, 9.9)[source: agent]
                  → workflow:complete            [source: internal]
                    → human:notify "Done. 9.9"   [source: agent]
```

Every arrow is an event entering the queue. Every event carries `parent_event_id`. The entire chain traces back to the human's original prompt.

### Chain Example: Cross-Source Cascade

```
human:prompt "deploy to staging"
  → agent:spawned (deployer)                    [source: internal]
    → agent:completed (deployer, pushed code)    [source: agent]
      → webhook:ci:build_started                 [source: external]
        → schedule:check_build (30s delay)       [source: time]
          → tick: check build status             [source: time]
            → webhook:ci:build_passed            [source: external]
              → agent:spawned (smoke-tester)     [source: internal]
                → agent:completed (tests pass)   [source: agent]
                  → human:notify "Staging live"  [source: agent]
```

Human → agent → external → time → external → agent → human. All five sources in one chain.

### Circuit Breakers

| Mechanism | Purpose |
|-----------|--------|
| `parent_event_id` chain | Track depth. If chain exceeds `chain_depth_limit`, halt and escalate. |
| `max_fires` per trigger | Prevent runaway triggers. WRFC fix loop limited to N iterations. |
| `cooldown_ms` | Debounce rapid-fire events. Heartbeat checks don't pile up. |
| **Global circuit breaker** | If queue depth exceeds threshold, pause processing and notify human. |
| **Cost budget** | If estimated token spend exceeds budget, pause and notify. Integrates with analytics engine. |

---

## Executor Architecture

### Executor Modes

The session operates in one of two modes:

| | Engaged Mode | Daemon Mode |
|---|---|---|
| **When** | Human is present, interactive coding session | Session exists to process event queue |
| **Context** | Accumulates naturally, acts as persistence | Clears after each event batch |
| **Memory injection** | At session start + on compaction recovery | Before every event batch |
| **Event sources** | Primarily `human:*`, with `internal:*` and `agent:*` events processed inline | Primarily `time:*`, `external:*`, `agent:*` | 
| **Tick mechanism** | None — human drives the session | System scheduler sends ticks (systemd timer, cron, launchd) |
| **Context clearing** | Never (unless explicit `/clear`) | After each event batch |

**Mode selection** (in priority order):
1. **Explicit** — config flag or slash command (e.g., `/daemon`, `/engaged`)
2. **Inferred** — if session was started by tmux cron tick, default to daemon. If started by human, default to engaged.
3. **Hybrid** — an engaged session can still process queued events between human interactions without clearing context.

### Daemon Mode Session

A Claude Code session running in a tmux pane. A system cron sends a tick:

The tick must be driven by a system scheduler (systemd timer, cron, launchd). OS-agnostic — the runtime doesn't care which scheduler, only that it arrives on time. `sleep`-based loops are not acceptable — they drift and compound error over time. System schedulers anchor to wall clock time.

```bash
# Example: systemd timer, cron, launchd, etc.
tmux send-keys -t claude-daemon "tick" Enter
```

On each tick:
1. UserPromptSubmit hook fires
2. Hook checks event queue via IPC
3. If events pending: runtime injects state from memory + actions via additionalContext
4. Claude executes actions (spawns agents, writes code, calls APIs)
5. Results written to runtime memory
6. Context cleared
7. Wait for next tick

### Engaged Mode Session

A normal Claude Code session. Human types, Claude responds. Runtime state is injected at session start and re-injected on compaction recovery. Events from hooks and agents are processed inline (via directives, as they work today). No clearing — the conversation context accumulates naturally.

The event queue still accepts events during an engaged session. Time events and external events queue up. They can be processed:
- Inline, if the trigger has `allow_engaged: true` (e.g., urgent notifications)
- Deferred, until the next daemon tick or until the human explicitly asks

### Why Both Modes Work

- CLAUDE.md, output style, skills, MCP servers — all load fresh every session. That's 100% of the "how to work" context.
- Runtime memory provides only "what were we doing" — tiny, structured, injected via additionalContext (daemon) or already in context (engaged).
- Full tool access in both modes — precision_engine, all MCP servers, all hooks already wired.
- No need to replicate Claude Code's environment in a headless daemon.

---

## Memory & Continuity

Already exists: `.goodvibes/memory/` — decisions, patterns, failures, preferences.

New addition for runtime state:

```typescript
// .goodvibes/memory/runtime-state.json
interface RuntimeState {
  active_workflows: WorkflowState[];
  pending_events: RuntimeEvent[];
  agent_bindings: AgentBinding[];
  scheduled_events: ScheduledEvent[];
  agent_memory: AgentMemory[];
}

interface AgentMemory {
  agent_type: string;
  workflow_id?: string;
  last_active: number;
  context: {
    task: string;
    progress: string;
    decisions: string[];
    artifacts: string[];
  };
  wake_instructions?: string;
}
```

Written on every state change. Read on every tick. One file, JSON, trivial.

---

## Trigger Definition: Code vs Config

Core triggers (WRFC, quality gates, agent lifecycle) defined in code — foundational, shouldn't be accidentally misconfigured.

User-defined triggers (webhook reactions, custom automations, project-specific crons) defined in config:

```yaml
# .goodvibes/triggers.yaml
triggers:
  - id: auto_review_prs
    event_match:
      source: external
      type: "webhook:github:pr_opened"
      payload_match:
        repo: "goodvibes-plugin"
    actions:
      - type: spawn_agent
        params:
          agent_type: "goodvibes:reviewer"
          task: "Review PR #{payload.pr.number}: {payload.pr.title}"
    enabled: true

  - id: daily_standup
    event_match:
      source: time
      type: "cron:daily_standup"
    actions:
      - type: notify_human
        params:
          message: "Active workflows: {state.active_workflows.length}"
    enabled: true
```

Code triggers registered in TriggerRegistry at startup. Config triggers loaded from YAML alongside them. Same registry, same evaluation, same execution.

---

## WRFC as a Layer 3 Plugin

WRFC is not part of the core. It's an implementation that registers event types, trigger types, and handlers:

**Event types (Layer 2)**:
- `WRFCEvent extends RuntimeEvent` — adds `workflow_id`, `score`, `review_dimensions`, `fix_issues`

**Trigger types (Layer 2)**:
- `WRFCTrigger extends Trigger` — adds `score_threshold`, `max_fix_attempts`, `workflow_state_filter`

**Implementation (Layer 3)**:
- WRFC handler: evaluates review scores, manages fix loops, quality gates
- Registers triggers for `agent:completed` events where agent is reviewer/fixer
- Creates/advances workflow state through the StateStore interface
- Uses `decision: "block"` via SubagentStop for quality gates

The existing WRFC logic doesn't change — score evaluation, fix loops, quality gates all work the same. It just gets repackaged as event handlers and trigger registrations instead of being wired directly into the runtime. If it breaks during the port, we know exactly what the correct behavior looks like.

---

## Constraints (Claude Code Reality)

| Constraint | Impact | Resolution |
|-----------|--------|------------|
| No persistent process | Can't run `while(true)` | System scheduler ticks the session. Externally driven loop. |
| Hook scripts are reactive | Fire only on Claude Code events | Time events come from cron, not hooks. |
| IPC is request/response | No persistent connections | Event queue is file-backed. Survives IPC disconnects. |
| SubagentStart can't block | Can only inject context | Fine — we inject WRFC binding, not block. |
| SubagentStop CAN block | `decision: "block"` prevents agent stop | Quality gates work. Key enabler. |
| PreCompact lacks additionalContext | Can't inject during compaction (unconfirmed) | UserPromptSubmit detects missing state, re-injects. |
| PreToolUse fires every tool call | Latency-sensitive | Sync fast-path for tool blocking, async IPC for directives. |
| Context window limits | Long sessions lose context | Stateless executor model — clear after each event batch. |

---

## Implementation Phases

| Phase | What | Scope |
|-------|------|-------|
| **1: Core** | Event, Trigger, Queue, Registry, State, Lifecycle, Observability, Error handling, Circuit breakers | Layer 1 — the foundation that never changes |
| **2: Type Extensions** | HookEvent, TimeEvent, AgentEvent, HumanEvent, ExternalEvent, WRFCTrigger, CronTrigger, WebhookTrigger | Layer 2 — pluggable extensions |
| **3: WRFC Port** | Repackage existing WRFC logic as Layer 3 plugin. Hook processing moved into event handlers. | Layer 3 — validates the architecture with a known-working workflow |
| **4: Time Events + Executor** | Heartbeats, crons, scheduled events. Dedicated Claude Code session with tmux tick. | Layer 3 — the system gains a pulse |
| **5: External Events** | Webhook ingestion, payload normalization, external system triggers. | Layer 3 — the system gains senses |

Phase 1 must come first. Phases 2-3 can overlap. Phase 4 follows once WRFC is ported. Phase 5 extends the system to external sources.

---

## Design Decisions

### 1. Tick Frequency

**Decision**: Default 60s, configurable. Layer 3 can schedule faster heartbeats for specific workflows (e.g., "check CI every 10s for 5 minutes").

### 2. Webhook Ingestion

**Decision**: All three methods, converging on the same queue.

- **File drop** (always on) — any process writes a JSON event file to a watched directory. The next tick picks it up. This is the base layer.
- **HTTP listener** (opt-in, controllable) — small Express server receives webhooks, normalizes payloads, writes event files to the same directory. Auto-start configurable. Can be started/stopped dynamically via `system:http_listener_start` and `system:http_listener_stop` events or triggers.
- **External services** (Zapier/n8n/IFTTT) — POST to the HTTP listener. No extra code needed.

All three paths converge on the file drop directory → queue. The HTTP listener is a Layer 3 service that registers itself with the core on startup.

### 3. Queue Storage

**Decision**: JSON file. Events shouldn't live long enough to warrant a database. If they are, something is broken in the processing loop. The queue will typically have single-digit depth. JSON is inspectable, version-controllable, trivial to debug, and matches the existing `.goodvibes/memory/` pattern. The StateStore interface allows a drop-in SQLite replacement if ever needed — but it shouldn't be.

### 4. Context Clearing

**Decision**: Mode-dependent with environment detection.

- **Engaged / Hybrid mode** — let compaction handle it naturally. No explicit clearing.
- **Daemon mode** — clear context between event batches:
  1. **Primary**: `tmux send-keys` to inject `/clear`. Detected automatically via `TMUX` env var.
  2. **Fallback**: If tmux isn't available (no `TMUX` env var, send-keys fails), inject `/clear` as a human event through the queue.
  
Environment detection happens at startup — no user configuration needed.

### 5. Cost Controls

**Decision**: Two-tier budget system.

- **Flat cap** (optional) — "spend no more than $50 total." Hard ceiling. Once hit, processing pauses until manually reset or budget is increased.
- **Daily cap** (optional) — "no more than $10/day." Soft guardrail. Prevents one runaway chain from eating the whole budget in an hour. Resets at midnight (configurable).
- If only one is set, use that. If both are set, whichever trips first pauses processing.
- A warning event fires at 80% of either threshold to give the human a heads-up.
- Integrates with the analytics engine for tracking.

### 6. Concurrency Model

**Decision**: Parallel from the start. The workflow-level lock is the isolation boundary — events in different workflows process concurrently, events in the same workflow serialize. The infrastructure supports parallel from day one even if early usage is mostly serial. The session dispatches, agents execute concurrently as background subagents.
