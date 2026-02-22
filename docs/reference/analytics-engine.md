# Analytics Engine — Comprehensive Deep Dive

> Source: `plugins/goodvibes/tools/implementations/analytics-engine/`
> YAML: `plugins/goodvibes/tools/definitions/analytics-engine/`
> Package: `@goodvibes/analytics-engine` v0.1.0

---

## 1. Overview

The analytics engine is a **session intelligence daemon and MCP server** that runs alongside Claude Code to provide real-time and historical analytics. It tracks:

- Token usage (input, output, cache read/write) drawn from Claude JSONL session files
- API costs computed per-model using a live pricing map
- Tool call metrics, success rates, and durations
- Agent spawning and lifecycle (via `Task` tool calls in JSONL)
- File hotspots (most read/written paths)
- Anomaly detection (6 rule types: cache degradation, error spike, token burn, etc.)
- Budget tracking with configurable warn thresholds
- Tags: per-session labeling with auto-suggestion from JSONL content analysis

The engine exposes **7 MCP tools** that Claude agents can call directly. It also spawns two standalone TUI processes that render into tmux panes: a compact 4-line `mini` dashboard and a 4-page interactive `full` (Ink/React) dashboard.

---

## 2. Architecture

### 2.1 MCP Server Layer

The server entry point is `src/server.ts`. It creates a stdio-based MCP server via `@modelcontextprotocol/sdk` and wraps an `AnalyticsEngine` instance. Startup sequence:

```
 server.ts → AnalyticsEngineServer
   ├── AnalyticsEngine.initialize()
   │     ├── initializeGlobalDb()       # sql.js SQLite at ~/.claude/.goodvibes/analytics/analytics.db
   │     └── Aggregator.initialize()   # loads readers, starts DataWatcher
   └── StdioServerTransport.connect()  # begins serving MCP requests
```

The `AnalyticsEngine` class (in `src/index.ts`) is the primary library interface:
- Validates tool names against `SCHEMA_MAP`
- Parses input with Zod schemas (returning structured errors on failure)
- Dynamically imports `HANDLER_REGISTRY` and dispatches to the matching handler
- Returns `ToolResponse` — never throws

Zod schemas are converted to JSON Schema for MCP tool registration via a custom `zodToMinimalJsonSchema()` converter in `server.ts` that handles the subset of Zod types used in this codebase.

### 2.2 Aggregator (Daemon Core)

`src/daemon/aggregator.ts` — 1782 lines, the central state machine.

The `Aggregator` class holds the live `DashboardState` and refreshes it from multiple data sources:

| Component | Source | What it reads |
|-----------|--------|---------------|
| `TelemetryReader` | `.goodvibes/telemetry/` | Tool call records from precision-engine |
| `SessionReader` | `.goodvibes/session/` | Session metadata, counters |
| `IndexReader` | `.goodvibes/.index/` | Project file tree (for token estimates) |
| `JSONLReader` | `~/.claude/projects/<hash>/<session>.jsonl` | Claude API calls, tool use blocks |
| `GlobalDB` | `~/.claude/.goodvibes/analytics/analytics.db` | Cross-session historical data |

Refresh is **mutex-protected**: `refreshing` and `refreshQueued` flags prevent concurrent refreshes. If a refresh arrives while one is running, it is queued and executed after the current one completes.

Key internal constants:
- `RECENT_ACTIVITY_LIMIT = 50` — capped activity event ring buffer
- `MAX_HOTSPOTS = 20` — top N file hotspots retained
- `MAX_ANOMALIES = 50` — max anomaly history retained
- `MAX_JSONL_RECORDS = 10_000` — JSONL record buffer cap
- `GLOBAL_DB_DEBOUNCE_MS = 10_000` — debounce for writing to GlobalDB
- `STATUSLINE_STALENESS_MS = 60_000` — max age for statusline data before re-reading

The `aggregate()` method (line 825) is the core compute step: it reads all data sources and produces a new `DashboardState`. Subscribers are notified via `onStateChange()` callbacks.

