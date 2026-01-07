# Code Fix Plan

## Objective Summary

**Goal**: Address all issues identified in the code review to improve the codebase score from 8.7/10 to 10.0/10

**Scope**: Fix all P0 through P3 issues identified in `code-review.md`, including linting errors, documentation updates, code refactoring, type safety improvements, and test coverage enhancements. Does NOT include architectural changes or feature additions beyond what is necessary to address the identified issues.

**Success Criteria**:
- [ ] Zero ESLint errors (currently 14 import ordering errors)
- [ ] README test count updated to reflect actual 3,780 tests
- [ ] All `any` types in source files replaced with proper types
- [ ] All files under 350 lines (excluding data files)
- [ ] Empty/placeholder functions either implemented or removed
- [ ] 100% test coverage including `src/memory/index.ts` barrel file
- [ ] All JSDoc comments include `@returns` descriptions
- [ ] Single-letter variable names replaced with descriptive names in arrow functions

---

## Task Breakdown

| # | Task Name | Specialist Agent | Files/Areas | Dependencies | Complexity |
|---|-----------|------------------|-------------|--------------|------------|
| 1 | Fix 14 ESLint import ordering errors | code-architect | 12 files (8 test + 4 source) | None | Simple |
| 2 | Update README test count from 262 to 3,780 | content-platform | `plugins/goodvibes/README.md` | None | Simple |
| 3 | Replace `any` types in source files with proper types | backend-engineer | ~10 source files | None | Medium |
| 4 | Extract keyword data from keywords.ts to JSON config | code-architect | `plugins/goodvibes/hooks/scripts/src/shared/keywords.ts` | None | Medium |
| 5 | Extract shared hook runner pattern from entry points | code-architect | 10 entry point files in `src/*.ts` | None | Medium |
| 6 | Add tests for memory/index.ts barrel file | test-engineer | `plugins/goodvibes/hooks/scripts/src/__tests__/memory/` | None | Simple |
| 7 | Implement or remove empty validateImplementation function | backend-engineer | `plugins/goodvibes/hooks/scripts/src/pre-tool-use.ts:291-294` | None | Simple |
| 8 | Replace single-letter variable names with descriptive names | code-architect | Multiple files (12 occurrences) | None | Simple |
| 9 | Add @returns to all JSDoc comments missing them | content-platform | Various files (8 functions) | None | Simple |
| 10 | Pre-compile regex map for keyword matching performance | backend-engineer | `plugins/goodvibes/hooks/scripts/src/shared/keywords.ts:350-355` | Task 4 | Medium |
| 11 | Refactor folder-structure.ts to reduce line count | code-architect | `plugins/goodvibes/hooks/scripts/src/context/folder-structure.ts` (392 lines) | None | Medium |
| 12 | Refactor retry-tracker.ts to reduce line count | code-architect | `plugins/goodvibes/hooks/scripts/src/post-tool-use-failure/retry-tracker.ts` (391 lines) | None | Medium |
| 13 | Refactor recent-activity.ts to reduce line count | code-architect | `plugins/goodvibes/hooks/scripts/src/context/recent-activity.ts` (382 lines) | None | Medium |
| 14 | Refactor environment.ts to reduce line count | code-architect | `plugins/goodvibes/hooks/scripts/src/context/environment.ts` (353 lines) | None | Medium |
| 15 | Fix or log unused error variable in folder-structure.ts catch block | code-architect | `plugins/goodvibes/hooks/scripts/src/context/folder-structure.ts:90-93` | Task 11 | Simple |
| 16 | Address unused variable in clearError destructuring pattern | code-architect | `plugins/goodvibes/hooks/scripts/src/state.ts:233` | None | Simple |
| 17 | Run full test suite to verify all changes | test-engineer | All test files | Tasks 1-16 | Simple |
| 18 | Run final lint and quality checks | code-architect | All source files | Task 17 | Simple |

---

## Parallel Execution Groups

