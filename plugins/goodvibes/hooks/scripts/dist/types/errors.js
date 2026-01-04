/**
 * Type definitions for error tracking and recovery.
 */
/** Retry limits per error category before escalating to next phase. */
export const PHASE_RETRY_LIMITS = {
    npm_install: 2,
    typescript_error: 3,
    test_failure: 2,
    build_failure: 2,
    file_not_found: 1,
    git_conflict: 2,
    database_error: 2,
    api_error: 2,
    unknown: 2,
};
