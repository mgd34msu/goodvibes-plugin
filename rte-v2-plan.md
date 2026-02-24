# Runtime Engine v2 — Implementation Plan

> Date: 2026-02-24 | Status: Ready for Implementation
> Prerequisite: v1 WRFC chain automation complete

---

## Overview

v2 validates the runtime engine is general-purpose — WRFC is just one pattern that emerges from the EventBus + TriggerRegistry + WorkflowEngine core. Four tiers, each building on the last.

**Dependency Graph:**
```
[Tier 1, Tier 2] -> Tier 3 -> Tier 4
  (parallel)       (needs     (independent)
                    Tier 2)
```

Tiers 1 and 2 can be implemented in parallel tonight. Tier 3 depends on Tier 2 (external events need durable state). Tier 4 is independent.

---

## Tier 1: Chain Types

**Goal**: Prove WRFC is just one pattern by implementing Fix Loop, Test-then-Fix, Review-Only, and Custom chain support.

**Estimated Scope**: ~6 new files, ~3 modified files, ~800 LOC

**Dependencies**: None (reuses all existing infrastructure)

### 1.1 Test-then-Fix Workflow Definition

**File**: `src/workflow/definitions/test-then-fix.ts` (NEW)

State machine: `IDLE -> TESTING -> FIXING -> RE_TESTING -> COMPLETE / ESCALATED`

```typescript
import type { WorkflowDefinition } from '../types.js';

export const TEST_THEN_FIX_DEFINITION: WorkflowDefinition = {
  id: 'test_then_fix',
  name: 'Test-then-Fix Loop',
  version: 1,
  initial_state: 'IDLE',
  terminal_states: ['COMPLETE', 'ESCALATED'],
  max_transitions: 50,
  states: {
    IDLE: {
      name: 'IDLE',
      transitions: [
        { event: 'workflow:created', target: 'TESTING' },
      ],
    },
    TESTING: {
      name: 'TESTING',
      on_enter: [
        { type: 'emit_event', config: { event_type: 'test_fix:testing_started' } },
      ],
      transitions: [
        // All tests pass — done
        {
          event: 'test_fix:tests_passed',
          target: 'COMPLETE',
        },
        // Tests failed — enter fix cycle
        {
          event: 'test_fix:tests_failed',
          target: 'FIXING',
        },
      ],
    },
    FIXING: {
      name: 'FIXING',
      on_enter: [
        { type: 'emit_event', config: { event_type: 'test_fix:fix_started' } },
      ],
      transitions: [
        // Fix complete, budget remaining — re-test
        {
          event: 'test_fix:fix_completed',
          target: 'RE_TESTING',
          guard: {
            type: 'expression',
            expression: 'context.fix_attempts < context.max_fix_attempts',
          },
        },
        // Budget exhausted — escalate
        {
          event: 'test_fix:fix_completed',
          target: 'ESCALATED',
          guard: {
            type: 'expression',
            expression: 'context.fix_attempts >= context.max_fix_attempts',
          },
        },
      ],
    },
    RE_TESTING: {
      name: 'RE_TESTING',
      on_enter: [
        { type: 'emit_event', config: { event_type: 'test_fix:retesting_started' } },
      ],
      transitions: [
        // Re-test passed — complete
        {
          event: 'test_fix:tests_passed',
          target: 'COMPLETE',
        },
        // Re-test failed — back to fixing
        {
          event: 'test_fix:tests_failed',
          target: 'FIXING',
        },
      ],
    },
    COMPLETE: {
      name: 'COMPLETE',
      on_enter: [
        { type: 'emit_event', config: { event_type: 'test_fix:completed' } },
      ],
      transitions: [],
    },
    ESCALATED: {
      name: 'ESCALATED',
      on_enter: [
        { type: 'emit_event', config: { event_type: 'test_fix:escalated' } },
      ],
      transitions: [],
    },
  },
};
```

**WorkflowContext extensions** (already supported via `[key: string]: unknown`):
- `test_command?: string` — the test command to run
- `test_output?: string` — last test output
- `test_failures?: string[]` — specific failing tests
- `fix_attempts: number` — initialized to 0
- `max_fix_attempts: number` — initialized to 5

### 1.2 Review-Only Workflow Definition

**File**: `src/workflow/definitions/review-only.ts` (NEW)

State machine: `IDLE -> REVIEWING -> COMPLETE`

