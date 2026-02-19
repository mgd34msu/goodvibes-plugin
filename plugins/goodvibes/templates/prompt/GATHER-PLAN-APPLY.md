## GATHER-PLAN-APPLY (GPA) Loop

Mandatory execution pattern. Minimize tool calls by batching all same-type operations into single calls.

### Initial Setup

Before starting any work, orient yourself:

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

### Rules

- **Always use precision tools** — native equivalents (Read, Write, Edit, Grep, Glob, WebFetch) are deprecated
- **Never use `precision_exec` for file search/read** — use discover, precision_grep, precision_glob, precision_read

### The Cycle

```
1. GATHER   — Targeted reads/greps. One call per tool type needed.
2. PLAN     — Zero tool calls. Think in text. Plan exact outputs.
3. APPLY    — Writes/edits/verification. One call per tool type needed.
4. LOOP     — Back to GATHER if scope changed or apply failed.
```

### Call Discipline

One call per tool type per phase. Batch all operations into that call's array.

| Phase | Tool Types | Batch Via |
|-------|-----------|----------|
| GATHER | `precision_read` (files[]), `precision_grep` (queries[]) | Per-file extract, per-query patterns |
| PLAN | None | Cognitive only |
| APPLY | `precision_write` (files[]), `precision_edit` (edits[]), `precision_exec` (commands[]) | Multiple files/edits/commands per call |

**Token-aware batching:** Check file sizes in the project index before batching reads. Keep total tokens per call under the overflow threshold to avoid creating temporary overflow files that require additional read calls to paginate.

### GATHER

Collect all context needed for the current task.

Batch reads into a single `precision_read` call with per-file extract modes. Choose the cheapest mode that gives you what you need — content > outline > symbols > lines > ast (Precision Mastery has the full extract reference).

Use the project index to estimate total tokens before batching. If the batch would overflow, split into multiple calls by token budget.

On loop iterations, GATHER only what changed — don't re-discover the whole project. Include a focused `discover` call only if scope has shifted.

**Skip GATHER only when:** task involves 1-2 files already in context, or has zero file I/O.

### PLAN

Zero tool calls. Think in text.

- Exact file paths to create, modify, or delete — not vague descriptions
- Exact changes per file (what to find, what to replace)
- Dependencies: independent (batchable) vs dependent (sequential)
- Batch opportunities: which steps collapse into a single call

```
Phase 1 (Non-blocking): create types.ts, auth.ts, api.ts
Phase 2 (Blocks 3): create useAuth.ts (imports from types.ts)
Phase 3 (Blocked by 2): update index.ts barrel
Phase 4 (Blocked by 3): typecheck + lint
```

### APPLY

Execute the plan with minimum calls.

- **`precision_write`** — new files, batch in `files[]`
- **`precision_edit`** — changes to existing files, batch in `edits[]`
- **`precision_exec`** — build/test/lint verification, batch in `commands[]`

Verbosity: count_only for writes, minimal for edits/exec (Precision Mastery has the full verbosity reference).

**On failure:** fix only failed operations — never re-run successful ones. If root cause was bad assumptions, LOOP back to GATHER.

### When to LOOP

- **Scope changed** — discovery reveals different situation than expected
- **Apply failed** — typecheck/test failure → re-gather with refined queries
- **New information** — requirements clarified mid-execution
- **Partial failure** — fix only failed ops, don't re-run successful ones

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

**APPLY — precision_write** (1 call):
```yaml
precision_write:
  files:
    - { path: "src/handlers/newFeature.ts", content: "..." }
  verbosity: count_only
```

**APPLY — precision_edit** (1 call):
```yaml
precision_edit:
  edits:
    - { path: "src/handlers/index.ts", find: "export { handleAuth }", replace: "export { handleAuth }\nexport { handleNewFeature }" }
  verbosity: minimal
```

**APPLY — precision_exec** (1 call):
```yaml
precision_exec:
  commands:
    - { cmd: "npx tsc --noEmit", expect: { exit_code: 0 } }
  verbosity: minimal
```

### Quick Reference

- **Extract modes**: content > outline > symbols > lines > ast — use cheapest sufficient mode (Precision Mastery)
- **Verbosity**: count_only for writes, minimal for edits/exec, standard for reads (Precision Mastery)
- **Tool selection**: discover for broad search, precision_read for known paths, precision_grep for content search
- **Overflow**: truncated results go to `.goodvibes/.overflow/` — paginate with precision_read line ranges
- **Escalation**: if precision tool genuinely fails, use native for THAT task only, then return to precision

---
