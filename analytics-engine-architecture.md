# Analytics Engine Architecture & Implementation Plan

**Date:** 2026-02-20
**Status:** Architecture design complete, ready for implementation
**Scope:** 14 feature changes + 8 foundational fixes from `analytics-engine-updates.md`

---

## 1. Architecture Overview

### Current Architecture (What Exists)

```
telemetry.db (precision-engine hooks only)
    |
    v
TelemetryReader ----+
SessionReader ------+---> Aggregator ---> DashboardState ---> MiniRenderer / Full TUI
IndexReader --------+                          |                 (tmux panes)
                                               v
                                        6 MCP Handlers
                                    (query/budget/tag/export/config/dashboard)
```

**Problems:**
- Data source is precision-engine telemetry ONLY (no Claude API tokens, native tools, agent spawns)
- Per-project storage (`.goodvibes/`) -- no cross-project analytics
- Session ID resolution is broken (stale `current_session.json`)
- Tag system is in-memory only, single-tag, volatile
- `buildAgentProfiles()` is a stub returning `[]`
- Budget tracker reads from empty metrics pipeline
- All 6 anomaly rules query the wrong (empty) data source

### New Architecture (Target State)

```
~/.claude/projects/<hash>/<session>.jsonl  (Claude activity: ALL data)
    |                                          |
    v                                          v
JSONLReader (NEW) ---+                    JNOLWatcher (NEW)
                     |                         |
telemetry.db --------+                         |
    |                |                         |
    v                v                         v
TelemetryReader ----+                          |
                    +---> Aggregator <---------+
SessionReader ------+       |                  |
IndexReader --------+       v                  |
                    DashboardState             |
                         |                     |
                         v                     v
                  Global SQLite DB      DataWatcher (enhanced)
              (~/.claude/.goodvibes/       (watches JSONL + telemetry)
               analytics/analytics.db)
                         |
              +----------+----------+
              |          |          |
              v          v          v
         MCP Handlers  Mini TUI   Full TUI (renamed: dashboard)
         (7 tools)     (tmux)     (tmux)
```

### Key Data Flow Changes

1. **JSONL as primary data source**: A new `JSONLReader` parses `~/.claude/projects/<hash>/<session>.jsonl` files for Claude API tokens (input/output), native tool calls, agent spawns/completions, conversation turns, and all activity not captured by precision-engine hooks.

2. **Global SQLite database**: A single `analytics.db` at `~/.claude/.goodvibes/analytics/` stores all session data, tags, and cross-project metrics. Replaces per-project JSON files.

3. **Merged aggregation**: The `Aggregator` merges JSONL-sourced data (Claude API activity) with precision-engine telemetry (cache hits, rollbacks, precision-specific metrics) into a unified `DashboardState`.

4. **Live JSONL watching**: `DataWatcher` gains a `jsonl-change` event by tailing the active session's JSONL file for real-time updates.

5. **Session ID derived from JSONL**: Active session ID is resolved from the most recently modified JSONL file, not from stale JSON.

---

## 2. Data Model Changes

### New Types

