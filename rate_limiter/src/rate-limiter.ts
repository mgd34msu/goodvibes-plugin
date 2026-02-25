/**
 * Token bucket rate limiter implementation.
 *
 * Uses lazy refill: tokens are calculated based on elapsed time whenever
 * the bucket is accessed, avoiding the need for a background interval.
 */
export class TokenBucketRateLimiter {
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private readonly refillInterval: number;

  private currentTokens: number;
  private lastRefillTime: number;

  /**
   * @param maxTokens - Maximum token capacity of the bucket
   * @param refillRate - Tokens added per second
   * @param refillInterval - Refill check interval in ms (default: 1000)
   */
  constructor(
    maxTokens: number,
    refillRate: number,
    refillInterval: number = 1000
  ) {
    if (maxTokens <= 0) {
      throw new RangeError(`maxTokens must be positive, got ${maxTokens}`);
    }
    if (refillRate <= 0) {
      throw new RangeError(`refillRate must be positive, got ${refillRate}`);
    }
    if (refillInterval <= 0) {
      throw new RangeError(`refillInterval must be positive, got ${refillInterval}`);
    }

    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.refillInterval = refillInterval;
    this.currentTokens = maxTokens;
    this.lastRefillTime = Date.now();
  }

  /** Calculate and apply token refill based on elapsed time. */
  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefillTime;
    if (elapsedMs > 0) {
      const tokensToAdd = (elapsedMs / 1000) * this.refillRate;
      this.currentTokens = Math.min(
        this.maxTokens,
        this.currentTokens + tokensToAdd
      );
      this.lastRefillTime = now;
    }
  }

  /**
   * Attempt to consume tokens from the bucket.
   *
   * @param tokens - Number of tokens to consume (default: 1)
   * @returns `true` if tokens were consumed, `false` if insufficient tokens
   */
  tryConsume(tokens: number = 1): boolean {
    const amount = Math.max(0, tokens);
    this.refill();

    if (amount === 0) {
      return true;
    }

    if (this.currentTokens >= amount) {
      this.currentTokens -= amount;
      return true;
    }

    return false;
  }

  /**
   * Get the current number of available tokens (floored to integer).
   *
   * @returns Current integer token count
   */
  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.currentTokens);
  }

  /**
   * Reset the bucket to full capacity.
   */
  reset(): void {
    this.currentTokens = this.maxTokens;
    this.lastRefillTime = Date.now();
  }

  /**
   * Wait asynchronously until the requested number of tokens are available,
   * then consume them.
   *
   * @param tokens - Number of tokens to wait for (default: 1)
   * @returns Promise that resolves when tokens have been consumed
   */
  waitForTokens(tokens: number = 1): Promise<void> {
    return new Promise<void>((resolve) => {
      const attempt = (): void => {
        if (this.tryConsume(tokens)) {
          resolve();
        } else {
          setTimeout(attempt, this.refillInterval);
        }
      };
      attempt();
    });
  }
}
