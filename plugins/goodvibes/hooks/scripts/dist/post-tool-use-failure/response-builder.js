/**
 * Response Builder for Post Tool Use Failure
 *
 * Builds structured response messages for the fix loop with phase info,
 * suggestions, research hints, and warnings.
 */
import { getPhaseDescription, getRemainingAttempts } from './retry-tracker.js';
/**
 * Builds a formatted research hints message based on the current fix phase.
 * Phase 1 returns empty (use existing knowledge), Phase 2 adds official docs,
 * Phase 3 adds community solutions.
 *
 * @param hints - Object containing arrays of hint strings
 * @param hints.official - Official documentation search suggestions
 * @param hints.community - Community/Stack Overflow search suggestions
 * @param phase - Current fix loop phase (1, 2, or 3)
 * @returns Formatted research hints string, or empty string for phase 1
 *
 * @example
 * const hints = { official: ['React docs'], community: ['Stack Overflow'] };
 * buildResearchHintsMessage(hints, 2);
 * // => '[Phase 2] Search official documentation:\n  - React docs'
 */
export function buildResearchHintsMessage(hints, phase) {
    if (phase === 1) {
        return '';
    }
    const parts = [];
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
 * Builds the complete fix loop response message with phase info,
 * suggestions, research hints, previous attempts, and warnings.
 *
 * @param options - Response building configuration
 * @param options.errorState - Current error state with phase and attempt tracking
 * @param options.retryCount - Number of retry attempts made for this error
 * @param options.pattern - Matched recovery pattern or null if none found
 * @param options.category - Classified error category
 * @param options.suggestedFix - The recommended fix approach string
 * @param options.researchHints - Formatted research hints for phases 2-3
 * @param options.exhausted - Whether all retry phases have been exhausted
 * @returns Complete formatted response string with all fix loop context
 *
 * @example
 * const response = await buildFixLoopResponse({
 *   errorState, retryCount: 2, pattern: null, category: 'typescript_error',
 *   suggestedFix: 'Run tsc --noEmit', researchHints: '', exhausted: false
 * });
 */
export async function buildFixLoopResponse(options) {
    const { errorState, retryCount, pattern, category, suggestedFix, researchHints, exhausted } = options;
    const responseParts = [];
    // Header with phase info
    const phaseDesc = getPhaseDescription(errorState.phase);
    responseParts.push(`[GoodVibes Fix Loop - Phase ${errorState.phase}/3: ${phaseDesc}]`);
    const remaining = await getRemainingAttempts(errorState);
    responseParts.push(`Attempt ${retryCount + 1} (${remaining} remaining this phase)`);
    responseParts.push('');
    // Error category
    if (pattern) {
        responseParts.push(`Detected: ${pattern.category.replace(/_/g, ' ')}`);
    }
    else {
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
        for (const attempt of errorState.fixStrategiesAttempted.slice(-MAX_RECENT_ATTEMPTS)) {
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
