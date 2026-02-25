# Runtime Engine - Exhaustive Technical Documentation

## Project Structure

**Location:** `plugins/goodvibes/tools/implementations/runtime-engine/`

### Build Configuration
- **build.mjs**: esbuild bundler that compiles `src/server.ts` → `dist/index.cjs`
  - Platform: node, Target: node18
  - Format: CommonJS with sourcemaps
  - No minification, keeps function names
  
- **package.json**: Version 1.0.0
  - Main entry: `dist/index.cjs`
  - Scripts: build, typecheck, dev, test, test:watch, test:coverage
  - Dependencies: @modelcontextprotocol/sdk ^1.0.0
  - DevDeps: TypeScript 5.3, Vitest 2.0, esbuild 0.20

---

## Core Entry Points

### `/src/server.ts`
**Type:** Server bootstrap file
- **Function:** `main(): Promise<void>`
  - Instantiates `RuntimeEngineServer` from `./server/mcp-server.ts`
  - Calls `server.start()`
- **Error handling:** Direct stderr output on fatal startup failures (process.exit(1))

### `/src/index.ts`
**Type:** Library export surface
**Exports:** Re-exports from all subsystems for consumption by engine and external modules
- Config: `loadConfig`, `saveConfig`, DEFAULT_CONFIG, RuntimeConfig interfaces
- Shared: Constants, Logger, Utils (generateId, timestamp, etc.)
- Events: EventBus, EventLog, EventQueue, all event types/payloads
- Triggers: TriggerRegistry, ConditionEvaluator, ActionExecutor, builtin triggers
- Workflows: WorkflowEngine, all workflow types
- Persistence: StateStore, CrashRecovery, persistence types
- IPC: IPCServer, RuntimeClient, FileFallback, IPCRouter, protocol types
- Agents: AgentCoordinator, BudgetTracker, all agent types

---

## Shared Infrastructure

### `/src/shared/config.ts`
**Type:** Configuration management with deep-merge

**Interfaces:**
- `IpcConfig`: socket_dir, connect_timeout_ms, query_timeout_ms
- `QueueConfig`: max_size, max_attempts, backoff_base_ms, backoff_multiplier, process_interval_ms
- `PersistenceConfig`: checkpoint_interval_ms, event_log_max_size_mb, compact_after_hours, state_dir
- `WorkflowsConfig`: max_active, max_transitions_per_workflow, wrfc_max_fix_iterations, fix_loop_max_attempts
- `TriggersConfig`: max_triggers, default_cooldown_ms, max_fires_per_session
- `HealthConfig`: check_interval_ms, memory_warn_mb, memory_critical_mb, queue_depth_warn
- `AgentsConfig`: max_concurrent, session_budget, budget_thresholds, default_budget, max_review_iterations
- `FeaturesConfig`: ipc_enabled, workflows_enabled, agents_enabled, full_integration
- `RuntimeConfig`: Complete merged configuration (all above sections)

**Constants:**
- `DEFAULT_CONFIG`: Production-safe defaults for all sections
  - IPC socket_dir: XDG_RUNTIME_DIR or /tmp/goodvibes-{uid}
  - Queue: max_size=10000, max_attempts=3, backoff_base=1000ms, multiplier=2, interval=10ms
  - Persistence: checkpoint=30000ms, log_max=50mb, compact=24hrs, state_dir=".goodvibes/state"
  - Workflows: max_active=10, max_transitions=100, wrfc_fix_iters=3, fix_loop_max=5
  - Triggers: max=100, cooldown=5000ms, max_fires=50
  - Health: check=60000ms, warn_mem=256mb, critical_mem=512mb, queue_warn=100
  - Agents: max_concurrent=6, session_budget=0 (unlimited), default=200k tokens, max_review=3
  - Features: all enabled (full_integration=true)

**Functions:**
- `deepMerge<T>(base: T, override: Partial<T>): T`
  - Recursive merge with override taking precedence
  - Handles nested objects, arrays ignored
  
- `loadConfig(projectRoot?: string): RuntimeConfig`
  - Reads `.goodvibes/state/runtime-config.json` if exists
  - Deep-merges with DEFAULT_CONFIG
  - Silent on ENOENT (first run), warns on parse errors
  - Returns fully resolved config
  
- `saveConfig(projectRoot: string, config: RuntimeConfig): void`
  - Creates state directory recursively
  - Writes to tmpfile + atomic rename pattern
  - Creates `.goodvibes/state/runtime-config.json`

### `/src/shared/constants.ts`
**Constant:**
- `ENGINE_VERSION = '1.0.0'` — Semantic version, not stored in user config

### `/src/shared/logger.ts`
**Type:** Structured JSON logging to stderr

**Type Definitions:**
- `LogLevel`: 'debug' | 'info' | 'warn' | 'error'
- `LogEntry`: timestamp, level, component, message, metadata?
- `Logger` interface: debug(), info(), warn(), error() methods

