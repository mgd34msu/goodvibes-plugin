---
name: async-patterns
description: Fixes async/await pattern issues including unnecessary async, sequential operations that should be parallel, and awaiting non-promises. Use when encountering require-await, await-thenable, or optimizing Promise performance.
---

# Async Pattern Fixes

Fixes for async/await misuse patterns. Correct async patterns improve code clarity and performance.

## Quick Start

1. Identify the async issue type (unnecessary async, sequential awaits, await non-promise)
2. Understand the data dependencies
3. Apply the appropriate pattern
4. Verify correctness with tests

## Priority Matrix

| Issue | Priority | Impact |
|-------|----------|--------|
| require-await | P2 | Code smell, minor overhead |
| Sequential async (should be parallel) | P2 | Performance |
| await-thenable | P1 | Logic error indicator |

---

## Workflows

### Unnecessary Async (#1 - 360 occurrences)

**Detection**: `@typescript-eslint/require-await`

**Pattern**: Function marked `async` but contains no `await`.

```typescript
// PROBLEM - async with no await
async function getData(): Promise<Data> {
  return fetchFromCache(); // fetchFromCache returns Promise
}
```

**Fix Decision Tree**:

| Scenario | Fix |
|----------|-----|
| Function returns Promise directly | Remove `async`, return Promise |
| Interface requires async signature | Add eslint-disable with comment |
| Await will be added later | Add the await now or remove async |

**Fix Strategy 1**: Remove async keyword.

```typescript
// SOLUTION - remove async, return Promise directly
function getData(): Promise<Data> {
  return fetchFromCache();
}
```

**Fix Strategy 2**: Interface conformance (document why).

```typescript
// SOLUTION - async required by interface
// Note: This handler can become async when database is migrated
async function getData(): Promise<Data> {
  // async required by IDataProvider interface - will use await after migration
  return fetchFromCache();
}
```

**Why**: Removing unnecessary `async` is cleaner. The `async` keyword creates an implicit Promise wrapper which adds overhead.

---

### Sequential Async Operations (#21 - 4 occurrences)

**Detection**: Multiple consecutive `await` statements on independent operations.

**Pattern**: Sequential awaits when operations have no data dependency.

```typescript
// PROBLEM - sequential (slow)
const user = await getUser(id);
const orders = await getOrders(id);
const preferences = await getPreferences(id);
// Total time: getUser + getOrders + getPreferences
```

**Fix Strategy 1**: Promise.all for all-or-nothing.

```typescript
// SOLUTION - parallel with Promise.all (fast)
const [user, orders, preferences] = await Promise.all([
  getUser(id),
  getOrders(id),
  getPreferences(id),
]);
// Total time: max(getUser, getOrders, getPreferences)
```

**Fix Strategy 2**: Promise.allSettled for partial success.

```typescript
// SOLUTION - when partial failure is acceptable
const results = await Promise.allSettled([
  getUser(id),
  getOrders(id),
  getPreferences(id),
]);

const user = results[0].status === 'fulfilled' ? results[0].value : null;
const orders = results[1].status === 'fulfilled' ? results[1].value : [];
const preferences = results[2].status === 'fulfilled'
  ? results[2].value
  : defaultPreferences;
```

**Decision Guide**:

| Scenario | Use |
|----------|-----|
| All must succeed | `Promise.all` |
| Partial success OK | `Promise.allSettled` |
| First success wins | `Promise.race` |
| First settled (success/fail) | `Promise.any` |

**Dependency Analysis**:

Before converting to parallel, verify no dependencies:

```typescript
// CANNOT parallelize - orders depends on user
const user = await getUser(id);
const orders = await getOrders(user.accountId); // Depends on user

// CAN parallelize - independent lookups
const user = await getUser(userId);
const product = await getProduct(productId); // Independent
```

**Why**: Sequential awaits add latency unnecessarily. `Promise.all` runs concurrently.

---

### Await Non-Promise (#18 - 4 occurrences)

**Detection**: `@typescript-eslint/await-thenable`

**Pattern**: Using `await` on a non-Promise value.

```typescript
// PROBLEM - awaiting non-Promise
const config = await loadConfig();  // loadConfig returns Config, not Promise<Config>
```

**Fix Strategy 1**: Remove await (most common).

```typescript
// SOLUTION - remove await
const config = loadConfig();
```

**Fix Strategy 2**: Make value a Promise (if async needed).

```typescript
// SOLUTION - if async wrapping is intentional
const config = await Promise.resolve(loadConfig());
```

**Diagnostic Questions**:
1. Was this function previously async? (Refactoring remnant)
2. Should this function be async? (Missing async keyword)
3. Is this intentional sync-to-async conversion? (Use Promise.resolve)

**Why**: Awaiting non-Promises is a code smell indicating refactoring remnant or misunderstanding.

---

## Scripts

### Detect Async Issues

```bash
node scripts/detect-async-issues.js /path/to/src
```

### Find Parallelizable Awaits

```bash
node scripts/find-sequential-awaits.js /path/to/file.ts
```

---

## Advanced Patterns

### Controlled Concurrency

When you need parallelism but with limits:

```typescript
/**
 * Process items with controlled concurrency
 * @param items - Items to process
 * @param concurrency - Max concurrent operations
 * @param processor - Async processor function
 */
async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing = new Set<Promise<void>>();

  for (const item of items) {
    const promise = processor(item).then(result => {
      results.push(result);
      executing.delete(promise);
    });

    executing.add(promise);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

// Usage
const results = await processWithConcurrency(
  userIds,
  5, // Max 5 concurrent requests
  id => fetchUser(id)
);
```

### Sequential with Early Exit

```typescript
/**
 * Process sequentially, stop on first success
 */
async function findFirst<T, R>(
  items: T[],
  finder: (item: T) => Promise<R | null>
): Promise<R | null> {
  for (const item of items) {
    const result = await finder(item);
    if (result !== null) {
      return result;
    }
  }
  return null;
}
```

### Retry with Exponential Backoff

```typescript
interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
}

async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
  } = options;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        break;
      }

      console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`, {
        error: lastError.message,
      });

      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffFactor, maxDelay);
    }
  }

  throw lastError!;
}
```

### Timeout Wrapper

```typescript
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = 'Operation timed out'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

// Usage
const user = await withTimeout(
  fetchUser(id),
  5000,
  'User fetch timed out after 5s'
);
```

---

## Anti-Patterns

### Async Array Methods

```typescript
// WRONG - forEach doesn't await
users.forEach(async user => {
  await saveUser(user); // These run in parallel, uncontrolled
});

// RIGHT - for...of for sequential
for (const user of users) {
  await saveUser(user);
}

// RIGHT - Promise.all for parallel
await Promise.all(users.map(user => saveUser(user)));
```

### Mixing Callbacks and Promises

```typescript
// WRONG - mixing paradigms
function loadData(callback) {
  fetchData().then(data => {
    callback(null, data);
  }).catch(err => {
    callback(err);
  });
}

// RIGHT - promisify or stay consistent
async function loadData(): Promise<Data> {
  return fetchData();
}

// Or if you need callback compatibility
function loadData(callback?: (err: Error | null, data?: Data) => void): Promise<Data> {
  const promise = fetchData();
  if (callback) {
    promise.then(data => callback(null, data)).catch(callback);
  }
  return promise;
}
```

### Creating Unnecessary Promise Wrappers

```typescript
// WRONG - wrapping existing Promise
async function getData(): Promise<Data> {
  return new Promise((resolve, reject) => {
    fetchData().then(resolve).catch(reject);
  });
}

// RIGHT - return directly
function getData(): Promise<Data> {
  return fetchData();
}
```