```typescript
import type { WorkflowDefinition } from '../types.js';

export const REVIEW_ONLY_DEFINITION: WorkflowDefinition = {
  id: 'review_only',
  name: 'Review-Only',
  version: 1,
  initial_state: 'IDLE',
  terminal_states: ['COMPLETE'],
  max_transitions: 10,
  states: {
    IDLE: {
      name: 'IDLE',
      transitions: [
        { event: 'workflow:created', target: 'REVIEWING' },
      ],
    },
    REVIEWING: {
      name: 'REVIEWING',
      on_enter: [
        { type: 'emit_event', config: { event_type: 'review_only:review_started' } },
      ],
      transitions: [
        {
          event: 'review_only:review_completed',
          target: 'COMPLETE',
        },
      ],
    },
    COMPLETE: {
      name: 'COMPLETE',
      on_enter: [
        { type: 'emit_event', config: { event_type: 'review_only:completed' } },
      ],
      transitions: [],
    },
  },
};
```

### 1.3 Custom Workflow Loader

**File**: `src/workflow/definitions/custom-loader.ts` (NEW)

Loads user-defined workflow definitions from `goodvibes.json`.

```typescript
import type { WorkflowDefinition } from '../types.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('custom-loader');

/**
 * Validates and loads custom workflow definitions from goodvibes.json.
 *
 * Expected format in goodvibes.json:
 * {
 *   "runtime": {
 *     "workflows": [
 *       {
 *         "id": "my_custom_workflow",
 *         "name": "My Custom Workflow",
 *         "version": 1,
 *         "initial_state": "IDLE",
 *         "terminal_states": ["DONE"],
 *         "states": { ... }
 *       }
 *     ]
 *   }
 * }
 *
 * @param configPath - Path to goodvibes.json
 * @returns Array of validated WorkflowDefinition objects
 */
export async function loadCustomWorkflows(
  configPath: string,
): Promise<WorkflowDefinition[]> {
  // 1. Read and parse goodvibes.json
  // 2. Extract runtime.workflows array
  // 3. Validate each definition:
  //    - id must be non-empty, no builtin_ prefix
  //    - initial_state must exist in states
  //    - all terminal_states must exist in states
  //    - all transition targets must exist in states
  //    - all event types must be valid EventType strings
  //    - guard expressions must parse (no eval)
  // 4. Return validated definitions, log warnings for invalid ones
}

/**
 * Validates a single WorkflowDefinition.
 * Returns array of validation error strings (empty = valid).
 */
export function validateWorkflowDefinition(
  def: unknown,
): string[] {
  // Structural validation only — no eval of guard expressions
}
```

### 1.4 Test-then-Fix Handlers

**File**: `src/directives/test-fix-handlers.ts` (NEW)

Handler functions invoked by triggers when test-then-fix events fire.

```typescript
/**
 * Registered handlers:
 *
 * 1. test_fix_agent_completed
 *    - Called when an agent completes in a test_then_fix workflow
 *    - Runs the configured test command
 *    - Emits test_fix:tests_passed or test_fix:tests_failed
 *    - Signature: (args: { agent_id, workflow_id, test_command }, event) => void
 *
 * 2. test_fix_handle_failure
 *    - Called when tests fail
 *    - Increments fix_attempts on workflow context
 *    - Enqueues spawn directive for engineer to fix failures
 *    - Signature: (args: { workflow_id, test_output, failures }, event) => void
 *
 * 3. test_fix_handle_retest
 *    - Called when fix agent completes during RE_TESTING state
 *    - Re-runs tests
 *    - Emits test_fix:tests_passed or test_fix:tests_failed
 *    - Signature: (args: { workflow_id, test_command }, event) => void
 */
```

### 1.5 Review-Only Handlers

**File**: `src/directives/review-only-handlers.ts` (NEW)

```typescript
/**
 * Registered handlers:
 *
 * 1. review_only_agent_completed
 *    - Called when a reviewer completes in a review_only workflow
 *    - Extracts review score and issues from agent output (<gv> tags)
 *    - Updates workflow context with score and issues
 *    - Emits review_only:review_completed
 *    - Enqueues informational directive to orchestrator with score summary
 *    - Signature: (args: { agent_id, workflow_id, last_assistant_message }, event) => void
 */
```

### 1.6 New Trigger Definitions

**File**: `src/triggers/builtins.ts` (MODIFY)

Add 4 new built-in triggers:

