/**
 * Retry Tracker
 *
 * Tracks retry attempts per error signature to enable phase-based escalation.
 * Stores retry data in .goodvibes/state/retries.json.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ensureGoodVibesDir } from '../shared.js';
import { debug } from '../shared/logging.js';
import { PHASE_RETRY_LIMITS } from '../types/errors.js';
import { generateErrorSignature as generateErrorSignatureCore, shouldEscalatePhase as shouldEscalatePhaseCore, escalatePhase as escalatePhaseCore, hasExhaustedRetries as hasExhaustedRetriesCore, getPhaseDescription as getPhaseDescriptionCore, getRemainingAttemptsInPhase, MAX_PHASE, } from '../shared/error-handling-core.js';
// =============================================================================
// Type Guards
// =============================================================================
/** Type guard to check if a value is a RetryData object */
function isRetryData(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    // Check if all entries match RetryEntry interface
    const obj = value;
    return Object.values(obj).every(entry => entry !== null &&
        typeof entry === 'object' &&
        'signature' in entry &&
        'attempts' in entry &&
        'lastAttempt' in entry &&
        'phase' in entry &&
        typeof entry.signature === 'string' &&
        typeof entry.attempts === 'number' &&
        typeof entry.lastAttempt === 'string' &&
        typeof entry.phase === 'number');
}
/** Type guard to check if a value is an ErrorState object */
function isErrorState(value) {
    return (value !== null &&
        typeof value === 'object' &&
        'category' in value &&
        'phase' in value &&
        'attemptsThisPhase' in value);
}
/**
 * Get the path to the retries.json file
 */
function getRetriesPath(cwd) {
    return path.join(cwd, '.goodvibes', 'state', 'retries.json');
}
/**
 * Loads all retry entries from disk.
 * Reads from .goodvibes/state/retries.json and validates the structure.
 *
 * @param cwd - Current working directory containing the .goodvibes folder
 * @returns RetryData map of error signatures to retry entries, or empty object if none exist
 *
 * @example
 * const retries = loadRetries('/project');
 * console.log(Object.keys(retries).length);  // Number of tracked errors
 */
export function loadRetries(cwd) {
    const retriesPath = getRetriesPath(cwd);
    if (!fs.existsSync(retriesPath)) {
        return {};
    }
    try {
        const content = fs.readFileSync(retriesPath, 'utf-8');
        const parsed = JSON.parse(content);
        // Validate the parsed data before returning
        if (isRetryData(parsed)) {
            return parsed;
        }
        // Return empty if data is invalid
        return {};
    }
    catch (error) {
        debug('loadRetries failed', { error: String(error) });
        return {};
    }
}
/**
 * Save a retry attempt for a given error signature.
 * Increments attempt counter and updates timestamp. Supports two call signatures
 * for backward compatibility.
 *
 * @param stateOrCwd - Either HooksState object or cwd string (legacy)
 * @param signature - Unique error signature identifying the error type
 * @param errorStateOrPhase - Either ErrorState object or phase number (legacy)
 *
 * @example
 * // New signature with state
 * saveRetry(state, 'ts_error_abc123', errorState);
 *
 * @example
 * // Legacy signature with cwd
 * saveRetry('/project', 'ts_error_abc123', 2);
 */
export function saveRetry(stateOrCwd, signature, errorStateOrPhase) {
    let cwd;
    let phase;
    if (typeof stateOrCwd === 'string') {
        // Legacy signature: (cwd, signature, phase)
        cwd = stateOrCwd;
        if (typeof errorStateOrPhase === 'number') {
            phase = errorStateOrPhase;
        }
        else {
            // Unexpected type, use default phase
            phase = 1;
        }
    }
    else {
        // New signature: (state, signature, errorState)
        // Extract cwd from state - we need to find it from the environment
        cwd = process.cwd();
        if (isErrorState(errorStateOrPhase)) {
            phase = errorStateOrPhase.phase;
            // Update the state's error tracking
            stateOrCwd.errors[signature] = errorStateOrPhase;
        }
        else {
            // Unexpected type, use default phase
            phase = 1;
        }
    }
    // Ensure .goodvibes directory structure exists
    ensureGoodVibesDir(cwd);
    const retriesPath = getRetriesPath(cwd);
    const retries = loadRetries(cwd);
    const existing = retries[signature];
    if (existing) {
        retries[signature] = {
            signature,
            attempts: existing.attempts + 1,
            lastAttempt: new Date().toISOString(),
            phase: Math.max(existing.phase, phase),
        };
    }
    else {
        retries[signature] = {
            signature,
            attempts: 1,
            lastAttempt: new Date().toISOString(),
            phase,
        };
    }
    try {
        fs.writeFileSync(retriesPath, JSON.stringify(retries, null, 2));
    }
    catch (error) {
        debug('saveRetry failed', { error: String(error) });
    }
}
/**
 * Returns the number of retry attempts for a given error signature.
 *
 * @param cwd - Current working directory containing the .goodvibes folder
 * @param signature - Unique error signature to look up
 * @returns Number of retry attempts, or 0 if signature not found
 *
 * @example
 * const count = getRetryCount('/project', 'ts_error_abc123');
 * console.log(`Attempted ${count} times`);
 */
