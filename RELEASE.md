# Release Notes: v1.9.0

**Release Date:** 2026-03-06

This release introduces the Runtime Engine — a complete background orchestration system built from scratch (280 source files, 133K lines) — along with Slack integration, a directive-driven WRFC pipeline, daemon mode with webhook delivery, and significant improvements to the project engine, frontend engine, registry engine, and skills system. 361 commits, 930 files changed, 226K insertions, 58K deletions.

---

## Highlights

### 1. Runtime Engine (Entirely New)

A full background orchestration system that did not exist at v1.3.0. 4-layer architecture (L0 Shared → L1 Core → L2 Extensions → L3 Plugins) with dual-mode operation: MCP mode (stdio, in-process) and daemon mode (background process, Unix socket IPC).

**11 MCP Tools:**
- `runtime_status` — engine health, uptime, subsystem status
- `runtime_config` — hot-reload configuration (get/set/reload)
- `runtime_events` — event history tail, stats, query with filters
- `runtime_emit` — emit custom events into the EventBus
- `runtime_workflow` — create/advance/cancel/history workflow state machines
- `runtime_triggers` — list/register/test/remove event-driven triggers
- `runtime_agents` — agent roster, budget status, coordination
- `runtime_state` — state store snapshot/query by namespace
- `runtime_daemon` — start/stop/restart/status of background daemon
- `runtime_schedule` — scheduled tasks + heartbeat management
- `runtime_external` — webhook status, normalizers, stats, queue depth

**Core Subsystems:**
- EventBus + EventProcessor — typed event system with priority queue, JSONL event log, compaction, and stats
- Workflow Engine — finite state machine with multiple definitions (wrfc_loop, fix_loop, review_only, test_then_fix, custom_loader), transition guards, queue depth limits
- Trigger Registry — event-pattern matching with cooldowns, fire count limits per session, handler timeout enforcement, reconfigurable at runtime
- Trigger Action Handlers — build, test, notify, log, memory, devserver, CI bridge, guard handlers
- State Store — namespaced key-value store with `onStateChange()` callback, EventBus integration for `state:changed` events
- Persistence — checkpoint manager, snapshot manager, replay engine, startup recovery, workflow persistence

### 2. WRFC Autonomous Quality Pipeline

Full Work→Review→Fix→Check loop with configurable `score_threshold` (default 9.5) and `max_fix_attempts` (default 3). Score evaluator, directive builder (spawn/complete/escalate), `<gv>` tag parser for structured agent output, directive queue with `session_id` scoping, and WRFC config store with `goodvibes.json` overrides.

The directive delivery pipeline evolved through 7 iterations to production stability:
1. PreToolUse directive delivery hook
2. PostToolUse Task hook migration
3. UserPromptSubmit directives (current)
4. Pre-tool-use drain safety net
5. Queue auditor for lost notification recovery
6. Watchdog drain-stuck escalation with file-based fallback
7. Session ID scoping to prevent cross-session directive theft

### 3. Daemon Mode

Background daemon process running in a tmux session with Unix domain socket IPC. Features:
- Tick driver with configurable `eval_interval_ms`, `tick_interval_ms`, `auto_tick`
- Heartbeat plugin (configurable interval, pause/resume)
- HTTP webhook listener (configurable port, bind_mode, address, auth_token, max_payload_bytes)
- File watcher for JSON event drop-box pattern (incoming/processed/error dirs)
- Lifecycle management with lockfile mutex (prevents duplicate spawns)
- Health check polling with auto-reconnect
- Signal handler wiring (SIGTERM/SIGINT graceful shutdown)
- DaemonHookServer for hook script compatibility

### 4. Slack Integration

- Slack URL verification challenge handling (HTTP listener intercepts and echoes challenge)
- Slack event normalizer (extracts text, user, channel, thread_ts from event payloads)
- Slack message field formatting in webhook event delivery to tmux
- Slack Web API service registration (precision_fetch bearer auth)
- Bidirectional communication: receive Slack events via webhook, send responses via `chat.postMessage`

### 5. Webhook & External Events

