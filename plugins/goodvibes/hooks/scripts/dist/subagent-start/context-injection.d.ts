/**
 * Subagent Context Injection
 *
 * Builds context for subagent sessions based on agent type and project configuration.
 * Provides agent-specific reminders and guidelines (e.g., write-local for backend,
 * test quality for test engineers, scoring for reviewers).
 *
 * @module subagent-start/context-injection
 * @see {@link ../session-start/context-injection} for main session context
 */
/** Context to inject into a subagent session */
export interface SubagentContext {
    /** Additional context string to inject (always contains at least project info) */
    additionalContext: string;
}
/**
 * Builds context for a subagent based on agent type and project.
 * Adds agent-specific reminders (write-local, test quality, scoring, etc.).
 *
 * @param cwd - The current working directory (project root)
 * @param agentType - The type of agent (e.g., 'backend-engineer', 'test-engineer')
 * @param _sessionId - The session ID (reserved for future use)
 * @returns Promise resolving to SubagentContext with additional context string
 *
 * @example
 * const context = await buildSubagentContext(cwd, 'backend-engineer', sessionId);
 * // Returns context with write-local reminder
 */
export declare function buildSubagentContext(cwd: string, agentType: string, _sessionId: string): Promise<SubagentContext>;