Agent profiles are built by parsing subagent JSONL files. Agents are inferred from `Task` tool_use blocks in JSONL — not explicit records. The aggregator resolves subagent directories by scanning `~/.claude/projects/<project-hash>/` for directories named with the agent's tool_use ID.

### 2.3 Data Watcher

`src/daemon/watcher.ts` — `DataWatcher extends EventEmitter`

Watches filesystem paths using chokidar (`FSWatcher`) with a 100ms debounce. Falls back to `setInterval` polling for directories that may not exist at startup. Emits typed events:

| Event | Trigger |
|-------|---------|
| `telemetry-change` | Change in `.goodvibes/telemetry/` |
| `session-change` | Change in `.goodvibes/session/` |
| `index-change` | Change in `.goodvibes/.index/` |
| `config-change` | Config file change |
| `jsonl-records` | New JSONL records emitted by `JSONLWatcher` |

JSONL watching is handled by a separate `JSONLWatcher` instance that tracks byte offsets and emits batches of new `JSONLRecord[]` at configurable intervals.

### 2.4 Global SQLite Database

`src/data/global-db.ts` + `src/data/db-schema.ts`

Uses **sql.js** (WebAssembly SQLite) for portability — no native bindings required. The database lives at `~/.claude/.goodvibes/analytics/analytics.db` and persists across all sessions and projects.

Schema (version 1):

```sql
sessions        -- One row per Claude session (all projects)
  session_id, project_hash, started_at, ended_at, model,
  total_input_tokens, total_output_tokens, total_cache_read_tokens,
  total_cache_write_tokens, total_cost_usd, total_api_calls,
  total_tool_calls, total_native_tool_calls, total_precision_tool_calls,
  total_agent_spawns, status

tags            -- Many-to-many session <-> tag
  session_id, tag, created_at, source (manual|auto)
  UNIQUE(session_id, tag)

tool_summaries  -- Per-session per-tool aggregates
  session_id, tool_name, call_count, success_count, error_count,
  total_duration_ms, total_input_tokens, total_output_tokens

api_calls       -- Individual Claude API call records for trend analysis
  session_id, timestamp, model, input_tokens, output_tokens,
  cache_read_tokens, cache_write_tokens, cost_usd, duration_ms, stop_reason

agents          -- Spawned subagents with timing and token usage
  session_id, agent_id, agent_type, parent_session_id, model,
  spawned_at, completed_at, total_tokens, duration_ms, exit_code

sync_state      -- Tracks processed JSONL files (byte offset tracking)
  jsonl_path (PK), session_id, last_offset, last_synced_at

schema_version  -- Migration tracking
```

The `GlobalDB` class uses a **write-debounce** pattern: `saveToDisk()` is triggered via a 500ms debounce timer. This prevents excessive disk I/O during rapid state changes. The WASM binary path is resolved from the package location at runtime.

Migrations are applied via `MIGRATIONS: Map<number, string>` — each version maps to upgrade SQL executed inside a savepoint for atomicity.

---

## 3. Tools (7)

### 3.1 `analytics_dashboard`

**Purpose:** Launch, stop, or check status of TUI panes in tmux.

| Parameter | Type | Values | Default |
|-----------|------|--------|---------|
| `action` | enum | `start`, `stop`, `status` | required |
| `target` | enum | `mini`, `full`, `dashboard`, `both` | `both` |
| `options.pane_position` | enum | `bottom`, `top`, `left`, `right` | from config |
| `options.pane_size` | number\|string | lines or percentage | from config |

**Toggle semantics:** `start` on a running target stops it (toggle off). `stop` on a stopped target is a no-op. `full` is a backward-compatible alias for `dashboard`.

