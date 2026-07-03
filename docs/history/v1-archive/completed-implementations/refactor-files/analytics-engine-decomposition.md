# Analytics Engine — Atomic Decomposition

> Every function, variable, type, and constant across all 55 source files, classified by what it does, assigned to the correct architectural layer.

## Reference Architecture

| Layer | Name | Purpose | Dependency Direction |
|-------|------|---------|---------------------|
| L1 | `core/` | Most atomic, most generalized building blocks — types, config, schemas, formatters, DB schema, pure helpers | — (foundation, depends on nothing internal) |
| L2 | `extensions/` | Extends core — data access, domain processing, aggregation, rendering, tmux | → core only |
| L3 | `plugins/` | Extends extensions — MCP handlers, server, CLI entry points | → extensions, core |

Dependencies flow **downward only**. L3 builds on L2, L2 builds on L1. Never upward.

**L1 vs L2 distinction:** L1 elements are atomic and self-contained — a type definition, a pure formatter, a config loader, a DB schema. They do exactly one thing with no orchestration. L2 elements compose multiple L1 pieces into domain capabilities — a class that uses L1 types + L1 schema to provide CRUD, a detector that uses L1 types + L2 readers to find anomalies.

**L2 vs L3 distinction:** L2 provides domain capabilities. L3 is the external surface — it receives MCP requests, dispatches to L2, and returns responses. L3 also includes CLI entry points that wire L2 together and launch the application.

---

## Current File Inventory

```
analytics-engine/src/
├── config.ts              (301 lines)  — config loading, model pricing, file watching
├── types.ts               (462 lines)  — ALL type definitions (domain, DB records, MCP)
├── index.ts               (217 lines)  — AnalyticsEngine class + tool dispatch
├── server.ts              (202 lines)  — MCP server wrapper + zodToMinimalJsonSchema
├── dashboard.ts           (76 lines)   — Full dashboard CLI entry point
├── mini.ts                (47 lines)   — Mini dashboard CLI entry point
├── full.ts                (23 lines)   — Backward-compat re-export of dashboard
├── daemon/
│   ├── index.ts           (17 lines)   — Barrel export
│   ├── aggregator.ts      (1781 lines) — MONOLITHIC: orchestrates all data collection
│   ├── anomaly-detector.ts (583 lines) — Rule-based anomaly detection
│   ├── budget-tracker.ts  (179 lines)  — Budget consumption tracking
│   ├── memory-updater.ts  (318 lines)  — Memory insights writer
│   ├── report-generator.ts (491 lines) — Markdown session report generator
│   ├── session-archiver.ts (189 lines) — Session archival orchestrator
│   └── watcher.ts         (395 lines)  — File-system watcher with typed events
├── data/
│   ├── index.ts           (40 lines)   — Barrel export
│   ├── global-db.ts       (953 lines)  — SQLite CRUD (sql.js in-memory + disk flush)
│   ├── jsonl-reader.ts    (671 lines)  — JSONL file parser + record extractor
│   ├── jsonl-watcher.ts   (559 lines)  — JSONL file change watcher
│   ├── jsonl-scanner.ts   (270 lines)  — Project directory scanner for JSONL files
│   ├── jsonl-types.ts     (326 lines)  — JSONL record type definitions
│   ├── telemetry-reader.ts (507 lines) — Read-only telemetry DB interface
│   ├── tag-store.ts       (396 lines)  — Auto-tagger using domain/framework heuristics
│   ├── historical-store.ts (352 lines) — Session archive persistence + comparison
│   ├── sync-engine.ts     (316 lines)  — Incremental JSONL → GlobalDB sync
│   ├── session-reader.ts  (188 lines)  — Session state reconstruction
│   ├── index-reader.ts    (180 lines)  — project-index.json reader + cache
│   ├── db-init.ts         (140 lines)  — DB singleton + directory setup
│   └── db-schema.ts       (219 lines)  — Schema SQL + migrations
├── handlers/
│   ├── index.ts           (70 lines)   — Handler registry + re-exports
│   ├── types.ts           (30 lines)   — HandlerResponse type + text() helper
│   ├── query.ts           (548 lines)  — MIXED: dispatch + filtering + rendering
│   ├── dashboard.ts       (320 lines)  — Dashboard launch/stop/status
│   ├── export.ts          (256 lines)  — Data export (JSON/CSV/Markdown)
│   ├── budget.ts          (239 lines)  — Budget set/check/clear
│   ├── tag.ts             (239 lines)  — Tag add/remove/list/auto
│   ├── config.ts          (195 lines)  — Config get/set/reload
│   └── sync.ts            (122 lines)  — JSONL sync trigger
├── schemas/
│   ├── index.ts           (17 lines)   — Barrel export
│   └── tools.ts           (162 lines)  — Zod schemas + TOOL_DEFINITIONS
├── tmux/
│   ├── index.ts           (5 lines)    — Barrel export
│   ├── detect.ts          (126 lines)  — Tmux availability detection
│   └── manager.ts         (276 lines)  — Tmux pane management
└── tui/
    ├── index.ts           (6 lines)    — Barrel export
    ├── mini/
    │   ├── index.ts       (25 lines)   — Barrel export
    │   ├── format.ts      (297 lines)  — Pure formatters + ANSI codes
    │   └── renderer.ts    (508 lines)  — Mini dashboard renderer
    └── full/
        ├── index.ts       (8 lines)    — Barrel export
        ├── components/
        │   ├── index.ts   (29 lines)   — Component barrel
        │   └── text-utils.ts (30 lines) — fixedWidth helper
        └── pages/
            └── index.ts   (15 lines)   — Page barrel
```

**Total: 55 files, ~10,700 lines**

---

## Atomic Element Inventory

Every exported and significant internal element, its current location, what it does, and its target layer.

### `types.ts` — 41 elements

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 1 | `AnalyticsConfig` | interface | Main config shape (30+ fields) | **L1 core/types.ts** | Foundation type used everywhere |
| 2 | `TmuxConfig` | interface | Tmux pane config (size, position) | **L1 core/types.ts** | Foundation type |
| 3 | `WebhookEvent` | type | Union: session_end, budget_warning, anomaly_detected | **L1 core/types.ts** | — |
| 4 | `DEFAULT_CONFIG` | const | Readonly default AnalyticsConfig | **L1 core/types.ts** | Foundation constant |
| 5 | `TokenMetrics` | interface | Token counts: input, output, total, saved, efficiency, api breakdown | **L1 core/types.ts** | — |
| 6 | `CacheMetrics` | interface | Cache stats: hit_rate, hits, misses, memory, evictions | **L1 core/types.ts** | — |
| 7 | `CostMetrics` | interface | Cost in dollars: input, output, total, saved | **L1 core/types.ts** | — |
| 8 | `ToolMetrics` | interface | Tool stats: total, success_rate, avg_duration, failures | **L1 core/types.ts** | — |
| 9 | `AgentMetrics` | interface | Agent stats: spawned, max_concurrent, total_tokens | **L1 core/types.ts** | — |
| 10 | `FileMetrics` | interface | File stats: unique_read, modified, created, conflicts | **L1 core/types.ts** | — |
| 11 | `SessionMetrics` | interface | Aggregated container: tokens, cache, cost, tools, agents, files | **L1 core/types.ts** | Core domain entity used by 10+ files |
| 12 | `ToolBreakdown` | interface | Per-tool detail: calls, avg_ms, tokens_in/out, success_rate | **L1 core/types.ts** | — |
| 13 | `ActivityEventType` | type | Union of 13 event types (read, write, exec, etc.) | **L1 core/types.ts** | — |
| 14 | `ActivityEvent` | interface | Timestamped event with tool, description, agent_id, duration | **L1 core/types.ts** | — |
| 15 | `FileHotspot` | interface | File access tracking: path, reads, writes, conflicts | **L1 core/types.ts** | — |
| 16 | `AgentProfile` | interface | Agent detail: agent_id, type, tokens, tool_calls, status | **L1 core/types.ts** | — |
| 17 | `AnomalyType` | type | Union of 6 anomaly categories | **L1 core/types.ts** | — |
| 18 | `AnomalySeverity` | type | warning or alert | **L1 core/types.ts** | — |
| 19 | `Anomaly` | interface | Detected anomaly: id, type, severity, message, timestamp | **L1 core/types.ts** | — |
| 20 | `BudgetState` | interface | Budget tracking: amount, unit, used, remaining, percentage | **L1 core/types.ts** | — |
| 21 | `DashboardState` | interface | Complete aggregated view for renderers (12 fields) | **L1 core/types.ts** | Central data structure |
| 22 | `SessionArchive` | interface | Persisted session snapshot with metrics + tools_breakdown | **L1 core/types.ts** | — |
| 23 | `HistoricalComparison` | interface | Current vs average metrics + session list | **L1 core/types.ts** | — |
| 24 | `HealthStatus` | type | healthy, warning, or alert | **L1 core/types.ts** | — |
| 25 | `HealthCheck` | interface | Status + check details (error_rate, cache, budget, anomaly) | **L1 core/types.ts** | — |
| 26 | `TelemetryRecord` | interface | Single precision-engine telemetry record (13 fields) | **L1 core/types.ts** | — |
| 27 | `ProjectIndex` | interface | Precision-engine v4 project index format | **L1 core/types.ts** | — |
| 28 | `WebhookPayload` | interface | Webhook envelope: event, session_id, timestamp, data | **L1 core/types.ts** | — |
| 29-31 | `SessionEndPayload`, `BudgetWarningPayload`, `AnomalyPayload` | interfaces | Webhook payload variants | **L1 core/types.ts** | — |
| 32 | `Recommendation` | interface | Insight: type, icon, message, details | **L1 core/types.ts** | — |
| 33 | `ToolResponse` | interface | MCP response: content array + isError | **L1 core/response.ts** | MCP protocol type, not domain |
| 34 | `toolResponse()` | function | Create ToolResponse from text string | **L1 core/response.ts** | MCP protocol helper |
| 35 | `GlobalSession` | interface | DB record: session with tokens, cost, status (19 fields) | **L1 core/types.ts** | — |
| 36 | `ApiCallRecord` | interface | DB record: single API call (10 fields) | **L1 core/types.ts** | — |
| 37 | `ToolSummaryRecord` | interface | DB record: per-tool aggregate (8 fields) | **L1 core/types.ts** | — |
| 38 | `AgentRecord` | interface | DB record: spawned agent (10 fields) | **L1 core/types.ts** | — |
| 39 | `TagEntry` | interface | DB record: tag → session link | **L1 core/types.ts** | — |
| 40 | `SyncStateRecord` | interface | DB record: JSONL sync progress | **L1 core/types.ts** | — |
| 41 | `QueryScope` | type | Union of 5 query scope variants | **L1 core/types.ts** | — |