**Functions:**
- `createLogger(component: string): Logger`
  - Binds component name to all log entries
  - Checks GOODVIBES_LOG_LEVEL env (cached 5s), defaults to 'info'
  - Writes JSON to stderr (MCP convention: stdout reserved for protocol)
  - Filters by level: debug(0) < info(1) < warn(2) < error(3)
  - Async handlers do NOT block

**Implementation Details:**
- Cache TTL: 5000ms for log level lookups
- Each entry: ISO timestamp + level + component + message + optional metadata

### `/src/shared/utils.ts`
**Type:** Pure utility functions

**Functions:**
- `generateId(): string` — RFC 4122 v4 UUID
- `timestamp(): string` — ISO-8601 timestamp
- `generateEventId(): string` — Format: `evt_<uuid>`
- `generateWorkflowId(): string` — Format: `wf_<uuid>`
- `toErrorMessage(err: unknown): string` — Safe error extraction
- `parseRelativeTime(input: string): Date`
  - Parses "5m", "30s", "2h", "1d"
  - Returns absolute Date in future
  - Supported units: s=1000ms, m=60000ms, h=3600000ms, d=86400000ms
  - Throws on invalid format

---

## Event System

### `/src/events/types.ts`
**Type:** Complete event type catalog (636 lines)

**Core Structures:**
- `EventMetadata`: session_id, correlation_id?, causation_id?, sequence, version=1
- `EventSource` (discriminated union):
  - hook: { kind: 'hook', hook_name: string }
  - workflow: { kind: 'workflow', workflow_id: string }
  - agent: { kind: 'agent', agent_id: string }
  - trigger: { kind: 'trigger', trigger_id: string }
  - system: { kind: 'system' }
  - mcp_tool: { kind: 'mcp_tool', tool_name: string }
  - ipc: { kind: 'ipc', client_id: string }

**Event Types (EventType):** 50+ namespaced types
- `session:*`: started, ending, ended, compact
- `hook:*`: pre_tool_use, post_tool_use, post_tool_use_failure, session_start, session_end, subagent_start, subagent_stop, pre_compact, stop, notification, user_prompt_submit
- `workflow:*`: created, state_changed, completed, failed, cancelled
- `wrfc:*`: gathering_started, plan_submitted, writing_started, review_started, review_completed, fix_started, fix_completed, escalated, completed, phase_changed
- `test_fix:*`: testing_started, tests_passed, tests_failed, fix_started, fix_completed, retesting_started, completed, escalated
- `review_only:*`: review_started, review_completed, completed
- `fix:*`: diagnosing, applying, verifying, resolved, retrying, failed
- `agent:*`: spawned, started, progress, completed, failed, budget_warning, budget_exhausted, cancelled, dependency_resolved
- `trigger:*`: fired, condition_met, action_executed, action_failed
- `file:*`: created, modified, deleted, locked, unlocked
- `build:*`: started, succeeded, failed
- `test:*`: started, passed, failed
- `devserver:*`: started, stopped, error, ready
- `engine:*`: connected, disconnected, request, response
- `system:*`: startup, shutdown, health_check, error, gc
- `review:*`: requested

**Payload Types (Discriminated Union):**
- `SessionStartedPayload`: session_id, cwd, project_root, mode
- `HookEventPayload`: hook_name, tool_name?, tool_input?, tool_output?, error?, duration_ms
- `WorkflowStateChangedPayload`: workflow_id, workflow_type, previous_state, current_state, context
- `AgentSpawnedPayload`: agent_id, agent_type, task, budget{max_tokens, max_turns}, depends_on[]
- `AgentProgressPayload`: agent_id, tokens_used{input, output, cache}, cost_usd, tools_called, files_modified[]
- `TriggerFiredPayload`: trigger_id, trigger_name, condition, matched_event_id, action
- `FileModifiedPayload`: path, agent_id?, change_type, size_bytes?
- `BuildResultPayload`: command, exit_code, duration_ms, errors[], warnings[]
- `TestResultPayload`: command, passed, failed, skipped, duration_ms, failures[]
- `DevServerPayload`: pid, port, command, url?, error?
- `EngineEventPayload`: engine_name, tool_name?, request_id?, duration_ms?
- `SystemErrorPayload`: error, stack?, component, severity

**Supporting Types:**
- `EventTypePattern = EventType | '${string}:*' | '*'` — Glob-style subscription patterns
- `EventHandler = (event: RuntimeEvent) => void | Promise<void>` — Listener callback
- `Unsubscribe = () => void` — Cleanup function returned by .on()/.once()
- `EventFilter`: types?, source?, since?, until?, correlation_id?, limit?, since_sequence?
- `RuntimeEvent`: id, timestamp, source, type, payload, metadata

---

### `/src/events/event-bus.ts`
**Type:** Central pub/sub event dispatcher (355 lines)

**Class: EventBus**
- **Constructor:** `EventBus(maxHistorySize = 10_000)`
  - maxHistorySize: in-memory ring buffer capacity (0 = disabled)
  - Negative values treated as 0
  
