/**
 * Retry engine for precision_exec.
 * Implements automatic retry with backoff for transient failures.
 */

import { DetectedIssue, IssueType, detectIssue, isRetryable } from './lock-detection.js';

export type RetryCategory = 'network' | 'lock' | 'busy' | 'oom';

export interface RetryConfig {
  max: number;                          // Max retry attempts (default: 3)
  delay_ms: number;                     // Base delay (default: 1000)
  backoff: 'fixed' | 'exponential';     // Strategy (default: 'exponential')
  on: RetryCategory[];                  // Categories to retry on (default: ['network', 'lock', 'busy'])
}

export interface RetryResult {
  attempts: number;          // Total attempts (1 = no retries needed)
  reason?: string;           // Why retries were needed
  delays: number[];          // Actual delays applied
  final_issue?: string;      // Last detected issue type if still failing
}

// Category to IssueType mapping
export const RETRY_CATEGORY_MAP: Record<RetryCategory, Set<IssueType>> = {
  network: new Set(['connection_refused', 'network_timeout', 'dns_failure']),
  lock: new Set(['git_index_lock', 'npm_lock_conflict']),
  busy: new Set(['resource_busy']),
  oom: new Set(['out_of_memory']),
};

/**
 * Parse and validate retry configuration from raw input.
 * Returns null if retry is not requested (raw is falsy/undefined).
 * Returns default config if raw is {} (empty object).
 */
export function parseRetryConfig(raw: unknown): RetryConfig | null {
  // If raw is falsy/undefined, retry not requested
  if (!raw) {
    return null;
  }

  // If raw is not an object, invalid
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // Default config
  const defaults: RetryConfig = {
    max: 3,
    delay_ms: 1000,
    backoff: 'exponential',
    on: ['network', 'lock', 'busy'],
  };

  // Parse max
  let max = defaults.max;
  if ('max' in obj || 'max_attempts' in obj) {
    const rawMax = obj.max ?? obj.max_attempts;
    if (typeof rawMax === 'number' && rawMax >= 1 && rawMax <= 10) {
      max = Math.floor(rawMax);
    } else if (typeof rawMax === 'number') {
      // Clamp to valid range
      max = Math.max(1, Math.min(10, Math.floor(rawMax)));
    }
  }

  // Parse delay_ms
  let delay_ms = defaults.delay_ms;
  if ('delay_ms' in obj) {
    const rawDelay = obj.delay_ms;
    if (typeof rawDelay === 'number' && rawDelay >= 100) {
      delay_ms = Math.floor(rawDelay);
    } else if (typeof rawDelay === 'number') {
      // Enforce minimum
      delay_ms = Math.max(100, Math.floor(rawDelay));
    }
  }

  // Parse backoff
  let backoff: 'fixed' | 'exponential' = defaults.backoff;
  if ('backoff' in obj) {
    const rawBackoff = obj.backoff;
    if (rawBackoff === 'fixed' || rawBackoff === 'exponential') {
      backoff = rawBackoff;
    }
  }

  // Parse on categories
  let on = defaults.on;
  if ('on' in obj) {
    const rawOn = obj.on;
    if (Array.isArray(rawOn)) {
      const validCategories = rawOn.filter(
        (cat): cat is RetryCategory =>
          typeof cat === 'string' &&
          ['network', 'lock', 'busy', 'oom'].includes(cat)
      );
      if (validCategories.length > 0) {
        on = validCategories;
      }
    }
  }

  return { max, delay_ms, backoff, on };
}

/**
 * Determine if a command should be retried based on issue and config.
 */
export function shouldRetry(
  issue: DetectedIssue | null,
  config: RetryConfig,
  attempt: number
): { retry: boolean; delay_ms: number; reason: string } {
  // If max attempts reached
  if (attempt >= config.max) {
    return {
      retry: false,
      delay_ms: 0,
      reason: 'max attempts reached',
    };
  }

  // If no issue detected
  if (!issue) {
    return {
      retry: false,
      delay_ms: 0,
      reason: 'no matching error pattern',
    };
  }

  // Check if issue type maps to any of the retry categories
  const matchesCategory = config.on.some((category) => {
    const issueTypes = RETRY_CATEGORY_MAP[category];
    return issueTypes.has(issue.type);
  });

  if (!matchesCategory) {
    return {
      retry: false,
      delay_ms: 0,
      reason: 'issue type not in retry categories',
    };
  }

  // Compute delay and return retry decision
  const delay_ms = computeDelay(config, attempt);
  return {
    retry: true,
    delay_ms,
    reason: `retrying after ${issue.type} (attempt ${attempt + 1}/${config.max})`,
  };
}

/**
 * Compute delay for retry based on strategy.
 */
export function computeDelay(config: RetryConfig, attempt: number): number {
  if (config.backoff === 'fixed') {
    return config.delay_ms;
  }

  // Exponential backoff: delay_ms * 2^attempt, capped at 30000ms
  const exponentialDelay = config.delay_ms * Math.pow(2, attempt);
  return Math.min(exponentialDelay, 30000);
}
