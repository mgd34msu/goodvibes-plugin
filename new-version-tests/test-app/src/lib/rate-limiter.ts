/**
 * In-memory rate limiter for API endpoints
 * Tracks requests per IP address with configurable windows and limits
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if request should be rate limited
   * @returns true if rate limit exceeded, false otherwise
   */
  check(key: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      // New window or expired entry
      this.store.set(key, {
        count: 1,
        resetAt: now + config.windowMs,
      });
      return false;
    }

    if (entry.count >= config.maxRequests) {
      return true; // Rate limit exceeded
    }

    // Increment counter
    entry.count++;
    return false;
  }

  /**
   * Get remaining requests and reset time for a key
   */
  getInfo(key: string, config: RateLimitConfig): { remaining: number; resetAt: number } {
    const entry = this.store.get(key);
    const now = Date.now();

    if (!entry || now > entry.resetAt) {
      return {
        remaining: config.maxRequests,
        resetAt: now + config.windowMs,
      };
    }

    return {
      remaining: Math.max(0, config.maxRequests - entry.count),
      resetAt: entry.resetAt,
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clear all entries (useful for testing)
   */
  reset(): void {
    this.store.clear();
  }

  /**
   * Cleanup interval on shutdown
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();

/**
 * Default rate limit configs for different endpoints
 */
export const RATE_LIMITS = {
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 5 }, // 5 requests per 15 minutes
  api: { windowMs: 60 * 1000, maxRequests: 100 }, // 100 requests per minute
  strict: { windowMs: 60 * 1000, maxRequests: 10 }, // 10 requests per minute
} as const;
