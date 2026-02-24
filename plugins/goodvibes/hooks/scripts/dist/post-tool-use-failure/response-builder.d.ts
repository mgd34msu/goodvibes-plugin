/**
 * Response Builder for Post Tool Use Failure
 *
 * Builds structured response messages for the fix loop with phase info,
 * suggestions, research hints, and warnings.
 */
import type { RecoveryPattern } from './recovery-types.js';
import type { ErrorCategory, ErrorState } from '../types/errors.js';
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
export declare function buildResearchHintsMessage(hints: {
    official: string[];
    community: string[];
}, phase: 1 | 2 | 3): string;
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
export declare function buildFixLoopResponse(options: {
    errorState: ErrorState;
    retryCount: number;
    pattern: RecoveryPattern | null;
    category: ErrorCategory;
    suggestedFix: string;
    researchHints: string;
    exhausted: boolean;
}): Promise<string>;
