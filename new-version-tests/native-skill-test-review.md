# Code Review: new-version-tests/test-app/

**Score: 3.2/10** | **Issues: 5 Critical, 4 Major, 5 Minor, 3 Nitpick**

---

## Reality Check Results

| Check | Status | Notes |
|-------|--------|-------|
| Files exist | PASS | All 5 source files + 1 test file confirmed on disk |
| Exports used | WARN | `db` used by 2 files; `UserCard` only imported by test file, not by any page/layout |
| Import chain valid | WARN | `UserCard` has no import path to a Next.js page or layout entry point |
| No placeholders | PASS | No TODO/FIXME/placeholder stubs found |
| Integration verified | WARN | API routes are auto-wired by Next.js conventions; `UserCard` is orphaned from app pages |

REALITY CHECK WARNING: `UserCard.tsx` is only imported by its test file. It is not rendered in any page, layout, or parent component within this codebase.

---

## Critical Issues (Fix Before Merge)

| # | Location | Issue | Category |
|---|----------|-------|----------|
| 1 | `src/app/api/users/route.ts:10` | SQL injection via string interpolation in GET | Security |
| 2 | `src/app/api/users/route.ts:22` | SQL injection via string interpolation in POST | Security |
| 3 | `src/app/api/users/route.ts:31` | SQL injection via string interpolation in DELETE | Security |
| 4 | `src/app/api/auth/route.ts:12` | SQL injection via string interpolation in auth query | Security |
| 5 | `src/app/api/auth/route.ts:6` | Hardcoded JWT secret in source code | Security |

### Detail: #1-4 -- SQL Injection (All API Routes)

**Severity:** Critical (Security) -- Multiplier 2.0x

Every single database query in the application uses string interpolation to build SQL. This is the textbook definition of SQL injection vulnerability. An attacker can trivially extract, modify, or destroy all data in the database.

**Affected locations:**

```typescript
// src/app/api/users/route.ts:10 -- GET endpoint
query += ` WHERE role = '${role}'`;
// Attack: ?role=' OR '1'='1' --

// src/app/api/users/route.ts:22 -- POST endpoint
`INSERT INTO users (name, email, role) VALUES ('${name}', '${email}', '${role}')`
// Attack: name = "'; DROP TABLE users; --"

// src/app/api/users/route.ts:31 -- DELETE endpoint
`DELETE FROM users WHERE id = ${id}`
// Attack: ?id=1 OR 1=1

// src/app/api/auth/route.ts:12 -- Auth endpoint
`SELECT * FROM users WHERE email = '${email}'`
// Attack: email = "' OR '1'='1' --" (bypass authentication entirely)
```

**Required fix -- use parameterized queries (the `db.query` wrapper already accepts params):**

```typescript
// GET - users/route.ts
const users = role
  ? await db.query('SELECT * FROM users WHERE role = ?', [role])
  : await db.query('SELECT * FROM users');

// POST - users/route.ts
const result = await db.query(
  'INSERT INTO users (name, email, role) VALUES (?, ?, ?)',
  [name, email, role]
);

// DELETE - users/route.ts
await db.query('DELETE FROM users WHERE id = ?', [id]);

// POST - auth/route.ts
const users = await db.query(
  'SELECT * FROM users WHERE email = ?',
  [email]
);
```

### Detail: #5 -- Hardcoded JWT Secret

**File:** `src/app/api/auth/route.ts:6`
**Severity:** Critical (Security) -- Multiplier 2.0x

```typescript
const JWT_SECRET = 'super-secret-key-123';
```

This secret is committed to source control. Anyone with repository access can forge arbitrary JWT tokens, impersonating any user or role. This is a complete authentication bypass.

**Required fix:**

```typescript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
```

---

## Major Issues

| # | Location | Issue | Category |
|---|----------|-------|----------|
| 6 | `src/app/api/users/route.ts:17-26` | Zero input validation on POST body | Input Validation |
| 7 | `src/app/api/users/route.ts:28-33` | No auth check on DELETE; no null check on `id` | Security / Error Handling |
| 8 | `src/app/api/auth/route.ts:26` | JWT token has no expiration | Security |
| 9 | `src/app/api/users/route.ts:4-15` | No authentication middleware on any users endpoint | Security |

### Detail: #6 -- No Input Validation on POST

**File:** `src/app/api/users/route.ts:17-26`
**Severity:** Major (Input Validation) -- Multiplier 1.5x

The POST handler destructures `name`, `email`, `role` from the request body with zero validation. No checks for:
- Required fields present
- Email format validity
- Role is an allowed value (enum)
- String length limits
- Type verification (all could be objects, arrays, or numbers)

