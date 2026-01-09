/**
 * Type definitions for GoodVibes automation configuration.
 */
/**
 * Configuration for GoodVibes automation behavior.
 * Controls all aspects of automated testing, building, git operations, and error recovery.
 */
export interface GoodVibesConfig {
    automation: {
        enabled: boolean;
        mode: 'vibecoding' | 'justvibes' | 'default';
        testing: {
            runAfterFileChange: boolean;
            runBeforeCommit: boolean;
            runBeforeMerge: boolean;
            testCommand: string;
            maxRetries: number;
        };
        building: {
            runAfterFileThreshold: number;
            runBeforeCommit: boolean;
            runBeforeMerge: boolean;
            buildCommand: string;
            typecheckCommand: string;
            maxRetries: number;
        };
        git: {
            autoFeatureBranch: boolean;
            autoCheckpoint: boolean;
            autoMerge: boolean;
            checkpointThreshold: number;
            mainBranch: string;
        };
        recovery: {
            maxRetriesPerError: number;
            logFailures: boolean;
            skipAfterMaxRetries: boolean;
        };
    };
}
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
 * debug(config.automation.mode); // 'default'
 * debug(config.automation.testing.maxRetries); // 3
 */
export declare function getDefaultConfig(): GoodVibesConfig;
