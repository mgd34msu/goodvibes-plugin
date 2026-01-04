/**
 * Type definitions for hook state management.
 */
import type { ErrorState } from './errors.js';
/** State for the current session. */
export interface SessionState {
    id: string;
    startedAt: string;
    mode: 'vibecoding' | 'justvibes' | 'default';
    featureDescription: string | null;
}
/** State for test execution tracking. */
export interface TestState {
    lastFullRun: string | null;
    lastQuickRun: string | null;
    passingFiles: string[];
    failingFiles: string[];
    pendingFixes: {
        testFile: string;
        error: string;
        fixAttempts: number;
    }[];
}
/** State for build execution tracking. */
export interface BuildState {
    lastRun: string | null;
    status: 'passing' | 'failing' | 'unknown';
    errors: {
        file: string;
        line: number;
        message: string;
    }[];
    fixAttempts: number;
}
/** State for git operations tracking. */
export interface GitState {
    mainBranch: string;
    currentBranch: string;
    featureBranch: string | null;
    featureStartedAt: string | null;
    featureDescription: string | null;
    checkpoints: {
        hash: string;
        message: string;
        timestamp: string;
    }[];
    pendingMerge: boolean;
}
/** State for file modification tracking. */
export interface FileState {
    modifiedSinceCheckpoint: string[];
    modifiedThisSession: string[];
    createdThisSession: string[];
}
/** State for running development servers. */
export interface DevServerState {
    [pid: string]: {
        command: string;
        port: number;
        startedAt: string;
        lastError: string | null;
    };
}
/** Root state container for all hook state data. */
export interface HooksState {
    session: SessionState;
    errors: Record<string, ErrorState>;
    tests: TestState;
    build: BuildState;
    git: GitState;
    files: FileState;
    devServers: DevServerState;
}
/** Creates a new default state object with sensible defaults. */
export declare function createDefaultState(): HooksState;
