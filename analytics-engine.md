# Analytics Engine — Session Intelligence Daemon & MCP Server

A daemon process that observes precision-engine v3's persisted data and surfaces session intelligence through live dashboards, auto-reports, and a minimal set of MCP tools. It is **transparent to the orchestrator** — the orchestrator builds, the analytics engine observes and reports.

## Design Principles

1. **Make the invisible visible.** Precision-engine saves tokens silently. Analytics-engine shows how much, where, and what patterns emerge.
2. **Zero orchestrator burden.** The orchestrator never calls analytics tools during normal operation. Data collection is automatic, visualization is automatic, reporting is automatic.
3. **Daemon, not a toolbox.** Analytics-engine is a background process that watches data files and renders dashboards. MCP tools exist only for explicit user requests.
4. **Read-only observer.** Analytics-engine never modifies precision-engine state. It only reads persisted data and computes aggregations.

---

## Architecture

\`\`\`
                    ┌─────────────────────┐
                    │   Orchestrator      │
                    │   (builds things)   │
                    └─────────────────────┘
                              │
                    precision_* tool calls
                              │
                              ▼
                    ┌─────────────────────┐
                    │  Precision Engine   │──── writes ──→ .goodvibes/
                    │  (MCP server)       │               ├── telemetry/telemetry.db
                    └─────────────────────┘               ├── state/session_*.json
                                                          ├── project-index.json
                                                          └── goodvibes.json
                                                                    │
                                                            watches (fs/poll)
                                                                    │
                              ┌──────────────────────────────────────┤
                              ▼                                      ▼
                    ┌──────────────────┐                   ┌──────────────────┐
                    │  Mini Dashboard  │                   │    Full TUI      │
                    │  (tmux pane)     │                   │  (tmux pane)     │
                    │  4 lines, live   │                   │  3 pages, live   │
                    └──────────────────┘                   └──────────────────┘
                              │                                      │
                    ┌─────────┴──────────────────────────────────────┘
                    ▼
          ┌─────────────────────┐
          │  Analytics Engine   │  ← single process powering both views
          │  (daemon)           │  ← reads data, computes aggregations
          │                     │  ← also an MCP server (6 tools, rarely called)
          └─────────────────────┘
                    │
                    ▼ (on shutdown)
          ┌─────────────────────┐
          │  Session Report     │──→ .goodvibes/logs/session-report-{id}.md
          │  Memory Updates     │──→ .goodvibes/memory/{patterns,preferences}.json
          │  Historical Archive │──→ .goodvibes/analytics/sessions/{id}.json
          └─────────────────────┘
\`\`\`

### Single Process, Three Roles

The analytics engine is one process that serves three functions:

1. **Daemon** — Watches precision-engine's data files (SQLite DB, JSON), computes aggregations, detects anomalies, tracks budgets.
2. **TUI Renderer** — Powers the mini dashboard (4-line tmux pane) and full TUI (3-page tmux pane).
3. **MCP Server** — Exposes 6 tools for explicit user queries (rarely called during normal operation).

### Data Sources

All data is read from precision-engine v3's persisted files. No shared memory, no IPC.

| Source | Location | Format | Contents |
|--------|----------|--------|----------|
| Telemetry DB | \`.goodvibes/telemetry/telemetry.db\` | SQLite | Every tool call: tool, status, tokens_in/out, cache_hit, cache_bytes_saved, duration_ms, error, metadata |
| Session State | \`.goodvibes/state/session_*.json\` | JSON | KV pairs: session.tokens_used, session.files_modified, session.commands_run, session.agents_spawned |
| Project Index | \`.goodvibes/project-index.json\` | JSON | File tree with token counts per file, type breakdowns, directory structure |
| Runtime Config | \`.goodvibes/goodvibes.json\` | JSON | Precision-engine settings, mode, cache config |
| Historical Sessions | \`.goodvibes/analytics/sessions/*.json\` | JSON | Archived session summaries (written by analytics-engine) |

---

## Mini Dashboard (Always-On)

A 4-line, 80-character-wide tmux pane that shows key session metrics at a glance. Auto-starts via session-start hook. Refreshes every 2 seconds.

\`\`\`
┌ analytics ─ abc1def2 ─ 47m ─ 234 calls ─ 96.2% ─────────────────┐
│ tokens 606K used │ 910K saved (\$2.28) │ cache 68% │ agents 3/6   │
│ files 142r 28w 2⚡│ cmds 47 (5✗ 8.1s avg) │ cost \$3.31          │
└──────────────────────────────────────────────────────────────────┘
\`\`\`

### Visual Indicators

- **Green border** — Session healthy (error rate < 10%, cache hit rate > 50%, within budget)
- **Yellow border** — Warning (error rate 10-25%, cache degradation, 80% of budget used)
- **Red border** — Alert (error rate > 25%, budget exceeded, critical anomaly)
- **⚡** — File conflicts detected
- **✗** — Command failures

### Metrics Displayed

| Position | Metric | Source |
|----------|--------|--------|
| Header | Session ID, uptime, total tool calls, success rate | Telemetry DB |
| Row 1 | Tokens used (in+out), tokens saved, dollar savings, cache hit rate, active agents | Telemetry DB + KVState |
| Row 2 | Files read/written, conflicts, commands run, failures, avg duration, net cost | Telemetry DB + KVState + FileStateCache |

### Budget Integration

When a budget is set, the mini dashboard adapts:

\`\`\`
┌ analytics ─ abc1def2 ─ 47m ─ budget: \$7.20/\$10.00 (72%) ────────┐
│ tokens 606K used │ 910K saved (\$2.28) │ cache 68% │ agents 3/6   │
│ files 142r 28w 2⚡│ cmds 47 (5✗ 8.1s avg) │ remaining: \$2.80    │
└──────────────────────────────────────────────────────────────────┘
\`\`\`

---

## Full TUI (3 Pages)

A multi-page terminal dashboard in a tmux pane. User navigates pages with keybinds (1/2/3 or left/right arrows). Refreshes every 5 seconds. Launched on demand via \`analytics_dashboard\` tool or keybind.

### Page 1 — Session Overview

Current session metrics at a glance.

\`\`\`
┌─ Session abc1def2 ─ Started 14:02 ─ Uptime 47m ───────────────────────────┐
│                                                                             │
│  TOKENS                    CACHE                    COST                    │
│  ┌──────────────────┐      ┌──────────────────┐     ┌──────────────────┐   │
│  │ Input:    482,000 │      │ Hit Rate:  68.0% │     │ Input:    \$1.45  │   │
│  │ Output:   124,000 │      │ Hits:        156 │     │ Output:   \$1.86  │   │
│  │ Total:    606,000 │      │ Misses:       73 │     │ Saved:    \$2.28  │   │
│  │ Saved:    910,000 │      │ Memory:  14/200M │     │ Net:      \$3.31  │   │
│  │ Efficiency: 1.50x │      │ Evictions:     0 │     │ Budget:   \$6.69  │   │
│  └──────────────────┘      └──────────────────┘     └──────────────────┘   │
│                                                                             │
│  COMMANDS (47)              AGENTS                   FILES                  │
│  ┌──────────────────┐      ┌──────────────────┐     ┌──────────────────┐   │
│  │ Success:      42  │      │ Spawned:     12  │     │ Read:    142 uniq│   │
│  │ Failed:        5  │      │ Active:       3  │     │ Modified:     28 │   │
│  │ Avg Time:   6.0s  │      │ Completed:    9  │     │ Created:      14 │   │
│  │ Total Time: 4m42s │      │ Avg Tokens: 48K  │     │ Conflicts:     2 │   │
│  │ Slowest: build    │      │ Most Active:     │     │ Hottest:         │   │
│  │   45.2s           │      │   engineer (5)   │     │   src/main.ts    │   │
│  └──────────────────┘      └──────────────────┘     └──────────────────┘   │
│                                                                             │
│  TOOLS BREAKDOWN                                                            │
│  precision_read  ████████████████████░░░  89 calls  │ 12ms avg │ 68% cache │
│  precision_edit  ██████████░░░░░░░░░░░░░  52 calls  │  8ms avg │           │
│  precision_exec  ████████░░░░░░░░░░░░░░░  47 calls  │ 6.0s avg │           │
│  precision_grep  ██████░░░░░░░░░░░░░░░░░  28 calls  │ 45ms avg │           │
│  precision_write █████░░░░░░░░░░░░░░░░░░  18 calls  │ 15ms avg │           │
│                                                                             │
│  [1] Overview    [2] Activity    [3] Historical           q: quit  ?: help  │
└─────────────────────────────────────────────────────────────────────────────┘
\`\`\`

**Data Sources:** Telemetry DB (\`getSummary()\`), KVState session counters, FileStateCache stats

### Page 2 — Activity & Hotspots

Live activity feed, file heatmap, agent breakdown, and recommendations.

\`\`\`
┌─ Activity & Hotspots ──────────────────────────────────────────────────────┐
│                                                                             │
│  RECENT ACTIVITY                                                            │
│  14:23:05  ⚡ CONFLICT  src/main.ts (v3 vs v5, agent-abc vs agent-ghi)     │
│  14:23:05  ✏  EDIT      src/main.ts +1 line (agent-ghi)                    │
│  14:23:03  📄 WRITE     src/new-file.ts 248 lines (agent-def)              │
│  14:23:01  ✏  EDIT      src/main.ts ~4 lines (agent-abc)                   │
│  14:22:58  ⚙  EXEC      npm run build → exit 0 (8.2s)                     │
│  14:22:45  📖 READ      src/types.ts (cache hit, saved 4K tokens)          │
│  14:22:40  🔍 GREP      "handleUser" → 12 files                            │
│  14:22:38  📖 READ      src/config.ts (miss, 2.4K tokens)                  │
│                                                                             │
│  FILE HOTSPOTS                         AGENT BREAKDOWN                      │
│  src/main.ts     ██████████████░ 12r 6w│  engineer   ████████████░ 142K tok │
│  src/utils.ts    ████████░░░░░░  8r 2w │  tester     ██████░░░░░░  68K tok │
│  src/types.ts    ██████░░░░░░░░  6r 0w │  reviewer   ████░░░░░░░░  45K tok │
│  src/config.ts   ████░░░░░░░░░░  4r 1w │  architect  ██░░░░░░░░░░  22K tok │
│  src/index.ts    ███░░░░░░░░░░░  3r 1w │                                   │
│                                                                             │
│  ANOMALIES & RECOMMENDATIONS                                                │
│  ⚡ src/main.ts: 12 reads — consider outline mode for navigation            │
│  ⚡ npm build: 45s avg across 4 runs — consider incremental builds          │
│  ⚠  Cache hit rate dropped from 78% to 52% in last 5 minutes               │
│  ✓  Agent utilization healthy (3/6 slots, no idle agents)                   │
│                                                                             │
│  [1] Overview    [2] Activity    [3] Historical           q: quit  ?: help  │
└─────────────────────────────────────────────────────────────────────────────┘
\`\`\`

**Data Sources:** Telemetry DB (recent records), FileStateCache (mod logs, read counts), KVState (agent counters)

### Page 3 — Historical & Trends

Cross-session comparison and project health.

\`\`\`
┌─ Historical & Trends ──────────────────────────────────────────────────────┐
│                                                                             │
│  CURRENT SESSION vs AVERAGES                                                │
│                          Current    Avg (10 sessions)    Delta              │
│  Tokens Used             606K       520K                 +16.5% ▲           │
│  Tokens Saved            910K       650K                 +40.0% ▲           │
│  Cache Hit Rate          68.0%      55.0%                +13.0% ▲           │
│  Command Success Rate    89.4%      92.0%                 -2.6% ▼           │
│  Avg Command Duration    6.0s       5.2s                 +15.4% ▲           │
│  Cost                    \$3.31      \$2.80                +18.2% ▲           │
│  Efficiency (saved/used) 1.50x      1.25x                +20.0% ▲           │
│                                                                             │
│  RECENT SESSIONS                                                            │
│  ┌────────┬──────────┬────────┬───────┬────────┬────────┬────────┐          │
│  │ ID     │ Date     │ Tokens │ Saved │ Cache% │ Cost   │ Tag    │          │
│  ├────────┼──────────┼────────┼───────┼────────┼────────┼────────┤          │
│  │ abc1de │ 02-20    │  606K  │  910K │  68.0% │  \$3.31 │ current│          │
│  │ 9f2e31 │ 02-19    │  482K  │  620K │  58.2% │  \$2.71 │ refact │          │
│  │ 7a1c82 │ 02-19    │  310K  │  445K │  62.1% │  \$1.85 │        │          │
│  │ 5d3b49 │ 02-18    │  890K  │ 1.2M  │  71.3% │  \$4.92 │ feature│          │
│  │ 2e8f10 │ 02-18    │  245K  │  320K │  48.9% │  \$1.42 │ bugfix │          │
│  └────────┴──────────┴────────┴───────┴────────┴────────┴────────┘          │
│                                                                             │
│  PROJECT HEALTH TRENDS (last 10 sessions)                                   │
│  Codebase Size   ████████████████████████████████░  4,892 files │ +2.1%     │
│  Build Time      ███████████████████░░░░░░░░░░░░░  avg 34s │ +8.2%         │
│  Token Efficiency████████████████████████████░░░░░  avg 1.3x │ improving   │
│  Cache Hit Rate  ████████████████████████░░░░░░░░░  avg 58% │ stable       │
│                                                                             │
│  [1] Overview    [2] Activity    [3] Historical           q: quit  ?: help  │
└─────────────────────────────────────────────────────────────────────────────┘
\`\`\`

**Data Sources:** Historical session archives (\`.goodvibes/analytics/sessions/*.json\`), Project Index

---

## MCP Tools (6 tools)

These tools exist for explicit user requests only. The orchestrator does not call them during normal operation.

### analytics_dashboard

Launch, stop, or check status of the TUI and mini dashboard.

\`\`\`json
{
  "action": "start" | "stop" | "status",
  "target": "mini" | "full" | "both",
  "options": {
    "pane_position": "bottom" | "top" | "left" | "right",
    "pane_size": 4 | "60%"
  }
}
\`\`\`

### analytics_query

Ad-hoc queries against session data. Covers agent profiling, project health, token attribution, command stats, and any other data exploration.

\`\`\`json
{
  "scope": "tokens" | "cache" | "commands" | "agents" | "files" | "cost" | "health" | "project" | "all",
  "time_range": "session" | "last_5m" | "last_30m" | "last_1h",
  "group_by": "tool" | "agent" | "file" | "status",
  "filters": {
    "tool": "precision_read",
    "status": "failed",
    "agent": "engineer"
  },
  "format": "standard" | "minimal" | "verbose"
}
\`\`\`

Example queries:
- "How many tokens did each agent use?" → \`scope: "agents", group_by: "agent"\`
- "What commands failed?" → \`scope: "commands", filters: { status: "failed" }\`
- "Project health summary" → \`scope: "project"\`
- "Token breakdown by tool" → \`scope: "tokens", group_by: "tool"\`

### analytics_budget

Set, check, or clear a session budget.

\`\`\`json
{
  "action": "set" | "check" | "clear",
  "amount": 10.00,
  "unit": "dollars" | "tokens",
  "warn_at": [0.5, 0.8, 1.0]
}
\`\`\`

When set, the mini dashboard shows remaining budget and changes color at thresholds. Default thresholds: yellow at 50%, orange at 80%, red at 100%.

### analytics_tag

Tag or rename the current session for meaningful historical grouping.

\`\`\`json
{
  "action": "tag" | "rename",
  "value": "refactoring-auth-module"
}
\`\`\`

- **tag** — Adds a label to the session metadata (stored in session archive)
- **rename** — Calls Claude CLI \`/rename\` to update the session name, and stores the name in session metadata

### analytics_export

Export session data in various formats.

\`\`\`json
{
  "format": "json" | "csv" | "markdown",
  "scope": "current" | "session:<id>" | "historical",
  "sections": ["tokens", "cache", "commands", "agents", "files", "cost", "timeline"],
  "output_path": "./session-export.json"
}
\`\`\`

- **json** — Full structured data, machine-readable
- **csv** — Tabular format (one CSV per section)
- **markdown** — Human-readable report (same format as auto-reports)

### analytics_config

View or update analytics engine settings.

\`\`\`json
{
  "action": "get" | "set",
  "key": "refresh_rate_ms" | "cost_per_1k_input" | "cost_per_1k_output" | "webhook_url" | "webhook_events" | "historical_sessions" | "anomaly_detection",
  "value": 3000
}
\`\`\`

---

## Automatic Behaviors

These happen without any tool calls or orchestrator involvement.

### Auto-Start (Session Begin)

1. Session-start hook detects new Claude Code session
2. Analytics daemon process starts
3. Connects to precision-engine data files
4. Mini dashboard tmux pane spawns (if \`auto_start_mini: true\`)
5. Begins watching for data changes

### Live Monitoring (During Session)

1. Watches telemetry DB and JSON files for changes (polling or fs.watch)
2. Recomputes aggregations on change
3. Re-renders mini dashboard (every 2s)
4. Re-renders full TUI if open (every 5s)
5. Checks anomaly detection rules on each refresh
6. Tracks budget consumption if budget is set

### Auto-Report (Session End)

1. Daemon receives shutdown signal (Claude Code session ends)
2. Generates session summary report
3. Writes report to \`.goodvibes/logs/session-report-{id}.md\`
4. Archives session data to \`.goodvibes/analytics/sessions/{id}.json\`
5. Updates \`.goodvibes/memory/patterns.json\` if new patterns detected
6. Updates \`.goodvibes/memory/preferences.json\` if usage patterns suggest preference changes
7. Fires webhook (if configured) with session summary payload
8. Closes tmux panes
9. Exits

### Anomaly Detection

Rule-based detection that runs on each data refresh:

| Anomaly | Condition | Severity |
|---------|-----------|----------|
| Cache degradation | Hit rate drops >15% in 5-minute window | Warning |
| Error spike | Error rate exceeds 25% in 5-minute window | Alert |
| Token burn | Token consumption rate >2x session average | Warning |
| Build regression | Build time >2x session average | Warning |
| Conflict storm | >3 file conflicts in 5-minute window | Alert |
| Agent stall | Agent running >10 minutes without tool call | Warning |

Anomalies surface on the mini dashboard (border color change) and Page 2 of the full TUI.

---

## Features

### Agent Profiling

Computed from telemetry metadata (agent ID extracted from precision_agent records and tool call attribution):

- Per-agent token consumption (input + output)
- Per-agent tool call count and distribution
- Per-agent success rate
- Per-agent average task duration
- Cross-session agent type efficiency (engineer vs tester vs reviewer)

Displayed on Page 2 (agent breakdown) and queryable via \`analytics_query scope: "agents"\`.

### Project Health

Computed from project index and cross-session telemetry:

- Codebase size trends (total files, total tokens)
- File type distribution changes
- Build time trends across sessions
- Token efficiency trends (saved/used ratio)
- Cache hit rate trends

Displayed on Page 3 and queryable via \`analytics_query scope: "project"\`.

### Budget Management

- Set via \`analytics_budget\` tool or analytics config
- Tracked in real-time by the daemon
- Displayed on mini dashboard header (replaces uptime when active)
- Color thresholds configurable (default: 50% yellow, 80% orange, 100% red)
- Budget persisted in session state so it survives daemon restarts

### Benchmarking

No dedicated tool — use \`analytics_query\` with time ranges to compare before/after a workflow:

1. Note the current time or tag a session
2. Perform the workflow
3. Query with \`time_range: "last_5m"\` or compare tagged sessions

Alternatively, \`analytics_export\` the current state, perform work, export again, diff the results.

### Webhooks

Configured via \`analytics_config\`:

\`\`\`json
{
  "webhook_url": "https://hooks.slack.com/services/...",
  "webhook_events": ["session_end", "budget_warning", "anomaly_detected"]
}
\`\`\`

**Payload format (session_end):**
\`\`\`json
{
  "event": "session_end",
  "session_id": "abc1def2",
  "tag": "refactoring",
  "duration_minutes": 47,
  "tokens_used": 606000,
  "tokens_saved": 910000,
  "cost": 3.31,
  "cache_hit_rate": 0.68,
  "success_rate": 0.962,
  "commands_run": 47,
  "agents_spawned": 12,
  "files_modified": 28
}
\`\`\`

**Payload format (budget_warning):**
\`\`\`json
{
  "event": "budget_warning",
  "session_id": "abc1def2",
  "budget": 10.00,
  "used": 8.05,
  "remaining": 1.95,
  "threshold": 0.80
}
\`\`\`

---

## Session Lifecycle

\`\`\`
Session Start                    During Session                    Session End
─────────────                    ──────────────                    ───────────
Hook fires                       Daemon watches data               Shutdown signal
  │                                │                                 │
  ▼                                ▼                                 ▼
Daemon starts                    Recompute aggregations            Generate report
  │                              Re-render dashboards                │
  ▼                              Check anomaly rules               Archive session
Mini pane spawns                 Track budget                        │
  │                              Update indicators                 Update memory
  ▼                                                                  │
Watching data files                                                Fire webhook
                                                                     │
                                                                   Close panes
                                                                     │
                                                                   Exit
\`\`\`

---

## Configuration

Stored in \`.goodvibes/goodvibes.json\` under the \`analytics_engine\` key:

\`\`\`json
{
  "analytics_engine": {
    "enabled": true,
    "auto_start_mini": true,
    "auto_start_full": false,
    "refresh_rate_ms": 2000,
    "full_tui_refresh_rate_ms": 5000,
    "cost_per_1k_input_tokens": 0.003,
    "cost_per_1k_output_tokens": 0.015,
    "historical_sessions": 10,
    "budget": null,
    "budget_warn_thresholds": [0.5, 0.8, 1.0],
    "anomaly_detection": true,
    "auto_report_on_shutdown": true,
    "webhook_url": null,
    "webhook_events": ["session_end"],
    "tmux": {
      "mini_pane_size": 4,
      "mini_position": "bottom",
      "full_pane_size": "60%",
      "full_position": "right"
    }
  }
}
\`\`\`

---

## Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Language | TypeScript | Matches precision-engine ecosystem |
| Full TUI | Ink (React for terminal) | Declarative, component-based, efficient re-rendering |
| Mini Dashboard | Raw ANSI escape codes | 4 lines doesn't need a framework, zero dependencies |
| SQLite Reader | sql.js (WASM) | Same as precision-engine's telemetry, no native deps |
| File Watching | chokidar or fs.watch | Detect data file changes for live refresh |
| tmux Control | tmux CLI (child_process) | Terminal-agnostic pane management |
| MCP Server | @modelcontextprotocol/sdk | Standard MCP server protocol |

### Dependencies

- **No LLM calls** — All computation is counting, averaging, and formatting
- **No external services** — Pure local data aggregation (webhooks are outbound-only, optional)
- **Minimal footprint** — sql.js WASM + Ink are the only significant deps

---

## File Structure

\`\`\`
analytics-engine/
  src/
    index.ts                      # Entry: daemon + MCP server startup
    daemon/
      watcher.ts                  # File system watcher (SQLite + JSON changes)
      aggregator.ts               # Data aggregation & metric computation
      anomaly-detector.ts         # Rule-based anomaly detection
      budget-tracker.ts           # Budget tracking & threshold alerts
      session-archiver.ts         # Historical session persistence
      report-generator.ts         # Auto-report generation (markdown)
      memory-updater.ts           # Goodvibes memory feedback (patterns, preferences)
    tui/
      mini/
        renderer.ts               # 4-line raw ANSI renderer
        format.ts                 # Number formatting, bar generation
      full/
        app.tsx                   # Ink app root (page router)
        pages/
          session-overview.tsx    # Page 1: current session metrics
          activity-hotspots.tsx   # Page 2: timeline, heatmap, agents, recommendations
          historical.tsx          # Page 3: cross-session comparison, trends
        components/
          metric-box.tsx          # Reusable metric display widget
          bar-chart.tsx           # Horizontal bar charts
          table.tsx               # Data tables
          timeline-feed.tsx       # Scrollable activity timeline
          heatmap.tsx             # File access heatmap
          trend-line.tsx          # Sparkline-style trend indicators
    handlers/
      analytics-dashboard.ts      # Start/stop/status of dashboards
      analytics-query.ts          # Ad-hoc data queries
      analytics-budget.ts         # Budget management
      analytics-tag.ts            # Session tagging/renaming
      analytics-export.ts         # Data export (JSON/CSV/markdown)
      analytics-config.ts         # Analytics settings
    data/
      telemetry-reader.ts         # SQLite query interface (read-only)
      session-reader.ts           # KVState JSON file reader
      index-reader.ts             # Project index reader
      historical-store.ts         # Historical session archive read/write
    schemas/
      tools.ts                    # MCP tool input/output schemas (Zod)
    tmux/
      manager.ts                  # tmux pane creation, sizing, teardown
      detect.ts                   # tmux availability detection + fallback
  package.json
  tsconfig.json
\`\`\`

---

## Historical Storage

### Session Archive Format

Each session is archived as a JSON file in \`.goodvibes/analytics/sessions/{session_id}.json\`:

\`\`\`json
{
  "session_id": "abc1def2",
  "tag": "refactoring-auth",
  "started_at": "2026-02-20T14:02:00Z",
  "ended_at": "2026-02-20T14:49:00Z",
  "duration_minutes": 47,
  "metrics": {
    "tokens": {
      "input": 482000,
      "output": 124000,
      "total": 606000,
      "saved": 910000,
      "efficiency": 1.50
    },
    "cache": {
      "hit_rate": 0.68,
      "hits": 156,
      "misses": 73,
      "memory_peak_mb": 14.2
    },
    "cost": {
      "input": 1.45,
      "output": 1.86,
      "total": 3.31,
      "saved": 2.28
    },
    "commands": {
      "total": 47,
      "success_rate": 0.894,
      "avg_duration_ms": 6040,
      "total_duration_ms": 283880
    },
    "agents": {
      "spawned": 12,
      "max_concurrent": 4,
      "total_tokens": 606000
    },
    "files": {
      "unique_read": 142,
      "modified": 28,
      "created": 14,
      "conflicts": 2
    }
  },
  "tools_breakdown": {
    "precision_read": { "calls": 89, "avg_ms": 12, "cache_hit_rate": 0.68 },
    "precision_edit": { "calls": 52, "avg_ms": 8 },
    "precision_exec": { "calls": 47, "avg_ms": 6040 }
  },
  "project_snapshot": {
    "total_files": 4892,
    "total_estimated_tokens": 2400000
  }
}
\`\`\`

### Retention

- Last N sessions retained (configurable, default: 10)
- Oldest sessions pruned on daemon startup
- No automatic retention policy beyond the count limit

---

## tmux Integration

### Pane Management

\`\`\`bash
# Mini dashboard (bottom pane, 4 lines)
tmux split-window -v -l 4 "node analytics-engine/dist/mini.js"

# Full TUI (right pane, 60%)
tmux split-window -h -l '60%' "node analytics-engine/dist/full.js"
\`\`\`

### Fallback (No tmux)

If tmux is not detected:
- Mini dashboard writes to a file that can be \`tail -f\`'d
- Full TUI runs in the current terminal (blocking, user must Ctrl+C to exit)
- MCP tools still work normally
- Auto-reports still generate on shutdown

### tmux Detection

\`\`\`typescript
// Check if running inside tmux
const inTmux = !!process.env.TMUX;

// Check if tmux is available
const tmuxAvailable = execSync('which tmux').toString().trim() !== '';
\`\`\`

---

## Implementation Notes

- **Read-only**: Analytics-engine never writes to precision-engine's data files. It only reads telemetry.db, session state JSON, project index JSON.
- **Graceful degradation**: If telemetry DB doesn't exist yet (session just started), show empty/zero dashboards. As data arrives, dashboards populate.
- **SQLite reads are cheap**: A full session summary query takes <1ms. Polling every 2s adds negligible overhead.
- **Ink efficiency**: Ink uses a virtual DOM for terminal output — only changed regions re-render. Full TUI refreshes are cheap.
- **Process isolation**: Analytics daemon is a separate process from precision-engine. If analytics crashes, precision-engine and the orchestrator are unaffected.
- **No token cost to orchestrator**: The daemon runs independently. MCP tools are only called on explicit user request, and responses are compact (100-500 tokens).
