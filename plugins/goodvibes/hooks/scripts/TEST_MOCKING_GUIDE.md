# Test Mocking Guide for Hooks Scripts

## Problem Summary

The test suite has systematic mocking issues preventing tests from reaching production code. The core issue is a mismatch between implementation and test mocking patterns:

### Implementation Pattern
All automation scripts use **async exec** via `promisify(exec)`:
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function runBuild(cwd: string): Promise<BuildResult> {
  await execAsync(command, { cwd, timeout: 120000 });
  // ...
}
```

### Current Test Pattern (INCORRECT)
Tests mock `execSync` which is never used:
```typescript
vi.doMock('child_process', () => ({
  execSync: vi.fn().mockReturnValue(Buffer.from('')),
}));
```

### Required Test Pattern (CORRECT)
Tests must mock `exec` with callback signature for `promisify` to work:
```typescript
vi.doMock('child_process', () => ({
  exec: vi.fn((cmd, opts, callback) => {
    callback(null, 'stdout', 'stderr');
  }),
  execSync: vi.fn(), // Optional, for compatibility
}));
```

## Shared Test Utilities

Created `src/__tests__/helpers/test-utils.ts` with helper functions:

### For Successful Execution
```typescript
import { createChildProcessMock } from '../helpers/test-utils.js';

vi.doMock('child_process', () => createChildProcessMock('Build successful'));
```

### For Failed Execution
```typescript
import { createChildProcessFailureMock } from '../helpers/test-utils.js';

vi.doMock('child_process', () =>
  createChildProcessFailureMock('Build failed', '', 'error output')
);
```

### For Shared Module Mocking
```typescript
import { createSharedMock } from '../helpers/test-utils.js';

vi.doMock('../../shared/index.js', () =>
  createSharedMock({
    fileExists: ['next.config.js'],
    extractErrorOutput: 'Type error on line 10'
  })
);
```

## Files Requiring Updates

### High Priority (Core Automation)
1. **`src/__tests__/automation/build-runner.test.ts`** - 31 tests, ~18 failing
   - Issue: All `execSync` mocks need to be `exec` mocks
   - Issue: Missing `exec` export in child_process mocks
   - Issue: Test assertions expect sync behavior but implementation is async

2. **`src/__tests__/automation/test-runner.test.ts`** - Similar issues
   - Same pattern as build-runner

3. **`src/__tests__/pre-tool-use/quality-gates.test.ts`** - 51 tests, 31 failing
   - Already has helper function `createChildProcessMock` at line 28
   - Helper is correctly implemented but not consistently used
   - Many tests manually create mocks without including `exec` export

### Medium Priority (Context)
4. **`src/__tests__/context/port-checker.test.ts`** - 34.37% coverage
   - Lines 58-200 uncovered

5. **`src/__tests__/context/recent-activity.test.ts`** - 25.26% coverage
   - Lines 82-263, 282-288 uncovered

### Missing Tests (0% Coverage)
6. **`src/lifecycle/stop.ts`** - No test file
7. **`src/session-end/index.ts`** - No test file
8. **`src/shared/notification.ts`** - No test file

## Step-by-Step Fix for build-runner.test.ts

### 1. Add Import
```typescript
import {
  createChildProcessMock,
  createChildProcessFailureMock,
  createSharedMock,
} from '../helpers/test-utils.js';
```

### 2. Replace All `execSync` Patterns

**Before:**
```typescript
vi.doMock('child_process', () => ({
  execSync: vi.fn().mockReturnValue(Buffer.from('Build successful')),
}));
```

**After:**
```typescript
vi.doMock('child_process', () =>
  createChildProcessMock('Build successful')
);
```

### 3. Replace Failure Patterns

**Before:**
```typescript
vi.doMock('child_process', () => ({
  execSync: vi.fn().mockImplementation(() => {
    throw new Error('Build failed');
  }),
}));
```

**After:**
```typescript
vi.doMock('child_process', () =>
  createChildProcessFailureMock('Build failed', '', errorOutput)
);
```

### 4. Fix Custom Mock Patterns

**Before:**
```typescript
const mockExecSync = vi.fn().mockReturnValue(Buffer.from(''));
vi.doMock('child_process', () => ({
  execSync: mockExecSync,
}));

expect(mockExecSync).toHaveBeenCalledWith(
  'npm run build',
  expect.objectContaining({
    cwd: '/test/project',
    stdio: 'pipe',
    timeout: 120000,
  })
);
```

**After:**
```typescript
const mockExec = vi.fn((cmd, opts, cb) => cb(null, '', ''));
vi.doMock('child_process', () => ({
  exec: mockExec,
  execSync: vi.fn(),
}));

