# Engine Migration Guide: Atomic Layer Decomposition

Migrate all GoodVibes engines to the runtime engine's 4-layer architecture through function-level atomic decomposition.

---

## Reference Architecture (Runtime Engine)

The runtime engine implements a strict 4-layer dependency hierarchy:

```
Layer 3: PLUGINS   — MCP handlers, hook processors, thin dispatchers (no business logic)
Layer 2: EXTENSIONS — One directory per atomic domain concern (business logic lives here)
Layer 1: CORE       — Types, interfaces, pure functions, state primitives
Layer 0: SHARED     — Config, logging, constants, IPC protocol
```

**Dependency Rule:** Each layer may only import from layers below it. Never sideways, never upward.

### Runtime Engine Layer Map (Reference)

```
src/
├── shared/              # L0: Config, logging, constants, IPC protocol
│   ├── config.ts        #     RuntimeConfig, loadConfig, saveConfig
│   ├── constants.ts     #     Runtime constants
│   ├── logger.ts        #     createLogger, LogLevel, component-scoped logging
│   ├── types.ts         #     Shared type definitions
│   ├── utils.ts         #     Stateless utilities
│   └── ipc/             #     IPC protocol, client, server, router
│
├── core/                # L1: Event processing, state, matching, observability
│   ├── types.ts         #     RuntimeEvent, Trigger, EventMatcher, interfaces
│   ├── queues/          #     EventQueue, DeadLetterQueue
│   ├── matching/        #     TriggerRegistry, ErrorHandler
│   ├── processing/      #     EventProcessor (main loop), lifecycle, signals
│   ├── state/           #     StateStore, FileIO, StreamReader
│   ├── observability/   #     MetricsCollector, HealthChecker, Timer
│   └── utils/           #     Retry, polling, fs helpers
│
├── extensions/          # L2: Domain features, one dir per concern
│   ├── events/          #     EventBus, EventLog, factories
│   ├── triggers/        #     Advanced triggers, condition evaluator, action executor
│   ├── workflow/        #     WorkflowEngine, definitions (WRFC, fix-loop, etc.)
│   ├── agents/          #     AgentCoordinator, BudgetTracker
│   ├── directives/      #     DirectiveQueue, GV tag parser, WRFC handlers
│   ├── executor/        #     TickDriver, budget manager, daemon handler
│   └── persistence/     #     StateStore, SnapshotManager, crash recovery
│
├── plugins/             # L3: Thin adapters to external systems
│   ├── mcp/             #     MCP server, tool handlers (runtime_status, etc.)
│   ├── hooks/           #     Claude Code hook processor + per-hook handlers
│   ├── wrfc/            #     WRFC plugin, score evaluator, directive builder
│   ├── time/            #     Scheduled events, heartbeat
│   └── external/        #     Webhooks, file watcher, normalizers
│
├── bootstrap.ts         #     ProcessManager: orchestrates startup/shutdown
└── index.ts             #     Public API barrel exports
```

### Key Patterns

1. **Thin Plugin Handlers**: MCP tool handlers are <30 lines. They validate args, call extension logic, format response.
2. **Atomic Extensions**: Each extension directory owns exactly one domain concern. `workflow/` doesn't know about `agents/`.
3. **Pure Core**: Core layer has no business logic — only primitives (queues, state stores, matchers, metrics).
4. **Barrel Exports**: Each directory has `index.ts` re-exporting its public API. Higher layers import from barrels.
5. **Bootstrap Orchestration**: `bootstrap.ts` wires layers together. It's the only place that knows about all subsystems.

---

## Engine 1: Precision Engine

### Current State

**Files:** ~15 source files, dominated by two god-objects
**Entry:** `src/index.ts` (455 lines) — MCP server + `executeHandler` (444 lines of procedural logic)

#### God Objects

| Object | File | Lines | Responsibilities |
|--------|------|-------|------------------|
| `executeHandler()` | index.ts | 444 | Server bootstrap, handler dispatch, hook orchestration, telemetry recording, KVState auto-population |
| `PrecisionRuntime` | state/precision-runtime.ts | ~300 | Lifecycle coordination, session metadata, telemetry delegation, KVState delegation, ProjectIndex delegation, HooksManager delegation, DossierGenerator delegation, ModeManager delegation |
| `HooksManager` | state/hooks.ts | 844 | Hook registration, execution dispatch, filter matching, built-in hook implementations (hardcoded), script execution, config persistence |

#### Current Bootstrap Sequence

```
Config → Telemetry → KVState → ProjectIndex → HooksManager
→ Session Counters → DossierGenerator → ModeManager → PrecisionRuntime
```

#### Current Data Flow

```
MCP Request → executeHandler → PreHooks → Handler → Telemetry
→ KVState updates → PostHooks → MutationHooks (update_index, invalidate_cache) → Response
```

#### Coupling Problems

| Coupling | Severity | Description |
|----------|----------|-------------|
| PrecisionRuntime ↔ all subsystems | HIGH | God-object holds refs to 8 singletons |
| HooksManager ↔ ProjectIndex ↔ FileStateCache | HIGH | Built-in hooks directly access singletons |
| executeHandler ↔ HooksManager | MEDIUM | Inline hook orchestration in request handler |
| Split telemetry | MEDIUM | Telemetry recording scattered across handler |

### Function-Level Layer Assignments

#### Layer 0: Shared

| Function/Export | Current Location | Rationale |
|----------------|-----------------|----------|
| `SERVER_NAME`, `SERVER_VERSION` | index.ts | Static constants |
| Config loading/defaults | scattered | Configuration management |
| Logger/stderr output | index.ts inline | Cross-cutting logging |
| `ToolResponse` types | index.ts | Shared response format |
| `createSuccessResponse()`, `createErrorResponse()` | inline | Response builders |

#### Layer 1: Core

| Function/Export | Current Location | Rationale |
|----------------|-----------------|----------|
| `KVState` (get/set/snapshot) | state/kv-state.ts | Pure key-value state store |
| `FileStateCache` (read/invalidate) | state/file-state-cache.ts | File content cache with TTL |
| `ProjectIndex` (query/update) | state/project-index.ts | Project file index with token sizes |
| `TelemetryStore` (record/query) | state/telemetry.ts | Telemetry data accumulator |
| `SessionCounters` (increment/get) | state/session-counters.ts | Atomic counters |
| `ModeManager` (get/set mode) | state/mode-manager.ts | Mode state (sandbox, cache, verbosity) |

#### Layer 2: Extensions

