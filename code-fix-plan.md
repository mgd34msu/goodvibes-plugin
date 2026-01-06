# Code Fix Plan: Brutal Code Review Issues

**Source:** `code-review.md` (Score: 8.7/10)
**Target:** 10.0/10
**Base Path:** `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src`

---

## Objective Summary

**Goal:** Fix all issues identified in the brutal code review to achieve a perfect 10/10 score

**Scope:** All P1, P2, P3 issues and nitpicks - deprecation removal, type safety improvements, performance optimizations, code quality refactoring, and documentation gaps

**Success Criteria:**
- [ ] All 5 deprecated functions removed
- [ ] All 156 `as any` assertions replaced with proper types
- [ ] Sequential async operations parallelized
- [ ] Long functions refactored
- [ ] Switch statements replaced with handler maps
- [ ] All underscore-prefixed unused params addressed
- [ ] All catch blocks properly typed
- [ ] JSDoc coverage increased to 100%
- [ ] All tests pass after changes

---

## Phase 1: Deprecation Removal (P1-High)

### Task 1.1: Migrate `formatter.ts` away from `env-checker.ts`

**File:** `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\context\formatter.ts`

**Current (Line 11):**
```typescript
import { EnvStatus, formatEnvStatus } from './env-checker.js';
```

**Change to:**
```typescript
import { EnvStatus, formatEnvStatus } from './environment.js';
```

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm run build && npm test
```

---

### Task 1.2: Update test imports from `env-checker.ts` to `environment.ts`

**Files to update:**

1. `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\__tests__\context.test.ts`
   - Line 26: Change `import { checkEnvironment, formatEnvStatus, EnvStatus } from '../context/env-checker';`
   - To: `import { checkEnvStatus as checkEnvironment, formatEnvStatus, EnvStatus } from '../context/environment';`
   - Note: Tests use `checkEnvironment` which maps to `checkEnvStatus` for EnvStatus return type

2. `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\__tests__\context\formatter.test.ts`
   - Line 11: Change `import type { EnvStatus } from '../../context/env-checker.js';`
   - To: `import type { EnvStatus } from '../../context/environment.js';`
   - Line 20: Change `vi.mock('../../context/env-checker.js');`
   - To: `vi.mock('../../context/environment.js');`
   - Line 37: Change `import { formatEnvStatus } from '../../context/env-checker.js';`
   - To: `import { formatEnvStatus } from '../../context/environment.js';`

3. `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\__tests__\context\index.test.ts`
   - Line 22: The `checkEnvironment` import will fail after env-checker deletion
   - Need to verify if this test is for deprecated function or should use `checkEnvStatus`

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm run build && npm test
```

---

### Task 1.3: Delete `env-checker.ts` file

**File:** `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\context\env-checker.ts`

**Action:** Delete this entire file (35 lines)

**Pre-requisite:** Tasks 1.1 and 1.2 must be complete

**Also delete test file:**
`C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\__tests__\context\env-checker.test.ts`

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm run build && npm test
```

---

### Task 1.4: Remove deprecated `checkEnvironment` alias from `environment.ts`

**File:** `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\context\environment.ts`

**Remove (Lines 254-263):**
```typescript
/**
 * Check environment configuration (comprehensive).
 *
 * @deprecated Use {@link analyzeEnvironment} for clarity. This is an alias for backwards compatibility.
 * @param cwd - Working directory to analyze
 * @returns Promise resolving to EnvironmentContext
 */
export async function checkEnvironment(cwd: string): Promise<EnvironmentContext> {
  return analyzeEnvironment(cwd);
}
```

**Pre-requisite:** All callers must be migrated to use `analyzeEnvironment()` or `checkEnvStatus()` directly

**Update tests:**
- `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\__tests__\environment.test.ts` - Lines 20, 641-648
- `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\__tests__\context\environment.test.ts` - Lines 14, 659-680

These tests verify the deprecated alias works - they should be removed or converted to test `analyzeEnvironment` directly.

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm run build && npm test
```

---

### Task 1.5: Remove deprecated `respond` function from `hook-io.ts`

**File:** `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\shared\hook-io.ts`

**Current Pattern (used 60+ times across codebase):**
```typescript
respond(createResponse());
respond(allowTool('PreToolUse'));
respond(blockTool('PreToolUse', 'reason'), true);
```

