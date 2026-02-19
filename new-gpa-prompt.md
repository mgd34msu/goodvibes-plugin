## GATHER-PLAN-APPLY (GPA)

Mandatory execution pattern. Target: 3 tool calls per cycle.

### The Workflow

```
1. GATHER  (1-2 calls): discover + precision_read — all discovery and reads
2. PLAN    (0 calls):   Cognitive — plan exact outputs from gathered context
3. APPLY   (1 call):    precision_write/precision_edit/precision_exec — all outputs batched
```

### Call Budget

```
OPTIMAL (3 calls):
  1. discover({queries: [grep, glob, symbols]})       — batch all discovery
  2. precision_read({files: [...]})                    — batch all reads
  3. precision_write/precision_edit + precision_exec   — batch all outputs

MINIMAL (2 calls):
  1. discover({queries: [...]})                        — when only discovery needed
  2. precision_edit({edits: [...]})                    — when only edits needed

MAXIMAL (4 calls):
  1. discover({queries: [...]})                        — discovery
  2. precision_read({files: [...]})                    — reads
  3. precision_write({files: [...]})                   — new files
  4. precision_edit({edits: [...]}) + precision_exec   — edits + verification
```

Target: 3 calls. Never exceed 4.

### Precision Tool Batching

Every precision tool accepts arrays for batch operations in a single call:

| Tool | Batch Array | Purpose |
|------|-------------|--------|
| `discover` | `queries: [...]` | Batch grep + glob + symbols + structural |
| `precision_read` | `files: [...]` | Batch file reads with per-file extract modes |
| `precision_write` | `files: [...]` | Batch file creates/writes |
| `precision_edit` | `edits: [...]` | Batch edits across multiple files |
| `precision_exec` | `commands: [...]` | Batch build/test/deploy commands |
| `precision_grep` | `queries: [...]` | Batch content searches |
| `precision_glob` | `patterns: [...]` | Batch file pattern matching |
| `precision_fetch` | `urls: [...]` | Batch web fetches with per-URL extract modes |
| `precision_symbols` | `files: [...]` | Batch symbol extraction |

### Verbosity Defaults

Minimize tokens by using appropriate verbosity per operation:

| Operation | Default | Why |
|-----------|---------|-----|
| `precision_write` | **count_only** | You provided the content; just confirm success |
| `precision_edit` | **minimal** | Confirm applied; skip diffs unless debugging |
| `precision_read` | **standard** | You need the content |
| `precision_grep` (discovery) | **files_only** | Discovery phase, not content phase |
| `precision_grep` (content) | **matches** | Need actual matched lines |
| `precision_glob` | **paths_only** | You need file paths, not stats |
| `precision_exec` | **minimal** | Unless you need full stdout/stderr |
| `precision_fetch` | **standard** | You need the content |
| `discover` | **files_only** | Discovery phase, not content phase |
| `precision_symbols` | **locations** | File:line is usually enough |

### Phase 1: GATHER

One or two calls. Batch ALL input operations:
- Discovery queries via `discover` (grep, glob, symbols, structural)
- File reads via `precision_read` (content, outline, symbols, lines)

Use `discover` alone when only querying patterns. Add `precision_read` when you need file content.

**Verbosity:** `files_only` for discovery. `standard` for reads.

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

One call (two if mixing writes + edits to different files). Batch ALL output operations:
- New files via `precision_write({files: [...]})` — independent of each other
- Edits to existing files via `precision_edit({edits: [...]})` — independent of each other
- Verification via `precision_exec({commands: [...]})` — runs after writes/edits

All writes and edits to different files are independent. Batch them in their respective arrays.

### Full Cycle Example

**GATHER — discover** (1 call):
```json
{
  "queries": [
    {"id": "handlers", "type": "glob", "patterns": ["src/handlers/**/*.ts"]},
    {"id": "auth_usage", "type": "grep", "pattern": "useAuth|getSession", "glob": "src/**/*.ts"},
    {"id": "exports", "type": "symbols", "query": "handle", "kinds": ["function"]}
  ],
  "verbosity": "files_only"
}
```

**GATHER — precision_read** (1 call):
```json
{
  "files": [
    {"path": "src/handlers/index.ts", "extract": "content"},
    {"path": "src/types.ts", "extract": "symbols"}
  ],
  "output": {"format": "standard"}
}
```

**PLAN** (0 calls):
"Found 5 handlers, auth in 3 files. index.ts re-exports all handlers, types.ts exports HandlerConfig. I'll create the new handler, update the barrel export, and typecheck."

**APPLY — precision_write** (1 call):
```json
{
  "files": [
    {"path": "src/handlers/newFeature.ts", "content": "import { HandlerConfig } from '../types.js';\n..."}
  ],
  "verbosity": "count_only"
}
```

**APPLY — precision_edit + precision_exec** (1 call each):
```json
// precision_edit
{
  "edits": [
    {"path": "src/handlers/index.ts", "find": "export { handleAuth }", "replace": "export { handleAuth }\nexport { handleNewFeature }"}
  ],
  "verbosity": "minimal"
}

// precision_exec — verification
{
  "commands": [
    {"cmd": "npx tsc --noEmit", "expect": {"exit_code": 0}}
  ],
  "verbosity": "minimal"
}
```

### Handling Large Results

If output truncates, full results go to `.goodvibes/.overflow/`. Paginate with `precision_read` using `range: {start: 1, end: 100}`. Prevent overflow: start with `verbosity: count_only` to gauge scope, then narrow queries.

### When to LOOP

- Discovery reveals different situation than expected
- Apply fails (e.g., typecheck error) — re-gather with refined queries
- Requirements change mid-execution

### Tool Selection

```
Do I know the exact file paths?
  |-- Yes → precision_read (with appropriate extract mode)
  +-- No → Do I know a pattern?
      |-- Yes → precision_glob
      +-- No → Am I searching for content?
         |-- Yes → precision_grep
         +-- No → Am I searching for symbols?
            |-- Yes → precision_symbols
            +-- No → Use discover with multiple query types
```

Special-purpose tools (not in the GPA cycle):
- `precision_fetch` — API calls, web fetching with service auth and batch URLs
- `precision_notebook` — Jupyter notebook cell operations
- `precision_agent` — Spawn headless Claude sessions with dossier-based context
- `precision_config` — Runtime configuration (get/set/reload/mode)

### Rules

1. **Batch ALL inputs into 1-2 calls** — discover + precision_read, never separate grep/glob calls
2. **Batch ALL outputs into 1-2 calls** — precision_write/edit/exec, never individual file calls
3. **Plan = 0 tool calls** — cognitive only
4. **Never sequential calls of same tool type** — batch them in arrays
5. **ToolSearch is not part of GPA** — load tools once at start
6. **Check memory before implementing** — past failures and decisions save rework
7. **NEVER use precision_exec for file search** — use discover, precision_grep, precision_glob, precision_read
8. **Use appropriate verbosity** — count_only for writes/edits, standard for reads, files_only for discovery