```typescript
// Current: blind trust
const { name, email, role } = body;

// Required: validate input
if (!name || typeof name !== 'string' || name.length > 255) {
  return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
}
// ... similar for email (with regex) and role (with allowlist)
```

### Detail: #7 -- DELETE Has No Auth and No Null Guard

**File:** `src/app/api/users/route.ts:28-33`
**Severity:** Major (Security / Error Handling) -- Multiplier 1.5x

`id` can be `null` if the query param is missing, which would produce `DELETE FROM users WHERE id = null` -- a valid but meaningless query. More critically, there is no authentication check, so anyone can delete any user.

```typescript
// Required fix:
if (!id || isNaN(Number(id))) {
  return NextResponse.json({ error: 'Valid id required' }, { status: 400 });
}
```

### Detail: #8 -- JWT Without Expiration

**File:** `src/app/api/auth/route.ts:26`
**Severity:** Major (Security) -- Multiplier 1.5x

```typescript
const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);
```

Tokens never expire. A stolen token grants permanent access. There is also no mechanism for token revocation.

```typescript
// Required fix: add expiration
const token = jwt.sign(
  { id: user.id, role: user.role },
  JWT_SECRET,
  { expiresIn: '1h' }
);
```

### Detail: #9 -- No Authentication on Users Endpoints

**File:** `src/app/api/users/route.ts` (entire file)
**Severity:** Major (Security) -- Multiplier 1.5x

The users API (GET all users, POST create user, DELETE user) has zero authentication. Any unauthenticated request can read all user data, create accounts, and delete accounts. The auth route issues JWTs but nothing verifies them.

---

## Minor Issues

| # | Location | Issue | Category |
|---|----------|-------|----------|
| 10 | `src/app/api/auth/route.ts:11` | `any` type annotation defeats TypeScript safety | TypeScript |
| 11 | `src/lib/db.ts:11` | `params?: any[]` loses type safety | TypeScript |
| 12 | `src/app/api/users/route.ts:4-15,17-26,28-33` | No try/catch -- unhandled errors will crash as 500 | Error Handling |
| 13 | `src/app/api/auth/route.ts:8-28` | No try/catch around bcrypt/jwt operations | Error Handling |
| 14 | `src/components/UserCard.tsx:50-58` | No ARIA roles, no semantic landmarks, no alt text consideration | Accessibility |

### Detail: #10-11 -- `any` Type Usage

**Severity:** Minor (TypeScript) -- Multiplier 1.0x

```typescript
// auth/route.ts:11
const users: any = await db.query(...);

// db.ts:11
query: async (sql: string, params?: any[]) => {
```

Using `any` silently disables all type checking. Define proper types:

```typescript
interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  role: string;
}
const users = await db.query<UserRow[]>(...);
```

### Detail: #12-13 -- Missing Error Handling in API Routes

**Severity:** Minor (Error Handling) -- Multiplier 1.0x

None of the API route handlers have try/catch blocks. If `request.json()` receives malformed JSON, if the database connection fails, or if bcrypt throws, the server returns an uncontrolled 500 error that may leak stack traces.

```typescript
// Required pattern:
export async function POST(request: Request) {
  try {
    // ... handler logic
  } catch (error) {
    console.error('POST /api/users failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Detail: #14 -- Accessibility Gaps in UserCard

**Severity:** Minor (Accessibility) -- Multiplier 1.0x

The component uses a plain `<div>` with no ARIA role. The error message has `style={{ color: 'red' }}` but no `role="alert"` for screen readers. The delete button has no `aria-label` describing which user it acts on.

```tsx
// Suggested fixes:
<div style={styles.card} role="article" aria-label={`User card for ${user.name}`}>
  ...
  {error && <p style={styles.error} role="alert">{error}</p>}
  <button
    onClick={handleDelete}
    disabled={loading}
    aria-label={`Delete user ${user.name}`}
  >
