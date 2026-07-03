/**
 * Per-domain rate limiting for connect requests.
 *
 * Ported verbatim from v1 precision-engine `utils/fetch/rate-limiter.ts`
 * (counting semaphore + FIFO queue, Retry-After honouring). Prevents a batch of
 * `api_request` entries from overwhelming a single host.
 */

/** Rate-limit configuration. */
export interface RateLimitConfig {
  /** Maximum concurrent requests per domain. */
  per_domain: number;
  /** Minimum delay between requests to the same domain (ms). */
  delay_ms: number;
}

/** Default rate-limit configuration. */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = { per_domain: 2, delay_ms: 500 };

interface DomainState {
  active: number;
  last_request_at: number;
  queue: Array<{ resolve: (value: void) => void; reject: (error: Error) => void }>;
  retry_after?: number;
}

/** Per-domain rate limiter. */
export class RateLimiter {
  private domainStates: Map<string, DomainState> = new Map();
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
  }

  private getDomain(url: string): string {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;
      const port = parsed.port;
      const isStandardPort =
        (parsed.protocol === 'http:' && port === '80') ||
        (parsed.protocol === 'https:' && port === '443') ||
        port === '';
      return isStandardPort ? hostname : `${hostname}:${port}`;
    } catch {
      return url;
    }
  }

  private getState(domain: string): DomainState {
    let state = this.domainStates.get(domain);
    if (!state) {
      state = { active: 0, last_request_at: 0, queue: [] };
      this.domainStates.set(domain, state);
    }
    return state;
  }

  private processQueue(domain: string): void {
    const state = this.getState(domain);

    while (state.queue.length > 0 && state.active < this.config.per_domain) {
      if (state.retry_after && Date.now() < state.retry_after) {
        const delay = state.retry_after - Date.now();
        const t = setTimeout(() => this.processQueue(domain), delay);
        t.unref?.();
        return;
      }

      const timeSinceLastRequest = Date.now() - state.last_request_at;
      if (timeSinceLastRequest < this.config.delay_ms) {
        const delay = this.config.delay_ms - timeSinceLastRequest;
        const t = setTimeout(() => this.processQueue(domain), delay);
        t.unref?.();
        return;
      }

      const next = state.queue.shift();
      if (next) {
        state.active++;
        state.last_request_at = Date.now();
        next.resolve();
      }
    }
  }

  /** Acquire permission to make a request to `url`. */
  async acquire(url: string): Promise<void> {
    const domain = this.getDomain(url);
    const state = this.getState(domain);

    const timeSinceLastRequest = Date.now() - state.last_request_at;
    const needsDelay = state.last_request_at > 0 && timeSinceLastRequest < this.config.delay_ms;
    const needsRetryAfterWait = state.retry_after && Date.now() < state.retry_after;

    if (state.active < this.config.per_domain && !needsDelay && !needsRetryAfterWait) {
      state.active++;
      state.last_request_at = Date.now();
      return;
    }

    return new Promise<void>((resolve, reject) => {
      state.queue.push({ resolve, reject });
      this.processQueue(domain);
    });
  }

  /** Release a slot after a request completes, honouring Retry-After. */
  release(url: string, response?: Response): void {
    const domain = this.getDomain(url);
    const state = this.getState(domain);

    state.active = Math.max(0, state.active - 1);

    if (response) {
      const retryAfter = this.parseRetryAfter(response);
      if (retryAfter) {state.retry_after = Date.now() + retryAfter;}
    }

    this.processQueue(domain);
  }

  private parseRetryAfter(response: Response): number | null {
    const retryAfter = response.headers.get('retry-after');
    if (!retryAfter) {return null;}

    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds) && seconds > 0) {return seconds * 1000;}

    const date = new Date(retryAfter);
    const delay = date.getTime() - Date.now();
    return delay > 0 ? delay : null;
  }

  /** Execute `fn` under the rate limit, acquiring and releasing a slot. */
  async execute<T>(url: string, fn: () => Promise<T>): Promise<T> {
    await this.acquire(url);
    try {
      const result = await fn();
      if (result instanceof Response) {
        this.release(url, result);
      } else {
        this.release(url);
      }
      return result;
    } catch (error) {
      this.release(url);
      throw error;
    }
  }

  /** Current stats for a domain (debugging). */
  getStats(url: string): {
    domain: string;
    active: number;
    queued: number;
    last_request_at: number;
    retry_after?: number;
  } {
    const domain = this.getDomain(url);
    const state = this.getState(domain);
    return {
      domain,
      active: state.active,
      queued: state.queue.length,
      last_request_at: state.last_request_at,
      retry_after: state.retry_after,
    };
  }

  /** Clear all rate-limit state (rejecting queued waiters). */
  reset(): void {
    for (const state of this.domainStates.values()) {
      for (const item of state.queue) {item.reject(new Error('Rate limiter was reset'));}
    }
    this.domainStates.clear();
  }

  /** Update rate-limit config (does not affect queued requests). */
  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/** Global singleton rate limiter. */
export const globalRateLimiter = new RateLimiter();

/**
 * Execute a fetch under the global rate limiter.
 * @param url - URL to fetch
 * @param options - fetch options
 * @param config - optional per-call rate-limit override
 */
export async function rateLimitedFetch(
  url: string,
  options?: RequestInit,
  config?: Partial<RateLimitConfig>,
): Promise<Response> {
  if (config) {globalRateLimiter.updateConfig(config);}
  return globalRateLimiter.execute(url, () => fetch(url, options));
}
