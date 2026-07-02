# goodvibes-analytics

Token and cost analytics for Claude Code — **7 tools**, one MCP server, with a
tmux TUI dashboard. Part of the goodvibes v2 line; install it alongside
`goodvibes-intel` when you want to see where your tokens and dollars go.

> Status: **v2.0.0-alpha.1**.

## Tools

| Tool | What it does |
|---|---|
| `query` | Query recorded usage (tokens, calls, timings) from the telemetry store |
| `dashboard` | Launch / drive the tmux TUI dashboard |
| `budget` | Cost against a per-model, cache-aware pricing table |
| `export` | Export usage data |
| `tag` | Tag sessions / spans for grouping |
| `sync` | Sync the telemetry store |
| `config` | Read analytics configuration |

Tools surface as `mcp__goodvibes-analytics__query`, etc. — the `analytics_`
prefix is dropped because the server key already namespaces them.

## Token cost

Tool schemas are deferred behind Tool Search (client default), so they are not
loaded into every session. Always-on metadata is tiny:

| Component | Always-on tokens (measured via `claude plugin details`) |
|---|---|
| goodvibes-analytics | **~33** |

## When native tools are the right choice

There is no native equivalent — Claude Code does not track your token/cost
history. So the honest guidance is simpler: **if you don't care about
per-session token and cost accounting, don't install this plugin.** It is purely
additive; it observes and reports, and never changes model behavior.

## Content

- **Command:** `/goodvibes-analytics:analytics`.
- **Hooks:** SessionEnd flush, Stop, SubagentStop (telemetry-only), PreCompact
  (observe-only) — all observe/record only, no context injection, no blocking.
  Each yields silently if the v1 `goodvibes` plugin is installed alongside.
- State is written under the namespaced `.goodvibes/v2/` directory so v1 and v2
  never fight over the same telemetry files.

## Install

```sh
claude plugin marketplace add mgd34msu/goodvibes-plugin
claude plugin install goodvibes-analytics@goodvibes-market
```

The tmux dashboard needs `tmux` on PATH.

## Tests

`npx vitest run --project analytics` — 232 passing.
`npx tsc --noEmit -p packages/analytics` — zero errors.
