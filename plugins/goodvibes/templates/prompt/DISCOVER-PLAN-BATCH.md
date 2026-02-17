## DISCOVER-PLAN-BATCH (Auto-loaded for all subagents)

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
   - Output: files_only or locations (minimal verbosity)

2. P — PLAN (0 tool calls, cognitive only)
   - Agent thinks about what it needs from discovery results
   - Plans the EXACT precision_read/precision_grep call
   - All token INPUT operations get planned here

3. B — BATCH INPUT (1 tool call)
   - Single precision_read/precision_grep/batch call
   - Everything batched inside it

4. P — PLAN (0 tool calls, cognitive only)
   - Plans the EXACT precision_write/precision_edit call
   - All token OUTPUT operations get planned here

5. B — BATCH OUTPUT (1 tool call)
   - Single precision_write/precision_edit/batch call
   - Everything batched inside it

6. LOOP — Back to D if needed
```

## CALL BUDGET PER CYCLE

| Phase | Tool Calls | Type |
|-------|-----------|------|
| **D** (Discover) | 1 | `discover` |
| **P** (Plan) | 0 | Cognitive |
| **B** (Batch Input) | 1 | `precision_*` |
| **P** (Plan) | 0 | Cognitive |
| **B** (Batch Output) | 1 | `precision_*` |
| **TOTAL** | **3** | |

## KEY RULES (NON-NEGOTIABLE)

1. **`discover` batches ALL discovery queries into 1 call** — NEVER use separate `precision_glob`, `precision_grep` for discovery
2. **Plan steps produce ZERO tool calls** — they are cognitive (agent thinks in text)
3. **Batch input = 1 call** — use internal batching (`files` array, `queries` array)
4. **Batch output = 1 call** — use internal batching (`files` array, `edits` array)
5. **NEVER make sequential calls of the same tool type** — batch them
6. **ToolSearch is NOT part of DPB** — load tools once at start

## Phase 1: DISCOVER

### Purpose

Discovery prevents blind implementation. Before writing code, you must understand:

- What files already exist in the target area
- What patterns/conventions are already established
- What functions/types/components you'll integrate with
- What previous attempts/failures are documented
- What architectural decisions constrain your approach

**When to skip discovery:**
- Task is 1-2 files you already have full context for
- Task has zero file I/O (pure analysis/reporting)
- You're in a LOOP iteration with fresh discovery already done

For all other tasks: **always discover first**.

### Discovery Tools

#### The `discover` Tool

The `discover` tool runs multiple grep/glob/symbols queries **in parallel**, returning results keyed by query ID. This is your primary discovery mechanism.

**Pattern: Parallel exploration**

```yaml
discover:
  queries:
    - id: existing_files
      type: glob
      patterns: ["src/features/auth/**/*.ts"]
    - id: existing_patterns
      type: grep
      pattern: "export (function|const|class)"
      glob: "src/features/**/*.ts"
    - id: exported_symbols
      type: symbols
      query: "use"
      kinds: ["function"]
  verbosity: files_only
```

**When to use each query type:**

- **glob** - Find files by path patterns ("what files exist here?")
- **grep** - Find files containing specific patterns ("where is this pattern used?")
- **symbols** - Find exported functions/types/classes ("what can I import?")
- **structural** - Find AST patterns ("where is console.log called?")

**Output modes:**

- `count_only` - Just counts (scope estimation: "are there 10 files or 1000?")
- `files_only` - File paths only (building target lists)
- `locations` - File paths + line numbers (reviewing matches)

#### The `precision_read` Extract Modes

After discovering target files, use `precision_read` with extract modes to understand structure without consuming full content:

**Extract: outline**

Returns hierarchical structure of the file:

```yaml
precision_read:
  files:
    - path: "src/api/routes/users.ts"
      extract: outline
  verbosity: minimal
```

Use when you need to understand:
- File organization (what's exported, what's internal)
- Available functions/classes without implementation details
- Module structure before editing

**Extract: symbols**

Returns just exported symbols:

```yaml
precision_read:
  files:
    - path: "src/types/user.ts"
      extract: symbols
  symbol_filter: ["interface", "type"]
  verbosity: minimal
```

Use when you need to:
- See available types to import
- Understand the public API surface
- Check what's already exported

**Extract: content**

Returns full file content. Only use when you actually need implementation details.

```yaml
precision_read:
  files:
    - path: "src/config/database.ts"
      extract: content
  verbosity: standard
