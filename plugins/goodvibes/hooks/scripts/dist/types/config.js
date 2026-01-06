/**
 * Type definitions for GoodVibes automation configuration.
 */
/**
 * Returns the default configuration with sensible defaults.
 *
 * Provides a complete configuration object with all automation features enabled
 * and reasonable threshold values for testing, building, and git operations.
 *
 * @returns A GoodVibesConfig object with all sections populated with default values
 *
 * @example
 * const config = getDefaultConfig();
 * console.log(config.automation.mode); // 'default'
 * console.log(config.automation.testing.maxRetries); // 3
 */
export function getDefaultConfig() {
    return {
        automation: {
            enabled: true,
            mode: 'default',
            testing: {
                runAfterFileChange: true,
                runBeforeCommit: true,
                runBeforeMerge: true,
                testCommand: 'npm test',
                maxRetries: 3,
            },
            building: {
                runAfterFileThreshold: 5,
                runBeforeCommit: true,
                runBeforeMerge: true,
                buildCommand: 'npm run build',
                typecheckCommand: 'npx tsc --noEmit',
                maxRetries: 3,
            },
            git: {
                autoFeatureBranch: true,
                autoCheckpoint: true,
                autoMerge: true,
                checkpointThreshold: 5,
                mainBranch: 'main',
            },
            recovery: {
                maxRetriesPerError: 3,
                logFailures: true,
                skipAfterMaxRetries: true,
            },
        },
    };
}
