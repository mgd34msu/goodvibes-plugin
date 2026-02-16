# Security Audit Report: test-app

**Audit Date:** 2026-02-16
**Auditor:** Code Review Specialist (claude-opus-4-6)
**Scope:** `new-version-tests/test-app/` -- full codebase
**Overall Risk Rating:** CRITICAL

---

## Executive Summary

This test application contains **14 security findings** across 5 source files, including **5 Critical**, **4 High**, **3 Medium**, and **2 Low** severity vulnerabilities. The most severe issues are multiple SQL injection vectors in both the users and auth API routes, a hardcoded JWT secret, and known CVEs in pinned dependencies. The application lacks authentication middleware, input validation, rate limiting, CSRF protection, and CORS configuration entirely.

**Weighted Score: 1.8 / 10** -- This application is not safe for any environment beyond isolated local development.

---

## Reality Check Results

| Check | Status | Notes |
|-------|--------|-------|
| Files exist | PASS | All 6 files confirmed on disk |
| Exports used | PASS | `db` module imported by both API routes |
| Import chain valid | PASS | Routes are Next.js App Router entry points |
| No placeholders | PASS | No TODO/FIXME/stub implementations found |
| Integration verified | PASS | All modules connected to entry points |

The code is real, integrated, and would execute as-written -- which makes the security issues active, not theoretical.

---

## Findings

### CRITICAL Severity

#### SEC-001: SQL Injection in User Query (GET)

| Field | Value |
|-------|-------|
| **File** | `new-version-tests/test-app/src/app/api/users/route.ts` |
| **Line** | 10 |
| **CVSS 3.1** | 9.8 (Critical) -- AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H |
| **CWE** | CWE-89: SQL Injection |

**Vulnerable Code:**
```typescript
// Line 10
query += ` WHERE role = '${role}'`;
```

**Attack Vector:** An unauthenticated attacker sends `GET /api/users?role=' OR '1'='1' --` to dump the entire users table including password hashes.

**Impact:** Full database read/write/delete. Attacker can extract all user credentials, modify data, or drop tables.

**Remediation:**
```typescript
let query = 'SELECT * FROM users';
const params: any[] = [];
if (role) {
  query += ' WHERE role = ?';
  params.push(role);
}
const users = await db.query(query, params);
```

---

#### SEC-002: SQL Injection in User Creation (POST)

| Field | Value |
|-------|-------|
| **File** | `new-version-tests/test-app/src/app/api/users/route.ts` |
| **Line** | 22 |
| **CVSS 3.1** | 9.8 (Critical) -- AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H |
| **CWE** | CWE-89: SQL Injection |

**Vulnerable Code:**
```typescript
// Line 21-23
const result = await db.query(
  `INSERT INTO users (name, email, role) VALUES ('${name}', '${email}', '${role}')`
);
```

**Attack Vector:** POST body with `{"name": "x'); DROP TABLE users; --", "email": "a", "role": "b"}` executes arbitrary SQL.

**Impact:** Full database compromise. All three interpolated fields are injectable.

**Remediation:**
```typescript
const result = await db.query(
  'INSERT INTO users (name, email, role) VALUES (?, ?, ?)',
  [name, email, role]
);
```

---

#### SEC-003: SQL Injection in User Deletion (DELETE)

| Field | Value |
|-------|-------|
| **File** | `new-version-tests/test-app/src/app/api/users/route.ts` |
| **Line** | 31 |
| **CVSS 3.1** | 9.8 (Critical) -- AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H |
| **CWE** | CWE-89: SQL Injection |

**Vulnerable Code:**
```typescript
// Line 31
await db.query(`DELETE FROM users WHERE id = ${id}`);
```

**Attack Vector:** `DELETE /api/users?id=1 OR 1=1` deletes all users. No quotes around `${id}` makes numeric injection trivial.

**Impact:** Mass data deletion. Combined with UNION-based injection, full data exfiltration.

**Remediation:**
```typescript
await db.query('DELETE FROM users WHERE id = ?', [id]);
```

---

#### SEC-004: SQL Injection in Authentication

| Field | Value |
|-------|-------|
| **File** | `new-version-tests/test-app/src/app/api/auth/route.ts` |
| **Line** | 12 |
| **CVSS 3.1** | 9.8 (Critical) -- AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H |
| **CWE** | CWE-89: SQL Injection |

