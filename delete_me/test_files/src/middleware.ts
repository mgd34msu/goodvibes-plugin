/**
 * Express-compatible middleware factory for rate limiting.
 */

import { RateLimiter } from './types.js';

/**
 * Minimal Express-style request shape the middleware operates on.
 */
export interface MiddlewareRequest {
  /** Client IP address used as the default rate limit key. */
  ip: string;
  /** Request headers map. */
  headers: Record<string, string>;
}

/**
 * Minimal Express-style response shape the middleware operates on.
 */
export interface MiddlewareResponse {
  /** Set the HTTP status code. */
  status: (code: number) => void;
  /** Send a JSON body. */
  json: (body: unknown) => void;
  /** Optional response headers map for setting rate limit headers. */
  headers?: Record<string, string>;
}

/**
 * Express-style middleware function signature.
 */
export type Middleware = (
  req: MiddlewareRequest,
  res: MiddlewareResponse,
  next: () => void,
) => void;

/**
 * Options for {@link createRateLimitMiddleware}.
 */
export interface MiddlewareOptions {
  /**
   * Custom function to extract a rate limit key from the request.
   * Defaults to using `req.ip`.
   */
  keyExtractor?: (req: MiddlewareRequest) => string;
}

/**
 * Create an Express-style rate limiting middleware from any {@link RateLimiter}.
 *
 * When a request is allowed, the `next` callback is invoked and
 * `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers are set on the
 * response (when `res.headers` is available).
 *
 * When a request is denied, the middleware responds with HTTP 429 and a JSON
 * body containing `{ error: 'Too Many Requests', retryAfter }`.
 *
 * @param limiter - Any object implementing the {@link RateLimiter} interface.
 * @param options - Optional middleware configuration.
 * @returns An Express-compatible middleware function.
 *
 * @example
 * ```ts
 * const limiter = new SlidingWindowLimiter({ windowMs: 60_000, maxRequests: 100 });
 * app.use(createRateLimitMiddleware(limiter));
 * ```
 */
export function createRateLimitMiddleware(
  limiter: RateLimiter,
  options: MiddlewareOptions = {},
): Middleware {
  const extractKey = options.keyExtractor ?? ((req: MiddlewareRequest) => req.ip);

  return (req: MiddlewareRequest, res: MiddlewareResponse, next: () => void): void => {
    const key = extractKey(req);
    const result = limiter.check(key);

    if (result.allowed) {
      // Attach rate limit headers when the response supports them.
      if (res.headers !== undefined) {
        res.headers['X-RateLimit-Remaining'] = String(result.remaining);
        if (result.resetAt !== undefined) {
          res.headers['X-RateLimit-Reset'] = String(result.resetAt);
        }
      }
      next();
    } else {
      res.status(429);
      res.json({
        error: 'Too Many Requests',
        retryAfter: result.retryAfter,
      });
    }
  };
}
