# Test Fix Pattern for Hook Entry Points

## Problem

Hook entry point tests that import hook modules with `isTestEnvironment()` guards fail when using `vi.mock()` + `vi.resetModules()` pattern because:

1. `vi.mock()` is hoisted to module level
2. `vi.resetModules()` in `beforeEach()` clears the mocks
3. The global vitest setup has `isTestEnvironment: () => true`
4. When importing the hook, it sees `isTestEnvironment() === true` and doesn't run

##Solution

Convert tests from `vi.mock()` pattern to `vi.doMock()` pattern (runtime mocking):

### Before (Broken Pattern)
```typescript
// At top level - hoisted
vi.mock('../shared/index.js', () => ({
  respond: mockRespond,
  isTestEnvironment: () => true,  // ← Problem: Hook won't run
}));

describe('hook tests', () => {
  beforeEach(() => {
    vi.resetModules();  // ← Clears mocks
  });

  it('test', async () => {
    await import('../some-hook/index.js');  // ← Uses global isTestEnvironment = true
    expect(mockRespond).toHaveBeenCalled();  // ← Fails: hook never ran
  });
});
```

### After (Working Pattern)
```typescript
describe('hook tests', () => {
  let mockRespond;

  beforeEach(() => {
    vi.resetModules();
    mockRespond = vi.fn().mockReturnValue(undefined);
  });

  async function setupMocksAndImport() {
    // Use vi.doMock (runtime) instead of vi.mock (hoisted)
    vi.doMock('../shared/index.js', () => ({
      respond: mockRespond,
      isTestEnvironment: () => false,  // ← Hook WILL run
    }));

    // Import after mocks are set up
    await import('../some-hook/index.js');

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  it('test', async () => {
    await setupMocksAndImport();
    expect(mockRespond).toHaveBeenCalled();  // ← Works!
  });
});
```

## Key Changes

1. **Move mock declarations into `setupMocksAndImport()`**
   - Use `vi.doMock()` instead of `vi.mock()`
   - Set `isTestEnvironment: () => false` so hook runs

2. **Remove fake timers if they interfere**
   - Don't use `vi.useFakeTimers()` if it blocks async operations
   - Use real dates with `Date.now()` for time-sensitive tests

3. **Ensure hook has `.catch()` handler**
   ```typescript
   if (!isTestEnvironment()) {
     runSomeHook().catch((error) => {
       logError('Hook uncaught', error);
       respond(createResponse());
     });
   }
   ```

## Files That Need This Pattern

Any test file that:
- Imports a hook entry point module (e.g., `session-end/index.js`)
- Uses `vi.resetModules()` in `beforeEach()`
- Currently has `vi.mock('../shared/index.js')` with `isTestEnvironment: () => true`

## Example Files Fixed

- ✅ `src/__tests__/session-end.test.ts` - Fixed and passing
- ⏳ `src/__tests__/post-tool-use-failure.test.ts` - Needs fix
- ⏳ `src/__tests__/pre-compact.test.ts` - Needs fix

## Verify Fix Works

Run individual test file:
```bash
npm test src/__tests__/session-end.test.ts
```

All tests should pass without timeouts.
