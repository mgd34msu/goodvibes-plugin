# Testing Patterns Reference

Comprehensive guide to testing patterns, framework comparisons, and best practices.

## Test Pyramid Strategy

The test pyramid guides how to distribute testing effort:

```
     /\
    /E2E\        Few (5-10% of tests)
   /------\       - Full user flows
  /Integration\   - Critical paths only
 /----------\     - Slow, expensive
/__Unit Tests__\  Many (70-80% of tests)
                   - Fast, cheap
                   - Isolated
                   - Easy to debug
```

### Distribution Guidelines

| Test Type | Quantity | Speed | Maintenance | When to Use |
|-----------|----------|-------|-------------|-------------|
| Unit | 70-80% | <100ms | Low | Pure functions, utilities, hooks |
| Integration | 15-25% | <1s | Medium | API routes, database operations |
| E2E | 5-10% | >10s | High | Critical user flows, happy paths |

### Example Distribution

For a 200-test suite:
- **150 unit tests**: Business logic, utilities, pure functions
- **40 integration tests**: API endpoints, database queries, service layer
- **10 E2E tests**: Login, checkout, critical workflows

## Framework Comparison

### Vitest vs Jest

| Feature | Vitest | Jest |
|---------|--------|------|
| Speed | ⚡ Very fast (ESM-native, Vite transform) | 🐢 Slower (requires babel transform) |
| Config | Uses vite.config.ts (unified) | Separate jest.config.js |
| TypeScript | Native support | Requires ts-jest |
| ESM | First-class | Experimental |
| Watch mode | Instant HMR | Full re-run |
| Ecosystem | Growing | Mature |
| Migration | Drop-in Jest replacement | N/A |

**Recommendation**: Use **Vitest** for new projects (especially with Vite). Stick with Jest if already invested.

### Vitest Migration Example

```typescript
// jest.config.js → vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // Use global describe/it/expect
    environment: 'jsdom', // Was testEnvironment
    setupFiles: ['./src/test/setup.ts'], // Was setupFilesAfterEnv
    coverage: {
      provider: 'v8', // Faster than istanbul
      reporter: ['text', 'json', 'html'],
    },
  },
});

// No package.json changes needed - same API as Jest
```

### React Testing Library vs Enzyme

| Aspect | React Testing Library | Enzyme |
|--------|----------------------|--------|
| Philosophy | Test behavior (user-centric) | Test implementation (dev-centric) |
| Queries | Accessible queries (role, label) | Class names, internal state |
| Updates | Active (official React team) | Unmaintained |
| React 18 | Full support | Limited |

**Recommendation**: Always use **React Testing Library**. Enzyme is deprecated.

### Playwright vs Cypress

| Feature | Playwright | Cypress |
|---------|------------|----------|
| Browsers | Chromium, Firefox, WebKit | Chromium, Firefox |
| Parallel | Native multi-browser | Limited |
| Speed | Faster (no server proxy) | Slower (proxy overhead) |
| API | Auto-wait built-in | Manual waits |
| Network | Full control | Limited |
| File upload | Native | Plugin required |
| Setup | Simple | More configuration |

**Recommendation**: Use **Playwright** for new projects. Better browser support, faster, simpler.

## Mocking Decision Tree

```
Need to mock something?
|
├─ External API?
│  └─ Use MSW (Mock Service Worker)
│     - Intercepts fetch/axios at network level
│     - Works in tests and browser (dev mode)
│     - Realistic network behavior
│
├─ Database?
│  ├─ Unit tests → Mock the ORM (vi.mock)
│  └─ Integration tests → Use real database (test DB)
│
├─ Date/Time?
│  └─ Use vi.useFakeTimers() or vi.setSystemTime()
│
├─ Randomness?
│  └─ Seed random generators or mock Math.random()
│
├─ Browser APIs?
│  └─ Mock with vi.stubGlobal() or jsdom
│
└─ Your own modules?
   ├─ External dependencies → Mock with vi.mock()
   └─ Internal code → Don't mock (test real code)
```

