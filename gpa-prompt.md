## GATHER-PLAN-APPLY (GPA)

Mandatory execution pattern. Target: 2 tool calls per cycle.

### The Workflow

```
1. GATHER  (1 call):  batch — all discovery + reads in parallel
2. PLAN    (0 calls): Cognitive — plan exact outputs from gathered context
3. APPLY   (1 call):  batch — all writes + edits + verification in parallel
```

### Call Budget

```
WITHOUT batch (3-4 calls):
  1. discover({queries: [grep, glob, symbols]})
  2. precision_read({files: [...]})
  3. precision_write({files: [...]})
  4. precision_edit({edits: [...]})

WITH batch (2 calls):
  1. batch({discovery: ..., operations: {read: [...]}})
  2. batch({operations: {write: [...], edit: [...], exec: [...]}})

Same result. Half the calls. Atomic rollback included free.
```

Max 3 calls if batch isn't loaded (discover + precision_read + precision_write/edit).

### Phase 1: GATHER

One call. Batch ALL input operations together:
- Discovery queries (grep, glob, symbols, structural)
- File reads (content, outline, symbols, lines)
- These are independent — they run in parallel inside batch

Use `batch` when mixing discovery + reads. Use `discover` alone when only querying patterns with no file reads.

**Verbosity:** `files_only` for discovery queries. `standard` for reads you need content from.

**Skip GATHER only when:** task involves 1-2 files already in context, or has zero file I/O.

**Always check .goodvibes/memory/ first:** `failures.json` (attempted before?), `patterns.json` (proven approaches?), `decisions.json` (constraints?).

### Phase 2: PLAN

Zero tool calls. Think in text:
- Exact file paths to create, modify, or delete
- Exact changes per file
- Which outputs are independent (batchable) vs dependent (sequential)

**Dependency labeling:**
```
Phase 1 (Non-blocking): create types.ts, auth.ts, api.ts
Phase 2 (Blocked by 1): create useAuth.ts (imports from types.ts)
Phase 3 (Blocked by 2): update index.ts barrel export
```

### Phase 3: APPLY

One call. Batch ALL output operations together:
- New files (precision_write) — independent of each other
- Edits to existing files (precision_edit) — independent of each other
- Verification commands (precision_exec) — runs after writes/edits

All writes and edits to different files are independent. Batch them.

Use `batch` when mixing writes + edits + exec. Use a single `precision_write` or `precision_edit` if only one operation type is needed.

### Full Cycle Example

**GATHER** (1 call — discovery + reads):
```json
{
  "discovery": {
    "queries": [
      {"id": "handlers", "type": "glob", "patterns": ["src/handlers/**/*.ts"]},
      {"id": "auth_usage", "type": "grep", "pattern": "useAuth|getSession", "glob": "src/**/*.ts"},
      {"id": "exports", "type": "symbols", "query": "handle", "kinds": ["function"]}
    ]
  },
  "operations": {
    "read": [{"files": [
      {"path": "src/handlers/index.ts", "extract": "content"},
      {"path": "src/types.ts", "extract": "symbols"}
    ]}]
  },
  "verbosity": "standard"
}
```

**PLAN** (0 calls):
"Found 5 handlers, auth in 3 files. index.ts re-exports all handlers, types.ts exports HandlerConfig. I'll create the new handler, update the barrel export, and typecheck."

**APPLY** (1 call — writes + edits + exec):
```json
{
  "operations": {
    "write": [{"files": [
      {"path": "src/handlers/newFeature.ts", "content": "import { HandlerConfig } from '../types.js';\n..."}
    ]}],
    "edit": [{"edits": [
      {"path": "src/handlers/index.ts", "find": "export { handleAuth }", "replace": "export { handleAuth }\nexport { handleNewFeature }"}
    ]}],
    "exec": [{"commands": [
      {"cmd": "npx tsc --noEmit", "expect": {"exit_code": 0}}
    ]}]
  },
  "verbosity": "minimal"
}
```

### Handling Large Results

If output truncates, full results go to `.goodvibes/.overflow/`. Paginate with precision_read using `range: {start: 1, end: 100}`. Prevent overflow: start with `verbosity: count_only` to gauge scope, then narrow queries.

### When to LOOP

- Discovery reveals different situation than expected
- Apply fails (e.g., typecheck error) — re-gather with refined queries
- Requirements change mid-execution

### Rules

1. **Batch ALL inputs into 1 call** — discovery + reads together, never separate
2. **Batch ALL outputs into 1 call** — writes + edits + exec together, never separate
3. **Plan = 0 tool calls** — cognitive only
4. **Never sequential calls of same tool type** — batch them
5. **ToolSearch is not part of GPA** — load tools once at start
6. **Check memory before implementing** — past failures and decisions save rework
7. **NEVER use precision_exec for file search** — use discover, precision_grep, precision_glob

For batch tool schema, defaults, and lifecycle tools: see [batch-prompt.md](batch-prompt.md).