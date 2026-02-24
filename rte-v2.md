# Runtime Engine v2 Vision

## Date: 2026-02-23
## Status: Planning — v1 WRFC complete, scoping v2

---

## V1 Recap — What Shipped

The runtime engine runs as MCP server #6 with full WRFC chain automation:

| Component | What It Does |
|-----------|-------------|
| EventBus | Pub/sub with pattern matching, dead letter queue |
| EventQueue | Bounded in-memory queue with overflow protection |
| EventLog | Append-only `events.jsonl` via async WriteStream |
| TriggerRegistry | 10 built-in triggers, condition evaluation, cooldowns |
| ActionExecutor | emit_event, invoke_handler, spawn_agent, start_workflow, composite |
| WorkflowEngine | State machine definitions, guard expressions, on_enter actions |
| DirectiveQueue | FIFO per hook-type, drain-on-read for system message injection |
| AgentWorkflowMap | In-memory agent_id → workflow_id binding |
| AgentCoordinator | Concurrent chain tracking, auto-complete whitelist |
| IPC Server | Unix domain socket, schema validation, 1MB message limit |
| WRFC Handlers | wrfc_chain_next, wrfc_review_response, wrfc_fix_response, wrfc_agent_spawned |
| GV Tag Parser | Structured `<gv>` JSON extraction from agent output |
| 7 MCP Tools | runtime_status, runtime_config, runtime_events, runtime_emit, runtime_workflow, runtime_triggers, runtime_agents |

**WRFC State Machine**: IDLE → GATHERING → PLANNING → WRITING → REVIEWING ↔ FIXING → COMPLETE / ESCALATED

**Key v1 design decisions** (see WRFC-CHAIN-DESIGN.md):
- Workflow ID: `wrfc_{agent_id}` (deterministic, no coordination)
- Agents have zero WRFC awareness — all intelligence in runtime + directive protocol
- `<gv>` structured JSON tags for agent output (score, files, pass, count)
- Review everything by default, auto-complete only for whitelisted non-work agents
- Orchestrator system prompt is directive-driven (spawn/complete/escalate)

---

## Core Concept

General-purpose event-driven automation engine where WRFC is just one pattern that emerges.

**Event Sources → Event Queue → Processing → Execution → State**

Uncover and enable automation in areas we haven't even thought about yet.

---

## V2 Scope

### Tier 1: Chain Types (Deferred from V1)

Non-WRFC chains using the existing workflow engine + handler pattern.

| Chain | States | Trigger |
|-------|--------|---------|
| **Fix Loop** | IDLE → FIXING → VERIFYING → COMPLETE/ESCALATED | `build:failed` or `test:failed` (triggers 1-2 exist, need workflow definition + handlers) |
| **Test-then-Fix** | IDLE → TESTING → FIXING → RE-TESTING → COMPLETE | Agent completes → run tests → fix if failed |
| **Review-Only** | IDLE → REVIEWING → COMPLETE | Review without fix cycle, informational scoring |
| **Custom** | User-defined via `goodvibes.json` workflow definitions | Configurable per project |

**Implementation pattern** (same as WRFC):
1. Add workflow definition to `src/workflow/definitions/`
2. Add handlers to `src/directives/` or extend existing
3. Add/enable triggers in `builtins.ts`
4. Events flow through existing infrastructure

**Prerequisite**: Build/test monitoring hooks that emit `build:failed`, `test:failed` events. Currently nothing emits these.

### Tier 2: Durability

v1 is entirely ephemeral — everything lost on restart.

| Feature | What | Why |
|---------|------|-----|
| **Event Replay** | Reconstruct state from `events.jsonl` on startup | Crash recovery without separate persistence |
| **State Snapshots** | Periodic JSON snapshot of workflows, mappings, trigger counts | Fast startup without full replay |
| **Checkpoint Recovery** | Resume interrupted WRFC chains after restart | Don't lose work mid-review |