### When NOT to Mock

1. **Don't mock what you're testing** - defeats the purpose
2. **Don't mock internal modules** - test real integration
3. **Don't mock trivial code** - simple utilities can run for real
4. **Don't mock to avoid setup** - fix the setup instead

### Mocking Examples

#### MSW for HTTP

```typescript
// src/test/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/user', () => {
    return HttpResponse.json({ id: '1', name: 'Test User' });
  }),
  
  http.post('/api/login', async ({ request }) => {
    const { email, password } = await request.json();
    
    if (email === 'test@example.com' && password === 'password') {
      return HttpResponse.json(
        { token: 'fake-jwt-token' },
        { status: 200 }
      );
    }
    
    return HttpResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 }
    );
  }),
  
  // Simulate network error
  http.get('/api/unreliable', () => {
    return HttpResponse.error();
  }),
];
```

#### Module Mocking

```typescript
// Mock external dependency
vi.mock('stripe', () => ({
  default: vi.fn(() => ({
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ id: 'sess_123' }),
      },
    },
  })),
}));

// Partial mock - keep some real code
vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>();
  return {
    ...actual,
    sendEmail: vi.fn(), // Mock only sendEmail
  };
});

// Mock with implementation
vi.mock('@/lib/auth', () => ({
  hashPassword: (pwd: string) => `hashed_${pwd}`,
  verifyPassword: (pwd: string, hash: string) => hash === `hashed_${pwd}`,
}));
```

#### Timer Mocking

```typescript
import { vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('debounces API calls', () => {
  const onSearch = vi.fn();
  const debounced = debounce(onSearch, 1000);
  
  debounced('query 1');
  debounced('query 2');
  debounced('query 3');
  
  // Not called yet
  expect(onSearch).not.toHaveBeenCalled();
  
  // Fast-forward time
  vi.advanceTimersByTime(1000);
  
  // Called once with last query
  expect(onSearch).toHaveBeenCalledOnce();
  expect(onSearch).toHaveBeenCalledWith('query 3');
});

it('expires sessions after 1 hour', () => {
  const session = createSession();
  expect(session.isValid()).toBe(true);
  
  vi.setSystemTime(Date.now() + 60 * 60 * 1000); // +1 hour
  
  expect(session.isValid()).toBe(false);
});
```

## Coverage Interpretation Guide

### Understanding Coverage Metrics

| Metric | What It Measures | Example |
|--------|------------------|----------|
| **Lines** | % of lines executed | `if (x) { return; }` - both lines |
| **Functions** | % of functions called | All exports invoked at least once |
| **Branches** | % of if/else paths taken | Both `if` and `else` executed |
| **Statements** | % of statements run | Each expression evaluated |

### Coverage Doesn't Mean...

❌ **100% coverage = bug-free code**
- You can have 100% coverage and still miss edge cases
- Coverage shows what ran, not what was tested correctly

❌ **High coverage = good tests**
- Tests might not assert anything meaningful
- Might just execute code without verifying behavior

❌ **All coverage is equal**
- Critical paths (auth, payments) need 100%
- UI components may be fine with 80%
- Generated code can be excluded

### What Coverage IS Good For

✅ **Finding untested code**
- Easily spot functions/branches never executed
- Identify dead code

✅ **Preventing regressions**
- Ensure new code has tests
- Block PRs that reduce coverage

✅ **Guiding test writing**
- Start with 0%, write tests, watch it grow
- Use coverage to find what to test next

### Coverage Targets by Code Type

| Code Type | Target | Rationale |
|-----------|--------|------------|
| Business logic | 100% | Core functionality, high risk |
| API routes | 100% | Security, data integrity |
| Utilities | 95%+ | Reused everywhere |
| Components | 80%+ | UI changes frequently |
| Types/interfaces | 0% | No runtime code |
| Generated code | 0% | Exclude from coverage |

### Example: Branch Coverage