**Implementation details (`handlers/dashboard.ts`):**
- A module-level `TmuxManager` singleton is lazily created on first call and shared across all handler invocations, ensuring pane state is consistent.
- Pane state is persisted to `.goodvibes/active-panes.json` (best-effort, never throws). Maps session IDs to live pane IDs and PIDs.
- Commands for each target are built as absolute paths to the compiled dist files: `mini.cjs` (CJS bundle) and `full.mjs` (ESM bundle).
- Falls back to a non-tmux mode (`getFallbackMode()`) when not inside a tmux session.

### 3.2 `analytics_query`

**Purpose:** Ad-hoc queries against live session data from the Aggregator's `DashboardState`.

| Parameter | Type | Values | Default |
|-----------|------|--------|---------|
| `scope` | enum | `tokens`, `cache`, `commands`, `agents`, `files`, `cost`, `health`, `project`, `all` | required |
| `time_range` | enum | `session`, `last_5m`, `last_30m`, `last_1h` | `session` |
| `group_by` | enum | `tool`, `agent`, `file`, `status` | optional |
| `filters.tool` | string | — | optional |
| `filters.status` | enum | `success`, `failed`, `partial` | optional |
| `filters.agent` | string | — | optional |
| `filters.tags` | string[] | — | optional |
| `format` | enum | `standard`, `minimal`, `verbose` | `standard` |
| `data_scope` | enum | `current_session`, `current_project`, `all_projects`, `tagged` | `current_session` |

**Implementation details (`handlers/query.ts`):**
- Time range filtering applies only to `recent_activity` events; session-wide metrics (`metrics.*`) always reflect the full session.
- When `data_scope` is not `current_session`, a cross-project summary is prepended from `GlobalDB`. For `all_projects`, it queries all sessions and total cost. For `tagged`, it filters by `filters.tags`. For `current_project`, it derives the project hash from the current session.
- Tool breakdown is filtered by `filters.tool` if specified.
- Uses formatting utilities from `tui/mini/format.ts` (`formatNumber`, `formatDollars`, `formatPercent`, etc.) for consistent output.

### 3.3 `analytics_budget`

**Purpose:** Set, check, or clear a session spending/token budget.

| Parameter | Type | Values | Default |
|-----------|------|--------|---------|
| `action` | enum | `set`, `check`, `clear` | required |
| `amount` | number | positive | required for `set` |
| `unit` | enum | `dollars`, `tokens` | `dollars` |
| `warn_at` | number[] | fractions 0–1 | `[0.5, 0.8, 1.0]` |

**Implementation details (`handlers/budget.ts`, `daemon/budget-tracker.ts`):**
- Budget mutations go through `Aggregator.setBudget()` / `clearBudget()`, which proxy to `BudgetTracker`.
- `BudgetTracker` maintains a `crossedThresholds: Set<number>` to track which warning thresholds have already been crossed (to avoid duplicate alerts).
- The `checkThresholds()` method returns newly crossed thresholds on each update cycle.
- Budget state is recomputed on every `Aggregator.refresh()` call by comparing `metrics.cost.total` (dollars mode) or `metrics.tokens.total` (tokens mode) against the configured limit.
- Output includes an ASCII progress bar rendered via `formatBar()` using Unicode block characters (█ / ░).

### 3.4 `analytics_tag`

**Purpose:** Add, remove, or list session tags. Tags persist in the global SQLite DB.

| Parameter | Type | Values | Default |
|-----------|------|--------|---------|
| `action` | enum | `add`, `remove`, `list`, `auto` | required |
| `value` | string | 1–100 chars | required for `add`/`remove` |
| `scope` | enum | `session`, `all` | `session` |

**Implementation details (`handlers/tag.ts`, `data/tag-store.ts`):**
- Tag persistence is backed by `TagStore`, which wraps `GlobalDB`. No module-level state beyond a lazily initialized `TagStore` singleton.
- **Auto-suggestion (`action=auto`):** `TagStore.suggestTags()` scans the session's JSONL file — first 200 lines and last 100 lines (via `_readJsonlCorpus()`) — and matches against three pattern sets:
  - `DOMAIN_PATTERNS`: Maps JSONL content patterns to domain tags (e.g., tool names, file extensions)
  - `FRAMEWORK_PATTERNS`: Framework detection (Next.js, React, Vue, etc.)
  - `ACTIVITY_PATTERNS`: Activity classification (refactoring, debugging, testing, etc.)
