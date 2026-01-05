/**
 * Type definitions for hook state management.
 *
 * This module defines the state structures used by GoodVibes hooks to track
 * session information, test results, build status, git operations, and more.
 * State is persisted to disk and restored between sessions.
 */
/** Creates a new default state object with sensible defaults. */
export function createDefaultState() {
    return {
        session: {
            id: '',
            startedAt: new Date().toISOString(),
            mode: 'default',
            featureDescription: null,
        },
        errors: {},
        tests: {
            lastFullRun: null,
            lastQuickRun: null,
            passingFiles: [],
            failingFiles: [],
            pendingFixes: [],
        },
        build: {
            lastRun: null,
            status: 'unknown',
            errors: [],
            fixAttempts: 0,
        },
        git: {
            mainBranch: 'main',
            currentBranch: 'main',
            featureBranch: null,
            featureStartedAt: null,
            featureDescription: null,
            checkpoints: [],
            pendingMerge: false,
        },
        files: {
            modifiedSinceCheckpoint: [],
            modifiedThisSession: [],
            createdThisSession: [],
        },
        devServers: {},
    };
}
