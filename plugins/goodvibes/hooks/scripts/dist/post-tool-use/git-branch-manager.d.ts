import type { HooksState } from '../types/state.js';
/** Determines if a feature branch should be created based on current state */
export declare function shouldCreateFeatureBranch(state: HooksState, _cwd: string): boolean;
/** Creates a feature branch if conditions are met */
export declare function maybeCreateFeatureBranch(state: HooksState, cwd: string, featureName?: string): Promise<{
    created: boolean;
    branchName: string | null;
}>;
/** Checks if the current feature branch is ready to be merged */
export declare function shouldMergeFeature(state: HooksState): boolean;
/** Merges the feature branch if conditions are met */
export declare function maybeMergeFeature(state: HooksState, cwd: string): Promise<{
    merged: boolean;
    message: string;
}>;
