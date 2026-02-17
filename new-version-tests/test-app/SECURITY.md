# Security Implementation

This document outlines the security measures implemented in this application.

## Authentication & Authorization

### Authentication
- **JWT-based authentication** with secure token signing
- **Bcrypt password hashing** with automatic salt generation
- **Token expiration** configurable via `JWT_EXPIRES_IN` env variable (default: 7d)
- **Password strength validation** requiring:
  - Minimum 8 characters
  - At least one lowercase letter
  - At least one uppercase letter
  - At least one number
  - At least one special character

### Authorization
- **Role-Based Access Control (RBAC)** with roles: admin, user, guest
- **Endpoint protection**:
  - `GET /api/users` - Requires authentication (any role)
  - `POST /api/users` - Requires admin role
  - `DELETE /api/users` - Requires admin role
  - Self-deletion prevention (admins cannot delete themselves)

### Implementation Files
- `/src/lib/auth.ts` - Authentication utilities
- `/src/lib/errors.ts` - Custom error classes including AuthenticationError, AuthorizationError

## SQL Injection Prevention

### Parameterized Queries
**All database queries use parameterized statements** with the `?` placeholder syntax:

```typescript
// ✅ SECURE - Parameterized query
await db.query<User[]>(
  'SELECT * FROM users WHERE email = ?',
  [email]
);

// ❌ INSECURE - String concatenation (NOT USED)
await db.query(`SELECT * FROM users WHERE email = '${email}'`);
```

### Query Locations
- `/src/app/api/auth/route.ts` - Login queries
- `/src/app/api/users/route.ts` - User CRUD queries
- `/src/lib/db.ts` - Database abstraction layer

## Input Validation

### Validation Rules
- **Email validation** using regex pattern
- **Role validation** against whitelist: ['admin', 'user', 'guest']
- **Pagination validation** with limits (max 100 items per page)
- **ID validation** ensuring positive integers
- **Input sanitization** (trim, lowercase for emails)
- **Type checking** for all request body fields

### Validation Locations
- Email: `isValidEmail()` function in auth and users routes
- Role: `isValidRole()` function in users route
- Password: `validatePasswordStrength()` in `/src/lib/auth.ts`

## Rate Limiting

### Limits
- **API endpoints**: Configured via `RATE_LIMITS.api`
- **Auth endpoint**: Stricter limits via `RATE_LIMITS.auth` to prevent brute force
- **Response headers**: `Retry-After` header included in 429 responses

### Implementation
- `/src/lib/rate-limiter.ts` - Rate limiting logic
- Applied to all API routes before processing requests

## Security Headers

### Headers Implemented (via middleware)
1. **X-Frame-Options: DENY** - Prevents clickjacking
2. **X-Content-Type-Options: nosniff** - Prevents MIME sniffing
3. **X-XSS-Protection: 1; mode=block** - XSS protection for older browsers
4. **Referrer-Policy: strict-origin-when-cross-origin** - Controls referrer information
5. **Content-Security-Policy** - Prevents XSS and data injection
6. **Permissions-Policy** - Restricts browser features (camera, mic, geolocation, payment)
7. **Strict-Transport-Security** - Enforces HTTPS (production only)

### HTTPS Enforcement
- Automatic redirect from HTTP to HTTPS in production
- Checks `x-forwarded-proto` header for reverse proxy compatibility

### Implementation
- `/src/middleware.ts` - Next.js middleware applying security headers

## Error Handling

### Secure Error Messages
- **Generic error messages** to prevent information disclosure
- **User enumeration prevention** (same error for invalid email/password)
- **Internal errors** logged but not exposed to clients
- **Stack traces** never sent in responses

### Error Classes
- `ValidationError` (400) - Input validation failures
- `AuthenticationError` (401) - Failed authentication
- `AuthorizationError` (403) - Insufficient permissions
- `NotFoundError` (404) - Resource not found
- `ConflictError` (409) - Resource conflicts
- `RateLimitError` (429) - Rate limit exceeded

## Environment Variables

### Required Secrets
```bash
# Authentication
JWT_SECRET=<strong-random-secret>  # REQUIRED - used for signing JWTs
JWT_EXPIRES_IN=7d                   # Optional - token expiration

# Database
DB_HOST=localhost                   # REQUIRED
DB_USER=<username>                  # REQUIRED
DB_PASS=<password>                  # REQUIRED
DB_NAME=<database>                  # REQUIRED
```

### Security Notes
- **Never commit** `.env` files to version control
- Use `.env.example` for documentation
- Rotate secrets regularly
- Use strong, random values for `JWT_SECRET` (min 32 characters)

## Logging

### Logged Information
- Request method, path, IP address
- Response status codes
- Request duration
- User IDs (for authenticated requests)
- Error messages (sanitized)

### NOT Logged
- Passwords (plaintext or hashed)
- JWT tokens
- Sensitive user data (PII)
- Full request bodies

### Implementation
- `/src/lib/logger.ts` - Logging utilities
- Applied to all API routes

## Best Practices Followed

1. ✅ **Principle of Least Privilege** - Users only have access to what they need
2. ✅ **Defense in Depth** - Multiple layers of security (auth, validation, rate limiting)
3. ✅ **Fail Securely** - Errors don't expose sensitive information
4. ✅ **Secure by Default** - All endpoints require authentication unless explicitly public
5. ✅ **Input Validation** - Never trust client input
6. ✅ **Output Encoding** - Prevent XSS via CSP headers
7. ✅ **Cryptographic Storage** - Bcrypt for password hashing
8. ✅ **Security Headers** - Multiple headers for browser-side protection
9. ✅ **HTTPS Only** - Enforced in production
10. ✅ **Audit Logging** - All operations logged for accountability

## Security Checklist

- [x] SQL injection prevention (parameterized queries)
- [x] XSS prevention (CSP headers)
- [x] CSRF protection (SameSite cookies, auth headers)
- [x] Authentication implemented (JWT)
- [x] Authorization implemented (RBAC)
- [x] Password hashing (bcrypt)
- [x] Password strength requirements
- [x] Rate limiting (brute force prevention)
- [x] Security headers (multiple)
- [x] HTTPS enforcement (production)
- [x] Input validation (all endpoints)
- [x] Error handling (no info disclosure)
- [x] Logging (audit trail)
- [x] Secrets management (env vars)
- [x] Self-deletion prevention

## Recommendations

### Additional Improvements (Future)
1. **Multi-factor authentication (MFA)** for admin accounts
2. **Account lockout** after N failed login attempts
3. **Password reset** with secure token-based flow
4. **Session management** with refresh tokens
5. **API versioning** for backward compatibility
6. **Database encryption** at rest
7. **Secrets rotation** automation
8. **Security scanning** in CI/CD pipeline
9. **Penetration testing** by security professionals
10. **Bug bounty program** for responsible disclosure

## Incident Response

If you discover a security vulnerability:

1. **Do NOT** disclose it publicly
2. Email security contact with details
3. Include steps to reproduce
4. Allow reasonable time for patch development
5. Coordinate disclosure timeline

## Compliance

This implementation follows:
- OWASP Top 10 (2021) guidelines
- NIST Cybersecurity Framework
- GDPR data protection principles (where applicable)

## Changelog

### 2026-02-16
- Enhanced database error logging to use structured logger (consistency improvement)
- Initial security implementation with comprehensive protections