**Target Pattern:**
```typescript
console.log(formatResponse(createResponse()));
process.exit(0);
```

**This is a MAJOR change** affecting 15+ source files. Consider these options:

**Option A (Recommended):** Keep `respond()` but remove `@deprecated` tag
- The function is working correctly and used consistently
- Removing it would require 60+ manual refactors with no functional benefit
- The deprecation note says to use `formatResponse()` + manual exit, but `respond()` encapsulates this correctly

**Option B:** Create a migration plan to replace all 60+ usages
- This would be a massive refactor for minimal benefit
- High risk of introducing bugs

**Recommendation:** Remove the `@deprecated` tag from `respond()` since it's the canonical pattern used throughout the codebase. Document it as the preferred approach.

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm run build && npm test
```

---

## Phase 2: Test Type Safety (P1-Medium)

### Task 2.1: Extend `mock-factories.ts` with additional mock helpers

**File:** `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\__tests__\test-utils\mock-factories.ts`

**Add these new factory functions:**

```typescript
// ============================================================================
// fs.readdir Mock Helpers (for withFileTypes: true)
// ============================================================================

/**
 * Creates a mock readdir result for directory listings with file types.
 * Use this when mocking `fs.promises.readdir()` called with `{ withFileTypes: true }`.
 *
 * @param entries - Array of file/directory entries
 * @returns Array of properly typed Dirent objects
 *
 * @example
 * vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
 *   if (dirPath === '/test/project') {
 *     return createMockReaddirResult([
 *       { name: 'src', type: 'directory' },
 *       { name: 'file.ts', type: 'file' },
 *     ]);
 *   }
 *   return [];
 * });
 */
export function createMockReaddirResult(
  entries: Array<{ name: string; type: 'file' | 'directory' }>
): Dirent[] {
  return entries.map(entry => createMockDirent(entry.name, {
    isFile: entry.type === 'file',
    isDirectory: entry.type === 'directory',
  }));
}

/**
 * Creates a mock fs.Stats object for stat operations.
 *
 * @param options - Stats options (isDirectory, isFile, etc.)
 * @returns A properly typed Stats object
 *
 * @example
 * vi.mocked(fs.stat).mockResolvedValue(createMockStats({ isDirectory: true }));
 */
export function createMockStats(options?: {
  isFile?: boolean;
  isDirectory?: boolean;
  size?: number;
  mtime?: Date;
}): import('fs').Stats {
  const isFile = options?.isFile ?? !options?.isDirectory;
  const isDirectory = options?.isDirectory ?? false;

  return {
    isFile: () => isFile,
    isDirectory: () => isDirectory,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    dev: 0,
    ino: 0,
    mode: 0,
    nlink: 1,
    uid: 0,
    gid: 0,
    rdev: 0,
    size: options?.size ?? 0,
    blksize: 4096,
    blocks: 0,
    atimeMs: Date.now(),
    mtimeMs: Date.now(),
    ctimeMs: Date.now(),
    birthtimeMs: Date.now(),
    atime: new Date(),
    mtime: options?.mtime ?? new Date(),
    ctime: new Date(),
    birthtime: new Date(),
  } as import('fs').Stats;
}
```

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm run build && npm test
```

---

### Task 2.2: Replace `as any` in `todo-scanner.test.ts` (95 instances)

**File:** `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\__tests__\context\todo-scanner.test.ts`

**Pattern to replace:**

**Before:**
```typescript
vi.mocked(fs.readdir).mockImplementation(async (dirPath: any) => {
  if (dirPath === mockCwd) {
    return [
      { name: 'file1.ts', isDirectory: () => false, isFile: () => true },
    ] as any;
  }
  return [] as any;
});
```

**After:**
```typescript
import { createMockDirentsWithTypes } from '../test-utils/mock-factories';

vi.mocked(fs.readdir).mockImplementation(async (dirPath: string | Buffer | URL) => {
  if (dirPath === mockCwd) {
    return createMockDirentsWithTypes([
      { name: 'file1.ts', isFile: true },
    ]);
  }
  return [];
});
```