```typescript
// ─── 11. Test-then-Fix: Start on build/test failure ────────────────────
{
  id: 'builtin_test_fix_start',
  name: 'test_fix_start',
  description: 'Start test-then-fix workflow when test:failed event occurs',
  enabled: true,
  priority: 15,
  condition: {
    type: 'event',
    event_type: 'test:failed',
  },
  action: {
    type: 'start_workflow',
    workflow_definition: 'test_then_fix',
    context_template: {
      trigger: 'test_failure',
      event_id: '$event.id',
      test_command: '$event.payload.data.test_command',
      test_output: '$event.payload.data.output',
      max_fix_attempts: 5,
      fix_attempts: 0,
    },
  },
  cooldown_ms: 120_000,
  max_fires: 5,
  fires_count: 0,
},

// ─── 12. Test-then-Fix: Agent completed handler ────────────────────────
{
  id: 'builtin_test_fix_agent_completed',
  name: 'test_fix_agent_completed',
  description: 'Handle agent completion in test-then-fix workflow',
  enabled: true,
  priority: 20,
  condition: {
    type: 'event',
    event_type: 'hook:agent:completed',
    // Note: handler checks if agent is in a test_then_fix workflow
  },
  action: {
    type: 'invoke_handler',
    handler: 'test_fix_agent_completed',
    args_template: {
      agent_id: '$event.payload.data.agent_id',
      agent_type: '$event.payload.data.agent_type',
      last_assistant_message: '$event.payload.data.last_assistant_message',
    },
  },
  cooldown_ms: 5_000,
  max_fires: 50,
  fires_count: 0,
},

// ─── 13. Review-Only: Start on review request ──────────────────────────
{
  id: 'builtin_review_only_start',
  name: 'review_only_start',
  description: 'Start review-only workflow when review:requested event occurs',
  enabled: true,
  priority: 25,
  condition: {
    type: 'event',
    event_type: 'review:requested',
  },
  action: {
    type: 'start_workflow',
    workflow_definition: 'review_only',
    context_template: {
      trigger: 'review_request',
      event_id: '$event.id',
      files: '$event.payload.data.files',
    },
  },
  cooldown_ms: 30_000,
  max_fires: 10,
  fires_count: 0,
},

// ─── 14. Review-Only: Agent completed handler ──────────────────────────
{
  id: 'builtin_review_only_agent_completed',
  name: 'review_only_agent_completed',
  description: 'Handle reviewer completion in review-only workflow',
  enabled: true,
  priority: 25,
  condition: {
    type: 'event',
    event_type: 'hook:agent:completed',
  },
  action: {
    type: 'invoke_handler',
    handler: 'review_only_agent_completed',
    args_template: {
      agent_id: '$event.payload.data.agent_id',
      last_assistant_message: '$event.payload.data.last_assistant_message',
    },
  },
  cooldown_ms: 5_000,
  max_fires: 30,
  fires_count: 0,
},
```

### 1.7 Registration Updates

**File**: `src/workflow/index.ts` (MODIFY)

```typescript
// Add exports:
export { TEST_THEN_FIX_DEFINITION } from './definitions/test-then-fix.js';
export { REVIEW_ONLY_DEFINITION } from './definitions/review-only.js';
export { loadCustomWorkflows, validateWorkflowDefinition } from './definitions/custom-loader.js';
```

**File**: `src/index.ts` (MODIFY)

Register new definitions and handlers during engine startup:

```typescript
// In startEngine():
workflowEngine.registerDefinition(TEST_THEN_FIX_DEFINITION);
workflowEngine.registerDefinition(REVIEW_ONLY_DEFINITION);

// Load custom workflows from goodvibes.json
const customWorkflows = await loadCustomWorkflows(configPath);
for (const def of customWorkflows) {
  workflowEngine.registerDefinition(def);
}

// Register new handlers with ActionExecutor
actionExecutor.registerHandler('test_fix_agent_completed', testFixAgentCompletedHandler);
actionExecutor.registerHandler('test_fix_handle_failure', testFixHandleFailureHandler);
actionExecutor.registerHandler('test_fix_handle_retest', testFixHandleRetestHandler);
actionExecutor.registerHandler('review_only_agent_completed', reviewOnlyAgentCompletedHandler);
```

### 1.8 New Event Types

**File**: `src/events/types.ts` (MODIFY)

Add to the EventType union:

```typescript
// Test-then-fix events
| 'test_fix:testing_started'
| 'test_fix:tests_passed'
| 'test_fix:tests_failed'
| 'test_fix:fix_started'
| 'test_fix:fix_completed'
| 'test_fix:retesting_started'
| 'test_fix:completed'
| 'test_fix:escalated'
// Review-only events
| 'review_only:review_started'
| 'review_only:review_completed'
| 'review_only:completed'
// External trigger events
| 'review:requested'
| 'test:failed'
| 'build:failed'
```

Note: `test:failed` and `build:failed` already appear in builtin triggers but may not be in the EventType union yet. Verify and add if missing.

### 1.9 WorkflowContext Extensions

**File**: `src/workflow/types.ts` (MODIFY)

Add to `WorkflowContext` interface:

```typescript
// ── Test-then-fix-specific context ──────────────────────────────────
/** The test command to run for verification. */
test_command?: string;
/** Last test execution output (truncated). */
test_output?: string;
/** List of specific test failures from the last run. */
test_failures?: string[];
```

### 1.10 Prerequisite: Event Emission Hooks

The v2 doc notes: "Currently nothing emits `build:failed` or `test:failed` events."

This requires a hook or monitoring process that:
1. Watches `precision_exec` results for build/test commands
2. Emits `build:failed` or `test:failed` events to the EventBus

**Implementation approach**: Add logic to the PostToolUse handler (or create a new handler) that detects when `precision_exec` runs build/test commands and emits appropriate events based on exit codes. This is a v3 concern (hooks inside runtime) but can be done in external hooks for now.

**Temporary file**: `plugins/goodvibes/hooks/scripts/src/post-tool-use/build-test-monitor.ts` (NEW) — emits `build:failed`/`test:failed` events via RuntimeClient when precision_exec build/test commands fail.

### Tier 1 Test Plan

```bash
# Unit tests for new workflow definitions
npx vitest run src/workflow/definitions/test-then-fix.test.ts
npx vitest run src/workflow/definitions/review-only.test.ts
npx vitest run src/workflow/definitions/custom-loader.test.ts

# Unit tests for new handlers
npx vitest run src/directives/__tests__/test-fix-handlers.test.ts
npx vitest run src/directives/__tests__/review-only-handlers.test.ts

# Integration: verify workflows advance through states correctly
npx vitest run src/workflow/__tests__/workflow-engine.test.ts

# Build verification
npx tsc --noEmit
```

### Tier 1 Files Summary

| File | Action | LOC Est. |
|------|--------|----------|
| `src/workflow/definitions/test-then-fix.ts` | CREATE | ~100 |
| `src/workflow/definitions/review-only.ts` | CREATE | ~50 |
| `src/workflow/definitions/custom-loader.ts` | CREATE | ~120 |
| `src/directives/test-fix-handlers.ts` | CREATE | ~200 |
| `src/directives/review-only-handlers.ts` | CREATE | ~80 |
| `src/triggers/builtins.ts` | MODIFY | +80 |
| `src/workflow/index.ts` | MODIFY | +3 |
| `src/index.ts` | MODIFY | +20 |
| `src/events/types.ts` | MODIFY | +15 |
| `src/workflow/types.ts` | MODIFY | +10 |
| Tests (4 files) | CREATE | ~400 |
| **Total** | | **~1078** |

---

## Tier 2: Durability

**Goal**: Event sourcing — reconstruct runtime state from `events.jsonl` on startup. State snapshots for fast startup. Checkpoint recovery for interrupted workflows.

**Estimated Scope**: ~4 new files, ~3 modified files, ~900 LOC

**Dependencies**: None (can be parallelized with Tier 1)

### 2.1 Event Replay Engine

**File**: `src/persistence/replay-engine.ts` (NEW)

Reads `events.jsonl` and replays events through the system to reconstruct state.

