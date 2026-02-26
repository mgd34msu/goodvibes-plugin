# Executor Modes Implementation Plan

> Generated: 2026-02-26 | Architect: Claude Opus 4.6
> Codebase: `plugins/goodvibes/tools/implementations/runtime-engine/src/`
> Planning docs: `updated-planning.md` (lines 385-606), `v3-implementation.md` (section 4.2)

---

## Executive Summary

The runtime engine v3 is fully implemented (100 source files, 35 test files, 1721 tests) but lacks executor mode support. This plan adds engaged/daemon/hybrid mode selection, daemon tick handling, two-tier cost controls, and context clearing -- enabling the runtime to operate autonomously between human interactions.

**Scope**: 4 new files in `src/lifecycle/`, 8 modified files, ~80-100 new tests across 4 test files.

**Layer placement**: All executor modules live in `src/lifecycle/` (Layer 1 — lifecycle infrastructure), not as a separate directory.

---

## 1. Type Definitions

### 1.1 ExecutorConfig Interface

**File**: `src/shared/config.ts` (MODIFY)

```typescript
/** Executor mode for the runtime engine session. */
export type ExecutorMode = 'engaged' | 'daemon' | 'hybrid';

/** Daemon-specific configuration. */
export interface DaemonConfig {
  /** Whether to clear context after processing each event batch. */
  clear_context_after_batch: boolean;
  /** Name of the tmux session running the daemon. */
  tmux_session_name: string;
  /** Command string that triggers a tick (typed into the session). */
  tick_command: string;
}

/** Two-tier budget configuration for executor cost controls. */
export interface ExecutorBudgetConfig {
  /** Total spending ceiling in USD. When hit, processing pauses. Optional. */
  flat_cap_usd?: number;
  /** Per-day spending limit in USD. Resets at reset_hour. Optional. */
  daily_cap_usd?: number;
  /** Fraction (0-1) at which a warning event fires. Default: 0.8 (80%). */
  warning_threshold: number;
  /** Hour of day (0-23) at which the daily cap resets. Default: 0 (midnight). */
  daily_reset_hour: number;
}

/** Complete executor configuration section. */
export interface ExecutorConfig {
  /** Current executor mode. Default: 'engaged'. */
  mode: ExecutorMode;
  /** Daemon-specific settings. Only consulted when mode is 'daemon' or 'hybrid'. */
  daemon: DaemonConfig;
  /** Two-tier cost controls. Active in all modes. */
  budget: ExecutorBudgetConfig;
}
```

### 1.2 RuntimeConfig Extension

**File**: `src/shared/config.ts` (MODIFY)

Add `executor` field to `RuntimeConfig` interface (line ~122):

```typescript
export interface RuntimeConfig {
  schema_version: string;
  ipc: IpcConfig;
  queue: QueueConfig;
  persistence: PersistenceConfig;
  workflows: WorkflowsConfig;
  triggers: TriggersConfig;
  health: HealthConfig;
  features: FeaturesConfig;
  agents: AgentsConfig;
  executor: ExecutorConfig;  // NEW
}
```

Add defaults to `DEFAULT_CONFIG` (after `agents` section, line ~183):

```typescript
executor: {
  mode: 'engaged',
  daemon: {
    clear_context_after_batch: true,
    tmux_session_name: 'claude-daemon',
    tick_command: 'tick',
  },
  budget: {
    flat_cap_usd: undefined,
    daily_cap_usd: undefined,
    warning_threshold: 0.8,
    daily_reset_hour: 0,
  },
},
```

### 1.3 New Event Types

**File**: `src/events/types.ts` (MODIFY)

Add to `EventType` union (after `system:gc`, line ~271):

```typescript
// ── Executor events ────────────────────────────────────────────────────
/** Executor mode was determined or changed. */
| 'executor:mode_set'
/** A daemon tick was received and processing started. */
| 'executor:tick_received'
/** A daemon tick batch completed processing. */
| 'executor:tick_completed'
/** Context clearing was initiated (daemon/hybrid mode). */
| 'executor:context_clearing'
/** Executor budget warning threshold reached. */
| 'executor:budget_warning'
/** Executor budget cap reached; processing paused. */
| 'executor:budget_exceeded'
/** Executor daily budget reset occurred. */
| 'executor:budget_reset'
/** Executor processing was paused due to budget. */
| 'executor:paused'
/** Executor processing was resumed (budget increased or reset). */
| 'executor:resumed'
```

Add to `EventPayload` discriminated union (line ~557):