```typescript
// --- JSONL Record Types (ACTUAL FORMAT) ---
// NOTE: The actual Claude JSONL format differs significantly from initial assumptions.
// Types are: 'assistant' | 'user' | 'progress' | 'file-history-snapshot'
// There are NO separate api_request/api_response/tool_use/agent_spawn records.

/** Common fields on every JSONL record */
export interface JSONLRecordBase {
  type: 'assistant' | 'user' | 'progress' | 'file-history-snapshot';
  sessionId: string;           // Session UUID
  uuid: string;                // Record UUID
  parentUuid: string | null;   // Parent record UUID
  timestamp: string;           // ISO 8601
  cwd: string;                 // Working directory
  version: string;             // Claude version
  gitBranch: string;
}

/** Assistant turn — contains API token usage and tool calls */
export interface JSONLAssistantRecord extends JSONLRecordBase {
  type: 'assistant';
  message: {
    model: string;             // e.g. 'claude-opus-4-6'
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
      cache_creation: {
        ephemeral_5m_input_tokens: number;
        ephemeral_1h_input_tokens: number;
      };
    };
    /** Array of content blocks: thinking, text, or tool_use */
    content: Array<
      | { type: 'thinking'; thinking: string }
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    >;
    stop_reason: string;
  };
  requestId: string;
}

/** User turn — plain message or tool results */
export interface JSONLUserRecord extends JSONLRecordBase {
  type: 'user';
  message: {
    role: 'user';
    /** Either a plain string message or an array of tool_result blocks */
    content: string | Array<{
      tool_use_id: string;
      type: 'tool_result';
      content: unknown;
    }>;
  };
}

/** MCP/hook tool progress event */
export interface JSONLProgressRecord extends JSONLRecordBase {
  type: 'progress';
  data: {
    type: 'hook_progress' | 'mcp_progress';
    status: 'started' | 'completed';
    serverName: string;        // e.g. 'plugin:goodvibes:precision-engine'
    toolName: string;          // e.g. 'precision_read'
    elapsedTimeMs?: number;    // Present on 'completed' records
  };
  toolUseID: string;
}

/** File snapshot (for undo/history) — skip or use for file tracking */
export interface JSONLFileHistoryRecord extends JSONLRecordBase {
  type: 'file-history-snapshot';
  messageId: string;
  snapshot: {
    trackedFileBackups: Record<string, unknown>;
    timestamp: string;
  };
}

export type JSONLRecord =
  | JSONLAssistantRecord
  | JSONLUserRecord
  | JSONLProgressRecord
  | JSONLFileHistoryRecord;

/**
 * KEY DIFFERENCES FROM INITIAL ASSUMPTIONS:
 * - Token usage is on assistant records in message.usage, NOT separate api_request/api_response records
 * - cost_usd is NOT in the JSONL — must be calculated from token counts + config rates
 * - Tool calls are embedded in assistant.message.content as {type: 'tool_use'} blocks
 * - Tool results are in user.message.content as {type: 'tool_result'} blocks
 * - Agent spawns are inferred from Task tool_use calls (tool name === 'Task'), not explicit records
 * - Subagent JSONL files live at <session-id>/subagents/agent-<id>.jsonl
 *
 * PRECISION TOOL TRACEABILITY:
 * Precision tool uses have named IDs like [grep_907c42dc_a1b2c3d4] in tool results.
 * Format: {tool}_{session_short}_{unique_id}. These can be traced from JSONL tool_result
 * content → specific precision tool call → specific agent → specific user session.
 */

// --- Global Analytics DB Schema ---

/** Represents a session record in the global analytics DB */
export interface GlobalSession {
  session_id: string;
  project_hash: string;        // From the JSONL directory path
  project_path?: string;       // Resolved project path (if available)
  started_at: string;
  ended_at?: string;
  model: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
  total_cost_usd: number;
  total_api_calls: number;
  total_tool_calls: number;
  total_native_tool_calls: number;
  total_precision_tool_calls: number;
  total_agent_spawns: number;
  tags: string[];              // Multi-tag array
  status: 'active' | 'completed' | 'archived';
}

/** Tool call summary aggregated per-session per-tool */
export interface GlobalToolSummary {
  session_id: string;
  tool_name: string;
  call_count: number;
  success_count: number;
  error_count: number;
  total_duration_ms: number;
  avg_duration_ms: number;
  total_input_tokens: number;
  total_output_tokens: number;
}

/** Tag entry for the tags table */
export interface TagEntry {
  tag: string;
  session_id: string;
  created_at: string;
  source: 'manual' | 'auto';
}

// --- Enhanced DashboardState ---

/** Cross-session/cross-project scope for queries */
export type QueryScope = 
  | { type: 'current_session' }
  | { type: 'current_project'; project_hash: string }
  | { type: 'all_projects' }
  | { type: 'tagged'; tags: string[] }
  | { type: 'time_range'; start: string; end: string };
```

### Modified Types

```typescript
// AnalyticsConfig changes:
export interface AnalyticsConfig {
  enabled: boolean;
  auto_start_mini: boolean;
  auto_start_dashboard: boolean;        // RENAMED from auto_start_full
  refresh_rate_ms: number;
  dashboard_refresh_rate_ms: number;     // RENAMED from full_tui_refresh_rate_ms
  cost_per_1k_input_tokens: number;
  cost_per_1k_output_tokens: number;
  // REMOVED: historical_sessions
  budget: { amount: number; unit: 'dollars' | 'tokens' } | null;
  budget_warn_thresholds: number[];
  anomaly_detection: boolean;
  auto_report_on_shutdown: boolean;
  webhook_url: string | null;
  webhook_events: WebhookEvent[];
  tmux: TmuxConfig;
  global_db_path: string;               // NEW: path to global analytics.db
  jsonl_base_path: string;              // NEW: base path for JSONL files
}

// TmuxConfig changes:
export interface TmuxConfig {
  mini_pane_size: number;
  mini_position: 'bottom' | 'top' | 'left' | 'right';
  dashboard_pane_size: string;           // RENAMED from full_pane_size
  dashboard_position: 'bottom' | 'top' | 'left' | 'right'; // RENAMED from full_position
}

// SessionArchive changes:
export interface SessionArchive {
  session_id: string;
  project_hash: string;                 // NEW
  tags: string[];                       // CHANGED from tag?: string (multi-tag)
  name?: string;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  metrics: SessionMetrics;
  tools_breakdown: Record<string, ToolBreakdown>;
  project_snapshot: {
    total_files: number;
    total_estimated_tokens: number;
  };
}

// TokenMetrics expanded:
export interface TokenMetrics {
  input: number;
  output: number;
  total: number;
  saved: number;
  efficiency: number;
  api_input: number;                    // NEW: Claude API input tokens
  api_output: number;                   // NEW: Claude API output tokens
  cache_read: number;                   // NEW: cache read tokens from API
  cache_write: number;                  // NEW: cache write tokens from API
}
```

