# Analytics Slash Command Updates

Collected requirements for `/goodvibes:analytics` rework.

## Changes

### 1. `mini` — Toggle behavior
- If mini dashboard is running, close it
- If mini dashboard is closed, open it
- No separate "stop" needed

### 2. `dashboard` — Full TUI (renamed from `full`)
- `full` subcommand is renamed to `dashboard`
- Toggle behavior: if running, close it; if closed, open it
- `dashboard` is NOT an alias for `mini` (old behavior removed)

### 3. `stop` subcommand — Removed
- No `stop` verb. Toggling handles open/close.
- "stop" implies something is "going" — these are open/closed, not started/stopped

### 4. `status` — Show actual analytics, not dashboard state
- Current behavior is useless: tells you if mini/full are open, which you can already see
- Should show meaningful analytics info instead (session metrics, spend, health, etc.)
- Exact content TBD — needs to be distinct from no-args summary

### 6. Live token/cost tracking is broken — TWO issues
**Bug:** Mini dashboard shows zeros even for precision_engine tool calls
- `telemetry.db` IS being written to (confirmed modified during session)
- `current_session.json` is 3 weeks stale (from 2026-02-03)
- Likely session_id mismatch: dashboard queries by session but can't find current data
- Root cause needs investigation in how mini dashboard aggregator reads from DB

