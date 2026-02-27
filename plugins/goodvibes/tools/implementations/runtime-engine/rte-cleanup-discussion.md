# Runtime Engine Source Reorganization — Discussion & Understanding

## Date: 2026-02-27

## The Problem

The runtime engine's `src/` directory has 127 source files across 14 directories. The codebase has a 3-layer architecture — `core/` (Layer 1), `extensions/` (Layer 2), `plugins/` (Layer 3) — plus `shared/` as Layer 0. But half the files aren't in the right layer. Five domain modules (`events/`, `workflow/`, `agents/`, `triggers/`, `directives/`) sit at the `src/` root instead of inside `extensions/`. Four infrastructure modules (`ipc/`, `server/`, `lifecycle/`, `persistence/`) also sit at root with mixed-layer contents.

The structure was built hastily and doesn't reflect clean, modular, extensible coding principles.

## The Architecture

### Layer Philosophy

Each layer builds on the one below. No layer reinvents what a lower layer provides. This ensures:
- **Atomicity** — primitives are small, focused, reusable
- **Layers build on layers** — extensions extend core, plugins extend extensions
- **Extensibility** — new capabilities are added by building on existing infrastructure, not by duplicating it

When someone can add a new capability by building on what extensions/ already provides, without touching core/ and without reimplementing infrastructure — that's when the architecture is working.

### Layer Definitions

**shared/ (Layer 0 — Foundation)**
- Cross-cutting utilities used by everything: config, logging, utils, constants
- Zero dependencies on any other layer
- Currently contains: config.ts, constants.ts, logger.ts, utils.ts
- `src/types.ts` (RuntimeResult, HealthCheck, HealthStatus) should also be here

**core/ (Layer 1 — Primitives)**
- Base primitives and interfaces. Generic building blocks with no domain awareness.
- Depends only on shared/
- Defines foundational types: RuntimeEvent base, Trigger base, Condition, Action, EventQueue interface, StateStore interface, etc.
- Provides: event queues, state stores, timers, file I/O, metrics, lifecycle state machines, error handling, retry, polling
- Everything here is generic — it doesn't know about WRFC, agents, workflows, or any domain concepts

**extensions/ (Layer 2 — Domain Logic)**
- Domain-specific implementations that EXTEND core's primitives
- Takes core's generic types and builds real functionality on top
- Currently contains only type extension factories (typed events, typed triggers)
- SHOULD also contain: event bus, event log, workflow engine, agent coordinator, trigger orchestration, directive processing — all the domain modules currently orphaned at src/ root
- Dependency direction: extensions/ → core/ → shared/

**plugins/ (Layer 3 — Features)**
- Self-contained feature modules that wire extensions together into complete capabilities
- Nothing depends on plugins — they are leaf nodes
- Currently contains: wrfc/ (quality loops), hooks/ (Claude Code hooks), time/ (heartbeat/scheduler), external/ (file watcher/HTTP listener)
- Dependency direction: plugins/ → extensions/ → core/ → shared/

### Target src/ Structure

```
src/
  shared/        Layer 0
  core/          Layer 1
  extensions/    Layer 2
  plugins/       Layer 3
  index.ts       Package entry point
  server.ts      Process entry point
```

That's it. Everything else currently at root needs to be decomposed and distributed into the correct layer.

## Current File Inventory (127 files)

### src/ root (3 files)
- `index.ts` (2.1KB) — barrel export, stays
- `server.ts` (897B) — MCP server entry point, stays
- `types.ts` (2.2KB) — RuntimeResult, HealthCheck, HealthStatus → move to shared/

### shared/ (4 files, 22KB) — Layer 0, correctly placed
- config.ts (14.7KB), constants.ts (571B), logger.ts (4KB), utils.ts (2.9KB)

### core/ (16 files, 108KB) — Layer 1, needs internal reorganization
- **IO utilities**: fs-utils.ts (520B), file-io.ts (1.8KB), stream-reader.ts (1.3KB)
- **Timing utilities**: timer.ts (2.8KB), retry.ts (1.8KB), poll.ts (1.9KB)
- **Domain primitives**: event-queue.ts (10.6KB), dead-letter.ts (7.5KB), error-handler.ts (5.9KB), event-processor.ts (18.3KB), state-store.ts (9.6KB), metrics.ts (7.6KB), lifecycle.ts (6.1KB)
- **Legacy/confusing**: trigger-registry.ts (13.5KB) — only used by plugins/wrfc, should be renamed to trigger-matcher.ts
- **Types**: types.ts (17.9KB) — foundational type definitions
- **Barrel**: index.ts (644B)