```

**Decision criteria:**
- Use `outline` when you need structure but not implementation (checking what exists)
- Use `symbols` when you need to know what's importable (building import statements)
- Use `content` only when you need implementation details (before editing, understanding logic)

### Check GoodVibes Memory

Before implementing anything, check memory files for context:

**failures.json** - Has this task been attempted before?

```yaml
precision_read:
  files:
    - path: ".goodvibes/memory/failures.json"
  verbosity: minimal
```

Look for:
- Similar errors you might repeat
- Known bugs in tools/dependencies
- Approaches that didn't work

**patterns.json** - Are there proven approaches?

```yaml
precision_read:
  files:
    - path: ".goodvibes/memory/patterns.json"
  verbosity: minimal
```

Look for:
- Coding patterns for this type of work
- Tool usage patterns (e.g., "use path not glob for grep")
- Performance optimizations

**decisions.json** - What constraints apply?

```yaml
precision_read:
  files:
    - path: ".goodvibes/memory/decisions.json"
  verbosity: minimal
```

Look for:
- Architectural decisions ("use Prisma not Drizzle")
- Library choices ("prefer Zustand over Redux")
- Convention decisions ("cell_id takes precedence over index")

### Scope Estimation

Use discovery to estimate scope before committing to an approach:

**Pattern: Count-first discovery**

```yaml
discover:
  queries:
    - id: component_count
      type: glob
      patterns: ["src/components/**/*.tsx"]
  verbosity: count_only
```

If you discover 5 files, full reads are feasible. If you discover 500 files, you need a more targeted approach (grep for specific patterns first, narrow the scope).

### Discovery Anti-Patterns

**[BAD] Reading entire files when outline would suffice**

```yaml
# BAD: Consuming 5000 tokens for 50-line outline
precision_read:
  files:
    - path: "src/lib/utils.ts"
      extract: content  # Full content not needed!
```

```yaml
# GOOD: Consuming 300 tokens for same information
precision_read:
  files:
    - path: "src/lib/utils.ts"
      extract: outline
```

**[BAD] Reading outline then full content**

```yaml
# BAD: Reading same file twice
precision_read:
  files:
    - path: "src/lib/utils.ts"
      extract: outline  # First read

# Later...
precision_read:
  files:
    - path: "src/lib/utils.ts"
      extract: content  # Re-reading for content
```

```yaml
# GOOD: Read content once if you'll need it
precision_read:
  files:
    - path: "src/lib/utils.ts"
      extract: content  # Single read
```

**[BAD] Sequential discovery queries**

```yaml
# BAD: 3 separate tool calls
precision_glob:
  patterns: ["src/**/*.ts"]

# Then later...
precision_grep:
  pattern: "export function"
  
# Then later...
precision_read:
  files:
    - path: "src/hooks/"
      extract: symbols
```

```yaml
# GOOD: 1 tool call, parallel execution
discover:
  queries:
    - id: files
      type: glob
      patterns: ["src/**/*.ts"]
    - id: exports
      type: grep
      pattern: "export function"
    - id: hooks
      type: symbols
      query: "use"