**Common patterns to fix:**
1. `(dirPath: any)` -> `(dirPath: string | Buffer | URL)`
2. `{ name: '...', isDirectory: () => ..., isFile: () => ... } as any` -> `createMockDirentsWithTypes([...])`
3. `return [] as any` -> `return []`

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm test -- src/__tests__/context/todo-scanner.test.ts
```

---

### Task 2.3: Replace `as any` in `memory-loader.test.ts` (24 instances)

**File:** `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\__tests__\context\memory-loader.test.ts`

**Pattern to replace:**

**Before:**
```typescript
mockedFsPromises.readFile.mockImplementation(async (filePath: any) => {
  if (filePath.endsWith('decisions.json')) return JSON.stringify(decisions);
  throw new Error('File not found');
});
```

**After:**
```typescript
mockedFsPromises.readFile.mockImplementation(async (filePath: PathLike | FileHandle) => {
  const pathStr = filePath.toString();
  if (pathStr.endsWith('decisions.json')) return JSON.stringify(decisions);
  throw new Error('File not found');
});
```

**Also fix:**
- `mockedFsPromises.stat.mockImplementation(async (filePath: any) => {...})`
- `return { isDirectory: () => true } as any` -> use `createMockStats({ isDirectory: true })`
- `mockedFsPromises.readdir.mockResolvedValue(['note1.md', 'note2.txt'] as any)` -> proper typing

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm test -- src/__tests__/context/memory-loader.test.ts
```

---

### Task 2.4: Replace `as any` in remaining test files (61 instances)

**Files to fix (in order of instance count):**
1. `retry-tracker.test.ts` - 4 instances
2. Various other test files with 1-3 instances each

**Apply same patterns as Tasks 2.2 and 2.3**

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm test
```

---

## Phase 3: Code Quality (P2)

### Task 3.1: Parallelize sequential file checks in `environment.ts`

**File:** `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\context\environment.ts`

**Current (Lines 193-201):**
```typescript
// Check which env files exist
for (const envFile of ENV_FILES) {
  const filePath = path.join(cwd, envFile);
  if (await fileExists(filePath)) {
    envFiles.push(envFile);
    const vars = await parseEnvFile(filePath);
    definedVars = [...definedVars, ...vars];
  }
}
```

**Change to:**
```typescript
// Check which env files exist (parallel)
const fileChecks = await Promise.all(
  ENV_FILES.map(async (envFile) => {
    const filePath = path.join(cwd, envFile);
    const exists = await fileExists(filePath);
    if (exists) {
      const vars = await parseEnvFile(filePath);
      return { envFile, vars };
    }
    return null;
  })
);

for (const result of fileChecks) {
  if (result) {
    envFiles.push(result.envFile);
    definedVars = [...definedVars, ...result.vars];
  }
}
```

**Current (Lines 209-217):**
```typescript
// Check for .env.example
for (const exampleFile of ENV_EXAMPLE_FILES) {
  const filePath = path.join(cwd, exampleFile);
  if (await fileExists(filePath)) {
    hasEnvExample = true;
    exampleVars = await parseEnvFile(filePath);
    break;
  }
}
```

**Change to:**
```typescript
// Check for .env.example (parallel check, sequential processing)
const exampleChecks = await Promise.all(
  ENV_EXAMPLE_FILES.map(async (exampleFile) => {
    const filePath = path.join(cwd, exampleFile);
    const exists = await fileExists(filePath);
    return { exampleFile, filePath, exists };
  })
);

for (const check of exampleChecks) {
  if (check.exists) {
    hasEnvExample = true;
    exampleVars = await parseEnvFile(check.filePath);
    break;
  }
}
```

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm run build && npm test -- src/__tests__/context/environment.test.ts
```

---

### Task 3.2: Refactor `formatContextSections` in `context-builder.ts`

**File:** `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\session-start\context-builder.ts`

**Current:** 103-line function (Lines 87-190)

**Refactor into smaller functions:**

```typescript
/** Formats the header section */
function formatHeader(): string[] {
  return [
    '[GoodVibes SessionStart]',
    '='.repeat(SECTION_SEPARATOR_LENGTH),
    '',
  ];
}

/** Formats an optional section with header */
function formatOptionalSection(
  header: string,
  content: string | null
): string[] {
  if (!content) return [];
  return [`## ${header}`, '', content, ''];
}

