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
/**
 * Gathers project context and formats it for session injection.
 * Collects stack info, git status, environment, TODOs, health checks, and memory.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to ContextInjectionResult with formatted context
 *
 * @example
 * const result = await gatherAndFormatContext('/path/to/project');
 * if (!result.isEmpty) {
 *   console.log(result.context);
 * }
 */
export declare function gatherAndFormatContext(cwd: string): Promise<ContextInjectionResult>;
