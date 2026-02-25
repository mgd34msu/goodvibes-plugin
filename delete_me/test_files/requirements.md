# Rate Limiter Library — Requirements

## Overview

Build a production-grade rate limiter library in TypeScript that supports multiple algorithms and can be used for API throttling, resource protection, and fair-use enforcement.

## Algorithms

### 1. Token Bucket

Classic token bucket with configurable capacity and refill rate.

- `capacity`: Maximum number of tokens the bucket can hold
- `refillRate`: Tokens added per second
- `consume(tokens?: number)`: Attempts to consume tokens. Returns `{ allowed: boolean; remaining: number; retryAfter?: number }`
- Tokens refill continuously (not in discrete intervals)
- Must handle edge cases: zero capacity, consume more than capacity, negative values

### 2. Sliding Window

Time-window-based rate limiting with smooth sliding behavior.

- `windowMs`: Window duration in milliseconds
- `maxRequests`: Maximum requests allowed within the window
- `check(key: string)`: Check if a request for the given key is allowed. Returns `{ allowed: boolean; remaining: number; resetAt: number }`
- Must support multiple independent keys (e.g., per-user, per-IP)
- Old entries must be cleaned up to prevent memory leaks

### 3. Fixed Window Counter

Simple counter-based rate limiting per fixed time window.

- `windowMs`: Window duration in milliseconds
- `maxRequests`: Maximum requests per window
- `check(key: string)`: Returns `{ allowed: boolean; remaining: number; resetAt: number }`
- Windows align to clock boundaries (e.g., if windowMs is 60000, windows start at :00, :01, etc.)
- Expired windows must be pruned

## Shared Interface

All limiters must implement a common `RateLimiter` interface:

```typescript
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;  // ms until next allowed request (only when denied)
  resetAt?: number;     // timestamp when the window/bucket resets
}

interface RateLimiter {
  check(key: string): RateLimitResult;
  reset(key?: string): void;  // reset one key or all
}
```

The `TokenBucket` operates as a single-key limiter (no key parameter needed for `consume()`, but must still implement `check(key)` by ignoring the key).

## Middleware Factory

Provide a `createRateLimitMiddleware` factory that wraps any `RateLimiter` and returns a function compatible with Express-style middleware signature:

```typescript
type Middleware = (req: { ip: string; headers: Record<string, string> }, res: { status: (code: number) => void; json: (body: unknown) => void }, next: () => void) => void;
```

- Extract key from `req.ip` by default, with option to provide custom key extractor
- Return 429 with `{ error: 'Too Many Requests', retryAfter }` when denied
- Call `next()` when allowed
- Set `X-RateLimit-Remaining` and `X-RateLimit-Reset` on the response headers (via `res.headers` if available, otherwise skip)

## Error Handling

- All configuration values must be validated at construction time
- Throw `RateLimiterError` (custom error class extending Error) with descriptive messages for:
  - Non-positive capacity/maxRequests/windowMs
  - Non-finite numbers
  - Invalid types

## Quality Requirements

- 100% test coverage
- All exports typed — no `any`
- JSDoc on all public APIs
- Zero external dependencies (only devDependencies)
- Must work with both ESM and CJS consumers (dual export via package.json)