```typescript
// Executor events
| { type: 'executor:mode_set'; data: { mode: ExecutorMode; previous_mode?: ExecutorMode; detection_method: 'explicit' | 'inferred' | 'default' } }
| { type: 'executor:tick_received'; data: { tick_number: number; pending_events: number } }
| { type: 'executor:tick_completed'; data: { tick_number: number; events_processed: number; duration_ms: number } }
| { type: 'executor:context_clearing'; data: { method: 'tmux' | 'queue_injection'; success: boolean } }
| { type: 'executor:budget_warning'; data: { cap_type: 'flat' | 'daily'; spent_usd: number; cap_usd: number; threshold: number } }
| { type: 'executor:budget_exceeded'; data: { cap_type: 'flat' | 'daily'; spent_usd: number; cap_usd: number } }
| { type: 'executor:budget_reset'; data: { previous_daily_spent: number; reset_hour: number } }
| { type: 'executor:paused' | 'executor:resumed'; data: { reason: string } }
```

---

## 2. New Modules

### 2.1 ExecutorModeManager

**File**: `src/lifecycle/executor-mode.ts` (NEW)

Responsibility: Determine and manage the current executor mode.

```typescript
export class ExecutorModeManager {
  private currentMode: ExecutorMode;
  private detectionMethod: 'explicit' | 'inferred' | 'default';
  
  constructor(config: ExecutorConfig);
  
  /** Determine mode using priority: explicit config > env inference > default. */
  detectMode(): ExecutorMode;
  
  /** Get the current resolved mode. */
  getMode(): ExecutorMode;
  
  /** Explicitly switch mode at runtime. Emits executor:mode_set. */
  setMode(mode: ExecutorMode): void;
  
  /** Check if the current mode processes queued events. */
  shouldProcessQueue(): boolean;
  
  /** Check if context should be cleared after batch. */
  shouldClearContext(): boolean;
  
  /** Check if session was started by a system scheduler tick. */
  private inferFromEnvironment(): ExecutorMode | null;
}
```

**Mode detection logic**:
1. If `config.executor.mode` is explicitly set to non-default in the config file, use it (`explicit`).
2. Else, check environment: if `TMUX` env var is set AND no `GOODVIBES_INTERACTIVE` env var, infer `daemon` (`inferred`).
3. Else, default to `engaged` (`default`).

The env var `GOODVIBES_EXECUTOR_MODE` provides an explicit override outside the config file (for systemd/cron launch scripts).

### 2.2 ExecutorBudgetManager

**File**: `src/lifecycle/executor-budget.ts` (NEW)

Responsibility: Track session-level spending against flat and daily caps. Distinct from the agent-level `BudgetTracker` in `src/agents/`.

```typescript
export interface SpendingRecord {
  total_usd: number;
  daily_usd: number;
  daily_reset_at: string;  // ISO-8601
  last_updated: string;
}

export class ExecutorBudgetManager {
  private config: ExecutorBudgetConfig;
  private eventBus: EventBus;
  private spending: SpendingRecord;
  private paused: boolean;
  private warningFired: { flat: boolean; daily: boolean };
  
  constructor(config: ExecutorBudgetConfig, eventBus: EventBus);
  
  /** Record spending from an agent completion or progress report. */
  recordSpending(amount_usd: number): void;
  
  /** Check if processing should continue (not over any cap). */
  canProcess(): boolean;
  
  /** Get current spending state. */
  getSpending(): SpendingRecord;
  
  /** Check and reset daily cap if reset_hour has passed. */
  checkDailyReset(): boolean;
  
  /** Manually increase budget (operator override). */
  adjustBudget(adjustments: Partial<ExecutorBudgetConfig>): void;
  
  /** Persist spending to state store. */
  persist(stateStore: StateStoreInterface): void;
  
  /** Restore spending from state store. */
  restore(stateStore: StateStoreInterface): void;
  
  // Private: emit executor:budget_warning, executor:budget_exceeded events
}
```

**Integration with analytics engine**: The analytics engine already tracks per-session costs in its `budget-tracker.ts` daemon. ExecutorBudgetManager reads the same cost data (via IPC query to analytics engine or direct file read of `.goodvibes/analytics/costs.json`) and applies executor-level caps. This is a consumer of cost data, not a duplicate tracker.

### 2.3 DaemonTickHandler

**File**: `src/lifecycle/daemon-tick-handler.ts` (NEW)

Responsibility: Process a daemon tick -- the core "event loop" for daemon mode.

```typescript
export interface TickResult {
  tick_number: number;
  events_processed: number;
  duration_ms: number;
  context_cleared: boolean;
  budget_status: 'ok' | 'warning' | 'exceeded';
}

export class DaemonTickHandler {
  private tickCount: number;
  private executorMode: ExecutorModeManager;
  private budgetManager: ExecutorBudgetManager;
  private eventBus: EventBus;
  
  constructor(deps: {
    executorMode: ExecutorModeManager;
    budgetManager: ExecutorBudgetManager;
    eventBus: EventBus;
    config: ExecutorConfig;
  });
  
  /**
   * Process one daemon tick cycle.
   * 
   * Called by the UserPromptSubmit hook when the prompt matches
   * the configured tick_command.
   * 
   * Flow:
   * 1. Check budget -- abort if exceeded
   * 2. Check daily reset
   * 3. Emit executor:tick_received
   * 4. Query event queue for pending events
   * 5. Build additionalContext with: memory state + pending actions
   * 6. Return hook response with additionalContext
   * 7. (After Claude processes) emit executor:tick_completed
   * 8. If daemon mode: initiate context clearing
   */
  async handleTick(): Promise<TickResult>;
  
  /**
   * Build the additionalContext payload for daemon tick injection.
   * Includes: active workflows, pending events summary, memory state.
   */
  private buildTickContext(): string;
  
  /** Get tick count for metrics. */
  getTickCount(): number;
}
```