### Orphaned Layer 2 modules (currently at src/ root, should be in extensions/)

**events/** (4 files, 82KB)
- types.ts (27.6KB) — rich event type system extending core's base RuntimeEvent
- event-bus.ts (12KB) — pub/sub event bus
- event-log.ts (25.2KB) — persistent event log (depends on core/io)
- event-queue.ts (17KB) — priority event queue (extends core's event-queue concept)

**workflow/** (10 files, 63KB)
- types.ts (9.6KB) — workflow state machine types
- workflow-engine.ts (26.7KB) — state machine engine
- definitions/: wrfc-loop.ts, fix-loop.ts, test-then-fix.ts, review-only.ts, custom-loader.ts, chain-types.ts, index.ts

**agents/** (3 files, 41KB)
- types.ts (7.4KB) — agent coordination types
- agent-coordinator.ts (24.1KB) — agent lifecycle management
- budget-tracker.ts (10KB) — token budget tracking

**triggers/** (5 files, 61KB)
- types.ts (7.4KB) — trigger condition/action types extending core's base Trigger
- trigger-registry.ts (11KB) — trigger orchestrator (NOT the same as core/trigger-registry.ts)
- condition-evaluator.ts (8.8KB) — evaluates trigger conditions
- action-executor.ts (16.6KB) — executes trigger actions
- builtins.ts (17KB) — 12 built-in trigger definitions

**directives/** (8 files, 83KB)
- directive-queue.ts (4.2KB) — queue for GV directives
- directive-builder.ts (3.7KB) — builds directive messages
- gv-tag-parser.ts (5.4KB) — parses <gv> tags
- agent-workflow-map.ts (7.1KB) — maps agents to workflows
- wrfc-handlers.ts (37.5KB) — WRFC chain handlers
- test-fix-handlers.ts (18KB) — test-fix chain handlers
- review-only-handlers.ts (6.3KB) — review-only handlers
- index.ts (957B)

### Orphaned infrastructure modules (need decomposition)

**ipc/** (6 files, 58KB) — Communication infrastructure
- protocol.ts (9.6KB) — message format definitions → shared/ (transport infrastructure)
- client.ts (11.4KB) — RuntimeClient → shared/ (used by extensions to communicate)
- ipc-server.ts (11.8KB) — Unix socket server → shared/ (transport infrastructure)
- ipc-router.ts (15.3KB) — routes messages to handlers → NEEDS DECOMPOSITION (framework in shared/, domain handlers registered at bootstrap)
- file-fallback.ts (9.7KB) — fallback when IPC unavailable → core/ (uses core/io, core/timing)
- index.ts (313B)

**server/** (13 files, 73KB) — MCP API surface
- mcp-server.ts (6.3KB) — MCP server setup → similar pattern to ipc
- tool-handlers.ts (686B)
- handlers/: agents.ts, config.ts, emit.ts, events.ts, schemas.ts, shared.ts, status.ts, triggers.ts, types.ts, workflow.ts, index.ts
- Same pattern as ipc/ — framework is infrastructure, handlers reference domain modules

**lifecycle/** (8 files, 110KB) — Composition root + mixed concerns
- process-manager.ts (57.8KB) — GOD OBJECT, wires everything → needs to stay as bootstrap or be decomposed
- tick-driver.ts (12.3KB) — eval loop orchestrator → extensions/
- executor-budget.ts (14.2KB) — cost tracking → extensions/
- executor-mode.ts (4.8KB) — mode detection → core/
- health.ts (5.5KB) — health monitoring → core/
- signals.ts (5.1KB) — process signal handling → shared/ or core/
- context-clearer.ts (3KB) — daemon-specific → plugins/ or stays with bootstrap
- daemon-tick-handler.ts (7KB) — daemon-specific → plugins/ or stays with bootstrap

**persistence/** (6 files, 50KB) — State checkpointing
- types.ts (4KB) — persistence interfaces → core/ (generic interfaces)
- state-store.ts (9.4KB) — JSON state persistence → core/ (state store implementation)
- replay-engine.ts (15.6KB) — event replay → extensions/ (depends on domain modules)
- snapshot-manager.ts (10.9KB) — runtime snapshots → extensions/ (depends on domain modules)
- startup-recovery.ts (9.2KB) — crash recovery → extensions/ (depends on domain modules)
- index.ts (801B)

### extensions/ (12 files, 27KB) — Layer 2, currently only has type extensions

**extensions/events/** — typed event factories (HookEvent, TimeEvent, AgentEvent, HumanEvent, ExternalEvent)
- These will merge into the events module when events/ moves into extensions/

**extensions/triggers/** — typed trigger factories (WRFCTrigger, CronTrigger, WebhookTrigger)
- These will merge into the triggers module when triggers/ moves into extensions/

### plugins/ (29 files, 134KB) — Layer 3, well-organized, minimal changes expected
- wrfc/ — WRFC quality loop plugin
- hooks/ — Claude Code hook processing
- time/ — heartbeat + event scheduler
- external/ — file watcher + HTTP listener

## Import Dependency Evidence

### Confirmed layer compliance (from full import graph analysis)
- core/ imports ONLY from shared/ — confirmed pure Layer 1
- triggers/ imports from events/, directives/, workflow/, shared/ — confirmed Layer 2 (NOT core)
- events/ imports from core/io only (fs-utils, file-io) + shared/ — confirmed Layer 2
- workflow/ imports from events/, shared/ — confirmed Layer 2
- agents/ imports from events/, shared/ — confirmed Layer 2
- plugins/ has ZERO inbound imports — confirmed leaf nodes (Layer 3)

### Cross-module imports from orphaned modules
- triggers/ depends on: events/, directives/, workflow/, shared/
- directives/ depends on: events/, shared/
- ipc/ depends on: events/, directives/, agents/, workflow/, lifecycle/, core/, shared/
- lifecycle/ depends on: everything (composition root)
- persistence/ depends on: core/, events/, triggers/, workflow/, directives/, shared/

### Duplicate/overlapping files
- `core/event-queue.ts` vs `events/event-queue.ts` — different abstraction levels, same name
- `core/trigger-registry.ts` vs `triggers/trigger-registry.ts` — primitive matcher vs full orchestrator
- `core/types.ts` RuntimeEvent vs `events/types.ts` RuntimeEvent — base schema vs rich discriminated union
- `plugins/wrfc/directive-builder.ts` vs `directives/directive-builder.ts` — may overlap

## Guiding Principles

1. **Atomicity** — primitives are small, focused, reusable
2. **Layers build on layers** — no layer reinvents what a lower layer provides
3. **Extensibility** — new capabilities by building on existing infrastructure, not duplicating
4. **Tests will be rewritten** — delete existing tests, restructure freely, write fresh 100% coverage suite against new architecture
5. **Decompose mixed-concern modules** — files that span layers get split so each piece is in the correct layer
6. **Sub-organize within layers** — group files into logical sub-modules within core/, extensions/, plugins/

## Approach

1. **Delete** all existing test files (will be rewritten after)
2. **Decompose** orphaned infrastructure modules (ipc/, server/, lifecycle/, persistence/) into atomic parts
3. **Distribute** every file into its correct layer (shared/, core/, extensions/, plugins/)
4. **Merge** existing extensions/ type factories into their respective domain modules arriving from the move
5. **Organize** sub-modules within each layer based on cohesion
6. **Update** all imports, barrels, and the build
7. **Verify** with tsc --noEmit and node build.mjs
8. **Write** fresh test suite with 100% coverage

## Open Questions for Implementation Planning

- Exact sub-module groupings within each layer (core/io/, core/timing/, etc. — what else?)
- How to decompose ipc-router.ts (framework vs domain handlers)
- How to decompose process-manager.ts (57KB god object)
- Where exactly do server/ handler files land
- Whether daemon-specific files (context-clearer, daemon-tick-handler) become a plugin or stay with bootstrap
- Naming: should core/trigger-registry.ts become trigger-matcher.ts to avoid confusion with triggers/trigger-registry.ts
