# Security Audit Report: test-app (Next.js)

**Date:** 2026-02-16  
**Auditor:** Claude Opus 4.6 (Automated Security Audit)  
**Scope:** `new-version-tests/test-app/` -- all source files  
**Overall Risk Rating:** MEDIUM-HIGH  

---

## Executive Summary

The test-app is a Next.js application with a MySQL backend, JWT-based authentication, and a React frontend. SQL injection defenses are solid (parameterized queries throughout), and basic input validation is present. However, the application has **significant architectural security gaps**: no authentication on CRUD endpoints, no rate limiting, no CSRF protection, no security headers, missing middleware, and no TLS enforcement on the database connection. These issues collectively create a **medium-high risk profile** that would be unacceptable for production deployment.

---

## Findings Summary

| # | Severity | Category | Finding | Location |
|---|----------|----------|---------|----------|
| 1 | **Critical** | Authorization | Users API has zero authentication/authorization | `src/app/api/users/route.ts` (all handlers) |
| 2 | **High** | Rate Limiting | No rate limiting on auth endpoint | `src/app/api/auth/route.ts:27` |
| 3 | **High** | Rate Limiting | No rate limiting on users CRUD | `src/app/api/users/route.ts` (all handlers) |
| 4 | **High** | Security Headers | No security headers configured | Missing `next.config.js` and `middleware.ts` |
| 5 | **High** | CSRF | No CSRF protection on state-changing endpoints | `POST /api/users`, `DELETE /api/users`, `POST /api/auth` |
| 6 | **Medium** | Transport Security | No TLS/SSL configured for database connection | `src/lib/db.ts:8-16` |
| 7 | **Medium** | Authentication | JWT token has no revocation mechanism | `src/app/api/auth/route.ts:95-99` |
| 8 | **Medium** | Authentication | JWT expiry defaults to 7 days (too long) | `src/app/api/auth/route.ts:13` |
| 9 | **Medium** | Information Leak | console.error logs full error objects in production | Multiple files (6 instances) |
| 10 | **Medium** | Input Validation | No input length limits on name, email, password fields | `src/app/api/users/route.ts:75-94`, `src/app/api/auth/route.ts:42-54` |
| 11 | **Medium** | Configuration | No .gitignore file in test-app directory | `new-version-tests/test-app/` |
| 12 | **Medium** | Configuration | .env.example contains weak example JWT secret | `.env.example:8` |
| 13 | **Low** | Dependencies | No lockfile present (non-deterministic builds) | `new-version-tests/test-app/` |
| 14 | **Low** | Dependencies | No devDependencies section (missing linting/security tooling) | `package.json` |
| 15 | **Low** | Type Safety | `any` type used in db.query and result handling | `src/lib/db.ts:19`, `src/app/api/users/route.ts:114` |
| 16 | **Low** | API Design | DELETE uses query param for ID instead of path param | `src/app/api/users/route.ts:140-185` |

---

## Detailed Findings

### 1. [CRITICAL] Users API Has Zero Authentication/Authorization

**Location:** `src/app/api/users/route.ts` -- GET (line 24), POST (line 60), DELETE (line 140)  
**Category:** Authorization  

**Description:** The entire users API is completely unauthenticated. Any anonymous client can:
- List all users (`GET /api/users`)
- Create arbitrary users with any role including `admin` (`POST /api/users`)
- Delete any user by ID (`DELETE /api/users?id=X`)

The auth endpoint (`POST /api/auth`) issues JWT tokens, but no middleware or route handler ever validates those tokens. There is no `middleware.ts` file in the project.

**Impact:** Complete unauthorized access to user data and account management. An attacker can enumerate all users, create admin accounts, or delete every user in the database.

**Remediation:**
```typescript
// Create src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

export function middleware(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    jwt.verify(token, process.env.JWT_SECRET!);
    return NextResponse.next();
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

export const config = {
  matcher: ['/api/users/:path*'],
};
```

Additionally, implement role-based authorization: only `admin` users should be able to create/delete users.

---

### 2. [HIGH] No Rate Limiting on Auth Endpoint

**Location:** `src/app/api/auth/route.ts:27`  
**Category:** Rate Limiting  

**Description:** The authentication endpoint has no rate limiting. An attacker can perform unlimited brute-force password attempts. The `bcrypt.compare` call provides some computational cost, but is insufficient defense against distributed attacks.

**Impact:** Credential stuffing and brute-force attacks are trivially possible.

**Remediation:** Implement rate limiting using a library like `@upstash/ratelimit` (for serverless) or an in-memory store:
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '15 m'), // 5 attempts per 15 minutes
});