```typescript
function getDiscount(user: User): number {
  if (user.isPremium) {        // Branch 1
    return 0.2;
  } else if (user.isReturning) { // Branch 2
    return 0.1;
  } else {                       // Branch 3
    return 0;
  }
}

// Test with 33% branch coverage (bad)
it('gives premium discount', () => {
  const user = { isPremium: true, isReturning: false };
  expect(getDiscount(user)).toBe(0.2);
});
// Only tests branch 1!

// Test with 100% branch coverage (good)
it('gives premium discount', () => {
  expect(getDiscount({ isPremium: true, isReturning: false })).toBe(0.2);
});

it('gives returning user discount', () => {
  expect(getDiscount({ isPremium: false, isReturning: true })).toBe(0.1);
});

it('gives no discount to new users', () => {
  expect(getDiscount({ isPremium: false, isReturning: false })).toBe(0);
});
```

## Common Testing Anti-Patterns

### 1. Testing Implementation Details

```typescript
// ❌ BAD - tests internal state
it('sets isLoading to true', () => {
  const { result } = renderHook(() => useUsers());
  expect(result.current.isLoading).toBe(true);
});

// ✅ GOOD - tests user-visible behavior
it('shows loading spinner while fetching users', () => {
  render(<UserList />);
  expect(screen.getByRole('status')).toBeInTheDocument();
  expect(screen.getByText(/loading/i)).toBeVisible();
});
```

### 2. Brittle Selectors

```typescript
// ❌ BAD - breaks when CSS changes
const button = container.querySelector('.btn-primary');
const heading = container.querySelector('#main-heading');

// ✅ GOOD - uses semantic/accessible queries
const button = screen.getByRole('button', { name: /submit/i });
const heading = screen.getByRole('heading', { level: 1 });
```

### 3. Overmocking

```typescript
// ❌ BAD - mocks everything, tests nothing
vi.mock('./api');
vi.mock('./utils');
vi.mock('./hooks');
vi.mock('./components/Button');

it('renders user profile', () => {
  // What are we even testing?
  render(<UserProfile />);
  expect(true).toBe(true);
});

// ✅ GOOD - only mocks external dependencies
vi.mock('axios'); // HTTP client is external

it('displays user data from API', async () => {
  axios.get.mockResolvedValue({
    data: { name: 'John', email: 'john@example.com' }
  });
  
  render(<UserProfile />);
  
  // Real components, real hooks, real utils
  await waitFor(() => {
    expect(screen.getByText('John')).toBeInTheDocument();
  });
});
```

### 4. Testing Multiple Things

```typescript
// ❌ BAD - tests too much at once
it('handles user flow', async () => {
  render(<App />);
  
  // Test 1: Login
  await userEvent.click(screen.getByText('Login'));
  await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
  await userEvent.click(screen.getByRole('button', { name: /submit/i }));
  
  // Test 2: Create post
  await userEvent.click(screen.getByText('New Post'));
  await userEvent.type(screen.getByLabelText('Title'), 'My Post');
  
  // Test 3: Logout
  await userEvent.click(screen.getByText('Logout'));
  
  expect(screen.getByText('Login')).toBeInTheDocument();
});

// ✅ GOOD - one test per behavior
it('logs in user with valid credentials', async () => {
  render(<LoginForm />);
  await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'password123');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  
  await waitFor(() => {
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
  });
});

it('creates new post when submitted', async () => {
  // Assume logged in state
  render(<NewPostForm />);
  await userEvent.type(screen.getByLabelText('Title'), 'My Post');
  await userEvent.click(screen.getByRole('button', { name: /publish/i }));
  
  await waitFor(() => {
    expect(screen.getByText('Post published')).toBeInTheDocument();
  });
});
```

### 5. No Assertions

