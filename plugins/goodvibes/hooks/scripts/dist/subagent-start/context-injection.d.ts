/** Context to inject into a subagent session */
export interface SubagentContext {
    /** Additional context string to inject, or null if none */
    additionalContext: string | null;
}
/** Builds context for a subagent based on agent type and project */
export declare function buildSubagentContext(cwd: string, agentType: string, _sessionId: string): SubagentContext;
