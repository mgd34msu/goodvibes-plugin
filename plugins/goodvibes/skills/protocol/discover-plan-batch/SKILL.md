---
name: discover-plan-batch
description: "MANDATORY before starting any task. Defines the strict 3-call-per-cycle Discover-Plan-Batch loop. D: Single discover call with all queries batched. P: Plan in text (zero tool calls). B: Single batched precision call. Target: 3 tool calls per DPB cycle."
metadata:
  version: 2.0.0
  category: protocol
  tags: [dpb, discover, plan, batch, workflow, token-efficiency, strict-workflow]
---

# Discover-Plan-Batch Protocol (Strict 3-Call Workflow)

The DPB loop enforces a strict **3-call-per-cycle** workflow that eliminates token waste from excessive tool calls. This is NOT a suggestion — it is a MANDATORY execution pattern for all GoodVibes agents.

## THE EXACT WORKFLOW

```
0. LOAD SKILLS (once, before any DPB cycle)
   - Call get_skill_content for role-relevant skills
   - This is NOT part of the DPB cycle itself

1. D — DISCOVER (1 tool call)
   - Single `discover` call with ALL queries batched inside
   - Multiple query types (glob, grep, symbols, structural) in one call
   - Also include .goodvibes/memory reads in the discover batch
   - Output: files_only or locations (minimal verbosity)

2. P — PLAN (0 tool calls, cognitive only)
   - Agent thinks about what it needs from discovery results
   - Plans which files to read (with extract modes), what patterns to grep
   - Plans the EXACT precision_read/precision_grep/precision_glob call
   - All token INPUT operations get planned here

3. B — BATCH INPUT (1 tool call)
   - Single precision_read with multiple files batched internally
   - OR single precision_grep with multiple queries batched internally  
   - OR batch_engine batch wrapping multiple precision_* tools if DIFFERENT tool types needed
   - Key: 1 call, everything batched inside it

4. P — PLAN (0 tool calls, cognitive only)
   - Agent now has all the information it needs
   - Plans which files to write/create and which edits to make
   - Plans the EXACT precision_write/precision_edit call
   - All token OUTPUT operations get planned here

5. B — BATCH OUTPUT (1 tool call)
   - Single precision_write with multiple files batched internally
   - OR single precision_edit with multiple edits batched internally
   - OR batch_engine batch wrapping precision_write + precision_edit if both needed
   - Key: 1 call, everything batched inside it

6. LOOP — Back to D if:
   - Results didn't match expectations
   - Scope changed
   - Validation failed (run precision_exec to validate, then loop)
```

## CALL BUDGET PER CYCLE

| Phase | Tool Calls | Type | Purpose |
|-------|-----------|------|----------|
| **D** (Discover) | 1 | `discover` | All discovery queries batched |
| **P** (Plan) | 0 | Cognitive | Plan input operations |
| **B** (Batch Input) | 1 | `precision_*` or `batch` | All reads/greps batched |
| **P** (Plan) | 0 | Cognitive | Plan output operations |
| **B** (Batch Output) | 1 | `precision_*` or `batch` | All writes/edits batched |
| **TOTAL** | **3** | | |

Validation (`precision_exec`) is OPTIONAL and happens AFTER the cycle completes, not during.

## KEY RULES (NON-NEGOTIABLE)

1. **`discover` batches ALL discovery queries into 1 call** — NEVER use separate `precision_glob`, `precision_grep`, `precision_read` for discovery
2. **Plan steps produce ZERO tool calls** — they are cognitive (agent thinks in text)
3. **Batch input = 1 call** — use internal batching (`files` array, `queries` array) or `batch_engine`
4. **Batch output = 1 call** — use internal batching (`files` array, `edits` array) or `batch_engine`
5. **NEVER make sequential calls of the same tool type** — if you need 3 files read, batch them in 1 `precision_read` call
6. **ToolSearch is NOT part of DPB** — load tools once at start, don't search mid-cycle

