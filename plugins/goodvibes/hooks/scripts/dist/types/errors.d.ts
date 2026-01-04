/**
 * Type definitions for error tracking and recovery.
 */
/** State for tracking an error through retry phases. */
export interface ErrorState {
    signature: string;
    category: string;
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
/** Categories of errors for specialized handling. */
export type ErrorCategory = 'npm_install' | 'typescript_error' | 'test_failure' | 'build_failure' | 'file_not_found' | 'git_conflict' | 'database_error' | 'api_error' | 'unknown';
/** Retry limits per error category before escalating to next phase. */
export declare const PHASE_RETRY_LIMITS: Record<ErrorCategory, number>;
