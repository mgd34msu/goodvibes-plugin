---
description: View session analytics, launch dashboards, manage budgets, export data, manage tags, and sync sessions
argument-hint: [status|dashboard|mini|budget|export|tag|sync|config] [options]
allowed-tools:
  - mcp__plugin_goodvibes_analytics-engine__analytics_dashboard
  - mcp__plugin_goodvibes_analytics-engine__analytics_query
  - mcp__plugin_goodvibes_analytics-engine__analytics_budget
  - mcp__plugin_goodvibes_analytics-engine__analytics_export
  - mcp__plugin_goodvibes_analytics-engine__analytics_tag
  - mcp__plugin_goodvibes_analytics-engine__analytics_config
  - mcp__plugin_goodvibes_analytics-engine__analytics_sync
---

# Analytics

Quick access to GoodVibes analytics-engine features. Tracks token usage, cost, cache performance, file operations, command execution, and agent activity across your Claude session.

## Usage

```
/goodvibes:analytics                    # Session summary (real data)
/goodvibes:analytics status             # Meaningful analytics overview
/goodvibes:analytics mini               # Toggle mini dashboard
/goodvibes:analytics dashboard          # Toggle full dashboard
/goodvibes:analytics budget <amount>    # Set budget
/goodvibes:analytics budget             # Check budget
/goodvibes:analytics budget clear       # Clear budget
/goodvibes:analytics export [format]    # Export with cross-project/tag support
/goodvibes:analytics tag add <name>     # Add tag to current session
/goodvibes:analytics tag remove <name>  # Remove tag from current session
/goodvibes:analytics tag list           # List tags for current session
/goodvibes:analytics tag auto           # Auto-tag from JSONL analysis
/goodvibes:analytics sync               # Sync current project
/goodvibes:analytics sync all           # Sync all projects
/goodvibes:analytics config [key] [val] # Get/set config
```

## Instructions

Parse the subcommand from $ARGUMENTS. If $ARGUMENTS is empty, default to the session summary.

**Prerequisite check:** Before calling any analytics tool, verify the analytics-engine MCP tools are available by using ToolSearch to find tools matching "analytics". If no `mcp__plugin_goodvibes_analytics-engine__*` tools are found, inform the user:

```
Analytics engine is not available. Ensure the GoodVibes plugin is installed and the analytics-engine MCP server is running.
```

---

### (no arguments) — Session Summary

Call `mcp__plugin_goodvibes_analytics-engine__analytics_query` with:
```json
{
  "scope": "all",
  "data_scope": "current_session"
}
```

Present the results as a readable summary showing token usage, cache performance, cost, agent activity, and health status. If the query returns empty data (no session activity recorded yet), inform the user:
```
No analytics data yet. Start working and check back after a few tool calls.
```

---

### `status` — Session Analytics Overview

Call `mcp__plugin_goodvibes_analytics-engine__analytics_query` with:
```json
{
  "scope": "all",
  "data_scope": "current_session",
  "format": "verbose"
}
```

Present a detailed breakdown of the current session: token usage (input/output/cached), cost summary, cache hit rate, command execution stats, agent activity, file operations, and anomalies detected. This shows real analytics data — not dashboard running state.

---

### `mini` — Toggle Mini Dashboard

Call `mcp__plugin_goodvibes_analytics-engine__analytics_dashboard` with:
```json
{
  "action": "start",
  "target": "mini"
}
```

The mini dashboard is a 4-line always-on tmux pane showing live session metrics. Calling `start` on a running dashboard toggles it off. Report the result to the user.

---

### `dashboard` — Toggle Full Dashboard

Call `mcp__plugin_goodvibes_analytics-engine__analytics_dashboard` with:
```json
{
  "action": "start",
  "target": "dashboard"
}
```

The full dashboard is a multi-page interactive TUI with detailed analytics. Navigate with `1`/`2`/`3` number keys, left/right arrows, or `?` for help. Calling `start` on a running dashboard toggles it off. Report the result to the user.

---

### `budget <amount>` — Set Session Budget

If an amount is provided after `budget`, call `mcp__plugin_goodvibes_analytics-engine__analytics_budget` with:
```json
{
  "action": "set",
  "amount": 5.00,
  "unit": "dollars"
}
```