## Phase 1: DISCOVER (1 call)

### The `discover` Tool

The `discover` tool runs multiple grep/glob/symbols/structural queries **in parallel**, returning results keyed by query ID. This is your ONLY discovery mechanism.

**Pattern: Batch ALL discovery queries**

```yaml
# GOOD: 1 discover call with everything
discover:
  queries:
    - id: existing_files
      type: glob
      patterns: ["src/features/auth/**/*.ts"]
    - id: existing_patterns
      type: grep
      pattern: "export (function|const|class)"
      glob: "src/features/**/*.ts"
    - id: exported_hooks
      type: symbols
      query: "use"
      kinds: ["function"]
    - id: console_logs
      type: structural
      structural_pattern: "console.log($$$ARGS)"
  verbosity: files_only
```

**Query types:**
- **glob** - Find files by path patterns
- **grep** - Find files containing patterns
- **symbols** - Find exported functions/types/classes
- **structural** - Find AST patterns (e.g., function calls)

**Output modes:**
- `count_only` - Just counts (scope estimation)
- `files_only` - File paths only (building target lists) ← **USE THIS**
- `locations` - File paths + line numbers (when you need exact locations)

### Include Memory Reads in Discovery

While `.goodvibes/memory/*.json` files should ideally be read via `discover` with file-content queries, the current `discover` tool doesn't support file content reads. Use `precision_read` for memory files, but batch them with your Batch Input phase (step 3), not as separate calls.

### [BAD] vs [GOOD] Discovery Patterns

**[BAD] — Sequential discovery queries (19+ tool calls)**

```yaml
# BAD: 4 separate tool calls for discovery
precision_glob:
  patterns: ["src/**/*.ts"]

precision_grep:
  queries:
    - id: exports
      pattern: "export function"

precision_read:
  files:
    - path: ".goodvibes/memory/failures.json"

precision_grep:
  queries:
    - id: imports
      pattern: "import.*from"
```

**[GOOD] — Single discover call (1 tool call)**

```yaml
# GOOD: 1 discover call with all queries
discover:
  queries:
    - id: files
      type: glob
      patterns: ["src/**/*.ts"]
    - id: exports
      type: grep
      pattern: "export function"
      glob: "src/**/*.ts"
    - id: imports
      type: grep
      pattern: "import.*from"
      glob: "src/**/*.ts"
  verbosity: files_only

# Then batch memory reads with your Batch Input phase
```

## Phase 2: PLAN (0 calls, cognitive only)

### Purpose

Planning is **cognitive work**, not tool calls. You think in text about:

- Which files to read (with extract modes)
- Which patterns to grep
- The EXACT `precision_read` or `precision_grep` call structure
- What you'll do with the results

**Output: A written plan with NO tool calls**

### Plan Structure

```
Plan:
1. Read the following files:
   - src/types/user.ts (extract: symbols) — need User interface
   - src/config/app.ts (extract: outline) — check structure
   - .goodvibes/memory/decisions.json (content) — check arch decisions

2. Batch into 1 precision_read call with 3 files

3. Expected result: User interface, app config structure, decisions
```

### [BAD] vs [GOOD] Planning

**[BAD] — Vague plan that leads to sequential calls**

```
Plan:
- Read some files
- Check patterns
- Maybe grep for something
```

This leads to:
```yaml
precision_read: ...
precision_read: ...  # Second call!
precision_grep: ...  # Third call!
```

**[GOOD] — Specific plan with exact batch structure**

```
Plan:
1. Read 3 files in 1 precision_read call:
   - src/types/user.ts (symbols)
   - src/config/app.ts (outline)
   - .goodvibes/memory/decisions.json (content)

2. Batch call structure:
   precision_read:
     files: [{path: ..., extract: symbols}, {path: ..., extract: outline}, {path: ...}]
```