### 2.4 ContextClearer

**File**: `src/lifecycle/context-clearer.ts` (NEW)

Responsibility: Clear Claude's conversation context after a daemon batch.

```typescript
export class ContextClearer {
  private config: DaemonConfig;
  
  constructor(config: DaemonConfig);
  
  /**
   * Clear context using the best available method.
   * 
   * 1. Primary: tmux send-keys to inject /clear
   * 2. Fallback: Enqueue a /clear as next event (handled on next tick)
   * 
   * @returns Method used and success status.
   */
  async clearContext(): Promise<{ method: 'tmux' | 'queue_injection'; success: boolean }>;
  
  /** Check if tmux is available (TMUX env var, tmux binary exists). */
  private isTmuxAvailable(): boolean;
  
  /** Execute tmux send-keys command. */
  private clearViaTmux(): Promise<boolean>;
}
```

**tmux clearing mechanism**:
```bash
tmux send-keys -t {tmux_session_name} "/clear" Enter
```

This is run via `child_process.execSync` with a short timeout (5s). If it fails, the fallback enqueues a `human:command` event with payload `/clear` so the next tick's additionalContext injection includes a `/clear` directive.

### 2.5 Layer Placement Rationale

All executor modules live in `src/lifecycle/` alongside `process-manager.ts`, `health.ts`, and `signals.ts`. Executor modes are a **lifecycle concern** — they determine how the session runs, when ticks arrive, when context clears, and when to pause for budget. They are not event types (Layer 2) or plugins that register triggers (Layer 3). They are infrastructure that the ProcessManager consumes to orchestrate the session.

No barrel export is needed — ProcessManager imports directly from sibling files (e.g., `./executor-mode.js`), consistent with how it already imports `./health.js` and `./signals.js`.

---

## 3. Modified Modules

### 3.1 ProcessManager

**File**: `src/lifecycle/process-manager.ts` (MODIFY)

**Changes**:

1. **New class fields** (after `v3TickTimer`):
```typescript
private executorMode: ExecutorModeManager | null = null;
private executorBudget: ExecutorBudgetManager | null = null;
private daemonTickHandler: DaemonTickHandler | null = null;
private contextClearer: ContextClearer | null = null;
```

2. **Startup sequence** -- add step between v3 plugin init and IPC server start (after step 10, before step 11):
```typescript
// 10b. Initialize executor mode subsystem
this.executorMode = new ExecutorModeManager(this.config.executor);
const detectedMode = this.executorMode.detectMode();
this.executorBudget = new ExecutorBudgetManager(
  this.config.executor.budget,
  this.eventBus,
);
// Restore spending state from previous session
if (this.v3StateStore) {
  this.executorBudget.restore(this.v3StateStore);
}
this.contextClearer = new ContextClearer(this.config.executor.daemon);
this.daemonTickHandler = new DaemonTickHandler({
  executorMode: this.executorMode,
  budgetManager: this.executorBudget,
  eventBus: this.eventBus,
  config: this.config.executor,
});
logger.info('Executor mode initialised', { mode: detectedMode });
```

3. **Emit executor:mode_set event** after startup completes.

4. **Shutdown** -- persist executor budget spending before shutdown:
```typescript
// Before final checkpoint
if (this.executorBudget && this.v3StateStore) {
  this.executorBudget.persist(this.v3StateStore);
}
```

5. **Expose accessors** for executor subsystems:
```typescript
getExecutorMode(): ExecutorModeManager | null { return this.executorMode; }
getExecutorBudget(): ExecutorBudgetManager | null { return this.executorBudget; }
getDaemonTickHandler(): DaemonTickHandler | null { return this.daemonTickHandler; }
```

6. **v3 tick timer** -- make tick interval mode-aware:
   - Engaged: 10s (current default, internal-only events)
   - Daemon: Disabled (ticks come from external system scheduler)
   - Hybrid: 10s (same as engaged, also processes queued events)

### 3.2 IPCRouter

**File**: `src/ipc/ipc-router.ts` (MODIFY)

**Changes**:

1. **Add ExecutorModeManager to IPCRouterDeps**:
```typescript
export interface IPCRouterDeps {
  // ... existing fields ...
  executorMode?: ExecutorModeManager | null;
  executorBudget?: ExecutorBudgetManager | null;
  daemonTickHandler?: DaemonTickHandler | null;
}
```

