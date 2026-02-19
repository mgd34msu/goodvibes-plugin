## PRECISION MASTERY (Auto-loaded for all subagents)

The precision engine replaces native tools (Read, Edit, Write, Grep, Glob, WebFetch) with token-efficient equivalents. Correct usage saves 75-95% of tokens.

## Verbosity Cheat Sheet

| Operation | Recommended | Why |
|-----------|-------------|-----|
| `precision_write` | **count_only** | You provided the content; just confirm success |
| `precision_edit` | **minimal** | Confirm applied; skip diffs unless debugging |
| `precision_read` | **standard** | You need the content |
| `precision_grep` (discovery) | **files_only** via output.format | Discovery phase, not content phase |
| `precision_grep` (content) | **matches** via output.format | Need actual matched lines |
| `precision_glob` | **paths_only** via output.format | You need file paths, not stats |
| `precision_exec` (verify) | **minimal** | Unless you need full stdout/stderr |
| `precision_exec` (debug) | **standard** | Need output to diagnose |
| `precision_fetch` | **standard** | You need the content |
| `discover` | **files_only** (verbosity param) | Discovery phase, not content phase |
| `precision_symbols` | **locations** (verbosity param) | File:line is usually enough |

**Token Multipliers**: `count_only` ~0.05x | `minimal` ~0.2x | `standard` ~0.6x | `verbose` 1.0x

**Golden Rule**: Use `count_only` for writes/edits — you just wrote the content, don't read it back.

## Extract Modes (`precision_read`)

| Mode | When to Use | Savings | Example |
|------|------------|---------|--------|
| `content` | Need full file | 0% | Config files, code to edit |
| `outline` | Need structure | 60-80% | File org, finding functions |
| `symbols` | Need exported symbols | 70-90% | Import statements, API surface |
| `ast` | Need structural patterns | 50-70% | Refactoring, pattern detection |
| `lines` | Need specific line ranges | 80-95% | Specific functions after grep |

**Best Practices**:
1. Use `outline` to understand structure before deciding if you need `content`
2. Use `symbols` when building imports or understanding API surface
3. Use `lines` with `range: { start, end }` after grep finds a location
4. Only use `content` when you actually need implementation details

## Grep Output Formats (`precision_grep`)

| Format | Use Case | Token Cost |
|--------|----------|------------|
| `count_only` | Gauge scope | Very Low |
| `files_only` | Discovery phase | Low |
| `locations` | Find where something exists | Medium |
| `matches` | Need actual matched lines | High |
| `context` | Need surrounding code | Very High |

**Progressive Disclosure**: `count_only` → `files_only` → `matches` (only go deeper as needed)

## Precision Tool Batching (Optimal Pattern)

Use built-in batching arrays to maximize operations per call:

```yaml
# Batch read: multiple files in one call
precision_read:
  files:
    - { path: "src/types.ts", extract: symbols }
    - { path: "src/auth/config.ts", extract: content }
  verbosity: standard

# Batch write: multiple files in one call
precision_write:
  files:
    - { path: "src/auth/types.ts", content: "export interface User { id: string; }" }
    - { path: "src/auth/index.ts", content: "export * from './types';" }
  verbosity: count_only

# Batch exec: multiple commands in one call
precision_exec:
  commands:
    - { cmd: "npm run typecheck", expect: { exit_code: 0 } }
    - { cmd: "npm run lint", expect: { exit_code: 0 } }
  verbosity: minimal
```

Each tool accepts arrays: `precision_read` uses `files` array, `precision_write` uses `files` array, `precision_edit` uses `edits` array, `precision_exec` uses `commands` array.

## precision_exec Features

**ONLY for build/test/deploy commands** (npm run, npx, git). NEVER for file search/read — use precision_grep, precision_glob, precision_read.

- **Background**: `background: true` — run long-running processes without blocking
- **Retry**: `retry: { max: 3, delay_ms: 1000 }` — automatically retry flaky commands
- **Until**: `until: { pattern: "ok", timeout_ms: 30000 }` — poll until condition is met

## precision_fetch Features

- **Batch URLs**: Pass multiple `{ url: "..." }` objects in one call — fetched in parallel
- **Extract modes**: Per-URL `extract:` field — `raw`, `text`, `json`, `markdown`, `structured`
- **Service auth**: `service: "OpenAI"` — auto-applies bearer token + headers from service registry

## Decision Tree: Which Tool?

```
Do I know the exact file paths?
  |-- Yes -- precision_read (with appropriate extract mode)
  +-- No -- Do I know a pattern?
      |-- Yes -- precision_glob
      +-- No -- Am I searching for content?
         |-- Yes -- precision_grep
         +-- No -- Am I searching for symbols?
            |-- Yes -- precision_symbols
            +-- No -- Use discover with multiple query types
```

**Special-purpose tools** (not in tree above):
- `precision_notebook` — Jupyter notebook cell operations (replace/insert/delete with cell_id targeting)
- `precision_agent` — Spawn headless Claude sessions with dossier-based context injection
- `precision_config` — Runtime configuration (get/set/reload)

## Common Mistakes

- Don't read `outline` then re-read `content` — decide upfront; read `content` once if you'll need it
- Don't skip `.goodvibes/memory/` checks — past failures and decisions save rework
- Don't read full files when `outline` or `symbols` suffices
- Don't make sequential calls of same tool — batch them (3+ calls → always batch)
- Don't use `verbose` verbosity for writes/edits — use `count_only`
- Don't use native tools (Read, Write, Edit, Grep, Glob, WebFetch) — always use precision equivalents
- NEVER use precision_exec to run grep, find, rg, cat, ls — use precision_grep, precision_glob, precision_read
- Don't abandon precision tools after one failure — use native for THAT task only, then return
- For large batch reads (20+ files), use `token_budget` and `page` params to prevent truncation

## Escalation

1. **Check the error** — is it user error (wrong path, bad syntax)? Fix and retry.
2. **If tool genuinely fails** — use native tool for THAT SPECIFIC TASK only.
3. **Return to precision tools** — for all subsequent operations.
4. **Log the failure** — to `.goodvibes/memory/failures.json`.

---
