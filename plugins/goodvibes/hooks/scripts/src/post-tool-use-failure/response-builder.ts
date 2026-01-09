/**
 * Response Builder for Post Tool Use Failure
 *
 * Builds structured response messages for the fix loop with phase info,
 * suggestions, research hints, and warnings.
 */

import { getPhaseDescription, getRemainingAttempts } from './retry-tracker.js';

import type { RecoveryPattern } from './recovery-types.js';
import type { ErrorCategory, ErrorState } from '../types/errors.js';


/**
 * Build research hints message based on phase.
 *
 * @param hints - Object with official and community hints
 * @param phase - Current fix loop phase (1, 2, or 3)
 * @returns Formatted research hints string, or empty string for phase 1
 */
export function buildResearchHintsMessage(
  hints: { official: string[]; community: string[] },
  phase: 1 | 2 | 3
): string {
  if (phase === 1) {
    return '';
  }

  const parts: string[] = [];

  if (phase >= 2 && hints.official.length > 0) {
    parts.push('[Phase 2] Search official documentation:');
    for (const hint of hints.official) {
      parts.push(`  - ${hint}`);
    }
  }

  if (phase >= 3 && hints.community.length > 0) {
    parts.push('[Phase 3] Search community solutions:');
    for (const hint of hints.community) {
      parts.push(`  - ${hint}`);
    }
  }

  return parts.join('\n');
}

/**
 * Build complete fix loop response message.
 *
 * @param options - Response building options
 * @returns Complete formatted response string
 */
export async function buildFixLoopResponse(options: {
  errorState: ErrorState;
  retryCount: number;
  pattern: RecoveryPattern | null;
  category: ErrorCategory;
  suggestedFix: string;
  researchHints: string;
  exhausted: boolean;
}): Promise<string> {
  const { errorState, retryCount, pattern, category, suggestedFix, researchHints, exhausted } =
    options;

  const responseParts: string[] = [];

  // Header with phase info
  const phaseDesc = getPhaseDescription(errorState.phase);
  responseParts.push(
    `[GoodVibes Fix Loop - Phase ${errorState.phase}/3: ${phaseDesc}]`
  );
  const remaining = await getRemainingAttempts(errorState);
  responseParts.push(
    `Attempt ${retryCount + 1} (${remaining} remaining this phase)`
  );
  responseParts.push('');

  // Error category
  if (pattern) {
    responseParts.push(`Detected: ${pattern.category.replace(/_/g, ' ')}`);
  } else {
    responseParts.push(`Category: ${category}`);
  }
  responseParts.push('');

  // Suggested fix
  responseParts.push('Suggested fix:');
  responseParts.push(suggestedFix);

  // Research hints for phases 2 and 3
  if (researchHints) {
    responseParts.push('');
    responseParts.push(researchHints);
  }

  // Previous attempts warning
  const MAX_RECENT_ATTEMPTS = 3;
  if (errorState.fixStrategiesAttempted.length > 0) {
    responseParts.push('');
    responseParts.push('Previously attempted (failed):');
    for (const attempt of errorState.fixStrategiesAttempted.slice(
      -MAX_RECENT_ATTEMPTS
    )) {
      responseParts.push(`  - ${attempt.strategy}`);
    }
    responseParts.push('Try a DIFFERENT approach.');
  }

  // Exhaustion warning
  if (exhausted) {
    responseParts.push('');
    responseParts.push('[WARNING] All fix phases exhausted. Consider:');
    responseParts.push('  - Manual debugging');
    responseParts.push('  - Asking the user for help');
    responseParts.push('  - Reverting recent changes');
  }

  return responseParts.join('\n');
}
