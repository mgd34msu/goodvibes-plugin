# Batch Engine - Complete Deep Dive

> Comprehensive reference for all batch-engine tools, runtime internals, type system, and implementation status.
> Generated 2026-02-18 from full source analysis of `plugins/goodvibes/tools/implementations/batch-engine/`.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tool 1: batch](#tool-1-batch)
- [Tool 2: batch_status](#tool-2-batch_status)
- [Tool 3: batch_list](#tool-3-batch_list)
- [Tool 4: batch_checkpoints](#tool-4-batch_checkpoints)
- [Tool 5: batch_recover](#tool-5-batch_recover)
- [Tool 6: batch_state](#tool-6-batch_state)
- [Runtime System](#runtime-system)
  - [Agent Pool](#agent-pool)
  - [Checkpoint Manager](#checkpoint-manager)
  - [Context Gatherer](#context-gatherer)
  - [Fix Loop](#fix-loop)
  - [Hooks Handlers](#hooks-handlers)
- [Operation Type System](#operation-type-system)
- [Mode System](#mode-system)
- [Recovery & Rollback](#recovery--rollback)
- [Memory, State & Telemetry](#memory-state--telemetry)
- [Agent System](#agent-system)
- [Implementation Status](#implementation-status)
- [YAML Examples](#yaml-examples)
- [File Reference](#file-reference)

---

## Architecture Overview

The batch engine is the orchestration core of GoodVibes plugin, providing transactional batch operations with recovery, checkpointing, and multi-agent coordination. It exposes **6 MCP tools** and is built on a layered architecture:

```
+---------------------------------------------+
|              MCP Tool Layer                  |
|  batch | batch_status | batch_list           |
|  batch_checkpoints | batch_recover           |
|  batch_state                                 |
+---------------------------------------------+
|              Handler Layer                   |
|  handleBatch | handleBatchStatus             |
|  handleListBatches | handleBatchRecover      |
|  handleListCheckpoints | handleBatchState    |
+---------------------------------------------+
|              Runtime Layer                   |
|  AgentPool | Checkpoint | Context            |
|  FixLoop | HooksHandlers                     |
+---------------------------------------------+
|              Interface Layer                 |
|  Operations | Results | Recovery | Rollback  |
|  State | Memory | Telemetry | Mode | Hooks   |
|  Agent | Lifecycle | Commands | Skills       |
+---------------------------------------------+
```

### Execution Flow

```
User -> batch tool call
  |
Input Validation -> Config Merge -> Batch ID Generation
  |
Dry-Run Check (return preview if dry_run=true)
  |
Runtime Initialization -> Checkpoint Creation
  |
Before Validation (typecheck, lint, test, build)
  |
Phase Execution Loop (discovery -> read -> write -> exec -> query -> state)
|  Each phase: executePhase() -> collect results -> check fail_fast
  |
After Validation
  |
Status Determination (success | partial | failed | rolled_back)
|  If failed + rollback_on_fail -> restore checkpoint -> status = rolled_back
  |
Telemetry Recording -> State Persistence -> Checkpoint Cleanup
  |
Result Formatting -> Return BatchToolOutput
```

### Key Design Patterns

| Pattern | Usage |
|---------|-------|
| Discriminated Unions | Type-safe operation variants with literal discriminants |
| Event-Driven | Agent pool, recovery, runtime events, memory changes |
| Strategy | Fix strategies (auto -> agent -> targeted) |
| Factory/Singleton | Runtime creation, fix loop, context gatherer |
| Lifecycle Hooks | 13+ hook points across batch and operation levels |
| Checkpoint-Based Recovery | Pre-batch snapshots for rollback |
| Context Injection | Relevant memory injected at operation/agent level |

---

## Tool 1: batch

> Execute a batch of operations with transaction support, validation, and recovery. The heart of SPEC-v2 orchestration.

### Schema

```yaml
name: batch
description: Execute a batch of operations with transaction support, validation, and recovery.

parameters:
  discovery:          # Optional - gather context before operations
    queries: object[]
    inject_results: boolean

  operations:         # Operations grouped by phase
    read: object[]    # File reads, searches, globs, symbols, URLs, analysis
    write: object[]   # Creates, edits, deletes, moves, copies, atomic
    exec: object[]    # Commands, agents, scripts
    query: object[]   # LSP, validation, diagnosis
    state: object[]   # Get, set, delete, list, track, query

  config: object      # Transaction, execution, validation, recovery config
  dry_run: boolean    # Preview without executing
  preview: boolean    # DEPRECATED - alias for dry_run
  timeout_ms: number  # Timeout for batch execution
  verbosity: enum     # count_only | minimal | standard | verbose

required: []          # All parameters optional
```

### Phase Execution Order

Phases always execute in this fixed order:

```
discovery -> read -> write -> exec -> query -> state
```

Only phases with operations are executed. Each phase runs its operations (potentially in parallel within the phase), collects results, and checks `fail_fast` before proceeding.

### BatchConfig

```typescript
interface BatchConfig {
  transaction: {
    mode: 'atomic' | 'partial' | 'none';  // Default: atomic
    isolation: string;
    timeout_ms: number;
  };
  execution: {
    mode: 'parallel' | 'sequential' | 'adaptive';
    max_workers: number;       // Default: 10
    fail_fast: boolean;
    retry: { max: number; delay_ms: number; backoff: string };
  };
  preview: {
    dry_run: boolean;
    diff: boolean;
    impact: boolean;
  };
  validation: {
    enabled: boolean;
    before: ValidationStep[];  // typecheck, lint, test, build, env, etc.
    after: ValidationStep[];
    on_fail: string;
  };
  recovery: {
    checkpoint: boolean;       // Create checkpoint before execution
    rollback_on_fail: boolean; // Rollback on failure
    cleanup_on_success: boolean;
  };
}
```

### Output

```typescript
interface BatchToolOutput {
  batch_id: string;
  status: 'success' | 'partial' | 'failed' | 'rolled_back' | 'dry_run';
  result?: BatchResult;
  preview?: BatchPreview;
  errors?: BatchError[];
  duration_ms: number;
  tokens_used: number;
}
```

### Dry-Run Preview

When `dry_run: true`, returns a preview instead of executing:

```typescript
interface BatchPreview {
  phases: PhasePreview[];
  total_operations: number;
  estimated_tokens: number;
  estimated_duration_ms: number;
  files_affected: string[];
  commands_to_run: string[];
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_factors: string[];
}
```

### Example

```yaml
batch:
  operations:
    read:
      - files:
          - { path: "src/types.ts", extract: symbols }
          - { path: "src/auth/config.ts", extract: content }
    write:
      - files:
          - { path: "src/auth/types.ts", content: "export interface User { id: string; }" }
          - { path: "src/auth/index.ts", content: "export * from './types';" }
    exec:
      - commands:
          - { cmd: "npm run typecheck", expect: { exit_code: 0 } }
  config:
    transaction: { mode: atomic }
  verbosity: minimal
```

---

## Tool 2: batch_status

> Check the status of a batch execution, including progress, results, and agent status.

### Schema

```yaml
name: batch_status

parameters:
  batch_id: string    # REQUIRED - ID of the batch to check
  include:
    results: boolean  # Include operation results
    telemetry: boolean # Include telemetry data
    operations: boolean # Include operation details
    agents: boolean   # Include agent status
  verbosity: enum     # count_only | minimal | standard | verbose

required: [batch_id]
```

### Batch Status States (8)

```
pending -> running -> completing -> completed
                   \-> paused
                   \-> failed -> rolled_back
                   \-> cancelled
```

### Progress Tracking

```typescript
interface BatchProgress {
  current_phase: BatchPhase;
  completed_phases: BatchPhase[];
  pending_phases: BatchPhase[];
  operations_total: number;
  operations_completed: number;
  operations_failed: number;
  operations_pending: number;
  percent_complete: number;
  estimated_remaining_ms?: number;
}
```

### Operation & Agent Status

```typescript
interface OperationStatus {
  id: string;
  type: string;
  phase: BatchPhase;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  tokens_used?: number;
  error?: string;
}

interface AgentStatus {
  agent_id: string;
  operation_id: string;
  agent_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tokens_used: number;
  turns_used: number;
}
```

---

## Tool 3: batch_list

> List all batches, optionally filtered by status or time range.

### Schema

```yaml
name: batch_list

parameters:
  status: string[]    # Filter: pending, running, paused, completing, completed, failed, rolled_back, cancelled
  limit: number       # Max results (default: 50)
  since: string       # ISO timestamp - only batches after this time
  until: string       # ISO timestamp - only batches before this time
  verbosity: enum     # count_only | minimal | standard | verbose

required: []
```

### Output

```typescript
interface ListBatchesOutput {
  batches: BatchHistoryEntry[];
  total: number;
  has_more: boolean;
}

interface BatchHistoryEntry {
  batch_id: string;
  started_at: string;
  completed_at?: string;
  status: BatchStatus;
  operations_count: number;
  tokens_used: number;
  duration_ms: number;
}
```

---

## Tool 4: batch_checkpoints

> List available checkpoints for recovery.

### Schema

```yaml
name: batch_checkpoints

parameters:
  batch_id: string       # Filter by batch ID
  limit: number          # Max results
  include_expired: boolean # Include expired checkpoints (default: false)
  verbosity: enum        # count_only | minimal | standard | verbose

required: []
```

### Output

```typescript
interface CheckpointSummary {
  id: string;              // Format: cp_YYYYMMDD_HHMMSS
  batch_id?: string;
  created_at: string;
  expires_at?: string;
  size_bytes: number;      // NOTE: Currently hardcoded to 0
  file_count: number;
  reason: string;          // batch_start, before_risky_operation, manual_request, scheduled
}
```

### Checkpoint Storage Structure

```
.goodvibes/checkpoints/
|-- index.json                    # Global checkpoint index
+-- cp_YYYYMMDD_HHMMSS/
    |-- manifest.json             # Metadata, file list, checksums
    |-- state.json                # Session + memory snapshot
    +-- files/                    # Backed up files (hashed paths)
```

---

## Tool 5: batch_recover

> Recovery operations: rollback, restore, retry, cleanup, or fix failed operations.

### Schema

```yaml
name: batch_recover

parameters:
  operation: string    # REQUIRED: rollback | restore | retry | cleanup | fix

  rollback:
    batch_id: string
    checkpoint_id: string
    scope: string      # all | files | state | selective
    files: string[]    # Specific files to rollback
    state_keys: string[] # Specific state keys to rollback

  restore:
    checkpoint_id: string  # REQUIRED for restore
    files_only: boolean
    state_only: boolean

  retry:
    batch_id: string       # REQUIRED for retry
    operation_ids: string[]
    max_attempts: number

  cleanup:
    older_than_hours: number
    keep_last: number
    dry_run: boolean

  fix:
    batch_id: string       # REQUIRED for fix
    operation_id: string
    strategy: string       # auto | agent | targeted
    max_attempts: number

  verbosity: enum

required: [operation]
```

### Operation Details

#### Rollback (FULLY IMPLEMENTED)
Restores files and/or state from a checkpoint. Supports selective rollback by specific files or state keys.

```typescript
interface RollbackResult {
  success: boolean;
  scope: RollbackScope;
  target: RollbackTarget;
  files_restored: string[];
  files_failed: string[];
  state_restored: string[];
  state_failed: string[];
  duration_ms: number;
  checkpoint_used?: string;
  errors?: string[];
}
```

#### Restore (FULLY IMPLEMENTED)
Restores from a specific checkpoint with options for files-only or state-only.

#### Retry (FULLY IMPLEMENTED)
Extracts failed operations from a completed batch and re-executes them by recursively calling handleBatch().

**Limitation**: Only works for batches in the current process session (in-memory storage).

#### Cleanup (FULLY IMPLEMENTED)
Removes old checkpoints based on age and retention count. Supports dry-run.

```typescript
interface CleanupOutput {
  checkpoints_removed: number;
  bytes_freed: number;
  checkpoints_remaining: number;
  items_skipped: number;
  errors?: string[];
}
```

#### Fix (STUB - NOT FULLY IMPLEMENTED)
Creates action objects for each error type but **does not execute them**:
- **auto_fix**: Marks eslint/prettier/tsc commands but does not run them
- **agent_fix**: Returns "Agent spawning not implemented in this handler"
- **targeted_fix**: Same as agent_fix

The fix operation breaks after the first attempt and returns all errors as remaining_errors.

---

## Tool 6: batch_state

> Manage persistent state and memory: get, set, query, export, import, or clear.

### Schema

```yaml
name: batch_state

parameters:
  operation: string    # REQUIRED: get | set | query | export | import | clear

  get:
    keys: string[]     # Dot-notation paths (e.g., session.mode, agents.active)

  set:
    values: object     # Key-value pairs to set
    merge: boolean     # Merge with existing (default: true)

  query:
    type: string       # decisions | patterns | failures | all
    filters:
      category: string
      files: string[]
      since: string
      limit: number
      status: string

  export:
    format: string     # json | markdown
    include: string[]  # state | memory | telemetry
    output_path: string

  import:
    format: string     # json
    source: string|object # File path, JSON string, or inline data
    merge: boolean

  clear:
    targets: string[]  # state | memory | telemetry | checkpoints
    confirm: boolean   # MUST be true to confirm clear

  verbosity: enum

required: [operation]
```

### State Keys (Dot Notation)

| Key | Description |
|-----|-------------|
| session | Full session state |
| session.id | Session ID |
| session.mode | Current mode (vibecoding/justvibes) |
| session.health | Health check results |
| session.git | Git branch/commit/status |
| agents | Full agent state |
| agents.active | Active agents map |
| agents.completed | Completed agents list |
| checkpoints | Checkpoint state |
| locks | Active locks |
| memory.* | Memory entries |

### Memory Query Example

```yaml
batch_state:
  operation: query
  query:
    type: failures
    filters:
      error_type: typescript_error
      resolved: false
      since: "2026-02-01T00:00:00Z"
      limit: 10
```

---

## Runtime System

The runtime layer provides the execution engine behind the tool handlers. Located in src/runtime/.

### Agent Pool

**File**: src/runtime/agent-pool.ts (2,106 lines)
**Status**: FULLY IMPLEMENTED

Two main classes:

#### AgentPoolImpl

Manages agent capacity, queuing, budget tracking, and event dispatch.

```typescript
class AgentPoolImpl {
  config: AgentPoolConfig;     // max_concurrent: 6, queue_strategy, budgets
  state: AgentPoolState;       // active Map, queued[], completed[], token tracking

  // Core operations
  enqueue(spec: AgentSpec): string;           // Add to queue, sort by depth
  dequeue(id: string): boolean;               // Remove from queue
  spawnNext(): Promise<ActiveAgent | null>;   // Spawn next if capacity/budget
  recordCompletion(id: string, result): void; // Record completion, update budget
  cancel(id: string): boolean;                // Cancel active agent

  // Budget management
  getBudgetStatus(): BudgetStatus;
  hasBudget(spec: AgentSpec): boolean;
  canSpawn(spec: AgentSpec): boolean;
  getAvailableSlots(): number;

  // Events
  on(event: AgentPoolEvent, handler): void;
  off(event: AgentPoolEvent, handler): void;
}
```

**Events**: agent_queued, agent_started, agent_completed, agent_failed, agent_timeout, agent_cancelled, budget_warning, budget_exhausted, queue_empty

**Defaults**:
- max_concurrent: 6
- default_budget: 100k tokens, 50 turns, 300s
- total_budget: 1M tokens, 50 agents, warn at 80%
- queue_strategy: dependency-based

#### AgentLifecycleManagerImpl

Manages individual agent lifecycle: spawn, monitor, complete, cancel, timeout.

```typescript
class AgentLifecycleManagerImpl {
  spawn(spec: AgentSpec): Promise<SpawnResult>;
  spawnBatch(specs: AgentSpec[]): Promise<SpawnResult[]>;
  monitor(agent_id: string): MonitorResult;     // health: healthy|slow|stuck|over_budget
  monitorAll(): MonitorResult[];
  complete(agent_id: string, result?, error?): CompletionResult;
  cancel(agent_id: string, reason?): CompletionResult;
  timeout(agent_id: string): CompletionResult;
}
```

---

### Checkpoint Manager

**File**: src/runtime/checkpoint.ts (805 lines)
**Status**: FULLY IMPLEMENTED

Two classes:

#### CheckpointFileManagerImpl

Low-level file operations for checkpoint persistence.

```typescript
class CheckpointFileManagerImpl {
  createCheckpointDir(id: string): Promise<string>;
  writeManifest(id, manifest): Promise<void>;
  readManifest(id): Promise<CheckpointManifest | null>;
  copyFileToCheckpoint(id, sourcePath, entry): Promise<void>;
  restoreFileFromCheckpoint(id, entry): Promise<boolean>;
  writeState(id, state): Promise<void>;
  readState(id): Promise<CheckpointStateSnapshot | null>;
  updateIndex(entry): Promise<void>;
  deleteCheckpoint(id): Promise<boolean>;
  verifyIntegrity(id): Promise<{ valid: boolean; errors: string[] }>;
}
```

#### CheckpointManagerImpl

High-level checkpoint lifecycle management.

```typescript
class CheckpointManagerImpl {
  create(config: CheckpointConfig): Promise<Checkpoint>;
  // For each file: computes SHA-256 hash, size, permissions, mtime
  // Snapshots session state + memory
  // Creates manifest with checksum

  restore(checkpoint_id, options?): Promise<RestoreResult>;
  // Hash verification before restoration
  // Selective restore: files_only, state_only, specific files
  // Permission preservation on Unix

  cleanup(options?): Promise<CleanupResult>;
  // Removes expired checkpoints, frees disk space

  verify(id): Promise<VerifyResult>;
  // Full integrity verification with hash validation
}
```

**Storage**: .goodvibes/checkpoints/{id}/ with manifest.json, state.json, files/

---

### Context Gatherer

**File**: src/runtime/context.ts (975 lines)
**Status**: MOSTLY IMPLEMENTED (MCP dispatch is stub, has real fallback)

```typescript
class ContextGathererImpl {
  // Session-level context
  gatherSessionContext(): Promise<SessionContext>;
  // Calls detectStack(), checkHealth(), loadGitStatus(), loadPreferences() in parallel

  // Batch-level context
  gatherBatchContext(batch_id): Promise<BatchContext>;
  // Analyzes scope, loads relevant memory, assesses risk, resolves dependencies

  // Operation-level context
  gatherOperationContext(operation_id): Promise<OperationContext>;
  // Loads prior results, resolves variable injections

  // Agent-level context
  gatherAgentContext(agent_id): Promise<AgentContext>;
  // Full agent context with batch info, constraints, prior results, risk data
}
```

**Stack Detection**: Tries MCP detect_stack first, falls back to detectStackFallback() which reads package.json and analyzes dependencies.

**Caching**: 5-minute TTL for stack detection and health checks.

---

### Fix Loop

**File**: src/runtime/fix-loop.ts (618 lines)
**Status**: FULLY IMPLEMENTED

```typescript
class FixLoopImpl {
  run(context: FixContext): Promise<FixResult>;
  // Loops up to max_attempts (default 3)
  // Exponential backoff: 1000ms * 2^(attempt-2)
  // Routes to strategy-specific handler per attempt

  executeAttempt(context, strategy, errors): Promise<FixAttemptResult>;
  // auto_fix: Runs built-in fixers (eslint --fix, prettier --write, tsc, import fixer, test re-run)
  // agent_fix: Spawns fix agent with error context
  // targeted_fix: Spawns specialized agents by error type

  getStrategy(attempt: number): FixStrategy;
  registerAutoFixer(type: FixableErrorType, fixer: AutoFixer): void;
}
```

**Error Type to Strategy Mapping**:

| Error Type | Strategy 1 | Strategy 2 | Strategy 3 |
|-----------|-----------|-----------|------------|
| typescript_error | auto_fix | agent_fix | targeted_fix |
| lint_error | auto_fix | targeted_fix | - |
| format_error | auto_fix | - | - |
| import_error | auto_fix | targeted_fix | - |
| test_failure | agent_fix | targeted_fix | - |
| build_error | auto_fix | agent_fix | - |
| runtime_error | agent_fix | targeted_fix | - |

**Built-in Fixers**: ESLint (--fix), Prettier (--write), TypeScript (--noEmit analysis), Import resolver, Test re-runner.

---

### Hooks Handlers

**File**: src/runtime/hooks-handlers.ts (802 lines)
**Status**: FULLY IMPLEMENTED

```typescript
class BuiltinHookHandlers {
  // Session hooks
  initSession(context): Promise<void>;     // Load persisted state/memory/telemetry
  cleanupSession(context): Promise<void>;  // Persist all + cleanup checkpoints

  // Checkpoint hooks
  createCheckpoint(context): Promise<string>;  // Create savepoint, return ID
  restoreCheckpoint(context): Promise<void>;   // Restore from savepoint

  // Batch hooks
  preBatch(context): Promise<void>;   // Checkpoint + gather context + validate
  postBatch(context): Promise<void>;  // Record metrics + update status + persist

  // Operation hooks
  preOperation(context): Promise<void>;   // Validate + gather context + check deps
  postOperation(context): Promise<void>;  // Record result + trigger fix if failed

  // Agent hooks
  preAgent(context): Promise<void>;   // Gather context + validate budget
  postAgent(context): Promise<void>;  // Record completion + trigger checkpoint

  // Recovery hooks
  onError(context): Promise<void>;     // Emergency checkpoint + classify + fix loop
  onRollback(context): Promise<void>;  // Restore checkpoint + clear state
}
```

**30+ Hook Events**: session_start/end, batch_start/end, operation_start/end/error/retry, agent_start/end/spawn/complete, checkpoint_create/restore, rollback_start/end, fix_loop_start/end/iteration, validate_before/after, mode_change, memory_record/query, telemetry_emit.

---

## Operation Type System

The batch engine supports **24 operation types** across 5 categories, all defined as discriminated unions with type guards.

### READ Operations (6 types)

| Type | Description | Key Parameters |
|------|-------------|----------------|
| files | Read file contents | targets[], extract: content/outline/symbols/ast/lines |
| search | Pattern search | pattern, mode: regex/semantic/fuzzy, glob?, context |
| glob | File pattern matching | patterns[], exclude?, filters (size, date, content) |
| symbols | Symbol search | query, kinds?, scope? |
| url | URL fetching | targets[], extract: raw/markdown/text/structured |
| analyze | Code analysis | kind: dependencies/dead_code/circular_deps/tech_debt/bundle/coverage/stack/api_surface/breaking_changes |

### WRITE Operations (6 types)

| Type | Description | Key Parameters |
|------|-------------|----------------|
| create | Create files | files: CreateSpec[], overwrite?, create_dirs?, template? |
| edit | Edit files | edits: EditSpec[], match_mode: exact/regex/ast/fuzzy |
| delete | Delete files | files[], require_empty?, max_files?, blocked_paths[] |
| move | Move files | moves: MoveSpec[], update_imports? |
| copy | Copy files | copies: CopySpec[], transform? |
| atomic | Atomic transaction | operations: WriteOperation[], rollback_on_failure? |

### EXEC Operations (3 types)

| Type | Description | Key Parameters |
|------|-------------|----------------|
| command | Shell commands | commands: CommandSpec[], timeout_ms?, expect: {exit_code, stdout_contains} |
| agent | Agent spawning | agents: AgentSpec[], budget?, model: haiku/sonnet/opus, chain_on_complete? |
| script | Script execution | scripts: ScriptSpec[], language: bash/python/node/deno/bun |

### QUERY Operations (3 types)

| Type | Description | Key Parameters |
|------|-------------|----------------|
| lsp | LSP queries | queries: LspQuery[], operations: definition/references/hover/signature/completion/diagnostics/code_actions/rename/call_hierarchy/type_hierarchy |
| validate | Validation | validations: ValidationSpec[], types: typecheck/lint/test/build/env/api_contract/secrets/permissions |
| diagnose | Diagnosis | diagnoses: DiagnosisSpec[], kinds: error_stack/type_error/runtime_error/performance/memory_leak/bundle_size |

### STATE Operations (6 types)

| Type | Description | Key Parameters |
|------|-------------|----------------|
| get | Retrieve state | keys[] |
| set | Store state | entries: SetEntry[], merge? |
| delete_state | Remove state | keys[] |
| list | List keys | prefix? |
| track | Record entries | entries: TrackEntry[], kinds: decision/pattern/failure/task/metric |
| query | Search entries | filters (kind, date, keywords) |

### Result Types

Every operation type has a corresponding result type with:
- id, type, status (success/failed/skipped)
- data (operation-specific)
- error?, duration_ms, tokens_used, retries?

Phase-level aggregation via PhaseResult, batch-level via BatchResult with:
- summary: status, operation counts, duration, tokens
- phases: per-phase results
- validation: before/after results
- recovery: checkpoint_id, rollback info
- execution_graph: phases, parallel groups, critical_path_ms

---

## Mode System

Two built-in modes control batch behavior across all dimensions.

### Mode Configurations

| Aspect | vibecoding | justvibes |
|--------|-----------|----------|
| **Communication** | | |
| show_progress | true | false |
| explain_decisions | true | false |
| ask_on_ambiguity | true (ask_user_with_options) | false (best_guess) |
| report_results | detailed | minimal |
| **Execution** | | |
| auto_chain | false | true |
| max_autonomous_batches | 1 | unlimited |
| checkpoint_frequency | per_batch | per_phase |
| parallel_agents | 3 | 6 |
| auto_recovery_on_blocker | true | true |
| **Recovery** | | |
| on_issue | ask_user_with_options | fix_review_loop |
| on_error | ask_user_with_options | fix_and_continue |
| on_other | ask_user | choose_best_option_silent |
| max_fix_attempts | 3 | 3 |
| **Output** | | |
| default_mode | standard | minimal |
| show_diffs | true | false |
| show_telemetry | summary | none |

### Mode-Aware Behavior Functions

```typescript
shouldAskUser(mode, situation): boolean;   // vibecoding: true on ambiguity; justvibes: false
getOutputMode(mode, operation): OutputMode;
handleError(mode, error): ErrorAction;     // halt | ask | log | fix_loop
formatResult(mode, result): string;
```

### ModeManager

```typescript
interface ModeManager {
  currentMode: ModeConfig;
  setMode(name: ModeName): Promise<void>;
  listModes(): ModeName[];
  pushMode(name): void;    // Nested mode stack
  popMode(): void;
}
```

Custom modes loadable from .goodvibes/config/modes.json.

---

## Recovery & Rollback

### 3-Tier Recovery Architecture

```
Tier 1: Fix Loop
  | (if fix fails)
Tier 2: Checkpoint Restore
  | (if no checkpoint)
Tier 3: Full Rollback
```

### Recovery Modes (5 levels)

| Mode | Behavior |
|------|----------|
| none | No recovery |
| checkpoint | Create checkpoints only |
| auto_rollback | Rollback on failure |
| fix_loop | Attempt automatic fixes |
| full | Fix + rollback + checkpoint |

### Rollback System

```typescript
interface RollbackSystem {
  toCheckpoint(checkpoint_id, scope?): Promise<RollbackResult>;
  lastBatch(): Promise<RollbackResult>;
  operations(operation_ids[]): Promise<RollbackResult>;
  selective(options): Promise<RollbackResult>;  // Specific files/state_keys
  preview(target, scope?): Promise<RollbackPreview>;  // Dry-run
  canRollback(target): boolean;
}
```

**Rollback Scopes**: all (files + state + memory), files, state, selective

**Rollback Targets**: checkpoint, batch, time-based, operation-specific

**Safety**: Pre-rollback backup checkpoint, SHA-256 hash verification, lock-based serialization.

### Recovery Orchestrator

```typescript
interface RecoveryOrchestrator {
  prepareBatch(batch, config): Promise<Checkpoint | null>;
  handleOperationFailure(context): Promise<RecoveryDecision>;
  handleBatchFailure(context): Promise<RecoveryResult>;
  executeAction(action, context): Promise<RecoveryResult>;
}
```

**Recovery Actions**: fix, rollback, abort, continue, ask_user

**Decision Drivers**: mode_config, error_type, user_request

---

## Memory, State & Telemetry

### Memory System

Stored in .goodvibes/memory/:

| File | Format | Content |
|------|--------|--------|
| decisions.md | Markdown | Architectural choices |
| patterns.md | Markdown | Proven approaches |
| failures.md | Markdown | Failure records |
| preferences.json | JSON | User/project preferences |
| index.json | JSON | Search index |

**Memory Types**:

```typescript
interface Decision {
  id: string;                    // dec_YYYYMMDD_HHMMSS
  timestamp: string;
  what: string;
  why: string;
  category: 'architecture' | 'library' | 'pattern' | 'convention' | 'performance' | 'security' | 'testing' | 'deployment';
  confidence: 'high' | 'medium' | 'low';
  status: 'active' | 'superseded' | 'reverted';
  files?: string[];
  symbols?: string[];
  batch_id?: string;
  agent_id?: string;
  superseded_by?: string;
}

interface Pattern {
  id: string;                    // pat_YYYYMMDD_HHMMSS
  name: string;
  description: string;
  examples: { file: string; lines: [number, number]; code?: string }[];
  when_to_use: string;
  when_not_to_use?: string;
  usage_count: number;
  discovered_in?: string;
}

interface Failure {
  id: string;                    // fail_YYYYMMDD_HHMMSS
  timestamp: string;
  error_type: string;
  error_message: string;
  stack_trace?: string;
  operation?: string;
  files?: string[];
  resolved: boolean;
  resolution?: string;
  resolution_batch?: string;
  root_cause?: string;
  prevention?: string;
}
```

**Core type compatibility**: Bidirectional conversion utilities (toCoreDecision/fromCoreDecision, etc.) enable interop with plugins/goodvibes/src/core/memory.ts.

### State System

Stored in .goodvibes/state/:

```typescript
interface GoodVibesState {
  session: SessionState;     // ID, mode, current batch, health, git, files tracked
  agents: AgentState;        // active Map, completed[], total spawned/tokens
  checkpoints: CheckpointState;
  locks: LockState;          // Distributed locks for resource coordination
}
```

**Session tracking**: batches_completed, operations_completed, tokens_used, last typecheck/lint/test/build results, git branch/commit/uncommitted files, files modified/created/deleted this session.

### Telemetry System

Stored in .goodvibes/telemetry/:

```typescript
interface Telemetry {
  session: SessionMetrics;
  batches: Map<string, BatchMetrics>;
  operations: Map<string, OperationMetrics>;
  agents: Map<string, AgentMetrics>;
  aggregations: Aggregations;   // Hourly/daily, by type, trends
}
```

**Metrics hierarchy**: Session -> Batch -> Operation -> Agent

**Analysis features**:
- Cost estimation using model-specific rates (haiku/sonnet/opus)
- Token usage projection
- Bottleneck identification with impact metrics
- Trend analysis (up/down/stable)
- Multi-format export (JSON, markdown, CSV)

---

## Agent System

### Agent Types (9)

| Agent | Role |
|-------|------|
| goodvibes:backend-engineer | Backend implementation |
| goodvibes:frontend-architect | Frontend architecture |
| goodvibes:fullstack-integrator | Full-stack integration |
| goodvibes:test-engineer | Test writing |
| goodvibes:brutally-honest-reviewer | Code review |
| goodvibes:code-architect | Architecture design |
| goodvibes:devops-deployer | DevOps/deployment |
| goodvibes:content-platform | Content platform |
| goodvibes:workflow-planner | Workflow planning |

### Agent Specification

```typescript
interface AgentSpec {
  id: string;
  agent: AgentType;
  task: string;
  scope: string[];
  constraints: string[];
  budget: AgentBudget;     // max_tokens, max_turns, max_duration_ms
  model: 'haiku' | 'sonnet' | 'opus';
  inject?: Record<string, unknown>;
  chain_on_complete?: AgentSpec;
  depends_on?: string[];
}
```

### Access Presets

| Preset | Read | Write | Exec | Query | Spawn |
|--------|------|-------|------|-------|-------|
| DEFAULT | yes | yes | yes | yes | no |
| ELEVATED | yes | yes | yes | yes | yes (max 3) |
| READONLY | yes | no | no | yes | no |

### Dependency Resolution

```typescript
interface DependencyResolver {
  buildGraph(specs: AgentSpec[]): DependencyGraph;
  checkCycles(graph): CycleCheckResult;
  resolve(graph): ResolutionResult;     // Produces ExecutionPlan
  topologicalSort(graph): string[];
  groupByPhase(graph): ExecutionPhase[];
  calculateCriticalPath(graph): { path: string[]; duration_ms: number };
}
```

**Dependency types**: hard (must complete), soft (preferred), data (needs specific output)

### Inter-Agent Communication

```typescript
interface AgentCommunication {
  shareResults(from, to, key, data): void;
  getSharedResults(agent_id): SharedResult[];
  broadcast(from, message, data): void;
  request(request: AgentRequest): Promise<AgentResponse>;  // With timeout
  send(from, to, message): void;
  receive(agent_id): AgentMessage[];
  waitForAgent(agent_id, timeout_ms): Promise<CompletedAgent>;
}
```

**Message types**: data, status, request, response, broadcast, error
**Message priorities**: low, normal, high, urgent

### Prompt Building

```typescript
interface PromptBuilder {
  build(agent_type, variables): BuiltPrompt;
  buildFromSpec(spec, context): BuiltPrompt;
  getTemplate(agent_type): PromptTemplate;
  registerTemplate(template): void;
  estimateTokens(prompt): number;
  truncateToFit(prompt, max_tokens): BuiltPrompt;
}
```

**Default prompt sections** (in order): role, task, scope, constraints, context, prior_results, decisions, patterns, failures, budget, output_format.

**Context injection defaults**: 5 decisions, 3 patterns, 3 failures, prior results enabled.

---

## Implementation Status

### Fully Implemented (Production-Ready)

| Component | Lines | Status |
|-----------|-------|--------|
| handleBatch - Core batch orchestration | ~300 | REAL |
| handleBatchStatus - Status tracking | ~180 | REAL |
| handleListBatches - Batch history | ~120 | REAL |
| handleListCheckpoints - Checkpoint queries | ~90 | REAL |
| handleBatchState - State CRUD + memory query | ~200 | REAL |
| handleBatchRecover - Rollback, restore, retry, cleanup | ~200 | REAL |
| AgentPoolImpl - Pool management | 460 | REAL |
| AgentLifecycleManagerImpl - Agent lifecycle | 495 | REAL |
| CheckpointFileManagerImpl - File operations | 190 | REAL |
| CheckpointManagerImpl - Checkpoint lifecycle | 490 | REAL |
| ContextGathererImpl - Context gathering | 770+ | MOSTLY REAL |
| FixLoopImpl - Fix strategies | 420 | REAL |
| BuiltinHookHandlers - Lifecycle hooks | 750 | REAL |
| MCP Server (BatchEngineServer) | ~90 | REAL |
| Logging (stderr-based) | ~40 | REAL |
| Phase execution loop | ~50 | REAL |
| Validation runner | ~50 | REAL |
| Preview generator | ~50 | REAL |

### Stubs / Incomplete

| Component | Status | Details |
|-----------|--------|--------|
| executeFix() in batch_recover | STUB | Creates action objects but does not execute them. Auto-fix does not run commands. Agent-fix returns "not implemented". |
| executeReadOperation() in batch handler | Delegate | Returns note that READ ops handled by precision-engine (by design) |
| executeWriteOperation() in batch handler | Delegate | Same - delegates to precision-engine |
| executeAgentOperation() in batch handler | STUB | Returns "Agent execution stub" |
| executeLspOperation() in batch handler | STUB | LSP queries not connected |
| executeDiagnoseOperation() in batch handler | STUB | Returns "Diagnostic operations stub" |
| executeMCPTool() in context.ts | STUB | Returns mock data; has real fallback (detectStackFallback) |
| size_bytes in checkpoint summaries | Hardcoded | Always returns 0, comment: "Would need to calculate" |

### Overall: ~85% Complete

The core batch execution pipeline is production-ready. The primary gaps are:
1. **Fix operation** in batch_recover (strategy execution is stubbed)
2. **Agent spawning** within batch operations
3. **LSP/Diagnose** query operations
4. **MCP tool dispatch** in context (falls back to real alternative)

---

## YAML Examples

### Simple: Rename Function

```yaml
# rename-function.yaml
operations:
  read:
    - type: search
      id: find-usages
      pattern: "\\bgetUserData\\b"
      glob: "src/**/*.{ts,tsx}"
      exclude: ["**/node_modules/**", "**/dist/**"]
    - type: search
      id: find-definition
      pattern: "export.*function getUserData"
      glob: "src/**/*.ts"
    - type: search
      id: find-types
      pattern: "getUserData"
      glob: "src/**/*.d.ts"

  write:
    - type: edit
      id: rename-all
      edits:
        - file: "**/*.{ts,tsx}"
          edits:
            - find: "getUserData"
              replace: "fetchUserProfile"
              occurrence: all
      options:
        match_mode: exact

  exec:
    - type: command
      id: typecheck
      commands:
        - { cmd: "npx tsc --noEmit", expect: { exit_code: 0 } }
    - type: command
      id: lint
      commands:
        - { cmd: "npx eslint src/", expect: { exit_code: 0 } }

config:
  transaction: { mode: atomic }
  output: { mode: minimal, show_diffs: false }
```

### Complex: Auth Feature

```yaml
# auth-feature.yaml
operations:
  read:
    - type: search
      id: find-auth-patterns
      pattern: "useAuth|getSession|withAuth"
      glob: "src/**/*.{ts,tsx}"
    - type: search
      id: check-deps
      pattern: "next-auth|@auth"
      glob: "package.json"
    - type: glob
      id: find-structure
      patterns: ["src/app/api/**/*.ts", "src/lib/**/*.ts"]
    - type: search
      id: find-models
      pattern: "model User|interface User"
      glob: "**/*.{ts,prisma}"

  exec:
    - type: agent
      id: backend-auth
      agents:
        - agent: "goodvibes:backend-engineer"
          task: "Implement authentication backend with NextAuth.js"
          budget: { max_tokens: 50000 }
          model: sonnet
          inject:
            auth_patterns: "{{find-auth-patterns.results}}"
    - type: agent
      id: frontend-auth
      agents:
        - agent: "goodvibes:frontend-architect"
          task: "Implement authentication UI components"
          model: sonnet
          depends_on: [backend-auth]
    - type: command
      id: validate
      commands:
        - { cmd: "npx tsc --noEmit", expect: { exit_code: 0 } }
        - { cmd: "npx eslint src/", expect: { exit_code: 0 } }
        - { cmd: "npm run build", expect: { exit_code: 0 } }

  state:
    - type: track
      id: record-decision
      entries:
        - kind: decision
          data:
            what: "Implemented NextAuth.js authentication"
            why: "Industry standard, supports multiple providers"
            category: architecture

config:
  transaction: { mode: atomic }
  recovery:
    checkpoint: true
    rollback_on_fail: true
  validation:
    after: [typecheck, lint, build]
```

### Complex: Repository Pattern Refactor

```yaml
# repository-pattern.yaml
operations:
  read:
    - type: search
      id: find-prisma-calls
      pattern: "prisma\\.|db\\."
      glob: "src/**/*.ts"
    - type: search
      id: find-imports
      pattern: "import.*prisma|import.*db"
      glob: "src/**/*.ts"
    - type: glob
      id: find-structure
      patterns: ["src/repositories/**/*.ts", "src/services/**/*.ts"]
    - type: search
      id: find-existing-repos
      pattern: "Repository|repository"
      glob: "src/**/*.ts"
    - type: analyze
      id: analyze-schema
      kind: api_surface
      target: "prisma/schema.prisma"

  exec:
    - type: agent
      id: architect
      agents:
        - agent: "goodvibes:code-architect"
          task: "Design repository pattern interfaces for all Prisma models"
          model: opus
    - type: agent
      id: engineer
      agents:
        - agent: "goodvibes:backend-engineer"
          task: "Implement repository pattern per architect design"
          model: sonnet
          depends_on: [architect]
    - type: agent
      id: reviewer
      agents:
        - agent: "goodvibes:brutally-honest-reviewer"
          task: "Review repository pattern implementation"
          model: sonnet
          depends_on: [engineer]
    - type: command
      id: validate
      commands:
        - { cmd: "npx tsc --noEmit", expect: { exit_code: 0 } }
        - { cmd: "npx eslint src/", expect: { exit_code: 0 } }
        - { cmd: "npm test", expect: { exit_code: 0 } }

  query:
    - type: validate
      id: verify-no-direct-db
      validations:
        - type: custom
          pattern: "prisma\\."
          scope: "src/!(repositories)/**/*.ts"
          expect: { count: 0 }

  state:
    - type: track
      id: track-pattern
      entries:
        - kind: pattern
          data:
            name: "Repository Pattern"
            description: "All DB access via repository interfaces"
            when_to_use: "Any data access operation"

config:
  transaction: { mode: atomic }
  recovery:
    checkpoint: true
    rollback_on_fail: true
  execution:
    mode: sequential
```

---

## File Reference

### Source Files

```
plugins/goodvibes/tools/implementations/batch-engine/
|-- src/
|   |-- index.ts                          # MCP Server (BatchEngineServer)
|   |-- logging.ts                        # stderr-based logging
|   |-- handlers/
|   |   |-- index.ts                      # Handler registry (6 handlers)
|   |   |-- batch.ts                      # handleBatch (~1800 lines)
|   |   |-- batch-status.ts              # handleBatchStatus + handleListBatches
|   |   |-- batch-recover.ts             # handleBatchRecover + handleListCheckpoints
|   |   +-- batch-state.ts              # handleBatchState
|   |-- runtime/
|   |   |-- agent-pool.ts               # AgentPoolImpl + AgentLifecycleManagerImpl
|   |   |-- checkpoint.ts               # CheckpointFileManagerImpl + CheckpointManagerImpl
|   |   |-- context.ts                  # ContextGathererImpl
|   |   |-- fix-loop.ts                # FixLoopImpl
|   |   +-- hooks-handlers.ts          # BuiltinHookHandlers
|   +-- interfaces/                      # ~65 type definition files
|       |-- batch.ts                     # Batch, BatchConfig
|       |-- operation.ts                 # OperationType, OperationBase
|       |-- result.ts                    # BatchResult, PhaseResult, OperationResult
|       |-- context.ts                   # SessionContext, BatchContext
|       |-- runtime.ts                   # GoodVibesRuntime, BatchEngine
|       |-- lifecycle.ts                 # LifecycleHooks (13 hook points)
|       |-- commands.ts                  # 4 user commands (/batch, /status, /recover, /mode)
|       |-- operations/
|       |   |-- read.ts                  # 6 read operation types
|       |   |-- write.ts                 # 6 write operation types
|       |   |-- exec.ts                  # 3 exec + 3 query + 6 state types
|       |   +-- results.ts              # All result types + type guards
|       |-- tools/                       # Tool-level interfaces
|       |   |-- batch-tool.ts
|       |   |-- batch-status.ts
|       |   |-- batch-recover.ts
|       |   |-- batch-state.ts
|       |   |-- discover.ts
|       |   +-- index.ts                # ToolRegistry, ToolManager, ToolExecutor
|       |-- agent-*.ts                   # 7 agent system files
|       |-- mode*.ts                     # 4 mode system files
|       |-- hooks-*.ts / batch-hooks.ts  # 5 hooks system files
|       |-- checkpoint*.ts               # 2 checkpoint files
|       |-- memory*.ts                   # 3 memory files
|       |-- state*.ts                    # 3 state files
|       |-- telemetry*.ts                # 3 telemetry files
|       |-- recovery.ts                  # Recovery orchestrator
|       |-- rollback.ts                  # Rollback system
|       |-- fix-loop.ts                  # Fix loop types
|       |-- fix-strategies.ts            # Strategy implementations
|       |-- skill-registry.ts            # Skill management
|       |-- skills-core.ts / skills-stacks.ts
|       |-- context-gathering.ts
|       |-- template.ts / templates.ts
|       |-- plugin-manifest.ts / plugin-structure.ts
|       |-- project-structure.ts
|       |-- output-style-*.ts            # Mode output styles
|       |-- mcp-config.ts
|       |-- integration-testing.ts
|       +-- verification/                # 6 architecture verification files
|-- docs/
|   +-- CHECKPOINT_MANAGER.md
|-- examples/
|   +-- checkpoint-example.ts
|-- __tests__/                           # 20 test files
|-- *.md                                 # 7 implementation docs
|-- package.json
|-- tsconfig.json
|-- vitest.config.ts
+-- build.mjs
```

### Tool Definitions

```
plugins/goodvibes/tools/definitions/batch-engine/
|-- batch.yaml
|-- batch-checkpoints.yaml
|-- batch-list.yaml
|-- batch-recover.yaml
|-- batch-state.yaml
+-- batch-status.yaml
```

### YAML Examples

```
plugins/goodvibes/examples/batches/
|-- README.md
|-- add-api-endpoint.yaml
|-- auth-feature.yaml
|-- rename-function.yaml
+-- repository-pattern.yaml
```

---

## Transaction Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| atomic | All-or-nothing; rollback on any failure | Critical changes, multi-file edits |
| partial | Commit successful ops; report failed | Batch updates, independent operations |
| none | No transaction management | Read-only operations |

---

## Verbosity Quick Reference

All 6 tools support the same verbosity levels:

| Level | Token Cost | Use Case |
|-------|-----------|----------|
| count_only | ~0.05x | Confirm writes/edits succeeded |
| minimal | ~0.2x | Basic summary, debug overview |
| standard | ~0.6x | Normal operations |
| verbose | 1.0x | Full output, debugging |

---

## Key Defaults

| Setting | Default |
|---------|---------|
| Transaction mode | atomic |
| Max parallel operations | 10 |
| Max concurrent agents | 6 |
| Agent token budget | 100,000 |
| Agent turn budget | 50 |
| Agent time budget | 300s |
| Total token budget | 1,000,000 |
| Queue strategy | dependency |
| Checkpoint expiry | Configurable (hours) |
| Max checkpoints | Configurable |
| Fix loop max attempts | 3 |
| Fix backoff | Exponential (1s, 2s, 4s) |
| Batch list default limit | 50 |
| Import merge mode | true |
| Context cache TTL | 5 minutes |