### SQLite Schema (analytics.db)

```sql
-- Sessions table
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  project_hash TEXT NOT NULL,
  project_path TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  model TEXT DEFAULT 'unknown',
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cache_read_tokens INTEGER DEFAULT 0,
  total_cache_write_tokens INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  total_api_calls INTEGER DEFAULT 0,
  total_tool_calls INTEGER DEFAULT 0,
  total_native_tool_calls INTEGER DEFAULT 0,
  total_precision_tool_calls INTEGER DEFAULT 0,
  total_agent_spawns INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active'
);
CREATE INDEX idx_sessions_project ON sessions(project_hash);
CREATE INDEX idx_sessions_started ON sessions(started_at);
CREATE INDEX idx_sessions_status ON sessions(status);

-- Tags (many-to-many)
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL DEFAULT 'manual',
  UNIQUE(session_id, tag)
);
CREATE INDEX idx_tags_tag ON tags(tag);
CREATE INDEX idx_tags_session ON tags(session_id);

-- Tool summaries (per-session per-tool aggregates)
CREATE TABLE tool_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  tool_name TEXT NOT NULL,
  call_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  total_duration_ms INTEGER DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  UNIQUE(session_id, tool_name)
);
CREATE INDEX idx_tool_summaries_session ON tool_summaries(session_id);

-- API calls (individual records for trend analysis)
CREATE TABLE api_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  timestamp TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  stop_reason TEXT
);
CREATE INDEX idx_api_calls_session ON api_calls(session_id);
CREATE INDEX idx_api_calls_timestamp ON api_calls(timestamp);

-- Agent activity
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  agent_id TEXT NOT NULL,
  agent_type TEXT,
  parent_session_id TEXT,
  model TEXT,
  spawned_at TEXT NOT NULL,
  completed_at TEXT,
  total_tokens INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  exit_code INTEGER,
  UNIQUE(session_id, agent_id)
);
CREATE INDEX idx_agents_session ON agents(session_id);

-- Sync state (tracks which JSONL files have been processed)
CREATE TABLE sync_state (
  jsonl_path TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  last_offset INTEGER DEFAULT 0,
  last_synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 3. Phased Implementation Plan

### Phase 0: Global DB Foundation
**Priority:** Critical (blocks everything)
**Estimated files:** 5 new, 3 modified
**Dependencies:** None

**What:** Create the global analytics directory, SQLite database, and initialization infrastructure.

**New files:**
- `src/data/global-db.ts` -- Global SQLite database manager (init, migrations, CRUD)
- `src/data/db-schema.ts` -- SQL schema definitions, migration logic
- `src/data/db-init.ts` -- Directory creation, integrity checks, first-run setup

**Modified files:**
- `src/config.ts` -- Add `global_db_path` and `jsonl_base_path` defaults, load from global location
- `src/types.ts` -- Add new types (GlobalSession, TagEntry, etc.), rename config fields
- `src/index.ts` -- Pass global DB path to engine initialization

**Details:**
- Global path: `~/.claude/.goodvibes/analytics/analytics.db`
- Directory ensured by: engine startup, SessionStart hook, setup hook
- Uses sql.js (WASM) for bundleability (per decision `dec_20260219_003000`)
- WAL mode for concurrent reads (mini dashboard + MCP server)
- Schema versioning with migration support for future changes

**Rationale:** Everything depends on the global DB existing. Can't fix data pipeline, tags, cross-project, or sync without it.

---

### Phase 1: JSONL Reader & Watcher
**Priority:** Critical (blocks live data flow)
**Estimated files:** 3 new, 2 modified
**Dependencies:** Phase 0

**What:** Build the JSONL parser and live file watcher that provides the missing data source.

**New files:**
- `src/data/jsonl-reader.ts` -- Parse session JSONL files, extract structured records
- `src/data/jsonl-watcher.ts` -- Tail active JSONL file for real-time updates, emit parsed records

**Modified files:**
- `src/data/index.ts` -- Export new readers
- `src/daemon/watcher.ts` -- Add `jsonl-change` event, integrate JSONLWatcher

**Details:**
- JSONL format: Each line is a JSON object. Actual record types (VERIFIED): `assistant`, `user`, `progress`, `file-history-snapshot`
- **IMPORTANT**: The JSONLReader MUST be built against the actual format, NOT the originally assumed format (which had `api_request`, `api_response`, `tool_use`, `agent_spawn`, `agent_complete`, `system` types -- these do NOT exist)
- Parser must handle:
  - `assistant` records: extract `message.usage` (input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cache_creation.ephemeral_*), `message.content` tool_use blocks, `message.model`, `requestId`
  - `user` records: extract `message.content` tool_result blocks (matched to tool_use by `tool_use_id`); plain string content = human turn
  - `progress` records: extract MCP tool timing from `data.elapsedTimeMs` (precision tool performance); `data.serverName` and `data.toolName` identify the tool
  - `file-history-snapshot` records: skip (or use for file tracking if needed)
- Agent spawns are inferred from `assistant` records containing `tool_use` blocks with `name === 'Task'`; NOT from explicit agent records
- `cost_usd` is NOT present in JSONL -- always calculate from token counts + configured rates
- Watcher uses `fs.watch` + polling fallback (same pattern as existing DataWatcher)
- Active JSONL identified by: most recently modified `.jsonl` in `~/.claude/projects/<current-project>/`
- Subagent JSONL files live at `<session-id>/subagents/agent-<id>.jsonl`; attributed to parent session
- Incremental parsing: track file offset to avoid re-reading entire file on each change
- Backpressure: batch parsed records and emit at configurable interval (default: 1s)

**JSONL discovery logic:**
```
1. Read CLAUDE_PROJECT env var or detect from cwd
2. Resolve to ~/.claude/projects/<project-hash>/
3. Find most recently modified *.jsonl file
4. That's the active session JSONL
5. Session ID = filename without .jsonl extension
```

**Rationale:** This is the primary data source for everything the analytics engine should track. Without it, all metrics remain precision-engine-only.

---

### Phase 2: Aggregator Rework
**Priority:** Critical (bridges data to consumers)
**Estimated files:** 0 new, 3 modified
**Dependencies:** Phase 0, Phase 1

**What:** Rewire the Aggregator to merge JSONL data with precision telemetry and write to global DB.

**Modified files:**
- `src/daemon/aggregator.ts` -- Major rework: integrate JSONLReader, merge data sources, write to global DB, fix session ID resolution
- `src/daemon/watcher.ts` -- Wire `jsonl-change` events to aggregator refresh
- `src/daemon/anomaly-detector.ts` -- Update rules to accept JSONL-sourced metrics (no structural change, just input data)

**Details:**
- Session ID resolution: derive from active JSONL filename, not stale `current_session.json`
- `aggregate()` merges:
  - JSONL records -> API tokens, native tool calls, agent activity
  - Precision telemetry -> cache stats, precision-specific metrics, rollbacks
  - Global DB -> historical context for anomaly detection
- `buildAgentProfiles()` now populated from JSONL agent spawn/complete records
- `buildFileHotspots()` now uses JSONL tool_use records (Read/Write/Edit targets)
- Cost calculation uses actual API response `cost_usd` when available, falls back to config rates
- Budget tracker receives real cost data instead of precision-only estimates
- Config becomes mutable via a `reloadConfig()` method for hot-reload
- Aggregator writes session summaries to global DB on each refresh cycle (debounced)

**Rationale:** The aggregator is the central hub. Once it has both data sources and writes to global DB, all downstream consumers get real data.

---

### Phase 3: Tag System Rework
**Priority:** High (blocks cross-session features)
**Estimated files:** 1 new, 3 modified
**Dependencies:** Phase 0

**What:** Replace in-memory single-tag system with persistent multi-tag arrays backed by global DB.

**New files:**
- `src/data/tag-store.ts` -- CRUD operations for tags table in global DB

**Modified files:**
- `src/handlers/tag.ts` -- Complete rewrite: multi-tag, add/remove/list/auto, persist to DB
- `src/schemas/tools.ts` -- Update AnalyticsTagInput schema for new actions
- `src/daemon/session-archiver.ts` -- Read tags from DB instead of module-level vars

**Details:**
- Actions: `add`, `remove`, `list`, `auto` (replaces `tag`/`rename`)
- Multiple tags per session (stored in `tags` table)
- `auto` action: reads session JSONL, uses heuristics to infer tags:
  - Technology detection: scan tool_use inputs for framework/language patterns
  - Domain inference: analyze file paths and conversation content
  - Returns suggested tags, user confirms
- Tags persist immediately to global DB (no more volatile module-level state)
- `clearTagState()` removed (no module-level state to clear)
- Tag queries: filter sessions by tag, list all tags with session counts

**Rationale:** Tags are the foundation for cross-session filtering and grouping. Must be persistent and multi-valued before cross-project features work.

---

### Phase 4: Handler & Schema Updates
**Priority:** High (user-facing API changes)
**Estimated files:** 1 new, 7 modified
**Dependencies:** Phase 0, Phase 2, Phase 3

**What:** Update all MCP tool handlers and schemas to support new data, scoping, and nomenclature.

**New files:**
- `src/handlers/sync.ts` -- New handler for `analytics_sync` tool

**Modified files:**
- `src/schemas/tools.ts` -- Add `analytics_sync` schema, update all schemas for new fields
- `src/handlers/index.ts` -- Register sync handler, update exports
- `src/handlers/query.ts` -- Support cross-project scope, tag filtering, real data
- `src/handlers/export.ts` -- Cross-project scope, tag-based filtering, improved CSV/markdown
- `src/handlers/budget.ts` -- Read from real cost data (JSONL-sourced)
- `src/handlers/dashboard.ts` -- Rename `full` -> `dashboard`, add toggle logic, fix paths
- `src/handlers/config.ts` -- Rename config keys, global config location, hot-reload

**New tool: `analytics_sync`**
```typescript
const AnalyticsSyncInput = z.object({
  scope: z.enum(['current', 'all']).default('current'),
  // 'current' = current project's JSONL files
  // 'all' = ALL projects across ~/.claude/projects/
});
```

**Schema changes:**
- `AnalyticsDashboardInput`: rename `target` values (`full` -> `dashboard`), add toggle semantics
- `AnalyticsQueryInput`: add `scope` as QueryScope, add `tags` filter
- `AnalyticsExportInput`: add `tags` filter, cross-project scope
- `AnalyticsTagInput`: change `action` to `add | remove | list | auto`
- Remove `stop` action from dashboard (toggle handles it)

**Dashboard handler toggle logic:**
```
if target is running -> stop it (toggle off)
if target is stopped -> start it (toggle on)
return new state
```

**Rationale:** Handlers are the MCP API surface. They must reflect the new data model and nomenclature before UI can be updated.

---

### Phase 5: Dashboard & TUI Updates
**Priority:** Medium (visual layer)
**Estimated files:** 2 new, 8 modified
**Dependencies:** Phase 2, Phase 4

**What:** Update mini dashboard, rename full TUI to dashboard, add cross-project views.

**New files:**
- `src/tui/full/pages/cross-project.tsx` -- New page for cross-project analytics view
- `src/dashboard.ts` -- Renamed entry point (from `full.ts`)

**Modified files:**
- `src/tui/mini/renderer.ts` -- Show real metrics (API tokens, cost, agents), not just precision data
- `src/tui/full/app.tsx` -- Add 4th page (cross-project), update navigation
- `src/tui/full/pages/session-overview.tsx` -- Show merged metrics
- `src/tui/full/pages/historical.tsx` -- Pull from global DB, show cross-session trends
- `src/tui/full/pages/activity-hotspots.tsx` -- Show JSONL-sourced file activity
- `src/mini.ts` -- No structural change, but verify config renames
- `src/full.ts` -- Rename to `dashboard.ts`, update config references
- `build.mjs` -- Update entry points (`full.ts` -> `dashboard.ts`, output `dashboard.mjs`/`dashboard.cjs`)

**Mini dashboard changes:**
- Show actual API token count and cost (not just precision tokens)
- Show active agent count from JSONL data
- Show session cost in dollars prominently
- Keep it lightweight (< 4 lines)

**Full TUI (dashboard) changes:**
- Page 4: Cross-Project view showing spend by project, trends over time
- Historical page pulls from global DB instead of per-project JSON archives
- Agent profiles page populated with real JSONL data
- Tag display on session overview

**Rationale:** UI can only show what the data layer provides. This phase comes after data is flowing correctly.

---

### Phase 6: Sync & History Backfill
**Priority:** Medium (enables historical analytics)
**Estimated files:** 2 new, 2 modified
**Dependencies:** Phase 1, Phase 4

**What:** Implement the `sync` command for backfilling historical session data from JSONL files.

**New files:**
- `src/data/sync-engine.ts` -- Orchestrates JSONL scanning, parsing, and DB insertion
- `src/data/jsonl-scanner.ts` -- Discovers all JSONL files across `~/.claude/projects/`

**Modified files:**
- `src/handlers/sync.ts` -- Wire sync handler to sync engine
- `src/data/global-db.ts` -- Add batch insert methods for sync

**Details:**
- `sync current`: Scan current project's `~/.claude/projects/<hash>/` directory
- `sync all`: Scan ALL `~/.claude/projects/*/` directories
- Incremental: `sync_state` table tracks last processed offset per JSONL file
- Subagent attribution: Subagent JSONL files (identified by naming convention) linked to parent session
- Progress reporting: Returns count of sessions/records processed
- Idempotent: Re-running sync skips already-processed data
- Handles missing data gracefully (older JSONL formats may lack some fields)

**Rationale:** Sync is user-invoked, not automatic. It backfills the global DB with historical data that the live watcher can't provide.

---

### Phase 7: Slash Command & Config Cleanup
**Priority:** Medium (user-facing CLI)
**Estimated files:** 0 new, 3 modified
**Dependencies:** Phase 4

**What:** Update the slash command and configuration to match new nomenclature and features.

**Modified files:**
- `plugins/goodvibes/commands/analytics.md` -- Complete rewrite for new subcommands
- `src/config.ts` -- Global config location, renamed keys, hot-reload support
- `src/types.ts` -- Final cleanup of deprecated fields

**Slash command changes:**
```
/goodvibes:analytics                    # Session summary (real data)
/goodvibes:analytics status             # Meaningful analytics (not dashboard state)
/goodvibes:analytics mini               # Toggle mini dashboard
/goodvibes:analytics dashboard          # Toggle full dashboard
/goodvibes:analytics budget <amount>    # Set budget
/goodvibes:analytics budget             # Check budget
/goodvibes:analytics budget clear       # Clear budget
/goodvibes:analytics export [format]    # Export with cross-project/tag support
/goodvibes:analytics tag add <name>     # Add tag
/goodvibes:analytics tag remove <name>  # Remove tag
/goodvibes:analytics tag list           # List tags
/goodvibes:analytics tag auto           # Auto-tag from JSONL
/goodvibes:analytics sync               # Sync current project
/goodvibes:analytics sync all           # Sync all projects
/goodvibes:analytics config [key] [val] # Get/set config
```

**Removed subcommands:** `stop` (toggle handles it), `tag rename` (replaced by add/remove)

**Config renames:**
- `auto_start_full` -> `auto_start_dashboard`
- `full_tui_refresh_rate_ms` -> `dashboard_refresh_rate_ms`
- `tmux.full_pane_size` -> `tmux.dashboard_pane_size`
- `tmux.full_position` -> `tmux.dashboard_position`
- Remove `historical_sessions`

**Rationale:** User-facing changes should come after internal data flow is correct.

---

### Phase 8: Hook Integration
**Priority:** Low (setup automation)
**Estimated files:** 0 new, 2 modified
**Dependencies:** Phase 0

**What:** Update hooks to ensure global analytics directory exists and is initialized.

**Modified files:**
- Hook scripts in `plugins/goodvibes/hooks/scripts/src/session-start/` -- Ensure `~/.claude/.goodvibes/analytics/` exists
- Hook scripts in `plugins/goodvibes/hooks/scripts/src/session-end/` -- Trigger session archival to global DB

**Details:**
- SessionStart: `mkdir -p ~/.claude/.goodvibes/analytics/` + verify DB integrity
- SessionEnd: Signal analytics engine to archive current session
- Lightweight checks only -- no heavy operations in hooks

**Rationale:** Hooks ensure the infrastructure exists regardless of how the user starts a session.

---

## 4. Phase Ordering Rationale

```
Phase 0 (Global DB) ─────────────────────────────────────────────────────┐
    |                                                                     |
Phase 1 (JSONL Reader) ──────────────────────────────┐                   |
    |                                                  |                  |
Phase 2 (Aggregator Rework) ──── depends on 0,1 ─────┤                  |
    |                                                  |                  |
Phase 3 (Tag System) ──── depends on 0 ──────────────┤                  |
    |                                                  |                  |
Phase 4 (Handlers) ──── depends on 0,2,3 ────────────┤                  |
    |                                                  |                  |
Phase 5 (TUI) ──── depends on 2,4 ───────────────────┤                  |
    |                                                  |                  |
Phase 6 (Sync) ──── depends on 1,4 ──────────────────┤                  |
    |                                                  |                  |
Phase 7 (Slash Command) ──── depends on 4 ───────────┘                  |
    |                                                                     |
Phase 8 (Hooks) ──── depends on 0 ───────────────────────────────────────┘
```

**Why this order:**

1. **Phase 0 first**: The global DB is the foundation. Every other phase reads from or writes to it. Nothing can store cross-project data, persist tags, or track sync state without it.

2. **Phase 1 before Phase 2**: The aggregator can't merge JSONL data if the reader doesn't exist. Building the reader independently lets us test JSONL parsing in isolation.

3. **Phase 2 is the critical junction**: Once the aggregator merges both data sources and writes to global DB, everything downstream gets real data. This is the single most impactful phase.

4. **Phase 3 parallel with Phase 1**: Tag system only needs Phase 0 (global DB). Can be developed in parallel with JSONL reader to parallelize work across engineers.

5. **Phase 4 after 2 and 3**: Handlers are the MCP interface. They need the aggregator to return real data and the tag system to support multi-tag operations before they can be updated.

6. **Phase 5 after 4**: TUI consumes DashboardState and handler responses. It's pure presentation -- must wait for data to be correct.

7. **Phase 6 after 1 and 4**: Sync reuses the JSONL reader (Phase 1) and needs the sync handler registered (Phase 4). Can run in parallel with Phase 5.

8. **Phase 7 and 8 are leaf nodes**: Slash command is documentation of the API. Hooks are infrastructure automation. Both can come last.

**Parallelizable batches:**
- Batch A: Phase 0 (solo, must complete first)
- Batch B: Phase 1 + Phase 3 (parallel after Phase 0)
- Batch C: Phase 2 (after Batch B)
- Batch D: Phase 4 (after Phase 2 + Phase 3)
- Batch E: Phase 5 + Phase 6 + Phase 7 (parallel after Phase 4)
- Batch F: Phase 8 (anytime after Phase 0, low priority)

---

## 5. Migration Strategy

### Per-Project to Global DB Transition

**Approach: Additive migration, no destructive changes.**

1. **Phase 0**: Create global DB at `~/.claude/.goodvibes/analytics/analytics.db` with empty schema.

2. **Phase 2**: Aggregator writes NEW data to global DB. Old per-project data in `.goodvibes/telemetry/history/` remains untouched.

3. **Phase 6 (Sync)**: User runs `/goodvibes:analytics sync all` to backfill global DB from existing JSONL files. This is the "migration" step.

4. **No data deletion**: Per-project files (`.goodvibes/telemetry/`, `.goodvibes/analytics.json`) are left in place. They become read-only fallbacks.

5. **Config migration**: On first load, if global config doesn't exist but per-project `analytics.json` does, copy and adapt it.

**What old data we lose:**
- Per-project JSON session archives (`.goodvibes/telemetry/history/*.json`) are NOT automatically imported. The sync command rebuilds from JSONL which is more complete.
- Precision-engine-specific telemetry.db data is already in the global DB via the live pipeline.

**What we preserve:**
- All JSONL data (it's the source of truth)
- All precision-engine telemetry (still written to telemetry.db, still read by TelemetryReader)
- Config settings (migrated to global location)

### Backward Compatibility

- `TelemetryReader` continues to work unchanged -- it reads per-project telemetry.db
- `SessionReader` continues to work for per-project session state files
- Handlers that previously returned zeros now return real data (non-breaking)
- MCP tool schemas are extended (new optional fields), not changed (existing fields preserved)
- `full` target in dashboard handler accepted as alias for `dashboard` during transition

---

## 6. Risk Assessment

### R1: JSONL Format Instability
- **Probability:** Medium
- **Impact:** High
- **Description:** Claude's JSONL format is not a documented public API. It could change between Claude versions.
- **Mitigation:** Build a defensive parser with version detection. Unknown record types are logged and skipped, not fatal. Wrap all JSONL parsing in try/catch per-line. Include a `jsonl_format_version` field in sync_state.
- **Contingency:** If format changes radically, the sync engine gets a new parser branch. Live watcher can be disabled until parser is updated.

### R2: Global DB Corruption
- **Probability:** Low
- **Impact:** High
- **Description:** SQLite corruption from concurrent writes (mini dashboard + MCP server + sync).
- **Mitigation:** WAL mode (supports concurrent readers), single-writer pattern (only the MCP server writes; mini/full dashboards read-only). sql.js handles concurrent access via file-level locking.
- **Contingency:** Integrity check on startup. If corrupted, rebuild from JSONL files via sync.

### R3: Performance with Large JSONL Files
- **Probability:** Medium
- **Impact:** Medium
- **Description:** Long sessions produce large JSONL files. Full-file parsing during sync could be slow.
- **Mitigation:** Incremental parsing with offset tracking (sync_state table). Live watcher only reads new lines (tail behavior). Batch DB inserts with transactions.
- **Contingency:** Add configurable `max_jsonl_size_mb` to skip extremely large files with a warning.

### R4: Breaking Existing Precision Telemetry
- **Probability:** Low
- **Impact:** Medium
- **Description:** Changes to the aggregator could break existing precision-engine telemetry flow.
- **Mitigation:** TelemetryReader is untouched. New data sources are additive. Aggregator changes are in merge logic, not in reader code. The existing `telemetry.db` read path is preserved as-is.
- **Contingency:** Feature flag to disable JSONL merging and fall back to precision-only mode.

### R5: Mini Dashboard Memory/CPU in Tmux
- **Probability:** Low
- **Impact:** Medium
- **Description:** Adding JSONL watching to mini dashboard could increase resource usage.
- **Mitigation:** Mini dashboard does NOT watch JSONL directly. It reads from the Aggregator which runs in the MCP server process. Mini is a pure renderer that polls state at `refresh_rate_ms` intervals.
- **Contingency:** Reduce polling frequency, simplify render output.

### R6: Cross-Project Path Resolution
- **Probability:** Medium
- **Impact:** Low
- **Description:** `~/.claude/projects/` uses hashed directory names. Resolving hash -> project path may not always work.
- **Mitigation:** Store `project_path` when available (from env vars or config). Hash-only fallback is acceptable for display. Include project hash as a stable identifier.
- **Contingency:** Let users manually tag projects for readable identification.

### R7: Auto-Tagging Quality
- **Probability:** Medium
- **Impact:** Low
- **Description:** Heuristic-based auto-tagging may produce irrelevant or generic tags.
- **Mitigation:** Auto-tagging is user-invoked, not automatic. Returns suggestions that user confirms. Start with high-confidence heuristics (file extensions, package.json dependencies, explicit framework usage).
- **Contingency:** Improve heuristics iteratively based on usage feedback.

### Risk Matrix

| Risk | Probability | Impact | Score | Action |
|------|-------------|--------|-------|--------|
| R1: JSONL Format | M | H | 6 | Defensive parser, version detect |
| R2: DB Corruption | L | H | 4 | WAL mode, single-writer, integrity check |
| R3: Large JSONL | M | M | 4 | Incremental parsing, offset tracking |
| R4: Break Telemetry | L | M | 2 | Additive changes only |
| R5: Mini Resources | L | M | 2 | Renderer-only, no direct JSONL access |
| R6: Path Resolution | M | L | 2 | Hash fallback, manual tagging |
| R7: Auto-Tag Quality | M | L | 2 | User-confirms, iterative improvement |

---

## 7. File-Level Change Summary

### New Files (11 total)

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `src/data/global-db.ts` | Global SQLite DB manager |
| 0 | `src/data/db-schema.ts` | Schema definitions, migrations |
| 0 | `src/data/db-init.ts` | Directory + DB initialization |
| 1 | `src/data/jsonl-reader.ts` | JSONL file parser |
| 1 | `src/data/jsonl-watcher.ts` | Live JSONL file tailer |
| 3 | `src/data/tag-store.ts` | Tag CRUD operations |
| 4 | `src/handlers/sync.ts` | Sync tool handler |
| 5 | `src/tui/full/pages/cross-project.tsx` | Cross-project analytics page |
| 5 | `src/dashboard.ts` | Renamed entry point |
| 6 | `src/data/sync-engine.ts` | Sync orchestration |
| 6 | `src/data/jsonl-scanner.ts` | JSONL file discovery |

### Modified Files (18 total)

| Phase | File | Change |
|-------|------|--------|
| 0 | `src/types.ts` | New types, config renames, expanded TokenMetrics |
| 0 | `src/config.ts` | Global config path, new defaults |
| 0 | `src/index.ts` | Pass global DB path |
| 1 | `src/data/index.ts` | Export new readers |
| 1 | `src/daemon/watcher.ts` | Add `jsonl-change` event |
| 2 | `src/daemon/aggregator.ts` | Major: merge JSONL + telemetry, write global DB |
| 2 | `src/daemon/anomaly-detector.ts` | Accept JSONL-sourced inputs |
| 3 | `src/handlers/tag.ts` | Complete rewrite: multi-tag, DB-backed |
| 3 | `src/schemas/tools.ts` | Update tag schema, add sync schema |
| 3 | `src/daemon/session-archiver.ts` | Read tags from DB |
| 4 | `src/handlers/index.ts` | Register sync handler |
| 4 | `src/handlers/query.ts` | Cross-project scope |
| 4 | `src/handlers/export.ts` | Tag filtering, cross-project |
| 4 | `src/handlers/budget.ts` | Real cost data |
| 4 | `src/handlers/dashboard.ts` | Rename full -> dashboard, toggle |
| 4 | `src/handlers/config.ts` | Renamed keys, global location |
| 5 | `src/tui/mini/renderer.ts` | Real API metrics |
| 5 | `build.mjs` | Update entry points |

### Deleted Files (1)

| Phase | File | Reason |
|-------|------|--------|
| 5 | `src/full.ts` | Replaced by `src/dashboard.ts` |

---

## 8. Success Criteria

- [ ] Mini dashboard shows real token counts and cost during a session
- [ ] Full TUI (dashboard) shows merged API + precision metrics
- [ ] `/goodvibes:analytics` returns non-zero metrics for active sessions
- [ ] Tags persist across session restarts
- [ ] Multiple tags can be applied to a single session
- [ ] `/goodvibes:analytics sync all` backfills historical sessions
- [ ] Cross-project analytics visible in dashboard
- [ ] Budget tracker uses real API cost data
- [ ] Anomaly detection fires on real metrics
- [ ] Config renames applied consistently
- [ ] Toggle behavior works for mini and dashboard
- [ ] Existing precision-engine telemetry continues to work
- [ ] Build succeeds with `node build.mjs`
- [ ] MCP server starts and responds to all 7 tools

---

## 9. Resolved Decisions (formerly Open Questions)

1. **JSONL format**: RESOLVED. Actual format verified and documented in Section 2. Record types are: `assistant`, `user`, `progress`, `file-history-snapshot`. Token usage is in `assistant.message.usage`. There is no `cost_usd` field -- must be calculated. Tool calls are embedded in `assistant.message.content` as `{type: 'tool_use'}` blocks. Tool results are in `user.message.content` as `{type: 'tool_result'}` blocks. The types originally documented (`api_request`, `api_response`, `tool_use` as top-level records, `agent_spawn`, `agent_complete`, `system`) do NOT exist.

2. **Budget enforcement**: RESOLVED. Informational only. Shows warnings at configured thresholds but never blocks tool calls or halts operation. User decides when to stop based on warnings.

3. **Auto-tagging implementation**: RESOLVED. Hybrid approach. Local heuristics first (regex + file analysis + `package.json` dependencies). Escalate to `precision_agent` (not Claude API directly) for higher quality tag suggestions when heuristic confidence is low. User always confirms before tags are applied.

4. **Status subcommand content**: RESOLVED. Split approach: `status` shows health + anomalies + budget alerts. No-args summary shows full session metrics (tokens, cost, tools, agents). These are distinct views serving different needs.

5. **Config hot-reload mechanism**: RESOLVED. Both mechanisms. File watcher auto-reloads global config on change (debounced 1s). Additionally expose an explicit `config reload` command for forced refresh. File watcher handles the common case; explicit command handles edge cases where watcher misses events.