```

**[BAD] Skipping memory checks**

Starting implementation without checking failures.json, patterns.json, decisions.json leads to:
- Repeating past mistakes
- Violating architectural decisions
- Ignoring proven patterns

## Phase 2: PLAN

### Purpose

Planning prevents token waste from execution churn. A good plan identifies:

- Exactly which files need to be created/modified/read
- The order of operations (dependencies)
- Opportunities for batching
- Expected outcomes (for validation)

### Plan Structure

Every plan should explicitly list:

#### 1. Files to Create

List full paths with brief descriptions:

```
Files to create:
- src/features/auth/hooks/useAuth.ts - Auth context hook
- src/features/auth/types.ts - Auth type definitions
- src/features/auth/index.ts - Barrel export
```

#### 2. Files to Modify

List full paths with specific changes:

```
Files to modify:
- src/app/layout.tsx - Wrap with AuthProvider
- src/middleware.ts - Add auth checks to protected routes
- src/lib/api.ts - Add auth token to request headers
```

#### 3. Files to Read

List files you need full content from (not just outline/symbols):

```
Files to read:
- src/config/database.ts - Need connection string format
- src/types/user.ts - Need User interface details
```

#### 4. Commands to Run

List validation commands with expected outcomes:

```
Commands to run:
- npm run typecheck (expect: exit 0)
- npm run lint (expect: exit 0)
- npm run test -- auth.test.ts (expect: all pass)
```

#### 5. Order of Operations

Identify dependencies between steps:

```
Order:
1. Create types.ts (no dependencies)
2. Create useAuth.ts (depends on types.ts)
3. Create index.ts (depends on useAuth.ts)
4. Modify layout.tsx (depends on index.ts)
5. Run typecheck (depends on all files)
```

#### 6. Batch Opportunities

Identify operations that can be combined:

```
Batch opportunities:
- Steps 1-3 (create files) -> single precision_write call with 3 files
- Steps 5-7 (run commands) -> single precision_exec call with 3 commands
```

### The "3+ Sequential Calls" Rule

If your plan contains 3 or more sequential calls to the same precision tool, you should batch them into 1 call.

**Example: Creating multiple files**

**[BAD]**
```
1. precision_write - create types.ts
2. precision_write - create hooks.ts
3. precision_write - create index.ts
4. precision_write - create utils.ts
```

**[GOOD]**
```
1. precision_write - create types.ts, hooks.ts, index.ts, utils.ts (batched)
```

**Example: Running validation commands**

**[BAD]**
```
1. precision_exec - npm run typecheck
2. precision_exec - npm run lint
3. precision_exec - npm run test
```

**[GOOD]**
```
1. precision_exec - run typecheck, lint, test (batched)
```

### Dependency Analysis

Identify which operations must be sequential vs parallel:

**Sequential dependencies:**
- Read file -> Edit file (need content before editing)
- Create types -> Create code using types (need types to exist)
- Edit files -> Run typecheck (need files saved before checking)

**Parallel opportunities:**
- Create multiple independent files
- Read multiple files for context
- Run multiple independent commands

**Pattern: Label dependencies in your plan**

```
Phase 1 (Parallel - no dependencies):
- Create src/types/user.ts
- Create src/types/auth.ts
- Create src/types/api.ts

Phase 2 (Parallel - depends on Phase 1):
- Create src/hooks/useAuth.ts (needs user.ts, auth.ts)
- Create src/hooks/useApi.ts (needs api.ts)

Phase 3 (Sequential - depends on Phase 2):
- Create src/index.ts (barrel export for all hooks)

Phase 4 (Sequential - depends on Phase 3):
- Run typecheck (needs all files created)
```

### Token Budget Estimation

Estimate token costs before execution:

**Reading files:**
- Outline: ~5-10 tokens per exported symbol
- Symbols: ~3-5 tokens per symbol
- Content: ~1 token per 4 characters

**Writing files:**
- Minimal verbosity: ~50 tokens per file
- Standard verbosity: ~150 tokens per file

**Discover query costs:**
- glob: ~50 tokens (count_only), ~100 tokens (files_only)
- grep: ~200-500 tokens depending on matches (files_only)
- symbols: ~100-300 tokens depending on symbol count (files_only)

**Example estimation:**
```
Plan token budget:
- Discover (glob + grep + symbols): ~500 tokens
- Read 3 files (outline): 3 * 200 = 600 tokens
- Create 5 files (minimal): 5 * 50 = 250 tokens
- Run 3 commands (minimal): 3 * 100 = 300 tokens
Total estimated: ~1,650 tokens
```

If your estimate exceeds your token budget, revise the plan to be more targeted.

### Planning Anti-Patterns

**[BAD] Vague plans without specific files**

```
BAD:
1. Add authentication
2. Update components
3. Test everything
```

```
GOOD:
1. Create src/features/auth/useAuth.ts
2. Modify src/components/LoginForm.tsx - use useAuth hook
3. Run npm run test -- auth.test.ts
```

**[BAD] Plans without dependency analysis**

Leads to:
- Sequential execution when parallelism is possible
- Parallel execution when dependencies exist (causing errors)

**[BAD] Plans without batch opportunities identified**

Leads to:
- One tool call per operation (10x+ token waste)
- Slower execution (network roundtrips)

## Phase 3: BATCH

### Purpose

Batching minimizes token usage and maximizes execution efficiency by grouping operations.

### Execution Patterns (Ranked by Efficiency)

#### 1. batch_engine Wrapping precision_engine (Maximum Efficiency)

The `batch` tool from batch_engine wraps multiple precision_engine operations into a single atomic transaction with phase-grouped operations:

```yaml
batch:
  operations:
    read:
      - files:
          - path: "src/types.ts"
            extract: symbols
    
    write:
      - files:
          - path: "src/features/auth/types.ts"
            content: |
              export interface User {
                id: string;
                email: string;
              }
          - path: "src/features/auth/hooks.ts"
            content: |
              import type { User } from './types';
              export function useAuth() { /*...*/ }
    
    exec:
      - commands:
          - cmd: "npm run typecheck"
            expect:
              exit_code: 0
        verbosity: minimal
