## MANDATORY

ALWAYS provide the following reminders to subagents:
1. Use .goodvibes/ memory and logging when troubleshooting a problem
2. Maintain usage of DPB Loops. D: Discover tool first, P: Plan your work to maximize token efficiency, B: Batch execution as much as possible, then Loop.
  - Preferred: batch_engine batch tool call wraps precision_engine tool calls that use precision tool batching functionality
  - Acceptable: precision_engine tool calls use batching functionality on their own without batch_engine
  - Limited: precision_engine tool call without batching functionality. (sometimes necessary, so still allowed)
  - Unacceptable: native tools for Read, Write, Edit, Glob, Grep, WebFetch, NotebookEdit
3. NEVER use Bash cat, echo, heredoc, or other workarounds unless precision_engine tools have failed multiple attempts
4. Incorrect usage of precision_engine tools DOES NOT COUNT as a failed attempt
5. ALWAYS return to using precision_engine tools after a successful workaround
6. Use appropriate precision tool verbosity, only consume or produce the amount of data necessary to complete the task
7. CRITICAL: NEVER set sandbox=true via precision_config. Only the user can activate sandbox mode.

---

## PRECISION MASTERY (Auto-loaded for all subagents)

# Precision Mastery

The precision engine provides token-efficient alternatives to native tools (Read, Edit, Write, Grep, Glob, WebFetch). When used correctly, you save 75-95% of tokens on file operations. This skill teaches optimal usage.

## Verbosity Cheat Sheet

Use the lowest verbosity that meets your needs. Verbosity directly impacts token consumption.

| Operation | Default | Recommended | Why |
|----------|---------|-------------|-----|
| `precision_write` | standard | **count_only** | You provided the content; just confirm success |
| `precision_edit` | with_diff | **minimal** | Confirm applied; skip diffs unless debugging |
| `precision_read` | standard | **standard** | You need the content |
| `precision_grep` (discovery) | standard | **files_only** via output.format | Discovery phase, not content phase |
| `precision_grep` (content) | standard | **matches** via output.format | Need actual matched lines |
| `precision_glob` | standard | **paths_only** via output.format | You need file paths, not stats |
| `precision_exec` (verify) | standard | **minimal** | Unless you need full stdout/stderr |
| `precision_exec` (debug) | standard | **standard** | Need output to diagnose |
| `precision_fetch` | standard | **standard** | You need the content |
| `discover` | files_only (verbosity param) | **files_only** | Discovery phase, not content phase |
| `precision_symbols` | locations (verbosity param) | **locations** | File:line is usually enough |

**Token Multipliers**:
- `count_only`: ~0.05x tokens
- `minimal`: ~0.2x tokens
- `standard`: ~0.6x tokens
- `verbose`: 1.0x tokens

**Golden Rule**: Use `count_only` for writes/edits where you don't need to read back what you just wrote.

## Extract Mode Selection (`precision_read`)

Before reading a file, decide what you need from it. Extract modes reduce tokens by 60-95% compared to full content.

| Mode | When to Use | Token Savings | Example Use Case |
|------|------------|--------------|----------------|
| `content` | Need full file to read/understand | 0% | Reading config files, reading code to edit |
| `outline` | Need structure without content | 60-80% | Understanding file organization, finding functions |
| `symbols` | Need exported symbols for imports | 70-90% | Building import statements, API surface analysis |
| `ast` | Need structural patterns | 50-70% | Refactoring, pattern detection |
| `lines` | Need specific line ranges | 80-95% | Reading specific functions after grep |

**Best Practices**:
1. Start with `outline` to understand file structure
2. Use `symbols` when building imports or understanding API surface
3. Use `lines` with `range: { start, end }` after grep finds a location
4. Only use `content` when you actually need the full file

<!-- Example: Understanding a component file -->
```yaml
# Step 1: Get structure
precision_read:
  files: [{ path: "src/components/Button.tsx", extract: outline }]
  verbosity: standard

# Step 2: If you need full content, read it
precision_read:
  files: [{ path: "src/components/Button.tsx", extract: content }]
  verbosity: standard
```

## Batching Patterns

Batching is the single most important token saving technique. Always batch operations when possible.

### 1. Multi-File Read (Single Call)

Read 5-10 files in one `precision_read` call instead of 5-10 separate calls.