Replace `5.00` with the user's specified amount parsed as a positive number from $ARGUMENTS. Optionally include `warn_at` as an array of threshold percentages (values 0–1, e.g. `[0.5, 0.8, 1.0]`) to trigger alerts at those spend levels.

If the amount is not a valid positive number, inform the user:
```
Invalid budget amount. Provide a positive number (e.g., /goodvibes:analytics budget 5.00)
```

---

### `budget` (no amount) — Check Current Budget

If `budget` is provided with no amount, call `mcp__plugin_goodvibes_analytics-engine__analytics_budget` with:
```json
{
  "action": "check"
}
```

Display the current budget status including amount set, amount used, remaining, and percentage consumed.

---

### `budget clear` — Clear Current Budget

If `clear` is provided after `budget`, call `mcp__plugin_goodvibes_analytics-engine__analytics_budget` with:
```json
{
  "action": "clear"
}
```

Confirm the budget has been cleared.

---

### `export [format]` — Export Session Data

Call `mcp__plugin_goodvibes_analytics-engine__analytics_export` with:
```json
{
  "format": "markdown",
  "scope": "current"
}
```

Where `format` is one of: `json`, `csv`, `markdown`. Default to `markdown` if no format is specified.

Optional parameters:
- `scope` — `"current"` (default), `"historical"`, `"all_projects"`, or `"session:<id>"`
- `sections` — array of sections to include: `tokens`, `cache`, `commands`, `agents`, `files`, `cost`, `timeline`
- `output_path` — file path to write the export to (if omitted, returns inline)
- `tags` — array of tag strings to filter exported sessions (applies to `historical` and `all_projects` scopes)

Example for cross-project export filtered by tag:
```json
{
  "format": "markdown",
  "scope": "all_projects",
  "tags": ["my-feature"]
}
```

If an invalid format is provided, inform the user:
```
Invalid export format. Supported formats: json, csv, markdown
```

---

### `tag add <name>` — Add Tag to Current Session

If `add` is provided after `tag`, call `mcp__plugin_goodvibes_analytics-engine__analytics_tag` with:
```json
{
  "action": "add",
  "value": "<name>"
}
```

Where `<name>` is the tag string from $ARGUMENTS. Confirm the tag has been added. If no name is provided, inform the user:
```
Provide a tag name (e.g., /goodvibes:analytics tag add my-feature-work)
```

---

### `tag remove <name>` — Remove Tag from Current Session

If `remove` is provided after `tag`, call `mcp__plugin_goodvibes_analytics-engine__analytics_tag` with:
```json
{
  "action": "remove",
  "value": "<name>"
}
```

Where `<name>` is the tag string from $ARGUMENTS. Confirm the tag has been removed. If no name is provided, inform the user:
```
Provide a tag name to remove (e.g., /goodvibes:analytics tag remove my-feature-work)
```

---

### `tag list` — List Session Tags

If `list` is provided after `tag`, call `mcp__plugin_goodvibes_analytics-engine__analytics_tag` with:
```json
{
  "action": "list",
  "scope": "session"
}
```

Display all tags currently applied to the active session. Use `scope: "all"` to list tags across all sessions in the global database.

---

### `tag auto` — Auto-Tag from JSONL Analysis

If `auto` is provided after `tag`, call `mcp__plugin_goodvibes_analytics-engine__analytics_tag` with:
```json
{
  "action": "auto"
}
```

The engine will analyze the current session's JSONL data and suggest heuristic tags based on activity patterns. Report the suggested tags to the user.

---

### `tag` (no subcommand or unrecognized) — Tag error

If `tag` is provided with no recognized subcommand (`add`, `remove`, `list`, `auto`), inform the user:
```
Unknown tag subcommand. Available:
  tag add <name>     - Add a tag to the current session
  tag remove <name>  - Remove a tag from the current session
  tag list           - List tags for the current session
  tag auto           - Auto-tag from JSONL analysis
```

---

### `sync` — Sync Current Project

Call `mcp__plugin_goodvibes_analytics-engine__analytics_sync` with:
```json
{
  "scope": "current"
}
```