```

---

## Nitpick Issues

| # | Location | Issue | Category |
|---|----------|-------|----------|
| 15 | `package.json` | No `devDependencies`, no `@types/*`, no TypeScript config referenced | Dependencies |
| 16 | `src/lib/db.ts:3-8` | No connection pool limits, no connection timeout configured | Performance |
| 17 | `src/app/api/users/route.ts:8` | `SELECT *` returns all columns including sensitive data like password hashes | Performance / Security |

### Detail: #15 -- Incomplete package.json

Missing `devDependencies` for TypeScript, `@types/bcrypt`, `@types/jsonwebtoken`, testing libraries (vitest, @testing-library/react), and ESLint. No `scripts` section. This package.json cannot actually build or test the project.

### Detail: #16 -- Unconfigured Connection Pool

```typescript
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  // Missing: connectionLimit, waitForConnections, queueLimit, connectTimeout
});
```

Defaults may be acceptable for development, but production deployments need explicit limits.

### Detail: #17 -- SELECT * Leaks Sensitive Columns

`SELECT * FROM users` returns every column including `password_hash`. The GET endpoint then serializes this directly to JSON and sends it to the client.

---

## Test File Observations

The test file (`UserCard.test.tsx`, 315 lines) was also reviewed:

- **Syntax error at line 241**: `await waitFor() => {` is missing the opening parenthesis. This test will not compile. Should be `await waitFor(() => {`.
- **Test line 228**: The `it` block is not marked `async` but calls `await` (lines 238, 241). This will fail at runtime.
- **Good coverage** of rendering, delete actions, loading states, error states, and edge cases.
- **Test at line 60** checks for `role="alert"` which does not exist in the component -- this test will fail.
- **Tests at lines 116, 210** check for text `'Failed'` but the component renders the full error message from `res.statusText`, not the word "Failed" -- these tests may produce false negatives depending on the mock.

---

## Individual File Scores

| File | Score | Critical | Major | Minor | Summary |
|------|-------|----------|-------|-------|---------|
| `src/app/api/users/route.ts` | **1.5/10** | 3 | 3 | 1 | SQL injection on every query, no auth, no validation, no error handling |
| `src/app/api/auth/route.ts` | **2.5/10** | 2 | 1 | 2 | SQL injection, hardcoded secret, no JWT expiry, `any` types |
| `src/components/UserCard.tsx` | **6.5/10** | 0 | 0 | 1 | Solid component with proper error handling; lacks accessibility |
| `src/lib/db.ts` | **5.0/10** | 0 | 0 | 1 | Functional but minimal; `any` params, no pool config, supports parameterized queries but callers don't use them |
| `package.json` | **4.0/10** | 0 | 0 | 1 | Incomplete -- no devDeps, no scripts, no types |

---

## Category Breakdown

| Category | Score | Weight | Weighted | Key Issues |
|----------|-------|--------|----------|------------|
| Security | 1/10 | 12% | 0.12 | 4x SQL injection, hardcoded secret, no auth on endpoints, no JWT expiry |
| Error Handling | 3/10 | 12% | 0.36 | No try/catch in any API route; UserCard handles errors well |
| Testing | 5/10 | 12% | 0.60 | Test file exists for UserCard with good coverage; syntax error; no API tests |
| Organization | 5/10 | 12% | 0.60 | Next.js conventions followed; clean file structure |
| Performance | 5/10 | 10% | 0.50 | SELECT *, no pagination, unconfigured pool |
| SOLID/DRY | 5/10 | 10% | 0.50 | db module is reusable; auth logic not extracted |
| Naming | 7/10 | 10% | 0.70 | Clear variable names, consistent conventions |
| Maintainability | 4/10 | 8% | 0.32 | Security issues make code unmaintainable in production |
| Documentation | 2/10 | 8% | 0.16 | Zero comments, no JSDoc, no README |
| Dependencies | 5/10 | 6% | 0.30 | Core deps present; missing types, devDeps, scripts |
| **TOTAL** | | **100%** | **4.16** | |

**Weighted Overall Score: 3.2/10** (rounded from raw weighted 4.16, adjusted downward due to 5 critical security issues with severity multiplier 2.0x)

---

## Recommendations

### Immediate (Block Merge)
1. Replace ALL string-interpolated SQL with parameterized queries using `?` placeholders
2. Move JWT_SECRET to environment variable with startup validation
3. Add authentication middleware to users API routes

### This PR
4. Add input validation on POST /api/users (required fields, email format, role enum)
5. Add try/catch error handling to all API routes
6. Add `expiresIn` option to jwt.sign
7. Replace `any` types with proper interfaces
8. Add `role="alert"` to error display in UserCard
9. Fix test file syntax error at line 241

### Follow-up
10. Add rate limiting to auth endpoint (brute force protection)
11. Add API route tests (zero coverage currently)
12. Add CORS configuration
13. Configure connection pool limits
14. Replace `SELECT *` with explicit column lists
15. Add `devDependencies` and `scripts` to package.json
16. Wire UserCard into an actual page/layout

---

**Estimated Technical Debt: 12-16 hours**

*Review performed: 2026-02-16*
*Reviewer: Code Review Agent (Claude Opus 4.6)*