### `config.ts` — 10 elements

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 42 | `ModelPricingInfo` | interface | Per-model pricing: input/output/cache rates | **L1 core/pricing.ts** | — |
| 43 | `ModelPricingMap` | type | Record<string, ModelPricingInfo> | **L1 core/pricing.ts** | — |
| 44 | `FALLBACK_MODEL_PRICING` | const | Hardcoded pricing for 5 Claude models | **L1 core/pricing.ts** | — |
| 45 | `loadModelPricing()` | function | Load pricing from ~/.claude/model-pricing.json | **L1 core/pricing.ts** | Single-concern: file → map |
| 46 | `getModelRates()` | function | Lookup pricing for model ID (exact, prefix, fallback) | **L1 core/pricing.ts** | Single-concern: lookup |
| 47 | `loadConfig()` | function | Load config with global → project → defaults resolution | **L1 core/config.ts** | Single-concern: config I/O |
| 48 | `saveConfig()` | function | Persist AnalyticsConfig to JSON file | **L1 core/config.ts** | Single-concern: write |
| 49 | `watchConfig()` | function | Watch config file for changes (1s debounce) | **L1 core/config.ts** | Single-concern: watch |
| 50 | `GLOBAL_CONFIG_PATH` | const | Path to ~/.claude/.goodvibes/analytics/analytics.json | **L1 core/config.ts** | — |
| 51 | `tryLoadFile()` | function (internal) | Parse JSON config file with defaults merge | **L1 core/config.ts** | — |

### `handlers/types.ts` — 2 elements

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 52 | `HandlerResponse` | type | Union: {text: string} or {error: string} | **L1 core/response.ts** | Co-locate with ToolResponse |
| 53 | `text()` | function | Construct successful HandlerResponse | **L1 core/response.ts** | Co-locate with toolResponse() |

### `schemas/tools.ts` — 9 elements

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 54 | `AnalyticsDashboardInput` | schema+type | Zod schema for dashboard tool input | **L1 core/schemas.ts** | — |
| 55 | `AnalyticsQueryInput` | schema+type | Zod schema for query tool input | **L1 core/schemas.ts** | — |
| 56 | `AnalyticsBudgetInput` | schema+type | Zod schema for budget tool input | **L1 core/schemas.ts** | — |
| 57 | `AnalyticsTagInput` | schema+type | Zod schema for tag tool input | **L1 core/schemas.ts** | — |
| 58 | `AnalyticsExportInput` | schema+type | Zod schema for export tool input | **L1 core/schemas.ts** | — |
| 59 | `AnalyticsConfigInput` | schema+type | Zod schema for config tool input | **L1 core/schemas.ts** | — |
| 60 | `AnalyticsSyncInput` | schema+type | Zod schema for sync tool input | **L1 core/schemas.ts** | — |
| 61 | `TOOL_DEFINITIONS` | const | Map of all 7 analytics tool definitions | **L1 core/schemas.ts** | — |

### `data/jsonl-types.ts` — 7 elements

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 62 | `JsonlRecord` | type | Base interface for all JSONL events | **L1 core/jsonl-types.ts** | Foundation type for JSONL pipeline |
| 63 | `CallRecord` | type | API tool call event | **L1 core/jsonl-types.ts** | — |
| 64 | `HookRecord` | type | Hook lifecycle event | **L1 core/jsonl-types.ts** | — |
| 65 | `WorkflowRecord` | type | Workflow state change | **L1 core/jsonl-types.ts** | — |
| 66 | `AgentRecord` (JSONL) | type | Agent lifecycle event | **L1 core/jsonl-types.ts** | Note: name collision with DB AgentRecord |
| 67 | `SubscriptionRecord` | type | Subscription/update event | **L1 core/jsonl-types.ts** | — |
| 68 | `OtherRecord` | type | Catch-all for untyped events | **L1 core/jsonl-types.ts** | — |

### `data/db-schema.ts` — 5 elements

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 69 | `SCHEMA_VERSION` | const | Current schema version (1) | **L1 core/db-schema.ts** | — |
| 70 | `SCHEMA_SQL` | const | Full DDL for all tables (IF NOT EXISTS) | **L1 core/db-schema.ts** | — |
| 71 | `MIGRATIONS` | const | Version → SQL migration registry | **L1 core/db-schema.ts** | — |
| 72 | `getSchemaVersion()` | function | Read current schema version from DB | **L1 core/db-schema.ts** | — |
| 73 | `applyMigrations()` | function | Apply pending migrations | **L1 core/db-schema.ts** | — |

### `data/db-init.ts` — 4 elements

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 74 | `ensureGlobalAnalyticsDir()` | function | Create analytics dir if missing | **L1 core/db-init.ts** | — |
| 75 | `getGlobalDbPath()` | function | Return full path to analytics.db | **L1 core/db-init.ts** | — |
| 76 | `initializeGlobalDb()` | function | Initialize/retrieve singleton GlobalDB | **L1 core/db-init.ts** | — |
| 77 | `checkDbIntegrity()` | function | Run PRAGMA integrity_check | **L1 core/db-init.ts** | — |

### `tui/mini/format.ts` — 18 elements

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 78 | `formatNumber()` | function | 1000 → "1,000" | **L1 core/format.ts** | Pure, zero domain knowledge |
| 79 | `formatBytes()` | function | Bytes → "1.2 MB" | **L1 core/format.ts** | Pure |
| 80 | `formatDuration()` | function | ms → "1.2s" | **L1 core/format.ts** | Pure |
| 81 | `formatPercent()` | function | 0.5 → "50%" | **L1 core/format.ts** | Pure |
| 82 | `formatDollars()` | function | 1.23 → "$1.23" | **L1 core/format.ts** | Pure |
| 83 | `formatBar()` | function | Create ASCII progress bar (█░░░) | **L1 core/format.ts** | Pure |
| 84 | `formatTime()` | function | ISO → "HH:MM:SS" | **L1 core/format.ts** | Pure |
| 85 | `formatUptime()` | function | ms → "2d 3h" | **L1 core/format.ts** | Pure |
| 86 | `truncate()` | function | Truncate string with ellipsis | **L1 core/format.ts** | Pure |
| 87 | `pad()` | function | Pad string to width | **L1 core/format.ts** | Pure |
| 88 | `ansi` | const | ANSI color/style codes object | **L1 core/format.ts** | Pure terminal constants |
| 89 | `FILL_CHAR` / `EMPTY_CHAR` | const | █ and ░ for bars | **L1 core/format.ts** | — |
| 90 | `BOX_CHARS` | const | Box drawing characters | **L1 core/format.ts** | — |
| 91 | `colorForHealth()` | function | Map HealthStatus → ANSI color | **L1 core/format.ts** | Pure |
| 92 | `formatDelta()` | function | Format change with sign + arrow | **L1 core/format.ts** | Pure |
| 93 | `formatUptimeProgressive()` | function | ms → "2d 3h 15m" breakdown | **L1 core/format.ts** | Pure |
| 94 | `formatTokensSaved()` | function | Format savings with indicator | **L1 core/format.ts** | Pure |