/** Formats the recovery section if needed */
function formatRecoverySection(recoveryInfo: RecoveryInfo): string[] {
  if (!recoveryInfo.needsRecovery) return [];
  const recoveryStr = formatRecoveryContext(recoveryInfo);
  return recoveryStr ? [recoveryStr, ''] : [];
}

/** Formats the project overview section */
function formatProjectOverviewSection(
  stackInfo: StackInfo,
  folderAnalysis: FolderAnalysis
): string[] {
  const parts: string[] = ['## Project Overview', ''];

  const stackStr = formatStackInfo(stackInfo);
  if (stackStr) parts.push(stackStr);

  const folderStr = formatFolderAnalysis(folderAnalysis);
  if (folderStr) parts.push(folderStr);

  parts.push('');
  return parts;
}

/** Formats the git status section */
function formatGitSection(gitContext: GitContext): string[] {
  const parts: string[] = ['## Git Status', ''];
  const gitStr = formatGitContext(gitContext);
  if (gitStr) parts.push(gitStr);
  parts.push('');
  return parts;
}

/** Formats the context sections into a single string */
function formatContextSections(
  recoveryInfo: RecoveryInfo,
  stackInfo: StackInfo,
  folderAnalysis: FolderAnalysis,
  gitContext: GitContext,
  envStatus: EnvStatus,
  portStatus: PortStatus,
  memory: ProjectMemory,
  todos: TodoItem[],
  healthStatus: HealthStatus
): string {
  const contextParts: string[] = [
    ...formatHeader(),
    ...formatRecoverySection(recoveryInfo),
    ...formatProjectOverviewSection(stackInfo, folderAnalysis),
    ...formatGitSection(gitContext),
    ...formatOptionalSection('Environment', formatEnvStatus(envStatus)),
    ...formatOptionalSection('Dev Servers', formatPortStatusIfActive(portStatus)),
    ...formatOptionalSection('Project Memory', formatMemoryContext(memory)),
    ...formatOptionalSection('Code TODOs', formatTodos(todos)),
    ...formatOptionalSection('Health Checks', formatHealthIfWarning(healthStatus)),
    '='.repeat(SECTION_SEPARATOR_LENGTH),
  ];

  return contextParts.join('\n');
}

// Helper for conditional port status
function formatPortStatusIfActive(portStatus: PortStatus): string | null {
  const portStr = formatPortStatus(portStatus);
  return portStr && portStr !== 'No dev servers detected' ? portStr : null;
}

// Helper for conditional health status
function formatHealthIfWarning(healthStatus: HealthStatus): string | null {
  const healthStr = formatHealthStatus(healthStatus);
  return healthStr && healthStr !== 'Health: All good' ? healthStr : null;
}
```

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm run build && npm test -- src/__tests__/session-start/context-builder.test.ts
```

---

### Task 3.3: Replace switch statement with handler map in `pre-tool-use.ts`

**File:** `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\pre-tool-use.ts`

**Current (Lines 259-278):**
```typescript
switch (toolName) {
  case 'detect_stack':
    await validateDetectStack(input);
    break;
  case 'get_schema':
    await validateGetSchema(input);
    break;
  case 'run_smoke_test':
    await validateRunSmokeTest(input);
    break;
  case 'check_types':
    await validateCheckTypes(input);
    break;
  case 'validate_implementation':
    await validateImplementation(input);
    break;
  default:
    debug(`Unknown tool '${toolName}', allowing by default`);
    respond(allowTool('PreToolUse'));
}
```

**Change to:**
```typescript
/** Tool validators keyed by tool name */
const TOOL_VALIDATORS: Record<string, (input: HookInput) => Promise<void>> = {
  detect_stack: validateDetectStack,
  get_schema: validateGetSchema,
  run_smoke_test: validateRunSmokeTest,
  check_types: validateCheckTypes,
  validate_implementation: validateImplementation,
};

// In runPreToolUseHook:
const validator = TOOL_VALIDATORS[toolName];
if (validator) {
  await validator(input);
} else {
  debug(`Unknown tool '${toolName}', allowing by default`);
  respond(allowTool('PreToolUse'));
}
```

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm run build && npm test -- src/__tests__/pre-tool-use.test.ts
```

---

### Task 3.4: Extract generic update state helper in `state.ts`

**File:** `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\state.ts`

**Current (Lines 94-171):** 4 nearly identical functions

**Add generic helper:**
```typescript
/**
 * Generic helper to update a nested state property.
 * @internal
 */