- Suggestions are ranked by confidence (`high` > `medium` > `low`) and returned without being applied.
- Tags are stored with a `source` field (`manual` | `auto`) in the `tags` table.

### 3.5 `analytics_export`

**Purpose:** Export session data in JSON, CSV, or markdown format.

| Parameter | Type | Values | Default |
|-----------|------|--------|---------|
| `format` | enum | `json`, `csv`, `markdown` | required |
| `scope` | string | `current`, `historical`, `all_projects`, `session:<id>` | `current` |
| `sections` | string[] | `tokens`, `cache`, `commands`, `agents`, `files`, `cost`, `timeline` | optional |
| `output_path` | string | filesystem path | optional |
| `tags` | string[] | tag filter | optional |

**Implementation details (`handlers/export.ts`):**
- `current` scope exports from live `DashboardState` (Aggregator).
- `historical` and `all_projects` scopes query `GlobalDB`.
- `session:<id>` scope retrieves a specific session by ID from `GlobalDB`.
- When `output_path` is provided, the content is written to disk and the path is returned. Otherwise, the full content is returned inline.
- Tag filtering applies to `historical` and `all_projects` scopes via `GlobalDB.getSessionsByTags()`.

### 3.6 `analytics_config`

**Purpose:** View, update, or hot-reload analytics engine configuration.

| Parameter | Type | Values | Default |
|-----------|------|--------|---------|
| `action` | enum | `get`, `set`, `reload` | required |
| `key` | string | dot-notation key | optional |
| `value` | unknown | new value | optional |

**Implementation details (`handlers/config.ts`):**
- `get` with no `key` returns the full config as formatted JSON. With a `key`, resolves via dot-notation path traversal.
- `set` writes to the global config file (`~/.claude/.goodvibes/analytics/analytics.json`) via `saveConfig()` and calls `Aggregator.reloadConfig()` to apply live.
- `reload` forces a re-read from disk via `loadConfig()` and propagates to the Aggregator.
- Config resolution order: global (`~/.claude/.goodvibes/analytics/analytics.json`) → per-project (`.goodvibes/analytics.json`) → `DEFAULT_CONFIG`.

### 3.7 `analytics_sync`

**Purpose:** Sync Claude JSONL session files into the global SQLite database.

| Parameter | Type | Values | Default |
|-----------|------|--------|---------|
| `scope` | enum | `current`, `all` | `current` |

**Implementation details (`handlers/sync.ts`, `data/sync-engine.ts`):**
- `SyncEngine` scans for JSONL files under `~/.claude/projects/`.
- `scope=current` syncs only the active project directory.
- `scope=all` discovers all project directories and syncs each.
- Incremental sync via **byte-offset tracking**: `sync_state` table records `last_offset` per JSONL file. On re-sync, `JSONLReader.parseFile(filePath, fromOffset)` reads only new bytes.
- Subagent JSONL files (nested under project directories) are detected and linked to their parent session via `parent_session_id`.
- Stale files (modified > 2 hours ago) are skipped unless explicitly re-synced.
- Results report: `sessionsProcessed`, `recordsProcessed`, `bytesProcessed`, `filesSkipped`, `errors`, `projectsScanned`.

---

## 4. Dashboard System

### 4.1 Mini Dashboard (4-line tmux pane)

`src/tui/mini/renderer.ts` — `MiniRenderer` class

A pure terminal renderer (no React) that produces 4 fixed lines using ANSI escape codes:

```
Line 1: ╔═══ Header ═══╗  session ID, uptime, cost, context%, health indicator, budget bar
Line 2: │ TOKENS section │ CACHE section │ AGENTS section │
Line 3: │ FILES section  │ CMDS section  │ extra section  │
Line 4: ╚═══ Footer ══════════════════════════════════════╝
```

