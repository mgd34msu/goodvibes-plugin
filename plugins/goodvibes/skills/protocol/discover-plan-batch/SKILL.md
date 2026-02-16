---
name: discover-plan-batch
description: "Defines the Discover-Plan-Batch loop for all GoodVibes agents. Use before starting any development task. Covers discovery patterns using the discover tool, work planning for token efficiency, and batch execution strategies."
metadata:
  version: 1.0.0
  category: protocol
  tags: [dpb, discover, plan, batch, workflow, token-efficiency]
---

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
- Steps 1-3 (create files) → single precision_write call with 3 files
- Steps 5-7 (run commands) → single precision_exec call with 3 commands
```

### The "3+ Sequential Calls" Rule

If your plan contains 3 or more sequential calls to the same precision tool, you should batch them into 1 call.

**Example: Creating multiple files**

[BAD] **BAD PLAN:**
```
1. precision_write - create types.ts
2. precision_write - create hooks.ts
3. precision_write - create index.ts
4. precision_write - create utils.ts
```

[GOOD] **GOOD PLAN:**
```
1. precision_write - create types.ts, hooks.ts, index.ts, utils.ts (batched)
```

**Example: Running validation commands**

[BAD] **BAD PLAN:**
```
1. precision_exec - npm run typecheck
2. precision_exec - npm run lint
3. precision_exec - npm run test
```

[GOOD] **GOOD PLAN:**
```
1. precision_exec - run typecheck, lint, test (batched)
```

### Dependency Analysis

Identify which operations must be sequential vs parallel:

**Sequential dependencies:**
- Read file → Edit file (need content before editing)
- Create types → Create code using types (need types to exist)
- Edit files → Run typecheck (need files saved before checking)

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

**Example estimation:**
```
Plan token budget:
- Read 3 files (outline): 3 * 200 = 600 tokens
- Create 5 files (minimal): 5 * 50 = 250 tokens
- Run 3 commands (minimal): 3 * 100 = 300 tokens
Total estimated: ~1,150 tokens
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

The `batch` tool from batch_engine wraps multiple precision_engine operations into a single atomic transaction:

```yaml
batch:
  id: implement-auth-feature
  operations:
    read:
      - id: discover
        type: glob
        patterns: ["src/features/**/*.ts"]
        output:
          format: files_only
    
    write:
      - id: create-files
        type: create
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
              export function useAuth() { /*...*/ }
    
    exec:
      - id: validate
        type: command
        commands:
          - cmd: "npm run typecheck"
            expect:
              exit_code: 0
```

**Benefits:**
- Single tool call for entire workflow
- Atomic transactions (all-or-nothing)
- Checkpoint support (can rollback)
- Operation results accessible to subsequent operations

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
- Read → Edit → Verify workflows
- Operations where output of one determines input of next
- Error handling between steps

#### 4. Native Tools (NEVER)

Native tools (Read, Write, Edit, Grep, Glob, Bash) are blocked by the PreToolUse hook. Always use precision_engine equivalents.

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

The PreToolUse hook blocks native tools and redirects to precision_engine. Don't fight it — use precision tools from the start.

## LOOP: When to Return to Discovery

### Scope Changed

If discovery reveals the situation is different than expected:

**Example:**
```
Expected: Create new auth system from scratch
Discovered: Auth system already exists, just needs extension
→ LOOP: Re-discover existing auth patterns before planning
```

### Results Don't Match Plan

If execution produces unexpected output:

**Example:**
```
Expected: Typecheck passes after adding types
Actual: Typecheck fails with "module not found"
→ LOOP: Discover import structure, re-plan file organization
```

### New Information

If task requirements are clarified during execution:

**Example:**
```
Original task: Add user authentication
Clarification: Must integrate with existing Clerk setup
→ LOOP: Discover Clerk integration patterns before continuing
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

## Complete DPB Example

### Task: Implement user profile feature

#### DISCOVER Phase

```yaml
# Discovery: Understand landscape
discover:
  queries:
    - id: existing_features
      type: glob
      patterns: ["src/features/**/*"]
    - id: user_types
      type: grep
      pattern: "interface User|type User"
      glob: "src/**/*.ts"
    - id: react_hooks
      type: symbols
      query: "use"
      kinds: ["function"]
  verbosity: files_only

# Check memory
precision_read:
  files:
    - path: ".goodvibes/memory/patterns.json"
    - path: ".goodvibes/memory/decisions.json"
  verbosity: minimal

# Understand key files
precision_read:
  files:
    - path: "src/types/user.ts"
      extract: symbols
    - path: "src/features/auth/index.ts"
      extract: outline
  verbosity: minimal
```

**Discovery Results:**
- User type already exists in src/types/user.ts
- Features follow pattern: features/<name>/{types.ts, hooks.ts, index.ts}
- Memory shows: "Use Zustand for state, not Context API"

#### PLAN Phase

```
Files to create:
- src/features/profile/types.ts - Profile-specific types
- src/features/profile/hooks.ts - useProfile hook with Zustand
- src/features/profile/index.ts - Barrel export
- src/components/ProfileCard.tsx - Profile display component

