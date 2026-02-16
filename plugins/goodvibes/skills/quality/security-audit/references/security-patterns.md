# Security Patterns Reference

Common vulnerability patterns organized by OWASP Top 10, with detection patterns and remediation examples.

## Table of Contents

1. [A01:2021 - Broken Access Control](#a012021---broken-access-control)
2. [A02:2021 - Cryptographic Failures](#a022021---cryptographic-failures)
3. [A03:2021 - Injection](#a032021---injection)
4. [A04:2021 - Insecure Design](#a042021---insecure-design)
5. [A05:2021 - Security Misconfiguration](#a052021---security-misconfiguration)
6. [A06:2021 - Vulnerable and Outdated Components](#a062021---vulnerable-and-outdated-components)
7. [A07:2021 - Identification and Authentication Failures](#a072021---identification-and-authentication-failures)
8. [A08:2021 - Software and Data Integrity Failures](#a082021---software-and-data-integrity-failures)
9. [A09:2021 - Security Logging and Monitoring Failures](#a092021---security-logging-and-monitoring-failures)
10. [A10:2021 - Server-Side Request Forgery (SSRF)](#a102021---server-side-request-forgery-ssrf)

---

## A01:2021 - Broken Access Control

### Description

Users can access resources they shouldn't have permission to view, modify, or delete.

### Detection Patterns

```yaml
precision_grep:
  queries:
    - id: missing_auth_checks
      pattern: "export async function (GET|POST|PUT|DELETE|PATCH)"
      glob: "**/api/**/*.{ts,js}"
    - id: idor_vulnerable
      pattern: "params\\.(id|userId)\\)|query\\.(id|userId)\\)"
      glob: "**/api/**/*.{ts,js}"
```

### Common Vulnerabilities

#### 1. Insecure Direct Object Reference (IDOR)

**Vulnerable:**
```typescript
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const post = await db.post.findUnique({ where: { id: params.id } });
  return NextResponse.json(post);
}
```

**Secure:**
```typescript
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const post = await db.post.findUnique({
    where: { id: params.id },
  });

  if (!post || post.authorId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(post);
}
```

#### 2. Missing Function-Level Access Control

**Vulnerable:**
```typescript
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  await db.user.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
```

**Secure:**
```typescript
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db.user.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
```

### CWE Mappings

- CWE-22: Improper Limitation of a Pathname to a Restricted Directory
- CWE-639: Authorization Bypass Through User-Controlled Key
- CWE-284: Improper Access Control

---

## A02:2021 - Cryptographic Failures

### Description

Sensitive data exposed due to lack of encryption or weak cryptographic algorithms.

### Detection Patterns

```yaml
precision_grep:
  queries:
    - id: weak_crypto
      pattern: "(md5|sha1|des|rc4)\\("
      glob: "**/*.{ts,tsx,js,jsx}"
    - id: plaintext_passwords
      pattern: "password.*plain|password.*clear"
      glob: "**/*.{ts,tsx,js,jsx}"
    - id: http_urls
      pattern: "http://.*api|fetch\\([\"']http://"
      glob: "**/*.{ts,tsx,js,jsx}"
```

### Common Vulnerabilities

#### 1. Weak Password Hashing

**Vulnerable:**
```typescript
import crypto from 'crypto';

export function hashPassword(password: string): string {
  return crypto.createHash('md5').update(password).digest('hex');
}
```

**Secure:**
```typescript
import { hash, verify } from '@node-rs/argon2';

export async function hashPassword(password: string): Promise<string> {
  return await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await verify(hash, password);
  } catch {
    return false;
  }
}
```

#### 2. Sensitive Data in Transit (HTTP)

**Vulnerable:**
```typescript
const response = await fetch('http://api.example.com/user', {
  headers: { Authorization: `Bearer ${token}` },
});
```

**Secure:**
```typescript
const response = await fetch('https://api.example.com/user', {
  headers: { Authorization: `Bearer ${token}` },
});
```

#### 3. Weak Encryption Algorithm

**Vulnerable:**
```typescript
import crypto from 'crypto';

export function encrypt(text: string): string {
  const cipher = crypto.createCipher('des', 'mySecretKey');
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}
```

**Secure:**
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY environment variable is required');
const KEY = Buffer.from(ENCRYPTION_KEY, 'hex');

export function encrypt(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}
```

### CWE Mappings

- CWE-327: Use of a Broken or Risky Cryptographic Algorithm
- CWE-759: Use of a One-Way Hash without a Salt
- CWE-311: Missing Encryption of Sensitive Data

---

## A03:2021 - Injection

### Description

User input is not validated, filtered, or sanitized, allowing attackers to inject malicious code.

### Detection Patterns

```yaml
precision_grep:
  queries:
    - id: sql_injection
      pattern: "(\\$queryRaw|\\$executeRaw).*\\$\\{|query.*\\+.*params"
      glob: "**/*.{ts,js}"
    - id: command_injection
      pattern: "(exec|spawn).*req\\.(body|params|query)"
      glob: "**/*.{ts,js}"
    - id: xss_vulnerable
      pattern: "dangerouslySetInnerHTML|innerHTML.*="
      glob: "**/*.{tsx,jsx}"
```

### Common Vulnerabilities

#### 1. SQL Injection

**Vulnerable:**
```typescript
export async function searchUsers(query: string) {
  const sql = `SELECT * FROM users WHERE name LIKE '%${query}%'`;
  return await db.$queryRawUnsafe(sql);
}
```

**Secure:**
```typescript
export async function searchUsers(query: string) {
  return await db.$queryRaw`
    SELECT * FROM users WHERE name ILIKE ${'%' + query + '%'} LIMIT 20
  `;
}
```

#### 2. Command Injection

**Vulnerable:**
```typescript
import { exec } from 'child_process';

export async function convertImage(filename: string) {
  exec(`convert ${filename} output.png`);
}
```

**Secure:**
```typescript
import { spawn } from 'child_process';

export async function convertImage(filename: string) {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '');
  
  return new Promise((resolve, reject) => {
    const child = spawn('convert', [sanitized, 'output.png']);
    child.on('exit', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error('Conversion failed'));
    });
  });
}
```

#### 3. Cross-Site Scripting (XSS)

**Vulnerable:**
```typescript
export function Comment({ content }: { content: string }) {
  return <div dangerouslySetInnerHTML={{ __html: content }} />;
}
```

**Secure:**
```typescript
import DOMPurify from 'isomorphic-dompurify';

export function Comment({ content }: { content: string }) {
  const sanitized = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a'],
    ALLOWED_ATTR: ['href'],
  });
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

### CWE Mappings

- CWE-89: SQL Injection
- CWE-79: Cross-site Scripting (XSS)
- CWE-77: Command Injection

---

## A04:2021 - Insecure Design

### Description

Fundamental flaws in the design that cannot be fixed by a perfect implementation.

### Detection Patterns

```yaml
precision_grep:
  queries:
    - id: rate_limiting
      pattern: "(rateLimit|rateLimiter|Ratelimit)"
      glob: "**/api/**/*.{ts,js}"
    - id: input_validation
      pattern: "(zod|yup|joi)\.parse|safeParse"
      glob: "**/api/**/*.{ts,js}"
```

### Common Vulnerabilities

#### 1. Missing Rate Limiting

**Vulnerable:**
```typescript
export async function POST(req: Request) {
  const { email } = await req.json();
  await sendPasswordResetEmail(email);
  return NextResponse.json({ success: true });
}
```

**Secure:**
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, '1 h'),
});

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  const { success } = await ratelimit.limit(ip);

  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { email } = await req.json();
  await sendPasswordResetEmail(email);
  return NextResponse.json({ success: true });
}
```

#### 2. Insufficient Input Validation

**Vulnerable:**
```typescript
export async function POST(req: Request) {
  const { email, age } = await req.json();
  const user = await db.user.create({ data: { email, age } });
  return NextResponse.json(user);
}
```

**Secure:**
```typescript
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email().max(255),
  age: z.number().int().min(13).max(120),
});

