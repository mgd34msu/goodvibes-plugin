# Remediation Plan: vibeplug

**Current Score: 5.8/10 | Target Score: 10.0/10**

This plan provides actionable tasks to systematically improve the codebase from its current state to exemplary quality. Tasks are prioritized by severity and grouped into phases.

---

## Task Summary

| Priority | Count | Estimated Effort | Score Impact |
|----------|-------|------------------|--------------|
| P0 Critical | 2 | 4 hours | +1.3 points |
| P1 Major | 7 | 20 hours | +2.1 points |
| P2 Minor | 4 | 8 hours | +0.6 points |
| P3 Nitpick | 2 | 2 hours | +0.2 points |
| **Total** | **15** | **34 hours** | **+4.2 points** |

---

## Phase 1: Critical Fixes [P0]

**Timeline: This Week | Effort: 4 hours | Impact: +1.3 points**

### P0-001: Remove Database URL Patterns from Production Code

- [ ] **ID**: P0-001
- [ ] **Severity**: Critical
- [ ] **Description**: Remove or abstract hardcoded database connection string patterns from production handler files
- [ ] **Target Files**:
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\implementations\tool-search-server\src\handlers\database\query-database.ts` (lines 231, 248, 710, 711)
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\implementations\tool-search-server\src\schemas\project-schemas.ts` (line 137)
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\definitions\project\query-database.yaml` (line 34)
- [ ] **Action**: Replace literal connection strings with placeholder patterns like `${DATABASE_URL}` or reference environment variables
- [ ] **Verification**: Run `mcp-cli call plugin_goodvibes_goodvibes-tools/scan_for_secrets` and confirm 0 findings in production files
- [ ] **Score Impact**: +0.8 points (Security)

### P0-002: Break Circular Dependency in Handlers

- [ ] **ID**: P0-002
- [ ] **Severity**: Critical
- [ ] **Description**: Resolve circular import between handlers/index.ts and handlers/registry.ts
- [ ] **Target Files**:
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\implementations\tool-search-server\src\handlers\index.ts`
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\implementations\tool-search-server\src\handlers\registry.ts`
- [ ] **Action**:
  1. Create new file `handlers/types.ts` for shared types
  2. Move common interfaces/types to types.ts
  3. Update both files to import from types.ts instead of each other
- [ ] **Verification**: Run `mcp-cli call plugin_goodvibes_goodvibes-tools/find_circular_deps` and confirm 0 cycles
- [ ] **Score Impact**: +0.5 points (Organization, Dependencies)

---

## Phase 2: Quick Wins [P1-High]

**Timeline: This Sprint | Effort: 8 hours | Impact: +1.1 points**

### P1-001: Remove Dead Exports from Automation Module

- [ ] **ID**: P1-001
- [ ] **Severity**: Major
- [ ] **Description**: Remove 18 unused exports from the automation module
- [ ] **Target Files**:
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\automation\build-runner.ts`
    - Remove: `BuildResult` (line 18), `BUILD_COMMANDS` (line 29), `TYPECHECK_COMMAND` (line 37), `detectBuildCommand` (line 50), `runBuild` (line 86), `runTypeCheck` (line 115)
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\automation\git-operations.ts`
    - Remove: `execGit` (line 33), `isGitRepo` (line 61), `detectMainBranch` (line 77), `getCurrentBranch` (line 102), `hasUncommittedChanges` (line 118), `getUncommittedFiles` (line 135), `createCheckpoint` (line 160), `createFeatureBranch` (line 199), `mergeFeatureBranch` (line 237)
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\automation\test-runner.ts`
    - Remove: `TestResult` (line 21), `findTestsForFile` (line 43), `runFullTestSuite` (line 107)
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\automation\fix-loop.ts`
    - Remove: `categorizeError` (line 131), `createErrorState` (line 163), `buildFixContext` (line 194)
- [ ] **Action**: Either delete unused exports or refactor to use them
- [ ] **Verification**: Run `mcp-cli call plugin_goodvibes_goodvibes-tools/find_dead_code` and confirm reduction
- [ ] **Score Impact**: +0.3 points (SOLID/DRY)

### P1-002: Replace String Throws with Error Objects

- [ ] **ID**: P1-002
- [ ] **Severity**: Major
- [ ] **Description**: Replace 42 instances of `throw 'string'` with `throw new Error('string')`
- [ ] **Target Files** (sample - full list has 42 files):
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\implementations\tool-search-server\src\__tests__\fixtures\throws-toplevel-string.ts:7`
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\implementations\tool-search-server\src\__tests__\handlers\test\suggest-cases.test.ts:673`
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\implementations\tool-search-server\src\__tests__\handlers\test\find-tests.test.ts:1404`
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\implementations\tool-search-server\src\__tests__\handlers\test\coverage.test.ts:931`
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\__tests__\quality-gates.test.ts:999`
- [ ] **Action**: Search for `throw '` and `throw "` patterns and wrap in `new Error()`
- [ ] **Verification**: `grep -rn "throw\s*['\"]" plugins/ --include="*.ts" | wc -l` should return 0
- [ ] **Score Impact**: +0.3 points (Error Handling)