export function getRetryCount(cwd, signature) {
    const retries = loadRetries(cwd);
    return retries[signature]?.attempts ?? 0;
}
/**
 * Returns the current escalation phase for a given error signature.
 * Phases range from 1 (initial) to 3 (maximum escalation).
 *
 * @param cwd - Current working directory containing the .goodvibes folder
 * @param signature - Unique error signature to look up
 * @returns Current phase number (1-3), or 1 if signature not found
 *
 * @example
 * const phase = getCurrentPhase('/project', 'ts_error_abc123');
 * if (phase >= 3) {
 *   console.log('All retry phases exhausted');
 * }
 */
export function getCurrentPhase(cwd, signature) {
    const retries = loadRetries(cwd);
    return retries[signature]?.phase ?? 1;
}
/**
 * Check if the phase should be escalated based on retry attempts.
 * Escalation occurs when retry limit for current phase is reached and max phase not yet hit.
 * Supports both ErrorState-based and cwd/signature-based call signatures.
 *
 * @param cwdOrErrorState - Either cwd string or ErrorState object
 * @param signature - Error signature (required for cwd-based calls)
 * @param currentPhase - Current phase override (optional for cwd-based calls)
 * @param category - Error category for determining retry limits (default: 'unknown')
 * @returns True if phase should be escalated
 *
 * @example
 * // ErrorState-based
 * if (shouldEscalatePhase(errorState)) {
 *   const escalated = escalatePhase(errorState);
 * }
 *
 * @example
 * // cwd/signature-based (legacy)
 * if (shouldEscalatePhase('/project', 'ts_error_abc123', 1, 'typescript_error')) {
 *   console.log('Escalating to next phase');
 * }
 */
export function shouldEscalatePhase(cwdOrErrorState, signature, currentPhase, category = 'unknown') {
    if (typeof cwdOrErrorState === 'string') {
        // cwd/signature-based signature: (cwd, signature, currentPhase, category)
        const cwd = cwdOrErrorState;
        const retries = loadRetries(cwd);
        const entry = retries[signature];
        if (!entry) {
            return false;
        }
        const limit = PHASE_RETRY_LIMITS[category];
        // Escalate if we've hit the retry limit for the current phase
        // and we're not already at the maximum phase (3)
        return entry.attempts >= limit && (currentPhase ?? entry.phase) < MAX_PHASE;
    }
    else if (isErrorState(cwdOrErrorState)) {
        // ErrorState-based signature: delegate to core implementation
        return shouldEscalatePhaseCore(cwdOrErrorState);
    }
    return false;
}
/**
 * Escalate to the next phase.
 * Increments the phase number and resets attempt counter.
 *
 * @param errorState - Current error state to escalate
 * @returns New ErrorState with incremented phase
 *
 * @example
 * if (shouldEscalatePhase(errorState)) {
 *   errorState = escalatePhase(errorState);
 *   console.log(`Now in phase ${errorState.phase}`);
 * }
 */
export function escalatePhase(errorState) {
    return escalatePhaseCore(errorState);
}
/**
 * Check if all phases have been exhausted.
 * Returns true when at maximum phase and retry limit reached.
 * Supports both ErrorState-based and cwd/signature-based call signatures.
 *
 * @param cwdOrErrorState - Either cwd string or ErrorState object
 * @param signature - Error signature (required for cwd-based calls)
 * @param category - Error category for determining retry limits (default: 'unknown')
 * @returns True if all retry phases have been exhausted
 *
 * @example
 * if (hasExhaustedRetries(errorState)) {
 *   console.log('All recovery attempts failed, requesting user intervention');
 * }
 */
export function hasExhaustedRetries(cwdOrErrorState, signature, category = 'unknown') {
    if (typeof cwdOrErrorState === 'string') {
        // cwd/signature-based signature: (cwd, signature, category)
        const cwd = cwdOrErrorState;
        const retries = loadRetries(cwd);
        const entry = retries[signature];
        if (!entry) {
            return false;
        }
        const limit = PHASE_RETRY_LIMITS[category];
        return entry.phase >= MAX_PHASE && entry.attempts >= limit;
    }
    else if (isErrorState(cwdOrErrorState)) {
        // ErrorState-based signature: delegate to core implementation
        return hasExhaustedRetriesCore(cwdOrErrorState);
    }
    return false;
}
/**
 * Get human-readable phase description for messaging.
 * Maps phase numbers to descriptive strings for user-facing messages.
 *
 * @param phase - Phase number (1, 2, or 3)
 * @returns Description string like "initial attempt" or "escalated recovery"
 *
 * @example
 * const desc = getPhaseDescription(2);
 * console.log(`Currently in ${desc}`);  // 'Currently in documentation lookup'
 */