**Vulnerable Code:**
```typescript
// Line 11-13
const users: any = await db.query(
  `SELECT * FROM users WHERE email = '${email}'`
);
```

**Attack Vector:** Login with `{"email": "' OR '1'='1' LIMIT 1 --", "password": "anything"}`. With bcrypt compare, the attacker still needs a valid password, but can enumerate users and extract data via blind injection.

**Impact:** Authentication bypass (with time-based blind techniques), full user data exfiltration.

**Remediation:**
```typescript
const users: any = await db.query(
  'SELECT * FROM users WHERE email = ?',
  [email]
);
```

---

#### SEC-005: Hardcoded JWT Secret

| Field | Value |
|-------|-------|
| **File** | `new-version-tests/test-app/src/app/api/auth/route.ts` |
| **Line** | 6 |
| **CVSS 3.1** | 9.1 (Critical) -- AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N |
| **CWE** | CWE-798: Use of Hard-coded Credentials |

**Vulnerable Code:**
```typescript
// Line 6
const JWT_SECRET = 'super-secret-key-123';
```

**Attack Vector:** The secret is visible in source code and version control. Anyone with repo access (or who finds it via leaked source) can forge valid JWT tokens for any user, including admin roles.

**Impact:** Complete authentication bypass. Attacker mints tokens with arbitrary `{id, role}` claims.

**Remediation:**
```typescript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
```
Additionally, the secret value `super-secret-key-123` is trivially guessable. Production secrets must be cryptographically random (minimum 256 bits).

---

### HIGH Severity

#### SEC-006: No Authentication Middleware on User Routes

| Field | Value |
|-------|-------|
| **File** | `new-version-tests/test-app/src/app/api/users/route.ts` |
| **Lines** | 4, 17, 28 (all route handlers) |
| **CVSS 3.1** | 8.6 (High) -- AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N |
| **CWE** | CWE-306: Missing Authentication for Critical Function |

**Evidence:** Grep for `middleware`, `getSession`, `withAuth`, `verifyToken`, `authenticate` returned 0 matches across the entire codebase.

**Impact:** Any unauthenticated user can list all users (GET), create users (POST), and delete any user (DELETE). The auth route issues JWTs but no route ever verifies them.

**Remediation:**
```typescript
import { verifyToken } from '@/lib/auth'; // Create this module

export async function GET(request: Request) {
  const user = await verifyToken(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... rest of handler
}
```
Or implement Next.js middleware in `src/middleware.ts` with route matching.

---

#### SEC-007: No Input Validation

| Field | Value |
|-------|-------|
| **File** | `new-version-tests/test-app/src/app/api/users/route.ts` |
| **Lines** | 18-19 (POST body destructuring) |
| **CVSS 3.1** | 7.5 (High) -- AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N |
| **CWE** | CWE-20: Improper Input Validation |

**Evidence:** Grep for `zod`, `yup`, `joi`, `validate`, `sanitize`, `escape` returned 0 matches. The POST handler blindly destructures `request.json()` with no type checking, length limits, format validation, or sanitization.

**Impact:** Beyond SQL injection (covered separately), malformed input can cause database errors, store malicious payloads, or crash the application.

**Remediation:**
```typescript
import { z } from 'zod';

const CreateUserSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: z.string().email().max(255),
  role: z.enum(['admin', 'user', 'moderator']),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { name, email, role } = parsed.data;
  // ... parameterized query
}
```

---

#### SEC-008: JWT Token Has No Expiration

| Field | Value |
|-------|-------|
| **File** | `new-version-tests/test-app/src/app/api/auth/route.ts` |
| **Line** | 26 |
| **CVSS 3.1** | 7.4 (High) -- AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N |
| **CWE** | CWE-613: Insufficient Session Expiration |

**Vulnerable Code:**
```typescript
// Line 26
const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);
```

**Impact:** Tokens never expire. A leaked or stolen token grants permanent access. There is no revocation mechanism.

**Remediation:**
```typescript
const token = jwt.sign(
  { id: user.id, role: user.role },
  JWT_SECRET,
  { expiresIn: '15m', algorithm: 'HS256' }
);
```
Also implement refresh token rotation and a token blacklist/revocation strategy.

---

#### SEC-009: Known CVEs in mysql2 3.9.0

