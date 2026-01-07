---
name: error-handling
description: Fixes error handling issues including floating promises, silent catches, and throwing non-Error objects. Use when encountering @typescript-eslint/no-floating-promises, silent catch blocks, or throw statement issues.
---

# Error Handling Fixes

Fixes for proper error handling in TypeScript/JavaScript. These issues can cause silent failures, lost stack traces, and unhandled promise rejections that crash Node.js.

## Quick Start

1. Identify the error handling issue type
2. Determine if the operation should fail loudly or gracefully
3. Apply the appropriate fix pattern
4. Verify error paths are tested

## Priority Matrix

| Issue | Priority | Impact |
|-------|----------|--------|
| Floating promises | P0 | Crashes Node.js on unhandled rejection |
| Silent catch blocks | P1 | Hides bugs, makes debugging impossible |
| Throwing non-Error | P1 | Loses stack traces, breaks error handling |

---

## Workflows

### Floating Promises (#11 - 20 occurrences)

**Detection**: `@typescript-eslint/no-floating-promises`

**Pattern**: Promise returned but not awaited or handled.

```typescript
// PROBLEM - floating promise
initializeDatabase();
startServer();
```

**What Happens**: If the promise rejects, Node.js crashes with "UnhandledPromiseRejection".

**Fix Strategy 1**: Sequential startup with top-level handler.

```typescript
// SOLUTION - for startup sequences
async function main(): Promise<void> {
  await initializeDatabase();
  await startServer();
}

main().catch((error: unknown) => {
  console.error('Startup failed:', error);
  process.exit(1);
});
```

**Fix Strategy 2**: Fire-and-forget with explicit void and catch.

```typescript
// SOLUTION - for intentional fire-and-forget
void logAnalytics(event).catch((error: unknown) => {
  // Analytics failure should not crash the app
  debug('Analytics failed', { error });
});
```

**Decision Guide**:

| Scenario | Fix |
|----------|-----|
| Must succeed for app to work | await + let crash or handle |
| Nice-to-have, app works without | void + catch + log |
| Event loop top-level | Wrap in main() with catch |

**Why**: Floating promises hide errors. Always handle explicitly. Use `void` to signal intent.

---

### Silent Catch Blocks (#22 - 8 occurrences)

**Detection**: Catch block with unused error variable (`_error` or `_e`).

**Pattern**: Error caught but swallowed without logging.

```typescript
// PROBLEM - silent catch
try {
  await saveToCache(data);
} catch (_error) {
  // Swallowed silently
}
```

**Fix Strategy**: Log with context, then handle gracefully.

```typescript
// SOLUTION - log and handle
try {
  await saveToCache(data);
} catch (error: unknown) {
  debug('Cache save failed, continuing without cache', {
    error: error instanceof Error ? error.message : String(error),
    dataKey: data.key,
  });
  // Operation continues - cache is optional
}
```

**Logging Template**:

```typescript
catch (error: unknown) {
  logger.warn('Operation failed', {
    operation: 'saveToCache',
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context: { key: data.key, size: data.size },
  });
  // Decide: re-throw, return default, or continue
}
```

**Decision Guide**:

| Error Type | Action |
|------------|--------|
| Network timeout | Log, retry with backoff, or return cached |
| Validation error | Log, return error to caller |
| File not found | Log, return null or create |
| Unknown | Log with full context, re-throw or fail |

**Why**: Silent catches hide bugs. Even expected errors should be logged for debugging.

---

### Throwing Non-Errors (#16 - 8 occurrences)

**Detection**: `@typescript-eslint/only-throw-error`

**Pattern**: Throwing strings or plain objects.

```typescript
// PROBLEM - throwing non-Error
throw 'Something went wrong';
throw { code: 'INVALID', message: 'Bad input' };
```

**Fix Strategy 1**: Use Error objects.

```typescript
// SOLUTION - Error objects
throw new Error('Something went wrong');
```