### Aggregator helper functions (currently in `daemon/aggregator.ts`) — 7 elements

These are standalone pure functions buried inside the 1781-line aggregator. They belong in L1.

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 95 | `emptySessionMetrics()` | function | Create zeroed SessionMetrics | **L1 core/defaults.ts** | **DUPLICATED** in historical-store.ts |
| 96 | `emptyDashboardState()` | function | Create zeroed DashboardState | **L1 core/defaults.ts** | Misplaced in aggregator |
| 97 | `emptyJsonlTotals()` | function | Create zeroed JsonlTotals | **L1 core/defaults.ts** | Misplaced in aggregator |
| 98 | `computeHealthStatus()` | function | Derive HealthStatus from DashboardState | **L1 core/defaults.ts** | Misplaced in aggregator |
| 99 | `toolToActivityType()` | function | Map tool name → ActivityEventType | **L1 core/defaults.ts** | Misplaced in aggregator |
| 100 | `TOOL_TO_ACTIVITY_TYPE` | const | Tool name → activity type mapping | **L1 core/defaults.ts** | Misplaced in aggregator |
| 101 | `readMaxAgentChains()` | function | Read max_agent_chains from justvibes config | **L1 core/defaults.ts** | Misplaced in aggregator |

### Logger interface (currently duplicated 3×) — 2 elements

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 102 | `Logger` | interface | Minimal logger: `{ warn(msg, data?) }` | **L1 core/logger.ts** | **DUPLICATED** in aggregator, anomaly-detector, report-generator |
| 103 | `DEFAULT_LOGGER` | const | console.warn-based logger | **L1 core/logger.ts** | **DUPLICATED** in aggregator, anomaly-detector, report-generator |

### DB row mappers (currently in `data/global-db.ts`) — 5 elements

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 104 | `rowsToObjects()` | function | Convert sql.js result to object array | **L1 core/db-mappers.ts** | Pure, reusable across any sql.js consumer |
| 105 | `rowToSession()` | function | Map raw row → GlobalSession | **L1 core/db-mappers.ts** | Pure mapper |
| 106 | `rowToApiCall()` | function | Map raw row → ApiCallRecord | **L1 core/db-mappers.ts** | Pure mapper |
| 107 | `rowToToolSummary()` | function | Map raw row → ToolSummaryRecord | **L1 core/db-mappers.ts** | Pure mapper |
| 108 | `rowToAgent()` | function | Map raw row → AgentRecord | **L1 core/db-mappers.ts** | Pure mapper |

### `server.ts` helper (misplaced) — 1 element

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 109 | `zodToMinimalJsonSchema()` | function | Convert Zod schema → JSON Schema for MCP registration | **L1 core/schemas.ts** | Generic utility, misplaced in L3 server |

**L1 subtotal: 109 elements across 10 target files**

---

### L2: Extensions — Data Access

### `data/global-db.ts` — 1 class (30+ methods)

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 110 | `GlobalDB` | class | In-memory SQLite wrapper: CRUD for sessions, API calls, tools, agents, tags, sync state. Debounced disk flush. | **L2 extensions/data/global-db.ts** | Extends L1 db-schema + db-init + db-mappers + types. 953 lines, single-concern (SQLite CRUD) — stays as-is |

### `data/jsonl-reader.ts` — 1 class

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 111 | `JSONLReader` | class | Parse JSONL files from byte offset, extract ApiCallRecords and session metadata | **L2 extensions/data/jsonl-reader.ts** | Extends L1 jsonl-types + types |

### `data/jsonl-watcher.ts` — 1 class

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 112 | `JSONLWatcher` | class | Watch JSONL files for changes, trigger sync callbacks with debounce | **L2 extensions/data/jsonl-watcher.ts** | Extends L1 types |

### `data/jsonl-scanner.ts` — 1 class + 2 types

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 113 | `JsonlFileInfo` | interface | Metadata about a JSONL file (project hash, session ID, path, size, subagent info) | **L1 core/jsonl-types.ts** | Pure data shape, belongs with other JSONL types |
| 114 | `ScanResult` | interface | Directory scan results: files, projects scanned, errors | **L1 core/jsonl-types.ts** | Pure data shape |
| 115 | `JSONLScanner` | class | Scan project directories for JSONL files | **L2 extensions/data/jsonl-scanner.ts** | Extends L1 jsonl-types |

### `data/telemetry-reader.ts` — 1 class

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 116 | `TelemetryReader` | class | Read-only interface to analytics SQLite DB. Get records, session summaries, token metrics. | **L2 extensions/data/telemetry-reader.ts** | Extends L1 types |

### `data/index-reader.ts` — 1 class + 1 function

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 117 | `IndexReader` | class | Read/cache project-index.json. Methods: getTotalFiles, getTotalTokens, getTypeCounts, getLargestFiles | **L2 extensions/data/index-reader.ts** | Extends L1 ProjectIndex type |
| 118 | `extToCategory()` | function | Map file extension → category string | **L1 core/format.ts** | Pure utility, misplaced in data layer |

### `data/session-reader.ts` — 1 class

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 119 | `SessionReader` | class | Read and reconstruct session state from archives and live JSONL | **L2 extensions/data/session-reader.ts** | Extends L1 types |

### `data/tag-store.ts` — 1 class + 3 consts

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 120 | `DOMAIN_PATTERNS` | const | Keyword→domain tag patterns with confidence | **L2 extensions/data/tag-store.ts** | Domain-specific heuristics, L2 |
| 121 | `FRAMEWORK_PATTERNS` | const | Framework detection patterns | **L2 extensions/data/tag-store.ts** | Domain-specific heuristics |
| 122 | `ACTIVITY_PATTERNS` | const | Activity-type patterns from tool usage | **L2 extensions/data/tag-store.ts** | Domain-specific heuristics |
| 123 | `TagStore` | class | Auto-tagger using domain/framework/activity heuristics. Methods: addTag, autoTagFromJsonl, autoTagFromPath | **L2 extensions/data/tag-store.ts** | Extends L2 GlobalDB + L1 types |

### `data/historical-store.ts` — 1 class + 2 helpers

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 124 | `HistoricalStore` | class | Session archive CRUD: save, load, list, prune, compare, computeAverages | **L2 extensions/data/historical-store.ts** | Extends L1 types |
| 125 | `_emptyMetrics()` | function (internal) | Create empty SessionMetrics | **DELETE** | Duplicate of L1 core/defaults.ts:emptySessionMetrics |
| 126 | `_flattenMetrics()` | function (internal) | Flatten nested SessionMetrics to flat Record | **L2 extensions/data/historical-store.ts** | Internal helper, stays |

### `data/sync-engine.ts` — 1 class + 3 types

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 127 | `SyncEngineConfig` | interface | Config for cost calculation (cost per 1k tokens) | **L1 core/types.ts** | Pure data shape |
| 128 | `SyncFileResult` | interface | Result of syncing one JSONL file | **L1 core/types.ts** | Pure data shape |
| 129 | `SyncProgress` | interface | Aggregated sync progress metrics | **L1 core/types.ts** | Pure data shape |
| 130 | `SyncEngine` | class | Incrementally sync JSONL → GlobalDB. Methods: syncCurrentProject, syncAllProjects | **L2 extensions/data/sync-engine.ts** | Extends L2 GlobalDB + L2 JSONLReader + L2 JSONLScanner |

### L2: Extensions — Processing