- **Properties (private):**
  - handlers: Map<EventTypePattern, Set<EventHandler>>
  - sequence: number (starts at 0, increments per emit)
  - historyBuffer: (RuntimeEvent | undefined)[] (circular ring)
  - historyWriteIndex: number (write cursor)
  - historyCount: number (items in buffer)
  - maxHistorySize: number
  - eventLog?: EventLogLike (injected after construction)

- **Methods:**
  - `setEventLog(log: EventLogLike): void`
    - Called by process-manager after persistence init
    - Enables persistent logging of all events
    
  - `emit(event: Omit<RuntimeEvent, 'metadata'> & { metadata?: Partial<...> }): RuntimeEvent`
    - Auto-generates id, timestamp, sequence
    - Backfills metadata: session_id (from env or 'unknown'), correlation_id, causation_id
    - Appends to event log if available (wrapped in try/catch)
    - Maintains ring buffer (O(1) circular append)
    - Dispatches to matching handlers (sync in order, async fire-and-forget)
    - Returns fully-formed RuntimeEvent
    
  - `on(pattern: EventTypePattern, handler: EventHandler): Unsubscribe`
    - Registers handler for glob pattern
    - Returns cleanup function
    
  - `once(pattern: EventTypePattern, handler: EventHandler): Unsubscribe`
    - One-time subscription, auto-unsubscribes after first match
    - Async errors logged, not thrown
    
  - `getHistory(filter?: EventFilter): RuntimeEvent[]`
    - Returns chronological snapshot from ring buffer
    - Filters on: types, source (partial match), since, until, correlation_id, limit, since_sequence
    - Returns slice(-limit) if limit set
    
  - `listenerCount(pattern?: EventTypePattern): number`
    - Total handler count, optionally per-pattern
    
  - `removeAllListeners(): void`
    - Clears all subscriptions and history (used on shutdown)

- **Private helpers:**
  - `matchPattern(eventType: EventType, pattern: EventTypePattern): boolean`
    - '*' matches all
    - 'namespace:*' matches prefix
    - Exact string matches exact type

---

### `/src/events/event-log.ts`
**Type:** JSONL append-only persistent event log (740 lines)

**Interface: EventLogStats**
- total_events: number
- file_size_bytes: number
- oldest_event?: string (ISO)
- newest_event?: string (ISO)
- events_per_type: Record<string, number>

**Class: EventLog**
- **Constructor:** `EventLog(stateDir: string, config: {event_log_max_size_mb, compact_after_hours})`
  - logPath: join(stateDir, 'events.jsonl')
  - archiveDir: join(stateDir, 'event-archives')
  
- **Write Strategy (Async non-blocking):**
  - Append: synchronous (adds to buffer), background flush
  - Flush interval: 100ms or when buffer exceeds 64KB
  - Fallback: sync write if stream unavailable
  
- **Properties (private):**
  - latestSeq: number (recovered on init)
  - eventCount: number
  - typeCountCache: Record<string, number>
  - oldestEvent?: string, newestEvent?: string
  - maxSizeMb: number, compactAfterHours: number
  - writeStream: WriteStream | null
  - writeBuffer: string
  - writeBufferBytes: number
  - flushTimer: NodeJS.Timeout | null
  - closed: boolean
  - flushing: boolean (re-entry guard)
  - flushWaiters: Array<{resolve, reject}> (async flush promises)

- **Methods:**
  - `async initialize(): Promise<void>`
    - Streams existing log to recover state
    - Updates latestSeq, eventCount, typeCountCache, timestamps
    - Opens write stream
    - Safe to call on fresh (non-existent) file
    
  - `append(event: RuntimeEvent): void`
    - Synchronous: adds to buffer, updates in-memory state
    - Triggers background flush if buffer exceeds 64KB
    - Ensures flush timer is running (100ms interval)
    - Returns immediately (non-blocking)
    
  - `async flush(): Promise<void>`
    - Explicitly drains write buffer to disk
    - Waits for completion via promise
    
  - `async close(): Promise<void>`
    - Sets closed=true (prevents new appends)
    - Stops flush timer
    - Drains remaining buffer
    - Sync fallback write if async fails
    - Closes write stream
    
  - `async query(filter: EventFilter = {}): Promise<RuntimeEvent[]>`
    - Flushes buffer first (ensures newly appended events visible)
    - Streams file line-by-line, applies filter, early-terminates at limit
    - Filter: types, since, until, since_sequence, correlation_id, source
    
  - `async since(sequence: number, limit?: number): Promise<RuntimeEvent[]>`
    - Convenience: query with since_sequence
    
  - `getLatestSequence(): number`
    - Cached latest sequence number
    
  - `async compact(beforeTimestamp?: string): Promise<{archived, remaining}>`
    - Closes write stream temporarily
    - Splits log into toArchive + toKeep based on cutoff
    - Writes per-day archive file (events-archive-YYYY-MM-DD.jsonl)
    - Atomically replaces main log with toKeep (tmp+rename)
    - Reopens write stream
    - Rebuilds in-memory cache
    - Returns counts
    
  - `getStats(): EventLogStats`
    - Uses cached values + file size stat
    - Includes unflushed buffer bytes in estimate

