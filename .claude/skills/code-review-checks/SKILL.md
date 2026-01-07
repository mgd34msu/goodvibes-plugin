---
name: code-review-checks
description: Detects and fixes common code issues before they become problems. Use after making code changes, before commits, or when asked to review code quality.
---

# Code Review Checks

Automated detection and remediation of the 20 most common code issues found in this codebase.

## Quick Start

After making code changes, run the full check:

```bash
node scripts/check-all.js --path src/
```

Or check specific categories:

```bash
node scripts/check-all.js --category critical --path src/
node scripts/check-all.js --category major --path src/
node scripts/check-all.js --category minor --path src/
```

## Issue Categories

### Critical [P0] - Never Allow

| Issue | Detection | Auto-fix |
|-------|-----------|----------|
| `as any` type assertions | Yes | Manual - requires proper typing |
| `@deprecated` in new code | Yes | Manual - remove or fix |
| Hardcoded secrets | Yes | Manual - use env vars |

### Major [P1] - Fix Before Merge

| Issue | Detection | Auto-fix |
|-------|-----------|----------|
| Sequential async (should be parallel) | Yes | Manual - use Promise.all |
| Functions > 50 lines | Yes | Manual - extract helpers |
| Silent catch blocks (`_error`) | Yes | Manual - add logging |
| Switch instead of strategy pattern | Yes | Manual - use lookup table |
| Missing JSDoc on exports | Yes | Partial - generates stubs |
| Duplicate code patterns | Yes | Manual - extract generic |
| Unused `_param` that should be used | Yes | Manual - use the param |

### Minor [P2] - Fix in Review

| Issue | Detection | Auto-fix |
|-------|-----------|----------|
| Files > 300 lines | Yes | Manual - split file |
| Missing barrel files (index.ts) | Yes | Yes - generates barrel |
| console.log in production | Yes | Manual - use debug() |
| Magic numbers | Partial | Manual - extract constant |
| Missing input validation | Partial | Manual - add Zod schema |
| Circular dependencies | Yes | Manual - extract types |
| `any` types | Yes | Manual - use unknown |
| Missing error context | Partial | Manual - add context |
| Mutable default params | Yes | Manual - use ?? pattern |
| Tight coupling | Partial | Manual - inject deps |

## Workflow

### Post-Change Review

After any code changes, run checks on modified files:

```bash
# Get modified files
git diff --name-only HEAD | grep '\.ts$' > /tmp/changed.txt

# Run checks on changed files
node scripts/check-all.js --files /tmp/changed.txt
```

### Pre-Commit Check

Run full suite before committing:

```bash
node scripts/check-all.js --path src/ --fail-on critical,major
```

### Fix Loop

When issues are found:

1. Run detection: `node scripts/check-all.js --path src/`
2. Review output for each category
3. Fix issues starting with P0 (critical)
4. Re-run until clean

## Detection Details

### 1. Type Safety: `as any`

**Pattern:** `as any` anywhere in source files

```bash
grep -rn "as any" src/ --include="*.ts" --exclude-dir=__tests__
```

**Fix:** Replace with proper types or mock factories in tests.

```typescript
// WRONG
const data = response as any;

// RIGHT
interface ResponseData { id: string; name: string; }
const data = response as ResponseData;
```

### 2. Deprecated Code

**Pattern:** `@deprecated` JSDoc tags

```bash
grep -rn "@deprecated" src/ --include="*.ts"
```

**Fix:** Either delete the deprecated code or remove the tag if still needed.

### 3. Hardcoded Secrets

**Patterns:**
- `api_key`, `apiKey`, `secret`, `password`, `token`, `credential` followed by `=` and quotes
- API key patterns like `sk-`, `pk_`, etc.

```bash
grep -rE "(api[_-]?key|secret|password|token|credential)\s*[:=]\s*['\"]" src/
```

**Fix:** Use environment variables with validation.

### 4. Sequential Async

**Pattern:** `await` inside loops, or multiple sequential `await` statements

```bash
grep -rn "for.*await\|while.*await" src/ --include="*.ts"
```

**Fix:** Use `Promise.all()` for independent operations.

```typescript
// WRONG
for (const file of files) {
  await processFile(file);
}

// RIGHT
await Promise.all(files.map(file => processFile(file)));
```

### 5. Long Functions

**Pattern:** Functions exceeding 50 lines

Use the script: `node scripts/check-function-length.js --max 50`

