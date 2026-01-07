---
name: naming-conventions
description: Fixes naming convention issues including unused variables, single-letter names, and non-standard abbreviations. Use when encountering no-unused-vars errors or reviewing variable naming.
---

# Naming Convention Fixes

Fixes for variable naming issues. Good names are searchable, self-documenting, and follow consistent conventions.

## Quick Start

1. Identify the naming issue (unused var, single letter, abbreviation)
2. Determine if the variable is truly needed
3. Apply appropriate fix (rename, remove, or prefix)
4. Verify no regressions

## Priority Matrix

| Issue | Priority | Impact |
|-------|----------|--------|
| Unused variables | P2 | Dead code, confusion |
| Single-letter names | P3 | Hard to search/understand |
| Non-standard abbreviations | P3 | Inconsistency |

---

## Workflows

### Unused Variables (#5 - 123 occurrences)

**Detection**: `@typescript-eslint/no-unused-vars`

**Pattern**: Variable declared but never used.

```typescript
// PROBLEM - unused variables
const { data, error, status } = await fetchData();
console.log(data);
// error and status never used
```

**Fix Strategy 1**: Underscore prefix (documents intent).

```typescript
// SOLUTION - underscore prefix
const { data, error: _error, status: _status } = await fetchData();
console.log(data);
```

**Fix Strategy 2**: Omit from destructuring.

```typescript
// SOLUTION - don't destructure unused
const { data } = await fetchData();
console.log(data);
```

**Decision Guide**:

| Scenario | Fix |
|----------|-----|
| Want to document full shape | Underscore prefix |
| Truly don't need it | Omit from destructuring |
| Callback parameter required | Underscore prefix |
| Will use later | Add TODO comment or use now |

**Underscore Convention**:
- `_error` - Intentionally ignored
- `_unused` - Known unused, kept for signature
- `_` - Single underscore for completely ignored

---

### Single-Letter Variable Names (#19 - 12 occurrences)

**Detection**: Variable name is single character (except standard exceptions).

**Pattern**: Short names in array methods.

```typescript
// PROBLEM - single letters
users.map(u => u.name);
items.filter(i => i.active);
orders.reduce((a, o) => a + o.total, 0);
```

**Fix Strategy**: Use descriptive contextual names.

```typescript
// SOLUTION - descriptive names
users.map(user => user.name);
items.filter(item => item.active);
orders.reduce((sum, order) => sum + order.total, 0);
```

**Acceptable Single Letters**:

| Letter | Context |
|--------|---------|
| `i`, `j`, `k` | Numeric indices in loops |
| `x`, `y`, `z` | Coordinates, math |
| `n` | Count/number |
| `_` | Intentionally unused |
| `T`, `K`, `V` | Generic type parameters |

**Naming Patterns**:

| Collection Type | Singular Name |
|-----------------|---------------|
| `users` | `user` |
| `items` | `item` |
| `orders` | `order` |
| `results` | `result` |
| `entries` | `entry` |
| `values` | `value` |

**Reduce Accumulator Names**:

| Purpose | Name |
|---------|------|
| Sum | `sum`, `total` |
| Object building | `result`, `acc` |
| Array building | `collected`, `items` |
| Map building | `map`, `lookup` |
| Count | `count` |

---

### Non-Standard Abbreviations (#30 - 15 occurrences)

**Detection**: Project-specific abbreviations that aren't universally understood.

**Pattern**: Abbreviated variable names.

```typescript
// PROBLEM - non-standard abbreviations
const cwd = process.cwd();
const dir = path.dirname(file);
const env = process.env.NODE_ENV;
const cfg = loadConfig();
```

**Fix Strategy**: Expand non-standard, keep standard.

```typescript
// SOLUTION
const currentWorkingDirectory = process.cwd();
const directory = path.dirname(file);
const environment = process.env.NODE_ENV;
const config = loadConfig();

// KEEP (universally understood)
const url = new URL(input);
const userId = params.id;
const apiKey = env.API_KEY;
```

**Standard Abbreviations (KEEP)**:

