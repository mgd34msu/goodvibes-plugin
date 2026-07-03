---
description: View session analytics, launch dashboards, manage budgets, export data, manage tags, and sync sessions
argument-hint: "[status|dashboard|mini|budget|export|tag|sync|config] [options]"
allowed-tools:
  - mcp__analytics__query
  - mcp__analytics__dashboard
  - mcp__analytics__budget
  - mcp__analytics__export
  - mcp__analytics__tag
  - mcp__analytics__sync
  - mcp__analytics__config
---

# Analytics

Quick access to goodvibes analytics: token usage, cost, cache performance, and agent activity
for the current session — computed from transcript actuals, never tool self-estimates.

## Usage

```
/goodvibes:analytics                    # Session summary (real data)
/goodvibes:analytics status              # Verbose session breakdown
/goodvibes:analytics mini                # Toggle the mini dashboard (tmux pane)
/goodvibes:analytics budget <amount>      # Set budget
/goodvibes:analytics budget               # Check budget
/goodvibes:analytics budget clear         # Clear budget
/goodvibes:analytics export [format]      # json | csv | markdown
/goodvibes:analytics tag add <name>       # Add a tag to the current session
/goodvibes:analytics tag remove <name>
/goodvibes:analytics tag list
/goodvibes:analytics tag auto             # Heuristic tag suggestions
/goodvibes:analytics sync                 # Sync current project into the global DB
/goodvibes:analytics sync all             # Sync every project under ~/.claude/projects/
/goodvibes:analytics config [key] [val]   # Get/set engine config
```

Note: the full interactive TUI dashboard is deferred past this alpha (`dashboard`/`full` targets
are not yet implemented) — only the 4-line always-on mini pane (`mini`) is available. Do not
tell the user a full dashboard launched if it did not.

## Instructions

Parse the subcommand from $ARGUMENTS. If $ARGUMENTS is empty, default to the session summary.

**Prerequisite check:** before calling any tool, verify the `mcp__analytics__*` tools
are available (ToolSearch for "analytics" if they're deferred behind Tool Search). If none are
found, inform the user:
```
goodvibes-analytics is not available. Ensure the goodvibes-analytics plugin is installed and its MCP server is running.
```

---

### (no arguments) — Session Summary

Call `mcp__analytics__query`:
```json
{ "scope": "all", "data_scope": "current_session" }
```
Present token usage, cache performance, cost, and agent activity as a readable summary. If the
query returns empty data, say so plainly:
```
No analytics data yet. Start working and check back after a few tool calls.
```

### `status` — Verbose Session Breakdown

Call `mcp__analytics__query`:
```json
{ "scope": "all", "data_scope": "current_session", "format": "verbose" }
```

### `mini` — Toggle the Mini Dashboard

Call `mcp__analytics__dashboard`:
```json
{ "action": "start", "target": "mini" }
```
Starting a running pane toggles it off. Report the result.

### `budget <amount>` — Set Session Budget

Call `mcp__analytics__budget`:
```json
{ "action": "set", "amount": 5.00, "unit": "dollars", "warn_at": [0.5, 0.8, 1.0] }
```
Parse `<amount>` as a positive number from $ARGUMENTS. If it isn't one, say:
```
Invalid budget amount. Provide a positive number (e.g., /goodvibes:analytics budget 5.00)
```

### `budget` (no amount) — Check Budget

```json
{ "action": "check" }
```
Report amount set, used, remaining, and percent consumed.

### `budget clear`

```json
{ "action": "clear" }
```

### `export [format]`

Call `mcp__analytics__export`:
```json
{ "format": "markdown", "scope": "current" }
```
`format` is one of `json`, `csv`, `markdown` (default `markdown`). Optional: `scope`
(`current` default, `historical`, `all_projects`, or `session:<id>`), `sections` (array of
`tokens`/`cache`/`commands`/`agents`/`files`/`cost`/`timeline`), `output_path`, `tags` (array,
filters `historical`/`all_projects` scopes). Invalid format:
```
Invalid export format. Supported formats: json, csv, markdown
```

### `tag add <name>` / `tag remove <name>` / `tag list` / `tag auto`

Call `mcp__analytics__tag` with `action` set to `add`/`remove`/`list`/`auto` and
`value` set to `<name>` for add/remove. `list` accepts `scope: "all"` to list across every
session in the global DB instead of just the current one. If `add`/`remove` is called with no
name:
```
Provide a tag name (e.g., /goodvibes:analytics tag add my-feature-work)
```
Unrecognized tag subcommand:
```
Unknown tag subcommand. Available: add <name>, remove <name>, list, auto
```

### `sync` / `sync all`

Call `mcp__analytics__sync` with `{ "scope": "current" }` or `{ "scope": "all" }`.
Incremental via byte-offset tracking — only new data is processed. Report files synced, records
imported, and any errors.

### `config [key] [value]`

No key: `{ "action": "get" }`. Key only: `{ "action": "get", "key": "<key>" }`. Key + value:
`{ "action": "set", "key": "<key>", "value": "<value>" }`. Coerce the value's type from the
input: numbers stay numbers, `true`/`false` become booleans, everything else stays a string.
`{ "action": "reload" }` hot-reloads config from disk.

### Unknown subcommand

```
Unknown subcommand: <subcommand>

Available subcommands:
  (none)              - Session analytics summary
  status              - Verbose session analytics
  mini                - Toggle the mini dashboard
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

## Arguments

$ARGUMENTS
