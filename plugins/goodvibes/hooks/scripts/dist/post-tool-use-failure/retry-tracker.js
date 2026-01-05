/**
 * Retry Tracker
 *
 * Tracks retry attempts per error signature to enable phase-based escalation.
 * Stores retry data in .goodvibes/state/retries.json.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { ensureGoodVibesDir } from '../shared/index.js';
import { debug } from '../shared/logging.js';
import { PHASE_RETRY_LIMITS } from '../types/errors.js';
import { generateErrorSignature as generateErrorSignatureCore, shouldEscalatePhase as shouldEscalatePhaseCore, escalatePhase as escalatePhaseCore, hasExhaustedRetries as hasExhaustedRetriesCore, getPhaseDescription as getPhaseDescriptionCore, getRemainingAttemptsInPhase, MAX_PHASE, } from '../shared/error-handling-core.js';
/** Type guard to check if a value is a RetryData object */
function isRetryData(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
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
function getRetriesPath(cwd) {
    return path.join(cwd, '.goodvibes', 'state', 'retries.json');
}
export async function loadRetries(cwd) {
    const retriesPath = getRetriesPath(cwd);
    try {
        await fs.access(retriesPath);
    }
    catch (error) {
        debug(`Retries file access check failed for ${retriesPath}: ${error}`);
        return {};
    }
    try {
        const content = await fs.readFile(retriesPath, 'utf-8');
        const parsed = JSON.parse(content);
        if (isRetryData(parsed)) {
            return parsed;
        }
        return {};
    }
    catch (error) {
        debug('loadRetries failed', { error: String(error) });
        return {};
    }
}
export async function saveRetry(stateOrCwd, signature, errorStateOrPhase) {
    let cwd;
    let phase;
    if (typeof stateOrCwd === 'string') {
        cwd = stateOrCwd;
        phase = typeof errorStateOrPhase === 'number' ? errorStateOrPhase : 1;
    }
    else {
        cwd = process.cwd();
        if (isErrorState(errorStateOrPhase)) {
            phase = errorStateOrPhase.phase;
            stateOrCwd.errors[signature] = errorStateOrPhase;
        }
        else {
            phase = 1;
        }
    }
    await ensureGoodVibesDir(cwd);
    const retriesPath = getRetriesPath(cwd);
    const retries = await loadRetries(cwd);
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
        await fs.writeFile(retriesPath, JSON.stringify(retries, null, 2));
    }
    catch (error) {
        debug('saveRetry failed', { error: String(error) });
    }
}
export async function getRetryCount(cwd, signature) {
    const retries = await loadRetries(cwd);
    return retries[signature]?.attempts ?? 0;
}
export async function getCurrentPhase(cwd, signature) {
    const retries = await loadRetries(cwd);
    return retries[signature]?.phase ?? 1;
}
export async function shouldEscalatePhase(cwdOrErrorState, signature, currentPhase, category = 'unknown') {
    if (typeof cwdOrErrorState === 'string') {
        const cwd = cwdOrErrorState;
        const retries = await loadRetries(cwd);
        const entry = retries[signature];
        if (!entry) {
            return false;
        }
        const limit = PHASE_RETRY_LIMITS[category];
        return entry.attempts >= limit && (currentPhase ?? entry.phase) < MAX_PHASE;
    }
    else if (isErrorState(cwdOrErrorState)) {
        return shouldEscalatePhaseCore(cwdOrErrorState);
    }
    return false;
}
export function escalatePhase(errorState) {
    return escalatePhaseCore(errorState);
}
export async function hasExhaustedRetries(cwdOrErrorState, signature, category = 'unknown') {
    if (typeof cwdOrErrorState === 'string') {
        const cwd = cwdOrErrorState;
        const retries = await loadRetries(cwd);
        const entry = retries[signature];
        if (!entry) {
            return false;
        }
        const limit = PHASE_RETRY_LIMITS[category];
        return entry.phase >= MAX_PHASE && entry.attempts >= limit;
    }
    else if (isErrorState(cwdOrErrorState)) {
        return hasExhaustedRetriesCore(cwdOrErrorState);
    }
    return false;
}
export function getPhaseDescription(phase) {
    return getPhaseDescriptionCore(phase);
}
export async function getRemainingAttempts(cwdOrErrorState, signature, category = 'unknown') {
    if (typeof cwdOrErrorState === 'string') {
        const cwd = cwdOrErrorState;
        const retries = await loadRetries(cwd);
        const entry = retries[signature];
        const limit = PHASE_RETRY_LIMITS[category];
        if (!entry) {
            return limit;
        }
        return Math.max(0, limit - entry.attempts);
    }
    else if (isErrorState(cwdOrErrorState)) {
        return getRemainingAttemptsInPhase(cwdOrErrorState);
    }
    return PHASE_RETRY_LIMITS[category];
}
export function generateErrorSignature(error, toolName) {
    return generateErrorSignatureCore(error, toolName);
}
export async function clearRetry(cwd, signature) {
    const retriesPath = getRetriesPath(cwd);
    const retries = await loadRetries(cwd);
    if (retries[signature]) {
        delete retries[signature];
        try {
            await fs.writeFile(retriesPath, JSON.stringify(retries, null, 2));
        }
        catch (error) {
            debug('writeRetryData failed', { error: String(error) });
        }
    }
}
const DEFAULT_MAX_AGE_HOURS = 24;
export async function pruneOldRetries(cwd, maxAgeHours = DEFAULT_MAX_AGE_HOURS) {
    const retriesPath = getRetriesPath(cwd);
    const retries = await loadRetries(cwd);
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
            await fs.writeFile(retriesPath, JSON.stringify(retries, null, 2));
        }
        catch (error) {
            debug('writeRetryData failed', { error: String(error) });
        }
    }
}
export async function getRetryStats(cwd) {
    const retries = await loadRetries(cwd);
    const entries = Object.values(retries);
    return {
        totalSignatures: entries.length,
        totalAttempts: entries.reduce((sum, e) => sum + e.attempts, 0),
        phase1Count: entries.filter(e => e.phase === 1).length,
        phase2Count: entries.filter(e => e.phase === 2).length,
        phase3Count: entries.filter(e => e.phase === 3).length,
    };
}
