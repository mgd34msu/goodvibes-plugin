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
        return entry.attempts >= limit && (currentPhase ?? entry.phase) < MAX_PHASE;
    }
    else if (isErrorState(cwdOrErrorState)) {
        // ErrorState-based signature: delegate to core implementation
        return shouldEscalatePhaseCore(cwdOrErrorState);
    }
    return false;
}
/**
 * Escalate to the next phase
 */
export function escalatePhase(errorState) {
    return escalatePhaseCore(errorState);
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
        return entry.phase >= MAX_PHASE && entry.attempts >= limit;
    }
    else if (isErrorState(cwdOrErrorState)) {
        // ErrorState-based signature: delegate to core implementation
        return hasExhaustedRetriesCore(cwdOrErrorState);
    }
    return false;
}
/**
 * Get phase description for messaging
 */
export function getPhaseDescription(phase) {
    return getPhaseDescriptionCore(phase);
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
        // ErrorState-based signature: delegate to core implementation
        return getRemainingAttemptsInPhase(cwdOrErrorState);
    }
    // Default return value for unexpected types
    return PHASE_RETRY_LIMITS[category];
}
/**
 * Generate a signature for an error message
 * Normalizes the error to group similar errors together
 *
 * Note: This wrapper maintains the original API where error comes first
 * and toolName is optional. The core implementation supports both orderings.
 */
export function generateErrorSignature(error, toolName) {
    // Delegate to core implementation - it handles both signatures
    return generateErrorSignatureCore(error, toolName);
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
