/**
 * Context Builder Module
 *
 * Responsible for gathering and formatting all project context
 * for the session-start hook. This includes:
 * - Stack detection (frameworks, package manager, TypeScript)
 * - Git context (branch, uncommitted changes, recent commits)
 * - Environment status (.env files, missing vars)
 * - TODO/FIXME scanner
 * - Project health checks
 * - Folder structure analysis
 * - Port status for dev servers
 * - Project memory (decisions, patterns, failures)
 */
import { type RecoveryInfo } from './crash-recovery.js';
/** Result of the context gathering process */
export interface ContextGatheringResult {
    /** Formatted context string to inject into the session */
    additionalContext: string;
    /** Brief summary of the project state */
    summary: string;
    /** Whether this is a new/empty project */
    isEmptyProject: boolean;
    /** Whether there are any issues detected */
    hasIssues: boolean;
    /** Count of detected issues */
    issueCount: number;
    /** Time taken to gather context in milliseconds */
    gatherTimeMs: number;
    /** Whether crash recovery is needed */
    needsRecovery: boolean;
}
/** Creates a failed context result */
export declare function createFailedContextResult(startTime: number): ContextGatheringResult;
/**
 * Gathers all project context and formats it for session injection.
 *
 * This function orchestrates the parallel gathering of all context types
 * and formats them into a cohesive context string for the session.
 */
export declare function gatherProjectContext(projectDir: string, recoveryInfo: RecoveryInfo, startTime: number): Promise<ContextGatheringResult>;
