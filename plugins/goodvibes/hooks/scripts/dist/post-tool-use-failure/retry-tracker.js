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
/** Loads all retry entries from disk */
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
 * Save a retry attempt for a given error signature
 * Can be called with (state, signature, errorState) or (cwd, signature, phase)
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
/** Returns the number of retry attempts for a given error signature */
export function getRetryCount(cwd, signature) {
    const retries = loadRetries(cwd);
    return retries[signature]?.attempts ?? 0;
}
/** Returns the current escalation phase for a given error signature */
export function getCurrentPhase(cwd, signature) {
    const retries = loadRetries(cwd);
    return retries[signature]?.phase ?? 1;
}
/**
 * Check if the phase should be escalated based on retry attempts
 * Supports both ErrorState-based and cwd/signature-based signatures
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
        return entry.attempts >= limit && (currentPhase ?? entry.phase) < 3;
    }
    else if (isErrorState(cwdOrErrorState)) {
        // ErrorState-based signature: (errorState)
        const errorState = cwdOrErrorState;
        const errorCategory = errorState.category;
        const limit = PHASE_RETRY_LIMITS[errorCategory] || PHASE_RETRY_LIMITS['unknown'];
        return errorState.attemptsThisPhase >= limit && errorState.phase < 3;
    }
    return false;
}
/**
 * Escalate to the next phase
 */
export function escalatePhase(errorState) {
    if (errorState.phase >= 3) {
        return errorState;
    }
    const nextPhase = errorState.phase + 1;
    // Type-safe phase validation
    if (nextPhase === 1 || nextPhase === 2 || nextPhase === 3) {
        return {
            ...errorState,
            phase: nextPhase,
            attemptsThisPhase: 0,
        };
    }
    // Should never happen, but return unchanged state for safety
    return errorState;
}
/**
 * Check if all phases have been exhausted
 * Supports both ErrorState-based and cwd/signature-based signatures
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
        return entry.phase >= 3 && entry.attempts >= limit;
    }
    else if (isErrorState(cwdOrErrorState)) {
        // ErrorState-based signature: (errorState)
        const errorState = cwdOrErrorState;
        const errorCategory = errorState.category;
        const limit = PHASE_RETRY_LIMITS[errorCategory] || PHASE_RETRY_LIMITS['unknown'];
        return errorState.phase >= 3 && errorState.attemptsThisPhase >= limit;
    }
    return false;
}
/**
 * Get phase description for messaging
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
/**
 * Get remaining attempts in current phase
 * Supports both ErrorState-based and cwd/signature-based signatures
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
        // ErrorState-based signature: (errorState)
        const errorState = cwdOrErrorState;
        const errorCategory = errorState.category;
        const limit = PHASE_RETRY_LIMITS[errorCategory] || PHASE_RETRY_LIMITS['unknown'];
        return Math.max(0, limit - errorState.attemptsThisPhase);
    }
    // Default return value for unexpected types
    return PHASE_RETRY_LIMITS[category];
}
/**
 * Generate a signature for an error message
 * Normalizes the error to group similar errors together
 */
export function generateErrorSignature(error, toolName) {
    // Remove variable parts like file paths, line numbers, timestamps
    let normalized = error
        // Remove absolute paths
        .replace(/[A-Z]:\\[^\s:]+/gi, '<PATH>')
        .replace(/\/[^\s:]+/g, '<PATH>')
        // Remove line/column numbers
        .replace(/:\d+:\d+/g, ':<LINE>:<COL>')
        .replace(/line \d+/gi, 'line <LINE>')
        // Remove timestamps
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*/g, '<TIMESTAMP>')
        // Remove hex addresses
        .replace(/0x[a-f0-9]+/gi, '<ADDR>')
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    // Include tool name if provided
    if (toolName) {
        normalized = `${toolName}::${normalized}`;
    }
    // Create a simple hash of the normalized error
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return `err_${Math.abs(hash).toString(16)}`;
}
/** Clears retry data for a specific signature after successful fix */
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
/** Removes retry entries older than the specified age */
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
/** Returns aggregate retry statistics for the current session */
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