Syncs the current project's Claude JSONL session files into the global analytics SQLite database. Uses incremental sync via byte-offset tracking — only new data is processed. Report the sync results including files synced, records imported, and any errors.

---

### `sync all` — Sync All Projects

If `all` is provided after `sync`, call `mcp__plugin_goodvibes_analytics-engine__analytics_sync` with:
```json
{
  "scope": "all"
}
```

Syncs all projects discovered under `~/.claude/projects/` into the global analytics database. Report the total files synced, records imported, projects processed, and any errors.

---

### `config [key] [value]` — Get or Set Analytics Config

If no key is provided, call `mcp__plugin_goodvibes_analytics-engine__analytics_config` with:
```json
{"action": "get"}
```

If a key is provided with no value, call with:
```json
{
  "action": "get",
  "key": "<key>"
}
```

If both key and value are provided, call with:
```json
{
  "action": "set",
  "key": "<key>",
  "value": "<value>"
}
```

Supported config keys (dot-notation for nested values):
- `auto_start_mini` — auto-launch mini dashboard on session start
- `auto_start_dashboard` — auto-launch full dashboard on session start
- `refresh_rate_ms` — mini dashboard refresh interval in milliseconds
- `dashboard_refresh_rate_ms` — full dashboard refresh interval in milliseconds
- `cost_per_1k_input_tokens` — cost rate for input tokens
- `cost_per_1k_output_tokens` — cost rate for output tokens
- `anomaly_detection` — enable/disable anomaly detection
- `webhook_url` — webhook URL for event notifications
- `global_db_path` — path to the global analytics SQLite database
- `jsonl_base_path` — base path for Claude JSONL session files
- `tmux.mini_pane_size` — mini pane height in lines
- `tmux.mini_position` — mini pane position (bottom/top/left/right)
- `tmux.dashboard_pane_size` — full dashboard pane size (e.g., "60%")
- `tmux.dashboard_position` — full dashboard pane position
- `mini_budget_bar` — show budget progress bar in mini dashboard

Deprecated keys are supported as aliases:
- `auto_start_full` → `auto_start_dashboard`
- `full_tui_refresh_rate_ms` → `dashboard_refresh_rate_ms`
- `tmux.full_pane_size` → `tmux.dashboard_pane_size`
- `tmux.full_position` → `tmux.dashboard_position`

Use `action: "reload"` to hot-reload config from disk without restarting the engine:
```json
{"action": "reload"}
```

When setting a value, coerce the type based on input: numbers stay as numbers, `true`/`false` as booleans, everything else as strings.

Present config values in a readable format.

---

### Unknown subcommand

If the subcommand is not recognized, show available subcommands:
```
Unknown subcommand: <subcommand>

Available subcommands:
  (none)              - Show session analytics summary
  status              - Show detailed session analytics
  dashboard           - Toggle full TUI dashboard
  mini                - Toggle mini dashboard (4-line tmux pane)
  budget [amount]     - Set or check session budget
  budget clear        - Clear current budget
  export [format]     - Export session data (json, csv, markdown)
  tag add <name>      - Add tag to current session
  tag remove <name>   - Remove tag from current session
  tag list            - List tags for current session
  tag auto            - Auto-tag from JSONL analysis
  sync                - Sync current project to global DB
  sync all            - Sync all projects to global DB
  config [key] [val]  - Get or set analytics config
```

---

## Tips

- **Track spend from the start**: Run `/goodvibes:analytics budget 5` at the beginning of a session to set a spending limit and get alerts before you exceed it.
- **Mini dashboard in a tmux pane**: The mini dashboard works best pinned to a small bottom tmux pane (3-4 lines). Launch it once and it stays live for the whole session.
- **Tag your work**: Use `/goodvibes:analytics tag add feature-xyz` to tag the session, then filter exports and queries by that tag later.
- **Export at session end**: Use `/goodvibes:analytics export markdown` to capture a formatted summary of your session's token usage, cost, and activity before closing.
- **Cross-project queries**: Use `/goodvibes:analytics sync all` then `/goodvibes:analytics export all_projects` to see aggregated data across all your Claude projects.

## Arguments

$ARGUMENTS
