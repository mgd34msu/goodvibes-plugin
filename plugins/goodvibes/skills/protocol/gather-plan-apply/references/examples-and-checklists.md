# GPA Examples and Checklists

Reference material extracted from the main Gather-Plan-Apply skill documentation. Use these examples and checklists to guide your GPA implementation.

---

## Complete GPA Example

### Task: Implement user profile feature

#### GATHER Phase

```yaml
# Check memory first
precision_read:
  files:
    - path: ".goodvibes/memory/patterns.json"
    - path: ".goodvibes/memory/decisions.json"
  verbosity: minimal

# Discover landscape
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

# Read key files (batched in one call)
precision_read:
  files:
    - path: "src/types/user.ts"
      extract: symbols
    - path: "src/features/auth/index.ts"
      extract: outline
  verbosity: minimal
```

**Gather Results:**
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

Commands:
- npm run typecheck (expect: exit 0)
- npm run lint (expect: exit 0)
- npm run build (expect: exit 0)

Apply batch plan:
- Apply Call 1: precision_write with 4 new files
- Apply Call 2: precision_edit with 1 modification
- Apply Call 3: precision_exec with 3 validation commands
```

#### APPLY Phase

```yaml
# Apply Call 1: Create new files
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
  verbosity: count_only

# Apply Call 2: Modify existing file
precision_edit:
  edits:
    - path: "src/app/profile/page.tsx"
      find: "export default function ProfilePage() {"
      replace: |
        import { ProfileCard } from '@/components/ProfileCard';
        export default function ProfilePage() {
  verbosity: minimal

# Apply Call 3: Validate
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

**[GOOD]** Results match plan:
- All files created successfully
- All validations pass
- No unexpected errors

-> No loop needed. Report success to orchestrator.

**[BAD] Example: Validation fails**

If typecheck failed with "Cannot find module '@/features/profile'", you would:

```yaml
# LOOP Gather: Re-discover module resolution config
precision_read:
  files:
    - path: "tsconfig.json"
      extract: content
    - path: "src/features/profile/index.ts"  # Verify export
      extract: content
  verbosity: minimal

# LOOP Apply: Fix and re-validate
precision_edit:
  edits:
    - path: "src/features/profile/index.ts"
      find: "export * from './types';"
      replace: |
        export * from './types';
        export * from './hooks';  // Was missing
  verbosity: minimal

precision_exec:
  commands:
    - cmd: "npm run typecheck"
      expect:
        exit_code: 0
  verbosity: minimal
```

---

## Anti-Patterns Summary

### Diving In Without Gathering

**[BAD]** Starting with `precision_write` before understanding the codebase

**[GOOD]** Always run `discover` + check memory first in the GATHER phase

### Skipping Memory Checks

**[BAD]** Implementing without checking failures.json, patterns.json, decisions.json

**[GOOD]** Check memory files at the start of every GATHER phase

### Unstructured Plans

**[BAD]** "I'll add some files and see what happens"

**[GOOD]** Explicit list of files to create/modify, commands to run, batch opportunities

### Missing Batch Opportunities

**[BAD]** 5 separate `precision_write` calls for 5 files

**[GOOD]** 1 `precision_write` call with 5 files in the `files` array

### Same-Type Calls in Same Phase

**[BAD]** Two `precision_read` calls in the GATHER phase

**[GOOD]** One `precision_read` call with all files batched in the `files` array

### Over-Reading Files

**[BAD]** Using `extract: content` when `extract: outline` would suffice

**[GOOD]** Use minimal extraction needed (outline -> symbols -> content)

### Verbose Output Everywhere

**[BAD]** `verbosity: verbose` for all operations

**[GOOD]** `verbosity: minimal` or `count_only` unless you need detailed output

### Sequential When Parallel Works

**[BAD]** Reading files one at a time when they're independent

**[GOOD]** Batch reads in single call or use `discover` for parallel queries

### Not Looping When Needed

**[BAD]** Continuing with outdated plan when discovery reveals new information

**[GOOD]** Loop back to GATHER when assumptions change

---

## Quick Reference

### Gather Checklist

- [ ] Check `.goodvibes/memory/failures.json`
- [ ] Check `.goodvibes/memory/patterns.json`
- [ ] Check `.goodvibes/memory/decisions.json`
- [ ] Run `discover` with parallel queries (glob + grep + symbols)
- [ ] Batch key file reads in one `precision_read` call
- [ ] Use `extract: outline` or `extract: symbols` for large files
- [ ] Estimate scope (count_only mode)

### Planning Checklist

- [ ] List files to create
- [ ] List files to modify
- [ ] List commands to run
- [ ] Identify order of operations
- [ ] Identify batch opportunities (same-type ops → one call)
- [ ] Estimate token budget

### Apply Checklist

- [ ] Batch writes into one `precision_write` call
- [ ] Batch edits into one `precision_edit` call
- [ ] Batch commands into one `precision_exec` call
- [ ] Use minimal verbosity (count_only for writes, minimal for edits)
- [ ] Validate after applying
- [ ] Check results match plan

### Loop Checklist

- [ ] Scope matches expectations?
- [ ] Results match plan?
- [ ] New information revealed?
- [ ] If any "no" -> loop back to GATHER

---

## Implementation Tips

The GPA loop is not optional -- it's the foundation of efficient agent execution. Every task, from adding a single function to implementing a complete feature, should follow this pattern:

1. **GATHER** - Understand before acting (check memory, discover, read key files)
2. **PLAN** - Structure before executing (identify all batch opportunities)
3. **APPLY** - Group operations by type (one call per tool type)
4. **LOOP** - Adapt when assumptions change

Following GPA consistently results in:
- 50-90% token savings vs. ad-hoc execution
- Higher quality implementations (fewer mistakes)
- Faster iteration (less rework)
- Better alignment with existing patterns