This leads to:
```yaml
precision_read:  # Single call
  files:
    - path: "src/types/user.ts"
      extract: symbols
    - path: "src/config/app.ts"
      extract: outline
    - path: ".goodvibes/memory/decisions.json"
```

## Phase 3: BATCH INPUT (1 call)

### Pattern: Batch All Reads

**Single precision_read with multiple files:**

```yaml
precision_read:
  files:
    - path: "src/types/user.ts"
      extract: symbols
    - path: "src/types/auth.ts"
      extract: symbols
    - path: "src/config/app.ts"
      extract: outline
    - path: ".goodvibes/memory/decisions.json"
  verbosity: minimal
```

**OR single precision_grep with multiple queries:**

```yaml
precision_grep:
  queries:
    - id: auth_usage
      pattern: "useAuth|getSession"
      glob: "src/**/*.tsx"
    - id: api_calls
      pattern: "fetch|axios"
      glob: "src/**/*.ts"
  output:
    format: files_only
  verbosity: minimal
```

**OR batch_engine wrapping different tool types:**

```yaml
batch:
  operations:
    read:
      - files:
          - path: "src/types/user.ts"
            extract: symbols
    query:
      - type: grep
        queries:
          - id: exports
            pattern: "export function"
            glob: "src/**/*.ts"
```

### [BAD] vs [GOOD] Input Batching

**[BAD] — 3 separate precision_read calls**

```yaml
precision_read:
  files:
    - path: "src/types/user.ts"

precision_read:  # Second call!
  files:
    - path: "src/types/auth.ts"

precision_read:  # Third call!
  files:
    - path: "src/config/app.ts"
```

**[GOOD] — 1 precision_read call with 3 files**

```yaml
precision_read:
  files:
    - path: "src/types/user.ts"
    - path: "src/types/auth.ts"
    - path: "src/config/app.ts"
  verbosity: minimal
```

## Phase 4: PLAN (0 calls, cognitive only)

### Purpose

You now have all the information from Batch Input. Plan your output operations:

- Which files to create/write
- Which files to edit
- The EXACT `precision_write` or `precision_edit` call structure

**Output: A written plan with NO tool calls**

### Plan Structure

```
Plan:
1. Create the following files:
   - src/features/auth/types.ts (User interface)
   - src/features/auth/hooks.ts (useAuth hook)
   - src/features/auth/index.ts (barrel export)

2. Batch into 1 precision_write call with 3 files

3. Expected result: 3 new files created
```

## Phase 5: BATCH OUTPUT (1 call)

### Pattern: Batch All Writes/Edits

**Single precision_write with multiple files:**

```yaml
precision_write:
  files:
    - path: "src/features/auth/types.ts"
      content: |
        export interface User {
          id: string;
          email: string;
        }
    - path: "src/features/auth/hooks.ts"
      content: |
        import type { User } from './types';
        export function useAuth(): User | null { /*...*/ }
    - path: "src/features/auth/index.ts"
      content: |
        export * from './types';
        export * from './hooks';
  verbosity: minimal
```

**OR single precision_edit with multiple edits:**

```yaml
precision_edit:
  edits:
    - path: "src/app/layout.tsx"
      find: "<App />"
      replace: "<AuthProvider><App /></AuthProvider>"
    - path: "src/middleware.ts"
      find: "export const config = {}"
      replace: "export const config = { matcher: ['/dashboard/:path*'] }"
    - path: "src/lib/api.ts"
      find: "headers: {}"
      replace: "headers: { Authorization: `Bearer ${token}` }"
  verbosity: minimal
```

**OR batch_engine wrapping both writes and edits:**

```yaml
batch:
  operations:
    write:
      - files:
          - path: "src/features/auth/types.ts"
            content: "..."
          - path: "src/features/auth/hooks.ts"
            content: "..."
    edit:
      - edits:
          - path: "src/app/layout.tsx"
            find: "<App />"
            replace: "<AuthProvider><App /></AuthProvider>"
```