### Group 1 (Start Immediately - Independent Quick Fixes)
- Task 1: Fix 14 ESLint import ordering errors -> code-architect
- Task 2: Update README test count from 262 to 3,780 -> content-platform
- Task 6: Add tests for memory/index.ts barrel file -> test-engineer
- Task 7: Implement or remove empty validateImplementation function -> backend-engineer
- Task 8: Replace single-letter variable names with descriptive names -> code-architect
- Task 9: Add @returns to all JSDoc comments missing them -> content-platform
- Task 16: Address unused variable in clearError destructuring pattern -> code-architect

### Group 2 (After Group 1 - Type Safety and Refactoring)
- Task 3: Replace `any` types in source files with proper types -> backend-engineer
- Task 4: Extract keyword data from keywords.ts to JSON config -> code-architect
- Task 5: Extract shared hook runner pattern from entry points -> code-architect
- Task 11: Refactor folder-structure.ts to reduce line count -> code-architect
- Task 12: Refactor retry-tracker.ts to reduce line count -> code-architect
- Task 13: Refactor recent-activity.ts to reduce line count -> code-architect
- Task 14: Refactor environment.ts to reduce line count -> code-architect

### Group 3 (After Group 2 - Dependent Tasks)
- Task 10: Pre-compile regex map for keyword matching performance -> backend-engineer
- Task 15: Fix or log unused error variable in folder-structure.ts catch block -> code-architect

### Group 4 (Final - Verification)
- Task 17: Run full test suite to verify all changes -> test-engineer

### Group 5 (Final - Quality Gate)
- Task 18: Run final lint and quality checks -> code-architect

---

## Detailed Task Specifications

### Task 1: Fix 14 ESLint Import Ordering Errors

**Files to modify:**
1. `plugins/goodvibes/hooks/scripts/src/__tests__/environment.test.ts:15`
2. `plugins/goodvibes/hooks/scripts/src/__tests__/memory/decisions.test.ts:15`
3. `plugins/goodvibes/hooks/scripts/src/__tests__/memory/failures.test.ts:14`
4. `plugins/goodvibes/hooks/scripts/src/__tests__/memory/patterns.test.ts:12`
5. `plugins/goodvibes/hooks/scripts/src/__tests__/memory/preferences.test.ts:23-24`
6. `plugins/goodvibes/hooks/scripts/src/__tests__/memory/search.test.ts:10`
7. `plugins/goodvibes/hooks/scripts/src/__tests__/post-tool-use.test.ts:113`
8. `plugins/goodvibes/hooks/scripts/src/__tests__/post-tool-use/mcp-handlers.test.ts:44,54`
9. `plugins/goodvibes/hooks/scripts/src/post-tool-use.ts:29,32`
10. `plugins/goodvibes/hooks/scripts/src/session-start.ts:26`
11. `plugins/goodvibes/hooks/scripts/src/telemetry.ts:19`

**Action:** Run `npm run lint:fix` in `plugins/goodvibes/hooks/scripts/` or manually reorder imports to comply with ESLint rules.

### Task 2: Update README Test Count

**File:** `plugins/goodvibes/README.md`
**Line:** 122
**Change:** Replace "262 tests" with "3,780 tests"

### Task 3: Replace `any` Types

**Action:** Search source files for `any` type usage and replace with proper types:
- Use `unknown` for truly unknown types with type guards
- Create proper interfaces for structured data
- Use union types where appropriate

### Task 4: Extract Keyword Data to JSON

**File:** `plugins/goodvibes/hooks/scripts/src/shared/keywords.ts`
**Action:**
- Create `plugins/goodvibes/hooks/scripts/src/shared/keywords-data.json`
- Move `STACK_KEYWORD_CATEGORIES` and `TRANSCRIPT_KEYWORD_CATEGORIES` to JSON
- Update `keywords.ts` to import from JSON file
- Reduces 407-line file to approximately 150 lines

### Task 5: Extract Shared Hook Runner Pattern

**Files:** All `src/*.ts` entry point files
**Action:**
- Create `plugins/goodvibes/hooks/scripts/src/shared/hook-runner.ts`
- Extract common boilerplate (input reading, error handling, main module detection)
- Update entry points to use shared runner

### Task 6: Add Tests for memory/index.ts