2. **Add new query kinds** to the route method:
```typescript
if (q.kind === 'get_executor_mode') {
  const mode = this.executorMode?.getMode() ?? 'engaged';
  return { id: msg.id, status: 'ok', data: { kind: 'executor_mode', mode } };
}

if (q.kind === 'get_executor_budget') {
  const spending = this.executorBudget?.getSpending() ?? null;
  const canProcess = this.executorBudget?.canProcess() ?? true;
  return { id: msg.id, status: 'ok', data: { kind: 'executor_budget', spending, can_process: canProcess } };
}

if (q.kind === 'process_tick') {
  // Daemon tick arrived via IPC (alternative to UserPromptSubmit hook path)
  const result = await this.daemonTickHandler?.handleTick();
  return { id: msg.id, status: 'ok', data: { kind: 'tick_result', result } };
}
```

3. **IPC protocol extension** (protocol.ts):
   - Add `get_executor_mode`, `get_executor_budget`, `process_tick` to query kinds.

### 3.3 Config Handler

**File**: `src/server/handlers/config.ts` (MODIFY)

**Changes**: Add executor config keys to `VALID_CONFIG_KEYS` and `CONFIG_KEY_TYPES`:

```typescript
// Add to VALID_CONFIG_KEYS:
'executor.mode',
'executor.daemon.clear_context_after_batch',
'executor.daemon.tmux_session_name',
'executor.daemon.tick_command',
'executor.budget.flat_cap_usd',
'executor.budget.daily_cap_usd',
'executor.budget.warning_threshold',
'executor.budget.daily_reset_hour',

// Add to CONFIG_KEY_TYPES:
['executor.mode', 'string'],
['executor.daemon.clear_context_after_batch', 'boolean'],
['executor.daemon.tmux_session_name', 'string'],
['executor.daemon.tick_command', 'string'],
['executor.budget.flat_cap_usd', 'number'],
['executor.budget.daily_cap_usd', 'number'],
['executor.budget.warning_threshold', 'number'],
['executor.budget.daily_reset_hour', 'number'],
```

### 3.4 UserPromptSubmit Handler (v3 plugin)

**File**: `src/plugins/hooks/handlers/user-prompt-submit.ts` (MODIFY)

**Changes**: Add daemon tick detection alongside existing task-notification handling.

```typescript
export interface UserPromptSubmitDeps {
  directiveQueue: DirectiveQueue | null;
  daemonTickHandler: DaemonTickHandler | null;  // NEW
  executorMode: ExecutorModeManager | null;      // NEW
}

// Inside handler function, before the task-notification check:

// Check for daemon tick command
const mode = deps.executorMode?.getMode();
if ((mode === 'daemon' || mode === 'hybrid') && deps.daemonTickHandler) {
  const tickCommand = /* from config */ 'tick';
  if (prompt.trim() === tickCommand) {
    logger.info('Daemon tick received via UserPromptSubmit');
    const result = await deps.daemonTickHandler.handleTick();
    const tickContext = JSON.stringify({
      action: 'daemon_tick',
      tick_number: result.tick_number,
      events_processed: result.events_processed,
    });
    return {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `<gv>${tickContext}</gv>`,
      },
    };
  }
}
```

### 3.5 Hook Registration (registerDefaultHandlers)

**File**: `src/plugins/hooks/handlers/index.ts` (MODIFY)

Update `registerDefaultHandlers` to pass new deps to UserPromptSubmit handler.

### 3.6 IPC Protocol

**File**: `src/ipc/protocol.ts` (MODIFY)

Add new query kind types to `IPCQuery` union:

```typescript
| { kind: 'get_executor_mode' }
| { kind: 'get_executor_budget' }
| { kind: 'process_tick' }
```

### 3.7 Standalone UserPromptSubmit Hook

**File**: `plugins/goodvibes/hooks/scripts/src/user-prompt-submit-directives.mjs` (MODIFY)

The standalone ESM hook script that runs outside the runtime engine. Add daemon tick detection:

```javascript
// After existing directive-draining logic:
// Check if this is a daemon tick
const mode = await queryRuntime('get_executor_mode');
if (mode === 'daemon' || mode === 'hybrid') {
  const tickCommand = prompt.trim();
  if (tickCommand === 'tick') {
    const tickResult = await queryRuntime('process_tick');
    // Inject tick context via additionalContext
  }
}
```

### 3.8 Tool Definition

**File**: `plugins/goodvibes/tools/definitions/runtime-engine/runtime-config.yaml` (MODIFY)

Update the tool description to mention executor config keys.

---

## 4. Design Details

### 4.1 Daemon Tick Flow (End-to-End)