**Design gap:** Analytics scope is too narrow
- Currently only tracks precision_engine tool calls via telemetry hooks
- Should track EVERYTHING: Claude API tokens (conversation turns), native tool calls, precision tool calls, agent spawns, all activity
- The session JSONL (`~/.claude/projects/<project>/<session-id>.jsonl`) contains all of this data
- Need to watch the JSONL in real-time (tail/poll) for live tracking
- This is related to sync (#8) — sync does historical backfill, live tracking needs the watcher to tail the JSONL
- Precision-engine-specific metrics (cache hit rate, rollbacks, etc.) are a subset, not the whole picture

### 7. Budget is informational-only, no enforcement
- BudgetTracker computes usage percentage and warns at thresholds (50%, 80%, 100%)
- Does NOT stop or pause a session when budget is exceeded
- Even the informational part is broken because it reads from the same empty metrics pipeline
- Needs discussion: should budget enforcement actually halt/warn, or just inform?
- Also uses `metrics.cost.total` which only counts precision-engine — same scope problem as #6

### 8. Tags — complete rework
- Tags are NOT session names (Claude has native session renaming)
- Tags enable advanced analytics — filter/group/aggregate sessions by tag
- Multiple tags per session
- User-creatable: `/goodvibes:analytics tag <name>` adds a tag
- User-modifiable: can add/remove tags freely
- Auto-tagging: `/goodvibes:analytics tag auto` — Claude reads the session JSONL and infers tags
  - Identifies technologies used (nextjs, react, python, etc.)
  - Identifies the DOMAIN and PURPOSE, not just the category
  - Descriptive tags that capture what the project actually does
  - Example: a multi-tenant revenue ops analytics SaaS → `revops`, `analytics`, `multi-tenant`, `nextjs`, `stripe`
  - NOT generic labels like `saas` or `component` — those are too vague to be useful
- Remove old `tag rename` subcommand (tags aren't session names)
- Need: `tag list`, `tag add <name>`, `tag remove <name>`, `tag auto`

### 9. Cross-session, cross-project analytics
- Analytics should be CUMULATIVE across all projects and all sessions
- Current project/session is just one filter view, not the whole picture
- Tags feed into the full dashboard (not mini) and are filterable
- Selecting tags filters analytics to only sessions with those tags
- Dedicated views: current session, current project, all projects
- The real value is cross-session analytics — trends, spend over time, patterns across projects
- This fundamentally changes the data model: analytics DB needs to be global, not per-project

### 10. Global analytics directory setup & initialization
- Analytics files/folders move to `~/.claude/.goodvibes/analytics/`
- Creation handled by:
  - Setup hook (first install)
  - SessionStart hook (if missing/deleted)
  - Analytics engine startup (if missing/deleted)
- A few integrity checks at initialization time, then get out of the way
- No continuous polling for directory existence — check on init, trust it after that

### 11. Config renames & cleanup
- `auto_start_full` → `auto_start_dashboard` (matches #2 rename)
- `full_tui_refresh_rate_ms` → `dashboard_refresh_rate_ms`
- `tmux.full_pane_size` → `tmux.dashboard_pane_size`
- `tmux.full_position` → `tmux.dashboard_position`
- Remove `historical_sessions` — Claude has its own session cleanup, don't duplicate
- Config needs to move to global location (per #9 cross-project)
- Hot-reload: config changes should take effect immediately, not require restart

### 12. `sync` — Session history parsing
- `/goodvibes:analytics sync` — sync current project's JSONL files and subagent files
- `/goodvibes:analytics sync all` — sync ALL sessions and ALL subagents across every project
- Backfills analytics with historical data (tokens, cost, commands, agents, files)
- Some metrics won't be available retroactively (e.g. goodvibes cache hit rate) — acceptable
- New projects get full tracking from the start
- Not automatic — user must invoke it
- Subagent JSONL files should be parsed and attributed to their parent session

### 13. `export` — Needs cross-project & tag support
- Currently works but exports zeros (broken pipeline)
- Needs cross-session scope (not just `current` / `historical` / `session:<id>`)
- Needs tag-based filtering: export all sessions tagged `nextjs`
- Needs cross-project scope: export across all projects
- CSV renderer is crude (JSON-encodes nested objects into cells)
- Markdown renderer is basic tables, no visual formatting
- HistoricalStore archiving may not be working (untested)

### 14. No-args summary — needs real data
- Currently calls `analytics_query` with `scope: all` — returns zeros
- Once pipeline is fixed, should work as-is
- Consider: should this show current session only, or include cross-project context?

## Foundational Fixes (required before features work)

These are systemic issues across the codebase that block ALL new features.

### F1. Data pipeline — read session JSONL, not just telemetry.db
- **Aggregator** builds DashboardState from TelemetryReader + SessionReader + IndexReader — all precision-engine-only
- Must add a JSONL reader that parses `~/.claude/projects/<project>/<session-id>.jsonl` for Claude API tokens, native tool calls, agent spawns, everything
- **DataWatcher** only watches `.goodvibes/telemetry/` — needs to also watch the session JSONL (new `jsonl-change` event)
- `current_session.json` is 3 weeks stale — session ID mismatch causes all queries to return zeros
- Session ID resolution needs to be reliable: derive from the active JSONL file, not stale JSON

### F2. Global DB — move from per-project to `~/.claude/.goodvibes/analytics/`
- **HistoricalStore** saves archives to `.goodvibes/telemetry/history/` (per-project)
- **Config** persists to `.goodvibes/analytics.json` (per-project)
- **MemoryUpdater** writes to `.goodvibes/memory/` (per-project)
- All need a global location for cross-project analytics
- Per-project data should still exist as a filtered view, not a separate store

### F3. Aggregator stubs & gaps
- `buildAgentProfiles()` returns empty array `[]` — stub, never implemented
- `buildFileHotspots()` only sees precision telemetry, not actual file activity from JSONL
- Config is immutable after construction — no hot-reload
- `aggregate()` needs to merge JSONL data with precision telemetry data

### F4. Tag system — in-memory only, single tag
- `_currentTag` / `_currentName` are module-level variables — lost on crash
- Single tag per session — needs multi-tag array
- No disk persistence during session — only saved on archive
- `tagSession()` / `renameSession()` in HistoricalStore are single-value

### F5. Dashboard handler — hardcoded `full` references
- `buildCommand()` builds path to `full.mjs` — needs rename to `dashboard.mjs`
- No toggle logic — only start/stop/status actions
- Status action reports alive/dead — useless, needs real analytics
- `_manager` singleton uses `DEFAULT_CONFIG.tmux` — not hot-reloadable

### F6. Anomaly rules — narrow data source
- 6 rules (cache degradation, error spike, token burn, build regression, conflict storm, agent stall)
- All query TelemetryReader — precision-engine only
- `tokenBurnRule` checks token rate from wrong data source
- Rules are well-structured — just need JSONL-sourced data input

### F7. Export — limited scope
- No tag-based filtering
- No cross-project export
- CSV/markdown renderers are basic
- HistoricalStore archiving reliability is unverified

### F8. Report generator — solid but starved
- 9-section markdown report generator is well-implemented
- Completely dependent on DashboardState — which is empty/zeros
- Will work once F1 is fixed
- Writes to `.goodvibes/logs/` — needs global path option for cross-project

## Status

Requirements collection complete. Ready for architecture planning.
