/**
 * Score Evaluator — WRFC Plugin (Layer 3)
 *
 * Parses review scores from agent output and evaluates them against
 * configured thresholds. Extracted from wrfc-handlers.ts to enable
 * reuse across handlers without coupling to the directive queue.
 */

import { parseGvTag } from '../../extensions/directives/gv-tag-parser.js';
import { safeJsonParse } from '../../shared/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Result of evaluating a review score against a threshold.
 */
export interface ScoreResult {
  /** Parsed numeric score (0-10). */
  score: number;
  /** Whether the score meets or exceeds the threshold. */
  pass: boolean;
  /** Per-dimension breakdown when available. */
  dimensions?: Record<string, number>;
  /** Number of issues flagged by the reviewer. */
  issues_count?: number;
}

// ─── Score Extraction ─────────────────────────────────────────────────────────

/**
 * Extracts and validates a review score from raw agent output text.
 *
 * Tries <gv> JSON tag first (preferred), falls back to legacy
 * `SCORE: N/10` regex for backward compatibility.
 *
 * @param text - Raw output from a reviewer agent.
 * @returns Parsed score in [0, 10], or null if not found.
 */
export function extractScore(text: string | undefined | null): number | null {
  if (!text) return null;

  // Primary: <gv>{"score": N}</gv> tag
  const result = parseGvTag(text);
  if (result.found && result.data?.score !== undefined) {
    return Math.max(0, Math.min(10, result.data.score));
  }

  // Fallback: legacy regex format
  const SCORE_REGEX = /SCORE:\s*(\d+(?:\.\d+)?)\/10/i;
  const match = text.match(SCORE_REGEX);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Parses a <gv> tag string (already extracted content) into a ScoreResult.
 *
 * Public API for external consumers (e.g. analytics dashboards, custom review
 * hooks) that have already extracted the raw <gv> tag content and want a
 * typed ScoreResult without going through the full agent output pipeline.
 * Internal handlers use extractScore() + evaluateScore() instead.
 *
 * @param gvContent - JSON string from inside a <gv> tag.
 * @param threshold - Minimum passing score.
 * @returns ScoreResult, or null if parsing fails.
 */
export function parseScoreFromGvTag(gvContent: string, threshold: number): ScoreResult | null {
  const data = safeJsonParse<Record<string, unknown>>(gvContent, {});
  try {
    if (typeof data.score !== 'number') return null;

    const score = Math.max(0, Math.min(10, data.score));
    const pass = score >= threshold;

    const result: ScoreResult = { score, pass };

    if (typeof data.count === 'number') {
      result.issues_count = data.count;
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Evaluates raw agent output against a score threshold.
 *
 * Public API for external consumers (e.g. custom triggers, analytics hooks)
 * that need a structured pass/fail result from raw agent output. Returns a
 * guaranteed ScoreResult even when parsing fails (score: -1, pass: false).
 * Internal handlers use extractScore() directly when they need null-on-failure.
 *
 * @param reviewOutput - Raw output from a reviewer agent (string or unknown).
 * @param threshold    - Minimum score required to pass (e.g. 9.9).
 * @returns ScoreResult with score and pass/fail determination.
 *          score is -1 and pass is false if parsing fails.
 */
export function evaluateScore(reviewOutput: unknown, threshold: number): ScoreResult {
  const text = typeof reviewOutput === 'string' ? reviewOutput : null;
  const score = extractScore(text);

  if (score === null) {
    return { score: -1, pass: false };
  }

  return {
    score,
    pass: score >= threshold,
  };
}