### `daemon/aggregator.ts` — 1 class (MONOLITHIC, 1781 lines)

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 131 | `StatuslineData` | interface (internal) | Data from Claude Code statusline JSON | **L1 core/types.ts** | Pure data shape, misplaced |
| 132 | `JsonlTotals` | interface (internal) | JSONL accumulated totals structure | **L1 core/types.ts** | Pure data shape, misplaced |
| 133 | `resolveJsonlProjectDir()` | function (internal) | Resolve JSONL project directory from env/config | **L2 extensions/data/jsonl-scanner.ts** | Overlaps with JSONLScanner.findProjectDirForSession — **consolidate** |
| 134 | `Aggregator` | class | Orchestrates ALL data collection: initializes readers, refreshes metrics, builds DashboardState, manages lifecycle | **L2 extensions/processing/aggregator.ts** | See Decomposition Plan below. Must be slimmed. |

### `daemon/anomaly-detector.ts` — 1 class + 6 rules + helpers

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 135 | `AnomalyRule` | interface | Single anomaly detection rule: id, type, severity, check function | **L1 core/types.ts** | Pure data shape |
| 136 | `cacheDegradationRule` | const | Rule: cache hit rate drop >15pp in 5min window | **L2 extensions/processing/anomaly-rules.ts** | Domain logic |
| 137 | `errorSpikeRule` | const | Rule: error rate >25% in 5min window | **L2 extensions/processing/anomaly-rules.ts** | Domain logic |
| 138 | `tokenBurnRule` | const | Rule: token consumption >2x average in 5min | **L2 extensions/processing/anomaly-rules.ts** | Domain logic |
| 139 | `buildRegressionRule` | const | Rule: build duration >2x average in 10min | **L2 extensions/processing/anomaly-rules.ts** | Domain logic |
| 140 | `conflictStormRule` | const | Rule: >3 file conflicts in 5min | **L2 extensions/processing/anomaly-rules.ts** | Domain logic |
| 141 | `agentStallRule` | const | Rule: agent inactive >10min | **L2 extensions/processing/anomaly-rules.ts** | Domain logic |
| 142 | `BUILT_IN_RULES` | const | Array of all 6 rules | **L2 extensions/processing/anomaly-rules.ts** | — |
| 143 | `windowKey()` | function | Build stable dedup key for time window | **L2 extensions/processing/anomaly-rules.ts** | Helper for rules |
| 144 | `anomalyId()` | function | Build unique anomaly ID | **L2 extensions/processing/anomaly-rules.ts** | Helper for rules |
| 145 | `average()` | function | Compute numeric array average | **L1 core/format.ts** | Pure utility, misplaced |
| 146 | `AnomalyDetector` | class | Rule-based detector: evaluate rules, dedup, prune stale | **L2 extensions/processing/anomaly-detector.ts** | Extends L2 anomaly-rules + L2 TelemetryReader + L1 types |

### `daemon/budget-tracker.ts` — 1 class

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 147 | `BudgetTracker` | class | Track budget consumption, detect threshold crossings | **L2 extensions/processing/budget-tracker.ts** | Extends L1 types (BudgetState, SessionMetrics, AnalyticsConfig) |

### `daemon/memory-updater.ts` — 1 class + 2 types + consts

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 148 | `PatternUpdate` | interface | Pattern entry for patterns.json | **L1 core/types.ts** | Pure data shape |
| 149 | `PreferenceUpdate` | interface | Preference entry for preferences.json | **L1 core/types.ts** | Pure data shape |
| 150 | `MemoryUpdater` | class | Analyze DashboardState, produce pattern/preference updates, persist to .goodvibes/memory/ | **L2 extensions/processing/memory-updater.ts** | Extends L1 types |

### `daemon/report-generator.ts` — 1 class + helpers

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 151 | `getEfficiencyLabel()` | function | Map rate (0-1) → human label | **L1 core/format.ts** | Pure utility |
| 152 | `formatPrecomputedDelta()` | function | Format delta with arrow indicator | **L1 core/format.ts** | Pure utility |
| 153 | `ReportGenerator` | class | Render + persist Markdown session reports. Private methods: renderHeader, renderSummary, renderTokenUsage, renderCost, etc. | **L2 extensions/processing/report-generator.ts** | Extends L1 types + L1 format |

### `daemon/session-archiver.ts` — 1 class

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 154 | `SessionArchiver` | class | Archive sessions to disk via HistoricalStore. Methods: archive, getComparison, tagSession, renameSession | **L2 extensions/processing/session-archiver.ts** | Extends L2 HistoricalStore + L2 GlobalDB |

### `daemon/watcher.ts` — 1 class + types

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 155 | `WatcherEvents` | interface | Typed event map (telemetry, session, index, jsonl, config, budget, anomaly) | **L2 extensions/processing/watcher.ts** | Tied to DataWatcher |
| 156 | `WatcherEventName` | type | Union of event names | **L2 extensions/processing/watcher.ts** | Tied to DataWatcher |
| 157 | `DataWatcherOptions` | interface | Watcher config options | **L2 extensions/processing/watcher.ts** | Tied to DataWatcher |
| 158 | `DataWatcher` | class | File-system watcher emitting typed events. Wraps FSWatcher + JSONLWatcher with debounce and polling fallback. | **L2 extensions/processing/watcher.ts** | Extends L2 JSONLWatcher + L1 types |

### L2: Extensions — Rendering

### `tui/mini/renderer.ts` — 1 class + helpers

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 159 | `MIN_WIDTH` | const | Minimum terminal width (160) | **L2 extensions/rendering/mini-renderer.ts** | — |
| 160 | `SECTION_WIDTH` | const | Width per metric section (32) | **L2 extensions/rendering/mini-renderer.ts** | — |
| 161 | `getTerminalWidth()` | function | Get current terminal width | **L2 extensions/rendering/mini-renderer.ts** | — |
| 162 | `visibleLength()` | function | Display length ignoring ANSI codes | **L1 core/format.ts** | Pure utility, misplaced |
| 163 | `fitToWidth()` | function | Truncate/pad with ANSI awareness | **L1 core/format.ts** | Pure utility, misplaced |
| 164 | `ComputedMetrics` | interface | Cached metrics for rendering | **L2 extensions/rendering/mini-renderer.ts** | — |
| 165 | `computeMetrics()` | function | Compute cached metrics from DashboardState | **L2 extensions/rendering/mini-renderer.ts** | Extends L1 types |
| 166 | `MiniRenderer` | class | Render mini dashboard: compact (1-line) or expanded (multi-line) | **L2 extensions/rendering/mini-renderer.ts** | Extends L1 format + L1 types |

### `tui/full/` — React components + pages

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 167 | `fixedWidth()` | function | Pad/truncate to exact width with ANSI handling | **L1 core/format.ts** | Pure utility, misplaced |
| 168 | `MetricBox` | component | Render metrics in box format | **L2 extensions/rendering/components/metric-box.ts** | React component |
| 169 | `BarChart` | component | Render horizontal bar chart | **L2 extensions/rendering/components/bar-chart.ts** | React component |
| 170 | `Table` | component | Render ASCII table | **L2 extensions/rendering/components/table.ts** | React component |
| 171 | `TimelineFeed` | component | Render activity timeline | **L2 extensions/rendering/components/timeline-feed.ts** | React component |
| 172 | `Heatmap` | component | Render 2D heatmap | **L2 extensions/rendering/components/heatmap.ts** | React component |
| 173 | `TrendLine` | component | Render ASCII trend line | **L2 extensions/rendering/components/trend-line.ts** | React component |
| 174 | `SessionOverview` | page | Session overview with key metrics | **L2 extensions/rendering/pages/session-overview.ts** | Extends L2 components |
| 175 | `ActivityHotspots` | page | Activity patterns heatmap | **L2 extensions/rendering/pages/activity-hotspots.ts** | Extends L2 components |
| 176 | `Historical` | page | Historical trends | **L2 extensions/rendering/pages/historical.ts** | Extends L2 components |
| 177 | `CrossProject` | page | Cross-project comparison | **L2 extensions/rendering/pages/cross-project.ts** | Extends L2 components |
| 178 | `App` | component | Main full dashboard app | **L2 extensions/rendering/app.ts** | Extends L2 pages |

### L2: Extensions — Tmux

### `tmux/detect.ts` + `tmux/manager.ts` — 5 elements

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 179 | `TmuxDetection` | interface | Detection result: running, counts, fallback mode | **L2 extensions/tmux/detect.ts** | — |
| 180 | `FallbackMode` | type | file, terminal, or none | **L2 extensions/tmux/detect.ts** | — |
| 181 | `detectTmux()` | function | Detect tmux availability with caching | **L2 extensions/tmux/detect.ts** | — |
| 182 | `getFallbackMode()` | function | Determine fallback when tmux unavailable | **L2 extensions/tmux/detect.ts** | — |
| 183 | `PaneInfo` | interface | Tmux pane info: session, window, pane, pid, dimensions | **L2 extensions/tmux/manager.ts** | — |
| 184 | `TmuxManager` | class | Manage tmux sessions/windows/panes: create, send keys, list, kill | **L2 extensions/tmux/manager.ts** | Extends L1 TmuxConfig |