```typescript
import type { RuntimeEvent } from '../events/types.js';
import type { EventLog } from '../events/event-log.js';
import type { WorkflowEngine } from '../workflow/workflow-engine.js';
import type { TriggerRegistry } from '../triggers/trigger-registry.js';
import type { AgentCoordinator } from '../agents/agent-coordinator.js';
import type { AgentWorkflowMap } from '../directives/agent-workflow-map.js';
import type { SnapshotManager } from './snapshot-manager.js';
import { createLogger } from '../shared/logger.js';

const logger = createLogger('replay-engine');

export interface ReplayOptions {
  /** If true, skip action execution during replay (side effects already happened). */
  skipActions: boolean;
  /** If set, only replay events after this sequence number. */
  afterSequence?: number;
  /** If set, only replay events of these types. */
  eventTypes?: string[];
}

export interface ReplayResult {
  /** Number of events replayed. */
  eventsReplayed: number;
  /** Number of workflows reconstructed. */
  workflowsRestored: number;
  /** Number of agent bindings restored. */
  agentBindingsRestored: number;
  /** Number of trigger counts restored. */
  triggerCountsRestored: number;
  /** Elapsed time in milliseconds. */
  replayDurationMs: number;
  /** Sequence number of the last replayed event. */
  lastSequence: number;
}

/**
 * Replays events from EventLog through the runtime subsystems to
 * reconstruct state after a restart.
 *
 * Replay is deterministic: given the same event sequence, the same
 * state is produced. Side effects (agent spawning, event emission)
 * are skipped during replay.
 *
 * @param eventLog - The EventLog to read events from
 * @param deps - Runtime subsystems to replay into
 * @param options - Replay configuration
 * @returns ReplayResult with statistics
 */
export async function replayEvents(
  eventLog: EventLog,
  deps: {
    workflowEngine: WorkflowEngine;
    triggerRegistry: TriggerRegistry;
    agentCoordinator: AgentCoordinator;
    agentWorkflowMap: AgentWorkflowMap;
  },
  options: ReplayOptions,
): Promise<ReplayResult> {
  // Implementation steps:
  // 1. Get latest snapshot sequence (if snapshot exists)
  // 2. Read events from EventLog.since(afterSequence)
  // 3. For each event (in order):
  //    a. If workflow event (workflow:created, wrfc:*, fix:*, test_fix:*)
  //       -> Rebuild workflow instance state
  //    b. If agent event (agent:spawned, agent:completed)
  //       -> Restore AgentWorkflowMap bindings
  //       -> Restore AgentCoordinator state
  //    c. If trigger-relevant event
  //       -> Update trigger fires_count and last_fired
  //    d. Skip ALL action execution (skipActions=true)
  // 4. Return replay statistics
}

/**
 * Rebuilds a single workflow instance from its event history.
 * Used during replay to reconstruct workflow state.
 */
function replayWorkflowEvent(
  workflowEngine: WorkflowEngine,
  event: RuntimeEvent,
): void {
  // Determine if this is a workflow lifecycle event
  // If workflow:created -> create instance with stored context
  // If state transition event -> advance workflow state
  // If workflow completed/failed -> mark terminal
}

/**
 * Rebuilds trigger state (fire counts, last_fired timestamps).
 */
function replayTriggerEvent(
  triggerRegistry: TriggerRegistry,
  event: RuntimeEvent,
): void {
  // Check if event matches any trigger condition
  // Increment fires_count without executing actions
  // Update last_fired timestamp
}
```

### 2.2 Snapshot Manager

**File**: `src/persistence/snapshot-manager.ts` (NEW)

Periodic JSON snapshots of runtime state for fast startup.

```typescript
import type { StateStore } from './types.js';
import type { WorkflowInstance } from '../workflow/types.js';
import type { TriggerDefinition } from '../triggers/types.js';
import { createLogger } from '../shared/logger.js';

const logger = createLogger('snapshot-manager');

/** Snapshot schema persisted to StateStore. */
export interface RuntimeSnapshot {
  /** Monotonic version for forward compatibility. */
  version: 1;
  /** ISO timestamp when the snapshot was taken. */
  timestamp: string;
  /** EventLog sequence number at snapshot time. */
  lastEventSequence: number;
  /** All active (non-terminal) workflow instances. */
  workflows: WorkflowInstance[];
  /** Agent-to-workflow bindings. */
  agentWorkflowBindings: Array<{ agentId: string; workflowId: string }>;
  /** Trigger fire counts and last_fired times. */
  triggerState: Array<{
    triggerId: string;
    firesCount: number;
    lastFired?: number;
  }>;
  /** Agent coordinator state. */
  agentState: Array<{
    agentId: string;
    agentType: string;
    status: string;
    workflowId?: string;
  }>;
}

export class SnapshotManager {
  private readonly store: StateStore;
  private readonly snapshotKey = 'runtime_snapshot';
  private snapshotInterval: NodeJS.Timeout | null = null;

  constructor(store: StateStore) { this.store = store; }

  /**
   * Take a snapshot of current runtime state.
   *
   * @param deps - Current state of all subsystems
   * @param eventSequence - Current EventLog sequence number
   */
  async takeSnapshot(
    deps: {
      workflowEngine: WorkflowEngine;
      agentWorkflowMap: AgentWorkflowMap;
      triggerRegistry: TriggerRegistry;
      agentCoordinator: AgentCoordinator;
    },
    eventSequence: number,
  ): Promise<void> {
    // 1. Build RuntimeSnapshot from current subsystem state
    // 2. Persist to StateStore under 'runtime_snapshot' key
    // 3. Log snapshot stats
  }

  /**
   * Load the latest snapshot, if one exists.
   * Returns null if no snapshot found or if snapshot is corrupted.
   */
  async loadSnapshot(): Promise<RuntimeSnapshot | null> {
    // 1. Read from StateStore
    // 2. Validate version number
    // 3. Return parsed snapshot or null
  }

  /**
   * Start periodic snapshots at the given interval.
   * Default: every 60 seconds.
   */
  startPeriodicSnapshots(
    deps: { /* same as takeSnapshot */ },
    intervalMs: number = 60_000,
  ): void {
    // setInterval -> takeSnapshot
  }

  /** Stop periodic snapshots. */
  stopPeriodicSnapshots(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
  }
}
```

