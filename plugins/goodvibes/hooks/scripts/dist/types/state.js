/**
 * Type definitions for hook state management.
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