```typescript
// ❌ BAD - just executes code, doesn't test anything
it('renders user profile', () => {
  render(<UserProfile user={mockUser} />);
  // Missing assertions!
});

// ✅ GOOD - verifies expected behavior
it('displays user name and email', () => {
  const user = { name: 'John Doe', email: 'john@example.com' };
  render(<UserProfile user={user} />);
  
  expect(screen.getByText('John Doe')).toBeInTheDocument();
  expect(screen.getByText('john@example.com')).toBeInTheDocument();
});
```

### 6. Flaky Tests (Time-Dependent)

```typescript
// ❌ BAD - depends on real time
it('expires token after 1 hour', async () => {
  const token = createToken();
  expect(token.isValid()).toBe(true);
  
  // This will NEVER work in tests!
  await new Promise(resolve => setTimeout(resolve, 60 * 60 * 1000));
  
  expect(token.isValid()).toBe(false);
});

// ✅ GOOD - uses fake timers
it('expires token after 1 hour', () => {
  vi.useFakeTimers();
  const token = createToken();
  expect(token.isValid()).toBe(true);
  
  vi.advanceTimersByTime(60 * 60 * 1000);
  
  expect(token.isValid()).toBe(false);
  vi.useRealTimers();
});
```

## Test Fixture Patterns

### Factory Functions

```typescript
// test/factories/user.ts
export function createUser(overrides = {}) {
  return {
    id: Math.random().toString(36),
    email: `test-${Date.now()}@example.com`,
    name: 'Test User',
    createdAt: new Date(),
    ...overrides,
  };
}

export function createPremiumUser(overrides = {}) {
  return createUser({
    isPremium: true,
    subscriptionEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ...overrides,
  });
}

// Usage
const user = createUser({ name: 'Alice' });
const premium = createPremiumUser();
```

### Database Fixtures

```typescript
// test/fixtures/db.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedDatabase() {
  const user1 = await prisma.user.create({
    data: {
      email: 'alice@example.com',
      name: 'Alice',
    },
  });
  
  const post1 = await prisma.post.create({
    data: {
      title: 'First Post',
      content: 'Hello world',
      authorId: user1.id,
    },
  });
  
  return { user1, post1 };
}

export async function cleanupDatabase() {
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();
}
```

### Snapshot Testing (Use Sparingly)

```typescript
// ✅ GOOD use case - error messages
it('returns validation error with details', () => {
  const result = validateEmail('invalid');
  expect(result).toMatchInlineSnapshot(`
    {
      "error": "Invalid email format",
      "field": "email",
      "value": "invalid",
    }
  `);
});

// ❌ BAD use case - entire component (brittle)
it('renders user profile', () => {
  const { container } = render(<UserProfile user={mockUser} />);
  expect(container).toMatchSnapshot(); // Will break on any change!
});
```

## Performance Testing

### Testing Render Performance

```typescript
import { render } from '@testing-library/react';
import { performance } from 'perf_hooks';

it('renders large list in under 100ms', () => {
  const items = Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    name: `Item ${i}`,
  }));
  
  const start = performance.now();
  render(<ItemList items={items} />);
  const duration = performance.now() - start;
  
  expect(duration).toBeLessThan(100);
});
```

### Testing Memory Leaks

```typescript
it('cleans up event listeners on unmount', () => {
  const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
  const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
  
  const { unmount } = render(<WindowResizeListener />);
  
  expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  
  unmount();
  
  expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  
  addEventListenerSpy.mockRestore();
  removeEventListenerSpy.mockRestore();
});
```

## Summary

Key takeaways:

1. **Follow the test pyramid** - mostly unit tests, some integration, few E2E
2. **Choose modern tools** - Vitest over Jest, Playwright over Cypress
3. **Mock at the network layer** - use MSW for HTTP, real code otherwise
4. **Coverage is a guide** - not a goal in itself
5. **Test behavior, not implementation** - focus on user-visible outcomes
6. **Avoid anti-patterns** - no brittle selectors, overmocking, or missing assertions
7. **Use fixtures wisely** - factory functions for objects, seeds for databases
8. **Keep tests fast** - mock external dependencies, use fake timers