Storage location: `.goodvibes/runtime/state/runtime_snapshot.json` (via existing FileStateStore).

### 2.3 Startup Recovery Flow

**File**: `src/persistence/startup-recovery.ts` (NEW)

Orchestrates the startup recovery sequence.

```typescript
import type { ReplayResult } from './replay-engine.js';
import type { RuntimeSnapshot } from './snapshot-manager.js';

export interface RecoveryResult {
  /** How state was recovered. */
  method: 'snapshot_plus_replay' | 'full_replay' | 'cold_start';
  /** Snapshot used (if any). */
  snapshot?: RuntimeSnapshot;
  /** Replay statistics (if replay was needed). */
  replay?: ReplayResult;
  /** Total recovery time in milliseconds. */
  recoveryDurationMs: number;
}

/**
 * Recovers runtime state on startup.
 *
 * Strategy:
 * 1. Try to load snapshot from StateStore
 * 2. If snapshot exists:
 *    a. Restore subsystem state from snapshot
 *    b. Replay only events AFTER snapshot's lastEventSequence
 * 3. If no snapshot:
 *    a. Full replay from events.jsonl (all events)
 * 4. If no events.jsonl:
 *    a. Cold start (no state to recover)
 */
export async function recoverState(
  eventLog: EventLog,
  snapshotManager: SnapshotManager,
  deps: { /* subsystems */ },
): Promise<RecoveryResult> {
  const start = Date.now();

  // 1. Try snapshot
  const snapshot = await snapshotManager.loadSnapshot();

  if (snapshot) {
    // 2a. Restore from snapshot
    restoreFromSnapshot(snapshot, deps);
    // 2b. Replay delta
    const replay = await replayEvents(eventLog, deps, {
      skipActions: true,
      afterSequence: snapshot.lastEventSequence,
    });
    return {
      method: 'snapshot_plus_replay',
      snapshot,
      replay,
      recoveryDurationMs: Date.now() - start,
    };
  }

  // 3. Full replay
  const latestSeq = eventLog.getLatestSequence();
  if (latestSeq > 0) {
    const replay = await replayEvents(eventLog, deps, {
      skipActions: true,
    });
    return {
      method: 'full_replay',
      replay,
      recoveryDurationMs: Date.now() - start,
    };
  }

  // 4. Cold start
  return {
    method: 'cold_start',
    recoveryDurationMs: Date.now() - start,
  };
}

/**
 * Restores subsystem state from a snapshot.
 * Does NOT replay events — just populates in-memory state.
 */
function restoreFromSnapshot(
  snapshot: RuntimeSnapshot,
  deps: { /* subsystems */ },
): void {
  // WorkflowEngine: re-create instances from snapshot.workflows
  // AgentWorkflowMap: restore bindings from snapshot.agentWorkflowBindings
  // TriggerRegistry: restore fire counts from snapshot.triggerState
  // AgentCoordinator: restore agent states from snapshot.agentState
}
```

### 2.4 Integration with Engine Startup

**File**: `src/index.ts` (MODIFY)