// In POST handler:
const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1';
const { success } = await ratelimit.limit(ip);
if (!success) {
  return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
}
```

Also implement account lockout after N failed attempts.

---

### 3. [HIGH] No Rate Limiting on Users CRUD

**Location:** `src/app/api/users/route.ts` (all handlers)  
**Category:** Rate Limiting  

**Description:** The users CRUD endpoints have no rate limiting. Combined with finding #1 (no auth), an attacker can create millions of users or perform resource exhaustion attacks.

**Impact:** Denial of service via resource exhaustion, database flooding.

**Remediation:** Apply rate limiting middleware to all API routes.

---

### 4. [HIGH] No Security Headers Configured

**Location:** Missing `next.config.js` and `middleware.ts`  
**Category:** Security Headers  

**Description:** The application has no `next.config.js` or `middleware.ts` file, meaning zero security headers are set:
- No `Content-Security-Policy` (CSP)
- No `X-Frame-Options` (clickjacking protection)
- No `X-Content-Type-Options` (MIME sniffing protection)
- No `Strict-Transport-Security` (HSTS)
- No `Referrer-Policy`
- No `Permissions-Policy`

**Impact:** The application is vulnerable to clickjacking, MIME-type sniffing attacks, and lacks defense-in-depth browser protections.

**Remediation:** Create `next.config.js`:
```javascript
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'" },
];

module.exports = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
```

---

### 5. [HIGH] No CSRF Protection on State-Changing Endpoints

**Location:** `POST /api/users`, `DELETE /api/users`, `POST /api/auth`  
**Category:** CSRF  

**Description:** No CSRF tokens or SameSite cookie protections are implemented. The `UserCard.tsx` component makes `fetch` DELETE calls (line 34) that would be susceptible to CSRF if session-based auth were added. Even with JWT Bearer tokens, the lack of explicit CSRF defenses is a gap if tokens are ever stored in cookies.

**Impact:** Cross-site request forgery attacks could delete users or create accounts if auth tokens are transmitted via cookies.

**Remediation:** 
- If using JWT in `Authorization` header (not cookies): document this as a deliberate CSRF mitigation strategy
- If tokens are ever cookie-based: implement CSRF tokens using `next-csrf` or custom double-submit pattern
- Set `SameSite=Strict` on any auth cookies

---

### 6. [MEDIUM] No TLS/SSL on Database Connection

**Location:** `src/lib/db.ts:8-16`  
**Category:** Transport Security  

**Description:** The MySQL connection pool is created without TLS/SSL configuration. Database credentials and query data are transmitted in plaintext if the database is on a remote host.

```typescript
// Current: no ssl option
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  // ...
});
```

**Impact:** Man-in-the-middle attacks on the database connection could intercept credentials and data.

**Remediation:**
```typescript
const pool = mysql.createPool({
  // ... existing config ...
  ssl: {
    rejectUnauthorized: true, // Verify server certificate
  },
});
```

---

### 7. [MEDIUM] JWT Has No Revocation Mechanism

**Location:** `src/app/api/auth/route.ts:95-99`  
**Category:** Authentication  

**Description:** JWT tokens are issued with no blacklist/revocation mechanism. Once a token is issued, it remains valid until expiration (7 days by default). There is no way to:
- Invalidate a token on logout
- Revoke access for a compromised account
- Force re-authentication after password change

**Impact:** Compromised tokens remain valid for up to 7 days with no ability to revoke.

**Remediation:** Implement one of:
- Token blacklist in Redis/database for revoked tokens
- Short-lived access tokens (15 min) + refresh token rotation
- Token versioning per-user (increment version on password change/logout)

---

### 8. [MEDIUM] JWT Default Expiry Is 7 Days

**Location:** `src/app/api/auth/route.ts:13`  
**Category:** Authentication  

```typescript
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
```

**Description:** The default JWT expiry of 7 days is excessively long for an access token, especially given finding #7 (no revocation). The `.env.example` also suggests `7d` as the default.

**Impact:** Extended window of exposure for stolen tokens.

**Remediation:** Use short-lived access tokens (15-30 minutes) with a refresh token pattern. Set `JWT_EXPIRES_IN=15m` as the default.

---

### 9. [MEDIUM] console.error Logs Full Error Objects

**Locations:**
- `src/lib/db.ts:24` -- `console.error('Database query error:', error)`
- `src/app/api/auth/route.ts:77` -- `console.error('User missing password_hash:', user.id)`
- `src/app/api/auth/route.ts:104` -- `console.error('POST /api/auth error:', error)`
- `src/app/api/users/route.ts:48` -- `console.error('GET /api/users error:', error)`
- `src/app/api/users/route.ts:128` -- `console.error('POST /api/users error:', error)`
- `src/app/api/users/route.ts:179` -- `console.error('DELETE /api/users error:', error)`

**Description:** Raw error objects (including stack traces, SQL queries, and connection details) are logged via `console.error`. In production, these may appear in log aggregation services, cloud console logs, or potentially in response bodies if error handling changes.

**Impact:** Information leakage of internal implementation details, database structure, and query patterns.

**Remediation:** Use a structured logger (e.g., `pino`, `winston`) with appropriate log levels and scrubbing. Never log raw error objects in production -- extract only the message and a sanitized context.

---

### 10. [MEDIUM] No Input Length Limits

**Locations:**
- `src/app/api/users/route.ts:75-94` (name, email, role validation)
- `src/app/api/auth/route.ts:42-54` (email, password validation)

**Description:** While inputs are validated for type and format, there are no maximum length constraints. An attacker could submit:
- Multi-megabyte name strings
- Extremely long email addresses
- Very long passwords (bcrypt has a 72-byte limit anyway, but processing the input consumes resources)

**Impact:** Resource exhaustion, potential buffer issues, bcrypt silently truncating passwords over 72 bytes.

**Remediation:**
```typescript
// Add length validation
if (name.length > 255) {
  return NextResponse.json({ error: 'Name too long' }, { status: 400 });
}
if (email.length > 320) { // RFC 5321 max
  return NextResponse.json({ error: 'Email too long' }, { status: 400 });
}
if (password.length > 72) { // bcrypt limit
  return NextResponse.json({ error: 'Password too long' }, { status: 400 });
}
```

---

### 11. [MEDIUM] No .gitignore File

**Location:** `new-version-tests/test-app/` (root)  
**Category:** Configuration  

**Description:** There is no `.gitignore` file in the test-app directory. This means `.env` files with real credentials could be accidentally committed.

**Impact:** Credential leakage through version control.

**Remediation:** Create `.gitignore` with at minimum:
```
.env
.env.local
.env.*.local
node_modules/
.next/
```

---

### 12. [MEDIUM] .env.example Contains Weak Example Secret

**Location:** `.env.example:8`  

```
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