### P1-003: Add Root ESLint Configuration

- [ ] **ID**: P1-003
- [ ] **Severity**: Major
- [ ] **Description**: Create unified ESLint configuration at project root
- [ ] **Target Files**:
  - Create: `C:\Users\buzzkill\Documents\vibeplug\eslint.config.js`
- [ ] **Action**:
  1. Create root eslint.config.js extending workspace configs
  2. Add `lint` script to root package.json
  3. Ensure all workspaces inherit common rules
- [ ] **Verification**: `npm run lint` executes without configuration errors
- [ ] **Score Impact**: +0.2 points (Maintainability)

### P1-004: Remove Remaining 463 Dead Exports

- [ ] **ID**: P1-004
- [ ] **Severity**: Major
- [ ] **Description**: Remove remaining dead exports across codebase
- [ ] **Target Files**: See full dead code scan results (481 total - 18 from P1-001 = 463 remaining)
- [ ] **Action**: Systematically review and remove unused exports
- [ ] **Verification**: Run `mcp-cli call plugin_goodvibes_goodvibes-tools/find_dead_code` and confirm < 50 dead exports
- [ ] **Score Impact**: +0.3 points (SOLID/DRY)

---

## Phase 3: Major Refactors [P1-Low]

**Timeline: This Month | Effort: 12 hours | Impact: +1.0 points**

### P1-005: Split explain-codebase.ts (1,042 lines)

- [ ] **ID**: P1-005
- [ ] **Severity**: Major
- [ ] **Description**: Decompose largest handler file into smaller modules
- [ ] **Target File**: `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\implementations\tool-search-server\src\handlers\docs\explain-codebase.ts`
- [ ] **Action**: Split into:
  - `explain-codebase/parser.ts` - AST parsing logic
  - `explain-codebase/analyzer.ts` - Code analysis logic
  - `explain-codebase/formatter.ts` - Output formatting
  - `explain-codebase/index.ts` - Handler orchestration
- [ ] **Verification**: Each new file < 300 lines, all tests pass
- [ ] **Score Impact**: +0.3 points (Organization, Maintainability)

### P1-006: Split validate-api-contract.ts (987 lines)

- [ ] **ID**: P1-006
- [ ] **Severity**: Major
- [ ] **Description**: Decompose second-largest handler file
- [ ] **Target File**: `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\implementations\tool-search-server\src\handlers\edit\validate-api-contract.ts`
- [ ] **Action**: Split into:
  - `validate-api-contract/validators.ts` - Validation logic
  - `validate-api-contract/matchers.ts` - Contract matching
  - `validate-api-contract/index.ts` - Handler entry point
- [ ] **Verification**: Each new file < 350 lines, all tests pass
- [ ] **Score Impact**: +0.2 points (Organization)

### P1-007: Split query-database.ts (980 lines)

- [ ] **ID**: P1-007
- [ ] **Severity**: Major
- [ ] **Description**: Decompose database handler file
- [ ] **Target File**: `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\implementations\tool-search-server\src\handlers\database\query-database.ts`
- [ ] **Action**: Split into:
  - `query-database/connection.ts` - Connection management
  - `query-database/parser.ts` - Query parsing
  - `query-database/executor.ts` - Query execution
  - `query-database/index.ts` - Handler entry point
- [ ] **Verification**: Each new file < 300 lines, all tests pass
- [ ] **Score Impact**: +0.2 points (Organization)

### P1-008: Replace Critical `any` Types with Proper Types

- [ ] **ID**: P1-008
- [ ] **Severity**: Major
- [ ] **Description**: Replace `any` types in production code with proper TypeScript types
- [ ] **Target Files** (production code only - 230 instances in 69 files):
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\implementations\tool-search-server\src\handlers\database\sqlite-connection.ts`
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\implementations\tool-search-server\src\handlers\docs.ts`
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\implementations\tool-search-server\src\utils.ts`
- [ ] **Action**: Define proper interfaces and replace `: any` annotations
- [ ] **Verification**: `grep -rn ": any" plugins/goodvibes/tools/implementations/tool-search-server/src --include="*.ts" | grep -v "__tests__" | wc -l` < 50
- [ ] **Score Impact**: +0.3 points (Naming)

---

## Phase 4: Polish [P2/P3]

**Timeline: This Quarter | Effort: 10 hours | Impact: +0.8 points**

### P2-001: Remove @ts-ignore Directives

- [ ] **ID**: P2-001
- [ ] **Severity**: Minor
- [ ] **Description**: Fix underlying type issues and remove @ts-ignore/@ts-expect-error directives
- [ ] **Target Files**: 15 files with 49 instances
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\implementations\tool-search-server\src\__tests__\utils.test.ts` - 10 instances
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\implementations\tool-search-server\src\__tests__\handlers\validation\typescript-checks.test.ts` - 10 instances
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\tools\implementations\tool-search-server\src\handlers\validation\typescript-checks.ts` - 5 instances
- [ ] **Action**: Fix type errors properly instead of suppressing them
- [ ] **Verification**: `grep -rn "@ts-ignore\|@ts-expect-error" plugins/ --include="*.ts" | wc -l` < 10
- [ ] **Score Impact**: +0.2 points (SOLID/DRY)

