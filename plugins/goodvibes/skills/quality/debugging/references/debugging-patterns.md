# Debugging Patterns Reference

Common debugging patterns and anti-patterns organized by category.

## Type Error Patterns

### Cannot read property X of undefined

**Pattern:**
```typescript
const name = user.profile.name; // user or profile is undefined
```

**Root causes:**
- Missing null check
- API returned unexpected shape
- Destructuring undefined value

**Fixes:**
```typescript
// Optional chaining
const name = user?.profile?.name;

// With default
const name = user?.profile?.name ?? 'Unknown';

// Type guard
if (user?.profile) {
  const name = user.profile.name;
}
```

### Cannot read property X of null

**Pattern:**
```typescript
const element = document.getElementById('missing');
element.classList.add('active'); // element is null
```

**Root causes:**
- DOM element doesn't exist
- Timing issue (script runs before DOM loads)
- Wrong selector

**Fixes:**
```typescript
// Null check
const element = document.getElementById('my-element');
if (element) {
  element.classList.add('active');
}

// Non-null assertion (only if certain)
const element = document.getElementById('my-element')!;

// Optional chaining
element?.classList.add('active');
```

### X is not a function

**Pattern:**
```typescript
import { myFunction } from './module';
myFunction(); // myFunction is undefined or not a function
```

**Root causes:**
- Wrong import (default vs named)
- Module not exported
- Variable shadowing
- Typo in function name

**Fixes:**
```typescript
// Check export type
export default function myFunction() {} // import myFunction from './module'
export function myFunction() {}        // import { myFunction } from './module'

// Check if function exists
if (typeof myFunction === 'function') {
  myFunction();
}
```

## Runtime Error Patterns

### Maximum call stack size exceeded

**Pattern:**
```typescript
function factorial(n: number): number {
  return n * factorial(n - 1); // Missing base case
}
```

**Root causes:**
- Infinite recursion
- Circular dependency
- Missing base case

**Fixes:**
```typescript
// Add base case
function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

// Use iteration instead
function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}
```

### Floating promises

**Pattern:**
```typescript
function saveUser(user: User) {
  db.user.create(user); // Promise not awaited
}
```

**Root causes:**
- Missing await
- Missing .then/.catch
- Fire-and-forget anti-pattern

**Fixes:**
```typescript
// Await the promise
async function saveUser(user: User) {
  await db.user.create(user);
}

// Or use .then
function saveUser(user: User) {
  return db.user.create(user).then(result => {
    console.log('Saved');
    return result;
  });
}

// Add error handling
async function saveUser(user: User) {
  try {
    await db.user.create(user);
  } catch (error) {
    logger.error('Failed to save user', { error });
    throw error;
  }
}
```

### Empty catch blocks

**Pattern:**
```typescript
try {
  await riskyOperation();
} catch (error) {
  // Error silently swallowed
}
```

**Root causes:**
- Lazy error handling
- Ignoring errors intentionally
- Incomplete implementation

**Fixes:**
```typescript
// Log the error
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', { error });
  throw error;
}

// Handle specific errors
try {
  await riskyOperation();
} catch (error) {
  if (error instanceof ValidationError) {
    return { success: false, errors: error.errors };
  }
  throw error;
}

// Return default value
try {
  return await fetchData();
} catch (error) {
  logger.warn('Fetch failed, using default', { error });
  return defaultValue;
}
```

## State Management Patterns

### Stale closure

**Pattern:**
```typescript
const [count, setCount] = useState(0);

useEffect(() => {
  const interval = setInterval(() => {
    setCount(count + 1); // count is stale
  }, 1000);
  return () => clearInterval(interval);
}, []); // Empty deps array
```

**Root causes:**
- Closure captures stale value
- Missing dependency
- Using value instead of updater function

**Fixes:**
```typescript
// Use functional update
useEffect(() => {
  const interval = setInterval(() => {
    setCount(prev => prev + 1);
  }, 1000);
  return () => clearInterval(interval);
}, []);

// Or add to dependencies
useEffect(() => {
  const interval = setInterval(() => {
    setCount(count + 1);
  }, 1000);
  return () => clearInterval(interval);
}, [count]);
```

### State mutation

**Pattern:**
```typescript
const [items, setItems] = useState([1, 2, 3]);
items.push(4); // Mutates state directly
setItems(items);
```

**Root causes:**
- Mutating state instead of replacing
- Misunderstanding immutability

**Fixes:**
```typescript
// Create new array
setItems([...items, 4]);

// For objects
const [user, setUser] = useState({ name: 'Alice', age: 30 });
setUser({ ...user, age: 31 });

// For nested updates
setUser(prev => ({
  ...prev,
  profile: {
    ...prev.profile,
    bio: 'New bio'
  }
}));
```

### Infinite re-render loop

**Pattern:**
```typescript
function MyComponent() {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    setCount(count + 1); // Runs on every render
  }); // Missing dependency array
  
  return <div>{count}</div>;
}
```

**Root causes:**
- useEffect without dependencies
- State update in render
- Dependency that changes every render

**Fixes:**
```typescript
// Add dependency array
useEffect(() => {
  // Only runs once
}, []);

// Or specific dependencies
useEffect(() => {
  setCount(count + 1);
}, [someCondition]); // Only when condition changes

// Avoid inline objects/arrays as deps
const options = useMemo(() => ({ key: 'value' }), []);
useEffect(() => {
  fetchData(options);
}, [options]);
```

