/**
 * Context Injection
 *
 * Gathers and formats project context for injection at session start.
 * Aggregates stack detection, git status, environment variables, TODOs,
 * health checks, and project memory into a comprehensive context snapshot.
 *
 * @module session-start/context-injection
 * @see {@link ../context} for context gathering functions
 * @see {@link ../memory} for project memory loading
 */
/** Result of gathering and formatting session context */
export interface ContextInjectionResult {
    /** Formatted context string for injection */
    context: string;
    /** Whether the project is empty */
    isEmpty: boolean;
}
/** Gathers project context and formats it for session injection */
export declare function gatherAndFormatContext(cwd: string): Promise<ContextInjectionResult>;
