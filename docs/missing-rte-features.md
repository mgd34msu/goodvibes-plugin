# Runtime Engine: Missing Features Specification

> **Date**: 2026-03-05  
> **Version**: 2.0 (revised per review recommendations)  
> **Scope**: All missing, incomplete, or dead-end features in the runtime-engine  
> **Architecture Reference**: [docs/refactor-files/refactor-info.md](../docs/refactor-files/refactor-info.md)  
> **Base Path**: `plugins/goodvibes/tools/implementations/runtime-engine/src/`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Missing Event Factories](#2-missing-event-factories)
3. [Dead-End Trigger Pipeline](#3-dead-end-trigger-pipeline)
4. [Unregistered Action Handlers](#4-unregistered-action-handlers)
5. [External Event Pipeline Consumers](#5-external-event-pipeline-consumers)
6. [Time Plugin MCP Exposure](#6-time-plugin-mcp-exposure)
7. [Workflow Engine Stubs](#7-workflow-engine-stubs)
8. [IPC Stubs](#8-ipc-stubs)
9. [Config Hot Reload Gaps](#9-config-hot-reload-gaps)
10. [Normalizer Ecosystem](#10-normalizer-ecosystem)
11. [External Plugin MCP Tool](#11-external-plugin-mcp-tool)
12. [Implementation Priority & Phasing](#12-implementation-priority--phasing)

---

## Event Priority Hierarchy

All event source types use a consistent priority scale (higher = processed first):

| Source | Default Priority | Rationale |
|--------|-----------------|------------|
| Human | 70 | User input takes absolute precedence |
| Hook (internal) | 50 | Claude Code lifecycle events |
| Agent | 40 | Agent lifecycle, between internal and external |
| External (webhook) | 30 | Incoming integrations |
| Time | 10 | Background scheduling, lowest priority |

---

## 1. Executive Summary

The runtime-engine has a well-structured 4-layer architecture (L0 Shared → L1 Core → L2 Extensions → L3 Plugins) with a functional event bus, trigger system, workflow engine, WRFC plugin, IPC subsystem, and MCP tool layer. However, a deep audit reveals **27 gaps** across 10 categories:

| Severity | Count | Summary |
|----------|-------|---------|
| **CRITICAL** | 2 | Zero trigger action handlers registered; `restartDevServer` handler missing |
| **HIGH** | 13 | Missing event factories; no event producers for builtin triggers; no scheduler MCP tool; workflow `spawn_agent` stub; IPC stubs |
| **MEDIUM** | 8 | Limited normalizers; hot reload gaps; no external plugin MCP tool |
| **LOW** | 4 | Unused `scheduled` TimeType; no runtime normalizer registration; custom workflow loader |

The core issue is that **infrastructure exists but end-to-end paths are incomplete**. Events can flow through the pipeline, but nothing produces the events that builtin triggers expect, no handlers are registered to act on triggers that fire, and several MCP tools are missing for subsystems that are otherwise functional.

---

## 2. Missing Event Factories

### Problem

The event system defines 5 event source types (`HookEvent`, `AgentEvent`, `ExternalEvent`, `HumanEvent`, `TimeEvent`) in `extensions/events/factories.ts`. Only 3 have factory functions:

| Event Type | Factory Function | Status |
|------------|-----------------|--------|
| `HookEvent` | `createHookEvent()` | ✅ Implemented, used throughout |
| `ExternalEvent` | `createExternalEvent()` | ✅ Implemented, used by normalizers |
| `TimeEvent` | `createTimeEvent()` | ✅ Implemented, used by scheduler |
| `AgentEvent` | — | ❌ Interface defined (L115-131) but not exported, no factory |
| `HumanEvent` | — | ❌ Interface defined (L192-201) but not exported, no factory |

### Impact

- `source.kind: 'agent'` and `source.kind: 'user'` event paths are unreachable
- The agent tracker emits events with `source.kind: 'internal'` instead of proper `AgentEvent` types
- Human interactions (user prompts, slash commands, approvals) cannot enter the event pipeline as typed events

### Specification

#### 2.1 `createAgentEvent()` — L2 Factory

**File**: `extensions/events/factories.ts`

```typescript
export function createAgentEvent(params: {
  agent_id: string;
  agent_type: string;
  /** e.g. 'agent:spawned', 'agent:completed', 'agent:failed', 'agent:progress' */
  type: string;
  result?: unknown;
  score?: number;
  artifacts?: string[];
  payload?: unknown;
  priority?: number;
  context?: EventContext;
}): AgentEvent;
```

**Behavior**:
- Default priority: **40** (between internal/50 and external/30)
- `source.kind: 'agent'`, `source.agent_id: params.agent_id`
- Export the `AgentEvent` interface

**Integration point**: Agent tracker plugin (`plugins/agent-tracker/`) should use `createAgentEvent()` instead of `createHookEvent()` when emitting agent lifecycle events.

#### 2.2 `createHumanEvent()` — L2 Factory

**File**: `extensions/events/factories.ts`

```typescript
export function createHumanEvent(params: {
  /** e.g. 'human:prompt', 'human:command', 'human:approval' */
  type: string;
  prompt?: string;
  command?: string;
  approval?: boolean;
  payload?: unknown;
  priority?: number;
  context?: EventContext;
}): HumanEvent;
```

**Behavior**:
- Default priority: **70** (highest — human input takes absolute precedence; verified against existing scale: Hook=50, External=30, Time=10)
- `source.kind: 'user'`
- Export the `HumanEvent` interface

**Integration point**: The `UserPromptSubmit` hook handler should emit `HumanEvent` when user prompts arrive. The `Stop` hook should emit `human:stop`. Slash commands should emit `human:command:<name>`.

### Layer Placement

- Factories live in **L2 (Extensions)** — they compose L0 `createEvent()` with source-specific fields
- Integration wiring lives in **L3 (Plugins)** — agent-tracker and hook processors call the factories

---

## 3. Dead-End Trigger Pipeline

### Problem

All 5 builtin triggers listen for event types that **nothing in the system produces**:

| Trigger | Listens For | Producer | Status |
|---------|------------|----------|--------|
| `builtin_auto_fix_build` | `build:failed` (×2 in 60s) | None | ❌ Dead |
| `builtin_auto_fix_test` | `['agent:completed', 'test:failed']` sequence | `agent:completed` exists, `test:failed` does not | ⚠️ Half-dead |
| `builtin_budget_warning` | `agent:progress` | None | ❌ Dead |
| `builtin_sequential_spawn_alert` | `agent:spawned` (×3 in 30s) | Agent tracker | ✅ Works |
| `builtin_devserver_recovery` | `devserver:error` | None | ❌ Dead |

Only 1 of 5 builtin triggers can actually fire.

### Specification

#### 3.1 Build/Test Event Detection via EventBus Listener

**Layer**: L3 Plugin (EventBus subscriber, NOT a separate hook handler)

The build/test detector subscribes to `hook:post_tool_use` events on the EventBus. When it receives one, it inspects `hook_input` fields (tool_name, exit_code, command) to determine if a build or test command ran, and emits the appropriate event.

**Important**: This is an EventBus listener, not a separate hook handler. All hook events enter the system through the single IPC entry point; the detector reacts to them downstream on the EventBus.

**New file**: `plugins/hooks/handlers/build-test-detector.ts` (L3)

```typescript
export class BuildTestDetector {
  constructor(
    private readonly eventBus: EventBus,
    private readonly config: DetectorConfig,
  ) {}

  /** Subscribe to hook:post_tool_use events on the EventBus */
  start(): void {
    this.eventBus.on('hook:post_tool_use', (event) => {
      this.analyzeToolResult(event);
    });
  }

  private analyzeToolResult(event: HookEvent): void {
    const toolName = event.hook_input?.tool_name;
    const exitCode = event.hook_input?.exit_code;
    const command = event.hook_input?.command;
    // ... pattern match and emit build:failed / test:failed / build:succeeded / test:succeeded
  }
}
```

**Command patterns** (configurable via `goodvibes.json`):
```json
{
  "runtime": {
    "detectors": {
      "build_commands": ["npm run build", "npx tsc", "node build", "vite build"],
      "test_commands": ["npm test", "vitest", "jest", "playwright"]
    }
  }
}
```

#### 3.2 Event Producer for Agent Progress

**Layer**: L3 Plugin (agent tracker)

The agent tracker already tracks agent status. It should additionally emit `agent:progress` events periodically or on significant state changes:

- On agent spawned: emit `agent:progress` with `{ phase: 'started', cost: 0 }`
- On token/cost updates (if available from hook data): emit `agent:progress` with current cost
- This feeds the `builtin_budget_warning` trigger

#### 3.3 Dev Server Monitor (Opt-in)

**Layer**: L3 Plugin (new: `plugins/devserver/`)

Create a dev server monitor that:
1. Watches for known dev server process patterns (port bindings, log files)
2. Detects crash/restart events
3. Emits `devserver:error` events

This is opt-in via config. The `builtin_devserver_recovery` trigger remains dormant until a user configures a dev server process to monitor.

```json
{
  "runtime": {
    "devserver": {
      "enabled": false,
      "command": "npm run dev",
      "port": 3000,
      "health_url": "http://localhost:3000"
    }
  }
}
```

### Layer Placement

- Event detection logic: **L3 Plugins** (EventBus listener in hooks/handlers, agent-tracker, devserver)
- Event emission: Via **L2 EventBus** using L2 factories
- Trigger evaluation: Existing **L2 TriggerRegistry** (no changes needed)

---

## 4. Unregistered Action Handlers

### Problem

This is the most critical gap. The trigger system supports `invoke_handler` actions and the workflow engine supports `invoke_handler` workflow actions, but **zero handlers are registered at startup**.

| System | Registration Method | Registered Handlers | Status |
|--------|-------------------|-------------------|--------|
| TriggerActionExecutor | `registerHandler(name, fn)` | 0 | ❌ Empty |
| WorkflowEngine | `registerAction(name, fn)` | 0 | ❌ Empty |
| WorkflowEngine | `registerGuard(name, fn)` | 0 | ❌ Empty |

### Impact

- `builtin_devserver_recovery` fires → calls `restartDevServer` → handler not found → action fails silently
- Any workflow using `invoke_handler` actions → handler not found → action skipped with warning
- Any custom workflow using function guards → guard returns false → transitions blocked

### Specification

#### 4.1 Handler Implementations (L2)

Individual handler implementations live in L2 as pure functions:

**New directory**: `extensions/executor/handlers/`

| Handler Name | File | Purpose | Implementation |
|-------------|------|---------|----------------|
| `restartDevServer` | `devserver-handler.ts` | Restart monitored dev server process | Kill process, re-spawn, verify port |
| `notifyUser` | `notify-handler.ts` | Send notification via configured channel | Write to `.goodvibes/notifications/` |
| `logEvent` | `log-handler.ts` | Write event details to activity log | Append to `.goodvibes/logs/activity.md` |
| `updateMemory` | `memory-handler.ts` | Write key-value to memory store | Update `.goodvibes/memory/*.json` |

**Workflow Action Handlers** (same directory):

| Handler Name | File | Purpose | Implementation |
|-------------|------|---------|----------------|
| `run_build` | `build-handler.ts` | Execute project build command | Shell exec with timeout |
| `run_tests` | `test-handler.ts` | Execute project test suite | Shell exec with timeout |
| `notify_complete` | `notify-handler.ts` | Emit completion notification | EventBus emit |

**Workflow Guard Functions**:

| Guard Name | File | Purpose | Implementation |
|-----------|------|---------|----------------|
| `has_test_suite` | `guards.ts` | Check if project has tests configured | Check package.json scripts |
| `build_passing` | `guards.ts` | Check if last build succeeded | Query state store |

#### 4.2 Registration Wiring (L3)

The registration/wiring logic is **orchestration** and lives in L3, near bootstrap:

**File**: `bootstrap.ts` — inline registration after trigger/workflow subsystem init

```typescript
// After step 13 (trigger subsystem init):
import { restartDevServer, notifyUser, logEvent, updateMemory } from './extensions/executor/handlers/index.js';
import { runBuild, runTests, notifyComplete } from './extensions/executor/handlers/index.js';
import { hasTestSuite, buildPassing } from './extensions/executor/handlers/guards.js';

// Register trigger action handlers
triggerActionExecutor.registerHandler('restartDevServer', restartDevServer(engine));
triggerActionExecutor.registerHandler('notifyUser', notifyUser(engine));
triggerActionExecutor.registerHandler('logEvent', logEvent(engine));
triggerActionExecutor.registerHandler('updateMemory', updateMemory(engine));

// Register workflow action handlers
workflowEngine.registerAction('run_build', runBuild(engine));
workflowEngine.registerAction('run_tests', runTests(engine));
workflowEngine.registerAction('notify_complete', notifyComplete(engine));

// Register workflow guards
workflowEngine.registerGuard('has_test_suite', hasTestSuite(engine));
workflowEngine.registerGuard('build_passing', buildPassing(engine));
```

### Layer Placement

- Handler implementations: **L2 (Extensions)** in `extensions/executor/handlers/` — pure functions, composable
- Registration wiring: **L3 (Plugins/Bootstrap)** — orchestration, inline in `bootstrap.ts`
- This follows the pattern: L2 defines the handlers, L3 wires them up

---

## 5. External Event Pipeline Consumers

### Problem

The external event pipeline is complete (HTTP listener → file drop → FileWatcher → NormalizerRegistry → EventQueue → EventBus → TriggerRegistry), but **no triggers subscribe to external event patterns**. Events like `webhook:github:push` enter the bus and are silently discarded.

### Specification

#### 5.1 Builtin External Event Triggers

**File**: `extensions/triggers/builtins.ts` — add external-source triggers

| Trigger | Event Pattern | Action | Purpose |
|---------|--------------|--------|---------|
| `builtin_webhook_received` | `webhook:*` | `emit_event` → `external:webhook_received` | Log/notify on any webhook receipt |
| `builtin_ci_failure` | `webhook:*:failure` or `webhook:*:failed` | `emit_event` → `build:failed` | Bridge CI webhooks to build events |

**Note**: Source-specific triggers like GitHub PR auto-review are intentionally NOT builtins — they are too opinionated. These should be created by users via the Custom Trigger API.

#### 5.2 Custom Trigger API (Documented Pattern)

Users create triggers for their specific webhook sources via `runtime_triggers create`. Document examples:

```json
// Example: Auto-review on GitHub PR (user-created, not builtin)
{
  "tool": "runtime_triggers",
  "action": "create",
  "trigger": {
    "name": "github_pr_review",
    "condition": {
      "type": "event",
      "event_type": "webhook:github:pull_request_opened"
    },
    "action": {
      "type": "start_workflow",
      "workflow_definition": "wrfc_loop",
      "context_template": { "trigger": "github_pr", "pr_url": "$event.payload.data.html_url" }
    }
  }
}
```

```json
// Example: Stripe payment notification (user-created)
{
  "tool": "runtime_triggers",
  "action": "create",
  "trigger": {
    "name": "stripe_payment",
    "condition": {
      "type": "event",
      "event_type": "webhook:stripe:payment_intent.succeeded"
    },
    "action": {
      "type": "emit_event",
      "event_type": "payment:received",
      "payload_template": { "amount": "$event.payload.data.amount", "source": "stripe" }
    }
  }
}
```

### Layer Placement

- Builtin external triggers: **L2 (Extensions)** in `builtins.ts`
- Custom trigger creation: Existing **L3 MCP tool** (`runtime_triggers`)

---

## 6. Time Plugin MCP Exposure

### Problem

The time plugin has a fully functional scheduler (`EventScheduler`) and heartbeat manager (`HeartbeatManager`), but **no MCP tool exposes them**. Users cannot:
- Create scheduled events
- List active schedules
- Cancel scheduled events
- Adjust heartbeat interval
- View schedule history

### Specification

#### 6.1 New MCP Tool: `runtime_schedule`

**New files**:
- `plugins/mcp/handlers/schedule.ts` (L3 handler)
- Add schema to `plugins/mcp/handlers/schemas.ts`
- Add to tool definitions `tools/definitions/runtime-engine/`

**Actions**:

| Action | Parameters | Description |
|--------|-----------|-------------|
| `list` | `filter?: { type?: 'heartbeat' \| 'cron' \| 'one_shot' }` | List all active schedules |
| `create` | `{ type, event_type, interval_ms?, delay_ms?, payload?, ttl?, preset? }` | Create a new schedule |
| `cancel` | `{ schedule_id }` | Cancel an active schedule |
| `get` | `{ schedule_id }` | Get schedule details |
| `pause` | `{ schedule_id }` | Pause a schedule without removing it |
| `resume` | `{ schedule_id }` | Resume a paused schedule |
| `heartbeat` | `{ action: 'status' \| 'set_interval', interval_ms? }` | Manage heartbeat |

#### 6.2 Named Interval Presets (Instead of Cron Parser)

Rather than implementing a cron expression parser (unnecessary complexity for initial release), provide named presets that map to interval_ms:

| Preset Name | Interval (ms) | Description |
|------------|---------------|-------------|
| `every_minute` | 60,000 | Every minute |
| `every_5_minutes` | 300,000 | Every 5 minutes |
| `every_15_minutes` | 900,000 | Every 15 minutes |
| `every_hour` | 3,600,000 | Hourly |
| `every_6_hours` | 21,600,000 | Every 6 hours |
| `daily` | 86,400,000 | Once per day |

**Usage via MCP**:
```json
{
  "tool": "runtime_schedule",
  "action": "create",
  "type": "cron",
  "event_type": "scheduled:cleanup",
  "preset": "every_hour"
}
```

The scheduler already supports `interval_ms` — presets are pure sugar. A full cron expression parser can be added in a future release if demand warrants it.

### Layer Placement

- Preset definitions: **L0 (Shared)** constants — pure data, no dependencies
- MCP handler: **L3 (Plugins)** — MCP tool handler

---

## 7. Workflow Engine Stubs

### Problem

Two workflow features are explicitly stubbed:

1. **`spawn_agent` action** (`workflow-engine.ts:861-867`): Logs warning "spawn_agent action type is not yet implemented (Phase 5 stub)". Any workflow definition using `spawn_agent` silently fails.

2. **Workflow persistence**: Workflow instances are in-memory only. `restoreInstance()` exists but relies on external persistence. The persistence subsystem exists but workflow state is not automatically saved.

### Specification

#### 7.1 Implement `spawn_agent` Workflow Action

**File**: `extensions/workflow/workflow-engine.ts`

The `spawn_agent` action is NOT fire-and-forget. It requires a full async coordination loop:

**Forward path** (spawn):
1. Build a directive containing the spawn instruction (agent_type, task, workflow_id)
2. Enqueue via ActionExecutor's `send_message` path → DirectiveQueue
3. Register a pending bind in AgentWorkflowMap linking agent_type to workflow_id
4. Register the expected agent in AgentCoordinator
5. Workflow transitions to a `waiting_for_agent` state

**Return path** (completion):
1. Orchestrator spawns the agent (receiving the directive via UPS hook)
2. Agent completes work
3. SubagentStop fires → agent tracker emits `agent:completed` event with agent_id
4. AgentWorkflowMap resolves agent_id → workflow_id via the pending bind
5. The `agent:completed` event is routed to the workflow instance via `sendEvent()`
6. Workflow evaluates transition guards and advances from `waiting_for_agent`

**Implementation**:
```typescript
case 'spawn_agent': {
  const agentType = this.resolveValue(
    action.config['agent_type'] as string, context
  ) as string;
  const task = this.resolveValue(
    action.config['task'] as string, context
  ) as string;
  const workflowId = context.workflow_id as string;

  if (!this.directiveQueue) {
    log.warn('spawn_agent: directiveQueue not available');
    break;
  }

  // Build and enqueue spawn directive
  const message = buildSpawnDirectiveMessage(agentType, task);
  this.directiveQueue.enqueue('subagent_stop', {
    type: 'inject_system_message',
    content: message,
    priority: 10,
    source: 'workflow-engine:spawn_agent',
    workflow_id: workflowId,
  });

  // Register pending bind for return path
  if (this.agentWorkflowMap) {
    this.agentWorkflowMap.addPendingBind(agentType, workflowId, sessionId);
  }

  log.info('spawn_agent: directive enqueued, pending bind registered', {
    agent_type: agentType,
    workflow_id: workflowId,
  });
  break;
}
```

**Dependencies to inject**: WorkflowEngine needs `directiveQueue` (already has via `setDirectiveQueue()`) and `agentWorkflowMap` (needs new setter).

#### 7.2 Workflow State Persistence

**File**: `extensions/persistence/workflow-persistence.ts` (new)

**Directory**: `.goodvibes/state/workflows/` (consistent with existing `.goodvibes/state/` pattern)

Auto-save workflow state on transitions:
1. After each successful state transition, serialize the workflow instance
2. Write to `.goodvibes/state/workflows/<workflow_id>.json` using **write-then-rename** for atomicity
3. Persistence is **async and non-blocking** — transition completes before persistence confirms
4. On daemon restart, scan directory and call `restoreInstance()` for each
5. Add TTL-based cleanup for completed workflows (configurable, default 24h)

**Atomicity guarantee**:
```typescript
async function persistWorkflow(instance: WorkflowInstance, dir: string): Promise<void> {
  const tmpPath = path.join(dir, `${instance.id}.tmp`);
  const finalPath = path.join(dir, `${instance.id}.json`);
  await fs.writeFile(tmpPath, JSON.stringify(instance, null, 2), 'utf-8');
  await fs.rename(tmpPath, finalPath); // atomic on same filesystem
}
```

### Layer Placement

- `spawn_agent` implementation: **L2 (Extensions)** — workflow-engine
- Persistence: **L2 (Extensions)** — persistence subsystem
- File I/O: Uses **L1 (Core)** file utilities

---

## 8. IPC Stubs

### Problem

Two IPC query handlers are hardcoded stubs:

1. **`should_block_tool`** (`ipc-router.ts:415-420`): Always returns `{ allow: true }`. The PreToolUse hook calls this but the daemon never blocks anything.

2. **`get_context_injection`** (`ipc-router.ts:422-427`): Always returns empty. The UserPromptSubmit hook could inject context but gets nothing.

### Specification

#### 8.1 `should_block_tool` — Tool Gating

**File**: `extensions/ipc/ipc-router.ts` + new `extensions/ipc/tool-gating.ts` (L2)

Implement configurable tool blocking rules:

```typescript
interface ToolBlockRule {
  tool_pattern: string;       // glob pattern: 'Bash', 'precision_exec', '*'
  condition: 'always' | 'budget_exceeded' | 'workflow_phase' | 'custom';
  message?: string;           // reason shown to user
}
```

**Safety guarantees (MANDATORY)**:

1. **Fail-open default**: When no rules match, ALWAYS return `{ allow: true }`. This is a hard guarantee, not just a default.
2. **Fail-open on error**: If tool gating evaluation itself throws an exception, catch and return `{ allow: true }`. Tool gating must never block work due to its own bugs.
3. **Config protection**: Tool gating configuration changes are NOT hot-reloadable by default. Changes require daemon restart to take effect. This prevents accidental lockout via `runtime_config set`.
4. **Escape hatch**: A `tool_gating.force_allow_all: true` config flag bypasses all rules immediately.

**Config** (`goodvibes.json`):
```json
{
  "runtime": {
    "tool_gating": {
      "enabled": false,
      "force_allow_all": false,
      "rules": [
        {
          "tool_pattern": "Bash",
          "condition": "budget_exceeded",
          "message": "Budget exceeded — blocking shell access"
        }
      ]
    }
  }
}
```

**Behavior**:
- Evaluate rules in order; first match wins
- `budget_exceeded`: Check executor budget manager
- `workflow_phase`: Block tools during certain workflow phases (e.g., no edits during review phase)
- `custom`: Evaluate a registered handler function
- Default (no rules match): `{ allow: true }`

#### 8.2 `get_context_injection` — Dynamic Context

**File**: `extensions/ipc/ipc-router.ts` + new `extensions/ipc/context-injector.ts` (L2)

Return dynamic context based on current engine state:

```typescript
interface ContextInjection {
  system_message?: string;   // prepended to system prompt
  context_files?: string[];  // files to include in context
  metadata?: Record<string, unknown>;
}
```

**Sources of context**:
1. Active workflow state — inject current phase, score, remaining attempts
2. Recent events summary — last N events of interest
3. Agent roster — currently running agents and their status
4. Budget status — remaining budget, spend rate
5. Custom injections registered via MCP tool

**Config** (`goodvibes.json`):
```json
{
  "runtime": {
    "context_injection": {
      "enabled": false,
      "include": ["workflow_state", "agent_roster", "budget_status"]
    }
  }
}
```

### Layer Placement

- Rule evaluation: **L2 (Extensions)** — new `extensions/ipc/tool-gating.ts`
- Context assembly: **L2 (Extensions)** — new `extensions/ipc/context-injector.ts`
- IPC routing: Existing **L2 (Extensions)** — `ipc-router.ts`

---

## 9. Config Hot Reload Gaps

### Problem

`RuntimeEngine.updateConfig()` propagates config changes to some subsystems but misses others:

| Subsystem | Hot Reload | Status |
|-----------|-----------|--------|
| HealthChecker | ✅ | Updated |
| AgentCoordinator | ✅ | Updated |
| ExecutorMode | ✅ | Updated |
| TickDriver | ✅ | Updated |
| External plugins | ✅ | Updated (with rollback) |
| Time plugin | ❌ | Requires daemon restart |
| Trigger registry | ❌ | Cooldowns/max_fires not updated |
| WRFC plugin | ❌ | Config store exists but not wired |
| IPC router | ❌ | Context injection config not updated |
| Tool gating | ❌ | **Intentionally not hot-reloadable** (see §8.1) |

### Specification

#### 9.1 `Reconfigurable` Interface

**File**: `shared/interfaces.ts` (L0) — new shared interface

```typescript
/**
 * Implemented by subsystems that support runtime config changes.
 * Allows bootstrap.ts to iterate over reconfigurable components generically.
 */
export interface Reconfigurable {
  /** Apply new config. Throw on validation failure (triggers rollback). */
  reconfigure(config: Record<string, unknown>): void;
}
```

#### 9.2 Extend `updateConfig()` in `bootstrap.ts`

Maintain a registry of reconfigurable subsystems:

```typescript
private reconfigurables: Map<string, Reconfigurable> = new Map();

// During startup, register each reconfigurable subsystem:
this.reconfigurables.set('time', timePlugin);
this.reconfigurables.set('triggers', triggerSubsystem);
this.reconfigurables.set('wrfc', wrfcPlugin);
// Note: tool_gating is intentionally NOT in this list

// In updateConfig():
for (const [name, subsystem] of this.reconfigurables) {
  const sectionConfig = newConfig[name] ?? {};
  try {
    subsystem.reconfigure(sectionConfig);
  } catch (err) {
    logger.warn(`Failed to reconfigure ${name}`, { error: toErrorMessage(err) });
  }
}
```

Each subsystem implements `Reconfigurable`:
1. Validates the new config
2. Applies changes that are safe to change at runtime
3. Logs what changed
4. Throws on validation failure (caller catches for rollback)

### Layer Placement

- `Reconfigurable` interface: **L0 (Shared)** — no dependencies
- `reconfigure()` implementations: **L2/L3** on each subsystem
- Wiring in `updateConfig()`: **L3 (Plugins/Bootstrap)**

---

## 10. Normalizer Ecosystem

### Problem

Only 2 normalizers exist (`github`, `generic`). Common webhook sources fall through to the generic normalizer, losing source-specific event type extraction.

### Specification

#### 10.1 Initial Normalizers (Phase 6 scope)

**Directory**: `plugins/external/normalizers/` (L3)

Start with 2 normalizers that have immediate utility:

| Normalizer | Source | Event Type Pattern | Key Fields Extracted | Rationale |
|-----------|--------|-------------------|---------------------|----------|
| `slack` | `slack` | `webhook:slack:<event_type>` | channel, user, text, thread_ts | Most common notification integration |
| `ci` | `ci_*` | `webhook:ci:<provider>:<status>` | provider, status, branch, commit | Directly feeds `builtin_ci_failure` trigger |

**Deferred** (add when user demand exists): Stripe, GitLab, Linear. The generic normalizer handles these adequately for now.

Each normalizer:
1. Checks headers/payload for source identification
2. Extracts the canonical event type
3. Normalizes payload into consistent field structure
4. Returns an `ExternalEvent` via `createExternalEvent()`

#### 10.2 Runtime Normalizer Registration

Add methods to `NormalizerRegistry` for managing normalizers at runtime:

```typescript
class NormalizerRegistry {
  registerNormalizer(source: string, fn: NormalizerFn): void;
  unregisterNormalizer(source: string): boolean;
  listNormalizers(): string[];
}
```

Expose via the `runtime_external` MCP tool (see section 11).

### Layer Placement

- Individual normalizers: **L3 (Plugins)** — source-specific logic
- Registry methods: **L3 (Plugins)** — NormalizerRegistry is L3
- MCP exposure: **L3 (Plugins)** — MCP tool handler

---

## 11. External Plugin MCP Tool

### Problem

The external plugin (HTTP listener + file watcher + normalizers) has no MCP tool. Users cannot:
- Check HTTP listener status
- View webhook statistics
- List registered normalizers
- Test normalizer output for a sample payload
- View file watcher queue state

### Specification

#### 11.1 New MCP Tool: `runtime_external`

**New files**:
- `plugins/mcp/handlers/external.ts` (L3 handler)
- Add schema to `plugins/mcp/handlers/schemas.ts`
- Add to tool definitions

**Actions**:

| Action | Parameters | Description |
|--------|-----------|-------------|
| `status` | — | HTTP listener status, port, bind address, file watcher state |
| `normalizers` | — | List registered normalizers with source patterns |
| `test_normalize` | `{ source, payload, headers? }` | Run payload through normalizer, return resulting event |
| `stats` | `{ since?: ISO8601 }` | Webhook receive counts, error counts, processing times |
| `queue` | — | File watcher queue state (pending, processed, error counts) |

### Layer Placement

- MCP handler: **L3 (Plugins)** — paper-thin dispatcher
- Data retrieval: Calls into existing **L3 external plugin** methods

---

## 12. Implementation Priority & Phasing

### Phase 1: Critical Infrastructure (Priority: CRITICAL)

**Unblock the trigger pipeline end-to-end.**

| # | Item | Section | Files Changed | Effort |
|---|------|---------|--------------|--------|
| 1.1 | Create handler implementations | §4.1 | new `extensions/executor/handlers/*.ts` | Medium |
| 1.2 | Register handlers in bootstrap | §4.2 | `bootstrap.ts` | Small |
| 1.3 | Register builtin workflow handlers + guards | §4.2 | `bootstrap.ts` | Small |

### Phase 2: Event Producers (Priority: HIGH)

**Make builtin triggers actually fire.**

| # | Item | Section | Files Changed | Effort |
|---|------|---------|--------------|--------|
| 2.1 | Create `createAgentEvent()` factory | §2.1 | `extensions/events/factories.ts` | Small |
| 2.2 | Create `createHumanEvent()` factory | §2.2 | `extensions/events/factories.ts` | Small |
| 2.3 | Build/test event detector (EventBus listener) | §3.1 | new `plugins/hooks/handlers/build-test-detector.ts` | Medium |
| 2.4 | Agent progress events | §3.2 | `plugins/agent-tracker/` | Small |
| 2.5 | Migrate agent tracker to use `createAgentEvent()` | §2.1 | `plugins/agent-tracker/` | Medium |

### Phase 3: MCP Tools & Exposure (Priority: HIGH)

**Expose hidden subsystems via MCP.**

| # | Item | Section | Files Changed | Effort |
|---|------|---------|--------------|--------|
| 3.1 | `runtime_schedule` MCP tool with named presets | §6.1, §6.2 | new handler, schema update, tool def, preset constants | Medium |
| 3.2 | `runtime_external` MCP tool | §11.1 | new handler, schema update, tool def | Medium |

### Phase 4: Workflow Completion (Priority: HIGH)

**Complete workflow engine functionality.**

| # | Item | Section | Files Changed | Effort |
|---|------|---------|--------------|--------|
| 4.1 | Implement `spawn_agent` with full return path | §7.1 | `extensions/workflow/workflow-engine.ts` | Medium |
| 4.2 | Workflow state persistence (atomic, async) | §7.2 | new `extensions/persistence/workflow-persistence.ts` | Medium |

### Phase 5: IPC Implementation (Priority: MEDIUM-HIGH)

**Implement IPC stubs with safety guarantees.**

| # | Item | Section | Files Changed | Effort |
|---|------|---------|--------------|--------|
| 5.1 | `should_block_tool` with fail-open safety | §8.1 | `ipc-router.ts`, new `extensions/ipc/tool-gating.ts` | Medium |
| 5.2 | `get_context_injection` implementation | §8.2 | `ipc-router.ts`, new `extensions/ipc/context-injector.ts` | Medium |

### Phase 6: External Pipeline (Priority: MEDIUM)

**Enrich the external event ecosystem.**

| # | Item | Section | Files Changed | Effort |
|---|------|---------|--------------|--------|
| 6.1 | External event trigger builtins (webhook_received, ci_failure) | §5.1 | `extensions/triggers/builtins.ts` | Small |
| 6.2 | Slack + CI normalizers | §10.1 | new files in `plugins/external/normalizers/` | Medium |
| 6.3 | Runtime normalizer registration | §10.2 | `plugins/external/normalizers/index.ts` | Small |

### Phase 7: Hot Reload & Polish (Priority: MEDIUM)

**Fill config hot reload gaps.**

| # | Item | Section | Files Changed | Effort |
|---|------|---------|--------------|--------|
| 7.1 | `Reconfigurable` interface | §9.1 | new `shared/interfaces.ts` | Small |
| 7.2 | Implement `Reconfigurable` on time/trigger/WRFC subsystems | §9.2 | multiple subsystem files | Medium |
| 7.3 | Generic reconfigure loop in `updateConfig()` | §9.2 | `bootstrap.ts` | Small |
| 7.4 | Dev server monitor plugin (opt-in) | §3.3 | new `plugins/devserver/` | Medium |

---

## Appendix A: Files Inventory

### New Files

| Path | Layer | Purpose |
|------|-------|---------|
| `extensions/executor/handlers/devserver-handler.ts` | L2 | restartDevServer handler |
| `extensions/executor/handlers/notify-handler.ts` | L2 | notifyUser + notifyComplete handlers |
| `extensions/executor/handlers/log-handler.ts` | L2 | logEvent handler |
| `extensions/executor/handlers/memory-handler.ts` | L2 | updateMemory handler |
| `extensions/executor/handlers/build-handler.ts` | L2 | run_build workflow action |
| `extensions/executor/handlers/test-handler.ts` | L2 | run_tests workflow action |
| `extensions/executor/handlers/guards.ts` | L2 | Workflow guard functions |
| `extensions/executor/handlers/index.ts` | L2 | Barrel export |
| `plugins/hooks/handlers/build-test-detector.ts` | L3 | Build/test event detection (EventBus listener) |
| `plugins/mcp/handlers/schedule.ts` | L3 | MCP tool for scheduler |
| `plugins/mcp/handlers/external.ts` | L3 | MCP tool for external plugin |
| `extensions/ipc/tool-gating.ts` | L2 | Tool blocking rule evaluation (fail-open) |
| `extensions/ipc/context-injector.ts` | L2 | Dynamic context assembly |
| `extensions/persistence/workflow-persistence.ts` | L2 | Workflow state auto-save (atomic) |
| `shared/interfaces.ts` | L0 | Reconfigurable interface |
| `shared/presets.ts` | L0 | Named interval presets |
| `plugins/external/normalizers/slack.ts` | L3 | Slack webhook normalizer |
| `plugins/external/normalizers/ci.ts` | L3 | CI system webhook normalizer |
| `plugins/devserver/index.ts` | L3 | Dev server monitor plugin (opt-in) |

### Modified Files

| Path | Layer | Changes |
|------|-------|---------|
| `extensions/events/factories.ts` | L2 | Add `createAgentEvent()`, `createHumanEvent()`, export interfaces |
| `extensions/triggers/builtins.ts` | L2 | Add `builtin_webhook_received`, `builtin_ci_failure` |
| `extensions/workflow/workflow-engine.ts` | L2 | Implement `spawn_agent` with return path, add `setAgentWorkflowMap()` |
| `extensions/ipc/ipc-router.ts` | L2 | Wire tool-gating and context-injector |
| `plugins/time/time-plugin.ts` | L3 | Implement `Reconfigurable` interface |
| `plugins/agent-tracker/` | L3 | Emit `agent:progress`, use `createAgentEvent()` |
| `plugins/mcp/handlers/schemas.ts` | L3 | Add `runtime_schedule`, `runtime_external` schemas |
| `plugins/mcp/handlers/index.ts` | L3 | Register new handlers |
| `plugins/external/normalizers/index.ts` | L3 | Add runtime registration, new normalizers |
| `bootstrap.ts` | L3 | Register handlers, wire reconfigurables, connect persistence |
| `shared/config.ts` | L0 | Add new config sections for detectors, tool_gating, context_injection, devserver |

---

## Appendix B: Design Principles Applied

1. **Dependencies flow strictly downward**: L3 → L2 → L1 → L0. No upward or sideways dependencies.
2. **Each file has one clear reason to exist**: Handler implementations are separate from registration wiring. Tool gating is separate from IPC routing.
3. **L3 plugins are paper-thin dispatchers**: MCP handlers validate input, call L2 functions, return responses. Zero business logic.
4. **L1 core never changes**: All new functionality goes in L0/L2/L3. No L1 additions.
5. **Configuration over code**: New features are opt-in via `goodvibes.json`. Existing behavior unchanged by default.
6. **Fail-open safety**: Tool gating catches its own errors and defaults to allow. No feature can accidentally lock out the user.
7. **Atomic persistence**: Write-then-rename pattern for workflow state files. Non-blocking async writes.
8. **Single entry point**: Hook events enter via IPC only. The build/test detector listens on the EventBus, not as a separate hook handler.
9. **Existing patterns reused**: `spawn_agent` reuses the directive delivery mechanism. Event producers reuse existing factories. Hot reload follows the `Reconfigurable` interface.
10. **Minimal initial scope**: 2 normalizers (Slack, CI), not 5. Named presets, not cron parser. User-created triggers, not opinionated builtins.