export function getPhaseDescription(phase) {
    return getPhaseDescriptionCore(phase);
}
/**
 * Get remaining attempts in current phase.
 * Calculates how many more retries are allowed before phase escalation.
 * Supports both ErrorState-based and cwd/signature-based call signatures.
 *
 * @param cwdOrErrorState - Either cwd string or ErrorState object
 * @param signature - Error signature (required for cwd-based calls)
 * @param category - Error category for determining retry limits (default: 'unknown')
 * @returns Number of remaining attempts in current phase
 *
 * @example
 * const remaining = getRemainingAttempts(errorState);
 * console.log(`${remaining} attempts left before escalation`);
 */
export function getRemainingAttempts(cwdOrErrorState, signature, category = 'unknown') {
    if (typeof cwdOrErrorState === 'string') {
        // cwd/signature-based signature: (cwd, signature, category)
        const cwd = cwdOrErrorState;
        const retries = loadRetries(cwd);
        const entry = retries[signature];
        const limit = PHASE_RETRY_LIMITS[category];
        if (!entry) {
            return limit;
        }
        return Math.max(0, limit - entry.attempts);
    }
    else if (isErrorState(cwdOrErrorState)) {
        // ErrorState-based signature: delegate to core implementation
        return getRemainingAttemptsInPhase(cwdOrErrorState);
    }
    // Default return value for unexpected types
    return PHASE_RETRY_LIMITS[category];
}
/**
 * Generate a signature for an error message.
 * Normalizes the error to group similar errors together by removing
 * dynamic values like paths, line numbers, and timestamps.
 *
 * @param error - The error message to generate a signature for
 * @param toolName - Optional tool name to include in the signature
 * @returns A stable signature string that groups similar errors
 *
 * @example
 * const sig1 = generateErrorSignature("Error at /path/file.ts:10", "Edit");
 * const sig2 = generateErrorSignature("Error at /other/file.ts:20", "Edit");
 * // sig1 and sig2 may be equal if they represent the same error type
 */
export function generateErrorSignature(error, toolName) {
    // Delegate to core implementation - it handles both signatures
    return generateErrorSignatureCore(error, toolName);
}
/**
 * Clears retry data for a specific signature after successful fix.
 * Called when an error has been resolved to reset tracking.
 *
 * @param cwd - Current working directory containing the .goodvibes folder
 * @param signature - Error signature to clear from retry tracking
 *
 * @example
 * // After successfully fixing an error
 * clearRetry('/project', 'ts_error_abc123');
 */
export function clearRetry(cwd, signature) {
    const retriesPath = getRetriesPath(cwd);
    const retries = loadRetries(cwd);
    if (retries[signature]) {
        delete retries[signature];
        try {
            fs.writeFileSync(retriesPath, JSON.stringify(retries, null, 2));
        }
        catch (error) {
            debug('writeRetryData failed', { error: String(error) });
        }
    }
}
/** Default maximum age in hours for pruning old retry entries */
const DEFAULT_MAX_AGE_HOURS = 24;
/**
 * Removes retry entries older than the specified age.
 * Called periodically to clean up stale retry data from previous sessions.
 *
 * @param cwd - Current working directory containing the .goodvibes folder
 * @param maxAgeHours - Maximum age in hours for entries (default: 24)
 *
 * @example
 * // Prune entries older than 12 hours
 * pruneOldRetries('/project', 12);
 */
export function pruneOldRetries(cwd, maxAgeHours = DEFAULT_MAX_AGE_HOURS) {
    const retriesPath = getRetriesPath(cwd);
    const retries = loadRetries(cwd);
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - maxAgeHours);
    let changed = false;
    for (const [signature, entry] of Object.entries(retries)) {
        const lastAttempt = new Date(entry.lastAttempt);
        if (lastAttempt < cutoff) {
            delete retries[signature];
            changed = true;
        }
    }
    if (changed) {
        try {
            fs.writeFileSync(retriesPath, JSON.stringify(retries, null, 2));
        }
        catch (error) {
            debug('writeRetryData failed', { error: String(error) });
        }
    }
}
/**
 * Returns aggregate retry statistics for the current session.
 * Provides overview of error recovery status across all tracked errors.
 *
 * @param cwd - Current working directory containing the .goodvibes folder
 * @returns Object with counts of signatures, attempts, and entries per phase
 *
 * @example
 * const stats = getRetryStats('/project');
 * console.log(`Tracking ${stats.totalSignatures} unique errors`);
 * console.log(`Phase 3 (critical): ${stats.phase3Count} errors`);
 */
export function getRetryStats(cwd) {
    const retries = loadRetries(cwd);
    const entries = Object.values(retries);
    return {
        totalSignatures: entries.length,
        totalAttempts: entries.reduce((sum, e) => sum + e.attempts, 0),
        phase1Count: entries.filter(e => e.phase === 1).length,
        phase2Count: entries.filter(e => e.phase === 2).length,
        phase3Count: entries.filter(e => e.phase === 3).length,
    };
}