- **Private helpers:**
  - `openWriteStream(): void` — Creates append stream
  - `closeWriteStream(): Promise<void>` — Closes without closing log
  - `ensureFlushTimer(): void` — Starts interval if not running
  - `stopFlushTimer(): void` — Cancels periodic timer
  - `scheduleFlush(): void` — Kicks off async drain
  - `drainBuffer(): Promise<void>` — Writes buffer to stream, resolves waiters
  - `streamLines(filePath, onLine): Promise<void>` — Readline wrapper with early-exit
  - `matchesFilter(event, filter): boolean` — Filter predicate
  - `rebuildCacheFromLines(lines): void` — Re-scan for type counts + timestamps

---

### `/src/events/event-queue.ts`
**Type:** Priority-ordered deferred event processing queue with backoff retry (510 lines)

**Enum: QueuePriority**
- CRITICAL = 0 (agent failures, workflow errors)
- HIGH = 1 (build/test results, file events)
- NORMAL = 2 (hook events, trigger evaluations)
- LOW = 3 (telemetry, analytics, GC)

**Interface: QueueEntry**
- id: string
- event: RuntimeEvent
- priority: QueuePriority
- handler: string (function name)
- enqueued_at: string (ISO)
- attempts: number
- max_attempts: number
- backoff_ms: number (exponential)
- deadline?: string (optional cutoff)
- _accumulated_errors?: string[] (internal)

**Interface: DeadLetterEntry extends QueueEntry**
- failed_at: string (ISO)
- last_error: string
- all_errors: string[]

**Interface: QueueStats**
- pending: number
- processing: 0 | 1
- completed: number
- failed: number
- dead_letters: number
- by_priority: Record<0|1|2|3, number>
- avg_processing_ms: number
- oldest_pending_age_ms: number

**Type: QueueHandler = (entry: QueueEntry) => void | Promise<void>**

**Interface: EventQueueConfig**
- max_size: number (must be >= 1, validates in constructor)
- max_attempts: number
- backoff_base_ms: number
- backoff_multiplier: number
- process_interval_ms: number

**Class: EventQueue**
- **Constructor:** `EventQueue(config: EventQueueConfig)`
  - Throws if max_size < 1
  - Stores config, initializes buckets [[], [], [], []]
  
- **Properties (private):**
  - buckets: [QueueEntry[], QueueEntry[], QueueEntry[], QueueEntry[]] (FIFO per priority)
  - deadLetters: DeadLetterEntry[]
  - handlers: Map<string, QueueHandler>
  - processing: boolean (single-processing guard)
  - processTimer: NodeJS.Timeout | null
  - running: boolean (controls loop)
  - Counters: completedCount, failedCount, totalProcessingMs

- **Methods:**
  - `registerHandler(name: string, handler: QueueHandler): void`
    - Associates function by name
    
  - `enqueue(entry: Omit<QueueEntry, 'id'|'enqueued_at'|'attempts'|'backoff_ms'> & {id?: string}): string`
    - Auto-generates id, enqueued_at, sets attempts=0, backoff=base
    - Throws if queue at capacity
    - Inserts into priority bucket
    - Kicks off processing if running and idle
    - Returns assigned id
    
  - `start(): void`
    - Sets running=true, schedules first item if pending
    
  - `stop(): void`
    - Sets running=false, clears timer (completes in-flight)
    
  - `getStats(): QueueStats`
    - Counts per priority, calculates oldest age, averages
    
  - `getDeadLetters(): DeadLetterEntry[]`
    - Shallow copy of dead-letter queue
    
  - `retryDeadLetter(id: string): boolean`
    - Removes from dead-letter queue, re-enqueues with fresh attempts/backoff
    - Returns true if found/re-queued
    
  - `async drain(timeout_ms: number): Promise<{processed, remaining}>`
    - Processes items until timeout or queue empty
    - Temporarily enables queue if stopped
    - Returns counts
    
  - `get size(): number` — Alias for totalPending()

- **Private helpers:**
  - `totalPending(): number` — Sum of all bucket lengths
  - `insertBucket(entry): void` — Appends to priority bucket
  - `scheduleNext(delayMs): void` — Schedules via setTimeout
  - `async processNext(): Promise<void>`
    - Guard: !running or queue empty or already processing
    - Sets processing=true
    - Dequeues from highest-priority non-empty bucket
    - Checks deadline (drops if past)
    - Looks up handler (warns if missing)
    - Executes handler
    - On success: increments completed, schedules next with process_interval_ms
    - On error: increments failed, attempts++, exponential backoff
      - If attempts >= max_attempts: moves to dead-letter queue
      - Else: re-enqueues with backoff delay
    - Finally: clears processing=true, schedules next if queue non-empty

---

## Persistence Layer

### `/src/persistence/types.ts`
**Type:** Abstract storage interfaces (122 lines)