Key constants:
- `MIN_WIDTH = 160` — minimum terminal columns before content truncation
- `SECTION_WIDTH = 32` — uniform width per section column in rows 2–3
- `SESSION_ID_LENGTH = 8` — truncated session UUID chars in header

The renderer computes a `ComputedMetrics` intermediate object that formats all values to strings before rendering. This separates data computation from layout.

`MiniRenderer.startLoop()` drives a `setInterval` that calls `render(getState())` on each tick, writing output via `process.stdout.write()`. A SIGWINCH handler re-renders immediately on terminal resize.

The optional budget progress bar is rendered using block characters when `mini_budget_bar: true` is configured.

### 4.2 Full TUI Dashboard (Ink/React)

`src/tui/full/app.tsx` — Root Ink application

A 4-page interactive dashboard built with Ink (React for the terminal). Navigation is keyboard-driven:

| Key | Action |
|-----|--------|
| `1` | Session Overview page |
| `2` | Activity Hotspots page |
| `3` | Historical Comparison page |
| `4` | Cross-Project page |
| `h` | Toggle help overlay |
| `q` / `Esc` | Quit |

**Pages:**

| Page | File | Content |
|------|------|---------|
| Session Overview (p1) | `pages/session-overview.tsx` | Precision tokens, API tokens, cache metrics, cost, agent summary, health |
| Activity Hotspots (p2) | `pages/activity-hotspots.tsx` | File hotspot table, recent activity feed, anomalies |
| Historical (p3) | `pages/historical.tsx` | Session history from GlobalDB, delta comparisons |
| Cross-Project (p4) | `pages/cross-project.tsx` | All-projects aggregation from GlobalDB |

**Reusable components** (`tui/full/components/`):

| Component | Description |
|-----------|-------------|
| `MetricBox` | Bordered box with title and key-value rows |
| `Table` | Fixed-width terminal table with headers |
| `BarChart` | Horizontal bar chart for numeric comparisons |
| `Heatmap` | 2D grid visualization |
| `TrendLine` | Sparkline-style ASCII trend line |
| `TimelineFeed` | Scrollable activity event list |

The app receives the live `DashboardState` as a prop and is re-rendered by the TUI entry point on each Aggregator state change.

---

## 5. Data Pipeline

### 5.1 JSONL File Format

Claude Code writes session data to `~/.claude/projects/<project-hash>/<session-id>.jsonl`. Each line is a JSON object with a `type` discriminator:

| Record Type | Analytics Relevance |
|-------------|--------------------|
| `assistant` | **Primary source**: token usage, model ID, tool_use blocks, stop_reason |
| `user` | Tool result blocks (for matching tool_use to results) |
| `progress` | MCP tool timing: `started` / `completed` pairs with `elapsedTimeMs` |
| `file-history-snapshot` | Skipped (large, irrelevant for analytics) |

