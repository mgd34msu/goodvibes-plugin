# DPB Examples and Checklists

Reference material extracted from the main Discover-Plan-Batch skill documentation. Use these examples and checklists to guide your DPB implementation.

---

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

**[GOOD]** Results match plan:
- All files created successfully
- All validations pass
- No unexpected errors

-> No loop needed. Report success to orchestrator.

**[BAD] Example: Validation fails**

If typecheck failed with "Cannot find module '@/features/profile'", you would:

```yaml
# LOOP: Re-discover module resolution config
precision_read:
  files:
    - path: "tsconfig.json"
      extract: content
    - path: "src/features/profile/index.ts"  # Verify export
      extract: content
  verbosity: minimal

# Fix based on discovery (e.g., missing barrel export)
precision_edit:
  edits:
    - path: "src/features/profile/index.ts"
      find: "export * from './types';"
      replace: |
        export * from './types';
        export * from './hooks';  // Was missing
  verbosity: minimal

# Re-validate
precision_exec:
  commands:
    - cmd: "npm run typecheck"
      expect:
        exit_code: 0
  verbosity: minimal
```

---

## Anti-Patterns Summary

### Diving In Without Discovery

**[BAD]** Starting with `precision_write` before understanding the codebase

**[GOOD]** Always run `discover` first to understand landscape

### Unstructured Plans

**[BAD]** "I'll add some files and see what happens"

**[GOOD]** Explicit list of files to create/modify, commands to run, dependencies

### Missing Batch Opportunities

**[BAD]** 5 separate `precision_write` calls for 5 files

**[GOOD]** 1 `precision_write` call with 5 files in the `files` array

### Skipping Memory Checks

**[BAD]** Implementing without checking failures.json, patterns.json, decisions.json

**[GOOD]** Check memory files during discovery phase

### Over-Reading Files

**[BAD]** Using `extract: content` when `extract: outline` would suffice

**[GOOD]** Use minimal extraction needed (outline -> symbols -> content)

### Verbose Output Everywhere

**[BAD]** `verbosity: verbose` for all operations

**[GOOD]** `verbosity: minimal` unless you need detailed output

### Sequential When Parallel Works

**[BAD]** Reading files one at a time when they're independent

**[GOOD]** Batch reads in single call or use `discover` for parallel queries

### Not Looping When Needed

**[BAD]** Continuing with outdated plan when discovery reveals new information

**[GOOD]** Loop back to discovery when assumptions change

---

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
- [ ] If any "no" -> loop back to DISCOVER

---

## Implementation Tips

The DPB loop is not optional — it's the foundation of efficient agent execution. Every task, from adding a single function to implementing a complete feature, should follow this pattern:

1. **DISCOVER** - Understand before acting
2. **PLAN** - Structure before executing
3. **BATCH** - Group operations for efficiency
4. **LOOP** - Adapt when assumptions change

Following DPB consistently results in:
- 50-90% token savings vs. ad-hoc execution
- Higher quality implementations (fewer mistakes)
- Faster iteration (less rework)
- Better alignment with existing patterns