**L2 subtotal: 75 elements (110-184) across ~25 target files**

---

### L3: Plugins — Handlers

### `handlers/query.ts` — MIXED CONCERNS (548 lines)

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 185 | `handleQuery` | function | Main query dispatcher: routes by scope/time_range/filters | **L3 plugins/handlers/query.ts** | Thin dispatch only — rendering functions move to L2 |
| 186 | `buildDataScopeNote()` | function | Human-readable data scope note | **L2 extensions/rendering/query-renderer.ts** | Rendering concern |
| 187 | `deriveProjectHash()` | function | Derive hash from JSONL files | **L2 extensions/data/jsonl-scanner.ts** | Data concern, misplaced in handler |
| 188 | `TIME_RANGE_MS` | const | Time range string → ms mapping | **L1 core/types.ts** | Pure constant |
| 189 | `filterByTimeRange()` | function | Filter records by time window | **L2 extensions/processing/query-filters.ts** | Filtering logic |
| 190 | `applyActivityFilters()` | function | Apply status/tool/agent filters | **L2 extensions/processing/query-filters.ts** | Filtering logic |
| 191 | `filterToolsBreakdown()` | function | Filter tools by name pattern | **L2 extensions/processing/query-filters.ts** | Filtering logic |
| 192 | `buildResponse()` | function | Assemble final text response | **L2 extensions/rendering/query-renderer.ts** | Rendering |
| 193 | `buildHeader()` | function | Construct response header | **L2 extensions/rendering/query-renderer.ts** | Rendering |
| 194 | `buildBody()` | function | Construct response body | **L2 extensions/rendering/query-renderer.ts** | Rendering |
| 195-204 | `renderTokens`, `renderCache`, `renderCost`, `renderCommands`, `renderAgents`, `renderFiles`, `renderHealth`, `renderProject`, `renderToolsBreakdown`, `renderActivity` | functions | Section renderers | **L2 extensions/rendering/query-renderer.ts** | All rendering functions |

### `handlers/dashboard.ts` — 320 lines

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 205 | `handleDashboard` | function | Launch, stop, or check dashboard status | **L3 plugins/handlers/dashboard.ts** | Dispatch |
| 206 | `handleStart()` | function | Spawn dashboard in tmux pane | **L3 plugins/handlers/dashboard.ts** | Uses L2 TmuxManager |
| 207 | `handleStop()` | function | Stop dashboard + cleanup | **L3 plugins/handlers/dashboard.ts** | Uses L2 TmuxManager |
| 208 | `handleStatus()` | function | Report dashboard status | **L3 plugins/handlers/dashboard.ts** | — |
| 209 | `persistPaneState()` | function | Save pane window ID to file | **L2 extensions/tmux/manager.ts** | Tmux concern, misplaced |
| 210 | `getManager()` | function | Initialize TmuxManager singleton | **L3 plugins/handlers/dashboard.ts** | Stays with handler |

### `handlers/export.ts` — 256 lines

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 211 | `handleExport` | function | Extract sections, render in requested format | **L3 plugins/handlers/export.ts** | Dispatch |
| 212 | `SectionKey` | type | Union of valid export sections | **L1 core/types.ts** | Pure type |
| 213 | `ALL_SECTIONS` | const | Array of all section keys | **L1 core/types.ts** | Pure constant |
| 214 | `extractSections()` | function | Extract sections from session data | **L2 extensions/processing/export-builder.ts** | Data extraction |
| 215 | `extractArchiveSections()` | function | Extract sections from archives | **L2 extensions/processing/export-builder.ts** | Data extraction |
| 216 | `renderJson()` | function | Serialize to JSON | **L2 extensions/rendering/export-renderer.ts** | Rendering |
| 217 | `renderCsv()` | function | Convert to CSV | **L2 extensions/rendering/export-renderer.ts** | Rendering |
| 218 | `renderMarkdown()` | function | Render as markdown table | **L2 extensions/rendering/export-renderer.ts** | Rendering |

### `handlers/budget.ts` — 239 lines

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 219 | `handleBudget` | function | Set, check, or clear budget | **L3 plugins/handlers/budget.ts** | Dispatch |
| 220 | `DEFAULT_WARN_THRESHOLDS` | const | [0.5, 0.8, 1.0] | **L1 core/types.ts** | Pure constant |
| 221 | `formatBudgetSummary()` | function | Format budget status string | **L2 extensions/rendering/budget-renderer.ts** | Rendering |
| 222 | `formatBudgetAmount()` | function | Format amount with unit | **L2 extensions/rendering/budget-renderer.ts** | Rendering |
| 223 | `formatBudgetUsed()` | function | Format used with status | **L2 extensions/rendering/budget-renderer.ts** | Rendering |
| 224 | `resolveStatusLabel()` | function | Map ratio → status label | **L1 core/format.ts** | Pure utility |

### `handlers/tag.ts` — 239 lines

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 225 | `handleTag` | function | Add, remove, list, or auto-detect tags | **L3 plugins/handlers/tag.ts** | Dispatch |

### `handlers/config.ts` — 195 lines

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 226 | `handleConfig` | function | Get, set, reload, or validate config | **L3 plugins/handlers/config.ts** | Dispatch |
| 227 | `getByPath()` | function | Get nested value by dot path | **L1 core/config.ts** | Pure utility, misplaced |
| 228 | `setByPath()` | function | Set nested value by dot path | **L1 core/config.ts** | Pure utility, misplaced |
| 229 | `KEY_ALIASES` | const | Short key → full key map | **L1 core/config.ts** | — |
| 230 | `resolveKeyAlias()` | function | Resolve alias to canonical key | **L1 core/config.ts** | — |

### `handlers/sync.ts` — 122 lines

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 231 | `handleSync` | function | Trigger JSONL → GlobalDB sync | **L3 plugins/handlers/sync.ts** | Dispatch, uses L2 SyncEngine |
| 232 | `buildSyncReport()` | function | Format sync results summary | **L2 extensions/rendering/sync-renderer.ts** | Rendering, misplaced |

### `handlers/index.ts` — 3 elements

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 233 | `HandlerFn` | type | Unified handler function signature | **L3 plugins/handlers/registry.ts** | — |
| 234 | `HANDLER_REGISTRY` | const | Maps handler names to functions | **L3 plugins/handlers/registry.ts** | — |

### L3: Plugins — Server & Entry Points

### `index.ts` (currently AnalyticsEngine) — 3 elements

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 235 | `ToolName` | type | Union of tool names from TOOL_DEFINITIONS | **L3 plugins/engine.ts** | — |
| 236 | `getToolDefinitions()` | function | Return tool definitions for MCP registration | **L3 plugins/engine.ts** | — |
| 237 | `AnalyticsEngine` | class | Wire Aggregator + handlers, dispatch MCP tool calls | **L3 plugins/engine.ts** | Extends L2 Aggregator + L3 handlers |

### `server.ts` — 3 elements

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 238 | `SERVER_NAME` | const | 'analytics-engine' | **L3 plugins/server.ts** | — |
| 239 | `SERVER_VERSION` | const | '0.1.0' | **L3 plugins/server.ts** | — |
| 240 | `AnalyticsEngineServer` | class | MCP Server: wires handlers, manages lifecycle | **L3 plugins/server.ts** | Extends L3 AnalyticsEngine |
| 241 | `resolveGoodvibesDir()` | function | Resolve .goodvibes directory from env | **L1 core/config.ts** | Pure utility, misplaced in L3 |

### Entry points — 4 elements

| # | Element | Kind | What It Does | Target | Notes |
|---|---------|------|-------------|--------|-------|
| 242 | `dashboard.ts:main()` | function | Bootstrap full dashboard with Ink | **L3 plugins/entry/dashboard.ts** | CLI entry point |
| 243 | `mini.ts:main()` | function | Bootstrap mini dashboard renderer | **L3 plugins/entry/mini.ts** | CLI entry point |
| 244 | `server.ts:main()` | function | Bootstrap MCP server | **L3 plugins/entry/server.ts** | CLI entry point |
| 245 | `full.ts:main()` | re-export | Backward-compat re-export of dashboard | **L3 plugins/entry/full.ts** | — |