**Fix:** Extract helper functions with single responsibilities.

### 6. Silent Catch Blocks

**Pattern:** `catch (_error)` or `catch (_err)` or empty catch blocks

```bash
grep -rn "catch\s*(\s*_" src/ --include="*.ts"
```

**Fix:** Log the error with context before returning.

```typescript
// WRONG
catch (_error) { return null; }

// RIGHT
catch (error: unknown) {
  debug('Operation failed', { error: error instanceof Error ? error.message : String(error) });
  return null;
}
```

### 7. Switch Statements

**Pattern:** `switch` with multiple `case` statements

```bash
grep -rn "switch\s*(" src/ --include="*.ts" -A 5 | grep -c "case"
```

**Fix:** Replace with strategy pattern (lookup table).

```typescript
// WRONG
switch (type) { case 'a': handleA(); break; case 'b': handleB(); break; }

// RIGHT
const handlers: Record<string, () => void> = { a: handleA, b: handleB };
handlers[type]?.();
```

### 8. Missing JSDoc

**Pattern:** Exported functions/types without `/** ... */` preceding them

Use the script: `node scripts/check-jsdoc.js`

**Fix:** Add JSDoc with @param, @returns, and @example.

### 9. Duplicate Code

**Pattern:** Similar function structures with minor variations

```bash
npx jscpd src/ --min-lines 5 --min-tokens 50
```

**Fix:** Extract generic helper with parameters for the varying parts.

### 10. Unused Parameters

**Pattern:** `_param` prefix on parameters that should be used

```bash
grep -rn "function.*_[a-z].*:" src/ --include="*.ts"
```

**Fix:** Either use the parameter or simplify if truly unused.

### 11. Large Files

**Pattern:** Files exceeding 300 lines

```bash
find src -name "*.ts" -exec wc -l {} \; | awk '$1 > 300 {print}'
```

**Fix:** Split into multiple focused modules with barrel exports.

### 12. Missing Barrel Files

**Pattern:** Directories with multiple .ts files but no index.ts

Use the script: `node scripts/check-barrels.js`

**Fix:** Create index.ts exporting public API.

### 13. Console.log

**Pattern:** `console.log`, `console.warn`, `console.error` in non-test code

```bash
grep -rn "console\.\(log\|warn\|error\)" src/ --include="*.ts" --exclude-dir=__tests__
```

**Fix:** Use the project's debug/logging utilities.

### 14. Magic Numbers

**Pattern:** Numeric literals > 1 in conditions or assignments

```bash
grep -rE "[^a-zA-Z0-9_][0-9]{2,}[^0-9]" src/ --include="*.ts"
```

**Fix:** Extract to named constants with SCREAMING_SNAKE_CASE.

### 15. Circular Dependencies

**Pattern:** Module A imports B, B imports A

```bash
npx madge --circular src/
```

**Fix:** Extract shared types to a separate types.ts file.

### 16. Any Types

**Pattern:** `: any`, `<any>`, `as any` in type positions

```bash
grep -rn ": any\|<any>" src/ --include="*.ts" --exclude-dir=__tests__
```

**Fix:** Use `unknown` with proper type narrowing.

### 17. Mutable Defaults

**Pattern:** `= []` or `= {}` as default parameter values

```bash
grep -rn "= \[\]\|= {}" src/ --include="*.ts"
```

**Fix:** Use `param ?? []` inside function body instead.

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `check-all.js` | Run all checks with filtering options |
| `check-function-length.js` | Find functions exceeding line limit |
| `check-jsdoc.js` | Find exports missing documentation |
| `check-barrels.js` | Find directories needing index.ts |
| `generate-barrel.js` | Auto-generate barrel file for directory |

## Integration with Hooks

This skill integrates with the pre-commit hook:

```json
{
  "hooks": {
    "PreToolUse": {
      "Bash": {
        "when": "git commit",
        "run": "node .claude/skills/code-review-checks/scripts/check-all.js --fail-on critical"
      }
    }
  }
}
```

## Scoring Impact

Issues cost points on the 10-point code review scale:

| Severity | Deduction | Examples |
|----------|-----------|----------|
| Critical | -1.0 to -2.0 | `as any`, secrets, deprecated |
| Major | -0.5 to -1.0 | Sequential async, long functions |
| Minor | -0.25 to -0.5 | Magic numbers, missing barrel |

Target: Fix all critical and major issues for 9+ score.