### [BAD] vs [GOOD] Output Batching

**[BAD] — 3 separate precision_write calls**

```yaml
precision_write:
  files:
    - path: "file1.ts"
      content: "..."

precision_write:  # Second call!
  files:
    - path: "file2.ts"
      content: "..."

precision_write:  # Third call!
  files:
    - path: "file3.ts"
      content: "..."
```

**[GOOD] — 1 precision_write call with 3 files**

```yaml
precision_write:
  files:
    - path: "file1.ts"
      content: "..."
    - path: "file2.ts"
      content: "..."
    - path: "file3.ts"
      content: "..."
  verbosity: minimal
```

## Phase 6: LOOP (When to Return to Discovery)

### Loop Triggers

1. **Results don't match expectations** — Typecheck fails, tests fail, unexpected behavior
2. **Scope changed** — Discovery revealed different situation than expected
3. **New information** — Task requirements clarified during execution

### Loop Pattern

```yaml
# Initial DPB cycle
discover: ...  # Call 1
precision_read: ...  # Call 2
precision_write: ...  # Call 3

# Validation reveals issue
precision_exec:  # Optional validation AFTER cycle
  commands:
    - cmd: "npm run typecheck"
      expect:
        exit_code: 0  # FAILS

# LOOP: Start new DPB cycle with refined discovery
discover:  # Call 1 (new cycle)
  queries:
    - id: find_missing_import
      type: grep
      pattern: "export.*User"
      glob: "src/**/*.ts"
  verbosity: locations  # Need exact location

precision_read: ...  # Call 2 (new cycle)
precision_edit: ...  # Call 3 (new cycle) - fix the issue
```

## Validation (AFTER the cycle)

Validation is OPTIONAL and happens AFTER the 3-call cycle completes:

```yaml
# After completing a DPB cycle (3 calls), validate:
precision_exec:
  commands:
    - cmd: "npm run typecheck"
      expect:
        exit_code: 0
    - cmd: "npm run lint"
      expect:
        exit_code: 0
  verbosity: minimal
```

If validation fails, LOOP back to Discovery (start a new 3-call cycle).

## Complete Example: Implementing Auth Feature

### Cycle 1: Initial Implementation

**Step 1 — DISCOVER (1 call)**

```yaml
discover:
  queries:
    - id: existing_auth
      type: glob
      patterns: ["src/features/auth/**/*.ts", "src/**/auth*.ts"]
    - id: auth_patterns
      type: grep
      pattern: "(useAuth|getSession|AuthProvider)"
      glob: "src/**/*.{ts,tsx}"
    - id: user_types
      type: symbols
      query: "User"
      kinds: ["interface", "type"]
  verbosity: files_only
```

**Step 2 — PLAN (0 calls, cognitive)**

```
Discovery results:
- No existing auth files
- No auth patterns in use
- User type exists in src/types/user.ts

Plan:
1. Read src/types/user.ts to understand User interface
2. Read .goodvibes/memory/decisions.json for auth constraints
3. Batch into 1 precision_read call
```

**Step 3 — BATCH INPUT (1 call)**

```yaml
precision_read:
  files:
    - path: "src/types/user.ts"
      extract: symbols
    - path: ".goodvibes/memory/decisions.json"
  verbosity: minimal
```

**Step 4 — PLAN (0 calls, cognitive)**

```
Input results:
- User interface has id, email, name fields
- Decisions.json says: use Clerk for auth

Plan:
1. Create src/features/auth/provider.tsx (Clerk wrapper)
2. Create src/features/auth/hooks.ts (useAuth hook)
3. Create src/features/auth/index.ts (barrel export)
4. Batch into 1 precision_write call
```

**Step 5 — BATCH OUTPUT (1 call)**

