/**
 * Pattern Matching for Error Recovery
 *
 * Functions to match error messages against recovery patterns and
 * provide suggested fixes based on error state.
 */
import { RECOVERY_PATTERNS } from './recovery-patterns.js';
/**
 * Maps ErrorCategory to pattern category names for lookup.
 */
const CATEGORY_MAP = {
    npm_install: ['missing_import', 'npm_error'],
    typescript_error: [
        'typescript_type_error',
        'typescript_config_error',
        'type_mismatch',
    ],
    test_failure: ['test_failure'],
    build_failure: ['build_failure'],
    file_not_found: ['file_not_found'],
    git_conflict: ['git_error'],
    database_error: ['database_error'],
    api_error: ['api_error'],
    unknown: [
        'undefined_reference',
        'lint_error',
        'permission_error',
        'resource_error',
        'syntax_error',
    ],
};
/**
 * Find a matching recovery pattern for the given error category and message.
 * First attempts to match by category mapping, then falls back to pattern matching.
 * Returns the first pattern whose regex matches the error message.
 *
 * @param category - The classified error category (e.g., 'typescript_error', 'test_failure')
 * @param errorMessage - The raw error message text to match against patterns
 * @returns The matching RecoveryPattern with suggested fix, or null if no match found
 *
 * @example
 * const pattern = findMatchingPattern('typescript_error', "Type 'string' is not assignable to type 'number'");
 * if (pattern) {
 *   console.log(pattern.suggestedFix);  // 'Run `npx tsc --noEmit`...'
 * }
 */
export function findMatchingPattern(category, errorMessage) {
    const patternCategories = CATEGORY_MAP[category] || [];
    // First try to match by mapped category
    for (const pattern of RECOVERY_PATTERNS) {
        if (patternCategories.includes(pattern.category)) {
            for (const regex of pattern.patterns) {
                if (regex.test(errorMessage)) {
                    return pattern;
                }
            }
        }
    }
    // Fall back to matching by pattern only
    for (const pattern of RECOVERY_PATTERNS) {
        for (const regex of pattern.patterns) {
            if (regex.test(errorMessage)) {
                return pattern;
            }
        }
    }
    return null;
}
/**
 * Get all matching patterns for an error (may match multiple categories).
 * Unlike findMatchingPattern, this returns all patterns that match,
 * useful for complex errors that span multiple categories.
 *
 * @param error - The raw error message to analyze
 * @returns Array of all RecoveryPatterns whose regex matches the error
 *
 * @example
 * const patterns = findAllMatchingPatterns('Error: Cannot find module "foo"');
 * // May return both 'missing_import' and 'npm_error' patterns
 */
export function findAllMatchingPatterns(error) {
    const matches = [];
    for (const pattern of RECOVERY_PATTERNS) {
        for (const regex of pattern.patterns) {
            if (regex.test(error)) {
                matches.push(pattern);
                break; // Only add each pattern once
            }
        }
    }
    return matches;
}
/**
 * Get the highest severity from a list of patterns.
 * Severity order from lowest to highest: low, medium, high, critical.
 *
 * @param patterns - Array of RecoveryPatterns to evaluate
 * @returns The highest ErrorSeverity found, or 'low' if array is empty
 *
 * @example
 * const patterns = findAllMatchingPatterns(errorMessage);
 * const severity = getHighestSeverity(patterns);
 * if (severity === 'critical') {
 *   console.log('Immediate attention required');
 * }
 */
export function getHighestSeverity(patterns) {
    const severityOrder = ['low', 'medium', 'high', 'critical'];
    let highest = 'low';
    for (const pattern of patterns) {
        if (severityOrder.indexOf(pattern.severity) > severityOrder.indexOf(highest)) {
            highest = pattern.severity;
        }
    }
    return highest;
}
/**
 * Get suggested fix for an error message, considering error state for phase-specific advice.
 * Uses pattern matching to find relevant recovery advice and appends phase-specific
 * guidance when previous fix attempts have failed.
 *
 * @param category - The classified error category
 * @param errorMessage - The raw error message to analyze
 * @param errorState - Current error state with phase and attempted strategies
 * @returns A string containing the suggested fix approach
 *
 * @example
 * const fix = getSuggestedFix('npm_install', 'Module not found: lodash', errorState);
 * console.log(fix);  // 'Run `npm install` to ensure all dependencies...'
 */
export function getSuggestedFix(category, errorMessage, errorState) {
    const pattern = findMatchingPattern(category, errorMessage);
    if (!pattern) {
        return 'Review the error message carefully. Check logs for more details. Try isolating the problem step by step.';
    }
    // Base suggestion
    let suggestion = pattern.suggestedFix;
    // Add phase-specific advice
    if (errorState.phase >= 2 && errorState.fixStrategiesAttempted.length > 0) {
        suggestion +=
            '\n\nNote: Previous fix attempts failed. Try a different approach or check documentation for alternatives.';
    }
    return suggestion;
}
