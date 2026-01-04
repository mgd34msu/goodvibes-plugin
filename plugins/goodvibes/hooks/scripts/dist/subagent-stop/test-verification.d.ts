import type { HooksState } from '../types/state.js';
/** Result of verifying tests for agent-modified files */
export interface TestVerificationResult {
    /** Whether tests were run */
    ran: boolean;
    /** Whether all tests passed */
    passed: boolean;
    /** Summary of test results */
    summary: string;
}
/** Runs tests for files modified by an agent */
export declare function verifyAgentTests(cwd: string, filesModified: string[], state: HooksState): Promise<TestVerificationResult>;
