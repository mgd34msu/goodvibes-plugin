/**
 * Type definitions for error tracking and recovery.
 */
/**
 * Categories of errors for specialized handling.
 * Each category has specific retry limits and recovery strategies.
 */
export type ErrorCategory = 'npm_install' | 'typescript_error' | 'test_failure' | 'build_failure' | 'file_not_found' | 'git_conflict' | 'database_error' | 'api_error' | 'unknown';
/**
 * State for tracking an error through retry phases.
 * Maintains attempt counters, documentation searches, and fix strategies tried.
 */
export interface ErrorState {
    signature: string;
    category: ErrorCategory;
    phase: 1 | 2 | 3;
    attemptsThisPhase: number;
    totalAttempts: number;
    officialDocsSearched: string[];
    officialDocsContent: string;
    unofficialDocsSearched: string[];
    unofficialDocsContent: string;
    fixStrategiesAttempted: {
        phase: number;
        strategy: string;
        succeeded: boolean;
        timestamp: string;
    }[];
}
/**
 * Retry limits per error category before escalating to next phase.
 * Different error types get different retry budgets based on their complexity.
 */
export declare const PHASE_RETRY_LIMITS: Record<ErrorCategory, number>;
