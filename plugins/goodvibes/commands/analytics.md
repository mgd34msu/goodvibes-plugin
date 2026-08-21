---
description: View session analytics, generate the HTML analytics report, manage budgets, export data, manage tags, and sync sessions
argument-hint: "[status|report|doctor|budget|export|tag|sync|config] [options]"
allowed-tools:
  - mcp__analytics__query
  - mcp__analytics__dashboard
  - mcp__analytics__budget
  - mcp__analytics__export
  - mcp__analytics__tag
  - mcp__analytics__sync
  - mcp__analytics__config
  - SendUserFile
---

# Analytics

goodvibes analytics: token usage, cost, cache performance, and agent activity, computed from
transcript actuals, never tool self-estimates.

Parse the subcommand from $ARGUMENTS (empty = session summary) and make the matching call. If
the `mcp__analytics__*` tools are unavailable, say the goodvibes plugin's analytics server is
not running and stop.

| Subcommand | Call | Notes |
|---|---|---|
| (none) | `query` `{ "scope": "all", "data_scope": "current_session" }` | Present tokens, cache, cost, and agent activity as a readable summary. If empty: "No analytics data yet. Start working and check back after a few tool calls." |
| `status` | the same `query` plus `"format": "verbose"` | Verbose session breakdown. |
| `report` | `dashboard` `{ "action": "report" }` | Writes a self-contained HTML report to `<project>/.goodvibes/reports/analytics-report.html` and returns the path plus a 3-line stats summary. Send that file to the user with `SendUserFile` (`display: "render"`), then relay the summary. Optional `scope`: `session`, `project`, `all_projects` (default when omitted). |
| `doctor` | `dashboard` `{ "action": "doctor" }` | Host health + orphaned-process report. Relay any cleanup commands; never run them unasked. |
| `budget <amount>` | `budget` `{ "action": "set", "amount": <n>, "unit": "dollars", "warn_at": [0.5, 0.8, 1.0] }` | `<amount>` must parse as a positive number; otherwise ask for one. |
| `budget` | `budget` `{ "action": "check" }` | Report amount set, used, remaining, percent consumed. |
| `budget clear` | `budget` `{ "action": "clear" }` | |
| `export [format]` | `export` `{ "format": "<format>", "scope": "current" }` | `format`: `json` \| `csv` \| `markdown` (default). Optional: `scope` (`current`, `historical`, `all_projects`, `session:<id>`), `sections`, `output_path`, `tags`. |
| `tag add <name>` / `tag remove <name>` | `tag` with `action` + `value: "<name>"` | A name is required; ask if missing. |
| `tag list` / `tag auto` | `tag` with the matching `action` | `list` accepts `scope: "all"` to cover every session in the global DB. |
| `sync` / `sync all` | `sync` `{ "scope": "current" }` or `{ "scope": "all" }` | Incremental (byte-offset tracked). Report files synced, records imported, errors. |
| `config [key] [val]` | `config` | No key: `{ "action": "get" }`. Key only: add `"key"`. Key + value: `{ "action": "set", "key", "value" }`, coercing the value's natural type (number / boolean / string). `{ "action": "reload" }` re-reads config from disk. |

For an unknown subcommand, list the ones above.

## Arguments

$ARGUMENTS