**Interface: StateStore**
- `initialize(): Promise<void>` — Create directories
- `set(key: string, state: unknown): Promise<void>` — Atomic write
- `get<T>(key: string): Promise<T | null>` — Read or null
- `delete(key: string): Promise<void>` — Remove entry
- `keys(): Promise<string[]>` — List all keys
- `update<T>(key: string, updater: (current: T|null) => T): Promise<void>` — CAS pattern

**Interface: CrashRecovery**
- `checkpoint(): Promise<void>` — Snapshot in-flight state
- `recover(): Promise<RecoveryResult>` — Restore from checkpoint
- `needsRecovery(): Promise<boolean>` — Check for unclean exit

**Interface: RecoveryResult**
- recovered_workflows, recovered_agents, recovered_queue_items, replayed_events, data_loss, warnings[]

---

### `/src/persistence/state-store.ts`
**Type:** JSON-file-backed key-value store (215 lines)

**Class: JsonStateStore implements StateStore**
- **Constructor:** `JsonStateStore(config: RuntimeConfig, projectRoot?: string)`
  - Resolves stateDir from config.persistence.state_dir (relative to projectRoot or absolute)
  - Default projectRoot: process.cwd()
  
- **Methods:**
  - `async initialize(): Promise<void>`
    - Creates stateDir recursively
    - Sets initialised=true (idempotent)
    
  - `async set(key: string, state: unknown): Promise<void>`
    - Ensures directory exists
    - Serializes to JSON with 2-space indent
    - Writes to `{key}.json.tmp`
    - Atomically renames to `{key}.json`
    - Cleans up .tmp on error
    - Throws on I/O failure
    
  - `async get<T>(key: string): Promise<T | null>`
    - Reads `{key}.json`
    - Returns null on ENOENT (expected)
    - Throws on other I/O or parse errors
    
  - `async delete(key: string): Promise<void>`
    - Unlinks `{key}.json`
    - Silent on ENOENT (already gone)
    - Throws on other I/O errors
    
  - `async keys(): Promise<string[]>`
    - Reads directory
    - Filters for `.json` (not `.json.tmp`)
    - Strips `.json` extension
    
  - `async update<T>(key: string, updater: (current: T|null) => T): Promise<void>`
    - Loads current value (or null)
    - Calls updater
    - Saves result

---

## IPC Protocol & Communication

### `/src/ipc/protocol.ts`
**Type:** Message and response definitions for Unix socket IPC (212 lines)

**Message Validation:**
- `validateIPCMessage(obj: unknown): obj is IPCMessage`
  - Runtime type guard
  - Checks discriminant + required fields per type

**Messages (Hook → Runtime):**
- `HookEventMessage`: type='hook_event', id, hook_name, hook_input{}, timestamp
- `QueryMessage`: type='query', id, query: IPCQuery
- `StateUpdateMessage`: type='state_update', id, updates{}
- `HeartbeatMessage`: type='heartbeat', id

**Query Kinds (IPCQuery):**
- get_system_message (no params)
- get_directives (no params)
- get_workflow_state { workflow_id }
- get_agent_status { agent_id }
- should_block_tool { tool_name, tool_input{} }
- get_context_injection (no params)

**Response Envelope (IPCResponse):**
- id: string (from request)
- status: 'ok' | 'error'
- data?: IPCResponseData (present if ok)
- error?: string (present if error)

**Response Data (IPCResponseData):**
- system_message { message, directives: Directive[] }
- workflow_state { instance{} }
- agent_status { agent{} }
- tool_decision { allow, reason?, modified_input? }
- context_injection { context, priority }
- ack (generic acknowledgement)

**Directive:**
- type: 'inject_system_message' | 'block_tool' | 'modify_input' | 'warn' | 'suggest'
- content: string (payload)
- priority: number (higher = more important)
- source: string (subsystem that generated it)

---

## Trigger System

### `/src/triggers/types.ts`
**Type:** Declarative trigger definitions and evaluations (207 lines)

**Interface: TriggerDefinition**
- id, name, description
- enabled: boolean
- priority: number (lower = higher priority)
- condition: TriggerCondition
- action: TriggerAction
- cooldown_ms?: number (minimum between fires)
- max_fires?: number (session limit)
- fires_count: number
- last_fired?: number (epoch ms)

**Conditions (TriggerCondition):**
- `EventCondition`: type='event', event_type (glob), filter?: {} (payload match)
- `CompositeCondition`: type='and'|'or'|'not', conditions: TriggerCondition[]
- `ThresholdCondition`: type='threshold', event_type, count, window_ms, field?
- `PatternCondition`: type='sequence', events: EventTypePattern[], window_ms

**Actions (TriggerAction):**
- `EmitEventAction`: type='emit_event', event_type, payload_template{} (with $event.* templates)
- `SpawnAgentAction`: type='spawn_agent', agent_type, task_template, budget{max_tokens, max_turns}
- `InvokeHandlerAction`: type='invoke_handler', handler, args_template{}
- `WorkflowAction`: type='start_workflow'|'send_workflow_event', workflow_definition?, workflow_id?, context_template?{}
- `CompositeAction`: type='parallel'|'sequence', actions: TriggerAction[]

