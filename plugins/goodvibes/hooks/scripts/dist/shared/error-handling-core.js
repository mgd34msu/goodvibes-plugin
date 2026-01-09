/**
 * Error Handling Core
 *
 * Consolidated error handling utilities shared between automation/fix-loop.ts
 * and post-tool-use-failure/retry-tracker.ts.
 *
 * Provides:
 * - Error signature generation for deduplication
 * - Phase escalation logic
 * - Retry exhaustion checking
 */
import { PHASE_RETRY_LIMITS, } from '../types/errors.js';
// =============================================================================
// Constants
// =============================================================================
/** Maximum phase number before exhaustion. */
export const MAX_PHASE = 3;
/** Default retry limit when category not found. */
export const DEFAULT_RETRY_LIMIT = 2;
/** Maximum length for normalized error message before hashing. */
const ERROR_NORMALIZE_MAX_LENGTH = 100;
/** Maximum length for base64 signature suffix. */
const SIGNATURE_MAX_LENGTH = 20;
// =============================================================================
// Error Signature Generation
// =============================================================================
/**
 * Generates a stable signature from tool name and error message for deduplication.
 *
 * This implementation combines the best of both approaches:
 * - Normalizes variable parts (numbers, strings, paths, timestamps)
 * - Creates a deterministic signature for grouping similar errors
 * - Supports optional tool name for more specific signatures
 *
 * @param errorOrToolName - Either the error message (single arg) or tool name (two args)
 * @param errorMessage - The error message when tool name is provided
 * @returns A stable signature string for the error
 *
 * @example
 * // With tool name (fix-loop style)
 * generateErrorSignature('Bash', 'Error at line 42: file.ts')
 * // Returns: 'Bash:bm9ybWFsaXplZF9lcnI='
 *
 * @example
 * // Without tool name (retry-tracker style)
 * generateErrorSignature('Error at line 42: file.ts')
 * // Returns: 'err_a1b2c3d4'
 */
export function generateErrorSignature(errorOrToolName, errorMessage) {
    // Determine if called with one or two arguments
    const hasToolName = errorMessage !== undefined;
    const error = hasToolName ? errorMessage : errorOrToolName;
    const toolName = hasToolName ? errorOrToolName : undefined;
    // Normalize the error message to group similar errors
    let normalized = error
        // Remove absolute paths (Windows and Unix)
        .replace(/[A-Z]:\\[^\s:]+/gi, '<PATH>')
        .replace(/\/[^\s:]+/g, '<PATH>')
        // Remove line/column numbers
        .replace(/:\d+:\d+/g, ':<LINE>:<COL>')
        .replace(/line \d+/gi, 'line <LINE>')
        // Replace numbers
        .replace(/\d+/g, 'N')
        // Replace quoted strings
        .replace(/(['"])[^'"]*\1/g, 'STR')
        // Remove timestamps
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*/g, '<TIMESTAMP>')
        // Remove hex addresses
        .replace(/0x[a-f0-9]+/gi, '<ADDR>')
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        .trim();
    if (toolName) {
        // fix-loop style: base64 encoding for compact signature
        normalized = normalized.slice(0, ERROR_NORMALIZE_MAX_LENGTH).toLowerCase();
        return `${toolName}:${Buffer.from(normalized).toString('base64').slice(0, SIGNATURE_MAX_LENGTH)}`;
    }
    else {
        // retry-tracker style: hash-based signature
        normalized = normalized.toLowerCase();
        // Include tool name in hash if provided via the string
        let hash = 0;
        for (let i = 0; i < normalized.length; i++) {
            const char = normalized.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return `err_${Math.abs(hash).toString(16)}`;
    }
}
// =============================================================================
// Phase Escalation
// =============================================================================
/**
 * Type guard to validate if a number is a valid phase (1, 2, or 3).
 *
 * @param phase - The phase number to validate
 * @returns True if the phase is 1, 2, or 3
 *
 * @example
 * if (isValidPhase(nextPhase)) {
 *   // nextPhase is type-narrowed to 1 | 2 | 3
 * }
 */
function isValidPhase(phase) {
    return phase === 1 || phase === 2 || phase === 3;
}
/**
 * Determines if the current phase should escalate based on retry limits.
 *
 * Escalation occurs when the number of attempts in the current phase
 * reaches the limit for the error's category and we're not already
 * at the maximum phase.
 *
 * @param state - The current error state
 * @returns True if the phase should be escalated
 *
 * @example
 * const state = { category: 'typescript_error', phase: 1, attemptsThisPhase: 3 };
 * shouldEscalatePhase(state); // true (typescript_error limit is 3)
 */
export function shouldEscalatePhase(state) {
    const maxPerPhase = PHASE_RETRY_LIMITS[state.category] || DEFAULT_RETRY_LIMIT;
    return state.attemptsThisPhase >= maxPerPhase && state.phase < MAX_PHASE;
}
/**
 * Escalates the error state to the next phase, resetting attempt counter.
 *
 * If already at MAX_PHASE, returns the state unchanged.
 *
 * @param state - The current error state
 * @returns A new error state with incremented phase and reset attempts
 *
 * @example
 * const state = { phase: 1, attemptsThisPhase: 3, ... };
 * const escalated = escalatePhase(state);
 * // { phase: 2, attemptsThisPhase: 0, ... }
 */
export function escalatePhase(state) {
    if (state.phase >= MAX_PHASE) {
        return state;
    }
    const nextPhase = state.phase + 1;
    // Type-safe phase validation using type guard
    if (isValidPhase(nextPhase)) {
        return {
            ...state,
            phase: nextPhase,
            attemptsThisPhase: 0,
        };
    }
    // Should never reach here, but return unchanged state for safety
    return state;
}
// =============================================================================
// Retry Exhaustion
// =============================================================================
/**
 * Checks if all retry phases have been exhausted for the error.
 *
 * Returns true when:
 * - The error is at the maximum phase (3)
 * - AND the attempts in this phase have reached the category limit
 *
 * @param state - The current error state
 * @returns True if retries are exhausted and escalation to user is needed
 *
 * @example
 * const state = { category: 'npm_install', phase: 3, attemptsThisPhase: 2 };
 * hasExhaustedRetries(state); // true (npm_install limit is 2)
 */
export function hasExhaustedRetries(state) {
    const maxPerPhase = PHASE_RETRY_LIMITS[state.category] || DEFAULT_RETRY_LIMIT;
    return state.phase >= MAX_PHASE && state.attemptsThisPhase >= maxPerPhase;
}
/**
 * Gets the retry limit for a given error category.
 *
 * @param category - The error category
 * @returns The retry limit for the category
 */
export function getRetryLimit(category) {
    return PHASE_RETRY_LIMITS[category] || DEFAULT_RETRY_LIMIT;
}
/**
 * Gets the remaining attempts in the current phase.
 *
 * @param state - The current error state
 * @returns Number of attempts remaining before phase escalation
 */
export function getRemainingAttemptsInPhase(state) {
    const limit = getRetryLimit(state.category);
    return Math.max(0, limit - state.attemptsThisPhase);
}
/**
 * Gets a human-readable description of the current phase.
 *
 * @param phase - The phase number (1, 2, or 3)
 * @returns Description of what the phase represents
 */
export function getPhaseDescription(phase) {
    switch (phase) {
        case 1:
            return 'Raw attempts with existing knowledge';
        case 2:
            return 'Including official documentation search';
        case 3:
            return 'Including community solutions search';
        default:
            return 'Unknown phase';
    }
}
