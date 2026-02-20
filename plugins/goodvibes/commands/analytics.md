---
description: View session analytics, launch dashboards, manage budgets, and export data
argument-hint: [status|dashboard|mini|full|stop|budget|export|tag|config] [options]
allowed-tools:
  - mcp__plugin_goodvibes_analytics-engine__analytics_dashboard
  - mcp__plugin_goodvibes_analytics-engine__analytics_query
  - mcp__plugin_goodvibes_analytics-engine__analytics_budget
  - mcp__plugin_goodvibes_analytics-engine__analytics_export
  - mcp__plugin_goodvibes_analytics-engine__analytics_tag
  - mcp__plugin_goodvibes_analytics-engine__analytics_config
---

# Analytics

Quick access to GoodVibes analytics-engine features.

## Usage

```
/goodvibes:analytics                      # Session summary
/goodvibes:analytics status               # Dashboard status (running/stopped)
/goodvibes:analytics dashboard            # Launch mini dashboard
/goodvibes:analytics mini                 # Launch mini dashboard (alias)
/goodvibes:analytics full                 # Launch full TUI dashboard
/goodvibes:analytics stop [mini|full|both]  # Stop dashboard(s) (default: both)
/goodvibes:analytics budget <amount>      # Set session budget (dollars)
/goodvibes:analytics budget               # Check current budget
/goodvibes:analytics budget clear         # Clear current budget
/goodvibes:analytics export [format]      # Export session data
/goodvibes:analytics tag <name>           # Tag the current session
/goodvibes:analytics tag rename <new-name> # Rename the current session tag
/goodvibes:analytics config [key] [value] # Get or set analytics config
```

## Instructions

Parse the subcommand from $ARGUMENTS. If $ARGUMENTS is empty, default to the summary subcommand.

**Prerequisite check:** Before calling any analytics tool, verify the analytics-engine MCP tools are available by using ToolSearch to find tools matching "analytics". If no `mcp__plugin_goodvibes_analytics-engine__*` tools are found, inform the user:

```
Analytics engine is not available. Ensure the GoodVibes plugin is installed and the analytics-engine MCP server is running.
```

## Overview

The analytics engine tracks everything that happens in your Claude session: token usage and cost, cache performance (cache hits reduce cost), file operations (reads, writes, edits), command execution (shell commands via precision_exec), and agent activity (subagent spawns and completions). Use this command to monitor spend, diagnose performance, and export session history.

### (no arguments) — Session Summary

Call `mcp__plugin_goodvibes_analytics-engine__analytics_query` with:
```json
{"scope": "all"}
```

Present the results in a readable summary format showing token usage, cache stats, cost, and health metrics. If the query returns empty data (no session activity recorded yet), inform the user:
```
No analytics data yet. Start working and check back after a few tool calls.
```

### `dashboard` / `mini` — Launch Mini Dashboard

Call `mcp__plugin_goodvibes_analytics-engine__analytics_dashboard` with:
```json
{
  "action": "start",
  "target": "mini"
}
```

Report whether the mini dashboard launched successfully. The mini dashboard is a 4-line always-on tmux pane showing live session metrics. It auto-detects terminal width and re-renders instantly on resize — no restart needed.

### `full` — Launch Full TUI Dashboard

Call `mcp__plugin_goodvibes_analytics-engine__analytics_dashboard` with:
```json
{
  "action": "start",
  "target": "full"
}
```

Report whether the full TUI dashboard launched successfully. The full TUI is a multi-page interactive dashboard with detailed analytics. It has 3 pages — Session Overview, Activity Hotspots, and Historical — navigable with `1`/`2`/`3` number keys, left/right arrows, or `?` for a help overlay.

### `stop [mini|full|both]` — Stop Dashboard(s)

Parse the optional target from $ARGUMENTS after `stop`. Default to `both` if no target is specified. Call `mcp__plugin_goodvibes_analytics-engine__analytics_dashboard` with:
```json
{
  "action": "stop",
  "target": "<target>"
}
```

Where `<target>` is one of `mini`, `full`, or `both`. Confirm that the specified dashboard(s) have been stopped.

### `budget <amount>` — Set Session Budget

If an amount is provided after `budget`, call `mcp__plugin_goodvibes_analytics-engine__analytics_budget` with:
```json
{
  "action": "set",
  "amount": 5.00,
  "unit": "dollars"
}
```