- HTTP listener with direct EventBus webhook delivery (bypasses file drop for low-latency delivery)
- Normalizer registry with built-in normalizers: Slack, GitHub, CI (generic), Generic
- Webhook event formatter with source-specific field extraction
- CI failure bridge: `webhook:ci:*` → trigger → `bridgeCIFailure` → `build:failed` event
- Synchronous tmux delivery — three flat `execFileSync` calls with `Atomics.wait`-based `sleepSync` delays

---

## Features

### Runtime Engine — Core

- feat: add runtime-engine MCP server (Phase 1 foundation)
- feat: add event system with bus, queue, and JSONL log (Phase 2)
- feat: add IPC channel, workflow engine, and trigger system (Phase 3+4)
- feat: add agent coordinator with budget tracking (Phase 5)
- feat: add hook slimming with runtime IPC integration (Phase 6)
- feat: implement Phase 7 WRFC autonomous chain handlers with configurable thresholds
- feat: implement Phase 8 daemon operational design
- feat: runtime engine v3 full review cycle — 10/10 score, 1721 tests passing
- feat: add runtime engine v3 Layer 1 core event loop
- feat: add runtime engine v3 Layer 2 type extensions
- feat: add runtime engine v3 Layer 3 plugins (WRFC, time events, external events, hook processing)
- feat: add runtime engine v3 integration wiring
- feat: implement executor modes (engaged/daemon/hybrid)
- feat: add internal daemon tick scheduler using EventScheduler system

### Runtime Engine — Daemon

- feat: add transport abstraction layer for daemon mode support
- feat: add DaemonTransportConfig to runtime engine config
- feat: migrate MCP handlers to use RuntimeTransport
- feat: add DaemonHookServer for hook script compatibility in daemon mode
- feat: add reconnection/retry logic to RemoteTransport
- feat: add health check polling to DaemonLifecycle
- feat: add daemon integration tests and config validation
- feat: config hot reload + daemon lockfile mutex + test fixes
- feat: add restart action to runtime_daemon tool for in-session daemon cycling
- feat: add MCP daemon health check and auto-reconnect

### Runtime Engine — IPC & Transport

- feat: add IPC router and improve hook tracing
- feat: add IPC proxy for events/schedule/external MCP handlers
- feat: complete IPC proxy for all schedule, external, and trigger actions
- feat: wire signal handlers, human events, and trigger reconfigurable

### Runtime Engine — WRFC Pipeline

- feat: implement structured `<gv>` directive format and agent output tags
- feat: add `<gv>` tag parser for structured agent output extraction
- feat: implement Decision 5 — directive-driven WRFC orchestrator prompt
- feat: implement agent-workflow binding, auto-complete whitelist, and universal gv output
- feat: wire WRFC event triggers and fix hook data flow
- feat: WRFC config propagation — user review score and fix attempts from goodvibes.json
- feat: runtime engine v2 Tier 1+2 — chain types and durability
- feat: add pending bind queue for WRFC workflow resolution
- feat: add watchdog drain-stuck escalation with file-based directive fallback
- feat: add directive delivery resilience — UPS retry, watchdog drain-stuck recovery
- feat: add queue auditor for lost task-notification recovery

### Runtime Engine — Observability

- feat: add `runtime_state` MCP tool and state query API
- feat: add agent-tracker plugin and consolidate e2e test app
- feat: migrate agent tracker to `createAgentEvent` + emit `agent:progress`

### Webhook & Slack

- feat: add Slack URL verification challenge handling in HTTP listener
- feat: direct EventBus webhook delivery, bypass file drop
- feat: add Slack message fields to webhook event formatter
- feat: add GitHub normalizer
- feat: add bridgeCIFailure handler for CI webhook → build:failed bridging

### Hook Scripts

- feat: migrate post-tool-use hook to user-prompt-submit directives
- feat: add pre-tool-use directive drain hook and process watchdog
- feat: use hookSpecificOutput for UPS directive delivery
- feat: add trigger fire count reset and simplify UPS hook

### Project Engine

- Restructured to plugin-based architecture
- Schema extraction into dedicated modules
- Comprehensive quality fixes across all domains: API, code-intel, database, runtime, standalone, security, deps, testing
- Registered in plugin tool registry

### Frontend Engine