**L3 subtotal: 61 elements (185-245)**

**Grand total: 245 elements. 109 L1, 75 L2, 61 L3.**

---

## Issues Found

### Duplicated Code

| Issue | Locations | Resolution |
|-------|----------|------------|
| `Logger` interface — identical 3× | aggregator.ts:88, anomaly-detector.ts:32, report-generator.ts:63 | **Single source** in L1 core/logger.ts |
| `DEFAULT_LOGGER` — identical 3× | aggregator.ts:93, anomaly-detector.ts:37, report-generator.ts:68 | **Single source** in L1 core/logger.ts |
| `emptySessionMetrics()` — identical 2× | aggregator.ts:130, historical-store.ts:299 (`_emptyMetrics`) | **Single source** in L1 core/defaults.ts |
| `resolveJsonlProjectDir()` overlaps `JSONLScanner.findProjectDirForSession()` | aggregator.ts:246, jsonl-scanner.ts:166 | **Consolidate** into JSONLScanner in L2 |
| `ToolResponse`/`toolResponse()` and `HandlerResponse`/`text()` — parallel patterns | types.ts:358, handlers/types.ts:12 | **Co-locate** in L1 core/response.ts |

### Monolithic Functions / Classes

| Element | Lines | Concerns Mixed | Resolution |
|---------|-------|---------------|------------|
| `Aggregator` class | 1781 | 6+ concerns: JSONL accumulation, state building, DB persistence, statusline I/O, path resolution, lifecycle orchestration | → Extract helpers to L1/L2, slim to ~400 lines (see Decomposition Plan) |
| `handleQuery()` + internals | 548 | 3 concerns: dispatch, filtering, rendering | → 3 targets: L3 thin dispatch, L2 query-filters, L2 query-renderer |
| `GlobalDB` class | 953 | Single-concern (SQLite CRUD) but very long | Stays as-is — not monolithic, just comprehensive CRUD |

### Misplaced Elements

| Element | Current File | Problem | Correct Location |
|---------|-------------|---------|------------------|
| `emptySessionMetrics()`, `emptyDashboardState()`, `computeHealthStatus()`, `toolToActivityType()` | aggregator.ts | Pure functions buried in 1781-line class file | L1 core/defaults.ts |
| `emptyJsonlTotals()`, `readMaxAgentChains()` | aggregator.ts | Pure functions in class file | L1 core/defaults.ts |
| `StatuslineData`, `JsonlTotals` | aggregator.ts (internal) | Pure type definitions in class file | L1 core/types.ts |
| `resolveJsonlProjectDir()` | aggregator.ts | Path resolution duplicated from JSONLScanner | L2 extensions/data/jsonl-scanner.ts |
| `Logger`, `DEFAULT_LOGGER` | 3 files | Duplicated across daemon/ | L1 core/logger.ts |
| Pure formatters (formatNumber, formatBytes, etc.) | tui/mini/format.ts | Generic utilities buried in TUI subdirectory | L1 core/format.ts |
| `visibleLength()`, `fitToWidth()`, `fixedWidth()` | renderer.ts, text-utils.ts | Pure string utilities in rendering files | L1 core/format.ts |
| `average()`, `getEfficiencyLabel()`, `formatPrecomputedDelta()` | anomaly-detector.ts, report-generator.ts | Pure utilities in domain files | L1 core/format.ts |
| `zodToMinimalJsonSchema()` | server.ts | Generic Zod utility in L3 entry point | L1 core/schemas.ts |
| `getByPath()`, `setByPath()`, `KEY_ALIASES`, `resolveKeyAlias()` | handlers/config.ts | Pure config utilities in L3 handler | L1 core/config.ts |
| `resolveGoodvibesDir()` | server.ts | Pure config resolution in L3 server | L1 core/config.ts |
| `JsonlFileInfo`, `ScanResult` | data/jsonl-scanner.ts | Pure data shapes in L2 class file | L1 core/jsonl-types.ts |
| `SyncEngineConfig`, `SyncFileResult`, `SyncProgress` | data/sync-engine.ts | Pure data shapes in L2 class file | L1 core/types.ts |
| `AnomalyRule` | daemon/anomaly-detector.ts | Pure interface in L2 class file | L1 core/types.ts |
| `PatternUpdate`, `PreferenceUpdate` | daemon/memory-updater.ts | Pure interfaces in L2 class file | L1 core/types.ts |
| `persistPaneState()` | handlers/dashboard.ts | Tmux concern in L3 handler | L2 extensions/tmux/manager.ts |
| `deriveProjectHash()` | handlers/query.ts | Data concern in L3 handler | L2 extensions/data/jsonl-scanner.ts |
| `extToCategory()` | data/index-reader.ts | Pure utility in L2 reader | L1 core/format.ts |
| Rendering functions in handlers (buildResponse, renderTokens, etc.) | handlers/query.ts, budget.ts, export.ts, sync.ts | Rendering mixed into dispatch | L2 extensions/rendering/ |
| `TIME_RANGE_MS`, `SectionKey`, `ALL_SECTIONS`, `DEFAULT_WARN_THRESHOLDS` | handlers/ | Pure constants in L3 | L1 core/types.ts |

---

## Decomposition Plan: Aggregator (1781 lines → ~400 lines)

The Aggregator currently mixes 6+ concerns. Extract each into its proper layer:

### 1. Pure helpers → L1 core/defaults.ts

Already identified as elements 95-101. Move `emptySessionMetrics()`, `emptyDashboardState()`, `emptyJsonlTotals()`, `computeHealthStatus()`, `toolToActivityType()`, `TOOL_TO_ACTIVITY_TYPE`, `readMaxAgentChains()`.

### 2. Pure types → L1 core/types.ts

`StatuslineData`, `JsonlTotals` — currently internal interfaces.

### 3. Path resolution → L2 extensions/data/jsonl-scanner.ts

`resolveJsonlProjectDir()` consolidates with `JSONLScanner.findProjectDirForSession()`.

### 4. JSONL accumulation → L2 extensions/processing/jsonl-accumulator.ts

Extract from Aggregator:
```
class JsonlAccumulator {
  private records: Map<string, JsonlRecord>
  private totals: JsonlTotals
  
  accumulate(newRecords: JsonlRecord[]): void  // dedup + append
  recomputeTotals(): JsonlTotals              // recompute from records
  getRecords(): JsonlRecord[]
  getTotals(): JsonlTotals
}
```

### 5. State building → L2 extensions/processing/state-builder.ts

Extract the `aggregate()` method + helper methods:
```
class StateBuilder {
  build(sources: StateSources): DashboardState
  
  private buildRecentActivity(telemetry): ActivityEvent[]
  private buildFileHotspots(telemetry): FileHotspot[]
  private buildAgentProfiles(state, scanner): AgentProfile[]
  private buildCacheMetrics(totals, telemetry): CacheMetrics
}
```

### 6. DB persistence → stays in Aggregator (simplified)

`scheduleGlobalDbSave()` and `writeGlobalDbSession()` stay in the Aggregator but are now ~60 lines instead of being buried in 1781.

### 7. Statusline I/O → L2 extensions/processing/statusline-reader.ts

Extract `readStatuslineData()` as a standalone reader:
```
function readStatuslineData(sessionDir: string): StatuslineData | null
```

### Result: Slimmed Aggregator (~400 lines)

The Aggregator becomes an orchestrator that:
- Initializes L2 readers and processors
- Calls `JsonlAccumulator.accumulate()`
- Calls `StateBuilder.build()`
- Manages lifecycle (start/stop/refresh)
- Notifies callbacks on state change

---

## Decomposition Plan: handleQuery (548 lines → ~60 lines)

### 1. Constants → L1 core/types.ts

`TIME_RANGE_MS` map.

### 2. Filters → L2 extensions/processing/query-filters.ts

```
filterByTimeRange(records, timeRange): records
applyActivityFilters(records, filters): records
filterToolsBreakdown(breakdown, filters): breakdown
```

### 3. Rendering → L2 extensions/rendering/query-renderer.ts

```
buildDataScopeNote(input): string
buildResponse(state, input): string
buildHeader(state, input): string
buildBody(state, input): string
renderTokens(state, input): string
renderCache(state, input): string
renderCost(state, input): string
renderCommands(state, input): string
renderAgents(state, input): string
renderFiles(state, input): string
renderHealth(state, input): string
renderProject(state, input): string
renderToolsBreakdown(state, input): string
renderActivity(state, input): string
```