```
1. System scheduler (cron/systemd/launchd) runs:
   tmux send-keys -t claude-daemon "tick" Enter

2. Claude Code receives "tick" as user input

3. UserPromptSubmit hook fires:
   a. Standalone hook (user-prompt-submit-directives.mjs) queries IPC:
      - get_executor_mode -> 'daemon'
      - process_tick -> triggers DaemonTickHandler.handleTick()
   b. OR v3 HookProcessor handles it directly

4. DaemonTickHandler.handleTick():
   a. Check ExecutorBudgetManager.canProcess()
   b. If budget exceeded: return minimal response with pause notice
   c. Check daily reset
   d. Emit executor:tick_received event
   e. Query v3 EventQueue for pending events
   f. Query active workflows, memory state
   g. Build additionalContext with state + pending actions
   h. Return hook response

5. Claude processes the tick:
   - Reads additionalContext (injected state + actions)
   - Executes actions (spawn agents, call tools, etc.)
   - Results flow back through normal event system

6. On tick completion (detected via next UserPromptSubmit or session idle):
   a. Emit executor:tick_completed
   b. Persist spending to state store
   c. If daemon mode + clear_context_after_batch:
      - ContextClearer.clearContext()
      - Emits executor:context_clearing

7. Wait for next tick from system scheduler.
```

### 4.2 Mode Detection Priority

| Priority | Source | Mode | Detection |
|----------|--------|------|----------|
| 1 | Env var `GOODVIBES_EXECUTOR_MODE` | Any | Explicit |
| 2 | Config file `executor.mode` != 'engaged' | Any | Explicit |
| 3 | `TMUX` env var present + no `GOODVIBES_INTERACTIVE` | daemon | Inferred |
| 4 | Default | engaged | Default |

Hybrid mode is always explicit (set via config or env var). It is never inferred.

### 4.3 Budget System Architecture

```
ExecutorBudgetManager (this plan)
   |
   |-- Flat cap: total spend across all sessions
   |-- Daily cap: spend per calendar day (reset at daily_reset_hour)
   |-- Warning events at warning_threshold (default 80%)
   |-- Sources cost data from:
   |     |-- Agent BudgetTracker (in-process, per-agent cost_usd)
   |     |-- Analytics engine (cross-session totals, if available)
   |
   |-- Distinct from:
         |-- agents/BudgetTracker: per-agent token budgets
         |-- analytics-engine/budget-tracker: reporting & dashboards
```

**Cost data flow**:
1. Agent completes -> SubagentStop hook reports cost_usd
2. BudgetTracker (agents/) updates per-agent spending
3. ExecutorBudgetManager.recordSpending() called with the same cost_usd
4. ExecutorBudgetManager checks against flat_cap and daily_cap
5. If threshold crossed -> emit executor:budget_warning
6. If cap exceeded -> emit executor:budget_exceeded, set paused=true

### 4.4 Context Clearing Strategy

| Mode | Clearing | Mechanism |
|------|----------|----------|
| Engaged | Never | Context accumulates naturally |
| Hybrid | Never | Same as engaged (queued events processed between human interactions) |
| Daemon | After each batch | tmux send-keys "/clear" (primary) or queue injection (fallback) |

**tmux detection**: Check `process.env.TMUX` exists. If present, tmux is available.

**Fallback**: When tmux is not available or send-keys fails, the system enqueues a special event that the next tick's additionalContext will include as a `/clear` instruction. This is a degraded path -- context is not fully cleared but the instruction is delivered.

### 4.5 Backwards Compatibility

| Concern | Resolution |
|---------|------------|
| No executor config in existing runtime-config.json | `loadConfig` deep-merges with DEFAULT_CONFIG; missing executor section gets default values (engaged mode, no caps) |
| Existing tests don't know about executor | Default mode is `engaged`, which matches current behavior exactly (no tick processing, no clearing, no caps) |
| ProcessManager constructor signature | Unchanged -- reads executor from config like all other sections |
| Existing IPC queries | Unchanged -- new query kinds are additive |
| Existing hook scripts | Unchanged -- new tick detection is additive to existing UPS hook |
| Config handler | New keys added to allowlist -- existing keys unaffected |
| Event types | New executor:* events added to union -- existing events unaffected |

---

## 5. Test Specifications

### 5.1 ExecutorModeManager Tests

**File**: `src/lifecycle/__tests__/executor-mode.test.ts` (NEW)

| Test | Description |
|------|-------------|
| constructor defaults | Creates with engaged mode by default |
| detectMode explicit env | GOODVIBES_EXECUTOR_MODE=daemon -> daemon |
| detectMode explicit config | config.executor.mode='hybrid' -> hybrid |
| detectMode inferred tmux | TMUX set, no GOODVIBES_INTERACTIVE -> daemon |
| detectMode inferred tmux override | TMUX set + GOODVIBES_INTERACTIVE -> engaged |
| detectMode default | No env vars, default config -> engaged |
| detectMode priority | Env var overrides config |
| setMode runtime | Switch from engaged to hybrid at runtime |
| shouldProcessQueue engaged | Returns false |
| shouldProcessQueue daemon | Returns true |
| shouldProcessQueue hybrid | Returns true |
| shouldClearContext engaged | Returns false |
| shouldClearContext daemon | Returns true (when clear_context_after_batch) |
| shouldClearContext hybrid | Returns false |
| getMode | Returns current mode |

