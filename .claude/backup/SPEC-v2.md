# GoodVibes Plugin v2.0 - Complete Specification

> Batch-first, parallel-native, enterprise-grade autonomous coding system

---

## Table of Contents

1. [Philosophy & Principles](#1-philosophy--principles)
2. [Architecture Overview](#2-architecture-overview)
3. [Batch Engine Core](#3-batch-engine-core)
4. [Operation Types](#4-operation-types)
5. [Lifecycle Hooks](#5-lifecycle-hooks)
6. [Context System](#6-context-system)
7. [State Management](#7-state-management)
8. [Memory System](#8-memory-system)
9. [Telemetry](#9-telemetry)
10. [Mode System](#10-mode-system)
11. [Recovery System](#11-recovery-system)
12. [Agent Coordination](#12-agent-coordination)
13. [Tool Specifications](#13-tool-specifications)
14. [File Structure](#14-file-structure)
15. [Implementation Plan](#15-implementation-plan)

---

## 1. Philosophy & Principles

### 1.1 Core Philosophy

**Batch is the primitive.** Every operation is a batch operation. Single operations are batches of one. This is not an optimization—it's the fundamental unit of work.

**Parallel is the default.** Operations run in parallel unless they have explicit dependencies. Sequential execution is the exception, not the rule.

**Enterprise-grade always.** No mocks, no placeholders, no shortcuts. Every output could ship to production.

**Set it and forget it.** Users provide intent, the system delivers results. Minimal interaction required, maximum autonomy enabled.

### 1.2 Design Principles

| Principle | Description |
|-----------|-------------|
| **Batch-Native** | All tools accept arrays, process in parallel, return aggregated results |
| **Token-Efficient** | Every operation has `output_mode` for precision control over verbosity |
| **Transaction-Safe** | All write operations support atomic execution with rollback |
| **Context-Aware** | Operations receive relevant memory, patterns, and decisions automatically |
| **Mode-Adaptive** | Behavior changes based on vibecoding vs justvibes mode |
| **Self-Healing** | Automatic retry, fix loops, and recovery without user intervention |
| **Observable** | Full telemetry, logging, and audit trail for every operation |

### 1.3 Token Efficiency Targets

| Operation Type | Target Reduction | Method |
|----------------|------------------|--------|
| Multi-file read | 90% | Batch + outline extraction |
| Search + context | 85% | Combined search with precise context |
| Multi-file edit | 90% | Atomic batch with minimal output |
| Structure analysis | 95% | Symbol extraction vs full read |
| Validation | 80% | Combined validation pipeline |

---

## 2. Architecture Overview

### 2.1 System Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                               │
│                    (Claude Code CLI / IDE)                          │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          MODE LAYER                                  │
│  ┌───────────────────────┐       ┌───────────────────────┐         │
│  │      VIBECODING       │ ◄───► │      JUSTVIBES        │         │
│  │  - Communicative      │       │  - Silent             │         │
│  │  - Interactive        │       │  - Autonomous         │         │
│  │  - Guided             │       │  - Self-directed      │         │
│  └───────────────────────┘       └───────────────────────┘         │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATOR                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   PLANNER   │  │  EXECUTOR   │  │   MONITOR   │                 │
│  │             │  │             │  │             │                 │
│  │ - Decompose │  │ - Schedule  │  │ - Track     │                 │
│  │ - Estimate  │  │ - Dispatch  │  │ - Alert     │                 │
│  │ - Optimize  │  │ - Aggregate │  │ - Report    │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        BATCH ENGINE                                  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    LIFECYCLE PIPELINE                        │   │
│  │                                                              │   │
│  │  INTENT → PLAN → PREPARE → VALIDATE → EXECUTE → VERIFY →   │   │
│  │                            COMMIT → CHAIN                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │  READ   │ │  WRITE  │ │  EXEC   │ │  QUERY  │ │  STATE  │      │
│  │   ops   │ │   ops   │ │   ops   │ │   ops   │ │   ops   │      │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          ▼                      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     CONTEXT     │    │      STATE      │    │    TELEMETRY    │
│                 │    │                 │    │                 │
│ - Session       │    │ - Session       │    │ - Metrics       │
│ - Memory        │    │ - Agents        │    │ - Costs         │
│ - Stack         │    │ - Checkpoints   │    │ - Performance   │
│ - Patterns      │    │ - Locks         │    │ - Audit         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         PERSISTENCE                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   .goodvibes/state/          │   .goodvibes/memory/             │
│  │   .goodvibes/checkpoints/    │   .goodvibes/telemetry/          │
│  │   .goodvibes/logs/           │   .goodvibes/cache/              │
│  └─────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Mode Layer** | Determines behavior style (communication, autonomy, output) |
| **Orchestrator** | Decomposes tasks, schedules work, monitors execution |
| **Batch Engine** | Executes operations through lifecycle pipeline |
| **Context** | Gathers and injects relevant information |
| **State** | Tracks session, agents, locks, checkpoints |
| **Telemetry** | Records metrics, costs, audit trail |
| **Persistence** | Stores all data to filesystem |

### 2.3 Data Flow

```
User Request
     │
     ▼
┌─────────────┐     ┌─────────────┐
│   Intent    │────►│   Context   │ ◄─── Memory, State, Stack
└─────────────┘     └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │    Plan     │ ◄─── Decompose, Estimate, Optimize
                    └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │   Prepare   │ ◄─── Checkpoint, Locks, Inject
                    └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │  Validate   │ ◄─── Pre-conditions, Safety
                    └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │   Execute   │ ◄─── Parallel workers, Agents
                    └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │   Verify    │ ◄─── Post-validation, Tests
                    └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │   Commit    │ ◄─── Persist, Release, Record
                    └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │    Chain    │ ────► Next Batch (if auto-chain)
                    └─────────────┘
                          │
                          ▼
                       Results
```

---

## 3. Batch Engine Core

### 3.1 Batch Definition

A **batch** is the fundamental unit of work. It contains:

```typescript
interface Batch {
  // Identity
  id: string;                    // Unique batch identifier
  parent_id?: string;            // Parent batch if chained

  // Operations
  operations: {
    read?: ReadOperation[];
    write?: WriteOperation[];
    exec?: ExecOperation[];
    query?: QueryOperation[];
    state?: StateOperation[];
  };

  // Configuration
  config: BatchConfig;

  // Lifecycle
  lifecycle: LifecycleConfig;

  // Output
  output: OutputConfig;
}

interface BatchConfig {
  // Transaction control
  transaction: {
    mode: 'atomic' | 'partial' | 'none';
    isolation: 'strict' | 'relaxed';
    timeout_ms: number;
  };

  // Execution control
  execution: {
    mode: 'parallel' | 'sequential' | 'adaptive';
    max_workers: number;
    fail_fast: boolean;
    retry: {
      attempts: number;
      backoff: 'linear' | 'exponential' | 'fixed';
      delay_ms: number;
    };
  };

  // Preview & validation
  preview: {
    dry_run: boolean;
    diff: boolean;
    impact: boolean;
  };

  validation: {
    before: ValidationStep[];
    after: ValidationStep[];
    on_fail: 'rollback' | 'warn' | 'ignore';
  };

  // Recovery
  recovery: {
    checkpoint: boolean;
    rollback_on_fail: boolean;
    cleanup_on_success: boolean;
  };
}

interface OutputConfig {
  mode: 'count_only' | 'minimal' | 'standard' | 'verbose';
  include: string[];
  exclude: string[];
  max_tokens?: number;
}
```

### 3.2 Operation Base

All operations share a common base:

```typescript
interface OperationBase {
  // Identity
  id: string;                    // Unique operation ID within batch
  type: string;                  // Operation type

  // Dependencies
  depends_on?: string[];         // Operation IDs to wait for

  // Conditions
  when?: Condition[];            // Execute if all true
  skip_if?: Condition[];         // Skip if any true

  // Expectations
  expect?: Expectation[];        // Assert after completion

  // Injection
  inject?: {
    [key: string]: string;       // Template: "{{operation_id.path}}"
  };
}

interface Condition {
  expression: string;            // e.g., "read_1.files.length > 0"
}

interface Expectation {
  expression: string;            // e.g., "exit_code == 0"
  message?: string;              // Failure message
}
```

### 3.3 Result Structure

All operations return a common result structure:

```typescript
interface BatchResult {
  // Summary
  summary: {
    status: 'success' | 'partial' | 'failed' | 'rolled_back';
    operations: {
      total: number;
      succeeded: number;
      failed: number;
      skipped: number;
    };
    duration_ms: number;
    tokens_used: number;
  };

  // Phase results
  phases: {
    read?: PhaseResult;
    write?: PhaseResult;
    exec?: PhaseResult;
    query?: PhaseResult;
    state?: PhaseResult;
  };

  // Validation results
  validation: {
    before: ValidationResult;
    after: ValidationResult;
  };

  // Recovery info
  recovery: {
    checkpoint_id?: string;
    rollback_available: boolean;
    rollback_triggered: boolean;
  };

  // Execution graph
  execution_graph: {
    phases: string[];
    parallel_groups: string[][];
    critical_path_ms: number;
  };
}

interface PhaseResult {
  status: 'success' | 'partial' | 'failed';
  results: OperationResult[];
  duration_ms: number;
  tokens_used: number;
}

interface OperationResult {
  id: string;
  type: string;
  status: 'success' | 'failed' | 'skipped';
  data: any;                     // Operation-specific data
  error?: ErrorInfo;
  duration_ms: number;
  tokens_used: number;
}
```

---

## 4. Operation Types

### 4.1 READ Operations

Read operations gather information without modifying state.

```typescript
interface ReadOperation extends OperationBase {
  type: 'files' | 'search' | 'glob' | 'symbols' | 'url' | 'analyze';
}

// === FILE READ ===
interface FileReadOperation extends ReadOperation {
  type: 'files';
  targets: (string | FileSpec)[];
  extract: 'content' | 'outline' | 'symbols' | 'ast' | 'lines';
  options?: {
    include_line_numbers?: boolean;
    symbol_filter?: SymbolKind[];
    max_lines?: number;
  };
}

interface FileSpec {
  path: string;
  offset?: number;               // Start line (1-based)
  limit?: number;                // Number of lines
  encoding?: string;
}

// === SEARCH ===
interface SearchOperation extends ReadOperation {
  type: 'search';
  pattern: string;
  mode: 'regex' | 'semantic' | 'fuzzy';
  glob?: string;
  context?: {
    before: number;
    after: number;
    max_per_file?: number;
  };
  options?: {
    case_sensitive?: boolean;
    whole_word?: boolean;
    dedupe?: boolean;
    relevance_threshold?: number;  // For semantic search
  };
}

// === GLOB ===
interface GlobOperation extends ReadOperation {
  type: 'glob';
  patterns: string[];
  exclude?: string[];
  filters?: {
    min_size?: number;
    max_size?: number;
    modified_after?: string;
    modified_before?: string;
    has_content?: string;        // Quick grep filter
  };
  options?: {
    respect_gitignore?: boolean;
    preview_lines?: number;
    include_stats?: boolean;
  };
}

// === SYMBOLS ===
interface SymbolOperation extends ReadOperation {
  type: 'symbols';
  query: string;
  kinds?: SymbolKind[];
  scope?: string;                // Glob pattern for files to search
  options?: {
    include_location?: boolean;
    include_signature?: boolean;
    max_results?: number;
  };
}

type SymbolKind =
  | 'function' | 'method' | 'class' | 'interface'
  | 'type' | 'variable' | 'constant' | 'enum'
  | 'property' | 'constructor' | 'namespace';

// === URL FETCH ===
interface UrlOperation extends ReadOperation {
  type: 'url';
  targets: string[];
  extract: 'raw' | 'markdown' | 'text' | 'structured';
  options?: {
    cache_ttl_seconds?: number;
    selectors?: string[];        // CSS selectors for structured
    summarize?: boolean;
    max_tokens?: number;
  };
}

// === ANALYZE ===
interface AnalyzeOperation extends ReadOperation {
  type: 'analyze';
  kind: AnalysisKind;
  target?: string;
  options?: Record<string, any>;
}

type AnalysisKind =
  | 'dependencies' | 'dead_code' | 'circular_deps'
  | 'tech_debt' | 'bundle' | 'coverage'
  | 'stack' | 'api_surface' | 'breaking_changes';
```

#### Read Operation Results

```typescript
interface FileReadResult {
  path: string;
  exists: boolean;
  size: number;
  modified: string;
  content?: string;              // If extract: 'content' or 'lines'
  outline?: OutlineNode[];       // If extract: 'outline'
  symbols?: Symbol[];            // If extract: 'symbols'
  ast?: ASTNode;                 // If extract: 'ast'
  truncated: boolean;
}

interface SearchResult {
  total_matches: number;
  files_searched: number;
  matches: SearchMatch[];
}

interface SearchMatch {
  file: string;
  line: number;
  column: number;
  content: string;
  context_before?: string[];
  context_after?: string[];
  relevance?: number;            // For semantic search
}

interface GlobResult {
  total_files: number;
  total_size: number;
  files: FileInfo[];
}

interface FileInfo {
  path: string;
  size: number;
  modified: string;
  preview?: string[];
}

interface SymbolResult {
  total_symbols: number;
  symbols: Symbol[];
}

interface Symbol {
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  column: number;
  signature?: string;
  container?: string;
}
```

### 4.2 WRITE Operations

Write operations modify files with transaction support.

```typescript
interface WriteOperation extends OperationBase {
  type: 'create' | 'edit' | 'delete' | 'move' | 'copy';
}

// === CREATE ===
interface CreateOperation extends WriteOperation {
  type: 'create';
  files: CreateSpec[];
  options?: {
    overwrite?: boolean;         // Overwrite if exists
    create_dirs?: boolean;       // Create parent directories
    template?: 'handlebars' | 'ejs' | 'none';
  };
}

interface CreateSpec {
  path: string;
  content: string;
  encoding?: string;
}

// === EDIT ===
interface EditOperation extends WriteOperation {
  type: 'edit';
  targets: EditTarget[];
  options?: {
    match_mode?: 'exact' | 'regex' | 'ast' | 'fuzzy';
    conflict_strategy?: 'fail' | 'merge' | 'force';
    create_if_missing?: boolean;
  };
}

interface EditTarget {
  file: string;
  edits: Edit[];
}

interface Edit {
  // Match specification
  find: string;                  // What to find

  // Replacement
  replace: string;               // What to replace with

  // Options
  occurrence?: 'first' | 'last' | 'all' | number;

  // Position hints (for ambiguous matches)
  near_line?: number;
  in_function?: string;
  in_class?: string;
}

// === DELETE ===
interface DeleteOperation extends WriteOperation {
  type: 'delete';
  targets: string[];             // File paths or glob patterns
  safety?: {
    require_empty?: boolean;     // Only delete empty dirs
    max_files?: number;          // Max files to delete
    confirm_patterns?: string[]; // Require explicit match
    blocked_paths?: string[];    // Never delete these
  };
}

// === MOVE ===
interface MoveOperation extends WriteOperation {
  type: 'move';
  moves: MoveSpec[];
  options?: {
    overwrite?: boolean;
    update_imports?: boolean;    // Update import statements
  };
}

interface MoveSpec {
  from: string;
  to: string;
}

// === COPY ===
interface CopyOperation extends WriteOperation {
  type: 'copy';
  copies: CopySpec[];
  options?: {
    overwrite?: boolean;
    preserve_timestamps?: boolean;
  };
}

interface CopySpec {
  from: string;
  to: string;
  transform?: string;            // Optional content transform
}
```

#### Write Operation Results

```typescript
interface CreateResult {
  files_created: number;
  files: {
    path: string;
    size: number;
    status: 'created' | 'overwritten' | 'skipped';
  }[];
}

interface EditResult {
  files_modified: number;
  edits_applied: number;
  files: {
    path: string;
    edits_applied: number;
    edits_failed: number;
    diff?: string;               // If output includes diff
  }[];
  conflicts?: Conflict[];
}

interface Conflict {
  file: string;
  edit: Edit;
  reason: string;
  suggestions?: string[];
}

interface DeleteResult {
  files_deleted: number;
  dirs_deleted: number;
  files: string[];
  blocked?: string[];            // Files that weren't deleted (safety)
}

interface MoveResult {
  files_moved: number;
  imports_updated?: number;
  moves: {
    from: string;
    to: string;
    status: 'moved' | 'skipped' | 'failed';
  }[];
}
```

### 4.3 EXEC Operations

Exec operations run commands and spawn agents.

```typescript
interface ExecOperation extends OperationBase {
  type: 'command' | 'agent' | 'script';
}

// === COMMAND ===
interface CommandOperation extends ExecOperation {
  type: 'command';
  commands: CommandSpec[];
  options?: {
    shell?: string;              // Shell to use
    working_dir?: string;
    env?: Record<string, string>;
    safe_mode?: boolean;         // Block destructive commands
  };
}

interface CommandSpec {
  cmd: string;
  timeout_ms?: number;
  capture?: {
    stdout?: boolean;
    stderr?: boolean;
    exit_code?: boolean;
  };
  expect?: {
    exit_code?: number | number[];
    stdout_contains?: string;
    stdout_matches?: string;
    stderr_empty?: boolean;
  };
}

// === AGENT ===
interface AgentOperation extends ExecOperation {
  type: 'agent';
  agents: AgentSpec[];
}

interface AgentSpec {
  id: string;                    // Local ID for this batch
  agent: string;                 // Agent identifier (e.g., "goodvibes:backend-engineer")
  task: string;                  // Task description

  // Budget
  budget?: {
    max_tokens?: number;         // Context budget
    max_turns?: number;          // Max conversation turns
    timeout_ms?: number;
  };

  // Model
  model?: 'opus' | 'sonnet' | 'haiku';

  // Context injection
  inject?: {
    context?: string;            // Template for context injection
    files?: string[];            // Files to pre-load
    memory?: boolean;            // Include relevant memory
  };

  // Chaining
  chain_on_complete?: ChainSpec;
}

interface ChainSpec {
  agent: string;
  task: string;
  condition?: string;            // Only chain if condition met
}

// === SCRIPT ===
interface ScriptOperation extends ExecOperation {
  type: 'script';
  scripts: ScriptSpec[];
}

interface ScriptSpec {
  language: 'typescript' | 'javascript' | 'python' | 'bash';
  code: string;
  args?: string[];
  timeout_ms?: number;
}
```

#### Exec Operation Results

```typescript
interface CommandResult {
  commands_executed: number;
  commands: {
    cmd: string;
    exit_code: number;
    stdout?: string;
    stderr?: string;
    duration_ms: number;
    expectations_met: boolean;
  }[];
}

interface AgentResult {
  agents_spawned: number;
  agents: {
    id: string;
    agent: string;
    status: 'success' | 'failed' | 'timeout' | 'budget_exceeded';
    turns: number;
    tokens_used: number;
    files_read: number;
    files_written: number;
    summary?: string;
    outputs?: Record<string, any>;  // Named outputs from agent
    chained_to?: string;            // If chain triggered
  }[];
}

interface ScriptResult {
  scripts_executed: number;
  scripts: {
    language: string;
    exit_code: number;
    output?: any;
    error?: string;
    duration_ms: number;
  }[];
}
```

### 4.4 QUERY Operations

Query operations analyze and validate without modifying state.

```typescript
interface QueryOperation extends OperationBase {
  type: 'lsp' | 'validate' | 'diagnose';
}

// === LSP ===
interface LspOperation extends QueryOperation {
  type: 'lsp';
  queries: LspQuery[];
}

interface LspQuery {
  operation: LspOperationType;
  file: string;
  position?: {
    line: number;
    character: number;
  };
  options?: Record<string, any>;
}

type LspOperationType =
  | 'definition' | 'references' | 'implementations'
  | 'hover' | 'signature' | 'completion'
  | 'diagnostics' | 'code_actions' | 'rename'
  | 'call_hierarchy' | 'type_hierarchy';

// === VALIDATE ===
interface ValidateOperation extends QueryOperation {
  type: 'validate';
  validations: ValidationSpec[];
}

interface ValidationSpec {
  kind: ValidationType;
  options?: Record<string, any>;
}

type ValidationType =
  | 'typecheck' | 'lint' | 'test' | 'build'
  | 'env' | 'api_contract' | 'secrets' | 'permissions';

// === DIAGNOSE ===
interface DiagnoseOperation extends QueryOperation {
  type: 'diagnose';
  diagnoses: DiagnosisSpec[];
}

interface DiagnosisSpec {
  kind: DiagnosisKind;
  target?: string;
  options?: Record<string, any>;
}

type DiagnosisKind =
  | 'error_stack' | 'type_error' | 'runtime_error'
  | 'performance' | 'memory_leak' | 'bundle_size';
```

#### Query Operation Results

```typescript
interface LspResult {
  queries_executed: number;
  queries: {
    operation: LspOperationType;
    file: string;
    results: any[];              // Operation-specific results
    diagnostics?: Diagnostic[];
  }[];
}

interface Diagnostic {
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  file: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  code?: string;
  source?: string;
}

interface ValidateResult {
  validations_run: number;
  overall_status: 'pass' | 'fail' | 'warn';
  validations: {
    kind: ValidationType;
    status: 'pass' | 'fail' | 'warn' | 'skip';
    errors: number;
    warnings: number;
    details?: any;
  }[];
}

interface DiagnoseResult {
  diagnoses_run: number;
  diagnoses: {
    kind: DiagnosisKind;
    findings: Finding[];
  }[];
}

interface Finding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  location?: string;
  suggestion?: string;
}
```

### 4.5 STATE Operations

State operations manage session state and persistent memory.

```typescript
interface StateOperation extends OperationBase {
  type: 'get' | 'set' | 'track' | 'query';
}

// === GET ===
interface GetOperation extends StateOperation {
  type: 'get';
  keys: string[];                // Dot-notation paths
}

// === SET ===
interface SetOperation extends StateOperation {
  type: 'set';
  entries: SetEntry[];
  options?: {
    merge?: boolean;             // Deep merge objects
    persist?: boolean;           // Write to disk immediately
  };
}

interface SetEntry {
  key: string;                   // Dot-notation path
  value: any;
}

// === TRACK ===
interface TrackOperation extends StateOperation {
  type: 'track';
  entries: TrackEntry[];
}

interface TrackEntry {
  kind: 'decision' | 'pattern' | 'failure' | 'task' | 'metric';
  data: Record<string, any>;
}

// === QUERY (Memory) ===
interface MemoryQueryOperation extends StateOperation {
  type: 'query';
  filters?: {
    kinds?: string[];
    since?: string;
    keywords?: string[];
    limit?: number;
  };
}
```

#### State Operation Results

```typescript
interface GetResult {
  entries: {
    key: string;
    value: any;
    exists: boolean;
  }[];
}

interface SetResult {
  entries_set: number;
  persisted: boolean;
}

interface TrackResult {
  entries_tracked: number;
  entries: {
    kind: string;
    id: string;
    timestamp: string;
  }[];
}

interface MemoryQueryResult {
  total_matches: number;
  entries: MemoryEntry[];
}

interface MemoryEntry {
  kind: string;
  id: string;
  timestamp: string;
  data: Record<string, any>;
  relevance?: number;
}
```

---

## 5. Lifecycle Hooks

### 5.1 Hook Points

The batch engine exposes hooks at each lifecycle phase:

```typescript
interface LifecycleHooks {
  // Phase hooks
  on_intent?: Hook;
  on_plan?: Hook;
  on_prepare?: Hook;
  on_validate_before?: Hook;
  on_execute?: Hook;
  on_validate_after?: Hook;
  on_commit?: Hook;
  on_chain?: Hook;

  // Operation hooks
  before_operation?: OperationHook;
  after_operation?: OperationHook;
  on_operation_error?: ErrorHook;
  on_operation_retry?: RetryHook;

  // Global hooks
  on_error?: ErrorHook;
  on_rollback?: Hook;
  on_complete?: Hook;
}

interface Hook {
  handler: string;               // Handler function name or inline
  async?: boolean;
  timeout_ms?: number;
}

interface OperationHook extends Hook {
  filter?: {
    types?: string[];            // Operation types to match
    ids?: string[];              // Operation IDs to match
  };
}

interface ErrorHook extends Hook {
  filter?: {
    severity?: string[];
    types?: string[];
  };
}

interface RetryHook extends Hook {
  max_retries?: number;
}
```

### 5.2 Built-in Hooks

GoodVibes provides these built-in hooks:

```typescript
const BUILT_IN_HOOKS = {
  // Preparation hooks
  'checkpoint': {
    phase: 'prepare',
    handler: 'createCheckpoint',
    description: 'Create restore point before execution'
  },
  'acquire_locks': {
    phase: 'prepare',
    handler: 'acquireResourceLocks',
    description: 'Lock files/resources for exclusive access'
  },
  'inject_context': {
    phase: 'prepare',
    handler: 'injectRelevantContext',
    description: 'Load relevant memory, patterns, decisions'
  },

  // Validation hooks
  'typecheck': {
    phase: 'validate',
    handler: 'runTypeCheck',
    description: 'Run TypeScript type checking'
  },
  'lint': {
    phase: 'validate',
    handler: 'runLinter',
    description: 'Run ESLint/Prettier'
  },
  'test': {
    phase: 'validate',
    handler: 'runTests',
    description: 'Run test suite'
  },
  'build': {
    phase: 'validate',
    handler: 'runBuild',
    description: 'Run build process'
  },

  // Commit hooks
  'update_state': {
    phase: 'commit',
    handler: 'updateSessionState',
    description: 'Update session state with results'
  },
  'record_memory': {
    phase: 'commit',
    handler: 'recordToMemory',
    description: 'Record decisions, patterns, failures'
  },
  'emit_telemetry': {
    phase: 'commit',
    handler: 'emitTelemetry',
    description: 'Record metrics and audit trail'
  },
  'release_locks': {
    phase: 'commit',
    handler: 'releaseResourceLocks',
    description: 'Release acquired locks'
  },

  // Recovery hooks
  'rollback': {
    phase: 'error',
    handler: 'rollbackToCheckpoint',
    description: 'Restore from checkpoint on failure'
  },
  'fix_loop': {
    phase: 'error',
    handler: 'runFixLoop',
    description: 'Attempt automatic fixes'
  }
};
```

### 5.3 Hook Configuration

```yaml
# Example hook configuration in batch
lifecycle:
  hooks:
    on_prepare:
      - checkpoint
      - acquire_locks
      - inject_context

    on_validate_before:
      - typecheck

    on_validate_after:
      - typecheck
      - test:
          filter: related      # Only related tests
          timeout_ms: 120000

    before_operation:
      - handler: logOperation
        filter:
          types: [agent]

    on_operation_error:
      - handler: fix_loop
        filter:
          types: [edit, create]
        max_retries: 3

    on_commit:
      - update_state
      - record_memory
      - emit_telemetry
      - release_locks

    on_error:
      - rollback
      - handler: notifyUser
        filter:
          severity: [critical]
```

### 5.4 Custom Hooks

Users can define custom hooks:

```typescript
// .goodvibes/hooks/custom.ts

import { Hook, HookContext, HookResult } from '@goodvibes/types';

export const customPreValidation: Hook = async (ctx: HookContext): Promise<HookResult> => {
  // Check custom preconditions
  const config = await ctx.read('.env');
  if (!config.includes('DATABASE_URL')) {
    return {
      status: 'fail',
      message: 'DATABASE_URL not configured',
      abort: true
    };
  }

  return { status: 'pass' };
};

export const customPostCommit: Hook = async (ctx: HookContext): Promise<HookResult> => {
  // Notify external system
  await ctx.fetch('https://api.example.com/webhook', {
    method: 'POST',
    body: JSON.stringify({
      batch_id: ctx.batch.id,
      status: ctx.result.status,
      files_modified: ctx.result.summary.files_modified
    })
  });

  return { status: 'pass' };
};
```

---

## 6. Context System

### 6.1 Context Structure

```typescript
interface Context {
  // Session context (gathered at session start)
  session: SessionContext;

  // Batch context (gathered per batch)
  batch: BatchContext;

  // Operation context (gathered per operation)
  operation: OperationContext;

  // Agent context (injected into agents)
  agent: AgentContext;
}

interface SessionContext {
  // Identity
  id: string;
  started_at: string;
  mode: 'vibecoding' | 'justvibes';

  // Project
  project_root: string;
  project_name: string;

  // Stack detection
  stack: {
    languages: string[];
    frameworks: string[];
    libraries: string[];
    tools: string[];
  };

  // Git
  git: {
    branch: string;
    commit: string;
    dirty: boolean;
    remote?: string;
  };

  // Health
  health: {
    typecheck: 'pass' | 'fail' | 'unknown';
    lint: 'pass' | 'fail' | 'unknown';
    test: 'pass' | 'fail' | 'unknown';
    build: 'pass' | 'fail' | 'unknown';
  };

  // User preferences
  preferences: Record<string, any>;
}

interface BatchContext {
  // Relevant memory
  decisions: Decision[];
  patterns: Pattern[];
  failures: Failure[];

  // Scope analysis
  affected_files: string[];
  affected_symbols: string[];

  // Dependencies
  resolved_dependencies: Map<string, any>;

  // Risk assessment
  risk: {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
  };
}

interface OperationContext {
  // Operation info
  id: string;
  type: string;

  // Injected data
  injected: Record<string, any>;

  // Prior results
  prior_results: Map<string, OperationResult>;
}

interface AgentContext {
  // Task
  task: string;
  scope: string[];
  constraints: string[];

  // Memory
  relevant_decisions: Decision[];
  relevant_patterns: Pattern[];
  past_failures: Failure[];

  // Prior work
  prior_results: Record<string, any>;

  // Budget
  budget: {
    tokens_remaining: number;
    turns_remaining: number;
  };
}
```

### 6.2 Context Gathering

```typescript
// Context is gathered at different points

const contextGathering = {
  // At session start
  session_start: [
    'detectStack',           // Analyze package.json, configs
    'loadPreferences',       // Load user preferences
    'checkHealth',           // Run quick health checks
    'loadGitStatus',         // Get git information
  ],

  // Before each batch
  batch_start: [
    'analyzeScope',          // What files/symbols affected?
    'loadRelevantMemory',    // Search memory for relevant entries
    'assessRisk',            // How risky is this batch?
    'resolveDependencies',   // Resolve operation dependencies
  ],

  // Before each operation
  operation_start: [
    'resolveInjections',     // Resolve {{template}} references
    'gatherOperationContext', // Operation-specific context
  ],

  // Before spawning agent
  agent_spawn: [
    'buildAgentPrompt',      // Construct full agent prompt
    'injectMemory',          // Add relevant memory
    'injectPriorResults',    // Add results from prior operations
    'setBudget',             // Set token/turn limits
  ],
};
```

### 6.3 Template Resolution

Operations can reference other operations' results using templates:

```typescript
// Template syntax: {{operation_id.path.to.value}}

const templateExamples = {
  // Reference file content from read operation
  content: "{{read_sources.results[0].content}}",

  // Reference symbols found
  symbols: "{{find_symbols.results.symbols}}",

  // Reference agent output
  api_spec: "{{backend_agent.outputs.api}}",

  // Reference command output
  build_output: "{{build.results[0].stdout}}",

  // Built-in variables
  now: "{{now}}",
  session_id: "{{session.id}}",
  git_branch: "{{session.git.branch}}",

  // Helpers
  json: "{{json symbols}}",
  join: "{{join files '\n'}}",
  first: "{{first matches}}",
  filter: "{{filter symbols 'kind' 'function'}}",
};
```

---

## 7. State Management

### 7.1 State Structure

```typescript
interface GoodVibesState {
  // Session state (ephemeral, per-session)
  session: SessionState;

  // Agent state (tracks active and completed agents)
  agents: AgentState;

  // Checkpoint state (for recovery)
  checkpoints: CheckpointState;

  // Lock state (for coordination)
  locks: LockState;
}

interface SessionState {
  id: string;
  started_at: string;
  mode: 'vibecoding' | 'justvibes';

  // Current work
  current_batch?: string;
  current_feature?: string;

  // Tracking
  batches_completed: number;
  operations_completed: number;
  tokens_used: number;

  // Health
  last_typecheck: HealthResult;
  last_lint: HealthResult;
  last_test: HealthResult;
  last_build: HealthResult;

  // Git
  git: {
    main_branch: string;
    current_branch: string;
    feature_branch?: string;
    uncommitted_files: string[];
    last_commit: string;
  };

  // Files
  files: {
    modified_this_session: string[];
    created_this_session: string[];
    deleted_this_session: string[];
  };
}

interface HealthResult {
  status: 'pass' | 'fail' | 'unknown';
  timestamp: string;
  errors?: number;
  warnings?: number;
}

interface AgentState {
  active: Map<string, ActiveAgent>;
  completed: CompletedAgent[];
  total_spawned: number;
  total_tokens: number;
}

interface ActiveAgent {
  id: string;
  agent_type: string;
  task: string;
  started_at: string;
  budget: {
    max_tokens: number;
    max_turns: number;
    tokens_used: number;
    turns_used: number;
  };
  batch_id: string;
  operation_id: string;
}

interface CompletedAgent {
  id: string;
  agent_type: string;
  task: string;
  started_at: string;
  completed_at: string;
  status: 'success' | 'failed' | 'timeout' | 'budget_exceeded';
  tokens_used: number;
  turns_used: number;
  files_modified: string[];
  summary?: string;
}

interface CheckpointState {
  checkpoints: Checkpoint[];
  max_checkpoints: number;
  cleanup_after_hours: number;
}

interface Checkpoint {
  id: string;
  created_at: string;
  batch_id: string;
  type: 'auto' | 'manual' | 'pre_risky';

  // What's saved
  files: {
    path: string;
    backup_path: string;
    hash: string;
  }[];
  state_snapshot: string;        // Path to state backup

  // Metadata
  reason: string;
  expires_at: string;
}

interface LockState {
  locks: Lock[];
}

interface Lock {
  id: string;
  type: 'file' | 'resource';
  target: string;
  mode: 'exclusive' | 'shared';
  holder: string;                // Batch or operation ID
  acquired_at: string;
  expires_at?: string;
}
```

### 7.2 State Files

```
.goodvibes/
├── state/
│   ├── session.json           # Current session state
│   ├── agents.json            # Agent tracking
│   ├── locks.json             # Active locks
│   └── health.json            # Health check results
├── checkpoints/
│   ├── cp_20240120_143022/
│   │   ├── manifest.json      # Checkpoint metadata
│   │   ├── files/             # File backups
│   │   └── state.json         # State snapshot
│   └── ...
└── cache/
    ├── stack.json             # Cached stack detection
    ├── symbols.json           # Cached symbol index
    └── deps.json              # Cached dependency graph
```

### 7.3 State Operations

```typescript
// State API

interface StateAPI {
  // Session
  getSession(): SessionState;
  updateSession(updates: Partial<SessionState>): void;

  // Agents
  registerAgent(agent: ActiveAgent): void;
  updateAgent(id: string, updates: Partial<ActiveAgent>): void;
  completeAgent(id: string, result: AgentResult): void;
  getActiveAgents(): ActiveAgent[];

  // Checkpoints
  createCheckpoint(batch_id: string, reason: string): Checkpoint;
  restoreCheckpoint(checkpoint_id: string): void;
  cleanupCheckpoints(): void;

  // Locks
  acquireLock(lock: Omit<Lock, 'id' | 'acquired_at'>): Lock | null;
  releaseLock(lock_id: string): void;
  isLocked(target: string): boolean;

  // Persistence
  persist(): Promise<void>;
  load(): Promise<void>;
}
```

---

## 8. Memory System

### 8.1 Memory Structure

```typescript
interface Memory {
  decisions: Decision[];
  patterns: Pattern[];
  failures: Failure[];
  preferences: Preference[];
}

interface Decision {
  id: string;
  timestamp: string;

  // What was decided
  what: string;
  why: string;

  // Context
  category: DecisionCategory;
  confidence: 'high' | 'medium' | 'low';

  // Scope
  files?: string[];
  symbols?: string[];

  // Status
  status: 'active' | 'superseded' | 'reverted';
  superseded_by?: string;

  // Metadata
  batch_id?: string;
  agent_id?: string;
}

type DecisionCategory =
  | 'architecture' | 'library' | 'pattern' | 'convention'
  | 'performance' | 'security' | 'testing' | 'deployment';

interface Pattern {
  id: string;
  timestamp: string;

  // Pattern info
  name: string;
  description: string;

  // Examples
  examples: {
    file: string;
    lines: [number, number];
    code?: string;
  }[];

  // Applicability
  when_to_use: string;
  when_not_to_use?: string;

  // Metadata
  discovered_in?: string;        // Batch ID
  usage_count: number;
}

interface Failure {
  id: string;
  timestamp: string;

  // What failed
  error_type: string;
  error_message: string;
  stack_trace?: string;

  // Context
  operation?: string;
  files?: string[];

  // Resolution
  resolved: boolean;
  resolution?: string;
  resolution_batch?: string;

  // Learning
  root_cause?: string;
  prevention?: string;
}

interface Preference {
  id: string;
  timestamp: string;

  // Preference
  key: string;
  value: any;

  // Source
  source: 'user' | 'inferred' | 'default';

  // Scope
  scope: 'global' | 'project' | 'session';
}
```

### 8.2 Memory Files

```
.goodvibes/
└── memory/
    ├── decisions.md           # Markdown with structured entries
    ├── patterns.md            # Markdown with structured entries
    ├── failures.md            # Markdown with structured entries
    ├── preferences.json       # JSON for preferences
    └── index.json             # Search index
```

### 8.3 Memory Format

```markdown
# Decisions

## Decision: Use Zustand for state management
- **ID**: dec_20240120_001
- **Date**: 2024-01-20T14:30:22Z
- **Category**: library
- **Confidence**: high

### What
Use Zustand instead of Redux for client-side state management.

### Why
- Simpler API with less boilerplate
- Better TypeScript support out of the box
- Smaller bundle size (2KB vs 7KB)
- No need for middleware for async operations

### Scope
- Files: src/store/**/*.ts
- Symbols: useStore, createStore

### Status
Active

---

## Decision: Repository pattern for data access
...
```

### 8.4 Memory API

```typescript
interface MemoryAPI {
  // Decisions
  recordDecision(decision: Omit<Decision, 'id' | 'timestamp'>): Decision;
  getDecisions(filter?: DecisionFilter): Decision[];
  supersedDecision(id: string, new_decision_id: string): void;

  // Patterns
  recordPattern(pattern: Omit<Pattern, 'id' | 'timestamp' | 'usage_count'>): Pattern;
  getPatterns(filter?: PatternFilter): Pattern[];
  incrementPatternUsage(id: string): void;

  // Failures
  recordFailure(failure: Omit<Failure, 'id' | 'timestamp'>): Failure;
  getFailures(filter?: FailureFilter): Failure[];
  resolveFailure(id: string, resolution: string): void;

  // Preferences
  setPreference(key: string, value: any, scope?: string): void;
  getPreference(key: string): any;

  // Search
  search(keywords: string[], kinds?: string[]): MemoryEntry[];
  getRelevant(context: BatchContext): Memory;

  // Maintenance
  compact(): void;               // Remove old/superseded entries
  export(): string;              // Export to markdown
  import(data: string): void;    // Import from markdown
}
```

---

## 9. Telemetry

### 9.1 Telemetry Structure

```typescript
interface Telemetry {
  // Session metrics
  session: SessionMetrics;

  // Batch metrics
  batches: BatchMetrics[];

  // Operation metrics
  operations: OperationMetrics[];

  // Agent metrics
  agents: AgentMetrics[];

  // Aggregations
  aggregations: Aggregations;
}

interface SessionMetrics {
  id: string;
  started_at: string;
  ended_at?: string;
  mode: string;

  // Totals
  total_batches: number;
  total_operations: number;
  total_agents: number;
  total_tokens: number;
  total_duration_ms: number;

  // By type
  operations_by_type: Record<string, number>;
  tokens_by_type: Record<string, number>;

  // Success rates
  batch_success_rate: number;
  operation_success_rate: number;
  agent_success_rate: number;

  // Recovery
  rollbacks_triggered: number;
  fix_loops_run: number;
  retries_total: number;
}

interface BatchMetrics {
  id: string;
  started_at: string;
  completed_at: string;

  // Summary
  status: string;
  operations_total: number;
  operations_succeeded: number;
  operations_failed: number;

  // Performance
  duration_ms: number;
  tokens_used: number;
  parallel_efficiency: number;   // Actual vs theoretical parallel speedup

  // Validation
  validation_passed: boolean;
  validation_errors: number;

  // Recovery
  checkpoint_created: boolean;
  rollback_triggered: boolean;
}

interface OperationMetrics {
  id: string;
  batch_id: string;
  type: string;

  // Timing
  started_at: string;
  completed_at: string;
  duration_ms: number;

  // Tokens
  tokens_used: number;

  // Status
  status: string;
  retries: number;

  // Details (type-specific)
  details: Record<string, any>;
}

interface AgentMetrics {
  id: string;
  batch_id: string;
  operation_id: string;
  agent_type: string;

  // Timing
  started_at: string;
  completed_at: string;
  duration_ms: number;

  // Tokens
  tokens_input: number;
  tokens_output: number;
  tokens_total: number;

  // Activity
  turns: number;
  tool_calls: number;
  files_read: number;
  files_written: number;

  // Status
  status: string;
  budget_utilization: number;    // tokens_used / max_tokens
}

interface Aggregations {
  // By time
  hourly: TimeseriesPoint[];
  daily: TimeseriesPoint[];

  // By type
  by_operation_type: Record<string, TypeAggregation>;
  by_agent_type: Record<string, TypeAggregation>;

  // Trends
  token_trend: TrendAnalysis;
  success_trend: TrendAnalysis;
  duration_trend: TrendAnalysis;
}

interface TimeseriesPoint {
  timestamp: string;
  batches: number;
  operations: number;
  tokens: number;
  success_rate: number;
}

interface TypeAggregation {
  count: number;
  total_tokens: number;
  avg_tokens: number;
  avg_duration_ms: number;
  success_rate: number;
}

interface TrendAnalysis {
  direction: 'up' | 'down' | 'stable';
  change_percent: number;
  period: string;
}
```

### 9.2 Telemetry Files

```
.goodvibes/
└── telemetry/
    ├── current_session.json   # Current session metrics
    ├── history/
    │   ├── 2024-01-20.json   # Daily aggregates
    │   └── ...
    └── aggregations.json      # Pre-computed aggregations
```

### 9.3 Telemetry API

```typescript
interface TelemetryAPI {
  // Recording
  recordBatchStart(batch: Batch): void;
  recordBatchComplete(batch_id: string, result: BatchResult): void;
  recordOperationStart(operation: Operation): void;
  recordOperationComplete(operation_id: string, result: OperationResult): void;
  recordAgentStart(agent: AgentSpec): void;
  recordAgentComplete(agent_id: string, result: AgentResult): void;

  // Querying
  getSessionMetrics(): SessionMetrics;
  getBatchMetrics(batch_id: string): BatchMetrics;
  getAggregations(period?: string): Aggregations;

  // Analysis
  estimateCost(tokens: number): number;
  projectTokenUsage(batches: number): number;
  identifyBottlenecks(): Bottleneck[];

  // Export
  exportReport(format: 'json' | 'markdown' | 'csv'): string;
}
```

### 9.4 Cost Estimation

```typescript
const TOKEN_COSTS = {
  // Per million tokens (approximate)
  input: {
    haiku: 0.25,
    sonnet: 3.00,
    opus: 15.00
  },
  output: {
    haiku: 1.25,
    sonnet: 15.00,
    opus: 75.00
  }
};

function estimateCost(metrics: SessionMetrics, model: string = 'sonnet'): number {
  const inputCost = (metrics.total_tokens * 0.3) * TOKEN_COSTS.input[model] / 1_000_000;
  const outputCost = (metrics.total_tokens * 0.7) * TOKEN_COSTS.output[model] / 1_000_000;
  return inputCost + outputCost;
}
```

---

## 10. Mode System

### 10.1 Mode Definitions

```typescript
interface ModeConfig {
  // Identity
  name: 'vibecoding' | 'justvibes';
  description: string;

  // Communication
  communication: {
    show_progress: boolean;
    explain_decisions: boolean;
    ask_on_ambiguity: boolean;
    report_results: 'none' | 'minimal' | 'summary' | 'detailed';
  };

  // Execution
  execution: {
    auto_chain: boolean;
    max_autonomous_batches: number | 'unlimited';
    checkpoint_frequency: 'never' | 'per_batch' | 'per_phase' | 'per_operation';
    parallel_agents: number;
  };

  // Recovery
  recovery: {
    on_error: 'halt' | 'ask' | 'log_and_continue' | 'fix_and_continue';
    on_ambiguity: 'ask' | 'best_guess';
    on_risk: 'halt' | 'ask' | 'proceed_with_checkpoint';
    max_fix_attempts: number;
  };

  // Output
  output: {
    default_mode: 'count_only' | 'minimal' | 'standard' | 'verbose';
    show_diffs: boolean;
    show_telemetry: 'none' | 'summary' | 'detailed';
  };

  // Logging
  logging: {
    log_decisions: boolean;
    log_errors: boolean;
    log_activity: boolean;
    log_path: string;
  };
}
```

### 10.2 Mode Configurations

```typescript
const MODES: Record<string, ModeConfig> = {
  vibecoding: {
    name: 'vibecoding',
    description: 'Autonomous coding with communication',

    communication: {
      show_progress: true,
      explain_decisions: true,
      ask_on_ambiguity: true,
      report_results: 'detailed'
    },

    execution: {
      auto_chain: false,
      max_autonomous_batches: 1,
      checkpoint_frequency: 'per_batch',
      parallel_agents: 6
    },

    recovery: {
      on_error: 'ask',
      on_ambiguity: 'ask',
      on_risk: 'ask',
      max_fix_attempts: 3
    },

    output: {
      default_mode: 'standard',
      show_diffs: true,
      show_telemetry: 'summary'
    },

    logging: {
      log_decisions: true,
      log_errors: true,
      log_activity: false,
      log_path: '.goodvibes/logs/'
    }
  },

  justvibes: {
    name: 'justvibes',
    description: 'Fully autonomous silent execution',

    communication: {
      show_progress: false,
      explain_decisions: false,
      ask_on_ambiguity: false,
      report_results: 'minimal'
    },

    execution: {
      auto_chain: true,
      max_autonomous_batches: 'unlimited',
      checkpoint_frequency: 'per_phase',
      parallel_agents: 6
    },

    recovery: {
      on_error: 'fix_and_continue',
      on_ambiguity: 'best_guess',
      on_risk: 'proceed_with_checkpoint',
      max_fix_attempts: 3
    },

    output: {
      default_mode: 'minimal',
      show_diffs: false,
      show_telemetry: 'none'
    },

    logging: {
      log_decisions: true,
      log_errors: true,
      log_activity: true,
      log_path: '.goodvibes/logs/'
    }
  }
};
```

### 10.3 Mode-Aware Behavior

```typescript
// Mode affects every aspect of execution

function shouldAskUser(mode: ModeConfig, situation: string): boolean {
  switch (situation) {
    case 'ambiguous_requirement':
      return mode.communication.ask_on_ambiguity;
    case 'high_risk_operation':
      return mode.recovery.on_risk === 'ask';
    case 'error_occurred':
      return mode.recovery.on_error === 'ask';
    case 'batch_complete':
      return !mode.execution.auto_chain;
    default:
      return false;
  }
}

function getOutputMode(mode: ModeConfig, operation: string): OutputMode {
  // Mode provides default, but can be overridden per-operation
  return mode.output.default_mode;
}

function handleError(mode: ModeConfig, error: Error): ErrorAction {
  switch (mode.recovery.on_error) {
    case 'halt':
      return { action: 'halt', notify: true };
    case 'ask':
      return { action: 'ask_user', options: ['retry', 'skip', 'abort'] };
    case 'log_and_continue':
      return { action: 'log', continue: true };
    case 'fix_and_continue':
      return { action: 'fix_loop', max_attempts: mode.recovery.max_fix_attempts };
  }
}

function formatResult(mode: ModeConfig, result: BatchResult): string {
  switch (mode.communication.report_results) {
    case 'none':
      return '';
    case 'minimal':
      return `Done. ${result.summary.operations.succeeded} operations completed.`;
    case 'summary':
      return formatSummary(result);
    case 'detailed':
      return formatDetailed(result);
  }
}
```

---

## 11. Recovery System

### 11.1 Checkpoint System

```typescript
interface CheckpointSystem {
  // Create checkpoint
  create(config: CheckpointConfig): Checkpoint;

  // Restore from checkpoint
  restore(checkpoint_id: string, scope?: RestoreScope): RestoreResult;

  // List checkpoints
  list(filter?: CheckpointFilter): Checkpoint[];

  // Cleanup old checkpoints
  cleanup(policy: CleanupPolicy): CleanupResult;
}

interface CheckpointConfig {
  batch_id: string;
  reason: string;
  type: 'auto' | 'manual' | 'pre_risky';

  // What to checkpoint
  include: {
    files: string[] | 'modified' | 'all';
    state: boolean;
    memory: boolean;
  };

  // Retention
  expires_after_hours?: number;
}

interface RestoreScope {
  files: boolean;
  state: boolean;
  memory: boolean;
  git: boolean;  // Also revert git changes
}

interface RestoreResult {
  success: boolean;
  files_restored: number;
  state_restored: boolean;
  errors?: string[];
}

interface CleanupPolicy {
  max_age_hours: number;
  max_count: number;
  keep_tagged: boolean;          // Keep manually tagged checkpoints
}
```

### 11.2 Fix Loop

```typescript
interface FixLoop {
  // Run fix loop for an error
  run(error: Error, context: FixContext): FixResult;
}

interface FixContext {
  operation: Operation;
  batch: Batch;
  error: Error;
  attempt: number;
  max_attempts: number;
  prior_attempts: FixAttempt[];
}

interface FixAttempt {
  attempt: number;
  strategy: FixStrategy;
  actions: FixAction[];
  result: 'success' | 'failed' | 'partial';
  error?: Error;
}

interface FixResult {
  success: boolean;
  attempts: number;
  final_strategy: FixStrategy;
  actions_taken: FixAction[];
  remaining_errors?: Error[];
}

type FixStrategy =
  | 'auto_fix'           // Use built-in auto-fixers
  | 'agent_fix'          // Spawn agent to fix
  | 'targeted_fix'       // Spawn specialized agent
  | 'rollback'           // Restore and retry
  | 'skip';              // Skip operation

interface FixAction {
  type: 'command' | 'edit' | 'agent' | 'rollback';
  description: string;
  result: 'success' | 'failed';
}
```

### 11.3 Fix Loop Strategies

```typescript
const FIX_STRATEGIES: FixStrategy[] = [
  {
    name: 'auto_fix',
    attempt: 1,
    applicable: (error) => error.type in AUTO_FIXERS,
    execute: async (ctx) => {
      const fixer = AUTO_FIXERS[ctx.error.type];
      return await fixer.fix(ctx.error);
    }
  },
  {
    name: 'agent_fix',
    attempt: 2,
    applicable: (error) => error.fixable,
    execute: async (ctx) => {
      return await spawnAgent({
        agent: 'goodvibes:code-architect',
        task: `Fix the following error:\n\n${ctx.error.message}\n\nContext:\n${ctx.error.context}`,
        budget: { max_tokens: 50000 }
      });
    }
  },
  {
    name: 'targeted_fix',
    attempt: 3,
    applicable: () => true,
    execute: async (ctx) => {
      const agent = selectBestAgent(ctx.error);
      return await spawnAgent({
        agent,
        task: buildDetailedFixPrompt(ctx),
        budget: { max_tokens: 100000 },
        inject: {
          error: ctx.error,
          prior_attempts: ctx.prior_attempts,
          files: ctx.affected_files
        }
      });
    }
  }
];

const AUTO_FIXERS = {
  'typescript_error': {
    fix: async (error) => {
      return await runCommand('npx tsc --noEmit --fix');
    }
  },
  'lint_error': {
    fix: async (error) => {
      return await runCommand('npx eslint --fix .');
    }
  },
  'format_error': {
    fix: async (error) => {
      return await runCommand('npx prettier --write .');
    }
  },
  'import_error': {
    fix: async (error) => {
      // Fix missing imports using LSP
      return await fixImports(error.file, error.symbol);
    }
  }
};
```

### 11.4 Rollback System

```typescript
interface RollbackSystem {
  // Rollback to checkpoint
  toCheckpoint(checkpoint_id: string): RollbackResult;

  // Rollback last batch
  lastBatch(): RollbackResult;

  // Rollback specific operations
  operations(operation_ids: string[]): RollbackResult;

  // Selective rollback
  selective(options: SelectiveRollbackOptions): RollbackResult;
}

interface SelectiveRollbackOptions {
  // What to rollback
  files?: string[];
  state_keys?: string[];

  // How far back
  to_batch?: string;
  to_checkpoint?: string;
  to_time?: string;
}

interface RollbackResult {
  success: boolean;

  // What was rolled back
  files_restored: string[];
  state_restored: string[];

  // What couldn't be rolled back
  files_failed: string[];

  // New state
  checkpoint_id?: string;        // New checkpoint after rollback
}
```

---

## 12. Agent Coordination

### 12.1 Agent Pool

```typescript
interface AgentPool {
  // Pool configuration
  config: {
    max_concurrent: number;      // Default: 6
    default_budget: {
      max_tokens: number;        // Default: 100000
      max_turns: number;         // Default: 50
    };
    total_budget?: {
      max_tokens: number;        // Across all agents
    };
  };

  // Pool state
  state: {
    active: Map<string, ActiveAgent>;
    queued: QueuedAgent[];
    completed: CompletedAgent[];

    tokens_used: number;
    tokens_remaining: number;
  };
}

interface QueuedAgent {
  spec: AgentSpec;
  priority: number;
  queued_at: string;
  depends_on: string[];          // Agent IDs to wait for
}
```

### 12.2 Agent Lifecycle

```typescript
const agentLifecycle = {
  // Spawn agent
  spawn: async (spec: AgentSpec, pool: AgentPool): Promise<string> => {
    // Check pool capacity
    if (pool.state.active.size >= pool.config.max_concurrent) {
      // Queue the agent
      pool.state.queued.push({
        spec,
        priority: calculatePriority(spec),
        queued_at: new Date().toISOString(),
        depends_on: spec.depends_on || []
      });
      return spec.id;
    }

    // Check dependencies
    if (spec.depends_on?.some(id => pool.state.active.has(id))) {
      // Queue until dependencies complete
      pool.state.queued.push({ /* ... */ });
      return spec.id;
    }

    // Spawn immediately
    return await doSpawn(spec, pool);
  },

  // Monitor agent
  monitor: async (agent_id: string, pool: AgentPool): Promise<AgentStatus> => {
    const agent = pool.state.active.get(agent_id);
    if (!agent) return { status: 'not_found' };

    // Check budget
    if (agent.budget.tokens_used >= agent.budget.max_tokens * 0.9) {
      // Approaching budget limit
      return { status: 'budget_warning', tokens_remaining: agent.budget.max_tokens - agent.budget.tokens_used };
    }

    return { status: 'running', progress: estimateProgress(agent) };
  },

  // Complete agent
  complete: async (agent_id: string, result: AgentResult, pool: AgentPool): Promise<void> => {
    const agent = pool.state.active.get(agent_id);

    // Move to completed
    pool.state.active.delete(agent_id);
    pool.state.completed.push({
      ...agent,
      completed_at: new Date().toISOString(),
      status: result.status,
      tokens_used: result.tokens_used,
      summary: result.summary
    });

    // Update pool tokens
    pool.state.tokens_used += result.tokens_used;

    // Process queue
    await processQueue(pool);

    // Handle chaining
    if (agent.chain_on_complete && result.status === 'success') {
      await spawn(agent.chain_on_complete, pool);
    }
  }
};
```

### 12.3 Agent Communication

```typescript
interface AgentCommunication {
  // Share results between agents
  shareResults(from_agent: string, to_agent: string, data: any): void;

  // Broadcast to all agents
  broadcast(message: BroadcastMessage): void;

  // Request from another agent
  request(from_agent: string, to_agent: string, request: AgentRequest): Promise<any>;
}

interface BroadcastMessage {
  type: 'info' | 'warning' | 'state_change';
  payload: any;
}

interface AgentRequest {
  type: 'get_output' | 'get_status' | 'wait_for';
  params: Record<string, any>;
}
```

### 12.4 Dependency Resolution

```typescript
function resolveDependencies(operations: Operation[]): ExecutionPlan {
  // Build dependency graph
  const graph = new Map<string, Set<string>>();
  for (const op of operations) {
    graph.set(op.id, new Set(op.depends_on || []));
  }

  // Topological sort with parallelization
  const phases: string[][] = [];
  const remaining = new Set(operations.map(o => o.id));

  while (remaining.size > 0) {
    // Find operations with no remaining dependencies
    const ready: string[] = [];
    for (const id of remaining) {
      const deps = graph.get(id)!;
      if ([...deps].every(d => !remaining.has(d))) {
        ready.push(id);
      }
    }

    if (ready.length === 0) {
      throw new Error('Circular dependency detected');
    }

    phases.push(ready);
    ready.forEach(id => remaining.delete(id));
  }

  return {
    phases,
    total_phases: phases.length,
    max_parallelism: Math.max(...phases.map(p => p.length)),
    critical_path: calculateCriticalPath(operations, phases)
  };
}
```

---

## 13. Tool Specifications

The GoodVibes tool suite is built on **precision tools**—custom implementations that replace system tools with token-efficient, output-controlled alternatives.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TOOL ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ORCHESTRATION LAYER                                                 │
│  ┌─────────────────────┐  ┌─────────────────────┐                   │
│  │       batch         │  │      discover       │                   │
│  │  (full workflows)   │  │  (lightweight find) │                   │
│  └──────────┬──────────┘  └──────────┬──────────┘                   │
│             │                        │                               │
│             └────────────┬───────────┘                               │
│                          │                                           │
│  PRECISION LAYER         ▼                                           │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐       │
│  │  p_grep    │ │  p_read    │ │  p_glob    │ │ p_symbols  │       │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘       │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐       │
│  │  p_edit    │ │  p_write   │ │  p_exec    │ │  p_fetch   │       │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘       │
│                                                                      │
│  All precision tools share:                                          │
│  • output_mode: count_only | minimal | standard | verbose            │
│  • max_tokens: hard cap on output                                    │
│  • Batching: arrays as input, aggregated output                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 13.1 Precision Tool Suite (Foundation)

These are the core precision tools that replace system tools. They are used internally by `discover` and `batch`, but can also be called directly for simple operations.

#### Complete Token Savings Summary

| Task | System Tools | Precision Tools | Savings |
|------|-------------|-----------------|---------|
| Count files matching pattern | Glob (~100 tokens) | precision_glob count_only (~5 tokens) | **95%** |
| Find files with pattern | Grep (~200 tokens) | precision_grep files_only (~20 tokens) | **90%** |
| Search with context (10 matches) | Grep + 10×Read (~2500 tokens) | precision_grep context (~400 tokens) | **84%** |
| Get file structure (5 files) | 5×Read (~2000 tokens) | precision_read outline (~100 tokens) | **95%** |
| Edit 5 files | 5×Read + 5×Edit (~2500 tokens) | precision_edit minimal (~50 tokens) | **98%** |
| Run 3 commands | 3×Bash (~600 tokens) | precision_exec minimal (~40 tokens) | **93%** |
| Full refactor workflow | ~5000 tokens | discover + batch (~500 tokens) | **90%** |

#### System Tool → Precision Tool Mapping

| System Tool | Precision Tool | Key Improvement |
|-------------|----------------|-----------------|
| `Read` | `precision_read` | extract modes, line ranges, outline/symbols |
| `Grep` | `precision_grep` | output modes, batch queries, context control |
| `Glob` | `precision_glob` | output modes, filters, preview |
| `Edit` | `precision_edit` | atomic transactions, validation, hints |
| `Write` | `precision_write` | atomic, templates, validation |
| `Bash` | `precision_exec` | batch commands, expectations, output control |
| `WebFetch` | `precision_fetch` | caching, extraction modes, summarization |
| `workspace_symbols` | `precision_symbols` | output modes, batch files |
| `get_document_symbols` | `precision_read` + `extract: symbols` | unified API |

#### 13.1.1 `precision_grep`

Replaces: System `Grep` tool

```typescript
interface PrecisionGrep {
  name: 'precision_grep';
  description: |
    Token-efficient search with precise output control.
    Batches multiple queries, returns only what you ask for.

  params: {
    // Queries (batch multiple searches)
    queries: GrepQuery[];

    // Output control
    output: {
      mode: 'count_only' | 'files_only' | 'locations' | 'matches' | 'context';

      // Context settings (only for mode: 'context')
      context_before?: number;   // Lines before match (default: 0)
      context_after?: number;    // Lines after match (default: 0)
      expand_to?: 'line' | 'block' | 'function' | 'class';  // Expand match

      // Caps
      max_files?: number;              // Max files to return (default: 100)
      max_matches_per_file?: number;   // Cap per file (default: 10)
      max_total_matches?: number;      // Total cap (default: 100)
      max_tokens?: number;             // Hard token cap
    };

    // Execution
    parallel?: boolean;          // Run queries in parallel (default: true)
  };

  returns: {
    queries: {
      [id: string]: GrepResult;
    };
    summary: {
      total_files: number;
      total_matches: number;
      truncated: boolean;
    };
    tokens_used: number;
  };
}

interface GrepQuery {
  id: string;                    // Query identifier
  pattern: string;               // Regex pattern

  // Scope
  glob?: string;                 // File pattern (default: '**/*')
  path?: string;                 // Search root (default: cwd)
  exclude?: string[];            // Patterns to exclude

  // Flags
  case_sensitive?: boolean;      // Default: true
  whole_word?: boolean;          // Match whole words only
  multiline?: boolean;           // Allow multiline matches
  include_binary?: boolean;      // Search binary files (default: false)
}

interface GrepResult {
  // Always returned
  file_count: number;
  match_count: number;

  // Conditional based on output.mode
  files?: string[];                        // files_only+
  locations?: GrepLocation[];              // locations+
  matches?: GrepMatch[];                   // matches+
}

interface GrepLocation {
  file: string;
  line: number;
  column: number;
}

interface GrepMatch {
  file: string;
  line: number;
  column: number;
  content: string;               // The matching line
  before?: string[];             // Context before (if requested)
  after?: string[];              // Context after (if requested)
  highlight?: [number, number];  // Start/end of match in content
}
```

**Output Mode Token Costs:**

| Mode | Typical Output | Tokens (10 matches) |
|------|----------------|---------------------|
| `count_only` | `{ files: 5, matches: 23 }` | ~5 |
| `files_only` | `{ files: ["a.ts", "b.ts", ...] }` | ~20 |
| `locations` | `[{ file, line, col }, ...]` | ~50 |
| `matches` | `[{ file, line, content }, ...]` | ~150 |
| `context` | `[{ file, line, before, content, after }, ...]` | ~400 |

**Examples:**

```yaml
# Count how many files have TODOs
precision_grep:
  queries:
    - id: todos
      pattern: "// TODO"
      glob: "**/*.ts"
  output:
    mode: count_only
# Returns: { todos: { file_count: 12, match_count: 34 } }

# Find files with specific import
precision_grep:
  queries:
    - id: react-query
      pattern: "from ['\"]@tanstack/react-query['\"]"
      glob: "src/**/*.tsx"
  output:
    mode: files_only
    max_files: 50
# Returns: { react-query: { files: ["src/a.tsx", "src/b.tsx"] } }

# Get matches with context
precision_grep:
  queries:
    - id: handlers
      pattern: "async function handle\\w+"
      glob: "src/handlers/**/*.ts"
  output:
    mode: context
    context_before: 2
    context_after: 5
    max_total_matches: 20
```

---

#### 13.1.2 `precision_read`

Replaces: System `Read` tool

```typescript
interface PrecisionRead {
  name: 'precision_read';
  description: |
    Token-efficient file reading with extraction modes.
    Read full content, outlines, symbols, or specific line ranges.

  params: {
    // Files to read (batch)
    files: (string | FileReadSpec)[];

    // What to extract
    extract: 'content' | 'outline' | 'symbols' | 'ast' | 'lines';

    // Output control
    output: {
      mode: 'count_only' | 'minimal' | 'standard' | 'verbose';
      include_line_numbers?: boolean;     // Default: true for content/lines
      include_metadata?: boolean;         // Size, modified date (default: false)
      max_lines_per_file?: number;        // Cap lines per file
      max_tokens?: number;                // Hard token cap
    };

    // For extract: 'symbols'
    symbol_filter?: SymbolKind[];         // Only these symbol types

    // For extract: 'lines'
    default_range?: {
      start: number;
      end: number;
    };
  };

  returns: {
    files: {
      [path: string]: FileReadResult;
    };
    summary: {
      files_read: number;
      files_not_found: number;
      total_lines: number;
      truncated: boolean;
    };
    tokens_used: number;
  };
}

interface FileReadSpec {
  path: string;
  // Override extraction for this file
  extract?: 'content' | 'outline' | 'symbols' | 'ast' | 'lines';
  // Line range (for extract: 'lines' or 'content')
  range?: {
    start: number;    // 1-based
    end: number;      // Inclusive
  };
}

interface FileReadResult {
  exists: boolean;
  size?: number;
  modified?: string;

  // Based on extract mode
  content?: string;                       // extract: 'content' or 'lines'
  outline?: OutlineNode[];                // extract: 'outline'
  symbols?: Symbol[];                     // extract: 'symbols'
  ast?: ASTNode;                          // extract: 'ast'

  line_count?: number;
  truncated?: boolean;
}

interface OutlineNode {
  name: string;
  kind: SymbolKind;
  line: number;
  children?: OutlineNode[];
  signature?: string;                     // If output.mode >= 'standard'
}

interface Symbol {
  name: string;
  kind: SymbolKind;
  line: number;
  column: number;
  signature?: string;
  exported?: boolean;
}

type SymbolKind =
  | 'function' | 'method' | 'class' | 'interface' | 'type'
  | 'variable' | 'constant' | 'enum' | 'property' | 'namespace';
```

**Extract Mode Comparison:**

| Extract | Returns | Use Case | Tokens (500 line file) |
|---------|---------|----------|------------------------|
| `content` | Full file content | Need everything | ~2000 |
| `lines` | Specific line range | Know what you need | ~100 |
| `outline` | Structure tree | Understand organization | ~80 |
| `symbols` | Flat symbol list | Find definitions | ~60 |
| `ast` | Full AST | Code transformation | ~3000 |

**Examples:**

```yaml
# Get file structure without reading content
precision_read:
  files: ["src/index.ts", "src/app.ts", "src/utils.ts"]
  extract: outline
  output:
    mode: minimal
# Returns outlines with functions, classes, exports

# Read specific lines
precision_read:
  files:
    - path: "src/handlers/auth.ts"
      range: { start: 42, end: 78 }
    - path: "src/handlers/user.ts"
      range: { start: 15, end: 45 }
  extract: lines
  output:
    mode: standard
    include_line_numbers: true

# Get all exported functions
precision_read:
  files: ["src/**/*.ts"]  # Glob supported
  extract: symbols
  symbol_filter: [function]
  output:
    mode: minimal
```

---

#### 13.1.3 `precision_glob`

Replaces: System `Glob` tool

```typescript
interface PrecisionGlob {
  name: 'precision_glob';
  description: |
    Token-efficient file finding with filters and optional preview.

  params: {
    // Patterns to match
    patterns: string[];

    // Exclusions
    exclude?: string[];

    // Filters
    filters?: {
      min_size?: number;           // Bytes
      max_size?: number;
      modified_after?: string;     // ISO date
      modified_before?: string;
      has_content?: string;        // Quick grep filter
      is_empty?: boolean;
    };

    // Output control
    output: {
      mode: 'count_only' | 'paths_only' | 'with_stats' | 'with_preview';
      max_files?: number;          // Default: 100
      sort_by?: 'name' | 'size' | 'modified';
      sort_order?: 'asc' | 'desc';
      preview_lines?: number;      // For with_preview (default: 3)
      max_tokens?: number;
    };

    // Behavior
    respect_gitignore?: boolean;   // Default: true
    follow_symlinks?: boolean;     // Default: false
  };

  returns: {
    files: GlobResult[];
    summary: {
      total_files: number;
      total_size: number;
      truncated: boolean;
    };
    tokens_used: number;
  };
}

interface GlobResult {
  path: string;
  // If output.mode >= 'with_stats'
  size?: number;
  modified?: string;
  // If output.mode >= 'with_preview'
  preview?: string[];
}
```

**Output Mode Costs:**

| Mode | Returns | Tokens (50 files) |
|------|---------|-------------------|
| `count_only` | Just count | ~5 |
| `paths_only` | File paths | ~100 |
| `with_stats` | Paths + size + date | ~200 |
| `with_preview` | Above + first N lines | ~500 |

**Examples:**

```yaml
# Count TypeScript files
precision_glob:
  patterns: ["**/*.ts", "**/*.tsx"]
  exclude: ["node_modules", "dist"]
  output:
    mode: count_only
# Returns: { total_files: 156 }

# Find large files
precision_glob:
  patterns: ["**/*"]
  filters:
    min_size: 100000  # > 100KB
  output:
    mode: with_stats
    sort_by: size
    sort_order: desc
    max_files: 10

# Find recently modified
precision_glob:
  patterns: ["src/**/*.ts"]
  filters:
    modified_after: "2024-01-15"
  output:
    mode: paths_only
```

---

#### 13.1.4 `precision_symbols`

Replaces: `workspace_symbols`, `get_document_symbols`

```typescript
interface PrecisionSymbols {
  name: 'precision_symbols';
  description: |
    Token-efficient symbol search across workspace or specific files.

  params: {
    // Search mode
    mode: 'workspace' | 'document';

    // For workspace mode
    query?: string;                // Symbol name pattern

    // For document mode
    files?: string[];              // Files to analyze

    // Filters
    kinds?: SymbolKind[];
    exported_only?: boolean;
    include_private?: boolean;     // Default: false

    // Output control
    output: {
      mode: 'count_only' | 'names_only' | 'locations' | 'signatures' | 'full';
      max_results?: number;        // Default: 100
      group_by?: 'file' | 'kind' | 'none';
      max_tokens?: number;
    };
  };

  returns: {
    symbols: SymbolResult[];
    summary: {
      total_symbols: number;
      by_kind: { [kind: string]: number };
      files_searched: number;
    };
    tokens_used: number;
  };
}

interface SymbolResult {
  name: string;
  kind: SymbolKind;
  // If output.mode >= 'locations'
  file?: string;
  line?: number;
  column?: number;
  // If output.mode >= 'signatures'
  signature?: string;
  // If output.mode >= 'full'
  exported?: boolean;
  container?: string;            // Parent class/namespace
  documentation?: string;
}
```

**Examples:**

```yaml
# Find all functions named "handle*"
precision_symbols:
  mode: workspace
  query: "handle"
  kinds: [function, method]
  output:
    mode: locations
    max_results: 50

# Get document structure
precision_symbols:
  mode: document
  files: ["src/api/routes.ts"]
  output:
    mode: signatures
    group_by: kind
```

---

#### 13.1.5 `precision_edit`

Replaces: System `Edit` tool

```typescript
interface PrecisionEdit {
  name: 'precision_edit';
  description: |
    Token-efficient file editing with atomic transactions,
    conflict detection, and validation.

  params: {
    // Edits to apply
    edits: EditSpec[];

    // Transaction control
    transaction: {
      mode: 'atomic' | 'partial' | 'none';
      rollback_on_fail: boolean;
    };

    // Matching behavior
    match: {
      mode: 'exact' | 'fuzzy' | 'regex' | 'ast';
      case_sensitive?: boolean;
      whitespace_sensitive?: boolean;
    };

    // Validation
    validate?: {
      before?: ValidationStep[];
      after?: ValidationStep[];
    };

    // Preview
    dry_run?: boolean;

    // Output control
    output: {
      mode: 'count_only' | 'minimal' | 'with_diff' | 'verbose';
      diff_context?: number;       // Lines of context in diff
      max_tokens?: number;
    };
  };

  returns: {
    edits: EditResult[];
    summary: {
      files_modified: number;
      edits_applied: number;
      edits_failed: number;
    };
    validation?: ValidationResult;
    rollback_id?: string;
    tokens_used: number;
  };
}

interface EditSpec {
  id?: string;                   // Optional edit identifier
  file: string;

  // What to find
  find: string;

  // What to replace with
  replace: string;

  // Which occurrence
  occurrence?: 'first' | 'last' | 'all' | number;

  // Position hints (for ambiguous matches)
  hints?: {
    near_line?: number;
    in_function?: string;
    in_class?: string;
    after?: string;              // After this text
    before?: string;             // Before this text
  };
}

interface EditResult {
  id?: string;
  file: string;
  status: 'applied' | 'not_found' | 'ambiguous' | 'conflict' | 'failed';
  edits_applied?: number;
  diff?: string;                 // If output.mode includes diff
  error?: string;
}
```

**Output Mode Costs:**

| Mode | Returns | Tokens (5 edits) |
|------|---------|------------------|
| `count_only` | Just counts | ~10 |
| `minimal` | Status per edit | ~30 |
| `with_diff` | Status + diffs | ~200 |
| `verbose` | Full details | ~400 |

**Examples:**

```yaml
# Simple rename
precision_edit:
  edits:
    - file: "src/utils.ts"
      find: "function oldName"
      replace: "function newName"
      occurrence: all
  transaction:
    mode: atomic
  output:
    mode: minimal

# Multiple edits with validation
precision_edit:
  edits:
    - file: "src/api.ts"
      find: "const API_URL = 'http://localhost'"
      replace: "const API_URL = process.env.API_URL"
    - file: "src/config.ts"
      find: "debug: true"
      replace: "debug: process.env.NODE_ENV !== 'production'"
  transaction:
    mode: atomic
    rollback_on_fail: true
  validate:
    after: [typecheck]
  dry_run: false
  output:
    mode: with_diff
```

---

#### 13.1.6 `precision_write`

Replaces: System `Write` tool

```typescript
interface PrecisionWrite {
  name: 'precision_write';
  description: |
    Token-efficient file creation with templates, validation, and atomicity.

  params: {
    // Files to create
    files: WriteSpec[];

    // Behavior
    overwrite?: boolean;           // Overwrite existing (default: false)
    create_dirs?: boolean;         // Create parent dirs (default: true)
    backup?: boolean;              // Backup before overwrite (default: true)

    // Templates
    template?: {
      engine: 'handlebars' | 'ejs' | 'none';
      data?: Record<string, any>;
    };

    // Transaction
    transaction: {
      mode: 'atomic' | 'partial' | 'none';
    };

    // Validation
    validate?: {
      after?: ValidationStep[];
    };

    // Preview
    dry_run?: boolean;

    // Output control
    output: {
      mode: 'count_only' | 'minimal' | 'with_preview' | 'verbose';
      preview_lines?: number;
      max_tokens?: number;
    };
  };

  returns: {
    files: WriteResult[];
    summary: {
      files_created: number;
      files_overwritten: number;
      files_failed: number;
      bytes_written: number;
    };
    validation?: ValidationResult;
    rollback_id?: string;
    tokens_used: number;
  };
}

interface WriteSpec {
  path: string;
  content: string;
  encoding?: string;             // Default: 'utf-8'
}

interface WriteResult {
  path: string;
  status: 'created' | 'overwritten' | 'skipped' | 'failed';
  size?: number;
  error?: string;
  preview?: string[];            // If output.mode includes preview
}
```

---

#### 13.1.7 `precision_exec`

Replaces: System `Bash` tool

```typescript
interface PrecisionExec {
  name: 'precision_exec';
  description: |
    Token-efficient command execution with precise output capture.

  params: {
    // Commands to run
    commands: CommandSpec[];

    // Execution
    parallel?: boolean;            // Run in parallel (default: false)
    fail_fast?: boolean;           // Stop on first failure (default: true)
    shell?: string;                // Shell to use

    // Environment
    env?: Record<string, string>;
    working_dir?: string;

    // Safety
    safe_mode?: boolean;           // Block destructive commands (default: true)
    timeout_ms?: number;           // Default: 30000

    // Output control
    output: {
      mode: 'count_only' | 'exit_codes' | 'minimal' | 'standard' | 'verbose';
      capture_stdout?: boolean;    // Default: true
      capture_stderr?: boolean;    // Default: true
      max_output_lines?: number;   // Cap output per command
      max_tokens?: number;
    };
  };

  returns: {
    commands: CommandResult[];
    summary: {
      total: number;
      succeeded: number;
      failed: number;
      total_duration_ms: number;
    };
    tokens_used: number;
  };
}

interface CommandSpec {
  id?: string;
  cmd: string;
  timeout_ms?: number;
  expect?: {
    exit_code?: number | number[];
    stdout_contains?: string;
    stdout_matches?: string;       // Regex
    stderr_empty?: boolean;
  };
}

interface CommandResult {
  id?: string;
  cmd: string;
  exit_code: number;
  duration_ms: number;
  expectations_met: boolean;
  // Based on output.mode
  stdout?: string;
  stderr?: string;
  truncated?: boolean;
}
```

**Output Mode Costs:**

| Mode | Returns | Tokens |
|------|---------|--------|
| `count_only` | Just success/fail count | ~5 |
| `exit_codes` | Exit codes only | ~15 |
| `minimal` | Exit code + expectations | ~30 |
| `standard` | Above + truncated output | ~200 |
| `verbose` | Full output | Variable |

---

#### 13.1.8 `precision_fetch`

Replaces: System `WebFetch` tool

```typescript
interface PrecisionFetch {
  name: 'precision_fetch';
  description: |
    Token-efficient URL fetching with caching and content extraction.

  params: {
    // URLs to fetch
    urls: (string | FetchSpec)[];

    // Extraction
    extract: 'raw' | 'text' | 'markdown' | 'structured' | 'summary';

    // For extract: 'structured'
    selectors?: string[];          // CSS selectors

    // For extract: 'summary'
    summary_prompt?: string;

    // Caching
    cache_ttl_seconds?: number;    // 0 = no cache (default: 900)

    // Output control
    output: {
      mode: 'count_only' | 'minimal' | 'standard' | 'verbose';
      max_content_length?: number;
      max_tokens?: number;
    };
  };

  returns: {
    urls: FetchResult[];
    summary: {
      fetched: number;
      from_cache: number;
      failed: number;
    };
    tokens_used: number;
  };
}

interface FetchSpec {
  url: string;
  extract?: 'raw' | 'text' | 'markdown' | 'structured' | 'summary';
  selectors?: string[];
}

interface FetchResult {
  url: string;
  status: 'success' | 'cached' | 'failed' | 'timeout';
  http_status?: number;
  content?: string;
  structured?: Record<string, string[]>;  // If extract: 'structured'
  summary?: string;                        // If extract: 'summary'
  error?: string;
}
```

---

### 13.2 Discovery Tool: `discover`

A lightweight tool for finding things before batch operations. Uses precision tools internally.

```yaml
name: discover
description: |
  Lightweight discovery tool for finding files, symbols, and patterns.
  Use before batch operations to identify targets.
  Optimized for minimal token usage.

params:
  # Queries to run (all run in parallel)
  queries:
    - id: string (required)

      # Query type (exactly one required)
      grep?: string              # Search for pattern
      glob?: string | string[]   # Find files by pattern
      symbols?: string           # Search for symbols

      # Scope (optional)
      path?: string              # Search root
      exclude?: string[]         # Exclusions

      # Filters (optional)
      filters?:
        max_size?: number
        modified_since?: string
        has_content?: string     # Secondary grep filter
        kinds?: SymbolKind[]     # For symbols

  # Output control
  output:
    mode: count_only | files_only | locations | minimal
    max_per_query?: number       # Default: 100
    max_tokens?: number

returns:
  # Results keyed by query id
  results:
    [query_id]:
      count: number              # Always present
      files?: string[]           # If mode >= files_only
      locations?: Location[]     # If mode >= locations
      matches?: number           # For grep queries

  summary:
    total_queries: number
    total_files: number
    duration_ms: number

  tokens_used: number

examples:
  # Find files to refactor
  - queries:
      - id: old-api
        grep: "fetchUserData\\("
        glob: "src/**/*.ts"
      - id: components
        glob: "src/components/**/*.tsx"
      - id: tests
        glob: "**/*.test.ts"
        filters:
          has_content: "fetchUserData"
    output:
      mode: files_only

  # Quick count
  - queries:
      - id: todos
        grep: "// TODO"
      - id: fixmes
        grep: "// FIXME"
    output:
      mode: count_only
  # Returns: { todos: { count: 23 }, fixmes: { count: 7 } }
```

**Workflow: discover → batch**

```yaml
# Step 1: Discover targets
discover:
  queries:
    - id: handlers
      grep: "export async function"
      glob: "src/handlers/**/*.ts"
    - id: tests
      glob: "src/handlers/**/*.test.ts"
  output:
    mode: files_only

# Step 2: Batch with known targets
batch:
  operations:
    read:
      - type: files
        targets: $discover.handlers.files  # From step 1
        extract: outline

    exec:
      - type: agent
        agent: goodvibes:tester
        task: "Add tests for handlers missing coverage"
        inject:
          handlers: $discover.handlers.files
          existing_tests: $discover.tests.files
```

---

### 13.3 Batch Tool: `batch`

The orchestration tool that combines discovery and operations into a single workflow.

```yaml
name: batch
description: |
  Universal batch execution engine. Combines discovery, read, write, exec,
  query, and state operations with full transaction support, parallel
  execution, validation pipeline, and automatic recovery.

  Execution order: DISCOVERY → READ → WRITE → EXEC → QUERY → STATE

params:
  # DISCOVERY PHASE (optional, runs first)
  # Use for finding targets before operations
  discovery:
    - id: string (required)
      grep?: string           # Search pattern
      glob?: string[]         # File patterns
      symbols?: string        # Symbol search
      exclude?: string[]
      filters?: {...}

  # OPERATIONS (at least one required)
  operations:
    read: ReadOperation[]     # Uses precision_read, precision_grep
    write: WriteOperation[]   # Uses precision_edit, precision_write
    exec: ExecOperation[]     # Uses precision_exec + agent spawning
    query: QueryOperation[]   # LSP, validation
    state: StateOperation[]   # State tracking

  # Transaction configuration
  transaction:
    mode: atomic | partial | none
    isolation: strict | relaxed
    timeout_ms: number (default: 300000)

  # Execution configuration
  execution:
    mode: parallel | sequential | adaptive (default: adaptive)
    max_workers: number (default: 6)
    fail_fast: boolean (default: false)
    retry:
      attempts: number (default: 3)
      backoff: linear | exponential | fixed (default: exponential)
      delay_ms: number (default: 1000)

  # Preview configuration
  preview:
    dry_run: boolean (default: false)
    diff: boolean (default: true)
    impact: boolean (default: true)

  # Validation configuration
  validation:
    before: ValidationStep[]
    after: ValidationStep[]
    on_fail: rollback | warn | ignore (default: rollback)

  # Recovery configuration
  recovery:
    checkpoint: boolean (default: true)
    rollback_on_fail: boolean (default: true)
    cleanup_on_success: boolean (default: true)

  # Output configuration
  output:
    mode: count_only | minimal | standard | verbose (default: minimal)
    include: string[]
    exclude: string[]
    max_tokens: number

returns:
  BatchResult (see section 3.3)

examples:
  # Simple multi-file read
  - operations:
      read:
        - id: read-files
          type: files
          targets: ["src/index.ts", "src/app.ts"]
          extract: outline
    output:
      mode: minimal

  # Search and edit
  - operations:
      read:
        - id: find-todos
          type: search
          pattern: "// TODO:"
          glob: "**/*.ts"
      write:
        - id: update-todos
          type: edit
          depends_on: [find-todos]
          targets: "{{find-todos.matches}}"
          edits:
            - find: "// TODO:"
              replace: "// FIXME:"
    validation:
      after: [typecheck]

  # With discovery phase (find targets first)
  - discovery:
      - id: old-imports
        grep: "from 'lodash'"
        glob: "src/**/*.ts"
      - id: test-files
        glob: "**/*.test.ts"
    operations:
      write:
        - id: update-imports
          type: edit
          targets: "{{old-imports.files}}"   # Use discovery results
          edits:
            - find: "from 'lodash'"
              replace: "from 'lodash-es'"
              occurrence: all
      exec:
        - id: run-tests
          type: command
          commands:
            - cmd: "npm test -- --testPathPattern={{test-files.files}}"
          depends_on: [update-imports]
    validation:
      after: [typecheck, test]

  # Parallel agents
  - operations:
      exec:
        - id: backend
          type: agent
          agent: goodvibes:engineer
          task: Implement user API
        - id: frontend
          type: agent
          agent: goodvibes:engineer
          task: Create user dashboard
          depends_on: [backend]
    execution:
      mode: adaptive
      max_workers: 6
```

### 13.4 Monitoring Tool: `batch_status`

```yaml
name: batch_status
description: |
  Get status of running or completed batch. Use for monitoring
  long-running batches without consuming output tokens.

params:
  batch_id: string (required)
  include:
    progress: boolean (default: true)
    results: boolean (default: false)
    telemetry: boolean (default: false)

returns:
  status: pending | running | complete | failed | rolled_back
  progress:
    phases_complete: number
    phases_total: number
    operations_complete: number
    operations_total: number
    current_phase: string
    current_operations: string[]
  duration_ms: number
  tokens_used: number
  results: BatchResult (if include.results)
  telemetry: BatchMetrics (if include.telemetry)
```

### 13.5 Recovery Tool: `batch_recover`

```yaml
name: batch_recover
description: |
  Recovery operations for batches. Rollback, restore checkpoints,
  retry failed operations.

params:
  operation: rollback | restore | retry | cleanup

  # For rollback
  batch_id: string
  scope: all | files | state

  # For restore
  checkpoint_id: string

  # For retry
  operation_ids: string[]

  # For cleanup
  policy:
    max_age_hours: number
    max_count: number

returns:
  success: boolean
  details: RecoveryDetails
```

### 13.6 State Tool: `batch_state`

```yaml
name: batch_state
description: |
  Direct state operations outside of batch context.
  Use for querying state, memory, and telemetry.

params:
  operation: get | set | query | export

  # For get
  keys: string[]

  # For set
  entries: { key: string, value: any }[]
  persist: boolean

  # For query (memory)
  filters:
    kinds: string[]
    since: string
    keywords: string[]
    limit: number

  # For export
  format: json | markdown
  include: [state | memory | telemetry]

returns:
  data: any
```

---

## 14. File Structure

### 14.1 Plugin Structure

```
plugins/goodvibes/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── .mcp.json                    # MCP server configuration
├── .lsp.json                    # LSP server configuration
│
├── agents/
│   ├── _registry.yaml           # Agent registry (auto-generated)
│   ├── engineer.md              # Unified engineer agent
│   ├── reviewer.md              # Code review agent
│   ├── tester.md                # Testing agent
│   ├── architect.md             # Architecture agent
│   ├── deployer.md              # Deployment agent
│   └── integrator.md            # Integration agent
│
├── skills/
│   ├── _registry.yaml           # Skill registry (auto-generated)
│   ├── core/                    # Core skills (always loaded)
│   │   ├── batch-operations/
│   │   ├── error-recovery/
│   │   └── code-quality/
│   └── stacks/                  # Stack-specific skills (auto-loaded)
│       ├── react/
│       ├── node/
│       ├── python/
│       └── ...
│
├── tools/
│   ├── _registry.yaml           # Tool registry (auto-generated)
│   ├── definitions/
│   │   ├── batch.yaml           # Main batch tool
│   │   ├── batch-status.yaml
│   │   ├── batch-recover.yaml
│   │   └── batch-state.yaml
│   └── implementations/
│       └── batch-engine/        # MCP server implementation
│           ├── src/
│           │   ├── index.ts
│           │   ├── engine/
│           │   │   ├── batch.ts
│           │   │   ├── operations/
│           │   │   ├── lifecycle/
│           │   │   └── recovery/
│           │   ├── state/
│           │   ├── memory/
│           │   ├── telemetry/
│           │   └── context/
│           ├── package.json
│           └── tsconfig.json
│
├── hooks/
│   ├── hooks.json               # Hook registration
│   └── scripts/
│       └── src/
│           ├── index.ts
│           ├── session-start.ts
│           ├── session-end.ts
│           ├── batch-start.ts
│           ├── batch-end.ts
│           ├── agent-start.ts
│           ├── agent-end.ts
│           └── shared/
│
├── output-styles/
│   ├── vibecoding.md
│   └── justvibes.md
│
├── commands/
│   ├── batch.md                 # /batch command
│   ├── status.md                # /status command
│   ├── recover.md               # /recover command
│   └── mode.md                  # /mode command
│
└── templates/
    ├── agent-prompt.hbs         # Agent prompt template
    ├── error-report.hbs         # Error report template
    └── batch-summary.hbs        # Batch summary template
```

### 14.2 Project State Structure

```
.goodvibes/
├── state/
│   ├── session.json             # Current session state
│   ├── agents.json              # Agent tracking
│   ├── locks.json               # Resource locks
│   └── health.json              # Health check cache
│
├── memory/
│   ├── decisions.md             # Architectural decisions
│   ├── patterns.md              # Code patterns
│   ├── failures.md              # Past failures
│   ├── preferences.json         # User preferences
│   └── index.json               # Search index
│
├── checkpoints/
│   ├── cp_YYYYMMDD_HHMMSS/
│   │   ├── manifest.json
│   │   ├── files/
│   │   └── state.json
│   └── ...
│
├── telemetry/
│   ├── current.json             # Current session metrics
│   ├── history/
│   │   └── YYYY-MM-DD.json
│   └── aggregations.json
│
├── logs/
│   ├── activity.md              # Activity log (justvibes)
│   ├── decisions.md             # Decision log
│   └── errors.md                # Error log
│
└── cache/
    ├── stack.json               # Stack detection cache
    ├── symbols.json             # Symbol index cache
    └── deps.json                # Dependency graph cache
```

---

## 15. Implementation Plan

### 15.1 Phase 1: Core Batch Engine (Week 1-2)

**Goal:** Implement the batch tool with basic operations

**Tasks:**
1. Design and implement batch engine core
   - Operation queue and scheduler
   - Dependency resolution
   - Parallel execution with worker pool
   - Result aggregation

2. Implement READ operations
   - File read with extraction modes
   - Search with context
   - Glob with filters
   - Symbol search

3. Implement WRITE operations
   - Create with templates
   - Edit with conflict detection
   - Delete with safety guards
   - Move with import updates

4. Implement basic lifecycle
   - Checkpoint creation
   - Basic rollback
   - Validation hooks (typecheck, lint)

**Deliverables:**
- `batch` tool with read/write operations
- Basic state management
- Checkpoint/rollback system

### 15.2 Phase 2: Execution & Agents (Week 3-4)

**Goal:** Add exec operations and agent coordination

**Tasks:**
1. Implement EXEC operations
   - Command execution with expectations
   - Agent spawning with budget tracking
   - Script execution

2. Implement agent pool
   - Concurrent agent management
   - Budget enforcement
   - Dependency-aware scheduling
   - Result passing between agents

3. Implement QUERY operations
   - LSP batch queries
   - Validation suite
   - Diagnosis tools

4. Enhance lifecycle
   - Full hook system
   - Fix loop implementation
   - Mode-aware behavior

**Deliverables:**
- Full `batch` tool with all operation types
- Agent coordination system
- Fix loop and recovery

### 15.3 Phase 3: State & Memory (Week 5)

**Goal:** Implement persistent state and memory systems

**Tasks:**
1. Implement state management
   - Session state
   - Agent tracking
   - Lock management
   - Health tracking

2. Implement memory system
   - Decision recording
   - Pattern discovery
   - Failure tracking
   - Search and relevance

3. Implement context system
   - Context gathering
   - Template resolution
   - Context injection

**Deliverables:**
- Complete state management
- Memory system with search
- Context injection

### 15.4 Phase 4: Telemetry & Polish (Week 6)

**Goal:** Add telemetry, optimize, and polish

**Tasks:**
1. Implement telemetry
   - Metrics collection
   - Aggregations
   - Cost estimation
   - Reporting

2. Optimize performance
   - Token efficiency tuning
   - Parallel execution optimization
   - Caching strategies

3. Polish and documentation
   - Error messages
   - Help documentation
   - Example library

**Deliverables:**
- Full telemetry system
- Optimized performance
- Complete documentation

### 15.5 Phase 5: Agent Consolidation (Week 7)

**Goal:** Consolidate agents to new architecture

**Tasks:**
1. Design new agent prompts
   - Engineer (unified backend/frontend)
   - Reviewer
   - Tester
   - Architect
   - Deployer
   - Integrator

2. Implement agent-batch integration
   - Agents use batch tool internally
   - Context injection from batch
   - Result reporting to batch

3. Update skills
   - Core skills (batch operations, recovery)
   - Stack-specific skills
   - Auto-loading based on detection

**Deliverables:**
- 6 consolidated agents
- ~40 essential skills
- Agent-batch integration

### 15.6 Phase 6: Mode System & Hooks (Week 8)

**Goal:** Complete mode system and hook integration

**Tasks:**
1. Implement mode system
   - Mode configuration loading
   - Mode-aware behavior throughout
   - Mode switching

2. Implement Claude Code hooks
   - Session hooks
   - Batch hooks
   - Agent hooks

3. End-to-end testing
   - vibecoding flow
   - justvibes flow
   - Recovery scenarios

**Deliverables:**
- Complete mode system
- Full hook integration
- E2E test coverage

---

## Appendix A: Migration Guide

### From v1 to v2

**Tool Migration:**

| v1 Tool | v2 Equivalent |
|---------|---------------|
| `batch_read` | `batch { read: [{ type: 'files' }] }` |
| `smart_glob` | `batch { read: [{ type: 'glob' }] }` |
| `grep_with_content` | `batch { read: [{ type: 'search' }] }` |
| `atomic_multi_edit` | `batch { write: [{ type: 'edit' }] }` |
| `workspace_symbols` | `batch { read: [{ type: 'symbols' }] }` |
| `get_document_symbols` | `batch { read: [{ type: 'files', extract: 'symbols' }] }` |

**Agent Migration:**

| v1 Agent | v2 Agent |
|----------|----------|
| `backend-engineer` | `engineer` (with backend context) |
| `frontend-architect` | `engineer` (with frontend context) |
| `fullstack-integrator` | `integrator` |
| `brutally-honest-reviewer` | `reviewer` |
| `code-architect` | `architect` |
| `test-engineer` | `tester` |
| `devops-deployer` | `deployer` |
| `content-platform` | `integrator` (with content context) |
| `workflow-planner` | `architect` (with planning context) |

---

## Appendix B: Example Batches

### B.1 Feature Implementation

```yaml
# Implement user authentication feature
operations:
  # Phase 1: Research
  read:
    - id: find-auth
      type: search
      pattern: "auth|login|session"
      glob: "src/**/*.ts"
    - id: check-deps
      type: analyze
      kind: dependencies

  # Phase 2: Backend
  exec:
    - id: backend
      type: agent
      agent: goodvibes:engineer
      task: |
        Implement user authentication API:
        - POST /auth/login
        - POST /auth/register
        - POST /auth/logout
        - GET /auth/me
        Use JWT tokens, bcrypt for passwords.
      depends_on: [find-auth, check-deps]
      inject:
        existing_auth: "{{find-auth.results}}"
        deps: "{{check-deps.results}}"

  # Phase 3: Frontend
  exec:
    - id: frontend
      type: agent
      agent: goodvibes:engineer
      task: |
        Create authentication UI:
        - Login page
        - Register page
        - Auth context/provider
        - Protected route wrapper
      depends_on: [backend]
      inject:
        api: "{{backend.outputs.api}}"

  # Phase 4: Tests
  exec:
    - id: tests
      type: agent
      agent: goodvibes:tester
      task: Write comprehensive tests for auth flow
      depends_on: [backend, frontend]

transaction:
  mode: atomic

validation:
  after:
    - typecheck
    - test

recovery:
  checkpoint: true
  rollback_on_fail: true
```

### B.2 Codebase Refactor

```yaml
# Refactor to use repository pattern
operations:
  # Analyze current state
  read:
    - id: find-data-access
      type: search
      pattern: "prisma\\.|db\\."
      glob: "src/**/*.ts"
    - id: analyze-structure
      type: files
      targets: ["src/"]
      extract: outline

  # Plan refactor
  exec:
    - id: plan
      type: agent
      agent: goodvibes:architect
      task: |
        Design repository pattern implementation:
        - Identify all data access points
        - Design repository interfaces
        - Plan migration strategy
      depends_on: [find-data-access, analyze-structure]

  # Implement repositories
  exec:
    - id: implement
      type: agent
      agent: goodvibes:engineer
      task: Implement the repository pattern as planned
      depends_on: [plan]
      inject:
        plan: "{{plan.outputs.plan}}"

  # Review changes
  exec:
    - id: review
      type: agent
      agent: goodvibes:reviewer
      task: Review the refactoring for correctness and completeness
      depends_on: [implement]

validation:
  after:
    - typecheck
    - test:
        filter: related
```

### B.3 Quick Multi-Edit

```yaml
# Rename function across codebase
operations:
  read:
    - id: find-usages
      type: search
      pattern: "\\bgetUserData\\b"
      glob: "**/*.ts"

  write:
    - id: rename
      type: edit
      targets: "{{find-usages.matches}}"
      edits:
        - find: "getUserData"
          replace: "fetchUserProfile"
          occurrence: all
      options:
        match_mode: exact

validation:
  after: [typecheck]

output:
  mode: minimal
```

---

## Appendix C: Configuration Reference

### C.1 plugin.json

```json
{
  "name": "goodvibes",
  "version": "2.0.0",
  "description": "Batch-first autonomous coding system",

  "agents": [
    "./agents/engineer.md",
    "./agents/reviewer.md",
    "./agents/tester.md",
    "./agents/architect.md",
    "./agents/deployer.md",
    "./agents/integrator.md"
  ],

  "skills": "./skills/",

  "hooks": "./hooks/hooks.json",

  "mcpServers": "./.mcp.json",

  "lspServers": "./.lsp.json",

  "commands": "./commands/",

  "outputStyles": "./output-styles/"
}
```

### C.2 .mcp.json

```json
{
  "mcpServers": {
    "batch-engine": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/tools/implementations/batch-engine/dist/index.cjs"],
      "env": {
        "PLUGIN_ROOT": "${CLAUDE_PLUGIN_ROOT}",
        "NODE_ENV": "production"
      }
    }
  }
}
```

### C.3 hooks.json

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [{
          "type": "command",
          "command": "node ${PLUGIN_ROOT}/hooks/scripts/dist/session-start.cjs"
        }]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [{
          "type": "command",
          "command": "node ${PLUGIN_ROOT}/hooks/scripts/dist/session-end.cjs"
        }]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "goodvibes:*",
        "hooks": [{
          "type": "command",
          "command": "node ${PLUGIN_ROOT}/hooks/scripts/dist/agent-start.cjs"
        }]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "goodvibes:*",
        "hooks": [{
          "type": "command",
          "command": "node ${PLUGIN_ROOT}/hooks/scripts/dist/agent-end.cjs"
        }]
      }
    ],
    "PreCompact": [
      {
        "matcher": "*",
        "hooks": [{
          "type": "command",
          "command": "node ${PLUGIN_ROOT}/hooks/scripts/dist/pre-compact.cjs"
        }]
      }
    ]
  }
}
```

---

*End of Specification*