| Abbreviation | Full Form |
|--------------|-----------|
| `url` | Uniform Resource Locator |
| `api` | Application Programming Interface |
| `id` | Identifier |
| `html` | HyperText Markup Language |
| `css` | Cascading Style Sheets |
| `json` | JavaScript Object Notation |
| `http` | HyperText Transfer Protocol |
| `io` | Input/Output |
| `db` | Database |
| `fs` | File System |
| `os` | Operating System |
| `ui` | User Interface |
| `cli` | Command Line Interface |
| `regex` | Regular Expression |

**Non-Standard Abbreviations (EXPAND)**:

| Abbreviation | Expand To |
|--------------|-----------|
| `cwd` | `currentWorkingDirectory` |
| `dir` | `directory` |
| `env` | `environment` |
| `cfg` | `config` |
| `ctx` | `context` |
| `msg` | `message` |
| `err` | `error` |
| `req` | `request` |
| `res` | `response` |
| `params` | `parameters` |
| `args` | `arguments` |
| `props` | `properties` |
| `opts` | `options` |
| `cb` | `callback` |
| `fn` | `function` |
| `val` | `value` |
| `num` | `number` |
| `str` | `string` |
| `arr` | `array` |
| `obj` | `object` |
| `elem` | `element` |
| `idx` | `index` |
| `len` | `length` |
| `src` | `source` |
| `dest` | `destination` |
| `tmp` | `temporary` |
| `prev` | `previous` |
| `curr` | `current` |

**Exception**: Framework/library conventions (e.g., Express `req`/`res`).

---

### Unused Destructuring Pattern (#29 - 1 occurrence)

**Pattern**: Rest element captures unused properties.

```typescript
// PROBLEM - rest captures unused
const { used, ...rest } = object;
// rest never used
```

**Fix Strategy**: Remove rest or use it.

```typescript
// SOLUTION - just destructure what's needed
const { used } = object;

// OR - if you need to exclude properties
const { excluded: _excluded, ...rest } = object;
passToFunction(rest);
```

---

## Scripts

### Check Naming Issues

```bash
node scripts/check-naming.js /path/to/src
```

### Find Single-Letter Variables

```bash
node scripts/find-short-names.js /path/to/file.ts
```

---

## ESLint Configuration

### Unused Variables Rule

```typescript
// eslint.config.js
{
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      destructuredArrayIgnorePattern: '^_',
    }],
  },
}
```

### Naming Convention Rule

```typescript
{
  rules: {
    '@typescript-eslint/naming-convention': [
      'error',
      // Variables: camelCase
      {
        selector: 'variable',
        format: ['camelCase', 'UPPER_CASE'],
        leadingUnderscore: 'allow',
      },
      // Functions: camelCase
      {
        selector: 'function',
        format: ['camelCase'],
      },
      // Types/Interfaces: PascalCase
      {
        selector: 'typeLike',
        format: ['PascalCase'],
      },
      // Constants: UPPER_CASE or camelCase
      {
        selector: 'variable',
        modifiers: ['const'],
        format: ['camelCase', 'UPPER_CASE'],
      },
    ],
  },
}
```

---

## Naming Best Practices

### Be Specific

```typescript
// BAD
const data = fetchData();
const result = process(data);
const value = calculate(result);

// GOOD
const userProfile = fetchUserProfile();
const validatedProfile = validateProfile(userProfile);
const profileScore = calculateProfileScore(validatedProfile);
```

### Use Verb Prefixes for Booleans

```typescript
// BAD
const visible = true;
const admin = user.role === 'admin';

// GOOD
const isVisible = true;
const isAdmin = user.role === 'admin';
const hasPermission = checkPermission(user);
const canEdit = isAdmin && hasPermission;
```

### Use Verb Prefixes for Functions

```typescript
// BAD
const user = async (id) => { ... };
const validation = (input) => { ... };

// GOOD
const getUser = async (id) => { ... };
const validateInput = (input) => { ... };
const createOrder = (items) => { ... };
const updateProfile = (data) => { ... };
const deleteRecord = (id) => { ... };
```

### Avoid Redundant Context

```typescript
// BAD (in User class)
class User {
  userName: string;
  userEmail: string;
  getUserAge(): number;
}

// GOOD
class User {
  name: string;
  email: string;
  getAge(): number;
}
```

### Collection Naming

```typescript
// Plural for collections
const users: User[] = [];
const orderMap: Map<string, Order> = new Map();
const productIds: Set<string> = new Set();

// Singular for single items
const user = users[0];
const order = orderMap.get(id);
```