```

**Benefits:**
- Single tool call for entire workflow
- Atomic transactions (all-or-nothing)
- Checkpoint support (can rollback)
- Operation results accessible to subsequent operations

**Note on tool relationships:**
- `discover` is a **precision_engine tool** that runs multiple grep/glob/symbols queries in parallel
- `batch_engine` is an **orchestration wrapper** around precision_engine tools for atomic transactions
- All precision_engine tools have **built-in batching** (multiple files/edits/commands per call)

#### 2. precision_engine Built-in Batching (Good Efficiency)

Precision tools support batching within their own operation type:

**Batch reads:**
```yaml
precision_read:
  files:
    - path: "src/types/user.ts"
      extract: symbols
    - path: "src/types/auth.ts"
      extract: symbols
    - path: "src/config/app.ts"
      extract: outline
  verbosity: minimal
```

**Batch writes:**
```yaml
precision_write:
  files:
    - path: "src/features/auth/types.ts"
      content: "export interface User {...}"
    - path: "src/features/auth/index.ts"
      content: "export * from './types';"
    - path: "src/features/auth/hooks.ts"
      content: "export function useAuth() {...}"
  verbosity: minimal
```

**Batch commands:**
```yaml
precision_exec:
  commands:
    - cmd: "npm run typecheck"
      expect:
        exit_code: 0
    - cmd: "npm run lint"
      expect:
        exit_code: 0
    - cmd: "npm run test"
      expect:
        exit_code: 0
  verbosity: minimal
```

**Batch queries:**
```yaml
precision_grep:
  queries:
    - id: exports
      pattern: "export function"
      glob: "src/**/*.ts"
    - id: imports
      pattern: "import.*from"
      glob: "src/**/*.ts"
  output:
    format: files_only
```

**Batch edits:**
```yaml
precision_edit:
  edits:
    - path: "src/config/routes.ts"
      find: "const routes = [];"
      replace: "const routes = ['/auth'];"
    - path: "src/app/layout.tsx"
      find: "<App />"
      replace: "<AuthProvider><App /></AuthProvider>"
    - path: "src/lib/api.ts"
      find: "export const api = createClient();"
      replace: "export const api = createClient({ auth: true });"
  output:
    format: minimal
```

#### 3. Sequential precision_engine (Acceptable When Necessary)

Sometimes operations must be sequential due to dependencies:

```yaml
# Step 1: Read file to understand current state
precision_read:
  files:
    - path: "src/config/routes.ts"
      extract: content
  verbosity: minimal

# Step 2: Edit based on what was read
precision_edit:
  edits:
    - path: "src/config/routes.ts"
      find: "const routes = [];"
      replace: "const routes = ['/auth', '/profile'];"
  verbosity: minimal

# Step 3: Verify edit succeeded
precision_exec:
  commands:
    - cmd: "npm run typecheck"
      expect:
        exit_code: 0
  verbosity: minimal
```

**When sequential is acceptable:**
- Read -> Edit -> Verify workflows
- Operations where output of one determines input of next
- Error handling between steps

#### 4. Native Tools (NEVER)

Native tools (Read, Write, Edit, Grep, Glob, Bash) are blocked by the PreToolUse hook. Always use precision_engine equivalents.

### Batch Failure Handling

When batch operations fail, the behavior depends on the tool:

**batch_engine failures:**
- Atomic mode: All operations rolled back on any failure
- Partial mode: Successful operations kept, failed operations reported
- Check `operations[id].status` in batch result to identify failures

**precision_engine failures:**
- Individual file/edit/command failures reported in result
- Successful operations complete, failures don't affect them
- Check `files[path].status` or `edits[id].status` for failures

**Recovery pattern:**
1. Examine error output to identify root cause
2. Determine if issue is code-related or environment-related
3. Fix the specific failed operation(s)
4. Re-run just the failed operations (don't re-run successful ones)
5. If root cause was incorrect assumptions, LOOP back to DISCOVER

**Example recovery:**
```yaml
# Initial batch failed on file3.ts (import error)
# Fix: Read the file that should export the symbol
precision_read:
  files:
    - path: "src/types/index.ts"
      extract: symbols
  verbosity: minimal

