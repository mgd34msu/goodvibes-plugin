---
name: code-organization
description: Fixes code organization issues including high complexity, large files, deep nesting, and barrel file problems. Use when functions are too complex, files too long, or directory structure is problematic.
---

# Code Organization Fixes

Fixes for code structure and organization issues. Well-organized code is easier to understand, test, and maintain.

## Quick Start

1. Identify the organization issue (complexity, file size, nesting, barrel)
2. Understand the current responsibilities
3. Apply appropriate extraction/restructuring
4. Verify with tests and imports

## Priority Matrix

| Issue | Priority | Impact |
|-------|----------|--------|
| High complexity | P1 | Hard to test, prone to bugs |
| Large files (>350 lines) | P2 | Hard to navigate |
| Deep nesting (>5 levels) | P3 | Hard to find files |
| Barrel file issues | P3 | Import path problems |

---

## Workflows

### High Cyclomatic Complexity (#8 - 46 occurrences)

**Detection**: `complexity` ESLint rule or manual review.

**Pattern**: Functions with many branches (if/else, switch, loops).

```typescript
// PROBLEM - high cyclomatic complexity
function processOrder(order: Order): Result {
  let result: Result;
  if (order.type === 'standard') {
    if (order.priority === 'high') {
      if (order.items.length > 10) {
        result = processBulkHighPriority(order);
      } else {
        result = processHighPriority(order);
      }
    } else {
      result = processStandard(order);
    }
  } else if (order.type === 'subscription') {
    // ... more nesting
  }
  return result;
}
```

**Fix Strategy 1**: Strategy Pattern with early returns.

```typescript
// SOLUTION - strategy pattern
interface OrderProcessor {
  canHandle(order: Order): boolean;
  process(order: Order): Result;
}

const processors: OrderProcessor[] = [
  new BulkHighPriorityProcessor(),
  new HighPriorityProcessor(),
  new StandardProcessor(),
  new SubscriptionProcessor(),
];

function processOrder(order: Order): Result {
  const processor = processors.find(p => p.canHandle(order));
  if (!processor) {
    throw new Error(`No processor for order type: ${order.type}`);
  }
  return processor.process(order);
}
```

**Fix Strategy 2**: Extract functions with guard clauses.

```typescript
// SOLUTION - extracted functions with guards
function processOrder(order: Order): Result {
  if (order.type === 'subscription') {
    return processSubscription(order);
  }

  if (order.priority === 'high') {
    return processHighPriorityOrder(order);
  }

  return processStandardOrder(order);
}

function processHighPriorityOrder(order: Order): Result {
  if (order.items.length > 10) {
    return processBulkHighPriority(order);
  }
  return processHighPriority(order);
}
```

**Complexity Reduction Techniques**:

| Technique | When to Use |
|-----------|-------------|
| Extract function | Repeated logic or distinct responsibility |
| Strategy pattern | Multiple variants of similar behavior |
| Early return | Reduce nesting depth |
| Lookup table | Replace switch/if-else chains |
| Polymorphism | Type-based branching |

---

### Large Files (#15 - 4 occurrences)

**Detection**: File exceeds 350 lines.

**Pattern**: Single file with multiple responsibilities.

```
// PROBLEM - monolithic file
src/
  orderService.ts  (500 lines: types + validation + processing + API)
```

**Fix Strategy**: Extract by responsibility.

```
// SOLUTION - separated concerns
src/
  orders/
    types.ts           (50 lines)
    validation.ts      (80 lines)
    processing.ts      (120 lines)
    api.ts             (100 lines)
    index.ts           (20 lines - barrel)
```

**Extraction Guide**:

| Content Type | Target Location |
|--------------|-----------------|
| Type definitions | `types.ts` |
| Constants | `constants.ts` |
| Validation logic | `validation.ts` |
| Data transformation | `transform.ts` |
| API/IO operations | `api.ts` or `client.ts` |
| Business logic | `service.ts` or feature name |
| Utilities | `utils/` directory |

**File Size Guidelines**:
- **Ideal**: 100-200 lines
- **Acceptable**: 200-350 lines
- **Needs review**: 350-500 lines
- **Must split**: 500+ lines

---

### Deep Directory Nesting (#33 - 1 occurrence)

**Detection**: Path depth exceeds 5 levels.

**Pattern**: Over-categorized directory structure.

```
// PROBLEM - too deep
src/
  modules/
    orders/
      services/
        processing/
          handlers/
            webhook/
              stripe.ts  (6 levels)
```