Key fields extracted from `assistant` records:
- `message.usage`: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`
- `message.usage.cache_creation`: extended breakdown for 5-minute and 1-hour cache TTLs
- `message.model`: model ID (e.g., `claude-sonnet-4-6`)
- `message.content[].type === 'tool_use'`: tool call with `name` and `input`
- `message.stop_reason`: e.g., `end_turn`, `tool_use`, `max_tokens`

Agents are **inferred**, not explicitly typed. When `content[].name === 'Task'`, the tool_use block represents an agent spawn. The completion is found by matching the `id` field to a `tool_result` block in a subsequent `user` record.

### 5.2 Cost Calculation

`src/data/jsonl-reader.ts` — `JSONLReader.calculateCost()`

Cost is calculated per-API-call using model-specific rates from `~/.claude/model-pricing.json` (written by the session-start hook). Price lookup uses a three-stage fallback:
1. Exact model ID match
2. Normalized key match (dot/dash normalization)
3. Prefix match (for model IDs longer than the pricing key)

An unusual feature is **tiered input cost** (`calculateTieredInputCost()`): tokens above `TIER_BOUNDARY = 200_000` may be priced differently, reflecting Anthropic's context window tiers.

### 5.3 Sync Engine and Byte-Offset Tracking

`src/data/sync-engine.ts` — `SyncEngine`

The sync engine enables efficient incremental updates:

1. For each JSONL file, `GlobalDB.getSyncState(jsonlPath)` retrieves the last processed byte offset.
2. `JSONLReader.parseFile(filePath, fromOffset)` seeks to the offset and reads only new lines.
3. Extracted records are batch-written to the database.
4. `GlobalDB.upsertSyncState()` updates the offset after successful processing.

This means re-running sync on a large project skips all previously processed content, reading only bytes appended since the last sync.

---

## 6. Daemon Architecture

### 6.1 Component Relationships

```
AnalyticsEngine
  └── Aggregator
        ├── DataWatcher (chokidar + polling)
        │     ├── watches: telemetry/, session/, .index/, config files
        │     └── JSONLWatcher (byte-offset incremental reads)
        ├── TelemetryReader  (.goodvibes/telemetry/ files)
        ├── SessionReader    (.goodvibes/session/ files)
        ├── IndexReader      (.goodvibes/.index/ files)
        ├── JSONLReader      (~/.claude/projects/<hash>/<session>.jsonl)
        ├── AnomalyDetector  (6 built-in rules, rule-based detection)
        ├── BudgetTracker    (set/check/clear, threshold crossing detection)
        ├── MemoryUpdater    (periodic memory file updates, every 5 refreshes)
        └── GlobalDB         (sql.js SQLite, debounced 10s writes)
