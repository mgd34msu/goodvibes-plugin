# Analytics Engine — Session Intelligence MCP Server

A new MCP server (separate from precision-engine) that surfaces session analytics, token savings, cache statistics, and performance metrics. It consumes data from precision-engine's state singletons and provides both real-time queries and end-of-session summaries.

> **This is its own project.** Referenced from `precision-tool-updates.md` but designed, built, and deployed independently. It depends on precision-engine's state modules but runs as a separate MCP server process.

## Design Principle

**Make the invisible visible.**

Precision-engine saves tokens silently (cache hits, minimal verbosity, size gates, pagination). Analytics-engine tells you how much was saved, where, and what patterns emerge. It turns "trust me, it's more efficient" into "here are the numbers."

---

## What It Surfaces

### 1. Token Savings

Data source: FileStateCache (precision-engine Item 1)

```json
{
  "token_savings": {
    "cache_hits": {
      "unchanged_files": 245,
      "tokens_saved": 184000,
      "cost_saved_estimate": "$0.46"
    },
    "diff_returns": {
      "files_returned_as_diff": 38,
      "tokens_saved_vs_full": 52000
    },
    "verbosity_savings": {
      "edits_at_minimal": 50,
      "tokens_saved_vs_with_diff": 249000
    },
    "size_gate_savings": {
      "files_gated": 12,
      "tokens_saved_vs_full_read": 380000
    },
    "batch_pagination_savings": {
      "batches_paginated": 3,
      "tokens_deferred": 45000
    },
    "total_tokens_saved": 910000,
    "total_cost_saved_estimate": "$2.28"
  }
}
```

### 2. Cache Statistics

Data source: FileStateCache

```json
{
  "cache": {
    "entries": 142,
    "memory_used_mb": 12.4,
    "memory_budget_mb": 200,
    "hit_rate": "63.3%",
    "total_reads": 387,
    "cache_hits": 245,
    "cache_misses": 142,
    "evictions": 0,
    "conflicts_detected": 2,
    "conflicts_resolved": 2,
    "most_read_files": [
      {"path": "src/main.ts", "reads": 12, "tokens_saved": 22000},
      {"path": "src/utils.ts", "reads": 8, "tokens_saved": 14000}
    ],
    "most_modified_files": [
      {"path": "src/main.ts", "modifications": 6, "by_agents": 2}
    ]
  }
}
```

### 3. Command History & Execution Stats

Data source: SessionState, ProcessManager (precision-engine Item 10)

```json
{
  "execution": {
    "commands_run": 47,
    "total_duration_ms": 284000,
    "success_rate": "89.4%",
    "failures": 5,
    "retries": 3,
    "timeouts": 1,
    "background_processes": {
      "active": 1,
      "completed": 3,
      "total_uptime_ms": 320000
    },
    "cwd_changes": 8,
    "current_cwd": "/home/user/project/packages/core",
    "most_run_commands": [
      {"command": "npm run build", "count": 4, "avg_duration_ms": 8200},
      {"command": "npx vitest run", "count": 3, "avg_duration_ms": 12400}
    ]
  }
}
```

### 4. Search & Discovery Stats

Data source: SearchCache (precision-engine Item 12)

```json
{
  "search": {
    "grep_queries": 34,
    "glob_queries": 18,
    "symbol_queries": 12,
    "discover_queries": 8,
    "total_files_matched": 842,
    "unique_files_matched": 156,
    "refinements_used": 4,
    "most_searched_patterns": [
      {"pattern": "handleUser", "count": 3},
      {"pattern": "TODO|FIXME", "count": 2}
    ]
  }
}
```

### 5. Fetch & Web Stats

Data source: FetchCache (precision-engine Item 11)

```json
{
  "fetch": {
    "urls_fetched": 12,
    "cache_hits": 4,
    "content_unchanged": 2,
    "archive_fallbacks": 1,
    "page_types": {
      "documentation": 6,
      "api_reference": 3,
      "json_endpoint": 2,
      "error_page": 1
    },
    "extraction_modes_used": {
      "readable": 6,
      "code_blocks": 3,
      "tables": 2,
      "raw": 1
    }
  }
}
```

### 6. File Modification Timeline

Data source: FileStateCache modification logs

```json
{
  "timeline": [
    {"time": "14:23:01", "tool": "precision_edit", "file": "src/main.ts", "agent": "agent-abc", "summary": "replaced 4 lines near line 42"},
    {"time": "14:23:03", "tool": "precision_write", "file": "src/new-file.ts", "agent": "agent-def", "summary": "created (248 lines)"},
    {"time": "14:23:05", "tool": "precision_edit", "file": "src/main.ts", "agent": "agent-ghi", "summary": "added import on line 3"},
    {"time": "14:23:05", "tool": "precision_edit", "file": "src/main.ts", "agent": "agent-abc", "summary": "CONFLICT detected (v3 vs v5)"}
  ]
}
```

Chronological view of all file modifications across all agents. Shows conflicts, concurrent edits, and the full story of how files evolved.

### 7. Performance Metrics

Data source: All precision-engine handlers (execution_ms from PrecisionResult.meta)

```json
{
  "performance": {
    "avg_response_ms": {
      "precision_read": 12,
      "precision_edit": 8,
      "precision_write": 15,
      "precision_exec": 4200,
      "precision_grep": 45,
      "precision_glob": 22,
      "precision_fetch": 1800,
      "precision_symbols": 120,
      "discover": 35
    },
    "slow_operations": [
      {"tool": "precision_exec", "command": "npm run build", "duration_ms": 45200},
      {"tool": "precision_fetch", "url": "https://docs.example.com", "duration_ms": 3400}
    ],
    "slow_filesystem_files": [
      {"path": "/mnt/c/Users/...", "stat_ms": 124}
    ]
  }
}
```