**Estimated**: ~15 tests

### 5.2 ExecutorBudgetManager Tests

**File**: `src/lifecycle/__tests__/executor-budget.test.ts` (NEW)

| Test | Description |
|------|-------------|
| no caps | canProcess() always true when no caps set |
| flat cap under | canProcess() true when spending below flat_cap |
| flat cap exceeded | canProcess() false when spending >= flat_cap |
| daily cap under | canProcess() true when daily spending below daily_cap |
| daily cap exceeded | canProcess() false when daily spending >= daily_cap |
| both caps, flat first | Flat cap triggers before daily |
| both caps, daily first | Daily cap triggers before flat |
| warning event flat | Emits executor:budget_warning at 80% of flat cap |
| warning event daily | Emits executor:budget_warning at 80% of daily cap |
| exceeded event | Emits executor:budget_exceeded when cap hit |
| warning fires once | Warning event not re-emitted after first fire |
| daily reset | Daily spending resets when checkDailyReset() detects new day |
| daily reset emits event | executor:budget_reset event emitted on reset |
| persist/restore roundtrip | Spending survives state store save/load |
| adjustBudget | Can increase cap at runtime |
| recordSpending accumulates | Multiple recordSpending calls sum correctly |
| custom warning threshold | 0.9 threshold fires at 90% |
| custom reset hour | Reset at hour 6 instead of midnight |

**Estimated**: ~20 tests

### 5.3 DaemonTickHandler Tests

**File**: `src/lifecycle/__tests__/daemon-tick-handler.test.ts` (NEW)

| Test | Description |
|------|-------------|
| handleTick increments counter | tick_number increases |
| handleTick checks budget | Aborts if budget exceeded |
| handleTick checks daily reset | Calls checkDailyReset before processing |
| handleTick emits tick_received | Event emitted at start |
| handleTick emits tick_completed | Event emitted at end |
| handleTick returns events_processed count | Accurate count |
| handleTick returns duration_ms | Non-zero, reasonable |
| buildTickContext includes workflows | Active workflows in context |
| buildTickContext includes memory | Runtime memory state in context |
| budget exceeded returns paused status | budget_status is 'exceeded' |
| budget warning returns warning status | budget_status is 'warning' |
| getTickCount | Returns cumulative tick count |

**Estimated**: ~15 tests

### 5.4 ContextClearer Tests

**File**: `src/lifecycle/__tests__/context-clearer.test.ts` (NEW)

| Test | Description |
|------|-------------|
| isTmuxAvailable true | TMUX env var set -> true |
| isTmuxAvailable false | No TMUX env var -> false |
| clearContext tmux success | Calls tmux send-keys, returns success |
| clearContext tmux failure | tmux command fails, falls back to queue |
| clearContext no tmux | Falls back to queue injection |
| clearViaTmux command format | Correct tmux send-keys command |
| clearViaTmux timeout | Times out after 5s |
| fallback queue injection | Enqueues /clear event |

**Estimated**: ~10 tests

### 5.5 Integration Tests (Modified Files)

Existing test files that need updates:

| File | Changes |
|------|--------|
| `src/lifecycle/__tests__/process-manager.test.ts` | Add tests for executor subsystem init, shutdown persistence, mode-aware tick timer |
| `src/ipc/__tests__/ipc-router.test.ts` | Add tests for new query kinds |
| `src/server/handlers/__tests__/config.test.ts` (if exists) | Add tests for new config keys |
| `src/shared/__tests__/utils.test.ts` | Verify DEFAULT_CONFIG includes executor section |

**Estimated**: ~20 additional tests across existing files

### 5.6 Total Test Estimate

| Category | Count |
|----------|-------|
| executor-mode.test.ts | ~15 |
| executor-budget.test.ts | ~20 |
| daemon-tick-handler.test.ts | ~15 |
| context-clearer.test.ts | ~10 |
| Modified existing tests | ~20 |
| **Total new tests** | **~80** |

---

## 6. Implementation Phases

### Phase 1: Types and Config (no behavior changes)

**Dependency**: None
**Risk**: Low (additive changes only)

| Step | File | Action | Details |
|------|------|--------|---------|
| 1.1 | `src/shared/config.ts` | MODIFY | Add ExecutorMode, DaemonConfig, ExecutorBudgetConfig, ExecutorConfig interfaces. Add executor to RuntimeConfig. Add defaults to DEFAULT_CONFIG. |
| 1.2 | `src/events/types.ts` | MODIFY | Add executor:* event types and payload types |
| 1.3 | `src/server/handlers/config.ts` | MODIFY | Add executor.* keys to VALID_CONFIG_KEYS and CONFIG_KEY_TYPES |
| 1.4 | `src/ipc/protocol.ts` | MODIFY | Add new query kinds to IPCQuery type |