```yaml
# Bad (5 separate calls)
precision_read:
  files: [{ path: "file1.ts" }]
precision_read:
  files: [{ path: "file2.ts" }]
# ...

# Good (1 batched call)
precision_read:
  files: [
    { path: "file1.ts", extract: outline },
    { path: "file2.ts", extract: outline },
    { path: "file3.ts", extract: outline },
    { path: "file4.ts", extract: outline },
    { path: "file5.ts", extract: outline }
  ]
  verbosity: minimal
```

### 2. Multi-Query Discover (Single Call)

Run grep + glob + symbols queries simultaneously in one `discover` call. This is the most powerful discovery pattern.

```yaml
discover:
  queries:
    - id: find_components
      type: glob
      patterns: ["src/components/**/*.tsx"]
    - id: find_api_routes
      type: glob
      patterns: ["src/api/**/*.ts", "src/app/api/**/*.ts"]
    - id: find_auth_usage
      type: grep
      pattern: "useAuth|getSession|withAuth"
      glob: "src/**/*.{ts,tsx}"
    - id: find_hooks
      type: symbols
      query: "use"
      kinds: ["function"]
  verbosity: files_only
```

**Why this matters**: Parallel execution means all 4 queries finish in ~50ms instead of ~200ms sequential.

### 3. Multi-Edit Atomic Transaction (Single Call)

Apply multiple edits across files in one `precision_edit` call with atomic transaction. If any edit fails, all roll back.

```yaml
precision_edit:
  edits:
    - path: "src/components/Button.tsx"
      find: "export default Button"
      replace: "export { Button as default }"
    - path: "src/components/index.ts"
      find: "export { default as Button } from './Button'"
      replace: "export { Button } from './Button'"
  transaction:
    mode: "atomic"
  verbosity: minimal
```

### 4. Multi-File Write (Single Call)

Create multiple files in one `precision_write` call.

```yaml
precision_write:
  files:
    - path: "src/features/user/index.ts"
      content: |
        export * from './types';
        export * from './api';
        export * from './hooks';
    - path: "src/features/user/types.ts"
      content: |
        export interface User {
          id: string;
          email: string;
          name: string;
        }
    - path: "src/features/user/api.ts"
      content: |
        import type { User } from './types';
        export const getUser = async (id: string): Promise<User> => { /* ... */ };
  verbosity: count_only
```

### 5. Batch Engine Wrapping Precision Tools (Optimal)

The highest form of batching: wrap multiple precision calls in a single batch engine transaction.

Each operation type (read, write, exec, query) uses the corresponding precision_engine tool's schema. For example:
- `read` operations use precision_read schema (with `files` array)
- `write` operations use precision_write schema (with `files` array)
- `exec` operations use precision_exec schema (with `commands` array)
- `query` operations use precision_grep/precision_glob schemas

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
                name: string;
              }
    exec:
      - commands:
          - cmd: "npm run typecheck"
            expect:
              exit_code: 0
  config:
    transaction:
      mode: atomic
  verbosity: minimal
```

## Token Budget & Pagination

For large files or batch reads, use `token_budget` to control output size.

```yaml
# Read up to 20 files, but cap total output at 5K tokens
precision_read:
  files: [
    { path: "file1.ts" },
    { path: "file2.ts" },
    # ...
  ]
  token_budget: 5000
  page: 1  # Start with page 1
  verbosity: standard
```

If results are truncated, increment `page` to get the next batch.

## Output Format Selection (`precision_grep`)

`precision_grep` has multiple output formats: `count_only`, `files_only`, `locations`, `matches`, `context`.

| Format | Use Case | Token Cost |
|-------|----------|------------|
| `count_only` | Gauge scope | Very Low |
| `files_only` | Discovery phase | Low |
| `locations` | Find where something exists | Medium |
| `matches` | Need actual matched lines | High |
| `context` | Need surrounding code | Very High |

**Progressive Disclosure**: Start with `count_only` to gauge scope, then `files_only` to build a target list, then `matches` to get content.

## Discover Tool Orchestration

The `discover` tool is a meta-tool that runs multiple queries (grep, glob, symbols) in parallel. Always use it BEFORE implementation.

**Discovery Pattern**:
1. Run `discover` with multiple queries
2. Analyze results to understand scope
3. Plan work based on discovery findings
4. Execute with batching

```yaml
# Step 1: Discover
discover:
  queries:
    - id: existing_files
      type: glob
      patterns: ["src/features/auth/**/*.ts"]
    - id: existing_patterns
      type: grep
      pattern: "export (function|const|class)"
      glob: "src/features/**/*.ts"
  verbosity: files_only

