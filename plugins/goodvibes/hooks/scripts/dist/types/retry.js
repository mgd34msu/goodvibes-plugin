/**
 * Type definitions for retry tracking.
 */
/**
 * Type guard to check if a value is a RetryEntry object.
 *
 * @param value - The value to check
 * @returns True if value is a valid RetryEntry
 */
function isRetryEntry(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const entry = value;
    return (typeof entry.signature === 'string' &&
        typeof entry.attempts === 'number' &&
        typeof entry.lastAttempt === 'string' &&
        typeof entry.phase === 'number');
}
/**
 * Type guard to check if a value is a RetryData object.
 *
 * @param value - The value to check
 * @returns True if value is a valid RetryData record
 */
export function isRetryData(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    return Object.values(value).every(isRetryEntry);
}
/**
 * Type guard to check if a value is an ErrorState object.
 *
 * @param value - The value to check
 * @returns True if value is a valid ErrorState
 */
export function isErrorState(value) {
    return (value !== null &&
        typeof value === 'object' &&
        'category' in value &&
        'phase' in value &&
        'attemptsThisPhase' in value);
}
/** Default maximum age for retry entries in hours. */
export const DEFAULT_MAX_AGE_HOURS = 24;