**Fix Strategy 2**: Custom error classes for structured errors.

```typescript
// SOLUTION - custom error class
class ValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

throw new ValidationError('Bad input', 'INVALID', 'email');
```

**Error Class Hierarchy**:

```typescript
// Base application error
class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Specific error types
class ValidationError extends AppError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}
```

**Why**: Error objects have stack traces. Custom classes enable `instanceof` checks. String throws lose debugging context.

---

## Scripts

### Detect Error Handling Issues

```bash
node scripts/detect-error-issues.js /path/to/src
```

### Fix Floating Promises (Semi-Automated)

```bash
node scripts/fix-floating-promises.js /path/to/file.ts
```

Adds `void` prefix and `.catch()` handler to identified floating promises.

---

## Error Handling Patterns

### Try-Catch-Finally

```typescript
let resource: Resource | null = null;
try {
  resource = await acquireResource();
  await processResource(resource);
} catch (error: unknown) {
  logger.error('Resource processing failed', { error });
  throw error; // Re-throw after logging
} finally {
  if (resource) {
    await resource.release();
  }
}
```

### Result Type Pattern

For operations where errors are expected and should be handled:

```typescript
type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

async function fetchUser(id: string): Promise<Result<User>> {
  try {
    const user = await database.findUser(id);
    if (!user) {
      return { success: false, error: new NotFoundError('User', id) };
    }
    return { success: true, value: user };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

// Usage
const result = await fetchUser('123');
if (!result.success) {
  // Handle error case explicitly
  console.error(result.error.message);
  return;
}
// TypeScript knows result.value is User here
console.log(result.value.name);
```

### Error Boundary Pattern (for frameworks)

```typescript
function withErrorBoundary<T extends (...args: never[]) => Promise<unknown>>(
  fn: T,
  errorHandler: (error: unknown) => void
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      errorHandler(error);
      throw error;
    }
  }) as T;
}
```

---

## Testing Error Paths

### Testing Async Errors

```typescript
describe('fetchUser', () => {
  it('throws NotFoundError for missing user', async () => {
    await expect(fetchUser('nonexistent'))
      .rejects
      .toThrow(NotFoundError);
  });

  it('includes user ID in error message', async () => {
    await expect(fetchUser('123'))
      .rejects
      .toThrow('User not found: 123');
  });
});
```

### Testing Error Properties

```typescript
it('ValidationError has correct properties', () => {
  const error = new ValidationError('Invalid email', 'email');

  expect(error).toBeInstanceOf(Error);
  expect(error).toBeInstanceOf(ValidationError);
  expect(error.name).toBe('ValidationError');
  expect(error.code).toBe('VALIDATION_ERROR');
  expect(error.statusCode).toBe(400);
  expect(error.field).toBe('email');
  expect(error.stack).toBeDefined();
});
```

---

## Common Anti-Patterns

### Catching and Ignoring

```typescript
// BAD
try { await risky(); } catch { }

// GOOD
try {
  await risky();
} catch (error) {
  logger.debug('Risky operation failed (expected)', { error });
}
```

### Catching Too Broadly

```typescript
// BAD - catches everything including programming errors
try {
  const user = await fetchUser(id);
  return processUser(user);
} catch {
  return null;
}

// GOOD - catch specific, re-throw unknown
try {
  const user = await fetchUser(id);
  return processUser(user);
} catch (error) {
  if (error instanceof NotFoundError) {
    return null;
  }
  throw error; // Re-throw unexpected errors
}
```

### Nested Try-Catch

```typescript
// BAD - hard to follow
try {
  try {
    await step1();
  } catch {
    await recovery1();
  }
  try {
    await step2();
  } catch {
    await recovery2();
  }
} catch {
  // ??
}

// GOOD - extract to functions
async function safeStep1() {
  try {
    await step1();
  } catch (error) {
    logger.warn('Step 1 failed, using recovery', { error });
    await recovery1();
  }
}

await safeStep1();
await safeStep2();
```