**File to create:** `plugins/goodvibes/hooks/scripts/src/__tests__/memory/index.test.ts`
**Action:** Add tests to verify all exports from the barrel file are properly exposed

### Task 7: validateImplementation Function

**File:** `plugins/goodvibes/hooks/scripts/src/pre-tool-use.ts:291-294`
**Current code:**
```typescript
export async function validateImplementation(input: HookInput): Promise<void> {
  // Just allow and let the tool handle validation
  respond(allowTool('PreToolUse'));
}
```
**Action:** Either implement actual validation or remove the function and its entry in `TOOL_VALIDATORS`

### Task 8: Replace Single-Letter Variables

**Action:** Find occurrences like `.filter((e) => ...)` and replace with descriptive names like `.filter((entry) => ...)` or `.filter((dirent) => ...)`

### Task 9: Add @returns to JSDoc

**Action:** Find JSDoc comments missing `@returns` descriptions and add them

### Task 10: Pre-compile Regex Map

**File:** `plugins/goodvibes/hooks/scripts/src/shared/keywords.ts:350-355`
**Action:** Create a pre-compiled regex map at module initialization instead of creating regex per keyword during matching

### Tasks 11-14: Refactor Large Files

**Action for each:** Extract helper functions, types, or constants into separate modules to reduce file size below 350 lines

### Task 15: Fix Unused Error Variable

**File:** `plugins/goodvibes/hooks/scripts/src/context/folder-structure.ts:90-93`
**Action:** Either use the error in debug logging or replace with `_` to indicate intentionally unused

### Task 16: Address Unused Variable in Destructuring

**File:** `plugins/goodvibes/hooks/scripts/src/state.ts:233`
**Current code:** `const { [signature]: _, ...remainingErrors } = state.errors;`
**Action:** Add comment explaining the pattern or use a more explicit approach

---

## Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Refactoring introduces regressions | Medium | High | Run full test suite after each refactoring task |
| Import order fixes break circular dependency assumptions | Low | Medium | Verify with `madge` after import reordering |
| JSON extraction breaks keyword functionality | Low | High | Maintain type safety with TypeScript JSON imports |
| Hook runner extraction changes behavior | Medium | Medium | Create comprehensive tests before extracting |
| `any` type replacements cause type errors | Medium | Medium | Fix incrementally, run typecheck after each file |

---

## Complexity Assessment

**Overall**: Medium

**Factors**:
- Files affected: 25-35 files across source and tests
- Agents needed: 4 (code-architect, backend-engineer, test-engineer, content-platform)
- Dependency graph: Branching with two independent tracks converging at verification
- Risk level: Medium (changes touch core functionality but have excellent test coverage)
- Unknowns: Few (issues are clearly identified with specific locations)

**Confidence Level**: High

The code review provides precise file locations and line numbers for each issue. The existing 3,780 tests provide a strong safety net for detecting regressions. The issues are well-understood code quality improvements rather than complex feature changes.

---

## Cumulative Score Projection

| Phase | Actions | Points Gained | Running Total |
|-------|---------|---------------|---------------|
| Start | - | - | 8.7/10 |
| Group 1 | 7 quick fixes (Tasks 1-2, 6-9, 16) | +0.4 | 9.1/10 |
| Group 2 | 7 refactors (Tasks 3-5, 11-14) | +0.4 | 9.5/10 |
| Group 3 | 2 dependent tasks (Tasks 10, 15) | +0.2 | 9.7/10 |
| Group 4-5 | Verification (Tasks 17-18) | +0.3 | 10.0/10 |

---

## Notes for Execution

1. **Task 1 is highest priority** - Run `npm run lint:fix` first as it may auto-fix most import ordering issues

2. **For refactoring tasks (11-14)**, consider these extraction strategies:
   - Extract type definitions to separate files in `types/`
   - Extract constants to dedicated constants files
   - Extract helper functions to `shared/` utilities

3. **For Task 4 (keyword JSON extraction)**, TypeScript supports JSON imports with `resolveJsonModule` enabled in tsconfig

4. **All changes should be verified** with:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`

5. **The `@vitest/coverage-v8` and `lint-staged` dependencies** flagged as unused are false positives - they are used by scripts and Husky respectively
