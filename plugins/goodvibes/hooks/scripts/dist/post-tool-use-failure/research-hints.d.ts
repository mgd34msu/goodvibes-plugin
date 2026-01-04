/**
 * Research Hints for Error Recovery
 *
 * Provides documentation sources to consult when recovering from errors.
 * Returns different hints based on the current escalation phase.
 */
import type { ErrorCategory } from '../types/errors.js';
/**
 * Get research hints for an error based on category, message, and phase.
 * Returns documentation sources to consult, with official docs suggested
 * in phase 2 and community resources added in phase 3.
 *
 * @param category - The classified error category
 * @param errorMessage - The raw error message (currently unused, reserved for future use)
 * @param phase - Current escalation phase (1, 2, or 3)
 * @returns Object with `official` and `community` arrays of documentation hints
 *
 * @example
 * const hints = getResearchHints('typescript_error', errorMsg, 2);
 * // Returns: { official: ['typescriptlang.org error reference', ...], community: [] }
 *
 * @example
 * const hints = getResearchHints('typescript_error', errorMsg, 3);
 * // Returns: { official: [...], community: ['stackoverflow typescript', ...] }
 */
export declare function getResearchHints(category: ErrorCategory, errorMessage: string, phase: 1 | 2 | 3): {
    official: string[];
    community: string[];
};
