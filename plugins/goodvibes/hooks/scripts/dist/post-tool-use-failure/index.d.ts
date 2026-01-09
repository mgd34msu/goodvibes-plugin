/**
 * Post Tool Use Failure Hook (GoodVibes)
 *
 * Runs when a tool call fails.
 * Implements 3-phase fix loop with progressive research hints:
 *   Phase 1: Raw attempts with existing knowledge
 *   Phase 2: Include official documentation search hints
 *   Phase 3: Include community documentation search hints
 */
/** Main entry point for post-tool-use-failure hook. Implements progressive fix loop with research hints. */
declare function runPostToolUseFailureHook(): Promise<void>;
export type { ErrorSeverity, RecoveryPattern } from './recovery-types.js';
export { RECOVERY_PATTERNS } from './recovery-patterns.js';
export { findMatchingPattern, findAllMatchingPatterns, getHighestSeverity, getSuggestedFix, } from './pattern-matcher.js';
export { getResearchHints } from './research-hints.js';
export { loadRetries, saveRetry, getRetryCount, getCurrentPhase, shouldEscalatePhase, escalatePhase, hasExhaustedRetries, getPhaseDescription, getRemainingAttempts, generateErrorSignature, clearRetry, pruneOldRetries, getRetryStats, type RetryEntry, type RetryData, } from './retry-tracker.js';
export { runPostToolUseFailureHook };
