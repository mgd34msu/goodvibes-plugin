/**
 * Test-Fix Handlers — Compatibility Stubs
 *
 * The L2 test-then-fix workflow handlers (registerTestFixHandlers) have been
 * removed. WRFC event routing now flows exclusively through the L3 plugin
 * pipeline (plugins/wrfc).
 *
 * This file is retained only to export `parseGvTestResult`, a utility function
 * still used by external consumers and its own test suite.
 */

import { parseGvTag } from './gv-tag-parser.js';

/** Synthetic score assigned when tests pass. Binary outcome — NOT a review quality threshold. */
const SYNTHETIC_PASS_SCORE = 10;

/**
 * Parses test pass/fail status from agent output text.
 * Tries `<gv>` tag parsing first — uses `score >= SYNTHETIC_PASS_SCORE (10)` to determine pass/fail.
 * Falls back to regex heuristics for backward compatibility with agents that do not emit tags.
 *
 * @param text - Raw output text from an agent.
 * @returns Object with `passed` boolean and optional numeric `score`, or null if
 *   neither strategy produced a usable result (caller should apply its own heuristic).
 */
export function parseGvTestResult(text: string): { passed: boolean; score?: number } | null {
  if (!text) return null;

  // Try <gv> tag first — use score to determine pass/fail
  const gvResult = parseGvTag(text);
  if (gvResult.found && gvResult.data !== null && typeof gvResult.data.score === 'number') {
    const score = gvResult.data.score;
    const passed = score >= SYNTHETIC_PASS_SCORE;
    return { passed, score };
  }

  // Fallback: regex heuristic
  const hasFailures =
    /\b(FAIL|FAILED|failing|test.*fail|\d+ fail)/i.test(text) ||
    /error:/i.test(text);
  return { passed: !hasFailures };
}
