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
/** Builds context for a subagent based on agent type and project */
export declare function buildSubagentContext(cwd: string, agentType: string, _sessionId: string): Promise<SubagentContext>;