| Concern | Functions to Extract | Current Location |
|---------|---------------------|------------------|
| **execution-pipeline/** | `runPreHooks()`, `dispatchHandler()`, `runPostHooks()`, `runMutationHooks()`, `recordTelemetry()`, `updateKVState()` | executeHandler() in index.ts |
| **hooks/** | `registerHook()`, `executeHook()`, `matchFilter()`, `runScript()` | HooksManager in state/hooks.ts |
| **hooks/builtins/** | `updateIndexHook()`, `invalidateCacheHook()`, `autoPopulateHook()` | HooksManager built-in implementations |
| **dossier/** | `DossierGenerator.generate()`, `buildContext()`, `injectMemory()` | state/dossier-generator.ts |
| **lifecycle/** | `initialize()`, `shutdown()`, `getStatus()` | PrecisionRuntime |

#### Layer 3: Plugins

| Handler | Current Location | Target |
|---------|-----------------|--------|
| MCP server setup | index.ts (top) | plugins/mcp/server.ts |
| `ListToolsRequest` handler | index.ts | plugins/mcp/server.ts |
| `CallToolRequest` handler | index.ts | plugins/mcp/dispatcher.ts |
| Individual tool schemas | schemas/ | plugins/mcp/schemas/ |
| Tool handler functions | handlers/*.ts | Keep as-is, imported by dispatcher |

### Target Structure

```
precision-engine/src/
├── shared/
│   ├── config.ts              # PrecisionConfig, loadConfig, defaults
│   ├── constants.ts           # SERVER_NAME, SERVER_VERSION, tool names
│   ├── logger.ts              # Logging utility
│   ├── types.ts               # ToolResponse, HandlerResult, HookFilter
│   └── response.ts            # createSuccessResponse, createErrorResponse
│
├── core/
│   ├── types.ts               # Core interfaces (StateStore, Cache, Index)
│   ├── state/
│   │   ├── kv-state.ts        # KVState class (pure get/set/snapshot)
│   │   ├── file-cache.ts      # FileStateCache (read/invalidate/TTL)
│   │   ├── project-index.ts   # ProjectIndex (query/update/token sizes)
│   │   ├── telemetry.ts       # TelemetryStore (record/query)
│   │   ├── counters.ts        # SessionCounters (increment/get)
│   │   └── mode.ts            # ModeManager (get/set sandbox/cache/verbosity)
│   └── index.ts
│
├── extensions/
│   ├── pipeline/              # Execution pipeline (extracted from executeHandler)
│   │   ├── executor.ts        # runPipeline(request) → orchestrates phases
│   │   ├── pre-hooks.ts       # runPreHooks(context) → HookResult[]
│   │   ├── post-hooks.ts      # runPostHooks(context, result) → void
│   │   ├── mutation-hooks.ts  # runMutationHooks(context, mutations) → void
│   │   ├── telemetry.ts       # recordTelemetry(context, result, timing)
│   │   └── kv-updater.ts      # updateKVState(context, result)
│   │
│   ├── hooks/                 # Hook system (extracted from HooksManager)
│   │   ├── registry.ts        # HookRegistry: register/unregister/list
│   │   ├── executor.ts        # HookExecutor: run hook with filter matching
│   │   ├── filter.ts          # matchFilter(hook, context) → boolean
│   │   ├── script-runner.ts   # runExternalScript(hookDef) → result
│   │   ├── config.ts          # Hook config persistence
│   │   └── builtins/
│   │       ├── update-index.ts    # Built-in: update project index
│   │       ├── invalidate-cache.ts # Built-in: invalidate file cache
│   │       └── auto-populate.ts   # Built-in: auto-populate KV state
│   │
│   ├── dossier/               # Dossier generation
│   │   ├── generator.ts       # DossierGenerator.generate()
│   │   ├── context-builder.ts # buildContext(files, memory)
│   │   └── memory-injector.ts # injectMemory(dossier, memoryDir)
│   │
│   └── lifecycle/             # Runtime lifecycle
│       ├── bootstrap.ts       # initialize(config) → PrecisionRuntime
│       ├── shutdown.ts        # shutdown(runtime) → void
│       └── status.ts          # getStatus(runtime) → RuntimeStatus
│
├── plugins/
│   └── mcp/
│       ├── server.ts          # MCP server setup, ListTools handler
│       ├── dispatcher.ts      # CallTool dispatcher (thin: validate → route → respond)
│       └── schemas/           # Tool input schemas (existing)
│
├── handlers/                  # Tool handler implementations (existing, unchanged)
│   ├── read.ts
│   ├── write.ts
│   ├── edit.ts
│   ├── glob.ts
│   ├── grep.ts
│   ├── exec.ts
│   ├── fetch.ts
│   ├── discover.ts
│   ├── symbols.ts
│   ├── notebook.ts
│   ├── config.ts
│   └── agent.ts
│
└── index.ts                   # Barrel exports
```

### Decomposition Steps

1. **Extract `executeHandler()` into `extensions/pipeline/`**
   - Split the 444-line function into 6 focused functions
   - `executor.ts` becomes the orchestrator: pre-hooks → dispatch → telemetry → kv-update → post-hooks → mutation-hooks
   - Each phase is a pure function taking context and returning result

2. **Split `HooksManager` (844 lines) into `extensions/hooks/`**
   - `registry.ts`: hook registration/unregistration (currently ~100 lines)
   - `executor.ts`: hook execution dispatch (currently ~150 lines)
   - `filter.ts`: filter matching logic (currently ~80 lines)
   - `script-runner.ts`: external script execution (currently ~100 lines)
   - `builtins/`: each built-in hook becomes its own file (~50-80 lines each)
   - `config.ts`: hook config persistence (currently ~60 lines)

3. **Dissolve `PrecisionRuntime` god-object**
   - Move state singletons to `core/state/` (they're already separate files, just need re-import)
   - Move lifecycle methods to `extensions/lifecycle/`
   - `PrecisionRuntime` class disappears — replaced by `bootstrap.ts` that wires everything

4. **Create `plugins/mcp/`**
   - Extract MCP server setup from `index.ts` top-level
   - `dispatcher.ts`: thin function that validates args, calls handler, wraps response
   - ~30 lines max per tool dispatch

---

## Engine 2: Analytics Engine

### Current State

**Files:** ~18 source files
**Entry:** `index.ts` (220 lines) — AnalyticsEngine class
**God Object:** `Aggregator` in `daemon/aggregator.ts` (~1800 lines)

#### God Objects

| Object | File | Lines | Responsibilities |
|--------|------|-------|------------------|
| `Aggregator` | daemon/aggregator.ts | ~1800 | State aggregation from 5 data sources, refresh cycle, anomaly detection orchestration, budget tracking orchestration, memory updates, GlobalDB persistence, JSONL accumulation, callback notification |
| `aggregate()` | daemon/aggregator.ts | ~400 | Computes 40+ state fields from 5 readers in sequence |
| `GlobalDB.upsertSession()` | data/global-db.ts | ~50 | Multiple SQL statements without transaction |

#### Current Bootstrap Sequence

```
loadConfig → new Aggregator → initializeGlobalDb (sql.js WASM)
→ aggregator.setGlobalDb → aggregator.initialize:
  TelemetryReader → SessionReader → IndexReader → JSONLReader
  → AnomalyDetector → BudgetTracker → MemoryUpdater → DataWatcher → start → refresh()
```

#### Current Data Flow

```
DataWatcher emits file-change events (debounced 100ms)
→ Aggregator.refresh()
→ accumulateJsonlRecords → recomputeJsonlTotals → aggregate()
→ AnomalyDetector.detect() → BudgetTracker.update()
→ MemoryUpdater.analyze() (every 5th refresh)
→ scheduleGlobalDbSave() (debounced 10s)
→ notifyCallbacks()
```

### Function-Level Layer Assignments

#### Layer 0: Shared

| Function/Export | Current Location | Rationale |
|----------------|-----------------|----------|
| `DEFAULT_CONFIG`, `loadConfig()` | config.ts | Configuration |
| `loadModelPricing()`, `getModelRates()` | config.ts | Pricing data (pure lookup) |
| `FALLBACK_MODEL_PRICING` | config.ts | Constants |
| `ToolResponse` type, response helpers | handlers/types.ts | Shared types |
| `SCHEMA_SQL`, `SCHEMA_VERSION` | data/db-schema.ts | Database constants |
| `DashboardState`, `AnalyticsConfig`, metric types | types.ts | Shared type definitions |

#### Layer 1: Core

| Function/Export | Current Location | Rationale |
|----------------|-----------------|----------|
| `GlobalDB` class (initialize, query, close) | data/global-db.ts | Pure data store |
| `getSchemaVersion()`, `applyMigrations()` | data/db-schema.ts | Schema management |
| `TelemetryReader` (read telemetry.db) | data/telemetry-reader.ts | Data reader (no business logic) |
| `SessionReader` (read state/*.json) | data/session-reader.ts | Data reader |
| `IndexReader` (read project-index.json) | data/index-reader.ts | Data reader |
| `JSONLReader.parseFile()` | data/jsonl-reader.ts | JSONL parser (pure) |
| `JSONLRecord` types | data/jsonl-types.ts | Type definitions |
| `JSONLWatcher` | data/jsonl-watcher.ts | File tail watcher |
| `formatCellValue()`, `formatAsTable()` | handlers/query formatters | Pure formatters |

#### Layer 2: Extensions

| Concern | Functions to Extract | Current Location |
|---------|---------------------|------------------|
| **aggregation/** | `aggregateMetrics()`, `aggregateActivity()`, `aggregateAgents()`, `aggregateToolBreakdowns()`, `aggregateCacheMetrics()`, `aggregateHealthStatus()` | Aggregator.aggregate() (~400 lines) |
| **aggregation/jsonl/** | `accumulateRecords()`, `recomputeTotals()`, `extractApiTokens()`, `extractToolCalls()`, `extractAgentActivity()` | Aggregator + JSONLReader |
| **anomaly/** | `AnomalyDetector.detect()`, 6 built-in rules (cache degradation, error spike, token burn, build regression, conflict storm, agent stall), `pruneStale()` | daemon/anomaly-detector.ts (583 lines) |
| **budget/** | `BudgetTracker.update()`, `checkThresholds()`, `resolveCurrentThreshold()` | daemon/budget-tracker.ts (179 lines) — already atomic |
| **memory/** | `MemoryUpdater.analyze()`, `apply()`, `mergeAndWrite()` | daemon/memory-updater.ts (318 lines) |
| **watcher/** | `DataWatcher.start()`, `stop()`, `watchPath()`, `debounceEmit()` | daemon/watcher.ts (395 lines) |
| **persistence/** | `scheduleGlobalDbSave()`, `writeGlobalDbSession()`, `upsertSession()` (with proper BEGIN/COMMIT) | Aggregator + GlobalDB |
| **refresh/** | `RefreshCoordinator.refresh()` — orchestrates: JSONL → aggregate → anomaly → budget → memory → persist → notify | Aggregator.refresh() |

#### Layer 3: Plugins

| Handler | Current Location | Target |
|---------|-----------------|--------|
| MCP server setup | index.ts | plugins/mcp/server.ts |
| Schema validation (Zod) | index.ts handleToolCall | plugins/mcp/validator.ts |
| `handleDashboard` | handlers/dashboard.ts | plugins/mcp/handlers/dashboard.ts (thin) |
| `handleQuery` | handlers/query.ts (548 lines) | plugins/mcp/handlers/query.ts (thin dispatcher) |
| `handleBudget` | handlers/budget.ts | plugins/mcp/handlers/budget.ts |
| `handleTag` | handlers/tag.ts | plugins/mcp/handlers/tag.ts |
| `handleExport` | handlers/export.ts | plugins/mcp/handlers/export.ts |
| `handleConfig` | handlers/config.ts | plugins/mcp/handlers/config.ts |
| `handleSync` | handlers/sync.ts | plugins/mcp/handlers/sync.ts |

**Note:** `handleQuery` (548 lines) has significant business logic (filtering, rendering, scope resolution) that must move to extensions. The handler should become:
```
validate args → call queryService.execute(args) → format response
```

### Target Structure

```
analytics-engine/src/
├── shared/
│   ├── config.ts              # AnalyticsConfig, loadConfig, DEFAULT_CONFIG
│   ├── constants.ts           # FALLBACK_MODEL_PRICING, schema constants
│   ├── types.ts               # DashboardState, metric types, ToolResponse
│   └── response.ts            # Response helpers
│
├── core/
│   ├── types.ts               # Reader interfaces, store interfaces
│   ├── db/
│   │   ├── global-db.ts       # GlobalDB class (CRUD + transactions)
│   │   ├── schema.ts          # SCHEMA_SQL, migrations
│   │   └── init.ts            # initializeGlobalDb()
│   ├── readers/
│   │   ├── telemetry.ts       # TelemetryReader
│   │   ├── session.ts         # SessionReader
│   │   ├── index-reader.ts    # IndexReader
│   │   ├── jsonl-reader.ts    # JSONLReader.parseFile()
│   │   └── jsonl-types.ts     # JSONLRecord types
│   └── watchers/
│       ├── data-watcher.ts    # DataWatcher (file system events)
│       └── jsonl-watcher.ts   # JSONLWatcher (file tail)
│
├── extensions/
│   ├── aggregation/           # State aggregation (from Aggregator.aggregate())
│   │   ├── metrics.ts         # aggregateMetrics(readers) → MetricsState
│   │   ├── activity.ts        # aggregateActivity(telemetry) → ActivityEvent[]
│   │   ├── agents.ts          # aggregateAgents(jsonl) → AgentProfile[]
│   │   ├── tools.ts           # aggregateToolBreakdowns(telemetry) → ToolSummary[]
│   │   ├── cache.ts           # aggregateCacheMetrics(telemetry) → CacheMetrics
│   │   ├── health.ts          # aggregateHealthStatus(anomalies) → HealthStatus
│   │   └── orchestrator.ts    # aggregate(readers) → DashboardState
│   │
│   ├── jsonl/                 # JSONL processing
│   │   ├── accumulator.ts     # accumulateRecords(), recomputeTotals()
│   │   ├── token-extractor.ts # extractApiTokens(records)
│   │   ├── tool-extractor.ts  # extractToolCalls(records)
│   │   └── agent-extractor.ts # extractAgentActivity(records)
│   │
│   ├── anomaly/               # Anomaly detection
│   │   ├── detector.ts        # AnomalyDetector.detect(), pruneStale()
│   │   └── rules/
│   │       ├── cache-degradation.ts
│   │       ├── error-spike.ts
│   │       ├── token-burn.ts
│   │       ├── build-regression.ts
│   │       ├── conflict-storm.ts
│   │       └── agent-stall.ts
│   │
│   ├── budget/                # Budget tracking (already atomic)
│   │   └── tracker.ts         # BudgetTracker
│   │
│   ├── memory/                # Memory pattern updates
│   │   ├── updater.ts         # MemoryUpdater.analyze()
│   │   └── writer.ts          # mergeAndWrite(), atomicWriteJson()
│   │
│   ├── persistence/           # GlobalDB session persistence
│   │   └── session-writer.ts  # scheduleGlobalDbSave(), writeGlobalDbSession()
│   │
│   ├── query/                 # Query execution logic (from handleQuery)
│   │   ├── executor.ts        # executeQuery(state, args) → QueryResult
│   │   ├── filters.ts         # filterByTimeRange(), applyActivityFilters()
│   │   ├── renderers.ts       # renderTokens(), renderCache(), renderCost(), etc.
│   │   └── scope.ts           # buildDataScopeNote(), cross-project queries
│   │
│   └── refresh/               # Refresh cycle coordinator
│       └── coordinator.ts     # RefreshCoordinator.refresh()
│
├── plugins/
│   └── mcp/
│       ├── server.ts          # MCP server setup
│       ├── validator.ts       # Zod schema validation
│       └── handlers/          # Thin dispatchers (<30 lines each)
│           ├── dashboard.ts
│           ├── query.ts
│           ├── budget.ts
│           ├── tag.ts
│           ├── export.ts
│           ├── config.ts
│           └── sync.ts
│
├── bootstrap.ts               # Wire all layers, start watchers, initial refresh
└── index.ts                   # Barrel exports
```

### Decomposition Steps

1. **Break `aggregate()` (~400 lines) into 6 focused functions in `extensions/aggregation/`**
   - Each function takes specific readers and returns a partial state
   - `orchestrator.ts` calls all 6 and merges results into `DashboardState`

2. **Extract refresh cycle from `Aggregator` into `extensions/refresh/coordinator.ts`**
   - Coordinates: JSONL accumulate → aggregate → anomaly detect → budget check → memory update → persist → notify
   - Uses dependency injection (receives all extensions as constructor args)

3. **Split `handleQuery` (548 lines)**
   - Business logic (filtering, rendering, scope resolution) → `extensions/query/`
   - Handler becomes thin dispatcher in `plugins/mcp/handlers/query.ts`

4. **Extract anomaly rules from `AnomalyDetector`**
   - Each of 6 built-in rules becomes its own file
   - `detector.ts` iterates rules via common interface: `check(telemetry, state) → Anomaly | null`

5. **Wrap `GlobalDB.upsertSession()` in proper transaction**
   - Add `BEGIN...COMMIT` around multi-statement operations
   - Move persistence scheduling to `extensions/persistence/`

6. **Dissolve `Aggregator` class**
   - The 1800-line god-object becomes 8 focused extension modules
   - `bootstrap.ts` wires them together

---

## Engine 3: Frontend Engine

### Current State

**Files:** ~60 source files across 14 tool domains
**Entry:** `index.ts` (126 lines) — FrontendEngineServer class
**Architecture:** Already modular per-domain, but has god-functions and a monolithic shared utility

#### God Functions

| Function | File | Lines | Responsibilities |
|----------|------|-------|------------------|
| `parseTailwindClasses()` | layout-hierarchy-utils.ts | 360 | Parses 50+ CSS property categories (display, width, height, flex, grid, overflow, position, gap, alignment) in one function |
| `react.ts` (entire file) | handlers/react.ts | 795 | Component detection, HOC unwrapping, prop extraction, file analysis, tree building, handler orchestration — all in one file |
| `analyzeFile()` | react.ts | 83 | File I/O + AST creation + component detection + prop extraction + HOC detection + data structure building |
| `detectIssues()` | layout-hierarchy-analyzers.ts | 115 | 7 different issue type detections bundled |

#### Shared Utility Usage Matrix

| Shared Module | Used By (# domains) |
|--------------|---------------------|
| `response-utils.ts` | ALL 14 |
| `jsx-class-utils.ts` | 6 (stacking, layout, responsive, tailwind, a11y, sizing) |
| `layout-hierarchy-utils.ts` | 4 (layout, sizing, overflow, responsive) |
| `react.ts` functions | 4 (component-tree, render-triggers, hook-deps, component-state) |

### Function-Level Layer Assignments

#### Layer 0: Shared

| Function/Export | Current Location | Rationale |
|----------------|-----------------|----------|
| `SERVER_NAME`, `SERVER_VERSION` | config.ts | Constants |
| `getProjectRoot()` | config.ts | Config |
| `logger` | logging.ts | Cross-cutting |
| `createSuccessResponse()` et al | response-utils.ts | Response builders |
| `ToolResponse` type | response-utils.ts | Shared type |

#### Layer 1: Core

| Function/Export | Current Location | Rationale |
|----------------|-----------------|----------|
| `extractClassesFromNode()` | jsx-class-utils.ts | Pure utility, no domain knowledge |
| `extractClassesFromAttribute()` | jsx-class-utils.ts | Pure utility |
| `TAILWIND_SPACING` constant | layout-hierarchy-utils.ts | Pure data |
| `TAILWIND_FRACTIONS` constant | layout-hierarchy-utils.ts | Pure data |
| `parseWidthClass()` | layout-hierarchy-utils.ts | Pure function |
| `parseHeightClass()` | layout-hierarchy-utils.ts | Pure function |
| `isReactComponent()` | react.ts | Pure predicate |
| `containsJsxReturn()` | react.ts | Pure predicate |
| `getComponentName()` | react.ts | Pure extraction |
| `unwrapHocCall()` | react.ts | Pure HOC unwrapping |
| `detectHocWrappedComponent()` | react.ts | Pure detection |
| `extractProps()` → split into 4 | react.ts | Pure extraction (4 variants) |
| `getLineNumber()` | react.ts | Pure utility |
| Domain-specific `types.ts` | each handler dir | Pure type definitions |

**Key: `parseTailwindClasses()` must be decomposed before assignment:**

| Extracted Function | Lines | Layer |
|-------------------|-------|-------|
| `parseDisplayClasses(classes)` | ~26 | L1 |
| `parseSizingClasses(classes)` | ~100 | L1 |
| `parseFlexClasses(classes)` | ~60 | L1 |
| `parseGridClasses(classes)` | ~40 | L1 |
| `parseOverflowClasses(classes)` | ~35 | L1 |
| `parsePositionClasses(classes)` | ~6 | L1 |
| `parseGapAlignClasses(classes)` | ~50 | L1 |
| `parseTailwindClasses(classes)` orchestrator | ~20 | L1 |

#### Layer 2: Extensions

Each of the 14 tool domains becomes an extension directory. Most already have this structure — the main changes are:

| Extension | Current State | Changes Needed |
|-----------|--------------|----------------|
| `stacking-context/` | Well-decomposed (jsx-analyzer, tree-builder, issue-detector, portal-detector) | Move summary generation out of handler |
| `layout-hierarchy/` | 3 files (core, analyzers, utils) | Utils decomposed into L1; keep core + analyzers |
| `render-triggers/` | Well-decomposed (memoization-detector, trigger-analyzers, suggestion-generator) | None — already good |
| `responsive-breakpoints/` | Well-decomposed (class-parser, jsx-extractor, breakpoint-resolver, issue-detector) | None |
| `tailwind-conflicts/` | 3 files (core, analyzers, utils) | Good structure |
| `accessibility-tree/` | 3 files (core, analyzers, utils) | Good structure |
| `overflow-diagnosis/` | Well-decomposed (pattern-detector, constraint-builder, fix-generator) | None |
| `event-flow/` | 3 files (core, analyzers, utils) | Good structure |
| `sizing-strategy/` | 3 files (core, analyzers, utils) | Good structure |
| `client-boundary/` | Well-decomposed (scanner, graph-builder, issue-detector) | None |
| `hook-dependencies/` | Well-decomposed (hook-extractor, stability-analyzer, issue-detector) | None |
| `error-boundaries/` | Well-decomposed (scanner, coverage-analyzer, issue-detector) | None |
| `component-state/` | Well-decomposed (component-detector, hook-analyzer, jsx-analyzer, props-analyzer, issue-detector) | None |
| `component-tree/` (react.ts) | **MONOLITHIC — 795 lines in one file** | Split into 5 files |

#### Layer 3: Plugins

| Component | Current Location | Changes |
|-----------|-----------------|--------|
| MCP server | index.ts | Move to plugins/mcp/server.ts |
| Handler registry | handlers/index.ts | Move to plugins/mcp/registry.ts |
| 14 handler entry points | handlers/analyze-*.ts | Thin dispatchers calling L2 extensions |

### Target Structure

```
frontend-engine/src/
├── shared/
│   ├── config.ts              # SERVER_NAME, SERVER_VERSION, getProjectRoot
│   ├── logger.ts              # Logging utility
│   ├── types.ts               # ToolResponse, shared types
│   └── response.ts            # createSuccessResponse, createErrorResponse, etc.
│
├── core/
│   ├── jsx/
│   │   ├── class-extractor.ts # extractClassesFromNode, extractClassesFromAttribute
│   │   └── component-detection.ts # isReactComponent, containsJsxReturn, getComponentName, unwrapHocCall
│   ├── tailwind/
│   │   ├── constants.ts       # TAILWIND_SPACING, TAILWIND_FRACTIONS
│   │   ├── sizing-parser.ts   # parseWidthClass, parseHeightClass
│   │   ├── display-parser.ts  # parseDisplayClasses
│   │   ├── flex-parser.ts     # parseFlexClasses
│   │   ├── grid-parser.ts     # parseGridClasses
│   │   ├── overflow-parser.ts # parseOverflowClasses
│   │   ├── position-parser.ts # parsePositionClasses
│   │   ├── gap-align-parser.ts # parseGapAlignClasses
│   │   └── parser.ts          # parseTailwindClasses (orchestrator, ~20 lines)
│   ├── react/
│   │   ├── hoc-analyzer.ts    # detectHocWrappedComponent, unwrapHocCall
│   │   ├── prop-extractor.ts  # extractPropsFromFnDecl, extractPropsFromArrow, etc.
│   │   └── utils.ts           # getLineNumber, getCalleeName
│   └── index.ts
│
├── extensions/                # 14 domain directories (mostly unchanged)
│   ├── component-tree/        # SPLIT from monolithic react.ts
│   │   ├── file-analyzer.ts   # analyzeFile (without fs.readFile)
│   │   ├── file-discovery.ts  # findComponentFiles
│   │   ├── relationship-builder.ts # buildUsedByRelationships
│   │   ├── tree-builder.ts    # buildTree, findRootComponent
│   │   └── types.ts           # ComponentInfo, ComponentTreeNode
│   │
│   ├── stacking-context/      # Already well-decomposed
│   ├── layout-hierarchy/      # Core + analyzers (utils moved to core/tailwind/)
│   ├── render-triggers/       # Already well-decomposed
│   ├── responsive-breakpoints/ # Already well-decomposed
│   ├── tailwind-conflicts/    # Already good
│   ├── accessibility-tree/    # Already good
│   ├── overflow-diagnosis/    # Already well-decomposed
│   ├── event-flow/            # Already good
│   ├── sizing-strategy/       # Already good
│   ├── client-boundary/       # Already well-decomposed
│   ├── hook-dependencies/     # Already well-decomposed
│   ├── error-boundaries/      # Already well-decomposed
│   └── component-state/       # Already well-decomposed
│
├── plugins/
│   └── mcp/
│       ├── server.ts          # FrontendEngineServer
│       ├── registry.ts        # Handler registry map
│       └── handlers/          # Thin dispatchers
│
└── index.ts
```

### Decomposition Steps

1. **Decompose `parseTailwindClasses()` (360 lines → 7 focused parsers + orchestrator)**
   - Each parser handles one CSS property category
   - Orchestrator calls all 7 and merges results
   - Move all parsers to `core/tailwind/`

2. **Split `react.ts` (795 lines → 5 files in `extensions/component-tree/`)**
   - `file-analyzer.ts`: `analyzeFile()` minus file I/O
   - `file-discovery.ts`: `findComponentFiles()`
   - `relationship-builder.ts`: `buildUsedByRelationships()`
   - `tree-builder.ts`: `buildTree()`, `findRootComponent()`
   - Move pure detection functions to `core/react/`

3. **Extract shared detection logic to `core/jsx/component-detection.ts`**
   - `isReactComponent()`, `getComponentName()`, `containsJsxReturn()` used by 4 domains
   - Single source of truth prevents divergent detection logic

4. **Move `jsx-class-utils.ts` to `core/jsx/class-extractor.ts`**
   - Already pure, just needs relocation

5. **Frontend engine is 80% already correct** — 11 of 14 domains have proper atomic decomposition. Focus effort on the 3 that don't: component-tree (monolithic), layout-hierarchy (god-function), and the shared utilities (need layer relocation).

---

## Engine 4: Project Engine

### Current State

**Files:** ~68 source files, 26 tools across 8 domains
**Entry:** `src/index.ts` — ProjectEngineServer class
**Architecture:** Domain-organized handlers, but several contain monolithic god-functions

#### God Functions

| Function | File | Lines | Responsibilities |
|----------|------|-------|------------------|
| `handleGetApiRoutes()` | api/routes.ts | 704 | Framework detection + 4 complete parsers (Next.js, Express, Fastify, Hono) |
| `handleGetDatabaseSchema()` | database/schema.ts | 705 | 3 ORM parsers (Prisma, Drizzle, SQL) + unified schema builder |
| `handleScanForSecrets()` | security/secrets.ts | 743 | 190+ patterns + file traversal + scanning + filtering + redaction |
| `handleGetTestCoverage()` | test/coverage.ts | 702 | 5 coverage format parsers + aggregation + uncovered extraction |
| `handleDetectMemoryLeaks()` | runtime/memory.ts | 571 | Process monitoring + heap snapshots + linear regression + leak suspect generation |
| `handleFindCircularDeps()` | deps/circular.ts | 514 | File discovery + import parsing + graph building + DFS cycle detection |
| `LanguageServiceManagerImpl` | code-intelligence/shared/language-service.ts | 495 | TS service creation + caching + config detection + proxy wrapping + cleanup |

### Function-Level Layer Assignments

#### Layer 0: Shared

| Function/Export | Current Location | Rationale |
|----------------|-----------------|----------|
| `SERVER_NAME`, `SERVER_VERSION` | config.ts | Constants |
| `PLUGIN_ROOT`, `PROJECT_ROOT`, `getProjectRoot()` | config.ts | Config |
| `logger`, `startTimer()`, `logError()` | logging.ts | Logging |
| `SOURCE_EXTENSIONS`, `SKIP_DIRECTORIES` | shared/constants.ts | Constants |
| `ToolHandler` type, `ToolResponse` types | types.ts | Shared types |
| `createSuccessResponse()` et al | shared/response.ts | Response builders |
| `fileExists()`, `readJsonFile()` | shared/utils.ts | Pure utilities |
| `safeExec()`, `detectPackageManager()` | shared/utils.ts | Shell utilities |
| `fetchUrl()` | shared/utils.ts | HTTP utility |

#### Layer 1: Core

| Function/Export | Current Location | Rationale |
|----------------|-----------------|----------|
| `normalizeFilePath()`, `makeRelativePath()` | code-intelligence/shared/lsp-utils.ts | Pure path utils |
| `getLinePreview()`, `getPreviewFromSourceFile()` | code-intelligence/shared/lsp-utils.ts | Pure extraction |
| `validatePositionArgs()`, `validateFilePath()` | code-intelligence/shared/validation.ts | Pure validators |
| `parseDatabaseUrl()` | database/query-database/url-parser.ts | Pure URL parsing |
| `isWriteOperation()`, `isSelectQuery()`, `hasLimitClause()`, `addLimitClause()` | database/query-database/query-analysis.ts | Pure query analysis |
| `formatCellValue()`, `formatAsTable()` | database/query-database/formatters.ts | Pure formatters |
| `enhanceSqliteError()` | database/query-database/errors.ts | Pure error enhancement |
| `inferSqliteType()` | database/executors/sqlite.ts | Pure type inference |
| `getPostgresTypeName()` | database/executors/postgres.ts | Pure type mapping |
| `getMysqlTypeName()` | database/executors/mysql.ts | Pure type mapping |
| `linearRegression()`, `analyzeTrend()` | runtime/memory.ts | Pure math |
| `SECRET_PATTERNS` (data only) | security/secrets.ts | Pure pattern data |
| `SCANNABLE_EXTENSIONS`, `SKIP_PATTERNS` | security/secrets.ts | Constants |

**Functions to extract from `handleFindCircularDeps()` into L1:**

| Extracted Function | Lines | Description |
|-------------------|-------|-------------|
| `parseImports(fileContent)` | ~40 | Extract import paths from source |
| `resolveImportPath(importPath, fromFile)` | ~30 | Resolve relative/absolute imports |
| `isSourceFile(path)` | ~5 | Check extension against SOURCE_EXTENSIONS |
| `shouldSkipDirectory(dir)` | ~5 | Check against SKIP_DIRECTORIES |

**Functions to extract from `handleScanForSecrets()` into L1:**

| Extracted Function | Lines | Description |
|-------------------|-------|-------------|
| `isLikelyPlaceholder(value)` | ~20 | Detect YOUR_TOKEN, xxx, etc. |
| `redactSecret(value)` | ~10 | Replace middle chars with *** |

#### Layer 2: Extensions

| Concern | Functions to Extract | Current Location |
|---------|---------------------|------------------|
| **code-intelligence/language-service/** | `LanguageServiceManager` (cache management, project root detection, tsconfig parsing, service creation, proxy wrapping) | shared/language-service.ts |
| **code-intelligence/dead-code/** | Dead export detection logic | dead-code.ts |
| **code-intelligence/safe-delete/** | Usage verification logic | safe-delete.ts |
| **code-intelligence/preview-edits/** | Edit preview/validation | preview-edits.ts |
| **code-intelligence/breaking-changes/** | Breaking change detection + LLM | breaking-changes.ts |
| **code-intelligence/semantic-diff/** | Type-aware diff + LLM | semantic-diff.ts |
| **code-intelligence/api-surface/** | Public API analysis | api-surface.ts |
| **security/scanner/** | `getFilesRecursively()`, `scanFile()` | secrets.ts |
| **security/secret-filter/** | `filterBySeverity()`, severity logic | secrets.ts |
| **security/permissions-analyzer/** | Dangerous pattern detection | permissions.ts |
| **security/env-auditor/** | .env comparison logic | env-audit.ts |
| **database/schema-parsers/** | `parsePrismaSchema()`, `parseDrizzleSchema()`, `parseSQLSchema()` | schema.ts (705 lines) |
| **database/query/** | Query execution, driver loading, safety checks | query-database/ (already decomposed) |
| **database/prisma-analyzer/** | Prisma operations analysis | prisma.ts |
| **api/framework-detection/** | `detectFramework()` | routes.ts |
| **api/parsers/nextjs/** | `parseNextJsAppRouter()`, `parseNextJsPagesRouter()` | routes.ts |
| **api/parsers/express/** | `parseExpressRoutes()`, `parseExpressFileRoutes()` | routes.ts |
| **api/parsers/fastify/** | `parseFastifyRoutes()`, `parseFastifyFileRoutes()` | routes.ts |
| **api/parsers/hono/** | `parseHonoRoutes()`, `parseHonoFileRoutes()` | routes.ts |
| **api/spec-generator/** | OpenAPI spec generation | spec.ts |
| **api/validator/** | API contract validation | validate.ts |
| **api/type-sync/** | Backend/frontend type sync | sync.ts |
| **deps/analyzer/** | Dependency analysis + npm queries | analyze.ts |
| **deps/circular/** | `buildImportGraph()`, `findCycles()`, `extractCycle()` | circular.ts |
| **deps/upgrader/** | Package upgrade logic | upgrade.ts |
| **test/coverage-parsers/** | `parseLcov()`, `parseIstanbul()`, `parseC8()`, etc. | coverage.ts (702 lines) |
| **test/coverage-aggregator/** | `calculateMetrics()`, `extractUncovered*()` | coverage.ts |
| **test/finder/** | Test file discovery | find-tests.ts |
| **runtime/memory/** | `getProcessMemory()`, `generateSuspects()` | memory.ts |
| **runtime/profiler/** | Function profiling logic | profile.ts |
| **runtime/log-analyzer/** | Log parsing + pattern detection | logs.ts |
| **standalone/scaffolder/** | Template substitution + file creation | scaffold.ts |
| **standalone/bundle-analyzer/** | Bundle size analysis | bundle.ts |

#### Layer 3: Plugins

All 26 tool handlers become thin dispatchers in `plugins/mcp/handlers/`. Each:
1. Validates input args
2. Calls the appropriate L2 extension function
3. Formats and returns the response

### Target Structure

```
project-engine/src/
├── shared/
│   ├── config.ts
│   ├── constants.ts           # SOURCE_EXTENSIONS, SKIP_DIRECTORIES
│   ├── logger.ts
│   ├── types.ts
│   ├── response.ts
│   └── utils.ts               # fileExists, readJsonFile, safeExec, detectPackageManager, fetchUrl
│
├── core/
│   ├── path-utils.ts          # normalizeFilePath, makeRelativePath, resolveFilePath
│   ├── validation.ts          # validatePositionArgs, validateFilePath
│   ├── import-parser.ts       # parseImports, resolveImportPath
│   ├── type-mappers.ts        # getPostgresTypeName, getMysqlTypeName, inferSqliteType
│   ├── query-analysis.ts      # isWriteOperation, isSelectQuery, addLimitClause
│   ├── url-parser.ts          # parseDatabaseUrl
│   ├── formatters.ts          # formatCellValue, formatAsTable
│   ├── error-enhancers.ts     # enhanceSqliteError
│   ├── math.ts                # linearRegression, analyzeTrend
│   └── secret-patterns.ts     # SECRET_PATTERNS data, isLikelyPlaceholder, redactSecret
│
├── extensions/
│   ├── code-intelligence/
│   │   ├── language-service/   # LanguageServiceManager
│   │   ├── dead-code/
│   │   ├── safe-delete/
│   │   ├── preview-edits/
│   │   ├── breaking-changes/
│   │   ├── semantic-diff/
│   │   └── api-surface/
│   │
│   ├── security/
│   │   ├── scanner/            # File traversal + pattern scanning
│   │   ├── secret-filter/      # Severity filtering
│   │   ├── permissions/        # Dangerous pattern detection
│   │   └── env-audit/          # .env comparison
│   │
│   ├── database/
│   │   ├── schema-parsers/     # prisma.ts, drizzle.ts, sql.ts (split from 705-line schema.ts)
│   │   ├── query/              # Already decomposed (executors, drivers, etc.)
│   │   ├── prisma-analyzer/
│   │   └── connection/         # SqliteConnectionPool
│   │
│   ├── api/
│   │   ├── detection/          # detectFramework()
│   │   ├── parsers/            # nextjs.ts, express.ts, fastify.ts, hono.ts (split from 704-line routes.ts)
│   │   ├── spec-generator/
│   │   ├── validator/
│   │   └── type-sync/
│   │
│   ├── deps/
│   │   ├── analyzer/
│   │   ├── circular/           # graph.ts, detector.ts, discovery.ts (split from 514-line circular.ts)
│   │   └── upgrader/
│   │
│   ├── test/
│   │   ├── coverage/           # parsers/ (lcov, istanbul, c8) + aggregator (split from 702-line coverage.ts)
│   │   └── finder/
│   │
│   ├── runtime/
│   │   ├── memory/             # reader.ts, analysis.ts, suspects.ts (split from 571-line memory.ts)
│   │   ├── profiler/
│   │   └── log-analyzer/
│   │
│   └── standalone/
│       ├── scaffolder/
│       └── bundle-analyzer/
│
├── plugins/
│   └── mcp/
│       ├── server.ts
│       ├── registry.ts
│       └── handlers/           # 26 thin dispatchers
│
├── bootstrap.ts
└── index.ts
```

### Decomposition Steps

1. **Split `routes.ts` (704 lines → 5 files)**
   - `detection/detector.ts`: `detectFramework()`
   - `parsers/nextjs.ts`: `parseNextJsAppRouter()`, `parseNextJsPagesRouter()`
   - `parsers/express.ts`: `parseExpressRoutes()`, `parseExpressFileRoutes()`
   - `parsers/fastify.ts`: `parseFastifyRoutes()`, `parseFastifyFileRoutes()`
   - `parsers/hono.ts`: `parseHonoRoutes()`, `parseHonoFileRoutes()`

2. **Split `schema.ts` (705 lines → 3 files)**
   - `schema-parsers/prisma.ts`: `parsePrismaForUnifiedSchema()`
   - `schema-parsers/drizzle.ts`: `parseDrizzleForUnifiedSchema()`
   - `schema-parsers/sql.ts`: `parseSQLForUnifiedSchema()`

3. **Split `secrets.ts` (743 lines → 4 files)**
   - Move `SECRET_PATTERNS` data to `core/secret-patterns.ts`
   - `scanner/file-scanner.ts`: `getFilesRecursively()`, `scanFile()`
   - `secret-filter/filter.ts`: `filterBySeverity()`
   - Handler in `plugins/mcp/handlers/secrets.ts`

4. **Split `coverage.ts` (702 lines → 6 files)**
   - `coverage/parsers/lcov.ts`, `istanbul.ts`, `c8.ts`, `vitest.ts`, `jest.ts`
   - `coverage/aggregator.ts`: `calculateMetrics()`, `extractUncovered*()`

5. **Split `memory.ts` (571 lines → 3 files)**
   - `memory/reader.ts`: `getProcessMemory()`, platform-specific readers
   - `memory/analysis.ts`: `linearRegression()`, `analyzeTrend()` → move to `core/math.ts`
   - `memory/suspects.ts`: `generateSuspects()`, `generateRecommendations()`

6. **Split `circular.ts` (514 lines → 4 files)**
   - `circular/discovery.ts`: `getSourceFiles()`, file filtering
   - `circular/parser.ts`: `parseImports()`, `resolveImportPath()` → move pure parts to `core/import-parser.ts`
   - `circular/graph.ts`: `buildImportGraph()`
   - `circular/detector.ts`: `findCycles()`, `extractCycle()`, `createCycleSignature()`

7. **Fix `SqliteConnectionPool` race conditions**
   - Add async mutex on pool access
   - Replace polling loop with Promise-based waiting
   - Ensure `inUse` flag is set atomically

---

## Engine 5: Registry Engine

### Current State

**Files:** ~10 source files, 1196 total lines (smallest engine)
**Entry:** `src/index.ts` (299 lines) — LazyRegistryLoader + RegistryEngineServer
**Architecture:** Simplest engine, but has code duplication and monolithic functions

#### Problems

| Issue | File | Description |
|-------|------|-------------|
| Code duplication | handlers/search.ts vs utils.ts | `search()` function duplicated |
| God-function | handlers/dependencies.ts | `handleSkillDependencies` has 9 distinct phases in one function (184 lines) |
| Mixed concerns | index.ts | `LazyRegistryLoader` does server setup + lazy loading + handler dispatch |
| Monolithic parser | utils.ts | `parseSkillMetadata()` (80 lines) should be 4 functions |
| Blocking I/O | handlers/content.ts | `fs.existsSync()` before async `readFile()` |

### Function-Level Layer Assignments

#### Layer 0: Shared

| Function/Export | Current Location | Rationale |
|----------------|-----------------|----------|
| `SERVER_NAME`, `SERVER_VERSION` | index.ts | Constants |
| Registry file paths (skills/, agents/, tools/) | index.ts | Config |
| `ToolResponse` types | index.ts | Shared types |
| Response helpers | inline | Response builders |

#### Layer 1: Core

| Function/Export | Current Location | Rationale |
|----------------|-----------------|----------|
| `loadRegistry(dirPath)` | utils.ts | Pure YAML file loading |
| `createIndex(entries)` | utils.ts | Pure Fuse.js index creation |
| `search(index, query)` | utils.ts | Pure Fuse.js search (DELETE duplicate in handlers/search.ts) |
| `parseYamlFrontmatter(content)` | parseSkillMetadata() | Pure YAML extraction |
| `parseMarkdownFallback(content)` | parseSkillMetadata() | Pure markdown parsing |
| `extractSkillDescription(content)` | parseSkillMetadata() | Pure text extraction |
| `normalizeMetadata(raw)` | parseSkillMetadata() | Pure normalization |

#### Layer 2: Extensions

| Concern | Functions | Current Location |
|---------|----------|------------------|
| **registry/** | `LazyRegistryLoader.getIndex()` (lazy init with dedup), `loadAndIndex()` | index.ts |
| **search/** | `searchSkills()`, `searchAgents()`, `searchTools()`, `handleRecommendSkills()` logic | handlers/search.ts |
| **recommendations/** | `extractKeywords()`, `detectCategory()`, `estimateComplexity()`, `buildRecommendations()` | handleRecommendSkills() in search.ts |
| **dependencies/** | Split `handleSkillDependencies()` into 9 phases: `resolveSkillPath()`, `readSkillContent()`, `parseSkillMetadata()`, `findRequiredSkills()`, `findOptionalSkills()`, `resolveTransitiveDeps()`, `buildDependencyTree()`, `detectCircularDeps()`, `checkAvailability()` | handlers/dependencies.ts |
| **content/** | `readSkillContent()`, `readAgentContent()` | handlers/content.ts |

#### Layer 3: Plugins

| Handler | Target |
|---------|--------|
| `handleSearchSkills` | plugins/mcp/handlers/search-skills.ts (thin) |
| `handleSearchAgents` | plugins/mcp/handlers/search-agents.ts |
| `handleSearchTools` | plugins/mcp/handlers/search-tools.ts |
| `handleRecommendSkills` | plugins/mcp/handlers/recommend.ts |
| `handleGetSkillContent` | plugins/mcp/handlers/skill-content.ts |
| `handleGetAgentContent` | plugins/mcp/handlers/agent-content.ts |
| `handleSkillDependencies` | plugins/mcp/handlers/dependencies.ts |

### Target Structure

```
registry-engine/src/
├── shared/
│   ├── config.ts              # SERVER_NAME, registry paths
│   ├── types.ts               # RegistryEntry, SkillMetadata, ToolResponse
│   └── response.ts            # Response helpers
│
├── core/
│   ├── loader.ts              # loadRegistry(dirPath) → entries
│   ├── indexer.ts             # createIndex(entries) → Fuse index
│   ├── searcher.ts            # search(index, query) → results (SINGLE SOURCE)
│   └── metadata-parser.ts     # parseYamlFrontmatter, parseMarkdownFallback, extractDescription, normalize
│
├── extensions/
│   ├── registry/
│   │   └── lazy-loader.ts     # LazyRegistryLoader (lazy init, dedup, caching)
│   │
│   ├── search/
│   │   ├── skill-search.ts    # searchSkills(query, filters)
│   │   ├── agent-search.ts    # searchAgents(query, filters)
│   │   └── tool-search.ts     # searchTools(query, filters)
│   │
│   ├── recommendations/
│   │   ├── keyword-extractor.ts  # extractKeywords(prompt)
│   │   ├── category-detector.ts  # detectCategory(prompt) (replace hardcoded strings)
│   │   ├── complexity-estimator.ts # estimateComplexity(prompt)
│   │   └── builder.ts           # buildRecommendations(keywords, category, complexity)
│   │
│   ├── dependencies/
│   │   ├── resolver.ts        # resolveSkillPath, findRequired, findOptional
│   │   ├── tree-builder.ts    # buildDependencyTree, resolveTransitive
│   │   ├── circular-detector.ts # detectCircularDeps (O(n) scan → O(1) with index)
│   │   └── availability.ts    # checkAvailability
│   │
│   └── content/
│       ├── skill-reader.ts    # readSkillContent (async, no sync I/O)
│       └── agent-reader.ts    # readAgentContent (async, no sync I/O)
│
├── plugins/
│   └── mcp/
│       ├── server.ts          # RegistryEngineServer
│       └── handlers/          # 7 thin dispatchers
│
├── bootstrap.ts               # Wire lazy loader + MCP server
└── index.ts
```

### Decomposition Steps

1. **Delete duplicated `search()` from handlers/search.ts** — use `core/searcher.ts` only

2. **Split `parseSkillMetadata()` (80 lines → 4 functions)**
   - `parseYamlFrontmatter(content)`: extract YAML between `---` markers
   - `parseMarkdownFallback(content)`: extract from `# Title` + first paragraph
   - `extractSkillDescription(content)`: get description from content
   - `normalizeMetadata(raw)`: normalize to standard format

3. **Split `handleSkillDependencies()` (184 lines → 9 functions in `extensions/dependencies/`)**
   - Phase 1: `resolveSkillPath(skillName)` — find skill file
   - Phase 2: `readSkillContent(path)` — read file content
   - Phase 3: `parseSkillMetadata(content)` — parse metadata (uses L1)
   - Phase 4: `findRequiredSkills(metadata)` — extract required deps
   - Phase 5: `findOptionalSkills(metadata)` — extract optional deps
   - Phase 6: `resolveTransitiveDeps(required, optional)` — walk dep tree
   - Phase 7: `buildDependencyTree(deps)` — construct tree structure
   - Phase 8: `detectCircularDeps(tree)` — find cycles
   - Phase 9: `checkAvailability(deps)` — verify all deps exist on disk

4. **Split `handleRecommendSkills()` into 4 functions in `extensions/recommendations/`**
   - `extractKeywords(prompt)`: parse prompt for skill-relevant keywords
   - `detectCategory(prompt)`: classify into category (replace hardcoded string matching)
   - `estimateComplexity(prompt)`: assess task complexity
   - `buildRecommendations(keywords, category, complexity)`: combine into ranked list

5. **Fix blocking I/O in content handlers**
   - Replace `fs.existsSync()` + `fs.readFile()` with just `fs.readFile()` + catch ENOENT

6. **Extract `LazyRegistryLoader` from `index.ts`**
   - Move to `extensions/registry/lazy-loader.ts`
   - Keep server setup in `plugins/mcp/server.ts`

---

## Cross-Engine Patterns

### Common Layer 0 (Shared) Template

Every engine should have these files in `shared/`:

```
shared/
├── config.ts      # SERVER_NAME, SERVER_VERSION, paths, loadConfig()
├── constants.ts   # Engine-specific constants
├── types.ts       # ToolResponse, ToolHandler, shared interfaces
├── response.ts    # createSuccessResponse, createErrorResponse, etc.
└── logger.ts      # Structured logging (optional — not all engines have this)
```

### Common Layer 3 (Plugin) Pattern

Every MCP handler should follow this template:

```typescript
// plugins/mcp/handlers/example.ts
import { createSuccessResponse, createErrorResponse } from '../../../shared/response.js';
import { executeExample } from '../../../extensions/example/executor.js';
import type { ExampleArgs } from '../../../shared/types.js';

export async function handleExample(args: unknown): Promise<ToolResponse> {
  const parsed = validateArgs(args); // <5 lines
  if (!parsed.success) return createErrorResponse(parsed.error);
  
  const result = await executeExample(parsed.data); // L2 call
  return createSuccessResponse(result);
}
```

**Max 30 lines. No business logic. Validate → delegate → respond.**

### Common God-Object Decomposition Strategy

1. **Identify responsibilities** — list everything the function/class does
2. **Group by concern** — cluster related responsibilities
3. **Extract pure functions first** — move to L1 (core)
4. **Extract domain logic next** — move to L2 (extensions)
5. **Leave orchestration in place** — handler calls extracted functions
6. **Wire via bootstrap.ts** — dependency injection at startup

### Migration Order

Recommended order based on complexity and risk:

1. **Registry Engine** (smallest, 1196 lines, least risk)
2. **Frontend Engine** (80% already correct, focused changes)
3. **Project Engine** (well-organized domains, but god-functions need splitting)
4. **Analytics Engine** (Aggregator god-object requires careful decomposition)
5. **Precision Engine** (most coupled, highest risk, most fundamental changes)

---

## Validation Checklist

After migrating each engine, verify:

- [ ] No file in `plugins/` imports from `extensions/` except through barrel exports
- [ ] No file in `extensions/` imports from `plugins/`
- [ ] No file in `core/` imports from `extensions/` or `plugins/`
- [ ] No file in `shared/` imports from any other layer
- [ ] Every function in `core/` is pure (no side effects, no I/O) or is a state primitive
- [ ] Every MCP handler in `plugins/` is <30 lines
- [ ] Every extension directory owns exactly one atomic concern
- [ ] `bootstrap.ts` is the only file that imports from all layers
- [ ] All tests pass after migration
- [ ] No circular imports (verify with `project_deps_circular` tool)