Replace `5.00` with the user's specified amount. Where `<amount>` is parsed as a positive number from $ARGUMENTS. Optionally include `warn_at` as an array of threshold percentages (values 0–1, e.g. `[0.5, 0.8, 1.0]`) to trigger alerts at those spend levels. If the amount is not a valid positive number, inform the user:
```
Invalid budget amount. Provide a positive number (e.g., /goodvibes:analytics budget 5.00)
```

### `status` — Dashboard Status

Call `mcp__plugin_goodvibes_analytics-engine__analytics_dashboard` with:
```json
{
  "action": "status",
  "target": "both"
}
```

Report the current status of both the mini and full dashboards (running or stopped).

### `budget` (no amount) — Check Current Budget

If `budget` is provided with no amount, call `mcp__plugin_goodvibes_analytics-engine__analytics_budget` with:
```json
{
  "action": "check"
}
```

Display the current budget status including remaining amount and percentage used.

### `budget clear` — Clear Current Budget

If `clear` is provided after `budget`, call `mcp__plugin_goodvibes_analytics-engine__analytics_budget` with:
```json
{
  "action": "clear"
}
```

Confirm the budget has been cleared.

### `export [format]` — Export Session Data

Call `mcp__plugin_goodvibes_analytics-engine__analytics_export` with:
```json
{
  "format": "<format>",
  "scope": "current"
}
```

Where `<format>` is one of: `json`, `csv`, `markdown`. Default to `markdown` if no format is specified. Optional parameters:
- `sections` — array of sections to include: `tokens`, `cache`, `commands`, `agents`, `files`, `cost`, `timeline`
- `output_path` — file path to write the export to (if omitted, returns inline)

If an invalid format is provided, inform the user:
```
Invalid export format. Supported formats: json, csv, markdown
```

### `tag <name>` — Tag the Current Session

Call `mcp__plugin_goodvibes_analytics-engine__analytics_tag` with:
```json
{
  "action": "tag",
  "value": "<name>"
}
```

Where `<name>` is the tag string from $ARGUMENTS. Confirm the session has been tagged. If no name is provided, inform the user:
```
Provide a tag name (e.g., /goodvibes:analytics tag my-feature-work)
```

### `tag rename <new-name>` — Rename Session Tag

If `rename` is provided after `tag`, call `mcp__plugin_goodvibes_analytics-engine__analytics_tag` with:
```json
{
  "action": "rename",
  "value": "<new-name>"
}
```

Where `<new-name>` is the new tag name from $ARGUMENTS. Confirm the session tag has been renamed. If no new name is provided, inform the user:
```
Provide a new tag name (e.g., /goodvibes:analytics tag rename my-new-name)
```

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

Present config values in a readable format. Settings include refresh rates, cost rates, webhook URLs, and anomaly detection thresholds.

When setting a value, coerce the type based on the input: if it looks like a number (e.g., `0.5`, `100`), pass it as a number. If it looks like a boolean (`true` or `false`), pass it as a boolean. Otherwise pass it as a string.

### Unknown subcommand

If the subcommand is not recognized, show available subcommands:
```
Unknown subcommand: <subcommand>

Available subcommands:
  (none)              - Show session analytics summary
  status              - Show dashboard status (running/stopped)
  dashboard           - Launch mini dashboard (tmux pane)
  mini                - Launch mini dashboard (alias for dashboard)
  full                - Launch full TUI dashboard
  stop [target]       - Stop dashboard(s): mini, full, or both (default: both)
  budget [amount]     - Set or check session budget
  budget clear        - Clear current budget
  export [format]     - Export session data (json, csv, markdown)
  tag <name>          - Tag the current session
  tag rename <name>   - Rename the current session tag
  config [key] [val]  - Get or set analytics config
```

## Tips

- **Track spend from the start**: Run `/goodvibes:analytics budget 5` at the beginning of a session to set a spending limit and get alerts before you exceed it.
- **Mini dashboard in a tmux pane**: The mini dashboard works best pinned to a small bottom tmux pane (3-4 lines). Launch it once and it stays live for the whole session.
- **Export at session end**: Use `/goodvibes:analytics export markdown` to capture a formatted summary of your session's token usage, cost, and activity before closing.

## Arguments

$ARGUMENTS