# Step 2: Read key files with outline based on discovery
precision_read:
  files: [{ path: "src/features/auth/index.ts", extract: outline }]
  verbosity: minimal

# Step 3: Execute based on what was discovered
precision_write:
  files:
    - path: "src/features/auth/middleware.ts"
      content: "..."
  verbosity: count_only
```

## `precision_exec` Patterns

### 1. Background Processes

Run long-running processes in the background to avoid blocking.

```yaml
precision_exec:
  commands:
    - cmd: "npm run dev"
      background: true
  verbosity: minimal
```

### 2. Retry Patterns

Automatically retry flaky commands.

```yaml
precision_exec:
  commands:
    - cmd: "npm install"
      retry:
        max: 3
        delay_ms: 1000
  verbosity: minimal
```

### 3. Until Patterns

Poll until a condition is met.

```yaml
precision_exec:
  commands:
    - cmd: "curl http://localhost:3000/api/health"
      until:
        pattern: "ok"
        timeout_ms: 30000
  verbosity: minimal
```

## `precision_fetch` Patterns

### 1. Batched URLs

Fetch multiple URLs in one call.

```yaml
precision_fetch:
  urls:
    - url: "https://api.example.com/users"
    - url: "https://api.example.com/posts"
    - url: "https://api.example.com/comments"
  verbosity: standard
```

### 2. Extract Modes

Extract specific data from JSON responses.

```yaml
precision_fetch:
  urls:
    - url: "https://api.example.com/users"
      extract: json  # Extract mode: raw, text, json, markdown, structured, etc.
  verbosity: standard
```

### 3. Service Registry Auth

Use pre-configured services for automatic authentication.

```yaml
precision_fetch:
  urls:
    - url: "https://api.openai.com/v1/models"
      service: "OpenAI"  # Auto-applies bearer token from config
  verbosity: standard
```

## Anti-Patterns (NEVER DO THESE)

1. **Using native tools**: Read, Edit, Write, Glob, Grep, WebFetch should be avoided. Use precision equivalents.

2. **Setting verbosity to "verbose" for writes/edits**: Wastes tokens. You just wrote the content, why read it back?

3. **Reading entire files when you only need outline/symbols**: Use extract modes.

4. **Running discover queries one at a time**: Batch them.

5. **Using `precision_read` when `precision_grep` would find it faster**: Grep is optimized for search.

6. **Reading a file you just wrote**: You already know the content.

7. **Not using discover before implementation**: Blind implementation leads to mismatched patterns.

8. **Making multiple sequential precision tool calls that could be batched**: If 3+ calls to the same tool, batch them.

9. **Using `verbosity: verbose` as default**: Only use it when debugging.

10. **Ignoring token_budget for large batch reads**: Without a budget, you might get truncated results.

## Escalation Procedure

If a precision tool fails:

1. **Check the error**: Is it user error (wrong path, bad syntax)? Fix and retry.

2. **If tool genuinely fails**: Use native tool for THAT SPECIFIC TASK only.

3. **Return to precision tools**: For the next operation.

4. **Log the failure**: To `.goodvibes/memory/failures.json`.

**Example**:
- `precision_read` fails on a specific file => Use `Read` for that file only, return to `precision_read` for other files.
- `precision_edit` fails on a specific edit => Use `Edit` for that edit only, return to `precision_edit` for other edits.

**NEVER**: Abandon precision tools entirely because one call failed.

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

## Performance Benchmarks

**Token Savings**:
- `outline` vs `content`: 60-80% savings
- `symbols` vs `content`: 70-90% savings
- `count_only` vs `verbose`: 95% savings
- Batched 5 files vs 5 separate calls: 40-60% savings (overhead reduction)
- Parallel discover 4x vs sequential: 75% speedup, similar token cost

**Time Savings**:
- Parallel discover (4 queries): ~50ms vs ~200ms sequential
- Batched writes (5 files): ~80ms vs ~400ms separate
- Batched edits with transaction: atomic rollback on failure

## Quick Reference

**Most common patterns**:

```yaml
# 1. Discover before implementing
discover:
  queries:
    - id: files
      type: glob
      patterns: ["pattern"]
    - id: patterns
      type: grep
      pattern: "regex"
  verbosity: files_only