**Result Types:**
- `TriggerResult`: trigger_id, trigger_name, fired, action_result?, skipped_reason?
  - skipped_reason: 'cooldown' | 'max_fires' | 'disabled' | 'guard_failed'
  
- `TriggerActionHandler = (args: Record<string, unknown>, event: RuntimeEvent) => Promise<void>`

---

## Workflow System

### `/src/workflow/types.ts`
**Type:** State machine definitions and instances (248 lines)

**Interface: WorkflowDefinition**
- id, name, version
- states: Record<string, StateDefinition>
- initial_state, terminal_states[]
- max_duration_ms?, max_transitions?

**Interface: StateDefinition**
- name
- on_enter?: ActionDefinition[]
- on_exit?: ActionDefinition[]
- transitions: TransitionDefinition[]
- timeout_ms?, timeout_transition?

**Interface: TransitionDefinition**
- event: EventType
- target: string (state name)
- guard?: GuardCondition
- actions?: ActionDefinition[]

**Interface: GuardCondition**
- type: 'expression' | 'function'
- expression?: string (e.g., "context.review_score >= 9.5")
  - Operators: >=, <=, >, <, ===, !==
  - Value types: numbers, booleans, strings, null
- function?: string (registered guard name)

**Interface: ActionDefinition**
- type: 'emit_event' | 'update_context' | 'invoke_handler' | 'spawn_agent'
- config: Record<string, unknown> (type-specific)

**Interface: WorkflowInstance**
- id, definition_id
- current_state: string
- context: WorkflowContext
- history: WorkflowTransition[]
- created_at, updated_at, completed_at?
- status: 'active' | 'completed' | 'failed' | 'cancelled' | 'timed_out'
- error?

**Interface: WorkflowContext**
- WRFC-specific: task?, agents[]?, review_score?, review_issues[]?, min_review_score?, fix_attempts?, max_fix_attempts?, files_modified?[]
- Fix-loop-specific: diagnosed_issues[]?, fix_changes[]?, verification_result?{}
- Arbitrary additional: [key: string]: unknown

**Interface: WorkflowTransition**
- from_state, to_state
- event: EventType
- timestamp: string
- context_changes: Record<string, unknown>

**Function Types:**
- `GuardFunction = (context: WorkflowContext, event: RuntimeEvent) => boolean`
- `ActionHandler = (context: WorkflowContext, config: Record<string, unknown>) => Promise<void>`

---

## Agent Coordination

### `/src/agents/types.ts`
**Type:** Workflow-aware agent management types (233 lines)

**Interface: AgentBudgetSnapshot**
- allocated, spent, remaining, exhausted
- usage_percent, input_tokens, output_tokens, cache_tokens, cost_usd

**Interface: CoordinatedAgent**
- Core: id, type, task, status, budget
- Workflow context: workflow_id?, wrfc_phase?
- Dependency: depends_on[], depended_by[]
- Tracking: files_modified[], tools_called, started_at?, completed_at?, duration_ms?

**Type: WRFCPhaseName = 'gather' | 'plan' | 'write' | 'review' | 'fix'**

**Interface: WRFCPhase**
- name: WRFCPhaseName
- agent_ids[]
- status: 'pending'|'active'|'completed'|'skipped'
- started_at?, completed_at?

**Interface: WRFCChain**
- id, workflow_id, task
- phases: WRFCPhase[]
- current_phase: number
- review_iterations, max_review_iterations

**Interface: ExecutionPlanAgent**
- id, type, task, parallel, depends_on[]

**Interface: ExecutionPhaseInfo**
- name, agents[], estimated_tokens

**Interface: ExecutionPlan**
- workflow_id
- phases: ExecutionPhaseInfo[]
- critical_path: string[]
- estimated_tokens, estimated_cost_usd, max_parallelism

**Interface: BudgetSummary**
- session { total_tokens{input, output, cache}, total_cost_usd, budget_remaining_tokens? }
- by_workflow: Record<string, {tokens, cost_usd, agents_completed, agents_active}>
- by_agent_type: Record<string, {count, total_tokens, total_cost_usd, avg_tokens_per_agent}>

**Type: BudgetThreshold = 50 | 80 | 95** (warning thresholds as percentages)

**Interface: CoordinatorStats**
- total_agents, pending, running, completed, failed, cancelled
- active_workflows
- total_tokens_spent, total_cost_usd

**Interface: CoordinatedSpawnOptions**
- type, task
- budget?, priority?, depends_on?, workflow_id?, wrfc_phase?

---

## Directives & Parsing

### `/src/directives/gv-tag-parser.ts`
**Type:** GV tag (structured JSON) parsing utility (161 lines)

**Interface: GvTagData**
- score?: number (0-10, clamped)
- pass?: boolean
- files?: string[]
- count?: number
- [key: string]: unknown

**Interface: GvParseResult**
- found: boolean
- data: GvTagData | null
- raw?: string (JSON source)