**Validation**: `npx tsc --noEmit` passes. All 1721 existing tests pass.

### Phase 2: Core Executor Modules (new files)

**Dependency**: Phase 1
**Risk**: Medium (new code, but isolated)

| Step | File | Action | Details |
|------|------|--------|---------|
| 2.1 | `src/lifecycle/executor-mode.ts` | CREATE | ExecutorModeManager class |
| 2.2 | `src/lifecycle/executor-budget.ts` | CREATE | ExecutorBudgetManager class |
| 2.3 | `src/lifecycle/context-clearer.ts` | CREATE | ContextClearer class |
| 2.4 | `src/lifecycle/daemon-tick-handler.ts` | CREATE | DaemonTickHandler class |
| 2.5 | *(layer rationale documented)* | — | No barrel needed; direct imports from lifecycle/ |

**Validation**: TypeScript compiles. Unit tests for all 4 modules pass.

### Phase 3: Tests for New Modules

**Dependency**: Phase 2
**Risk**: Low

| Step | File | Action | Details |
|------|------|--------|---------|
| 3.1 | `src/lifecycle/__tests__/executor-mode.test.ts` | CREATE | ~15 tests |
| 3.2 | `src/lifecycle/__tests__/executor-budget.test.ts` | CREATE | ~20 tests |
| 3.3 | `src/lifecycle/__tests__/daemon-tick-handler.test.ts` | CREATE | ~15 tests |
| 3.4 | `src/lifecycle/__tests__/context-clearer.test.ts` | CREATE | ~10 tests |

**Validation**: All new tests pass. All existing tests still pass.

### Phase 4: Integration Wiring

**Dependency**: Phase 2
**Risk**: Medium (modifies existing modules)
**Can parallel with Phase 3**: No (both modify and test the same code)

| Step | File | Action | Details |
|------|------|--------|---------|
| 4.1 | `src/lifecycle/process-manager.ts` | MODIFY | Add executor subsystem init/shutdown, mode-aware tick timer |
| 4.2 | `src/ipc/ipc-router.ts` | MODIFY | Add new query handlers, new deps |
| 4.3 | `src/plugins/hooks/handlers/user-prompt-submit.ts` | MODIFY | Add daemon tick detection |
| 4.4 | `src/plugins/hooks/handlers/index.ts` | MODIFY | Pass new deps to UPS handler |

**Validation**: TypeScript compiles. All existing tests pass. Manual smoke test of mode detection.

### Phase 5: Integration Tests and Hook Script

**Dependency**: Phase 4
**Risk**: Low

| Step | File | Action | Details |
|------|------|--------|---------|
| 5.1 | `src/lifecycle/__tests__/process-manager.test.ts` | MODIFY | Add executor init/shutdown tests |
| 5.2 | `src/ipc/__tests__/ipc-router.test.ts` | MODIFY | Add new query kind tests |
| 5.3 | `plugins/goodvibes/hooks/scripts/src/user-prompt-submit-directives.mjs` | MODIFY | Add daemon tick detection to standalone hook |
| 5.4 | Build verification | `node build.mjs` | Full build passes |

**Validation**: All tests pass (existing + new). Build succeeds.

---

## 7. Dependency Graph

```
Phase 1 (Types & Config)
  |
  v
Phase 2 (Core Modules)     Phase 3 can start after 2 completes
  |                            |
  +---> Phase 3 (Tests)        |
  |                            |
  +---> Phase 4 (Wiring) -----+
          |
          v
        Phase 5 (Integration Tests + Hook)
```

**Critical path**: Phase 1 -> Phase 2 -> Phase 4 -> Phase 5
**Parallel opportunity**: Phase 3 (tests) can run in parallel with Phase 4 (wiring) IF an engineer works on Phase 4 while a tester writes Phase 3. However, Phase 4 may change interfaces that affect Phase 3 tests, so sequential is safer.

---

## 8. Scope Summary

### New Files (5 source + 1 barrel + 4 test = 10 total)

| File | Type | Est. Lines |
|------|------|------------|
| `src/lifecycle/executor-mode.ts` | Source | ~100 |
| `src/lifecycle/executor-budget.ts` | Source | ~180 |
| `src/lifecycle/daemon-tick-handler.ts` | Source | ~150 |
| `src/lifecycle/context-clearer.ts` | Source | ~80 |
| *(no barrel — direct imports)* | — | — |
| `src/lifecycle/__tests__/executor-mode.test.ts` | Test | ~200 |
| `src/lifecycle/__tests__/executor-budget.test.ts` | Test | ~300 |
| `src/lifecycle/__tests__/daemon-tick-handler.test.ts` | Test | ~250 |
| `src/lifecycle/__tests__/context-clearer.test.ts` | Test | ~150 |
| **Subtotal** | | **~1,420** |