```typescript
// In startEngine(), AFTER subsystem initialization, BEFORE accepting IPC:
import { recoverState } from './persistence/startup-recovery.js';
import { SnapshotManager } from './persistence/snapshot-manager.js';

const snapshotManager = new SnapshotManager(stateStore);

// Recover state from last session
const recovery = await recoverState(eventLog, snapshotManager, {
  workflowEngine,
  triggerRegistry,
  agentCoordinator,
  agentWorkflowMap,
});
logger.info('State recovery complete', recovery);

// Start periodic snapshots
snapshotManager.startPeriodicSnapshots(
  { workflowEngine, agentWorkflowMap, triggerRegistry, agentCoordinator },
  60_000,  // every 60s
);

// On shutdown: take final snapshot
process.on('SIGTERM', async () => {
  await snapshotManager.takeSnapshot(deps, eventLog.getLatestSequence());
  snapshotManager.stopPeriodicSnapshots();
});
```

### 2.5 WorkflowEngine Modifications

**File**: `src/workflow/workflow-engine.ts` (MODIFY)

Add methods for replay support:

```typescript
/**
 * Restores a workflow instance directly (bypassing normal create flow).
 * Used during replay/snapshot recovery.
 */
restoreInstance(instance: WorkflowInstance): void {
  this.instances.set(instance.id, instance);
}

/**
 * Returns all active (non-terminal) workflow instances.
 * Used by SnapshotManager to capture state.
 */
getActiveInstances(): WorkflowInstance[] {
  return Array.from(this.instances.values())
    .filter(i => i.status === 'active');
}

/**
 * Returns all workflow instances (including terminal).
 * Used for full state dump.
 */
getAllInstances(): WorkflowInstance[] {
  return Array.from(this.instances.values());
}
```

### 2.6 TriggerRegistry Modifications

**File**: `src/triggers/trigger-registry.ts` (MODIFY)

Add methods for state restoration:

```typescript
/**
 * Restores trigger fire counts from a snapshot.
 * Used during startup recovery.
 */
restoreTriggerState(
  state: Array<{ triggerId: string; firesCount: number; lastFired?: number }>,
): void {
  for (const s of state) {
    const trigger = this.triggers.get(s.triggerId);
    if (trigger) {
      trigger.fires_count = s.firesCount;
      trigger.last_fired = s.lastFired;
    }
  }
}

/**
 * Returns current trigger states for snapshotting.
 */
getTriggerStates(): Array<{ triggerId: string; firesCount: number; lastFired?: number }> {
  return Array.from(this.triggers.values()).map(t => ({
    triggerId: t.id,
    firesCount: t.fires_count,
    lastFired: t.last_fired,
  }));
}
```

### Tier 2 Test Plan

```bash
# Unit tests
npx vitest run src/persistence/__tests__/replay-engine.test.ts
npx vitest run src/persistence/__tests__/snapshot-manager.test.ts
npx vitest run src/persistence/__tests__/startup-recovery.test.ts

# Integration: full cycle test
# 1. Create workflows, fire events, take snapshot
# 2. Destroy in-memory state
# 3. Recover from snapshot + replay
# 4. Verify state matches pre-destruction state

# Build verification
npx tsc --noEmit
```

### Tier 2 Files Summary

| File | Action | LOC Est. |
|------|--------|----------|
| `src/persistence/replay-engine.ts` | CREATE | ~250 |
| `src/persistence/snapshot-manager.ts` | CREATE | ~200 |
| `src/persistence/startup-recovery.ts` | CREATE | ~150 |
| `src/workflow/workflow-engine.ts` | MODIFY | +30 |
| `src/triggers/trigger-registry.ts` | MODIFY | +25 |
| `src/index.ts` | MODIFY | +20 |
| Tests (3 files) | CREATE | ~450 |
| **Total** | | **~1125** |

---

## Tier 3: External Event Sources (Architecture Overview)

**Goal**: Accept events from outside the Claude Code session — webhooks, timers, file watchers, agent-to-agent.

**Estimated Scope**: ~8 new files, ~2 modified files, ~1200 LOC

**Dependencies**: Tier 2 (external events need durable state)

### Architecture

New module: `src/external/`

```
src/external/
  types.ts              # ExternalSource interface, SourceConfig
  source-manager.ts     # Lifecycle management for all sources
  webhook-server.ts     # HTTP endpoint -> RuntimeEvent
  scheduler.ts          # Cron/timer -> RuntimeEvent  
  file-watcher.ts       # FS events -> RuntimeEvent
  agent-event.ts        # <gv> emit parsing -> RuntimeEvent
  index.ts              # Barrel exports
```