export async function POST(req: Request) {
  const body = await req.json();
  const result = createUserSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error.flatten() },
      { status: 400 }
    );
  }

  const user = await db.user.create({ data: result.data });
  return NextResponse.json(user);
}
```

### CWE Mappings

- CWE-770: Allocation of Resources Without Limits or Throttling
- CWE-20: Improper Input Validation

---

## A05:2021 - Security Misconfiguration

### Description

Insecure default configurations, incomplete setups, or verbose error messages.

### Detection Patterns

```yaml
precision_grep:
  queries:
    - id: debug_mode
      pattern: "debug.*true|DEBUG.*=.*true|NODE_ENV.*development"
      glob: "**/*.{ts,tsx,js,jsx,json}"
    - id: error_details
      pattern: "error\\.stack|error\\.message.*res\\."
      glob: "**/*.{ts,tsx,js,jsx}"
    - id: default_credentials
      pattern: "password.*admin|password.*123|username.*admin"
      glob: "**/*.{ts,tsx,js,jsx}"
```

### Common Vulnerabilities

#### 1. Verbose Error Messages

**Vulnerable:**
```typescript
export async function GET(req: Request) {
  try {
    const data = await fetchSensitiveData();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
```

**Secure:**
```typescript
import { logger } from '@/lib/logger';

export async function GET(req: Request) {
  try {
    const data = await fetchSensitiveData();
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Failed to fetch data', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

#### 2. Insecure CORS Configuration

**Vulnerable:**
```typescript
export async function GET(req: Request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  };
  return NextResponse.json({ data: 'response' }, { headers });
}
```

**Secure:**
```typescript
const ALLOWED_ORIGINS = ['https://example.com', 'https://app.example.com'];

export async function GET(req: Request) {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {};

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return NextResponse.json({ data: 'response' }, { headers });
}
```

### CWE Mappings

- CWE-209: Generation of Error Message Containing Sensitive Information
- CWE-16: Configuration

---

## A06:2021 - Vulnerable and Outdated Components

### Description

Using libraries, frameworks, or dependencies with known vulnerabilities.

### Detection Patterns

```bash
npm audit --audit-level=moderate
npm outdated
```

```yaml
precision_exec:
  commands:
    - cmd: "npm audit --json"
      timeout_ms: 30000
  verbosity: standard
```

### Remediation

1. **Run npm audit regularly:**
   ```bash
   npm audit
   npm audit fix
   npm audit fix --force  # For breaking changes
   ```

2. **Update dependencies:**
   ```bash
   npm update
   npx npm-check-updates -u  # Update all to latest
   ```

3. **Use automated tools:**
   - Dependabot (GitHub)
   - Renovate Bot
   - Snyk
   - Socket.dev

### CWE Mappings

- CWE-1035: Using Components with Known Vulnerabilities

---

## A07:2021 - Identification and Authentication Failures

### Description

Weak authentication mechanisms allowing attackers to compromise accounts.

### Detection Patterns

```yaml
precision_grep:
  queries:
    - id: weak_password_policy
      pattern: "password\\.length.*<.*8|minLength.*[0-6]"
      glob: "**/*.{ts,tsx,js,jsx}"
    - id: no_session_timeout
      pattern: "session.*expir|maxAge"
      glob: "**/*.{ts,tsx,js,jsx}"
    - id: weak_jwt_secret
      pattern: "jwt.*secret.*[\"'][^\"']{1,20}[\"']"
      glob: "**/*.{ts,tsx,js,jsx}"
```

### Common Vulnerabilities

#### 1. Weak Password Requirements

**Vulnerable:**
```typescript
export function validatePassword(password: string): boolean {
  return password.length >= 6;
}
```

**Secure:**
```typescript
import { z } from 'zod';

const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Password must contain uppercase letter')
  .regex(/[a-z]/, 'Password must contain lowercase letter')
  .regex(/[0-9]/, 'Password must contain number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain special character');

export function validatePassword(password: string): boolean {
  return passwordSchema.safeParse(password).success;
}
```

#### 2. Missing Session Expiration

**Vulnerable:**
```typescript
export async function createSession(userId: string) {
  const token = await generateToken();
  await db.session.create({ data: { token, userId } });
  return token;
}
```

**Secure:**
```typescript
export async function createSession(userId: string) {
  const token = await generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  
  await db.session.create({
    data: { token, userId, expiresAt },
  });
  
  return { token, expiresAt };
}

export async function validateSession(token: string) {
  const session = await db.session.findUnique({ where: { token } });
  
  if (!session || session.expiresAt < new Date()) {
    return null;
  }
  
  return session;
}
```

### CWE Mappings

- CWE-521: Weak Password Requirements
- CWE-613: Insufficient Session Expiration

---

## A08:2021 - Software and Data Integrity Failures

### Description

Code and infrastructure that doesn't protect against integrity violations.

### Detection Patterns

```yaml
precision_grep:
  queries:
    - id: unsafe_deserialization
      pattern: "JSON\\.parse.*req\\.(body|query)|eval\\("
      glob: "**/*.{ts,tsx,js,jsx}"
    - id: unsigned_updates
      pattern: "npm install|yarn add|pnpm add"
      glob: ".github/workflows/*.yml"
```

### Common Vulnerabilities

#### 1. Insecure Deserialization

**Vulnerable:**
```typescript
export async function POST(req: Request) {
  const serialized = await req.text();
  const data = eval(`(${serialized})`);
  return NextResponse.json(data);
}
```

**Secure:**
```typescript
import { z } from 'zod';

const schema = z.object({
  name: z.string(),
  age: z.number(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const result = schema.safeParse(body);
  
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }
  
  return NextResponse.json(result.data);
}
```

#### 2. Unsigned CI/CD Pipeline

**Vulnerable:**
```yaml
- name: Install dependencies
  run: npm install
```

**Secure:**
```yaml
- name: Install dependencies
  run: npm ci  # Uses lockfile, verifies integrity
```

### CWE Mappings

- CWE-502: Deserialization of Untrusted Data
- CWE-494: Download of Code Without Integrity Check

---

## A09:2021 - Security Logging and Monitoring Failures

### Description

Insufficient logging and monitoring to detect breaches.

### Detection Patterns

```yaml
precision_grep:
  queries:
    - id: logging_sensitive
      pattern: "console\\.log.*password|logger.*password|log.*token"
      glob: "**/*.{ts,tsx,js,jsx}"
    - id: no_audit_logs
      pattern: "(login|logout|delete|admin).*async.*function"
      glob: "**/api/**/*.{ts,js}"
```

### Common Vulnerabilities

#### 1. Logging Sensitive Data

**Vulnerable:**
```typescript
export async function login(email: string, password: string) {
  console.log('Login attempt:', { email, password });
  const user = await authenticateUser(email, password);
  return user;
}
```

**Secure:**
```typescript
import { logger } from '@/lib/logger';

export async function login(email: string, password: string) {
  logger.info('Login attempt', { email });
  
  try {
    const user = await authenticateUser(email, password);
    logger.info('Login successful', { userId: user.id, email });
    return user;
  } catch (error) {
    logger.warn('Login failed', { email, reason: 'Invalid credentials' });
    throw error;
  }
}
```

#### 2. Missing Audit Logs

**Vulnerable:**
```typescript
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  await db.user.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
```

**Secure:**
```typescript
import { logger } from '@/lib/logger';

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  
  logger.warn('User deletion attempt', {
    targetUserId: params.id,
    actorUserId: session?.user.id,
    actorEmail: session?.user.email,
    ip: req.headers.get('x-forwarded-for'),
    userAgent: req.headers.get('user-agent'),
  });
  
  await db.user.delete({ where: { id: params.id } });
  
  logger.info('User deleted', {
    targetUserId: params.id,
    actorUserId: session?.user.id,
  });
  
  return NextResponse.json({ success: true });
}
```

### CWE Mappings

- CWE-778: Insufficient Logging
- CWE-532: Insertion of Sensitive Information into Log File

---

## A10:2021 - Server-Side Request Forgery (SSRF)

### Description

Application fetches a remote resource without validating the user-supplied URL.

### Detection Patterns

```yaml
precision_grep:
  queries:
    - id: ssrf_vulnerable
      pattern: "fetch.*req\\.(body|query|params)|axios.*req\\.(body|query)"
      glob: "**/*.{ts,tsx,js,jsx}"
```

### Common Vulnerabilities

#### 1. Unvalidated URL Fetch

**Vulnerable:**
```typescript
export async function POST(req: Request) {
  const { url } = await req.json();
  const response = await fetch(url);
  const data = await response.text();
  return NextResponse.json({ data });
}
```

**Secure:**
```typescript
import { z } from 'zod';

const ALLOWED_HOSTS = ['api.example.com', 'cdn.example.com'];

const urlSchema = z.string().url().refine(
  (url) => {
    const parsed = new URL(url);
    return ALLOWED_HOSTS.includes(parsed.hostname);
  },
  { message: 'URL not in allowed hosts' }
);

export async function POST(req: Request) {
  const body = await req.json();
  const result = urlSchema.safeParse(body.url);
  
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }
  
  const response = await fetch(result.data);
  const data = await response.text();
  return NextResponse.json({ data });
}
```

### CWE Mappings

- CWE-918: Server-Side Request Forgery (SSRF)

---

## Additional Security Patterns

### CSRF Protection

**Vulnerable:**
```typescript
export async function POST(req: Request) {
  const { amount } = await req.json();
  await transferMoney(amount);
  return NextResponse.json({ success: true });
}
```

**Secure:**
```typescript
export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  
  // Verify request comes from same origin
  const originHost = new URL(origin).host;
  if (originHost !== host) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  const { amount } = await req.json();
  await transferMoney(amount);
  return NextResponse.json({ success: true });
}
```

### Path Traversal Protection

**Vulnerable:**
```typescript
import fs from 'fs/promises';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('file');
  const content = await fs.readFile(`./uploads/${filename}`);
  return new Response(content);
}
```

**Secure:**
```typescript
import fs from 'fs/promises';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('file');
  
  if (!filename) {
    return NextResponse.json({ error: 'Missing filename' }, { status: 400 });
  }
  
  // Normalize and validate path - defend against URL-encoded traversals (%2e%2e%2f)
  const decoded = decodeURIComponent(filename);
  const safePath = path.normalize(decoded).replace(/^(\.\.\/)+/, '');
  const fullPath = path.resolve(path.join(UPLOADS_DIR, safePath));
  
  if (!fullPath.startsWith(UPLOADS_DIR + path.sep) && fullPath !== UPLOADS_DIR) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  
  const content = await fs.readFile(fullPath);
  return new Response(content);
}
```

---

## Quick Reference: Security Checklist

### Authentication
- [ ] Passwords hashed with bcrypt/argon2
- [ ] Session cookies: httpOnly, secure, sameSite
- [ ] JWT secrets minimum 32 bytes
- [ ] Session expiration implemented
- [ ] MFA available for sensitive operations

### Authorization
- [ ] All API routes check authentication
- [ ] Resource ownership verified
- [ ] Role-based access control (RBAC) implemented
- [ ] Admin routes protected

### Input Validation
- [ ] All inputs validated with Zod/Yup/Joi
- [ ] SQL queries use parameterization
- [ ] HTML sanitized before rendering
- [ ] File paths validated and normalized
- [ ] URLs validated before fetching

### Data Protection
- [ ] Sensitive data encrypted at rest
- [ ] HTTPS enforced
- [ ] PII redacted from logs
- [ ] Secrets in environment variables
- [ ] .env in .gitignore

### Security Headers
- [ ] Content-Security-Policy configured
- [ ] Strict-Transport-Security (HSTS)
- [ ] X-Frame-Options: DENY
- [ ] X-Content-Type-Options: nosniff
- [ ] CORS properly configured

### Monitoring
- [ ] Audit logs for sensitive operations
- [ ] Error logging (without sensitive data)
- [ ] Rate limiting on public endpoints
- [ ] Failed login attempt tracking

### Dependencies
- [ ] npm audit run regularly
- [ ] Dependencies up to date
- [ ] Lockfile committed
- [ ] npm ci used in CI/CD

### Infrastructure
- [ ] Docker: non-root user
- [ ] Docker: minimal base images
- [ ] Environment-specific configs
- [ ] Health check endpoints
