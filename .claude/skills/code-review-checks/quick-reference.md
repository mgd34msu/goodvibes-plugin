# Code Review Quick Reference

Fast lookup for the 20 most common issues.

## Critical [P0] - Never Allow

| Issue | Pattern | Fix |
|-------|---------|-----|
| `as any` | `as any` | Use proper types or mock factories |
| @deprecated | `@deprecated` | Delete or remove tag |
| Secrets | `apiKey = "..."` | Use `process.env.API_KEY` |

## Major [P1] - Fix Before Merge

| Issue | Pattern | Fix |
|-------|---------|-----|
| Sequential async | `for (...) { await }` | `Promise.all(items.map(...))` |
| Long functions | >50 lines | Extract helpers |
| Silent catch | `catch (_error)` | Log with context |
| Switch statements | `switch { case }` | Use lookup table |
| Missing JSDoc | No `/** */` on exports | Add @param, @returns, @example |
| Duplicate code | Copy-pasted functions | Extract generic helper |
| Unused params | `_input: HookInput` | Use it or simplify |

## Minor [P2] - Fix in Review

| Issue | Pattern | Fix |
|-------|---------|-----|
| Large files | >300 lines | Split into modules |
| No barrel file | No `index.ts` | Create with exports |
| console.log | `console.log()` | Use `debug()` |
| Magic numbers | `if (x > 50)` | `if (x > MAX_LIMIT)` |
| No validation | External input | Use Zod schema |
| Circular deps | A imports B, B imports A | Extract to types.ts |
| `any` type | `: any` | `: unknown` + narrowing |
| No error context | `debug('failed')` | Include filePath, operation |
| Mutable defaults | `= []` | `param ?? []` inside |
| Tight coupling | Hardcoded deps | Inject via params |

## Quick Commands

```bash
# Run all checks
node .claude/skills/code-review-checks/scripts/check-all.js --path src/

# Critical only
node .claude/skills/code-review-checks/scripts/check-all.js --category critical

# With fix suggestions
node .claude/skills/code-review-checks/scripts/check-all.js --json | node .claude/skills/code-review-checks/scripts/fix-suggestions.js

# Check changed files only
git diff --name-only HEAD | grep '\.ts$' > /tmp/changed.txt
node .claude/skills/code-review-checks/scripts/check-all.js --files /tmp/changed.txt

# Generate missing barrel files
node .claude/skills/code-review-checks/scripts/check-barrels.js --generate
```

## Pattern Fixes

### async in loop -> Promise.all
```typescript
// BAD
for (const f of files) { await process(f); }

// GOOD
await Promise.all(files.map(f => process(f)));
```

### switch -> lookup table
```typescript
// BAD
switch (type) { case 'a': handleA(); break; }

// GOOD
const handlers = { a: handleA, b: handleB };
handlers[type]?.();
```

### silent catch -> logged catch
```typescript
// BAD
catch (_e) { return null; }

// GOOD
catch (error: unknown) {
  debug('Failed', { error: error instanceof Error ? error.message : String(error), filePath });
  return null;
}
```

### any -> unknown with narrowing
```typescript
// BAD
function parse(data: any) { return data.value; }

// GOOD
function parse(data: unknown) {
  if (typeof data === 'object' && data && 'value' in data) {
    return (data as { value: string }).value;
  }
  throw new Error('Invalid');
}
```

### mutable default -> nullish coalescing
```typescript
// BAD
function add(items = []) { items.push('x'); return items; }

// GOOD
function add(items?: string[]) { return [...(items ?? []), 'x']; }
```