**Functions:**
- `parseGvTag(text: string | undefined | null): GvParseResult`
  - Finds first <gv>...</gv> tag
  - Parses JSON inside
  - Clamps score to [0, 10]
  - Filters files array to strings only
  
- `parseAllGvTags(text: string | undefined | null): GvParseResult[]`
  - Finds all <gv>...</gv> tags (global regex)
  
- `extractReviewScore(text): number | null`
  - Tries <gv> tag first
  - Falls back to SCORE: X/10 regex (legacy)
  
- `extractFiles(text): string[]`
  - Gets files array from <gv> tag
  
- `extractTestResults(text): {pass, count} | null`
  - Gets pass + count from <gv> tag

---

## Server & Handlers

### `/src/server/handlers/types.ts`
**Type:** Core handler types and context injection (58 lines)

**Type: ToolHandler = (args: unknown, context: HandlerContext) => Promise<CallToolResult>**

**Interface: HandlerContext**
- `getUptime(): number` — Milliseconds since startup
- `getConfig(): RuntimeConfig`
- `getHealth(): HealthStatus`
- `updateConfig(config: RuntimeConfig): void`
- `projectRoot: string`
- `version: string`
- `getEventBus(): EventBus`
- `getEventLog(): EventLog`
- `getEventQueue(): EventQueue`
- `getWorkflowEngine(): WorkflowEngine | null`
- `getTriggerRegistry(): TriggerRegistry | null`
- `getAgentCoordinator(): AgentCoordinator | null`
- `getDirectiveQueue(): DirectiveQueue | null`

---

## Core Types

### `/src/types.ts`
**Type:** Standard result wrapper and health interfaces (72 lines)

**Interface: RuntimeResult<T>**
- success: boolean
- data?: T (present if success=true)
- error?: string (present if success=false)
- meta: {engine, version, uptime_ms, execution_ms}

**Interface: HealthCheck**
- name: string
- status: 'pass' | 'warn' | 'fail'
- message?: string
- duration_ms: number

**Interface: HealthStatus**
- status: 'healthy' | 'degraded' | 'unhealthy'
- uptime_ms, pid, memory_usage_mb
- event_queue_depth, active_workflows, active_agents, ipc_clients
- last_event_at: string | null
- checks: HealthCheck[]
- features: Record<string, boolean>
- version: string

---

## Key Design Patterns

1. **Dependency Injection:** HandlerContext passed to all tool handlers, no global state
2. **Discriminated Unions:** EventPayload, IPCMessage, TriggerAction, etc. for type safety
3. **Circular Buffer:** EventBus ring buffer for O(1) event history with bounded memory
4. **Async Non-blocking:** EventLog uses buffered writes + background flush, Event Queue yields to event loop
5. **Atomic Writes:** StateStore uses tmp+rename pattern to prevent corruption on crash
6. **Exponential Backoff:** EventQueue retries with exponential delay, capped by max_attempts
7. **Priority Ordering:** EventQueue uses 4 FIFO buckets (CRITICAL, HIGH, NORMAL, LOW)
8. **Guard Conditions:** Workflow transitions protected by expressions or registered functions
9. **Template Resolution:** Trigger actions support $event.* template variables
10. **Fire-and-Forget Async:** EventBus async handlers don't block, errors logged
11. **Per-Process Session ID:** Shared across all events via CLAUDE_SESSION_ID or SESSION_ID env vars

---

## Configuration Precedence

1. Load DEFAULT_CONFIG (hardcoded)
2. Read `.goodvibes/state/runtime-config.json` if exists
3. Deep-merge user config over defaults (user takes precedence)
4. Return fully resolved config

## File Organization

