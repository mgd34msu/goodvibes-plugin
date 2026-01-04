/**
 * Type definitions for GoodVibes automation configuration.
 */
/** Configuration for GoodVibes automation behavior. */
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
/** Returns the default configuration with sensible defaults. */
export declare function getDefaultConfig(): GoodVibesConfig;