## Network Error Patterns

### CORS errors

**Pattern:**
```
Access to fetch at 'https://api.example.com' from origin 'http://localhost:3000'
has been blocked by CORS policy
```

**Root causes:**
- Missing CORS headers on server
- Wrong origin allowed
- Preflight request failing

**Fixes:**
```typescript
// Next.js API route
export async function GET(request: Request) {
  return Response.json(data, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// Handle preflight
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
```

### 401 Unauthorized

**Pattern:**
```typescript
const response = await fetch('/api/protected');
// 401 Unauthorized
```

**Root causes:**
- Missing auth token
- Expired token
- Invalid token format

**Fixes:**
```typescript
// Add auth header
const token = await getAuthToken();
const response = await fetch('/api/protected', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});

// Handle 401
if (response.status === 401) {
  await refreshToken();
  // Retry request
}

// API route validation
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const session = await verifyToken(token);
  } catch (error) {
    return Response.json({ error: 'Invalid token' }, { status: 401 });
  }
}
```

### Network timeout

**Pattern:**
```typescript
const response = await fetch('/api/slow');
// Request hangs indefinitely
```

**Root causes:**
- No timeout configured
- Backend is slow
- Network issues

**Fixes:**
```typescript
// Add timeout with AbortController
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

try {
  const response = await fetch('/api/slow', {
    signal: controller.signal,
  });
  clearTimeout(timeoutId);
} catch (error) {
  if (error.name === 'AbortError') {
    console.error('Request timed out');
  }
}

// With retry
async function fetchWithRetry(url: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(5000) });
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

## Performance Patterns

### N+1 queries

**Pattern:**
```typescript
const users = await prisma.user.findMany();
for (const user of users) {
  const posts = await prisma.post.findMany({ where: { userId: user.id } });
  // N queries in loop
}
```

**Root causes:**
- Loop with database calls
- Missing eager loading

**Fixes:**
```typescript
// Use include (Prisma)
const users = await prisma.user.findMany({
  include: {
    posts: true,
  },
});

// Or batch load
const users = await prisma.user.findMany();
const userIds = users.map(u => u.id);
const posts = await prisma.post.findMany({
  where: { userId: { in: userIds } },
});

// Group by userId
const postsByUser = posts.reduce((acc, post) => {
  acc[post.userId] = acc[post.userId] || [];
  acc[post.userId].push(post);
  return acc;
}, {} as Record<string, Post[]>);
```

### Unnecessary re-renders

**Pattern:**
```typescript
function Parent() {
  const [count, setCount] = useState(0);
  return <Child onClick={() => setCount(count + 1)} />;
  // Child re-renders on every Parent render
}
```

**Root causes:**
- Inline function in props
- Inline object in props
- Missing memoization

**Fixes:**
```typescript
// Use useCallback
function Parent() {
  const [count, setCount] = useState(0);
  const handleClick = useCallback(() => {
    setCount(prev => prev + 1);
  }, []);
  return <Child onClick={handleClick} />;
}

// Memoize child
const Child = React.memo(({ onClick }) => {
  return <button onClick={onClick}>Click</button>;
});

// Use useMemo for objects
const options = useMemo(() => ({ theme: 'dark' }), []);
return <Child options={options} />;
```

### Memory leaks

**Pattern:**
```typescript
useEffect(() => {
  window.addEventListener('resize', handleResize);
  // Missing cleanup
}, []);
```

**Root causes:**
- Event listeners not removed
- Intervals not cleared
- Subscriptions not unsubscribed

**Fixes:**
```typescript
// Clean up event listeners
useEffect(() => {
  window.addEventListener('resize', handleResize);
  return () => {
    window.removeEventListener('resize', handleResize);
  };
}, []);

// Clean up intervals
useEffect(() => {
  const interval = setInterval(update, 1000);
  return () => clearInterval(interval);
}, []);

// Clean up subscriptions
useEffect(() => {
  const subscription = observable.subscribe(handleData);
  return () => subscription.unsubscribe();
}, []);
```

## Build Error Patterns

### Module not found

**Pattern:**
```
Error: Cannot find module './missing'
```

**Root causes:**
- Wrong file path
- Missing file extension
- Case sensitivity
- Alias not configured

**Fixes:**
```typescript
// Check relative path
import { x } from './utils/helper'; // Not '../utils/helper'

// Add file extension for non-TS files
import data from './data.json';

// Configure path alias (tsconfig.json)
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### Circular dependency

**Pattern:**
```
Warning: Circular dependency detected
A -> B -> C -> A
```

**Root causes:**
- Modules importing each other
- Barrel exports creating cycles

**Fixes:**
```typescript
// Extract shared code to new module
// Before:
// a.ts imports b.ts
// b.ts imports a.ts

// After:
// shared.ts has common code
// a.ts imports shared.ts
// b.ts imports shared.ts

// Avoid barrel exports for circular deps
// Instead of:
export * from './a';
export * from './b'; // If a and b depend on each other

// Use:
export { A } from './a';
export { B } from './b';
```

### Type errors in build

**Pattern:**
```
error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'
```

**Root causes:**
- Type mismatch
- Missing types
- Wrong import

**Fixes:**
```typescript
// Fix the type
function add(a: number, b: number) {
  return a + b;
}
add(1, 2); // Not add('1', '2')

// Add type annotation
const result: number = parseFloat(input);

// Use type guard
if (typeof value === 'number') {
  add(value, 5);
}
```