**Description:** The example JWT secret is a readable string that someone might use in production without changing. The comment "change-this-in-production" is embedded in the value itself, not as a separate comment, making it easy to overlook.

**Impact:** If used as-is, the JWT secret is trivially guessable.

**Remediation:** Use a clearly placeholder value and add a generation command:
```
# Generate with: openssl rand -base64 64
JWT_SECRET=CHANGE_ME_GENERATE_WITH_OPENSSL
```

Add runtime validation for minimum secret length (e.g., 32 characters).

---

### 13. [LOW] No Lockfile Present

**Location:** `new-version-tests/test-app/`  
**Category:** Dependencies  

**Description:** No `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml` exists. Dependency versions are not pinned to exact resolved versions.

**Impact:** Non-deterministic builds; supply chain attacks via dependency confusion or malicious patch versions.

**Remediation:** Run `npm install` to generate `package-lock.json` and commit it.

---

### 14. [LOW] No devDependencies or Security Tooling

**Location:** `package.json`  
**Category:** Dependencies  

**Description:** The `package.json` has no `devDependencies` section. This means no:
- ESLint or security linting rules
- TypeScript type-checking in CI
- Dependency audit tooling (`npm audit`)
- Pre-commit hooks for secret scanning

**Impact:** Reduced ability to catch security issues during development.

**Remediation:** Add security-focused dev dependencies:
```json
"devDependencies": {
  "eslint": "^8.0.0",
  "eslint-plugin-security": "^2.0.0",
  "@typescript-eslint/eslint-plugin": "^7.0.0",
  "typescript": "^5.0.0"
}
```

---

### 15. [LOW] Use of `any` Type in Security-Sensitive Code

**Locations:**
- `src/lib/db.ts:19` -- `params?: any[]` and `<T = any>`
- `src/app/api/users/route.ts:114` -- `const result: any`

**Description:** The `any` type bypasses TypeScript's type checking in security-sensitive database code. This reduces the compiler's ability to catch type-related bugs.

**Impact:** Potential for type confusion bugs that could lead to security issues.

**Remediation:** Use proper types:
```typescript
// db.ts
query: async <T = unknown>(sql: string, params?: (string | number | null)[]): Promise<T>

// users/route.ts
import type { ResultSetHeader } from 'mysql2';
const result = await db.query<ResultSetHeader>(...);
```