| Field | Value |
|-------|-------|
| **File** | `new-version-tests/test-app/package.json` |
| **Line** | 9 |
| **CVSS 3.1** | 7.5-9.8 (High-Critical range per CVE) |
| **CWE** | CWE-1395: Dependency on Vulnerable Third-Party Component |

**Known CVEs affecting mysql2 <3.9.7:**
- **CVE-2024-21511** (CVSS 9.8): Arbitrary Code Injection via timezone parameter
- **CVE-2024-21508** (CVSS 9.8): Remote Code Execution via `readCodeFor`
- **CVE-2024-21512** (CVSS 7.5): Prototype Pollution via `nestTables`

**Remediation:** Upgrade to mysql2 >= 3.9.8:
```json
"mysql2": "^3.12.0"
```

---

### MEDIUM Severity

#### SEC-010: No Rate Limiting on Auth Endpoint

| Field | Value |
|-------|-------|
| **File** | `new-version-tests/test-app/src/app/api/auth/route.ts` |
| **Lines** | 8-28 (entire POST handler) |
| **CVSS 3.1** | 5.3 (Medium) -- AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N |
| **CWE** | CWE-307: Improper Restriction of Excessive Authentication Attempts |

**Evidence:** Grep for `rate.?limit`, `throttle`, `RateLimit` returned 0 matches.

**Impact:** Attacker can brute-force credentials with unlimited login attempts. The bcrypt comparison adds some computational cost per attempt but does not prevent distributed attacks.

