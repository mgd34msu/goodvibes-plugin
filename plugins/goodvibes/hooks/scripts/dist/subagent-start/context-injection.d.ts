/**
 * Subagent Context Injection
 *
 * Builds context for subagent sessions based on agent type and project configuration.
 * Provides:
 * - Universal reminder to prefer skills and MCP tools over raw bash/shell commands
 * - Agent-specific reminders and guidelines (e.g., write-local for backend,
 *   test quality for test engineers, scoring for reviewers)
 *
 * @module subagent-start/context-injection
 * @see {@link ../session-start/context-injection} for main session context
 */
/** Protocol skills that should be loaded before starting work */
export declare const PROTOCOL_SKILLS: string[];
/** Agent-specific skill recommendations based on role */
export declare const AGENT_SKILL_MAP: Record<string, string[]>;
/** Skill catalog with descriptions and validation scripts */
export declare const SKILL_CATALOG: Record<string, {
    description: string;
    path: string;
    scripts: string[];
}>;
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
 * @param agentType - The type of agent (e.g., 'engineer', 'reviewer', 'tester')
 * @param _sessionId - The session ID (reserved for future use)
 * @returns Promise resolving to SubagentContext with additional context string
 *
 * @example
 * const context = await buildSubagentContext(cwd, 'goodvibes:engineer', sessionId);
 * // Returns context with write-local and skill recommendations
 */
export declare function buildSubagentContext(cwd: string, agentType: string, _sessionId: string): Promise<SubagentContext>;