---

### 16. [LOW] DELETE Uses Query Parameter Instead of Path Parameter

**Location:** `src/app/api/users/route.ts:140-185`  
**Category:** API Design  

**Description:** The DELETE endpoint uses `?id=X` query parameter instead of the RESTful `/api/users/[id]` path parameter pattern. This is not a direct security vulnerability, but it:
- Makes URL-based access control patterns harder to implement
- Could lead to accidental caching of DELETE requests by intermediaries
- Deviates from Next.js App Router conventions

**Impact:** Reduced ability to apply URL-pattern-based security policies.

**Remediation:** Move to `src/app/api/users/[id]/route.ts` with path parameter extraction.

---

## Positive Findings

The following security practices are correctly implemented:

| Practice | Location | Notes |
|----------|----------|-------|
| Parameterized SQL queries | All database calls | Using `?` placeholders with `pool.execute()` -- properly prevents SQL injection |
| Input type validation | `users/route.ts`, `auth/route.ts` | Body validated as object before destructuring |
| Email format validation | Both route files | Regex validation applied |
| Role whitelisting | `users/route.ts:17` | Only `admin`, `user`, `guest` accepted |
| Generic auth error messages | `auth/route.ts:67-70, 88-91` | Prevents user enumeration |
| bcrypt for password hashing | `auth/route.ts:85` | Industry-standard password hashing |
| JWT secret from environment | `auth/route.ts:8-12` | Throws at startup if missing |
| Environment variable validation | `db.ts:4-6` | Fails fast if DB config missing |
| No `dangerouslySetInnerHTML` | `UserCard.tsx` | React's default XSS protection used |
| Explicit SELECT columns | `users/route.ts:37` | No `SELECT *` -- password_hash excluded from user listing |
| Input sanitization | `users/route.ts:97-98` | Trim and lowercase applied |
| Email uniqueness check | `users/route.ts:101-111` | Prevents duplicate accounts |
| ID validation on DELETE | `users/route.ts:153-158` | Positive integer check |

---

## Risk Matrix

| Severity | Count | Action Required |
|----------|-------|-----------------|
| Critical | 1 | Block deployment; fix immediately |
| High | 4 | Fix before any production exposure |
| Medium | 7 | Fix in current sprint |
| Low | 4 | Address in backlog |
| **Total** | **16** | |

---

## Remediation Priority

### Immediate (Block Deployment)
1. Add authentication middleware to protect `/api/users` endpoints (Finding #1)
2. Implement rate limiting on `/api/auth` (Finding #2)

### Before Production
3. Add security headers via `next.config.js` (Finding #4)
4. Add rate limiting to all API routes (Finding #3)
5. Implement CSRF protection strategy (Finding #5)
6. Enable TLS on database connection (Finding #6)
7. Add input length limits (Finding #10)
8. Create `.gitignore` file (Finding #11)

### Short-Term
9. Reduce JWT expiry to 15-30 minutes with refresh tokens (Findings #7, #8)
10. Replace `console.error` with structured logging (Finding #9)
11. Fix `.env.example` JWT secret placeholder (Finding #12)

### Backlog
12. Add lockfile (Finding #13)
13. Add security linting tooling (Finding #14)
14. Replace `any` types (Finding #15)
15. Refactor DELETE to use path parameters (Finding #16)

---

## Category Scores

| Category | Score | Weight | Deductions |
|----------|-------|--------|------------|
| Security (injection) | 9/10 | 12% | -1 (no TLS on DB) |
| Security (auth/authz) | 2/10 | 12% | -8 (no auth on CRUD, no revocation) |
| Security (headers/CSRF) | 1/10 | 12% | -9 (none configured) |
| Rate Limiting | 0/10 | 10% | -10 (completely absent) |
| Input Validation | 7/10 | 10% | -3 (no length limits) |
| Error Handling | 6/10 | 8% | -4 (raw error logging) |
| Configuration | 4/10 | 8% | -6 (no gitignore, weak example secret) |
| Dependencies | 5/10 | 6% | -5 (no lockfile, no security tooling) |
| Type Safety | 7/10 | 6% | -3 (any types in sensitive code) |
| API Design | 8/10 | 6% | -2 (DELETE query param pattern) |
| XSS Protection | 10/10 | 5% | None (React defaults properly used) |
| SQL Injection Protection | 10/10 | 5% | None (parameterized queries throughout) |

**Weighted Overall Score: 4.8/10**

---

*Report generated by automated security audit. Manual penetration testing is recommended before production deployment.*