**Fix Strategy**: Flatten with descriptive names.

```
// SOLUTION - flattened
src/
  orders/
    webhook-handlers/
      stripe.ts  (3 levels)
```

**Flattening Rules**:
1. Max 4 levels from `src/`
2. Use descriptive compound names instead of deep nesting
3. Group by feature, not by technical layer
4. Use barrel files to simplify imports

**Feature-Based Structure**:

```
src/
  features/
    authentication/
      components/
      hooks/
      api.ts
      types.ts
      index.ts
    orders/
      components/
      hooks/
      api.ts
      types.ts
      index.ts
  shared/
    components/
    utils/
    types/
```

---

### Barrel File Issues (#31, #34)

**Issue #31**: Barrel file with 0% test coverage.

**Fix**: Add export verification test.

```typescript
// __tests__/index.test.ts
import * as exports from '../index';

describe('barrel exports', () => {
  it('exports expected functions', () => {
    expect(exports.processOrder).toBeDefined();
    expect(exports.validateOrder).toBeDefined();
    expect(typeof exports.processOrder).toBe('function');
  });

  it('does not export internal utilities', () => {
    expect((exports as Record<string, unknown>)._internal).toBeUndefined();
  });
});
```

**Issue #34**: Long re-export lists.

**Fix**: Group exports with comments.

```typescript
// BEFORE - long list
export { a } from './a';
export { b } from './b';
// ... 30 more

// SOLUTION - grouped
// Types
export type { User, Order, Product } from './types';

// Services
export { UserService } from './services/user';
export { OrderService } from './services/order';

// Utilities
export { formatDate, formatCurrency } from './utils/format';
export { validate } from './utils/validation';
```

---

### Code Duplication (#25 - 10 occurrences)

**Pattern**: Same logic repeated in multiple places.

```typescript
// PROBLEM - duplicated in each hook
// pre-commit.ts
const results = await runChecks(stagedFiles);
if (results.failed) {
  console.error(formatErrors(results.errors));
  process.exit(1);
}

// pre-push.ts (same logic)
const results = await runChecks(changedFiles);
if (results.failed) {
  console.error(formatErrors(results.errors));
  process.exit(1);
}
```

**Fix Strategy**: Extract shared function.

```typescript
// SOLUTION - shared runner
// hooks/runner.ts
export interface HookContext {
  name: string;
  files: string[];
  checks: Check[];
}

export async function runHook(context: HookContext): Promise<void> {
  const results = await runChecks(context.files, context.checks);

  if (results.failed) {
    console.error(`${context.name} failed:`);
    console.error(formatErrors(results.errors));
    process.exit(1);
  }

  console.log(`${context.name} passed`);
}

// pre-commit.ts
await runHook({
  name: 'pre-commit',
  files: stagedFiles,
  checks: [lintCheck, typeCheck],
});
```

---

### Overloaded Function Signatures (#26 - 2 occurrences)

**Pattern**: Function with multiple overloads doing different things.

```typescript
// PROBLEM - overloaded signatures
function getUser(id: string): Promise<User>;
function getUser(email: string, byEmail: true): Promise<User>;
function getUser(identifier: string, byEmail?: boolean): Promise<User> {
  if (byEmail) {
    return getUserByEmail(identifier);
  }
  return getUserById(identifier);
}
```

**Fix Strategy**: Split into separate well-named functions.

```typescript
// SOLUTION - separate functions
async function getUserById(id: string): Promise<User> {
  return database.users.findById(id);
}

async function getUserByEmail(email: string): Promise<User> {
  return database.users.findByEmail(email);
}
```

**When overloads are justified**:
- Truly polymorphic behavior on same data
- Third-party API compatibility
- Operator-like functions

---

## Scripts

### Analyze Code Organization

```bash
node scripts/analyze-organization.js /path/to/src
```

### Find Large Files

```bash
node scripts/find-large-files.js /path/to/src --max-lines 350
```

### Check Directory Depth

```bash
node scripts/check-depth.js /path/to/src --max-depth 5
```

---

## Refactoring Checklist

Before extracting code:
- [ ] Identify clear responsibility boundary
- [ ] Check for shared state/side effects
- [ ] Plan new file/module structure
- [ ] Update imports in dependent files
- [ ] Add/update barrel exports
- [ ] Run tests after each extraction
- [ ] Update documentation if public API changes