### Key Decisions

1. **Webhook server**: Lightweight HTTP server (Node.js `http.createServer`) on configurable port. NOT extending the IPC server — different protocol, different auth model.
   - Auth: API key header + optional HMAC signature verification (GitHub)
   - Payload mapping: Configurable per-source template `external_payload -> RuntimeEvent`
   - Rate limiting: Token bucket per source IP

2. **Scheduler**: `node-cron` library for cron expressions. One-shot timers via `setTimeout`.
   - Configuration in `goodvibes.json` under `runtime.schedules`
   - Each schedule maps to an event type + optional payload template

3. **File watcher**: `chokidar` for cross-platform FS events.
   - Watch patterns configured in `goodvibes.json`
   - Debounce: 500ms default to avoid spam
   - Maps FS events to `file:changed`, `file:created`, `file:deleted`

4. **Agent-to-agent**: Extend `<gv>` tag parser to support `{"emit": "custom:event", "data": {...}}`.
   - Parsed during SubagentStop processing
   - Emitted directly to EventBus
   - Enables pipeline patterns without orchestrator involvement

### Implementation Order

1. Webhook server (most immediately useful — CI/CD integration)
2. Scheduler (enables periodic health checks)
3. Agent-to-agent events (extends existing <gv> protocol)
4. File watcher (useful but lower priority)

---

## Tier 4: Observability & Control (Architecture Overview)

**Goal**: Real-time visibility into runtime state — dashboard, event streaming, replay debugging.

**Estimated Scope**: ~6 new files, ~2 modified files, ~1000 LOC

**Dependencies**: None (can be done at any point, but most useful after Tier 2)

### Architecture

New module: `src/observability/`

```
src/observability/
  types.ts              # MetricPoint, DashboardState, StreamEvent
  metrics-collector.ts  # Collects and aggregates runtime metrics
  event-streamer.ts     # SSE/WebSocket endpoint for live events
  replay-debugger.ts    # Step-through event replay with breakpoints
  dashboard.ts          # Aggregated dashboard state builder
  index.ts              # Barrel exports
```

### Key Decisions

1. **Event streaming**: Server-Sent Events (SSE) over HTTP — simpler than WebSocket, sufficient for one-way streaming. Same HTTP server as webhooks (Tier 3) or standalone.

2. **Metrics**: In-memory metrics collector. Tracks:
   - Event throughput (events/minute by type)
   - Workflow completion rates and durations
   - Agent spawn/complete rates
   - Review score distribution
   - Trigger fire rates and skip rates

3. **Replay debugger**: Step-through `events.jsonl` with:
   - Forward/backward stepping
   - Breakpoints on event type or state transition
   - State display at each step
   - Accessible via new MCP tool: `runtime_replay`

4. **Manual intervention**: New MCP tool commands:
   - `runtime_workflow pause <workflow_id>`
   - `runtime_workflow resume <workflow_id>`
   - `runtime_workflow cancel <workflow_id>`
   - These modify WorkflowInstance.status and emit events

---

## Verification Commands

All tiers:

```bash
# From runtime-engine directory:
cd plugins/goodvibes/tools/implementations/runtime-engine

# Type checking
npx tsc --noEmit

# Full test suite
npx vitest run

# Specific tier tests
npx vitest run src/workflow/definitions/  # Tier 1 workflows
npx vitest run src/directives/            # Tier 1 handlers
npx vitest run src/persistence/            # Tier 2 durability

# Build the engine
node build.mjs
```

---

## Backward Compatibility

All v1 WRFC functionality MUST keep working through all v2 changes:

- WRFC workflow definition: unchanged
- WRFC handlers (wrfc_chain_next, wrfc_review_response, wrfc_fix_response, wrfc_agent_spawned): unchanged
- WRFC triggers (builtin_wrfc_*): unchanged
- <gv> tag protocol: extended (new `emit` field) but backward compatible
- EventBus, EventQueue, EventLog: extended (new event types) but backward compatible
- TriggerRegistry: new methods (restoreTriggerState, getTriggerStates) are additive
- WorkflowEngine: new methods (restoreInstance, getActiveInstances, getAllInstances) are additive
- StateStore: no changes to interface
- IPC protocol: no changes
- MCP tools: no changes (Tier 4 adds new tools but doesn't modify existing ones)

Principle 8 from the v2 doc: "Backward compatibility — v1 WRFC must keep working through all v2 changes."