```yaml
precision_write:
  files:
    - path: "src/features/auth/provider.tsx"
      content: |
        import { ClerkProvider } from '@clerk/nextjs';
        export function AuthProvider({ children }: { children: React.ReactNode }) {
          return <ClerkProvider>{children}</ClerkProvider>;
        }
    - path: "src/features/auth/hooks.ts"
      content: |
        import { useUser } from '@clerk/nextjs';
        import type { User } from '@/types/user';
        export function useAuth(): User | null {
          const { user } = useUser();
          if (!user) return null;
          return { id: user.id, email: user.emailAddresses[0].emailAddress, name: user.fullName };
        }
    - path: "src/features/auth/index.ts"
      content: |
        export { AuthProvider } from './provider';
        export { useAuth } from './hooks';
  verbosity: minimal
```

**Total calls in Cycle 1: 3** (discover + precision_read + precision_write)

### Validation (AFTER Cycle 1)

```yaml
precision_exec:
  commands:
    - cmd: "npm run typecheck"
      expect:
        exit_code: 0
  verbosity: minimal

# Result: FAILS — missing @clerk/nextjs import
```

### Cycle 2: Fix Import Issue

**Step 1 — DISCOVER (1 call)**

```yaml
discover:
  queries:
    - id: package_json
      type: glob
      patterns: ["package.json"]
    - id: clerk_usage
      type: grep
      pattern: "@clerk/nextjs"
      glob: "src/**/*.{ts,tsx}"
  verbosity: files_only
```

**Step 2 — PLAN (0 calls, cognitive)**

```
Discovery: @clerk/nextjs not in package.json

Plan:
1. Install @clerk/nextjs via precision_exec
```

**Step 3 — BATCH INPUT (1 call)**

```yaml
precision_exec:
  commands:
    - cmd: "npm install @clerk/nextjs"
  verbosity: minimal
```

**Step 4 — PLAN (0 calls, cognitive)**

```
No output operations needed (package installed)
```

**Step 5 — BATCH OUTPUT (1 call)**

```yaml
# No-op or skip — nothing to write/edit
# If you must make a call, you can read package.json to confirm:
precision_read:
  files:
    - path: "package.json"
      extract: outline
  verbosity: minimal
```

**Total calls in Cycle 2: 3** (or 2 if skipping step 5)

### Final Validation

```yaml
precision_exec:
  commands:
    - cmd: "npm run typecheck"
      expect:
        exit_code: 0
  verbosity: minimal

# Result: PASSES
```

## Common Violations and Fixes

| Violation | Tool Calls | Fix |
|-----------|-----------|-----|
| Sequential precision_read calls | 5+ | Batch all files into 1 precision_read call |
| Sequential precision_write calls | 5+ | Batch all files into 1 precision_write call |
| Using precision_glob + precision_grep separately | 2+ | Use 1 discover call with both query types |
| Reading outline, then content | 2 | Read content once if you'll need it |
| Planning via tool calls | 1+ | Plan in text (cognitive work = 0 calls) |

## Enforcement

If you find yourself making 5+ tool calls in a single DPB cycle, you are violating the protocol. Stop and restructure:

1. Identify which calls are discovery → batch into 1 `discover` call
2. Identify which calls are input → batch into 1 `precision_read`/`precision_grep` call
3. Identify which calls are output → batch into 1 `precision_write`/`precision_edit` call
4. Ensure planning happens in text, not via tools

Target: **3 tool calls per DPB cycle**.

## Summary

- **D** (Discover): 1 `discover` call with all queries
- **P** (Plan): 0 calls (cognitive)
- **B** (Batch Input): 1 call (precision_read/precision_grep/batch)
- **P** (Plan): 0 calls (cognitive)
- **B** (Batch Output): 1 call (precision_write/precision_edit/batch)
- **LOOP**: Start new cycle if needed
- **Validation**: AFTER cycle (optional precision_exec)

**Total: 3 calls per cycle**.

Make this your default mode of operation.