```

### 6.2 Anomaly Detector

`src/daemon/anomaly-detector.ts` — 6 built-in anomaly rules:

| Rule | Type | Window | Trigger |
|------|------|--------|---------|
| Cache Degradation | `cache_degradation` | 10min | Cache hit rate falls below recent baseline |
| Error Spike | `error_spike` | 5min | Error rate in recent tool calls spikes |
| Token Burn | `token_burn` | 5min | Token consumption rate significantly above session average |
| Build Regression | `build_regression` | 10min | Build/test commands failing at a higher rate |
| Conflict Storm | `conflict_storm` | 5min | Multiple write conflicts in a short window |
| Agent Stall | `agent_stall` | 10min | Agent running with no progress records |

Each rule has a `windowKey` (type + window + current time bucket) to prevent re-firing within the same time window. A `fired: Map<string, number>` prevents duplicate anomalies. Anomalies are pruned after `MAX_ANOMALIES = 50` or when stale.

### 6.3 Memory Updater

`src/daemon/memory-updater.ts` — Runs every `MEMORY_UPDATER_INTERVAL = 5` aggregator refresh cycles. Writes a compact session summary to `.goodvibes/memory/` so that other agents and tools can read real-time session stats without querying the MCP server directly.

### 6.4 Session Archiver

`src/daemon/session-archiver.ts` — On shutdown (or when `auto_report_on_shutdown: true`), serializes the current `DashboardState` into a `SessionArchive` object and writes it to `.goodvibes/analytics/sessions/<session-id>.json`. Also optionally fires a webhook if configured.

### 6.5 Report Generator

`src/daemon/report-generator.ts` — Generates a formatted session report (markdown or text) from a `SessionArchive`. Used both for on-disk persistence and for webhook payloads.

---

## 7. Tag System

### 7.1 Manual Tags

Added/removed via `analytics_tag` with `action=add|remove`. Tags are stored in the `tags` table with `source='manual'`. Multiple tags per session are supported via separate rows with `UNIQUE(session_id, tag)` constraint.

### 7.2 Auto-Tagging

`TagStore.suggestTags()` performs JSONL corpus analysis:

1. Reads first `SCAN_HEAD_LINES = 200` and last `SCAN_TAIL_LINES = 100` lines from the session JSONL
2. Matches against three pattern arrays:
   - `DOMAIN_PATTERNS` — tool and file extension patterns → domain tags
   - `FRAMEWORK_PATTERNS` — framework keywords → framework tags  
   - `ACTIVITY_PATTERNS` — action verbs and patterns → activity tags (refactoring, debugging, testing, etc.)
3. Assigns confidence (`high`, `medium`, `low`) to each suggestion
4. Returns suggestions sorted by confidence rank
5. Suggestions are **not applied automatically** — the caller must explicitly `add` them

### 7.3 Tag Persistence

Tags persist in `GlobalDB` across sessions. Session export and cross-project queries support filtering by tags. The `analytics_export` tool accepts `tags: string[]` to filter which historical sessions to include.

---

## 8. Budget System

### 8.1 Budget Configuration

Budgets are set at runtime via `analytics_budget` (not in config file). Configuration supports:
- **Unit:** `dollars` (USD cost) or `tokens` (total token count)
- **Amount:** Any positive number
- **Warn thresholds:** Fractions 0–1 (default: `[0.5, 0.8, 1.0]`)

### 8.2 Threshold Tracking

`BudgetTracker` maintains a `crossedThresholds: Set<number>`. On each `update()` call:
1. Current usage is compared to the budget limit
2. The current threshold tier (`warn_thresholds` sorted ascending) is determined via `resolveCurrentThreshold()`
3. Newly crossed thresholds are returned by `checkThresholds()`
4. Already-crossed thresholds are not re-reported

The `BudgetState` object exposes `current_threshold: number | null` — the highest threshold fraction currently active.

### 8.3 Visual Budget Bar

When `mini_budget_bar: true` is set in config, the mini dashboard header includes a Unicode progress bar showing `used / limit`. The bar uses color coding: green < 50%, yellow 50–80%, red > 80%.

---

## 9. Tmux Integration

`src/tmux/manager.ts` — `TmuxManager`

Manages tmux pane lifecycle for mini and full TUI processes:

- `createPane(target, command)`: Calls `tmux split-window` with position flags (`-h`/`-v`, `-b` for top/left) and size arguments. Tracks pane ID and PID in a `Map<'mini'|'full', PaneInfo>`.
- `closePane(target)`: Calls `tmux kill-pane -t <paneId>`.
- `isPaneAlive(target)`: Verifies pane exists via `tmux display-message` and that the process is still running.
- `resizePane(target, size)`: Calls `tmux resize-pane` with appropriate size argument.

Position flags are computed by `_positionFlags()`: `bottom` → `['-v']`, `top` → `['-v', '-b']`, `right` → `['-h']`, `left` → `['-h', '-b']`.

`src/tmux/detect.ts` — `detectTmux()` checks for `$TMUX` environment variable. `getFallbackMode()` returns the rendering mode when tmux is unavailable.

---

## 10. Configuration

`src/config.ts` — `loadConfig()` and `src/types.ts` — `DEFAULT_CONFIG`

Full `AnalyticsConfig` defaults:

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Engine enabled flag |
| `auto_start_mini` | `true` | Auto-launch mini dashboard on session start |
| `auto_start_dashboard` | `false` | Auto-launch full TUI |
| `refresh_rate_ms` | `1000` | Aggregator refresh interval |
| `dashboard_refresh_rate_ms` | `5000` | Full TUI refresh rate |
| `cost_per_1k_input_tokens` | `0.003` | Fallback rate ($/1k) |
| `cost_per_1k_output_tokens` | `0.015` | Fallback rate ($/1k) |
| `budget` | `null` | Budget config or null |
| `budget_warn_thresholds` | `[0.5, 0.8, 1.0]` | Warning thresholds |
| `mini_budget_bar` | `false` | Show budget bar in mini header |
| `mini_min_width` | `160` | Minimum terminal width |
| `context_window_tokens` | `200_000` | Context window size for % computation |
| `anomaly_detection` | `true` | Enable anomaly detector |
| `auto_report_on_shutdown` | `true` | Archive session on shutdown |
| `webhook_url` | `null` | Webhook endpoint |
| `webhook_events` | `['session_end']` | Which events trigger webhook |
| `global_db_path` | `~/.claude/.goodvibes/analytics/analytics.db` | SQLite path |
| `jsonl_base_path` | `~/.claude/projects` | Claude JSONL root |
| `tmux.mini_pane_size` | `5` | Mini pane height in lines |
| `tmux.dashboard_pane_size` | `'60%'` | Full TUI pane size |
| `tmux.dashboard_position` | `'right'` | Full TUI pane position |

Config resolution: global (`~/.claude/.goodvibes/analytics/analytics.json`) → per-project (`.goodvibes/analytics.json`) → DEFAULT_CONFIG. The first file found wins; missing keys fall back to defaults.

---

## 11. Key Implementation Details

### Context Percent Computation

Context usage percentage is derived from the most recent JSONL `assistant` record's `input_tokens`, divided by `context_window_tokens` (default 200,000). This reflects actual API context window usage, not precision-engine token estimates.

### Base Tool Name Extraction

`Aggregator.extractBaseToolName(rawName)` strips MCP server prefixes from tool names. A call to `mcp__plugin_goodvibes_precision-engine__precision_read` is normalized to `precision_read` for consistent metrics grouping.

### Statusline Data Reading

The aggregator reads from a statusline file written by the hooks system. Staleness is capped at `STATUSLINE_STALENESS_MS = 60_000ms` — if the file is older than 60 seconds, its data is discarded and the aggregator computes metrics from raw JSONL instead.

### JSONL Project Directory Resolution

`resolveJsonlProjectDir()` discovers the JSONL directory for the current session. It tries multiple strategies: reading project hash from session files, scanning `~/.claude/projects/` for a directory containing the current session ID's JSONL file, and falling back to CWD-based hash derivation.

### Safe Aggregation

The `safeCall<T>(fn, fallback)` pattern wraps every data reader call in `aggregate()`. If any single data source fails, it returns the fallback value and continues aggregation. This ensures the dashboard always renders even if, e.g., the JSONL reader fails on a malformed record.

### Precision Tool Tracking

Progress records (`type='progress'`) are emitted in `started`/`completed` pairs. `extractPrecisionToolTimings()` joins these pairs by `toolUseId` to compute actual tool execution durations. These are tracked separately from the main tool breakdown to distinguish MCP tool overhead from API call time.

---

## 12. Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | ^1.12.1 | MCP server infrastructure |
| `chokidar` | ^4.0.3 | Filesystem watching with FSEvents/inotify |
| `ink` | ^5.2.0 | React renderer for terminal (full TUI) |
| `react` | ^18.3.1 | Component model for full TUI |
| `sql.js` | ^1.12.0 | WebAssembly SQLite (no native bindings) |
| `zod` | ^3.24.4 | Input schema validation for all 7 tools |
| `typescript` | ^5.9.3 | Dev: type checking |
| `esbuild` | ^0.27.2 | Dev: bundling (via `node build.mjs`) |
| `vitest` | ^4.0.17 | Dev: unit tests |
| `tsx` | ^4.21.0 | Dev: direct TypeScript execution |

**Build output:**
- `dist/server.cjs` — MCP server entry point (registered in `.mcp.json`)
- `dist/mini.cjs` — Mini dashboard standalone process
- `dist/full.mjs` — Full TUI standalone process

---

## 13. Entry Points

| File | Purpose |
|------|---------|
| `src/server.ts` | MCP server — stdio transport, `.mcp.json` target |
| `src/index.ts` | Library entry — `AnalyticsEngine` class for programmatic use |
| `src/mini.ts` | Mini dashboard standalone — spawned by `TmuxManager` |
| `src/full.ts` | Full TUI standalone — spawned by `TmuxManager` |
| `src/dashboard.ts` | Shared entry — selects mini or full based on env |

---

*Generated from source code analysis — `@goodvibes/analytics-engine` v0.1.0, 66 TypeScript source files, 7 YAML tool definitions.*
