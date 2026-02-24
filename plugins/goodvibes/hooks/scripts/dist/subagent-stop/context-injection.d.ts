/**
 * Subagent Stop Context Injection
 *
 * Builds context to inject back into the main context (orchestrator) when a subagent completes.
 * Provides reminders about:
 * - Using agents for all work (delegation pattern)
 * - Using GoodVibes memory/state/logging functions in .goodvibes/ directory
 * - Agent chaining based on completed work
 *
 * @module subagent-stop/context-injection
 */
/** Context to inject into the main context after a subagent completes */
export interface OrchestratorContext {
    /** System message to inject (reminders for orchestrator) */
    systemMessage: string;
}
/**
 * Builds context for the orchestrator after a subagent completes.
 * Reminds about delegation patterns and GoodVibes state management.
 *
 * @param cwd - The current working directory (project root)
 * @param agentType - The type of agent that just completed
 * @param agentId - The ID of the agent that completed
 * @param success - Whether the agent completed successfully
 * @returns OrchestratorContext with system message reminders
 *
 * @example
 * const context = buildOrchestratorContext(cwd, 'backend-engineer', 'abc123', true);
 * // Returns context with delegation and state management reminders
 */
export declare function buildOrchestratorContext(cwd: string, agentType: string, agentId: string, success: boolean): OrchestratorContext;
