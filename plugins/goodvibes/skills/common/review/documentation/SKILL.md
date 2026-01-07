---
name: documentation
description: Fixes documentation issues including missing JSDoc, module-level comments, and @returns tags. Use when functions lack documentation or JSDoc is incomplete.
---

# Documentation Fixes

Fixes for code documentation issues. Good documentation explains intent, edge cases, and non-obvious behavior - not what the code obviously does.

## Quick Start

1. Identify documentation gap type (missing JSDoc, missing @returns, missing module doc)
2. Read the function/module to understand its purpose
3. Write concise documentation focusing on the "why" and edge cases
4. Verify documentation adds value beyond what code already shows

## Priority

**P3 - Fix when convenient.** Documentation improves maintainability but doesn't affect runtime.

---

## Workflows

### Missing JSDoc on Exported Functions (#10 - 23 occurrences)

**Detection**: Exported function without JSDoc comment.

**Pattern**: Public API without documentation.

```typescript
// PROBLEM - no documentation
export function calculateDiscount(price: number, code: string): number {
  // ...
}
```

**Fix Strategy**: Add focused JSDoc explaining what isn't obvious.

```typescript
// SOLUTION - focused JSDoc
/**
 * Applies a discount code to calculate the final price.
 * @param price - Original price in cents
 * @param code - Discount code (case-insensitive)
 * @returns Final price after discount, minimum 0
 * @throws {InvalidCodeError} When code is expired or invalid
 */
export function calculateDiscount(price: number, code: string): number {
  // ...
}
```

**What to document**:
- Units (cents vs dollars, ms vs seconds)
- Edge cases (empty input, null handling)
- Error conditions (@throws)
- Non-obvious return values
- Side effects

**What NOT to document**:
- Obvious things the signature tells you
- Implementation details
- Things that will get outdated

---

### Missing Module-Level JSDoc (#12 - 55 occurrences - FIXED)

**Pattern**: File without top-level module documentation.

```typescript
// PROBLEM - no module doc
import { db } from './database';

export function createUser() { ... }
```

**Fix Strategy**: Add @module JSDoc at file top.

```typescript
// SOLUTION
/**
 * @module validators/order
 * @description Validation functions for order processing.
 * Handles input sanitization and business rule enforcement.
 */

import { db } from './database';

export function createUser() { ... }
```

**Module doc template**:

```typescript
/**
 * @module {feature}/{filename}
 * @description {One sentence describing the module's purpose}.
 * {Optional second sentence about key functionality or usage context}.
 */
```

---

### Missing @returns in JSDoc (#20 - 8 occurrences)

**Pattern**: JSDoc with @param but no @returns.

```typescript
// PROBLEM - missing @returns
/**
 * Calculates the total with tax.
 * @param subtotal - Amount before tax
 * @param taxRate - Tax rate as decimal (e.g., 0.08 for 8%)
 */
function calculateTotal(subtotal: number, taxRate: number): number {
  return subtotal * (1 + taxRate);
}
```

**Fix Strategy**: Add @returns when return value has non-obvious behavior.

```typescript
// SOLUTION - add @returns
/**
 * Calculates the total with tax.
 * @param subtotal - Amount before tax in cents
 * @param taxRate - Tax rate as decimal (e.g., 0.08 for 8%)
 * @returns Total amount in cents, rounded to nearest cent
 */
function calculateTotal(subtotal: number, taxRate: number): number {
  return Math.round(subtotal * (1 + taxRate));
}
```

**When @returns adds value**:
- Return value has specific units
- Rounding or transformation applied
- Null/undefined possible with specific meaning
- Complex object with important properties

---

## Scripts

### Check Documentation Coverage

```bash
node scripts/check-docs.js /path/to/src
```

### Generate JSDoc Stubs

```bash
node scripts/generate-jsdoc.js /path/to/file.ts
```

---

## JSDoc Templates

### Function Documentation

```typescript
/**
 * {Brief description of what the function does}.
 * @param {paramName} - {Description including units/constraints}
 * @returns {Description including units/edge cases}
 * @throws {ErrorType} {When this error is thrown}
 * @example
 * const result = functionName(arg1, arg2);
 */
```

### Class Documentation

```typescript
/**
 * {Brief description of the class purpose}.
 * @example
 * const instance = new ClassName(config);
 * instance.method();
 */
class ClassName {
  /**
   * Creates a new instance.
   * @param config - Configuration options
   */
  constructor(config: Config) {}
}
```

### Interface Documentation

```typescript
/**
 * Configuration options for {feature}.
 */
interface Config {
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;

  /** Timeout in milliseconds (default: 5000) */
  timeoutMs?: number;

  /** Called when operation completes */
  onComplete?: (result: Result) => void;
}
```

### Type Alias Documentation

```typescript
/**
 * User identifier - either numeric ID or email string.
 * Numeric IDs are for internal users, emails for external.
 */
type UserId = number | string;
```

---

## Documentation Quality Guidelines

### Good Documentation

```typescript
/**
 * Retries a failed operation with exponential backoff.
 * @param operation - Async function to retry
 * @param maxAttempts - Maximum retry count (default: 3)
 * @returns Result of successful operation
 * @throws Last error if all attempts fail
 * @example
 * const data = await withRetry(() => fetchData(id), 5);
 */
```

Why it's good:
- Explains the "exponential backoff" behavior (not obvious from name)
- Documents default values
- Clarifies error behavior
- Provides usage example

### Bad Documentation

```typescript
/**
 * This function retries an operation.
 * @param operation - The operation to retry
 * @param maxAttempts - The max attempts
 * @returns The result
 */
```

Why it's bad:
- Just restates what's obvious from the signature
- Doesn't explain retry strategy
- Doesn't document defaults or error behavior

---

## ESLint Rules

### Require JSDoc

```typescript
// eslint.config.js
{
  rules: {
    'jsdoc/require-jsdoc': ['warn', {
      require: {
        FunctionDeclaration: true,
        MethodDefinition: true,
        ClassDeclaration: true,
      },
      contexts: [
        'ExportNamedDeclaration > FunctionDeclaration',
        'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression',
      ],
    }],
    'jsdoc/require-param-description': 'warn',
    'jsdoc/require-returns-description': 'warn',
  },
}
```

---

## Documentation Maintenance

### Keeping Docs Updated

1. Review JSDoc when changing function signature
2. Update @throws when adding error conditions
3. Update @returns when changing return value
4. Consider removing docs that become misleading

### Automated Checks

- Use `eslint-plugin-jsdoc` for validation
- Run doc coverage in CI
- Generate API docs from JSDoc (TypeDoc)

### When to Skip Documentation

- Internal helper functions with obvious purpose
- Test files
- Type-only files (interfaces self-document)
- Generated code
