import type { RateLimiter } from './types.js';

/**
 * Minimal Express-style request type accepted by the middleware.
 */
export interface MiddlewareRequest {
  ip: string;
  headers: Record<string, string>;
}

/**
 * Minimal Express-style response type accepted by the middleware.
 */
export interface MiddlewareResponse {
  status(code: number): void;
  json(body: unknown): void;
  /** Optional headers object. When present, rate-limit headers are written to it. */
  headers?: Record<string, string>;
}

/** Express-style middleware function signature. */
export type Middleware = (
  req: MiddlewareRequest,
  res: MiddlewareResponse,
  next: () => void,
) => void;

/** Options for {@link createRateLimitMiddleware}. */
export interface RateLimitMiddlewareOptions {
  /**
   * Custom key extractor. Defaults to `(req) => req.ip`.
   * @param req - The incoming request
   */
  keyExtractor?: (req: MiddlewareRequest) => string;
}

/**
 * Factory that wraps any {@link RateLimiter} into an Express-style middleware.
 *
 * When a request is denied (429) the response body is:
 * `{ error: 'Too Many Requests', retryAfter: <ms> }`
 *
 * When allowed, the following headers are set on `res.headers` if it exists:
 * - `X-RateLimit-Remaining`
 * - `X-RateLimit-Reset`
 *
 * @param limiter - Any object implementing the {@link RateLimiter} interface
 * @param options - Optional configuration
 * @returns Express-compatible middleware function
 *
 * @example
 * ```ts
 * const limiter = new SlidingWindowLimiter({ windowMs: 60_000, maxRequests: 100 });
 * app.use(createRateLimitMiddleware(limiter));
 * ```
 */
export function createRateLimitMiddleware(
  limiter: RateLimiter,
  options: RateLimitMiddlewareOptions = {},
): Middleware {
  const { keyExtractor = (req: MiddlewareRequest) => req.ip } = options;

  return (req: MiddlewareRequest, res: MiddlewareResponse, next: () => void): void => {
    const key = keyExtractor(req);
    const result = limiter.check(key);

    if (!result.allowed) {
      res.status(429);
      res.json({ error: 'Too Many Requests', retryAfter: result.retryAfter });
      return;
    }

    // Set informational headers when the response object supports them
    if (res.headers !== undefined) {
      res.headers['X-RateLimit-Remaining'] = String(result.remaining);
      if (result.resetAt !== undefined) {
        res.headers['X-RateLimit-Reset'] = String(result.resetAt);
      }
    }

    next();
  };
}