### 3. Thin dispatch → L3 plugins/handlers/query.ts (~60 lines)

```
async function handleQuery(input, aggregator, globalDb): HandlerResponse {
  const state = aggregator.getState()
  const filtered = applyFilters(state, input)  // L2
  return text(buildResponse(filtered, input))   // L2 renderer → L1 response
}
```

---

## Target File Structure

```
analytics-engine/src/
├── core/                                    # L1 — Atomic foundation
│   ├── index.ts                             # Barrel export
│   ├── types.ts                             # ALL domain types, DB record types,
│   │                                        #   StatuslineData, JsonlTotals,
│   │                                        #   SyncEngineConfig, SyncFileResult, SyncProgress,
│   │                                        #   AnomalyRule, PatternUpdate, PreferenceUpdate,
│   │                                        #   SectionKey, ALL_SECTIONS, TIME_RANGE_MS,
│   │                                        #   DEFAULT_WARN_THRESHOLDS, QueryScope
│   ├── jsonl-types.ts                       # JSONL record types + JsonlFileInfo, ScanResult
│   ├── config.ts                            # AnalyticsConfig, TmuxConfig, DEFAULT_CONFIG,
│   │                                        #   loadConfig, saveConfig, watchConfig,
│   │                                        #   getByPath, setByPath, KEY_ALIASES,
│   │                                        #   resolveKeyAlias, resolveGoodvibesDir
│   ├── pricing.ts                           # ModelPricingInfo, ModelPricingMap,
│   │                                        #   loadModelPricing, getModelRates,
│   │                                        #   FALLBACK_MODEL_PRICING
│   ├── response.ts                          # ToolResponse, toolResponse,
│   │                                        #   HandlerResponse, text
│   ├── schemas.ts                           # Zod schemas, TOOL_DEFINITIONS,
│   │                                        #   zodToMinimalJsonSchema
│   ├── format.ts                            # formatNumber, formatBytes, formatDuration,
│   │                                        #   formatPercent, formatDollars, formatBar,
│   │                                        #   formatTime, formatUptime, truncate, pad,
│   │                                        #   ansi, BOX_CHARS, FILL_CHAR, EMPTY_CHAR,
│   │                                        #   colorForHealth, formatDelta,
│   │                                        #   formatUptimeProgressive, formatTokensSaved,
│   │                                        #   visibleLength, fitToWidth, fixedWidth,
│   │                                        #   average, getEfficiencyLabel,
│   │                                        #   formatPrecomputedDelta, resolveStatusLabel,
│   │                                        #   extToCategory
│   ├── db-schema.ts                         # SCHEMA_VERSION, SCHEMA_SQL, MIGRATIONS,
│   │                                        #   getSchemaVersion, applyMigrations
│   ├── db-init.ts                           # ensureGlobalAnalyticsDir, getGlobalDbPath,
│   │                                        #   initializeGlobalDb, checkDbIntegrity
│   ├── db-mappers.ts                        # rowsToObjects, rowToSession, rowToApiCall,
│   │                                        #   rowToToolSummary, rowToAgent
│   ├── defaults.ts                          # emptySessionMetrics, emptyDashboardState,
│   │                                        #   emptyJsonlTotals, computeHealthStatus,
│   │                                        #   toolToActivityType, TOOL_TO_ACTIVITY_TYPE,
│   │                                        #   readMaxAgentChains
│   └── logger.ts                            # Logger interface, DEFAULT_LOGGER
│
├── extensions/                              # L2 — Extends core
│   ├── index.ts                             # Barrel export
│   ├── data/
│   │   ├── global-db.ts                     # GlobalDB class
│   │   ├── jsonl-reader.ts                  # JSONLReader class
│   │   ├── jsonl-watcher.ts                 # JSONLWatcher class
│   │   ├── jsonl-scanner.ts                 # JSONLScanner class + resolveJsonlProjectDir
│   │   │                                    #   + deriveProjectHash (consolidated)
│   │   ├── telemetry-reader.ts              # TelemetryReader class
│   │   ├── index-reader.ts                  # IndexReader class
│   │   ├── session-reader.ts                # SessionReader class
│   │   ├── tag-store.ts                     # TagStore class + pattern consts
│   │   ├── historical-store.ts              # HistoricalStore class
│   │   └── sync-engine.ts                   # SyncEngine class
│   ├── processing/
│   │   ├── aggregator.ts                    # Aggregator class (slimmed ~400 lines)
│   │   ├── jsonl-accumulator.ts             # JsonlAccumulator (extracted from Aggregator)
│   │   ├── state-builder.ts                 # StateBuilder (extracted from Aggregator)
│   │   ├── statusline-reader.ts             # readStatuslineData (extracted from Aggregator)
│   │   ├── anomaly-detector.ts              # AnomalyDetector class
│   │   ├── anomaly-rules.ts                 # Built-in rules + helpers
│   │   ├── budget-tracker.ts                # BudgetTracker class
│   │   ├── memory-updater.ts                # MemoryUpdater class
│   │   ├── report-generator.ts              # ReportGenerator class
│   │   ├── session-archiver.ts              # SessionArchiver class
│   │   ├── watcher.ts                       # DataWatcher class + event types
│   │   ├── query-filters.ts                 # filterByTimeRange, applyActivityFilters,
│   │   │                                    #   filterToolsBreakdown
│   │   └── export-builder.ts                # extractSections, extractArchiveSections
│   ├── rendering/
│   │   ├── mini-renderer.ts                 # MiniRenderer class + rendering helpers
│   │   ├── query-renderer.ts                # buildResponse, renderTokens, etc.
│   │   ├── budget-renderer.ts               # formatBudgetSummary, formatBudgetAmount, etc.
│   │   ├── export-renderer.ts               # renderJson, renderCsv, renderMarkdown
│   │   ├── sync-renderer.ts                 # buildSyncReport
│   │   ├── app.ts                           # Full dashboard App component
│   │   ├── components/                      # MetricBox, BarChart, Table, TimelineFeed,
│   │   │                                    #   Heatmap, TrendLine
│   │   └── pages/                           # SessionOverview, ActivityHotspots,
│   │                                        #   Historical, CrossProject
│   └── tmux/
│       ├── detect.ts                        # detectTmux, getFallbackMode
│       └── manager.ts                       # TmuxManager class + persistPaneState
│
└── plugins/                                 # L3 — Extends extensions
    ├── index.ts                             # Barrel export
    ├── engine.ts                            # AnalyticsEngine class, ToolName,
    │                                        #   getToolDefinitions
    ├── server.ts                            # AnalyticsEngineServer class,
    │                                        #   SERVER_NAME, SERVER_VERSION
    ├── handlers/
    │   ├── query.ts                         # handleQuery (thin dispatch, ~60 lines)
    │   ├── dashboard.ts                     # handleDashboard
    │   ├── budget.ts                        # handleBudget (thin dispatch)
    │   ├── tag.ts                           # handleTag
    │   ├── export.ts                        # handleExport (thin dispatch)
    │   ├── config.ts                        # handleConfig
    │   ├── sync.ts                          # handleSync (thin dispatch)
    │   └── registry.ts                      # HANDLER_REGISTRY, HandlerFn
    └── entry/
        ├── server.ts                        # MCP CLI entry point
        ├── dashboard.ts                     # Full dashboard CLI entry point
        ├── mini.ts                          # Mini dashboard CLI entry point
        └── full.ts                          # Backward-compat re-export
```

**Total: ~55 files across 3 layers** (from 55 files in flat/mixed structure). Each file has one clear reason to exist.

---

## Dependency Graph

