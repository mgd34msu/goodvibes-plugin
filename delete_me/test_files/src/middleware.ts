/**
 * Middleware factory for integrating any RateLimiter with HTTP frameworks.
 */

import type { RateLimiter, RateLimitResult } from './types.js';

/** Minimal HTTP request shape expected by the middleware. */
export interface MiddlewareRequest {
  ip: string;
  headers: Record<string, string>;
}

/** Minimal HTTP response shape expected by the middleware. */
export interface MiddlewareResponse {
  status(code: number): void;
  json(body: unknown): void;
  headers?: Record<string, string>;
}

/** Express-style middleware function signature. */
export type Middleware = (
  req: MiddlewareRequest,
  res: MiddlewareResponse,
  next: () => void
) => void;

export interface RateLimitMiddlewareOptions {
  /** The rate limiter instance to use. */
  limiter: RateLimiter;
  /**
   * Custom key extractor. Defaults to `req.ip`.
   * @param req - The incoming request
   */
  keyExtractor?: (req: MiddlewareRequest) => string;
}

/**
 * Create an Express-compatible rate limiting middleware.
 *
 * Sets `X-RateLimit-Remaining` and `X-RateLimit-Reset` response headers when
 * the response object supports them. Returns 429 with a JSON body when the
 * request is denied.
 *
 * @param options - Configuration options
 * @returns Express-style middleware function
 *
 * @example
 * ```ts
 * const middleware = createRateLimitMiddleware({
 *   limiter: new SlidingWindow({ windowMs: 60_000, maxRequests: 100 }),
 * });
 * app.use(middleware);
 * ```
 */
export function createRateLimitMiddleware(options: RateLimitMiddlewareOptions): Middleware {
  const { limiter, keyExtractor } = options;
  const getKey = keyExtractor ?? ((req: MiddlewareRequest) => req.ip);

  return function rateLimitMiddleware(
    req: MiddlewareRequest,
    res: MiddlewareResponse,
    next: () => void
  ): void {
    const key = getKey(req);
    const result: RateLimitResult = limiter.check(key);

    // Set rate limit headers if the response supports them.
    if (res.headers !== undefined) {
      res.headers['X-RateLimit-Remaining'] = String(result.remaining);
      if (result.resetAt !== undefined) {
        res.headers['X-RateLimit-Reset'] = String(result.resetAt);
      }
    }

    if (!result.allowed) {
      res.status(429);
      res.json({
        error: 'Too Many Requests',
        retryAfter: result.retryAfter,
      });
      return;
    }

    next();
  };
}
