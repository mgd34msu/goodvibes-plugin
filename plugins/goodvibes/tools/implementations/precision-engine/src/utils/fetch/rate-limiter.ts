/**
 * Per-domain rate limiting for fetch operations
 * Prevents overwhelming servers with too many concurrent requests
 */



/**
 * Configuration for rate limiting
 */
export interface RateLimitConfig {
  /** Maximum concurrent requests per domain */
  per_domain: number;
  /** Minimum delay between requests to same domain (ms) */
  delay_ms: number;
}

/**
 * Default rate limit configuration
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  per_domain: 2,
  delay_ms: 500,
};

/**
 * Per-domain state for tracking active requests and delays
 */
interface DomainState {
  /** Number of currently active requests */
  active: number;
  /** Timestamp when last request completed */
  last_request_at: number;
  /** Queue of pending requests */
  queue: Array<{
    resolve: (value: void) => void;
    reject: (error: Error) => void;
  }>;
  /** Retry-After timestamp if domain requested backoff */
  retry_after?: number;
}

/**
 * Per-domain rate limiter using counting semaphore with FIFO queue
 */
export class RateLimiter {
  private domainStates: Map<string, DomainState> = new Map();
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
  }

  /**
   * Extract domain from URL for rate limiting
   * Returns hostname:port if port is non-standard, otherwise just hostname
   */
  private getDomain(url: string): string {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;
      const port = parsed.port;
      
      // Exclude standard ports (80/443) from domain key
      const isStandardPort = 
        (parsed.protocol === 'http:' && port === '80') ||
        (parsed.protocol === 'https:' && port === '443') ||
        port === '';
      
      return isStandardPort ? hostname : `${hostname}:${port}`;
    } catch (error) {
      // If URL parsing fails, use the URL itself as the domain
      return url;
    }
  }

  /**
   * Get or create domain state
   */
  private getState(domain: string): DomainState {
    let state = this.domainStates.get(domain);
    if (!state) {
      state = {
        active: 0,
        last_request_at: 0,
        queue: [],
      };
      this.domainStates.set(domain, state);
    }
    return state;
  }

  /**
   * Process next queued request if capacity allows
   */
  private processQueue(domain: string): void {
    const state = this.getState(domain);
    
    while (state.queue.length > 0 && state.active < this.config.per_domain) {
      // Check if we need to wait for Retry-After
      if (state.retry_after && Date.now() < state.retry_after) {
        // Schedule retry after the backoff expires
        const delay = state.retry_after - Date.now();
        setTimeout(() => this.processQueue(domain), delay);
        return;
      }
      
      // Check if we need to wait for delay_ms
      const timeSinceLastRequest = Date.now() - state.last_request_at;
      if (timeSinceLastRequest < this.config.delay_ms) {
        const delay = this.config.delay_ms - timeSinceLastRequest;
        setTimeout(() => this.processQueue(domain), delay);
        return;
      }
      
      // Capacity available and delay satisfied — process next request
      const next = state.queue.shift();
      if (next) {
        state.active++;
        state.last_request_at = Date.now();
        next.resolve();
      }
    }
  }

  /**
   * Acquire permission to make a request to the given URL
   * Returns a promise that resolves when the request can proceed
   * 
   * @param url - The URL to request
   * @returns Promise that resolves when request can proceed
   */
  async acquire(url: string): Promise<void> {
    const domain = this.getDomain(url);
    const state = this.getState(domain);
    
    // If we have capacity and no required delay, proceed immediately
    const timeSinceLastRequest = Date.now() - state.last_request_at;
    const needsDelay = state.last_request_at > 0 && timeSinceLastRequest < this.config.delay_ms;
    const needsRetryAfterWait = state.retry_after && Date.now() < state.retry_after;
    
    if (state.active < this.config.per_domain && !needsDelay && !needsRetryAfterWait) {
      state.active++;
      state.last_request_at = Date.now();
      return;
    }
    
    // Need to wait — add to queue
    return new Promise<void>((resolve, reject) => {
      state.queue.push({ resolve, reject });
      
      // Try to process queue (will schedule timer if needed)
      this.processQueue(domain);
    });
  }

  /**
   * Release a slot after request completes
   * 
   * @param url - The URL that was requested
   * @param response - Optional Response object to check for Retry-After header
   */
  release(url: string, response?: Response): void {
    const domain = this.getDomain(url);
    const state = this.getState(domain);
    
    // Decrement active count
    state.active = Math.max(0, state.active - 1);
    
    // Check for Retry-After header
    if (response) {
      const retryAfter = this.parseRetryAfter(response);
      if (retryAfter) {
        state.retry_after = Date.now() + retryAfter;
      }
    }
    
    // Process next queued request
    this.processQueue(domain);
  }

  /**
   * Parse Retry-After header value
   * Supports both delay-seconds and HTTP-date formats
   * 
   * @param response - Response object to check
   * @returns Delay in milliseconds, or null if no Retry-After header
   */
  private parseRetryAfter(response: Response): number | null {
    const retryAfter = response.headers.get('retry-after');
    if (!retryAfter) {
      return null;
    }
    
    // Try parsing as delay-seconds (integer)
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds) && seconds > 0) {
      return seconds * 1000;
    }
    
    // Try parsing as HTTP-date
    const date = new Date(retryAfter);
    const delay = date.getTime() - Date.now();
    return delay > 0 ? delay : null;
  }

  /**
   * Execute a function with rate limiting
   * Automatically acquires slot, executes function, and releases slot
   * 
   * @param url - The URL being requested
   * @param fn - Async function to execute (should return Response or throw)
   * @returns Promise resolving to the function's return value
   */
  async execute<T>(
    url: string,
    fn: () => Promise<T>
  ): Promise<T> {
    await this.acquire(url);
    
    try {
      const result = await fn();
      
      // If result is a Response, pass it to release for Retry-After checking
      if (result instanceof Response) {
        this.release(url, result);
      } else {
        this.release(url);
      }
      
      return result;
    } catch (error) {
      // Release slot even on error
      this.release(url);
      throw error;
    }
  }

  /**
   * Get current statistics for a domain
   * Useful for debugging and monitoring
   * 
   * @param url - URL to check (domain will be extracted)
   * @returns Statistics about the domain's rate limiting state
   */
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

  /**
   * Clear all rate limiting state
   * Useful for testing or resetting between batches
   */
  reset(): void {
    // Reject all queued requests
    for (const state of this.domainStates.values()) {
      for (const item of state.queue) {
        item.reject(new Error('Rate limiter was reset'));
      }
    }
    
    this.domainStates.clear();
  }

  /**
   * Update rate limit configuration
   * Does not affect requests already in queue
   * 
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Global singleton rate limiter instance
 * Can be used across multiple fetch operations
 */
export const globalRateLimiter = new RateLimiter();

/**
 * Helper function to execute a fetch with rate limiting
 * Uses the global rate limiter instance
 * 
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param config - Optional rate limit configuration (uses global config if not provided)
 * @returns Promise resolving to Response
 */
export async function rateLimitedFetch(
  url: string,
  options?: RequestInit,
  config?: Partial<RateLimitConfig>
): Promise<Response> {
  if (config) {
    globalRateLimiter.updateConfig(config);
  }
  return globalRateLimiter.execute(url, () => fetch(url, options));
}
