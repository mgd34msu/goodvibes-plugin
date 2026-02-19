## GATHER-PLAN-APPLY (GPA) Loop

Mandatory execution pattern for all subagents. Replaces ad-hoc tool usage with a disciplined 3-phase cycle that minimizes tool calls while maximizing context gathering.

**Why GPA over DPB (Discover-Plan-Batch)?** The names describe what you actually do: GATHER context, PLAN your changes, APPLY them. "Discover" undersold the phase (it includes reads, not just discovery). "Batch" described a mechanism, not an intent.

### The Cycle

```
0. LOAD TOOLS  (once per session, not part of GPA)
1. GATHER      (1-2 calls)  — All discovery + reads batched
2. PLAN        (0 calls)    — Cognitive only, plan exact outputs
3. APPLY       (1-2 calls)  — All writes + edits + verification batched
4. LOOP        — Back to GATHER if needed
```

### Call Budget

| Scenario | Calls | How |
|----------|-------|-----|
| **Optimal** | 3 | discover → precision_read → precision_write/edit |
| **Minimal** | 2 | discover → precision_edit (when discovery + edits suffice) |
| **Maximal** | 4 | discover → precision_read → precision_write → precision_edit + precision_exec |

**Target: 3 calls per cycle. Never exceed 4.**

---

### Phase 1: GATHER

One or two calls. Batch ALL input operations.

**Call 1 — Discovery** (`discover` tool):
Batch all queries into a single `discover` call. Query types:

| Type | Purpose | Example |
|------|---------|--------|
| `glob` | Find files by path pattern | `"src/handlers/**/*.ts"` |
| `grep` | Find files containing pattern | `"useAuth\|getSession"` |
| `symbols` | Find exported functions/types | `query: "handle", kinds: ["function"]` |
| `structural` | Find AST patterns | `"console.log"` calls |

Verbosity: `files_only` for discovery. Use `count_only` first for large/unknown scopes.

**Call 2 — Reads** (`precision_read` tool, if needed):
Batch all file reads into a single `precision_read` call with per-file extract modes:

| Extract | When | Token Savings |
|---------|------|---------------|
| `content` | Need full implementation | 0% |
| `outline` | Need file structure | 60-80% |
| `symbols` | Need exports/imports | 70-90% |
| `lines` | Need specific range (after grep) | 80-95% |
| `ast` | Need structural patterns | 50-70% |

Verbosity: `standard` for reads.

**Before GATHER, always check `.goodvibes/memory/`:**
- `failures.json` — Has this been attempted before? What went wrong?
- `patterns.json` — Are there proven approaches for this type of work?
- `decisions.json` — What architectural constraints apply?

**Skip GATHER only when:** Task is 1-2 files already fully in context, or has zero file I/O.

---

### Phase 2: PLAN

Zero tool calls. Think in text.

**Required plan elements:**
- Exact file paths to create, modify, or delete (not vague descriptions)
- Exact changes per file (what to find, what to replace)
- Dependency analysis: which operations are independent (batchable) vs dependent (sequential)
- Batch opportunities: which steps collapse into a single call

**Dependency labeling:**
```
Phase 1 (Non-blocking — parallel): create types.ts, auth.ts, api.ts
Phase 2 (Blocks Phase 3 — depends on Phase 1): create useAuth.ts (imports from types.ts)
Phase 3 (Blocked by Phase 2): update index.ts barrel export
Phase 4 (Blocked by Phase 3): run typecheck + lint
```

---

### Phase 3: APPLY

One or two calls. Batch ALL output operations.

**Writes** — `precision_write({files: [...]})`: New files, independent of each other.
**Edits** — `precision_edit({edits: [...]})`: Changes to existing files, independent of each other.
**Verification** — `precision_exec({commands: [...]})`: Build/test/lint after writes/edits.

All writes and edits to different files are independent — batch them in their respective arrays.

**Verbosity:**
| Operation | Verbosity | Why |
|-----------|-----------|-----|
| `precision_write` | `count_only` | You provided the content; just confirm success |
| `precision_edit` | `minimal` | Confirm applied; skip diffs unless debugging |
| `precision_exec` | `minimal` | Unless you need full stdout/stderr |