```
src/
├── index.ts                          # Public library exports
├── server.ts                         # Bootstrap entry point
├── types.ts                          # RuntimeResult, HealthStatus
├── shared/
│   ├── config.ts                     # Configuration management
│   ├── constants.ts                  # ENGINE_VERSION
│   ├── logger.ts                     # Structured logging
│   └── utils.ts                      # Utility functions
├── events/
│   ├── types.ts                      # Complete event type catalog
│   ├── event-bus.ts                  # Pub/sub dispatcher
│   ├── event-log.ts                  # JSONL persistence
│   ├── event-queue.ts                # Priority deferred processing
│   └── __tests__/
├── persistence/
│   ├── types.ts                      # StateStore, CrashRecovery interfaces
│   ├── state-store.ts                # JSON file-backed KV store
│   ├── snapshot-manager.ts
│   ├── replay-engine.ts
│   ├── startup-recovery.ts
│   └── index.ts
├── ipc/
│   ├── protocol.ts                   # Message types
│   ├── ipc-server.ts
│   ├── ipc-router.ts
│   ├── client.ts
│   ├── file-fallback.ts
│   ├── index.ts
│   └── __tests__/
├── triggers/
│   ├── types.ts                      # Trigger, condition, action types
│   ├── trigger-registry.ts
│   ├── condition-evaluator.ts
│   ├── action-executor.ts
│   ├── builtins.ts
│   └── __tests__/
├── workflow/
│   ├── types.ts                      # Workflow, state, transition types
│   ├── workflow-engine.ts
│   ├── index.ts
│   ├── definitions/
│   │   ├── wrfc-loop.ts
│   │   ├── fix-loop.ts
│   │   ├── test-then-fix.ts
│   │   ├── review-only.ts
│   │   ├── chain-types.ts
│   │   ├── custom-loader.ts
│   │   └── index.ts
│   └── __tests__/
├── agents/
│   ├── types.ts                      # Agent, WRFC, budget types
│   ├── agent-coordinator.ts
│   ├── budget-tracker.ts
│   └── (no tests in main)
├── directives/
│   ├── gv-tag-parser.ts              # <gv> JSON tag parsing
│   ├── directive-builder.ts
│   ├── directive-queue.ts
│   ├── agent-workflow-map.ts
│   ├── wrfc-handlers.ts
│   ├── test-fix-handlers.ts
│   ├── review-only-handlers.ts
│   ├── index.ts
│   └── __tests__/
├── lifecycle/
│   ├── process-manager.ts
│   ├── health.ts
│   ├── signals.ts
│   └── __tests__/
├── server/
│   ├── mcp-server.ts                 # MCP server instantiation
│   ├── tool-handlers.ts              # Tool shim
│   ├── handlers/
│   │   ├── types.ts                  # HandlerContext
│   │   ├── status.ts
│   │   ├── config.ts
│   │   ├── events.ts
│   │   ├── agents.ts
│   │   ├── workflow.ts
│   │   ├── triggers.ts
│   │   ├── emit.ts
│   │   ├── shared.ts
│   │   ├── schemas.ts
│   │   ├── index.ts
│   │   └── __tests__/
│   └── (test files)
└── __tests__/
    ├── builtins-v2.test.ts
    ├── chain-types.test.ts
    ├── custom-loader.test.ts
    └── test-fix-handlers.test.ts
```

---

## Current State & Known Issues

### What's Working (Phases 1-6)
- EventBus, EventLog, EventQueue — full pub/sub + persistence
- WorkflowEngine — state machine with guard conditions and template resolution
- TriggerRegistry — event-driven triggers with cooldowns and max fires
- AgentCoordinator + BudgetTracker — workflow-aware agent management
- IPC Server + Router — Unix socket communication between hooks and runtime
- 7 MCP tools exposed to Claude
- All feature flags default to true

### Phase 7 (In Progress): Autonomous WRFC Chain

**Problem:** The runtime is passive. It tracks state and reacts to events but cannot initiate agent spawns. When an agent completes:
1. SubagentStop hook fires → sends `agent:completed` event to runtime
2. Runtime processes event → trigger fires → WRFC handler generates directive → enqueued in DirectiveQueue
3. **Gap:** The directive needs to reach Claude's context

**Solution (partially implemented):**
- SubagentStop sends the event (working)
- Runtime generates directive via WRFC handlers (working)
- DirectiveQueue stores the directive (working)
- **Stop hook** queries `get_directives` and injects via `additionalContext` (code written but has issue)
- **directive-delivery** PreToolUse hook as backup path (updated to use shared `buildGvDirectiveTag`)

**Current Issue:** The Stop hook directive delivery code runs on EVERY stop (every time Claude finishes responding), not just when an agent has finished. The user's original requirement was: "there are other times a Stop hook will fire, and we don't want it to fire for all of them, just when an agent finishes." This needs a mechanism to gate the query.

### Directive Flow
```
SubagentStop hook fires
  → sends agent:completed event to runtime via IPC sendHookEvent()
  → runtime: EventBus emits → TriggerRegistry evaluates → WRFC handler runs
  → handler enqueues Directive in DirectiveQueue
  → [NEEDS FIX: Stop hook must only query when agent just finished]
  → Stop hook queries get_directives → drain() returns directive
  → Stop hook injects via additionalContext
  → Claude reads directive → spawns next agent
```

### Key Files for Phase 7 Completion
- `src/directives/directive-queue.ts` — FIFO queue, `enqueue(target, directive)`, `drain(target)`
- `src/directives/directive-builder.ts` — Builds Claude-readable spawn/complete/escalation messages
- `src/directives/wrfc-handlers.ts` — 3 handlers: wrfc_chain_next, wrfc_review_response, wrfc_fix_response
- `src/ipc/ipc-router.ts` — `hook_event` handler awaits trigger evaluation; `get_directives` drains queue
- `src/triggers/builtins.ts` — Triggers 7-9: wrfc_spawn_reviewer, wrfc_spawn_fixer, wrfc_fix_review_loop
- `src/triggers/action-executor.ts` — `executeSpawnAgent()` builds directive + enqueues (was stub)
- `plugins/goodvibes/hooks/scripts/src/lifecycle/stop.ts` — Directive delivery via additionalContext
- `plugins/goodvibes/hooks/scripts/src/subagent-stop/index.ts` — Sends agent:completed event
- `plugins/goodvibes/hooks/scripts/src/shared/directive-utils.ts` — buildGvDirectiveTag()