### Modified Files (8)

| File | Est. Lines Changed |
|------|-------------------|
| `src/shared/config.ts` | ~60 (interfaces + defaults) |
| `src/events/types.ts` | ~30 (new event types + payloads) |
| `src/server/handlers/config.ts` | ~20 (new keys) |
| `src/ipc/protocol.ts` | ~10 (new query kinds) |
| `src/ipc/ipc-router.ts` | ~40 (new query handlers + deps) |
| `src/lifecycle/process-manager.ts` | ~60 (init + shutdown + accessors) |
| `src/plugins/hooks/handlers/user-prompt-submit.ts` | ~30 (tick detection) |
| `src/plugins/hooks/handlers/index.ts` | ~10 (pass deps) |
| **Subtotal** | **~260** |

### Total Estimated New/Modified Lines: ~1,680

### Test Count

| Source | Count |
|--------|-------|
| New test files (4) | ~60-80 |
| Modified existing tests | ~20 |
| **Total new tests** | **~80-100** |

---

## 9. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Config schema change breaks existing installs | Low | High | deepMerge with DEFAULT_CONFIG handles missing executor section; version guard on schema_version |
| tmux context clearing is unreliable | Medium | Medium | Fallback to queue injection; log failures; users can disable clear_context_after_batch |
| Budget tracking drifts from analytics engine | Medium | Low | ExecutorBudgetManager is a local tracker; analytics engine is source of truth for reporting |
| Daemon tick handler blocks too long | Low | Medium | Tick handler is async; timeout on all operations; tick skipping if previous tick still processing |
| ProcessManager startup order | Low | Medium | Executor init is after v3 plugins (which provide EventQueue, StateStore); null checks throughout |
| Existing test breakage from config change | Very Low | High | DEFAULT_CONFIG provides backwards-compatible defaults; executor defaults to engaged mode |

---

## 10. Decisions

### DEC-001: Executor budget is separate from agent budget

**What**: ExecutorBudgetManager (USD-based flat/daily caps) is a new module, not an extension of the existing agents/BudgetTracker (token-based per-agent budgets).

**Why**: Different concerns. Agent budgets control individual agent token spending. Executor budgets control total session/daily USD spending. They operate at different granularities and have different reset semantics.

### DEC-002: Mode detection uses environment variables, not IPC

**What**: Mode is detected at startup from env vars and config file, not queried from an external service.

**Why**: The runtime needs to know its mode before IPC is even started. Env vars are available immediately. Cron scripts can set `GOODVIBES_EXECUTOR_MODE=daemon` before launching.

### DEC-003: Context clearing uses tmux send-keys, not Claude API

**What**: Context is cleared by literally typing `/clear` into the tmux session.

**Why**: Claude Code's /clear is the only reliable way to reset conversation context. There is no API for it. tmux send-keys is the standard mechanism for scripting tmux sessions. Fallback to queue injection handles the no-tmux case.

### DEC-004: Hybrid mode does not clear context

**What**: Hybrid mode processes queued events between human interactions but never clears context.

**Why**: Hybrid is an engaged session that also handles background events. The human is present; context should accumulate as in engaged mode. Only pure daemon mode (no human) clears.

### DEC-005: Tick command is configurable, defaults to "tick"

**What**: The word that triggers a daemon tick is configurable via `executor.daemon.tick_command`.

**Why**: Avoids collision with other input patterns. Users might want a different trigger word. Default "tick" matches the planning docs.

### DEC-006: v3 tick timer is disabled in daemon mode

**What**: The internal 10s setInterval tick timer (startV3TickTimer) does not run in daemon mode.

**Why**: In daemon mode, ticks are externally driven by the system scheduler. Running an internal tick timer would process events between external ticks, defeating the batch-and-clear model. In engaged and hybrid modes, the internal timer continues to drive time events and external event scanning.

---

## 11. Future Considerations (Out of Scope)

These are noted for awareness but explicitly excluded from this implementation:

1. **Slash command support** (`/daemon`, `/engaged`, `/hybrid`) -- requires Claude Code extension API that does not exist today. Mode switching is config/env-var based for now.

2. **Analytics engine integration for cost tracking** -- ExecutorBudgetManager tracks locally. A future phase could have it query the analytics engine for cross-session totals via IPC.

3. **Multi-daemon coordination** -- Running multiple daemon sessions against the same project. Would need file-based locking on the event queue. Not needed for MVP.

4. **Daemon session auto-start** -- Automatically creating a tmux session and starting Claude Code in daemon mode. Users manage tmux sessions manually for now.

5. **Adaptive tick frequency** -- Adjusting tick interval based on queue depth or time of day. Fixed frequency per system scheduler for now.
