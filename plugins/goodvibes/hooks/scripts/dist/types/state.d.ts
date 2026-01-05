/**
 * Type definitions for hook state management.
 *
 * This module defines the state structures used by GoodVibes hooks to track
 * session information, test results, build status, git operations, and more.
 * State is persisted to disk and restored between sessions.
 */
import type { ErrorState } from './errors.js';
/**
 * State for the current Claude session.
 * Tracks session metadata and user preferences.
 */
export interface SessionState {
    /** Unique identifier for this session (matches Claude's session ID) */
    id: string;
    /** ISO timestamp when the session started */
    startedAt: string;
    /** Operating mode: 'vibecoding' for full automation, 'justvibes' for minimal, 'default' for standard */
    mode: 'vibecoding' | 'justvibes' | 'default';
    /** User-provided description of the feature being worked on, if any */
    featureDescription: string | null;
}
/**
 * State for test execution tracking.
 * Maintains history of test runs and tracks failing tests that need attention.
 */
export interface TestState {
    /** ISO timestamp of the last complete test suite run, or null if never run */
    lastFullRun: string | null;
    /** ISO timestamp of the last quick/incremental test run, or null if never run */
    lastQuickRun: string | null;
    /** List of test file paths that passed in the most recent run */
    passingFiles: string[];
    /** List of test file paths that failed in the most recent run */
    failingFiles: string[];
    /** Tests that failed and are awaiting fixes, with retry tracking */
    pendingFixes: {
        /** Path to the failing test file */
        testFile: string;
        /** Error message or description from the test failure */
        error: string;
        /** Number of fix attempts made for this test */
        fixAttempts: number;
    }[];
}
/**
 * State for build/compilation tracking.
 * Tracks TypeScript compilation, bundler output, and build errors.
 */
export interface BuildState {
    /** ISO timestamp of the last build attempt, or null if never run */
    lastRun: string | null;
    /** Current build status: 'passing' if clean, 'failing' if errors exist, 'unknown' if not yet run */
    status: 'passing' | 'failing' | 'unknown';
    /** List of build errors with file locations */
    errors: {
        /** Path to the file containing the error */
        file: string;
        /** Line number where the error occurred */
        line: number;
        /** Error message from the compiler/bundler */
        message: string;
    }[];
    /** Number of automated fix attempts made for current errors */
    fixAttempts: number;
}
/**
 * State for git operations and branch tracking.
 * Manages feature branches, checkpoints, and merge status.
 */
export interface GitState {
    /** Name of the main/default branch (typically 'main' or 'master') */
    mainBranch: string;
    /** Name of the currently checked-out branch */
    currentBranch: string;
    /** Name of the feature branch being worked on, or null if on main */
    featureBranch: string | null;
    /** ISO timestamp when the feature branch was created, or null */
    featureStartedAt: string | null;
    /** Description of the feature being developed, or null */
    featureDescription: string | null;
    /** List of checkpoint commits created during this session */
    checkpoints: {
        /** Git commit hash (short or full) */
        hash: string;
        /** Commit message */
        message: string;
        /** ISO timestamp when the checkpoint was created */
        timestamp: string;
    }[];
    /** True if there is a merge in progress that needs resolution */
    pendingMerge: boolean;
}
/**
 * State for file modification tracking.
 * Tracks which files have been changed during the session for rollback support.
 */
export interface FileState {
    /** Files modified since the last git checkpoint/commit */
    modifiedSinceCheckpoint: string[];
    /** All files modified during this session (cumulative) */
    modifiedThisSession: string[];
    /** New files created during this session */
    createdThisSession: string[];
}
/**
 * State for running development servers.
 * Indexed by process ID to track multiple concurrent servers.
 */
export interface DevServerState {
    [pid: string]: {
        /** The command used to start the server (e.g., 'npm run dev') */
        command: string;
        /** Port number the server is listening on */
        port: number;
        /** ISO timestamp when the server was started */
        startedAt: string;
        /** Last error message from the server, or null if running cleanly */
        lastError: string | null;
    };
}
/**
 * Root state container for all hook state data.
 * This is the top-level structure persisted to .goodvibes/state.json.
 */
export interface HooksState {
    /** Current session metadata */
    session: SessionState;
    /** Map of error fingerprints to error state (for deduplication) */
    errors: Record<string, ErrorState>;
    /** Test execution tracking */
    tests: TestState;
    /** Build/compilation tracking */
    build: BuildState;
    /** Git operations and branch state */
    git: GitState;
    /** File modification tracking */
    files: FileState;
    /** Running development servers by PID */
    devServers: DevServerState;
}
/** Creates a new default state object with sensible defaults. */
export declare function createDefaultState(): HooksState;