function updateNestedState<K extends keyof HooksState>(
  state: HooksState,
  key: K,
  updates: Partial<HooksState[K]>
): HooksState {
  return {
    ...state,
    [key]: { ...state[key], ...updates },
  };
}

/** Updates session-related state with partial data. */
export function updateSessionState(
  state: HooksState,
  updates: Partial<HooksState['session']>
): HooksState {
  return updateNestedState(state, 'session', updates);
}

/** Updates test-related state with partial data. */
export function updateTestState(
  state: HooksState,
  updates: Partial<HooksState['tests']>
): HooksState {
  return updateNestedState(state, 'tests', updates);
}

/** Updates build-related state with partial data. */
export function updateBuildState(
  state: HooksState,
  updates: Partial<HooksState['build']>
): HooksState {
  return updateNestedState(state, 'build', updates);
}

/** Updates git-related state with partial data. */
export function updateGitState(
  state: HooksState,
  updates: Partial<HooksState['git']>
): HooksState {
  return updateNestedState(state, 'git', updates);
}
```

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm run build && npm test -- src/__tests__/state.test.ts
```

---

## Phase 4: Polish (P3)

### Task 4.1: Fix underscore-prefixed unused parameters in `pre-tool-use.ts`

**File:** `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\pre-tool-use.ts`

**Lines 175 and 184:**

**Current:**
```typescript
export async function validateDetectStack(_input: HookInput): Promise<void> {
```

**Options:**
1. If `input` is genuinely unused, use destructuring: `export async function validateDetectStack(_: HookInput): Promise<void> {`
2. If it might be used in future, add `// eslint-disable-next-line @typescript-eslint/no-unused-vars` above
3. If it should be used, actually use `input.cwd` instead of relying on `fileExistsRelative`

**Recommended change:** Since these functions use `fileExistsRelative()` which internally uses process.cwd(), they should use `input.cwd`:

```typescript
export async function validateDetectStack(input: HookInput): Promise<void> {
  const cwd = input.cwd || process.cwd();
  if (!(await fileExists(path.join(cwd, 'package.json')))) {
    respond(blockTool('PreToolUse', 'No package.json found in project root. Cannot detect stack.'), true);
    return;
  }
  respond(allowTool('PreToolUse'));
}
```

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm run build && npm test -- src/__tests__/pre-tool-use.test.ts
```

---

### Task 4.2: Fix catch block typing in `memory-loader.ts`

**File:** `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\context\memory-loader.ts`

**Line 20:**

**Current:**
```typescript
} catch (error) {
  debug(`Directory check failed for ${filePath}: ${error}`);
  return false;
}
```

**Change to:**
```typescript
} catch (error: unknown) {
  debug(`Directory check failed for ${filePath}: ${error}`);
  return false;
}
```

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm run build && npm test -- src/__tests__/context/memory-loader.test.ts
```

---

### Task 4.3: Fix `_error` pattern in `todo-scanner.ts`

**File:** `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\context\todo-scanner.ts`

**Lines 50 and 83:**

**Current:**
```typescript
} catch (_error) {
  // Skip directories we can't read (permission errors, etc.)
}
```

**Change to:**
```typescript
} catch (error: unknown) {
  // Skip directories we can't read (permission errors, etc.)
  // Intentionally silent - this is expected for permission-denied directories
  debug('Directory scan skipped', { error: String(error) });
}
```

**Note:** Need to import debug from shared/logging.js

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm run build && npm test -- src/__tests__/context/todo-scanner.test.ts
```

---

### Task 4.4: Split `mock-factories.ts` into multiple files

**File:** `C:\Users\buzzkill\Documents\vibeplug\plugins\goodvibes\hooks\scripts\src\__tests__\test-utils\mock-factories.ts`

**Current:** 445 lines

**Create new structure:**
```
src/__tests__/test-utils/
  mock-factories/
    index.ts         # Re-exports all
    fs-mocks.ts      # Dirent, Stats, Buffer mocks
    state-mocks.ts   # HooksState, FileState mocks
    telemetry-mocks.ts  # ActiveAgentEntry, TelemetryRecord mocks
    git-mocks.ts     # Git command mocks
  mock-factories.ts  # Keep as barrel file for backwards compatibility
