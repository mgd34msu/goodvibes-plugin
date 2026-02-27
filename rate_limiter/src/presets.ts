import type { IStore } from './types.js';
import { RateLimiter } from './rate-limiter.js';

/**
 * Named presets for common rate-limiting scenarios.
 *
 * Each preset defines an algorithm and its configuration. Use `fromPreset`
 * to instantiate a configured RateLimiter from a preset name.
 *
 * @example
 * const limiter = fromPreset('API_STANDARD');
 * const result = await limiter.consume('user:42');
 */
export const PRESETS = {
  /**
   * Standard API rate limit: 100 token bucket capacity, refilling at 10/s.
   * Suitable for most general-purpose API endpoints.
   */
  API_STANDARD: {
    algorithm: 'tokenBucket' as const,
    capacity: 100,
    refillRate: 10,
  },

  /**
   * Burst-tolerant API rate limit: 500 token bucket capacity, refilling at 50/s.
   * Suitable for endpoints that receive bursty traffic patterns.
   */
  API_BURST: {
    algorithm: 'tokenBucket' as const,
    capacity: 500,
    refillRate: 50,
  },

  /**
   * Agent spawn limit: max 10 spawns per 60-second fixed window.
   * Suitable for controlling how frequently agents can be created.
   */
  AGENT_SPAWN: {
    algorithm: 'fixedWindow' as const,
    maxRequests: 10,
    windowMs: 60_000,
  },

  /**
   * Tool call limit: max 60 calls per 60-second sliding window.
   * Provides smooth, accurate limiting for tool invocations.
   */
  TOOL_CALL: {
    algorithm: 'slidingWindow' as const,
    maxRequests: 60,
    windowMs: 60_000,
  },

  /**
   * Generous rate limit: 1000 token bucket capacity, refilling at 100/s.
   * Suitable for internal services or trusted callers.
   */
  GENEROUS: {
    algorithm: 'tokenBucket' as const,
    capacity: 1000,
    refillRate: 100,
  },
} as const;

/** Union of valid preset names. */
export type PresetName = keyof typeof PRESETS;

/**
 * Creates a RateLimiter from a named preset configuration.
 *
 * Picks the algorithm and parameters from the preset, optionally using the
 * provided store. Falls back to MemoryStore when no store is supplied.
 *
 * @param name - The preset name (key of `PRESETS`).
 * @param store - Optional backing store. Defaults to MemoryStore.
 * @returns A fully configured RateLimiter instance.
 *
 * @example
 * // Use a preset with the default in-memory store
 * const limiter = fromPreset('TOOL_CALL');
 *
 * // Use a preset with a custom store
 * const limiter = fromPreset('API_STANDARD', redisStore);
 */
export function fromPreset(name: PresetName, store?: IStore): RateLimiter {
  const preset = PRESETS[name];

  switch (preset.algorithm) {
    case 'tokenBucket':
      return RateLimiter.tokenBucket({
        capacity: preset.capacity,
        refillRate: preset.refillRate,
        ...(store ? { store } : {}),
      });

    case 'fixedWindow':
      return RateLimiter.fixedWindow({
        maxRequests: preset.maxRequests,
        windowMs: preset.windowMs,
        ...(store ? { store } : {}),
      });

    case 'slidingWindow':
      return RateLimiter.slidingWindow({
        maxRequests: preset.maxRequests,
        windowMs: preset.windowMs,
        ...(store ? { store } : {}),
      });

    default: {
      // Exhaustive check — TypeScript will catch unhandled algorithm types.
      const _exhaustive: never = preset;
      throw new Error(`Unknown preset algorithm: ${(_exhaustive as { algorithm: string }).algorithm}`);
    }
  }
}