- Complete 4-layer decomposition (Phases 3-4)
- Responsive breakpoint analysis tool (`frontend_responsive_breakpoints`)
- Concurrency hardening + event source adapters
- Unified event types + trigger system
- Dead code removal + cleanup

### Registry Engine

- Registered in plugin tool registry alongside project-engine
- Schema extraction into dedicated modules
- Fuse.js query scoring fix for `recommend_skills`

### Skills

- Orchestration skills overhauled for directive-driven WRFC model
- `task-orchestration` and `fullstack-feature` skill updates
- Review scoring updated with subjective score withholding guidance

---

## Bug Fixes

141 bug fix commits addressing:

- Runtime engine IPC reliability and architecture cleanup
- sendToTmux rewritten from nested async callbacks to synchronous sequential calls
- WRFC directive delivery timing (processImmediate for enqueue before drain)
- Directive queue cross-session theft prevention
- Agent tracker skips internal Claude Code agents (empty agent_type)
- Daemon lockfile mutex preventing duplicate spawns
- Transport reconnection with exponential backoff
- Hook data flow corrections across PreToolUse, PostToolUse, and UserPromptSubmit
- Project engine quality fixes across all domains
- Frontend engine critical issues across 4 submodules
- Registry engine query scoring

---

## New Components Added

### Runtime Engine (built from scratch)

- 4-layer plugin architecture with 11 MCP tools
- EventBus + EventProcessor with priority queue and JSONL log
- Workflow Engine with 5 built-in definitions
- Trigger Registry with action handlers
- State Store with change events
- Persistence layer (checkpoint, snapshot, replay, recovery)
- WRFC autonomous quality loop
- Daemon mode with Unix socket IPC
- HTTP webhook listener with normalizer registry
- Transport abstraction (Local + Remote) with factory
- Agent tracker, coordinator, and budget tracker
- Executor system with tick driver
- IPC router with 15+ proxy methods
- Event factories (runtime, agent, human)
- Config hot reload with Reconfigurable interface

### Hook Scripts (3 standalone ESM modules)

- `user-prompt-submit-directives.mjs` — directive delivery on agent completion
- `pre-tool-use-directive-drain.mjs` — safety net drain before tool execution
- `queue-auditor.mjs` — lost task-notification recovery from session JSONL

---

## Documentation

- Engine decomposition docs
- Daemon mode user-facing documentation
- Daemon transport design, review, and gap analysis
- WRFC v1 design doc completed (all open questions closed)
- RTE v2 scope with v1 recap
- Archived outdated docs

---

## Test Infrastructure

- End-to-end test harness
- Runtime engine unit tests (1721+ passing at peak)
- 93 transport/IPC unit tests
- Agent tracker tests (26 tests)
- CI handler tests (30 tests)

---

## Stats

| Metric | Value |
|--------|-------|
| Commits | 361 |
| Files changed | 930 |
| Insertions | +226,055 |
| Deletions | -58,189 |
| Features | 118 |
| Bug fixes | 141 |
| Refactors | 30 |
| New engines | 1 (Runtime) |
| Improved engines | 3 (Project, Frontend, Registry) |
| New MCP tools | 11 (runtime-engine) |
| Total MCP tools | 84 (across 6 engines) |
| New hook scripts | 3 |
| Patch versions | v1.3.1 through v1.3.125 |

---

## Changes Since v1.3.0

- v1.3.1–v1.3.35: Runtime engine phases 1–7, WRFC handlers, directive system, executor modes
- v1.3.35–v1.3.77: Runtime engine v3 layered architecture, end-to-end test harness
- v1.3.77–v1.3.100: Daemon mode (transport, lifecycle, health check, hook server, IPC proxy)
- v1.3.100–v1.3.113: Webhook normalizers (GitHub, Slack, CI), external events plugin
- v1.3.113–v1.3.120: Daemon health check, MCP auto-reconnect, IPC proxy completion
- v1.3.120–v1.3.125: Slack integration (URL verification, direct EventBus delivery, bidirectional messaging)

---

## Upgrade Instructions

```bash
/goodvibes:plugin update
```

Then restart your Claude Code session. The runtime engine daemon will start automatically on first use of any `runtime_*` tool.

---

## Breaking Changes

None. All v1.3.0 APIs remain compatible. The runtime engine is entirely additive.