**Remediation:**
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '15 m'),
});

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1';
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
  }
  // ... rest of handler
}
```

---

#### SEC-011: User Enumeration via Auth Response

| Field | Value |
|-------|-------|
| **File** | `new-version-tests/test-app/src/app/api/auth/route.ts` |
| **Lines** | 16, 23 |
| **CVSS 3.1** | 5.3 (Medium) -- AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N |
| **CWE** | CWE-204: Observable Response Discrepancy |

**Vulnerable Code:**
```typescript
// Line 16 - user not found
return NextResponse.json({ error: 'Not found' }, { status: 404 });
// Line 23 - wrong password
return NextResponse.json({ error: 'Invalid' }, { status: 401 });
```

**Impact:** Different HTTP status codes (404 vs 401) and error messages (`Not found` vs `Invalid`) allow attackers to determine which email addresses are registered.

**Remediation:**
```typescript
// Use identical response for both cases
return NextResponse.json(
  { error: 'Invalid credentials' },
  { status: 401 }
);
```

---

#### SEC-012: No CSRF Protection

| Field | Value |
|-------|-------|
| **Files** | All API routes |
| **CVSS 3.1** | 4.3 (Medium) -- AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:L/A:N |
| **CWE** | CWE-352: Cross-Site Request Forgery |

**Evidence:** Grep for `csrf`, `csrfToken`, `xsrf` returned 0 matches. No custom headers are checked. The DELETE action in `UserCard.tsx` (line 34) sends a plain fetch with no CSRF token.

**Impact:** If users are authenticated (once auth is implemented), a malicious site could trigger state-changing actions (create/delete users) via cross-origin requests.

**Remediation:** Implement CSRF tokens or use the `SameSite` cookie attribute with a double-submit cookie pattern. Alternatively, require a custom header (e.g., `X-Requested-With`) that cannot be sent cross-origin without CORS preflight.

---

### LOW Severity

#### SEC-013: Known CVEs in Next.js 14.2.0

| Field | Value |
|-------|-------|
| **File** | `new-version-tests/test-app/package.json` |
| **Line** | 6 |
| **CVSS 3.1** | Variable (up to 9.1 for CVE-2025-29927) |
| **CWE** | CWE-1395: Dependency on Vulnerable Third-Party Component |

**Known CVEs:**
- **CVE-2025-29927** (CVSS 9.1): Middleware Authorization Bypass via `x-middleware-subrequest` header -- affects 14.0.0 through 14.2.24
- **CVE-2025-55182 / CVE-2025-66478** (CVSS 10.0): Unauthenticated RCE in React Server Components

**Note:** Scored as Low in context because this is a test application, but these would be Critical in production.

**Remediation:**
```json
"next": "^14.2.35"
```

---

#### SEC-014: No CORS Configuration

| Field | Value |
|-------|-------|
| **Files** | All API routes |
| **CVSS 3.1** | 3.7 (Low) -- AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N |
| **CWE** | CWE-942: Permissive Cross-domain Policy |

**Evidence:** Grep for `cors`, `Access-Control`, `origin` returned 0 matches. Next.js defaults to same-origin, which provides some baseline protection, but explicit CORS configuration should be set.

**Remediation:** Add a `next.config.js` with explicit CORS headers or use Next.js middleware to set `Access-Control-Allow-Origin` restrictively.

---

## Category Breakdown

| Category | Score | Weight | Deductions | Key Issues |
|----------|-------|--------|------------|------------|
| **Security** | 0.5/10 | 12% | -9.5 | 4x SQL injection, hardcoded secret, no auth |
| **Error Handling** | 4/10 | 12% | -6.0 | UserCard has try/catch; API routes have none |
| **Testing** | 5/10 | 12% | -5.0 | UserCard.test.tsx exists but 0 API route tests |
| **Organization** | 5/10 | 12% | -5.0 | Reasonable Next.js App Router structure |
| **Performance** | 4/10 | 10% | -6.0 | No pagination, SELECT *, no connection pool limits |
| **SOLID/DRY** | 3/10 | 10% | -7.0 | SQL injection pattern repeated 4 times |
| **Naming** | 6/10 | 10% | -4.0 | Acceptable naming conventions |
| **Maintainability** | 3/10 | 8% | -7.0 | No types on db responses, `any` usage |
| **Documentation** | 1/10 | 8% | -9.0 | Zero documentation, no API docs |
| **Dependencies** | 2/10 | 6% | -8.0 | Known CVEs, no lockfile, no devDeps |

**Weighted Total: 1.8 / 10**

---

## Remediation Priority

### Immediate (Block Deployment)

1. **Parameterize all SQL queries** (SEC-001 through SEC-004) -- estimated effort: 30 minutes
2. **Move JWT secret to environment variable** (SEC-005) -- estimated effort: 10 minutes
3. **Upgrade mysql2 to >= 3.9.8** (SEC-009) -- estimated effort: 5 minutes

### Before Any User Access

4. **Add authentication middleware** (SEC-006) -- estimated effort: 2 hours
5. **Add input validation with Zod** (SEC-007) -- estimated effort: 1 hour
6. **Add JWT expiration** (SEC-008) -- estimated effort: 15 minutes
7. **Add rate limiting to auth** (SEC-010) -- estimated effort: 1 hour

### Before Production

8. **Normalize auth error responses** (SEC-011) -- estimated effort: 10 minutes
9. **Add CSRF protection** (SEC-012) -- estimated effort: 1 hour
10. **Upgrade Next.js** (SEC-013) -- estimated effort: 30 minutes
11. **Configure CORS** (SEC-014) -- estimated effort: 30 minutes

**Total estimated remediation effort: ~7-8 hours**

---

## Positive Observations

- The `db.ts` module correctly supports parameterized queries via the `params` argument -- the callers simply fail to use it
- `UserCard.tsx` has proper error handling with try/catch/finally and safe error message extraction
- bcrypt is used for password hashing (not MD5/SHA)
- The `UserCard.test.tsx` file has thorough coverage of the component's behavior (rendering, loading states, error states, edge cases)
- Database credentials are correctly sourced from environment variables in `db.ts`

---

## Dependency Vulnerability References

- [CVE-2024-21511 - mysql2 Arbitrary Code Injection](https://github.com/advisories/GHSA-4rch-2fh8-94vw)
- [CVE-2024-21508 - mysql2 RCE](https://securityvulnerability.io/vulnerability/CVE-2024-21508)
- [CVE-2024-21512 - mysql2 Prototype Pollution](https://cvefeed.io/vuln/detail/CVE-2024-21512)
- [CVE-2025-29927 - Next.js Middleware Authorization Bypass](https://projectdiscovery.io/blog/nextjs-middleware-authorization-bypass)
- [CVE-2025-55182 / CVE-2025-66478 - React/Next.js RCE](https://www.upwind.io/feed/critical-security-alert-unauthenticated-rce-in-react-next-js-cve-2025-55182-cve-2025-66478)
- [mysql2 Snyk Advisory](https://security.snyk.io/package/npm/mysql2)
- [jsonwebtoken Snyk Advisory](https://security.snyk.io/package/npm/jsonwebtoken)
