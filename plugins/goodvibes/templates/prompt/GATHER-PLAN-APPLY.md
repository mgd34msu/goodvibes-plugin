## GATHER-PLAN-APPLY (GPA) Loop

Execution pattern for all agents. Understand before you act, batch what you can, don't waste tokens.

### Initial Setup

Run once per session to orient yourself. This is separate from GATHER — you discover the landscape once, then gather targeted context per task.

1. **Check `.goodvibes/memory/`** for prior context:
   - `failures.json` — avoid repeating past mistakes
   - `patterns.json` — reuse proven approaches
   - `decisions.json` — respect architectural constraints

2. **Discover the landscape** — single `discover` call with all queries batched:
   - `glob` — find files by path pattern
   - `grep` — find files containing pattern
   - `symbols` — find exported functions/types
   - `structural` — find AST patterns

   Use `files_only` verbosity. For unknown scope, start `count_only` to gauge size.

   Discovery refreshes the **project index** — a session-level project tree with token sizes per file, created at session start and updated by `discover`, `precision_write`, and `precision_edit`. Use it to estimate batch sizes and avoid overflow.

### The Cycle

```
GATHER → PLAN → APPLY → loop if needed
```

| Phase | Tool Types | Batch Via |
|-------|-----------|----------|
| GATHER | `precision_read` (files[]), `precision_grep` (queries[]) | Per-file extract, per-query patterns |
| PLAN | None | Cognitive only |
| APPLY | `precision_write` (files[]), `precision_edit` (edits[]), `precision_exec` (commands[]) | Multiple files/edits/commands per call |

**GATHER** — Collect context for the current task. Batch reads and greps where possible (inconvenient does not mean impossible) — multiple files in one `precision_read`, multiple queries in one `precision_grep`. Use the cheapest extract mode and verbosity that gives you what you need (see Precision Mastery for the full reference).

Use the project index to estimate total tokens before batching. To prevent overflow, aim to keep requests below a soft cap of 7500 tokens and NEVER exceed 10000. If the batch would overflow, split the read or grep into multiple calls. Otherwise, always batch. For individual files that exceed the 10000 token cap, use multiple precision_read calls that specify line numbers to read the file in chunks.

NOTE: Overflow Limit - set by Claude Code, truncates tool results that exceed 7500 to 10000 tokens depending on content.

On loop iterations, gather only what changed. Do not re-discover the whole project.

**Skip GATHER only when:** task involves 1-2 files already in context, or has zero file I/O.

**PLAN** — Stop and think. No tool calls. Identify:
- Exact file paths to create, modify, or delete
- Exact changes per file (find/replace pairs, new content)
- Dependencies: independent (batchable) vs. dependent (sequential)
- Batch opportunities: which operations collapse into a single call

Scale the plan to the task. A single-file edit needs a sentence, not a phased dependency graph.

**APPLY** — Execute the plan. Batch independent operations into single calls where possible.

- **`precision_write`** — new files, batch in `files[]`. Verbosity: `count_only`
- **`precision_edit`** — changes to existing files, batch in `edits[]`. Verbosity: `minimal`
- **`precision_exec`** — build/test/lint verification, batch in `commands[]`. Verbosity: `minimal`

See Precision Mastery for full verbosity and batching reference.

**On failure:** fix only failed operations — never re-run successful ones. If root cause was bad assumptions, loop back to GATHER.

### When to Loop

- **Scope changed** — discovery reveals different situation than expected
- **Apply failed** — typecheck/test failure requiring re-gathered context
- **New information** — requirements clarified mid-execution
- **Partial failure** — fix only failed ops, don't re-run successful ones

### Hard Rules

These prevent the most expensive mistakes. Not preferences.

- Always check `.goodvibes/memory/` before starting work
- Always plan before applying — even one sentence prevents wasted edits
- Always use the cheapest extract mode and verbosity sufficient for the task (see Precision Mastery)
- Always log genuine precision tool failures to `memory/failures.json`
- Never use deprecated native tools (Read, Write, Edit, Grep, Glob, WebFetch) when precision equivalents work — native tools are deprecated fallbacks only
- Never use `precision_exec` for file search/read — use `precision_grep`, `precision_glob`, `precision_read`, `discover`
- Never use Bash `cat`, `grep`, `find`, `rg`, `ls` — these are replaced by precision equivalents
- Never use `verbose` or `standard` verbosity for writes/edits — you provided the content, use `count_only` or `minimal`
- Never read full `content` when `outline`, `symbols`, or `lines` suffices — see Precision Mastery extract modes
- Never make sequential single-item calls when the same tool accepts arrays — batch them
- Never re-read content you just wrote — you know what's in it

### Quick Reference

- **Extract modes**: `lines` (80-95% savings) → `symbols` (70-90%) → `outline` (60-80%) → `ast` (50-70%) → `content` (0%) — use cheapest sufficient mode (see Precision Mastery)
- **Verbosity**: `count_only` for writes, `minimal` for edits/exec, `standard` for reads (see Precision Mastery)
- **Tool selection**: `discover` for broad search, `precision_read` for known paths, `precision_grep` for content search (see Precision Mastery)
- **Overflow**: truncated results go to `.goodvibes/.overflow/` — paginate with `precision_read` line ranges
- **Escalation**: if precision tool genuinely fails, use deprecated native tool for THAT task only, then return to precision

### Example

**Initial Setup — memory check + discover** (1 call):
```yaml
discover:
  queries:
    - { id: handlers, type: glob, patterns: ["src/handlers/**/*.ts"] }
    - { id: auth, type: grep, pattern: "useAuth|getSession", glob: "src/**/*.ts" }
    - { id: exports, type: symbols, query: "handle", kinds: ["function"] }
  verbosity: files_only
```

**GATHER — precision_read** (1 call):
```yaml
precision_read:
  files:
    - { path: "src/handlers/index.ts", extract: content }
    - { path: "src/types.ts", extract: symbols }
  output: { format: standard }
```

**PLAN** (0 calls):
"Found 5 handlers, auth in 3 files. I'll create the new handler, update barrel export, typecheck."

**APPLY — precision_write + precision_edit + precision_exec** (3 calls):
```yaml
precision_write:
  files:
    - { path: "src/handlers/newFeature.ts", content: "..." }
  verbosity: count_only
```
```yaml
precision_edit:
  edits:
    - { path: "src/handlers/index.ts", find: "export { handleAuth }", replace: "export { handleAuth }\nexport { handleNewFeature }" }
  verbosity: minimal
```
```yaml
precision_exec:
  commands:
    - { cmd: "npx tsc --noEmit", expect: { exit_code: 0 } }
  verbosity: minimal
```

---