# Re-write just the failed file with correct import
precision_write:
  files:
    - path: "src/features/auth/file3.ts"
      content: |
        import { User } from '@/types';  // Fixed import
        export function getUser(): User { /*...*/ }
  verbosity: minimal
```

### Post-Execution Validation

After batch execution, verify results match plan expectations:

**Pattern: Validate with precision_exec**

```yaml
precision_exec:
  commands:
    - cmd: "npm run typecheck"
      expect:
        exit_code: 0
    - cmd: "npm run lint"
      expect:
        exit_code: 0
    - cmd: "npm run build"
      expect:
        exit_code: 0
  verbosity: minimal
```

**If validation fails:**
1. Check the error output
2. Determine if it's a code issue or plan issue
3. If code issue: fix and re-validate
4. If plan issue: loop back to DISCOVER

### Batching Anti-Patterns

**[BAD] One operation per tool call**

```yaml
# BAD: 3 tool calls
precision_write:
  files:
    - path: "file1.ts"
      content: "..."

precision_write:
  files:
    - path: "file2.ts"
      content: "..."

precision_write:
  files:
    - path: "file3.ts"
      content: "..."
```

```yaml
# GOOD: 1 tool call
precision_write:
  files:
    - path: "file1.ts"
      content: "..."
    - path: "file2.ts"
      content: "..."
    - path: "file3.ts"
      content: "..."
```

**[BAD] Using verbose output when minimal suffices**

```yaml
# BAD: 10x token cost
precision_write:
  files:
    - path: "file.ts"
      content: "..."
  verbosity: verbose  # Returns full content + metadata
```

```yaml
# GOOD: Minimal tokens
precision_write:
  files:
    - path: "file.ts"
      content: "..."
  verbosity: minimal  # Just confirms success
```

**[BAD] Falling back to native tools**

The PreToolUse hook blocks native tools and redirects to precision_engine. Don't fight it -- use precision tools from the start.

## LOOP: When to Return to Discovery

### Scope Changed

If discovery reveals the situation is different than expected:

**Example:**
```
Expected: Create new auth system from scratch
Discovered: Auth system already exists, just needs extension
-> LOOP: Re-discover existing auth patterns before planning
```

### Results Don't Match Plan

If execution produces unexpected output:

**Example:**
```
Expected: Typecheck passes after adding types
Actual: Typecheck fails with "module not found"
-> LOOP: Discover import structure, re-plan file organization
```

### New Information

If task requirements are clarified during execution:

**Example:**
```
Original task: Add user authentication
Clarification: Must integrate with existing Clerk setup
-> LOOP: Discover Clerk integration patterns before continuing
```

### Looping Pattern

```yaml
# Initial discovery
discover:
  queries:
    - id: initial
      type: glob
      patterns: ["src/features/**/*.ts"]

# Execution reveals unexpected structure
# LOOP: Re-discover with new information

discover:
  queries:
    - id: refined
      type: glob
      patterns: ["src/features/*/index.ts"]  # More specific
    - id: patterns
      type: grep
      pattern: "export.*from"
      glob: "src/features/*/index.ts"
```

**Example: Execution reveals unexpected dependency**

```
Plan: Create auth/hooks.ts using User type
Execution: Typecheck fails - User type not exported from expected location
-> LOOP: Discover where User type actually lives
```

```yaml
# Re-discovery after execution failure
discover:
  queries:
    - id: find_user_type
      type: grep
      pattern: "export (interface|type) User"
      glob: "src/**/*.ts"
  verbosity: locations  # Need exact location

# Adjust plan based on discovered location
# Re-run failed operation with corrected import
```

## Examples and Reference

For a complete worked example of the DPB loop, anti-patterns summary, checklists, and implementation tips, see:

**[references/examples-and-checklists.md](references/examples-and-checklists.md)**

The reference file includes:
- Complete DPB example (user profile feature implementation)
- Anti-patterns summary with [BAD]/[GOOD] comparisons
- Quick reference checklists for discovery, planning, batching, and looping
- Implementation tips and expected outcomes

Make DPB your default mode of operation.

---