### P2-002: Replace console.* with Structured Logger

- [ ] **ID**: P2-002
- [ ] **Severity**: Minor
- [ ] **Description**: Replace console.log/error/warn calls with structured logging
- [ ] **Target Files**: 69 files with 230 console calls
- [ ] **Action**:
  1. Create or use existing logger utility
  2. Replace console.* calls with logger methods
  3. Add log levels and context
- [ ] **Verification**: `grep -rn "console\.\(log\|error\|warn\)" plugins/ --include="*.ts" | grep -v "__tests__" | wc -l` < 20
- [ ] **Score Impact**: +0.2 points (Error Handling)

### P2-003: Replace `as any` Type Assertions

- [ ] **ID**: P2-003
- [ ] **Severity**: Minor
- [ ] **Description**: Replace `as any` casts with proper type assertions or type guards
- [ ] **Target Files**: 26 files with 261 instances
- [ ] **Action**: Use proper type narrowing, type guards, or correct type assertions
- [ ] **Verification**: `grep -rn "as any" plugins/ --include="*.ts" | grep -v "__tests__" | wc -l` < 20
- [ ] **Score Impact**: +0.2 points (Naming)

### P2-004: Standardize Test File Naming

- [ ] **ID**: P2-004
- [ ] **Severity**: Minor
- [ ] **Description**: Use consistent .test.ts naming for all test files
- [ ] **Target Files**: Any .spec.ts files
- [ ] **Action**: Rename .spec.ts files to .test.ts
- [ ] **Verification**: `find plugins/ -name "*.spec.ts" | wc -l` returns 0
- [ ] **Score Impact**: +0.0 points (style consistency)

### P3-001: Unify Prettier Configuration

- [ ] **ID**: P3-001
- [ ] **Severity**: Nitpick
- [ ] **Description**: Create shared Prettier config at root level
- [ ] **Target Files**:
  - Create: `C:\Users\buzzkill\Documents\vibeplug\.prettierrc`
  - Update: workspace configs to extend root
- [ ] **Action**: Create root .prettierrc with project-wide settings
- [ ] **Verification**: All workspaces use consistent formatting
- [ ] **Score Impact**: +0.1 points (Maintainability)

### P3-002: Remove Backup Files from Repository

- [ ] **ID**: P3-002
- [ ] **Severity**: Nitpick
- [ ] **Description**: Remove .backup and similar temporary files
- [ ] **Target Files**:
  - `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\eslint.config.js.backup`
- [ ] **Action**: Delete backup files and add pattern to .gitignore
- [ ] **Verification**: No .backup files in repo
- [ ] **Score Impact**: +0.1 points (Organization)

---

## Verification Commands

After completing each phase, run these commands to verify progress:

```bash
# Check security findings
mcp-cli call plugin_goodvibes_goodvibes-tools/scan_for_secrets '{"path": ".", "severity_threshold": "high"}'

# Check circular dependencies
mcp-cli call plugin_goodvibes_goodvibes-tools/find_circular_deps '{}'

# Check dead code
mcp-cli call plugin_goodvibes_goodvibes-tools/find_dead_code '{}'

# Check type errors
mcp-cli call plugin_goodvibes_goodvibes-tools/check_types '{"strict": true}'

# Run full tech debt analysis
mcp-cli call plugin_goodvibes_goodvibes-tools/identify_tech_debt '{}'
```

---

## Progress Tracking

| Phase | Status | Score Before | Score After | Date Completed |
|-------|--------|--------------|-------------|----------------|
| Phase 1 | Not Started | 5.8 | 7.1 | - |
| Phase 2 | Not Started | 7.1 | 8.2 | - |
| Phase 3 | Not Started | 8.2 | 9.2 | - |
| Phase 4 | Not Started | 9.2 | 10.0 | - |

---

## Notes

- All file paths are absolute paths from the project root
- Estimated effort assumes familiarity with the codebase
- Score impacts are cumulative - completing all tasks should reach 10.0/10
- Prioritize P0 tasks before any other work
- Consider using `mcp-cli call plugin_goodvibes_goodvibes-tools/atomic_multi_edit` for batch file changes