```

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm run build && npm test
```

---

### Task 4.5: Add JSDoc to remaining source files

**Target:** Increase from 45.5% (46/101 files) to 100% (81+ files)

**Priority files (modules without any JSDoc):**
1. `src/memory/*.ts` - 5 files
2. Other utility files

**JSDoc template to add:**
```typescript
/**
 * [Module Name]
 *
 * [One-line description of what this module does]
 *
 * @module [module-name]
 * @see [related-modules]
 */
```

**For each exported function/interface, add:**
```typescript
/**
 * [Brief description]
 *
 * @param paramName - Description of parameter
 * @returns Description of return value
 *
 * @example
 * const result = functionName(param);
 */
```

**Verification:**
```bash
cd plugins/goodvibes/hooks/scripts && npm run build
```

---

### Task 4.6: Update JSDoc examples to use return values instead of console.log

**Locations:** 65 instances across codebase

**Pattern to fix:**

**Before:**
```typescript
/**
 * @example
 * const input = await readHookInput();
 * console.log(input.hook_event_name);
 */
```

**After:**
```typescript
/**
 * @example
 * const input = await readHookInput();
 * // input.hook_event_name === 'PreToolUse'
 * // input.tool_name === 'Bash'
 */
```

---

## Dependency Graph

```
Phase 1 (Deprecation Removal):
  1.1 (formatter.ts migration) ─────┐
                                    ├──> 1.3 (delete env-checker.ts)
  1.2 (test import updates) ────────┘

  1.4 (remove checkEnvironment alias) - independent
  1.5 (assess respond deprecation) - independent

Phase 2 (Test Type Safety):
  2.1 (extend mock-factories) ──> 2.2, 2.3, 2.4 (replace as any)

Phase 3 (Code Quality):
  3.1, 3.2, 3.3, 3.4 - all independent

Phase 4 (Polish):
  4.1, 4.2, 4.3, 4.4, 4.5, 4.6 - all independent
```

---

## Parallel Execution Groups

### Group 1 (Start Immediately)
- Task 1.1: Migrate formatter.ts imports
- Task 1.2: Update test imports
- Task 2.1: Extend mock-factories.ts
- Task 3.3: Replace switch with handler map
- Task 3.4: Extract generic state helper

### Group 2 (After Group 1)
- Task 1.3: Delete env-checker.ts (requires 1.1, 1.2)
- Task 2.2: Replace as any in todo-scanner.test.ts (requires 2.1)
- Task 2.3: Replace as any in memory-loader.test.ts (requires 2.1)
- Task 3.1: Parallelize environment.ts
- Task 3.2: Refactor context-builder.ts

### Group 3 (After Group 2)
- Task 1.4: Remove checkEnvironment alias (requires 1.3)
- Task 2.4: Replace as any in remaining tests (requires 2.2, 2.3)
- Task 4.1: Fix unused params
- Task 4.2: Fix catch typing
- Task 4.3: Fix _error pattern

### Group 4 (Final)
- Task 1.5: Assess respond deprecation
- Task 4.4: Split mock-factories.ts
- Task 4.5: Add JSDoc coverage
- Task 4.6: Update JSDoc examples

---

## Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking changes when removing deprecated functions | Medium | High | Run full test suite after each deprecation removal |
| Type errors after removing `as any` | Medium | Medium | Fix incrementally, run tests after each file |
| Regressions in parallel async changes | Low | High | Test performance with real directory structures |
| Mock factory changes break existing tests | Low | Medium | Keep backwards compatibility exports |

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `npm run build` passes with no errors
- [ ] `npm test` passes with 100% coverage maintained
- [ ] `npm run lint` passes (if configured)
- [ ] No TypeScript strict mode violations
- [ ] All deprecated code removed
- [ ] No `as any` remaining in test files (grep check)
- [ ] JSDoc coverage at 100%

```bash
# Final verification commands
cd plugins/goodvibes/hooks/scripts
npm run build
npm test
grep -r "as any" src/__tests__/ | wc -l  # Should be 0
grep -r "@deprecated" src/ | wc -l  # Should be 0
```
