import type { RateLimiterConfig } from './types.js';

// ---------------------------------------------------------------------------
// Built-in presets
// ---------------------------------------------------------------------------

/**
 * Ready-to-use rate limit configurations for common scenarios.
 *
 * All presets are immutable. Use fromPreset() to derive a customised copy.
 */
export const PRESETS = {
  /**
   * Standard API client: 100 requests per minute with token-bucket smoothing.
   * Allows short bursts up to the bucket capacity.
   */
  API_STANDARD: {
    algorithm: 'token-bucket',
    maxRequests: 100,
    windowMs: 60_000,
    tokenBucketCapacity: 100,
    tokenBucketRefillRate: 100 / 60, // ~1.67 tokens/second
  },

  /**
   * Burst-tolerant API: 20 requests per second, fixed window.
   * Suitable for high-throughput clients that batch work in sub-second windows.
   */
  API_BURST: {
    algorithm: 'fixed-window',
    maxRequests: 20,
    windowMs: 1_000,
  },

  /**
   * Agent spawn limiter: 6 spawns per minute, sliding window.
   * Prevents runaway agent creation while allowing steady cadence.
   */
  AGENT_SPAWN: {
    algorithm: 'sliding-window',
    maxRequests: 6,
    windowMs: 60_000,
  },

  /**
   * Tool call limiter: 60 tool calls per minute, sliding window.
   * Smooth, no bursty spikes — sliding window provides constant rate.
   */
  TOOL_CALL: {
    algorithm: 'sliding-window',
    maxRequests: 60,
    windowMs: 60_000,
  },

  /**
   * Generous limit for low-risk operations: 1000 requests per minute.
   * Token bucket with full capacity allows significant bursting.
   */
  GENEROUS: {
    algorithm: 'token-bucket',
    maxRequests: 1_000,
    windowMs: 60_000,
    tokenBucketCapacity: 1_000,
    tokenBucketRefillRate: 1_000 / 60, // ~16.67 tokens/second
  },
} as const satisfies Record<string, RateLimiterConfig> as Record<string, RateLimiterConfig>;

// ---------------------------------------------------------------------------
// fromPreset factory
// ---------------------------------------------------------------------------

/**
 * Return a preset config by name, optionally merging caller-supplied overrides.
 *
 * @param name    - One of the PRESETS keys (e.g. 'API_STANDARD')
 * @param overrides - Optional partial config to merge on top of the preset
 * @throws {Error} if name is not a recognised preset
 *
 * @example
 * const cfg = fromPreset('API_STANDARD', { maxRequests: 200 });
 */
export function fromPreset(
  name: string,
  overrides: Partial<RateLimiterConfig> = {},
): RateLimiterConfig {
  const preset = PRESETS[name];
  if (!preset) {
    throw new Error(
      `Unknown preset '${name}'. Available presets: ${Object.keys(PRESETS).join(', ')}`,
    );
  }
  return { ...preset, ...overrides };
}