**Approach**: Event sourcing. `events.jsonl` is already the append-only log. Add a replay engine that re-processes events through TriggerRegistry + WorkflowEngine on startup, skipping action execution (side effects already happened). State snapshots for performance — replay only events after last snapshot.

**Storage options**:
- JSON state files in `.goodvibes/runtime/` (simplest, current pattern)
- SQLite (if query patterns emerge)
- Event sourcing pure (rebuild everything from events.jsonl)

Recommendation: JSON snapshots + event replay for delta. SQLite only if we need queries.

### Tier 3: External Event Sources

| Source | Mechanism | Use Cases |
|--------|-----------|----------|
| **Webhooks** | HTTP endpoint → RuntimeEvent | GitHub PR events, CI/CD notifications, deployment status |
| **Scheduler** | Cron/timer → RuntimeEvent | Periodic health checks, scheduled builds, reminder events |
| **File Watcher** | FS events → RuntimeEvent | Hot reload triggers, config change detection |
| **Agent-to-Agent** | Agent emits event → triggers another agent | Parallel pipeline stages, fan-out/fan-in |

**Webhook ingestion**:
- Lightweight HTTP server (or extend IPC server with HTTP)
- Auth: API keys, webhook signatures (GitHub HMAC)
- Payload mapping: configurable template `external_format → RuntimeEvent`
- Rate limiting (reuse rate limiter if built)

**Scheduler**:
- Cron expression parser → generate events at intervals
- One-shot timers: `"fire event X in 30 seconds"`
- Recurring: `"emit health:check every 5 minutes"`
- Implementation: `setInterval` + cron library, events into EventBus

**Agent-to-Agent**:
- Agent output contains `<gv>` tag with `{"emit": "custom:event", "data": {...}}`
- Runtime parses agent output, emits the event
- Another trigger picks it up, spawns a different agent
- Enables pipeline patterns without orchestrator involvement

### Tier 4: Observability & Control

| Feature | What |
|---------|------|
| **Dashboard** | Real-time view of events, workflows, triggers, agent chains |
| **Event stream** | SSE/WebSocket endpoint for live event monitoring |
| **Replay debugger** | Step through events.jsonl to debug chain behavior |
| **Manual intervention** | Pause/resume/cancel workflows via MCP tools |
| **Metrics** | Event throughput, chain completion rates, avg review scores |

---

## Architecture Assessment (Updated)

v1 is ~70% of the final architecture (up from initial 60% estimate).

**What's solid**:
- EventBus + TriggerRegistry + ActionExecutor core loop
- WorkflowEngine state machine with guard expressions
- DirectiveQueue → hook → system message injection pattern
- Agent-agnostic design (agents don't know about the engine)
- `<gv>` structured protocol for both directions
- IPC with schema validation and size limits

**What needs work**:
- **Ephemeral** — everything lost on restart (Tier 2)
- **Hook-only** — no external event sources (Tier 3)
- **Single workflow type** — only WRFC, need fix/test/custom (Tier 1)
- **No monitoring** — events flow but nobody watches (Tier 4)

---

## Principles

1. Everything is an event
2. Events are immutable and append-only
3. Triggers are declarative (condition → action)
4. State is derived from events (event sourcing)
5. Agents are execution units — they don't know about the engine
6. The engine is the brain — agents are the hands
7. New chain types are just new workflow definitions + handlers (same infrastructure)
8. Backward compatibility — v1 WRFC must keep working through all v2 changes

---

## Implementation Order (Recommended)

1. **Tier 1** — Chain types. Lowest risk, reuses all existing infra. Validates the "WRFC is just one pattern" thesis.
2. **Tier 2** — Durability. Event replay + snapshots. Required before any production-grade usage.
3. **Tier 3** — External sources. Webhooks first (most useful), then scheduler, then agent-to-agent.
4. **Tier 4** — Observability. Dashboard + metrics. Nice to have, not blocking.

Tiers 1 and 2 can be parallelized. Tier 3 depends on Tier 2 (external events need durable state). Tier 4 is independent.