# 2. Read with outline first
precision_read:
  files: [{ path: "file.ts", extract: outline }]
  verbosity: minimal

# 3. Batch writes with count_only
precision_write:
  files:
    - { path: "file1.ts", content: "..." }
    - { path: "file2.ts", content: "..." }
  verbosity: count_only

# 4. Batch edits with atomic transaction
precision_edit:
  edits:
    - { path: "f1.ts", find: "...", replace: "..." }
    - { path: "f2.ts", find: "...", replace: "..." }
  transaction: { mode: "atomic" }
  verbosity: minimal

# 5. Verify with minimal output
precision_exec:
  commands:
    - { cmd: "npm run typecheck", expect: { exit_code: 0 } }
  verbosity: minimal
```

---

**Remember**: The precision engine saves tokens, but only when you choose the right verbosity, extract modes, and batching patterns. Use this skill as a cheat sheet for efficient tool usage.

---

## DISCOVER-PLAN-BATCH (Auto-loaded for all subagents)

# Discover-Plan-Batch Protocol

The Discover-Plan-Batch (DPB) loop is the foundational execution pattern for all GoodVibes agents. It ensures efficient token usage, prevents wasted work, and produces higher-quality results by frontloading discovery and planning before execution.

## Overview

The DPB loop consists of three phases, with a re-entry condition:

1. **DISCOVER** - Understand the current state before making changes
2. **PLAN** - Structure your work for maximum efficiency
3. **BATCH** - Execute operations in batched groups

After execution, **LOOP** back to DISCOVER when assumptions change.

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

## SKILL LOADING

When your task involves a domain covered by a GoodVibes skill, load it PROACTIVELY using:
1. Use ToolSearch to find `get_skill_content` from registry-engine
2. Call `get_skill_content` with the skill name
3. Follow the workflow in the skill body

### Available Skills

#### Protocol (Auto-loaded above)
- **precision-mastery**: Optimal usage of GoodVibes precision engine tools for maximum token efficiency
- **discover-plan-batch**: Discover-Plan-Batch loop for all GoodVibes agents
- **review-scoring**: Quantified scoring rubric and review format for WRFC loops
- **goodvibes-memory**: Reading/writing persistent memory and logging system
- **error-recovery**: Error recovery procedures with escalation tiers

#### Orchestration
- **fullstack-feature**: End-to-end feature development workflow that orchestrates multiple agents across the full stack
- **task-orchestration**: Guides the GoodVibes orchestrator in decomposing feature requests into parallel agent tasks

#### Outcome
- **ai-integration**: AI and LLM integration workflow using GoodVibes precision tools
- **api-design**: API endpoint design and implementation workflow using GoodVibes precision tools
- **authentication**: Authentication setup workflow using GoodVibes precision tools
- **component-architecture**: Component design workflow using GoodVibes precision tools
- **database-layer**: Database and ORM setup workflow using GoodVibes precision tools
- **deployment**: Deployment patterns for Vercel, Railway, Fly.io, Docker, and AWS
- **payment-integration**: Payment processing integration workflow using GoodVibes precision tools
- **service-integration**: External service integration workflow using GoodVibes precision tools
- **state-management**: Guides state architecture decisions including server state, client state, form state, and URL state patterns
- **styling-system**: Guides CSS architecture decisions including Tailwind configuration, design tokens, responsive patterns
- **testing-strategy**: Comprehensive testing patterns for Vitest/Jest unit tests, React Testing Library component tests, Playwright E2E tests

#### Quality
- **accessibility-audit**: WCAG 2.1 AA compliance audit methodology covering semantic HTML, ARIA patterns, keyboard navigation
- **code-review**: Systematic code review methodology using precision tools
- **debugging**: Systematic debugging methodology using precision tools
- **performance-audit**: Systematic performance audit methodology covering bundle analysis, database optimization, rendering performance
- **project-onboarding**: Guides systematic project onboarding through codebase analysis, architecture mapping, dependency auditing
- **refactoring**: Systematic code refactoring methodology using precision tools
- **security-audit**: Comprehensive security audit methodology covering authentication, authorization, input validation

### Validation
After completing work, validate with the skill's script:
```bash
bash plugins/goodvibes/skills/{tier}/{name}/scripts/{script}
```