```
                    ┌─────────────────────────────────────────────────────┐
                    │                    L3: plugins/                    │
                    │                                                    │
                    │  entry/          engine.ts         server.ts       │
                    │  (server,           │                  │           │
                    │   dashboard,        │                  │           │
                    │   mini, full)       │                  │           │
                    │       │             │                  │           │
                    │       └───────────┼─────────────────┘           │
                    │                    │                              │
                    │             handlers/registry                      │
                    │              │││││││                               │
                    │   query dashboard budget tag export config sync    │
                    └─────────────────────────────────────────────────────┘
                                         │
                                         ▼
    ┌──────────────────────────────────────────────────────────────┐
    │                       L2: extensions/                             │
    │                                                                   │
    │  data/                 processing/              rendering/         │
    │  ──────────────       ───────────────          ───────────     │
    │  global-db.ts          aggregator.ts            mini-renderer     │
    │  jsonl-reader.ts       │ └─ jsonl-accumulator   query-renderer    │
    │  jsonl-watcher.ts      │ └─ state-builder       budget-renderer   │
    │  jsonl-scanner.ts      │ └─ statusline-reader   export-renderer   │
    │  telemetry-reader.ts   anomaly-detector.ts      sync-renderer     │
    │  index-reader.ts       │ └─ anomaly-rules       app.ts            │
    │  session-reader.ts     budget-tracker.ts        components/       │
    │  tag-store.ts          memory-updater.ts        pages/            │
    │  historical-store.ts   report-generator.ts                        │
    │  sync-engine.ts        session-archiver.ts      tmux/             │
    │                        watcher.ts               detect.ts         │
    │                        query-filters.ts         manager.ts        │
    │                        export-builder.ts                           │
    └──────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
    ┌──────────────────────────────────────────────────────────────┐
    │                       L1: core/                                   │
    │                                                                   │
    │  types.ts     config.ts     pricing.ts     response.ts            │
    │  jsonl-types.ts   schemas.ts    format.ts   logger.ts             │
    │  db-schema.ts  db-init.ts  db-mappers.ts  defaults.ts             │
    └──────────────────────────────────────────────────────────────┘
```

---

## Element Migration Summary

| Target File | Elements (by #) | Count |
|-------------|----------------|-------|
| **L1 core/types.ts** | 1-32, 35-41, 127-129, 131-132, 135, 148-149, 188, 212-213, 220 | ~55 |
| **L1 core/jsonl-types.ts** | 62-68, 113-114 | 9 |
| **L1 core/config.ts** | 47-51, 227-230, 241 | 10 |
| **L1 core/pricing.ts** | 42-46 | 5 |
| **L1 core/response.ts** | 33-34, 52-53 | 4 |
| **L1 core/schemas.ts** | 54-61, 109 | 9 |
| **L1 core/format.ts** | 78-94, 118, 145, 151-152, 162-163, 167, 224 | 23 |
| **L1 core/db-schema.ts** | 69-73 | 5 |
| **L1 core/db-init.ts** | 74-77 | 4 |
| **L1 core/db-mappers.ts** | 104-108 | 5 |
| **L1 core/defaults.ts** | 95-101 | 7 |
| **L1 core/logger.ts** | 102-103 | 2 |
| **L2 extensions/data/global-db.ts** | 110 | 1 class |
| **L2 extensions/data/jsonl-reader.ts** | 111 | 1 class |
| **L2 extensions/data/jsonl-watcher.ts** | 112 | 1 class |
| **L2 extensions/data/jsonl-scanner.ts** | 115, 133, 187 | 1 class + consolidated helpers |
| **L2 extensions/data/telemetry-reader.ts** | 116 | 1 class |
| **L2 extensions/data/index-reader.ts** | 117 | 1 class |
| **L2 extensions/data/session-reader.ts** | 119 | 1 class |
| **L2 extensions/data/tag-store.ts** | 120-123 | 1 class + consts |
| **L2 extensions/data/historical-store.ts** | 124, 126 | 1 class |
| **L2 extensions/data/sync-engine.ts** | 130 | 1 class |
| **L2 extensions/processing/aggregator.ts** | 134 (slimmed) | 1 class |
| **L2 extensions/processing/jsonl-accumulator.ts** | new (from 134) | 1 class |
| **L2 extensions/processing/state-builder.ts** | new (from 134) | 1 class |
| **L2 extensions/processing/statusline-reader.ts** | new (from 134) | 1 function |
| **L2 extensions/processing/anomaly-detector.ts** | 146 | 1 class |
| **L2 extensions/processing/anomaly-rules.ts** | 136-144 | 6 rules + helpers |
| **L2 extensions/processing/budget-tracker.ts** | 147 | 1 class |
| **L2 extensions/processing/memory-updater.ts** | 150 | 1 class |
| **L2 extensions/processing/report-generator.ts** | 153 | 1 class |
| **L2 extensions/processing/session-archiver.ts** | 154 | 1 class |
| **L2 extensions/processing/watcher.ts** | 155-158 | 1 class + types |
| **L2 extensions/processing/query-filters.ts** | 189-191 | 3 functions |
| **L2 extensions/processing/export-builder.ts** | 214-215 | 2 functions |
| **L2 extensions/rendering/mini-renderer.ts** | 159-166 | 1 class + helpers |
| **L2 extensions/rendering/query-renderer.ts** | 186, 192-204 | 14 functions |
| **L2 extensions/rendering/budget-renderer.ts** | 221-223 | 3 functions |
| **L2 extensions/rendering/export-renderer.ts** | 216-218 | 3 functions |
| **L2 extensions/rendering/sync-renderer.ts** | 232 | 1 function |
| **L2 extensions/rendering/app.ts** | 178 | 1 component |
| **L2 extensions/rendering/components/** | 168-173 | 6 components |
| **L2 extensions/rendering/pages/** | 174-177 | 4 pages |
| **L2 extensions/tmux/detect.ts** | 179-182 | 2 functions + types |
| **L2 extensions/tmux/manager.ts** | 183-184, 209 | 1 class + helper |
| **L3 plugins/engine.ts** | 235-237 | 1 class |
| **L3 plugins/server.ts** | 238-240 | 1 class + consts |
| **L3 plugins/handlers/query.ts** | 185 (slimmed) | 1 function |
| **L3 plugins/handlers/dashboard.ts** | 205-208, 210 | 5 functions |
| **L3 plugins/handlers/budget.ts** | 219 | 1 function |
| **L3 plugins/handlers/tag.ts** | 225 | 1 function |
| **L3 plugins/handlers/export.ts** | 211 | 1 function |
| **L3 plugins/handlers/config.ts** | 226 | 1 function |
| **L3 plugins/handlers/sync.ts** | 231 | 1 function |
| **L3 plugins/handlers/registry.ts** | 233-234 | 1 const + type |
| **L3 plugins/entry/** | 242-245 | 4 entry points |
| **DELETED** | 125 (`_emptyMetrics`) | 1 (duplicate) |

**245 elements total. 1 deleted. 3 newly extracted from Aggregator decomposition.**

---

## Rewiring: Import Path Changes

| Current Import | New Import |
|---------------|------------|
| `'./types.js'` → SessionMetrics, DashboardState, etc. | `'../core/types.js'` (from L2) or `'../../core/types.js'` (from L2 subdirs) |
| `'./types.js'` → ToolResponse, toolResponse | `'../core/response.js'` |
| `'./config.js'` → loadConfig, DEFAULT_CONFIG | `'../core/config.js'` |
| `'./config.js'` → loadModelPricing, getModelRates | `'../core/pricing.js'` |
| `'../handlers/types.js'` → HandlerResponse, text | `'../../core/response.js'` |
| `'../schemas/tools.js'` → schemas, TOOL_DEFINITIONS | `'../../core/schemas.js'` |
| `'../data/jsonl-types.js'` → JsonlRecord | `'../../core/jsonl-types.js'` |
| `'../data/db-schema.js'` → SCHEMA_SQL | `'../../core/db-schema.js'` |
| `'../data/db-init.js'` → initializeGlobalDb | `'../../core/db-init.js'` |
| `'../data/global-db.js'` → GlobalDB | `'../../extensions/data/global-db.js'` |
| `'../daemon/aggregator.js'` → Aggregator | `'../../extensions/processing/aggregator.js'` |
| `'../tui/mini/format.js'` → formatNumber, etc. | `'../../core/format.js'` |
| `'../tui/mini/renderer.js'` → MiniRenderer | `'../../extensions/rendering/mini-renderer.js'` |
| `'../tmux/manager.js'` → TmuxManager | `'../../extensions/tmux/manager.js'` |
| `'../daemon/watcher.js'` → DataWatcher | `'../../extensions/processing/watcher.js'` |
| `'../daemon/anomaly-detector.js'` → AnomalyDetector | `'../../extensions/processing/anomaly-detector.js'` |
| `'../daemon/budget-tracker.js'` → BudgetTracker | `'../../extensions/processing/budget-tracker.js'` |
| `'../data/telemetry-reader.js'` → TelemetryReader | `'../../extensions/data/telemetry-reader.js'` |
| `'../data/historical-store.js'` → HistoricalStore | `'../../extensions/data/historical-store.js'` |
| `'../data/sync-engine.js'` → SyncEngine | `'../../extensions/data/sync-engine.js'` |
| Internal Logger/DEFAULT_LOGGER (3 copies) | `'../../core/logger.js'` (single import) |
| Internal emptySessionMetrics (2 copies) | `'../../core/defaults.js'` (single import) |