---

## MCP Tools

Analytics engine exposes a small set of query tools:

### analytics_summary

Return full session summary (all sections above). This is what gets called at end-of-session or when the user asks "how's the session going?"

```json
{
  "scope": "full",        // or "tokens", "cache", "execution", "search", "fetch", "timeline", "performance"
  "time_range": "session", // or "last_5m", "last_30m"
  "format": "standard"     // or "minimal" (just key numbers), "verbose" (everything)
}
```

### analytics_timeline

Return the modification timeline, optionally filtered.

```json
{
  "file": "src/main.ts",  // optional: filter to specific file
  "agent": "agent-abc",   // optional: filter to specific agent
  "tool": "precision_edit", // optional: filter to specific tool
  "last_n": 20            // optional: last N entries
}
```

### analytics_compare

Compare current session to historical averages (if goodvibes memory has previous session data).

```json
{
  "compare_to": "average",  // or "last_session", "best_session"
  "metrics": ["tokens_saved", "cache_hit_rate", "success_rate"]
}
```

Response:
```json
{
  "comparison": {
    "tokens_saved": {"current": 910000, "average": 650000, "delta": "+40%"},
    "cache_hit_rate": {"current": "63.3%", "average": "55%", "delta": "+8.3%"},
    "success_rate": {"current": "89.4%", "average": "92%", "delta": "-2.6%"}
  }
}
```

### analytics_reset

Reset session analytics (useful for benchmarking a specific workflow).

```json
{
  "confirm": true,
  "preserve_cache": true  // reset stats but keep FileStateCache content
}
```

---

## Architecture

```
analytics-engine/          # Separate MCP server
  src/
    index.ts               # MCP server setup + tool registration
    handlers/
      analytics-summary.ts
      analytics-timeline.ts
      analytics-compare.ts
      analytics-reset.ts
    collectors/
      token-collector.ts   # Aggregates token savings from cache events
      exec-collector.ts    # Aggregates execution stats
      search-collector.ts  # Aggregates search stats
      fetch-collector.ts   # Aggregates fetch stats
    state/
      session-analytics.ts # SessionAnalytics singleton (aggregated metrics)
    schemas/
      index.ts             # MCP tool schemas
```

### Communication with precision-engine

Analytics-engine needs data from precision-engine's state singletons (FileStateCache, SessionState, ProcessManager, SearchCache, FetchCache). Two approaches:

**Option A — Shared module (recommended)**

State singletons live in a shared package that both MCP servers import. Both run in the same process (or the singletons use IPC/shared memory).

```
packages/
  shared-state/        # FileStateCache, SessionState, etc.
  precision-engine/    # Imports shared-state
  analytics-engine/    # Imports shared-state (read-only)
```

**Option B — Event bus**

Precision-engine emits events on state changes. Analytics-engine subscribes and aggregates.

```typescript
// precision-engine emits:
bus.emit('cache:hit', { path, tokensSaved });
bus.emit('edit:applied', { path, linesChanged });
bus.emit('exec:completed', { command, exitCode, durationMs });

// analytics-engine listens:
bus.on('cache:hit', (data) => tokenCollector.recordSaving(data));
```

Option A is simpler. Option B is cleaner for separation of concerns. Both work.

---

## Integration with Goodvibes

### End-of-Session Summary

When the MCP server shuts down (or on explicit request), analytics_summary is called and the results are:
1. Written to `.goodvibes/logs/activity.md` (session record)
2. Written to `.goodvibes/memory/` (patterns, preferences updated based on usage)
3. Displayed to the user (if the orchestrator is still active)

### Goodvibes Memory Updates

Analytics data feeds back into goodvibes memory:
- **patterns.json**: If a certain workflow pattern is consistently efficient, record it
- **preferences.json**: Auto-tune verbosity defaults based on observed usage (e.g., if user always overrides precision_edit to `with_diff`, update the default)
- **failures.json**: If certain commands consistently fail, record prevention tips

### Dashboard (Future)

A lightweight HTML dashboard served by analytics-engine that shows real-time session stats. Accessible via `http://localhost:<port>/dashboard`. Not in initial scope but the data model supports it.

---

## Configuration (via goodvibes.json)

```json
{
  "analytics_engine": {
    "enabled": true,
    "auto_summary_on_shutdown": true,
    "history_retention_sessions": 50,
    "timeline_max_entries": 1000,
    "cost_per_1k_input_tokens": 0.003,
    "cost_per_1k_output_tokens": 0.015
  }
}
```

Token cost estimates use configurable per-1K rates so savings calculations stay accurate as pricing changes.

---

## Dependencies

- **precision-engine state modules**: FileStateCache, SessionState, ProcessManager, SearchCache, FetchCache
- **No external dependencies**: Pure data aggregation over in-memory state
- **No LLM calls**: All computation is counting, averaging, and formatting

---

## Implementation Notes

- **Lightweight**: This server does no I/O except reading from shared state singletons and writing session summaries to `.goodvibes/`
- **Read-only relationship**: Analytics-engine never modifies precision-engine state. It only reads and aggregates.
- **Low token cost**: Analytics responses are compact (100-500 tokens for a full summary). The data justifies the cost.
- **Session-scoped**: All analytics reset on server restart. Historical data persists only in `.goodvibes/` logs and memory.
- **Should be built AFTER precision-engine Items 1, 8, 10 are implemented** — those create the state singletons that analytics-engine reads from.