Files to modify:
- src/app/profile/page.tsx - Use new ProfileCard component

Files to read:
- src/types/user.ts - Need full User interface
- src/features/auth/hooks.ts - Reference Zustand pattern

Commands:
- npm run typecheck (expect: exit 0)
- npm run lint (expect: exit 0)
- npm run build (expect: exit 0)

Order:
1. Read user.ts and auth/hooks.ts (parallel)
2. Create types.ts, hooks.ts, index.ts, ProfileCard.tsx (batched)
3. Modify profile/page.tsx
4. Run typecheck, lint, build (batched)

Batch opportunities:
- Step 1: batch reads (2 files)
- Step 2: batch writes (4 files)
- Step 4: batch commands (3 commands)
```

#### BATCH Phase

```yaml
# Step 1: Read for context
precision_read:
  files:
    - path: "src/types/user.ts"
      extract: content
    - path: "src/features/auth/hooks.ts"
      extract: content
  verbosity: minimal

# Step 2: Create files
precision_write:
  files:
    - path: "src/features/profile/types.ts"
      content: |
        export interface ProfileData {
          bio: string;
          avatar: string;
        }
    - path: "src/features/profile/hooks.ts"
      content: |
        import { create } from 'zustand';
        export const useProfile = create((set) => ({...}));
    - path: "src/features/profile/index.ts"
      content: |
        export * from './types';
        export * from './hooks';
    - path: "src/components/ProfileCard.tsx"
      content: |
        import { useProfile } from '@/features/profile';
        export function ProfileCard() {...}
  verbosity: minimal

# Step 3: Modify existing file
precision_edit:
  edits:
    - path: "src/app/profile/page.tsx"
      find: "export default function ProfilePage() {"
      replace: |
        import { ProfileCard } from '@/components/ProfileCard';
        export default function ProfilePage() {
  verbosity: minimal

# Step 4: Validate
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

#### LOOP Check

[GOOD] Results match plan:
- All files created successfully
- All validations pass
- No unexpected errors

→ No loop needed. Report success to orchestrator.

## Anti-Patterns Summary

### Diving In Without Discovery

[BAD] Starting with `precision_write` before understanding the codebase

[GOOD] Always run `discover` first to understand landscape

### Unstructured Plans

[BAD] "I'll add some files and see what happens"

[GOOD] Explicit list of files to create/modify, commands to run, dependencies

### Missing Batch Opportunities

[BAD] 5 separate `precision_write` calls for 5 files

[GOOD] 1 `precision_write` call with 5 files in the `files` array

### Skipping Memory Checks

[BAD] Implementing without checking failures.json, patterns.json, decisions.json

[GOOD] Check memory files during discovery phase

### Over-Reading Files

[BAD] Using `extract: content` when `extract: outline` would suffice

[GOOD] Use minimal extraction needed (outline → symbols → content)

### Verbose Output Everywhere

[BAD] `verbosity: verbose` for all operations

[GOOD] `verbosity: minimal` unless you need detailed output

### Sequential When Parallel Works

[BAD] Reading files one at a time when they're independent

[GOOD] Batch reads in single call or use `discover` for parallel queries

### Not Looping When Needed

[BAD] Continuing with outdated plan when discovery reveals new information

[GOOD] Loop back to discovery when assumptions change

## Quick Reference

### Discovery Checklist

- [ ] Run `discover` with parallel queries (glob + grep + symbols)
- [ ] Check `.goodvibes/memory/failures.json`
- [ ] Check `.goodvibes/memory/patterns.json`
- [ ] Check `.goodvibes/memory/decisions.json`
- [ ] Use `extract: outline` or `extract: symbols` for key files
- [ ] Estimate scope (count_only mode)

### Planning Checklist

- [ ] List files to create
- [ ] List files to modify
- [ ] List files to read (full content)
- [ ] List commands to run
- [ ] Identify order of operations
- [ ] Identify batch opportunities
- [ ] Apply "3+ sequential calls" rule
- [ ] Estimate token budget

### Batching Checklist

- [ ] Batch reads when possible
- [ ] Batch writes when possible
- [ ] Batch commands when possible
- [ ] Use minimal verbosity
- [ ] Validate after execution
- [ ] Check results match plan

### Loop Checklist

- [ ] Scope matches expectations?
- [ ] Results match plan?
- [ ] New information revealed?
- [ ] If any "no" → loop back to DISCOVER

## Conclusion

The DPB loop is not optional — it's the foundation of efficient agent execution. Every task, from adding a single function to implementing a complete feature, should follow this pattern:

1. **DISCOVER** - Understand before acting
2. **PLAN** - Structure before executing
3. **BATCH** - Group operations for efficiency
- **LOOP** - Adapt when assumptions change

Following DPB consistently results in:
- 50-90% token savings vs. ad-hoc execution
- Higher quality implementations (fewer mistakes)
- Faster iteration (less rework)
- Better alignment with existing patterns

Make DPB your default mode of operation.