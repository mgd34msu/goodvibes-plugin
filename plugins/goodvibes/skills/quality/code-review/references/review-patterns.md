# Code Review Patterns and Anti-Patterns

This reference document catalogs common anti-patterns organized by category. Use this during code reviews to quickly identify issues.

## Security Anti-Patterns

### SQL Injection

**Anti-pattern: String concatenation in SQL queries**

```typescript
// BAD: SQL injection vulnerability
const userId = req.query.id;
const query = `SELECT * FROM users WHERE id = ${userId}`;
const result = await db.query(query);
```

**Fix: Use parameterized queries or ORM**

```typescript
// GOOD: Parameterized query
const userId = req.query.id;
const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);

// BEST: Use Prisma or another ORM
const user = await prisma.user.findUnique({ where: { id: userId } });
```

**Detection pattern:**

```yaml
precision_grep:
  queries:
    - id: sql_injection
      pattern: '(query|execute|sql).*[`$].*\$\{'
      glob: "**/*.{ts,js}"
```

### Cross-Site Scripting (XSS)

**Anti-pattern: Unsafe HTML rendering**

```tsx
// BAD: XSS vulnerability
function UserComment({ comment }: { comment: string }) {
  return <div dangerouslySetInnerHTML={{ __html: comment }} />;
}
```

**Fix: Escape user input or use safe rendering**

```tsx
// GOOD: React automatically escapes
function UserComment({ comment }: { comment: string }) {
  return <div>{comment}</div>;
}

// ACCEPTABLE: Sanitize HTML with DOMPurify
import DOMPurify from 'dompurify';

function UserComment({ comment }: { comment: string }) {
  const sanitized = DOMPurify.sanitize(comment);
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

**Detection pattern:**

```yaml
precision_grep:
  queries:
    - id: xss_risk
      pattern: "(dangerouslySetInnerHTML|innerHTML|outerHTML)"
      glob: "**/*.{tsx,jsx}"
```

### Hardcoded Secrets

**Anti-pattern: Credentials in source code**

```typescript
// BAD: Secret in code
const API_KEY = 'sk_live_abc123xyz';
const db = new Database({
  password: 'mySecretPassword123',
});
```

**Fix: Use environment variables**

```typescript
// GOOD: Load from env
const API_KEY = process.env.STRIPE_API_KEY;
if (!API_KEY) throw new Error('STRIPE_API_KEY not configured');

const db = new Database({
  password: process.env.DATABASE_PASSWORD,
});
```

**Detection pattern:**

```yaml
precision_grep:
  queries:
    - id: hardcoded_secrets
      pattern: '(password|secret|api[_-]?key|token)\s*=\s*["''][^"'']+["'']'
      glob: "**/*.{ts,tsx,js,jsx,json}"
```

### Missing Authentication

**Anti-pattern: Protected route without auth check**

```typescript
// BAD: No authentication
export async function POST(request: Request) {
  const body = await request.json();
  const post = await prisma.post.create({ data: body });
  return Response.json(post);
}
```

**Fix: Add authentication middleware**

```typescript
// GOOD: Check authentication
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const post = await prisma.post.create({
    data: { ...body, authorId: session.user.id },
  });
  return Response.json(post);
}
```

**Detection pattern:**

```yaml
precision_grep:
  queries:
    - id: unauthed_routes
      pattern: "export (async )?function (GET|POST|PUT|DELETE|PATCH)"
      glob: "src/app/api/**/*.ts"
    - id: auth_checks
      pattern: "(getServerSession|auth\\(\\)|requireAuth)"
      glob: "src/app/api/**/*.ts"
```

### Missing Input Validation

**Anti-pattern: Using request data without validation**

```typescript
// BAD: No validation
export async function POST(request: Request) {
  const body = await request.json();
  const user = await prisma.user.create({ data: body });
  return Response.json(user);
}
```

**Fix: Validate with Zod or equivalent**

```typescript
// GOOD: Validate input
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).max(150).optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const result = createUserSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      { error: 'Invalid input', details: result.error.flatten() },
      { status: 400 }
    );
  }

  const user = await prisma.user.create({ data: result.data });
  return Response.json(user);
}
```

**Detection pattern:**

```yaml
precision_grep:
  queries:
    - id: unvalidated_input
      pattern: "(await request\\.json\\(\\)|req\\.body)(?!.*safeParse)"
      glob: "src/app/api/**/*.ts"
```

## Performance Anti-Patterns

### N+1 Query Problem

**Anti-pattern: Database calls in loops**

```typescript
// BAD: N+1 queries (1 query + N queries in loop)
const posts = await prisma.post.findMany();
for (const post of posts) {
  const author = await prisma.user.findUnique({ where: { id: post.authorId } });
  console.log(author.name);
}
```

**Fix: Use eager loading or batch queries**

```typescript
// GOOD: Single query with include
const posts = await prisma.post.findMany({
  include: { author: true },
});
for (const post of posts) {
  console.log(post.author.name);
}

// ALSO GOOD: Batch fetch users
const posts = await prisma.post.findMany();
const authorIds = [...new Set(posts.map(p => p.authorId))];
const authors = await prisma.user.findMany({
  where: { id: { in: authorIds } },
});
const authorMap = new Map(authors.map(a => [a.id, a]));
for (const post of posts) {
  console.log(authorMap.get(post.authorId)?.name);
}
```

**Detection pattern:**

```yaml
precision_grep:
  queries:
    - id: n_plus_one
      pattern: "(for|forEach|map).*await.*(prisma|db|query|find)"
      glob: "**/*.{ts,tsx,js,jsx}"
```

### Missing Database Indexes

**Anti-pattern: Filtering on unindexed columns**

```prisma
// BAD: No index on frequently filtered field
model Post {
  id        String   @id @default(cuid())
  title     String
  published Boolean
  createdAt DateTime @default(now())
}
```

**Fix: Add indexes for WHERE clauses**

```prisma
// GOOD: Index on filtered fields
model Post {
  id        String   @id @default(cuid())
  title     String
  published Boolean
  createdAt DateTime @default(now())

  @@index([published, createdAt])
}
```

**What to index:**
- Foreign keys (userId, postId)
- Boolean flags used in WHERE (published, active)
- Date fields for sorting (createdAt, updatedAt)
- Compound indexes for multi-column filters

### React Unnecessary Re-renders

**Anti-pattern: Inline object/function creation**

```tsx
// BAD: Creates new object on every render
function UserList({ users }: { users: User[] }) {
  return (
    <div>
      {users.map((user) => (
        <UserCard
          key={user.id}
          user={user}
          style={{ padding: 10 }}  // New object every render!
          onClick={() => console.log(user.id)}  // New function every render!
        />
      ))}
    </div>
  );
}
```

**Fix: Extract constants and use memoization**

```tsx
// GOOD: Stable references
import { useCallback, useMemo } from 'react';

const CARD_STYLE = { padding: 10 };

function UserList({ users }: { users: User[] }) {
  const handleClick = useCallback((userId: string) => {
    console.log(userId);
  }, []);

  return (
    <div>
      {users.map((user) => (
        <UserCard
          key={user.id}
          user={user}
          style={CARD_STYLE}
          onClick={() => handleClick(user.id)}
        />
      ))}
    </div>
  );
}
```

**Detection pattern:**

```yaml
precision_grep:
  queries:
    - id: inline_objects
      pattern: "(onClick|onChange|style)=\\{\\{|=\\{\\["
      glob: "**/*.{tsx,jsx}"
```

### Missing Memoization for Expensive Computations

**Anti-pattern: Expensive computation on every render**

```tsx
// BAD: Recalculates on every render
function ProductList({ products }: { products: Product[] }) {
  const sortedProducts = products
    .filter(p => p.inStock)
    .sort((a, b) => b.rating - a.rating);

  return <div>{sortedProducts.map(renderProduct)}</div>;
}
```

**Fix: Use useMemo**

```tsx
// GOOD: Only recalculates when products change
import { useMemo } from 'react';

function ProductList({ products }: { products: Product[] }) {
  const sortedProducts = useMemo(
    () => products.filter(p => p.inStock).sort((a, b) => b.rating - a.rating),
    [products]
  );

  return <div>{sortedProducts.map(renderProduct)}</div>;
}
```

## Type Safety Anti-Patterns

### Using `any` Type

**Anti-pattern: Disabling type checking**

```typescript
// BAD: Loses all type safety
function processUser(user: any) {
  console.log(user.name.toUpperCase());  // Runtime error if name is undefined!
  return user.email.split('@')[0];
}
```

**Fix: Use proper types or `unknown`**

```typescript
// GOOD: Proper types
interface User {
  name: string;
  email: string;
}

function processUser(user: User) {
  console.log(user.name.toUpperCase());
  return user.email.split('@')[0];
}

// ACCEPTABLE: unknown with type guards
function processUnknown(data: unknown) {
  if (typeof data === 'object' && data !== null && 'name' in data && 'email' in data) {
    const user = data as { name: string; email: string };
    return user.email.split('@')[0];
  }
  throw new Error('Invalid user data');
}
```

**Detection pattern:**

```yaml
precision_grep:
  queries:
    - id: any_usage
      pattern: ":\s*any(\s|;|,|\\))"
      glob: "**/*.{ts,tsx}"
```

### Type Assertions (as)

**Anti-pattern: Forcing types**

```typescript
// BAD: Assertion can be wrong
const data = await fetch('/api/user').then(r => r.json());
const user = data as User;  // No runtime check!
```

**Fix: Validate at runtime**

```typescript
// GOOD: Runtime validation
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

type User = z.infer<typeof UserSchema>;

const data = await fetch('/api/user').then(r => r.json());
const user = UserSchema.parse(data);  // Throws if invalid
```

### Missing Return Types

**Anti-pattern: Implicit return types**

```typescript
// BAD: Return type not explicit
function getUser(id: string) {
  return prisma.user.findUnique({ where: { id } });
}
```

**Fix: Explicit return types**

```typescript
// GOOD: Explicit return type
function getUser(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}
```

## Error Handling Anti-Patterns

### Floating Promises

**Anti-pattern: Not awaiting promises**

```typescript
// BAD: Promise rejected but not caught
function processOrder(orderId: string) {
  sendConfirmationEmail(orderId);  // Floating promise!
  updateInventory(orderId);        // If this fails, we never know
  return { success: true };
}
```

**Fix: Await or handle explicitly**

```typescript
// GOOD: Await promises
async function processOrder(orderId: string) {
  await sendConfirmationEmail(orderId);
  await updateInventory(orderId);
  return { success: true };
}

// ACCEPTABLE: Explicit error handling
function processOrder(orderId: string) {
  sendConfirmationEmail(orderId).catch(err => logger.error('Email failed', err));
  updateInventory(orderId).catch(err => logger.error('Inventory update failed', err));
  return { success: true };
}
```

**Detection pattern:**

```yaml
precision_grep:
  queries:
    - id: floating_promises
      pattern: "^\\s+[a-z][a-zA-Z]*\\(.*\\);$"
      glob: "**/*.{ts,tsx,js,jsx}"
```

### Empty Catch Blocks

**Anti-pattern: Swallowing errors**

```typescript
// BAD: Error silently swallowed
try {
  await riskyOperation();
} catch (error) {
  // Do nothing
}
```

**Fix: Log errors with context**

```typescript
// GOOD: Log and handle
try {
  await riskyOperation();
} catch (error) {
  logger.error('Risky operation failed', { error, userId, context });
  throw error;  // Or handle appropriately
}
```

### Non-Error Objects Thrown

**Anti-pattern: Throwing strings or objects**

```typescript
// BAD: Throws string
if (!user) throw 'User not found';

// BAD: Throws plain object
if (!user) throw { code: 'NOT_FOUND', message: 'User not found' };
```

**Fix: Throw Error instances**

```typescript
// GOOD: Throw Error
if (!user) throw new Error('User not found');

// BETTER: Custom error classes
class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

if (!user) throw new NotFoundError('User', userId);
```

## Testing Anti-Patterns

### Missing Tests for Changed Code

**Anti-pattern: Changing code without updating tests**

```typescript
// Added new function but no test
export function calculateDiscount(price: number, coupon: string): number {
  if (coupon === 'SAVE10') return price * 0.9;
  if (coupon === 'SAVE20') return price * 0.8;
  return price;
}
```

**Fix: Add comprehensive tests**

```typescript
// calculateDiscount.test.ts
import { describe, it, expect } from 'vitest';
import { calculateDiscount } from './calculateDiscount';

describe('calculateDiscount', () => {
  it('should apply 10% discount for SAVE10 coupon', () => {
    expect(calculateDiscount(100, 'SAVE10')).toBe(90);
  });

  it('should apply 20% discount for SAVE20 coupon', () => {
    expect(calculateDiscount(100, 'SAVE20')).toBe(80);
  });

  it('should return original price for invalid coupon', () => {
    expect(calculateDiscount(100, 'INVALID')).toBe(100);
  });

  it('should return original price for empty coupon', () => {
    expect(calculateDiscount(100, '')).toBe(100);
  });
});
```

### Skipped or Focused Tests

**Anti-pattern: Leaving .skip or .only in tests**

```typescript
// BAD: Skipped test that should run
it.skip('should validate email format', () => {
  expect(validateEmail('invalid')).toBe(false);
});

// BAD: Focused test (only this runs)
it.only('should create user', () => {
  const user = createUser({ email: 'test@example.com' });
  expect(user).toBeDefined();
});
```

**Fix: Remove .skip and .only**

```typescript
// GOOD: All tests run
it('should validate email format', () => {
  expect(validateEmail('invalid')).toBe(false);
});

it('should create user', () => {
  const user = createUser({ email: 'test@example.com' });
  expect(user).toBeDefined();
});
```

**Detection pattern:**

```yaml
precision_grep:
  queries:
    - id: skipped_focused
      pattern: "(it\\.skip|test\\.skip|describe\\.skip|it\\.only|test\\.only|describe\\.only)"
      glob: "**/*.test.{ts,tsx}"
```

### Weak Assertions

**Anti-pattern: Vague assertions**

```typescript
// BAD: Not specific enough
it('should return user', async () => {
  const user = await getUser('123');
  expect(user).toBeTruthy();  // Passes for any truthy value!
});
```

**Fix: Specific assertions**

```typescript
// GOOD: Specific expectations
it('should return user with correct structure', async () => {
  const user = await getUser('123');
  expect(user).toMatchObject({
    id: '123',
    email: expect.stringContaining('@'),
    name: expect.any(String),
  });
});
```

## Architecture Anti-Patterns

### Layering Violations

**Anti-pattern: Database access in UI components**

```tsx
// BAD: Database query in component
import { prisma } from '@/lib/prisma';

export default function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    prisma.user.findUnique({ where: { id: userId } }).then(setUser);
  }, [userId]);

  return <div>{user?.name}</div>;
}
```

**Fix: Use proper layers**

```tsx
// GOOD: API route handles database
// src/app/api/users/[id]/route.ts
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await prisma.user.findUnique({ where: { id: params.id } });
  return Response.json(user);
}

// Component uses API
export default function UserProfile({ userId }: { userId: string }) {
  const { data: user } = useSWR(`/api/users/${userId}`);
  return <div>{user?.name}</div>;
}
```

### Circular Dependencies

**Anti-pattern: Modules importing each other**

```typescript
// user.ts
import { validatePost } from './post';

export function createUser(data: any) {  // BAD: any type
  // Uses validatePost
}

// post.ts
import { getUser } from './user';

export function validatePost(postData: any) {  // BAD: any type
  const user = getUser(postData.authorId);  // Uses getUser
}
```

**Fix: Extract shared code or invert dependency**

```typescript
// shared/validation.ts
interface PostData { authorId: string; title: string; content: string; }
export function validatePost(postData: PostData) {
  // Validation logic
}

// user.ts
import { validatePost } from './shared/validation';
interface UserData { name: string; email: string; }
export function createUser(data: UserData) {
  // Uses validatePost
}

// post.ts
export function getUser(id: string) {
  // No dependency on user.ts
}
```

## Accessibility Anti-Patterns

### Div Buttons

**Anti-pattern: Using div for clickable elements**

```tsx
// BAD: Not keyboard accessible
<div onClick={() => handleClick()}>Click me</div>
```

**Fix: Use button element**

```tsx
// GOOD: Proper button
<button type="button" onClick={() => handleClick()}>
  Click me
</button>
```

### Missing Alt Text

**Anti-pattern: Images without alt**

```tsx
// BAD: Screen reader can't describe image
<img src="/user-avatar.png" />
```

**Fix: Add descriptive alt text**

```tsx
// GOOD: Descriptive alt
<img src="/user-avatar.png" alt="John Smith's profile picture" />

// ACCEPTABLE: Empty alt for decorative images
<img src="/decorative-line.png" alt="" />
```

### Missing Form Labels

**Anti-pattern: Inputs without labels**

```tsx
// BAD: No label association
<input type="email" placeholder="Email" />
```

**Fix: Use label or aria-label**

```tsx
// GOOD: Explicit label
<label htmlFor="email">Email</label>
<input id="email" type="email" />

// ACCEPTABLE: aria-label
<input type="email" aria-label="Email address" />
```

## Documentation Anti-Patterns

### Missing JSDoc for Public APIs

**Anti-pattern: No documentation**

```typescript
// BAD: No documentation
export function calculateTax(amount: number, rate: number) {
  return amount * rate;
}
```

**Fix: Add JSDoc**

```typescript
// GOOD: Documented
/**
 * Calculates tax amount based on the given rate.
 *
 * @param amount - The base amount before tax
 * @param rate - The tax rate as a decimal (e.g., 0.08 for 8%)
 * @returns The tax amount
 *
 * @example
 * calculateTax(100, 0.08) // returns 8
 */
export function calculateTax(amount: number, rate: number): number {
  return amount * rate;
}
```

### Magic Numbers Without Explanation

**Anti-pattern: Unexplained constants**

```typescript
// BAD: What is 86400000?
const expiresAt = Date.now() + 86400000;
```

**Fix: Named constants with comments**

```typescript
// GOOD: Self-documenting
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;  // 86400000
const expiresAt = Date.now() + MILLISECONDS_PER_DAY;
```

## Quick Detection Scripts

### Find All Security Issues

```bash
# SQL injection
grep -r --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next "query.*\${" -- src/

# XSS
grep -r --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next "dangerouslySetInnerHTML" -- src/

# Hardcoded secrets
grep -rE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next "(password|apiKey|secret)\s*=\s*[\"'][^\"']+" -- src/
```

### Find All Performance Issues

```bash
# N+1 queries
grep -rE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next "(for|forEach).*await.*(prisma|db)" -- src/

# Inline objects in React
grep -rE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next "(onClick|style)=\{\{" -- src/
```

### Find All Type Safety Issues

```bash
# any usage
grep -rE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next ":\s*any(\s|;|,|\))" -- src/

# Type assertions
grep -r --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next " as " -- src/
```