**Failure handling:**
- Fix only the failed operations — never re-run successful ones
- If root cause was bad assumptions, LOOP back to GATHER
- Log failures to `.goodvibes/memory/failures.json`

---

### Precision Tool Batching Reference

Every precision tool accepts arrays for batch operations in a single call:

| Tool | Batch Array | Purpose |
|------|-------------|--------|
| `discover` | `queries: [...]` | Batch grep + glob + symbols + structural |
| `precision_read` | `files: [...]` | Batch reads with per-file extract modes |
| `precision_write` | `files: [...]` | Batch file creates |
| `precision_edit` | `edits: [...]` | Batch edits across files |
| `precision_exec` | `commands: [...]` | Batch build/test/deploy commands |
| `precision_grep` | `queries: [...]` | Batch content searches |
| `precision_glob` | `patterns: [...]` | Batch file pattern matching |
| `precision_fetch` | `urls: [...]` | Batch web fetches |
| `precision_symbols` | `files: [...]` | Batch symbol extraction |

---

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

**APPLY — precision_write + precision_edit** (1-2 calls):
```json
// precision_write — new files
{
  "files": [
    {"path": "src/handlers/newFeature.ts", "content": "import { HandlerConfig } from '../types.js';\n..."}
  ],
  "verbosity": "count_only"
}

// precision_edit + precision_exec — edits + verification
{
  "edits": [{"path": "src/handlers/index.ts", "find": "export { handleAuth }", "replace": "export { handleAuth }\nexport { handleNewFeature }"}],
  "verbosity": "minimal"
}
{
  "commands": [{"cmd": "npx tsc --noEmit", "expect": {"exit_code": 0}}],
  "verbosity": "minimal"
}
```

---

### Handling Large Results

If discover or precision_grep truncates output, full results are written to `.goodvibes/.overflow/`. Paginate with:
```json
{"files": [{"path": ".goodvibes/.overflow/discover_result.txt", "range": {"start": 1, "end": 100}}]}
```
Increment range for subsequent pages. To avoid overflow, start with `verbosity: count_only` to gauge scope, then narrow queries.

---

### When to LOOP

- **Scope changed** — discovery reveals different situation than expected
- **Apply failed** — typecheck error, import error, test failure → re-gather with refined queries
- **New information** — requirements clarified mid-execution
- **Partial failure** — fix only failed operations, don't re-run successful ones

When looping, re-discover with *refined* queries targeting the new information.

---

### Tool Selection Tree

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

**Special-purpose tools** (outside the GPA cycle):
- `precision_fetch` — API calls, web fetching with service auth
- `precision_notebook` — Jupyter notebook cell operations
- `precision_agent` — Spawn headless Claude sessions with dossier context
- `precision_config` — Runtime configuration (get/set/reload/mode)

---

### Common Mistakes

- Don't use separate `precision_glob`/`precision_grep` calls for discovery — use `discover` to batch them
- Don't read `outline` then re-read `content` — decide upfront; read `content` once if you need it
- Don't skip `.goodvibes/memory/` checks — past failures save rework
- Don't make sequential calls of the same tool type — batch them in arrays
- Don't use `verbose` verbosity for writes/edits — use `count_only`
- Don't use native tools (Read, Write, Edit, Grep, Glob, WebFetch) — use precision equivalents
- NEVER use `precision_exec` to run grep, find, rg, cat, ls — use discover/precision_grep/precision_glob/precision_read
- Don't abandon precision tools after one failure — use native for THAT task only, then return
- Don't write vague plans — always list exact file paths and changes
- Don't plan without identifying batch opportunities — missed batching = wasted tokens
- Don't re-run successful operations after partial failure — fix only what failed

### Escalation

1. **Check the error** — is it user error (wrong path, bad syntax)? Fix and retry.
2. **If tool genuinely fails** — use native tool for THAT SPECIFIC TASK only.
3. **Return to precision tools** — for all subsequent operations.
4. **Log the failure** — to `.goodvibes/memory/failures.json`.

---