expect(mockExec).toHaveBeenCalledWith(
  'npm run build',
  expect.objectContaining({
    cwd: '/test/project',
    timeout: 120000,
  }),
  expect.any(Function)
);
```

**Key Differences:**
- `exec` requires 3 arguments: command, options, callback
- No `stdio: 'pipe'` in options (handled internally by promisify)
- Callback is the third argument

### 5. Fix Shared Module Mocks

**Before:**
```typescript
vi.doMock('../../shared/index.js', () => ({
  fileExists: vi.fn().mockResolvedValue(false),
  extractErrorOutput: vi.fn(),
}));
```

**After:**
```typescript
vi.doMock('../../shared/index.js', () => createSharedMock());
// Or with options:
vi.doMock('../../shared/index.js', () =>
  createSharedMock({
    fileExists: ['next.config.js'],
    extractErrorOutput: errorOutput
  })
);
```

## Quality-Gates Specific Pattern

The quality-gates test file already has a good helper but needs consistency:

```typescript
/** Helper to create a child_process mock with exec support */
const createChildProcessMock = (options?: {
  execBehavior?: {
    shouldFail?: boolean;
    stdout?: string;
    stderr?: string;
  };
  execSyncImpl?: (...args: any[]) => any;
}) => ({
  exec: vi.fn((cmd, cmdOptions, callback) => {
    const cb = typeof cmdOptions === 'function' ? cmdOptions : callback;
    if (options?.execBehavior?.shouldFail) {
      cb(new Error('Command failed'));
    } else {
      cb(null, {
        stdout: options?.execBehavior?.stdout || '',
        stderr: options?.execBehavior?.stderr || '',
      });
    }
  }),
  execSync: options?.execSyncImpl
    ? vi.fn().mockImplementation(options.execSyncImpl)
    : vi.fn().mockReturnValue(''),
});
```

**Usage:**
```typescript
vi.doMock('child_process', () => createChildProcessMock());

// Or with failure:
vi.doMock('child_process', () =>
  createChildProcessMock({
    execBehavior: { shouldFail: true }
  })
);
```

## Automated Fix Script Template

For bulk updates, use a script like this:

```javascript
import { readFileSync, writeFileSync } from 'fs';

function fixTestFile(filePath) {
  let content = readFileSync(filePath, 'utf-8');

  // Add imports if not present
  if (!content.includes('from \'../helpers/test-utils.js\'')) {
    content = content.replace(
      /(import.*from 'vitest';)/,
      `$1\nimport {\n  createChildProcessMock,\n  createChildProcessFailureMock,\n  createSharedMock,\n} from '../helpers/test-utils.js';`
    );
  }

  // Replace simple success patterns
  content = content.replace(
    /vi\.doMock\('child_process',\s*\(\)\s*=>\s*\(\{\s*execSync:\s*vi\.fn\(\)\.mockReturnValue\(Buffer\.from\('([^']*)'\)\),?\s*\}\)\);/g,
    `vi.doMock('child_process', () => createChildProcessMock('$1'));`
  );

  writeFileSync(filePath, content, 'utf-8');
}
```

## Testing the Fixes

After updating mocks, verify with:

```bash
# Test individual file
npm test -- src/__tests__/automation/build-runner.test.ts

# Test with coverage
npm test -- --coverage src/__tests__/automation/build-runner.test.ts

# Check specific test
npm test -- src/__tests__/automation/build-runner.test.ts -t "should return passed result"
```

## Expected Outcomes

After fixes:
- **build-runner.test.ts**: 31/31 passing (currently 13/31)
- **test-runner.test.ts**: All tests passing
- **quality-gates.test.ts**: 51/51 passing (currently 20/51)
- **Coverage**: Build-runner 35.71% → 100%, Test-runner 25.92% → 100%, Quality-gates 3.63% → 100%

## Common Pitfalls

1. **Forgetting to export `exec`** - `promisify` requires the `exec` function to be available
2. **Using `execSync` signature** - `exec` requires callback as third argument
3. **Including `stdio: 'pipe'`** - Not used in async exec with promisify
4. **Not awaiting async functions** - `runBuild()` and `runTypeCheck()` are async
5. **Mock not resetting between tests** - Use `beforeEach(() => vi.resetModules())`

## References

- **promisify Documentation**: https://nodejs.org/api/util.html#utilpromisifyoriginal
- **child_process.exec**: https://nodejs.org/api/child_process.html#child_processexeccommand-options-callback
- **Vitest Mocking**: https://vitest.dev/guide/mocking.html
