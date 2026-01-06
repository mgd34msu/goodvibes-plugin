/** Context to inject into a subagent session */
export interface SubagentContext {
    /** Additional context string to inject (always contains at least project info) */
    additionalContext: string;
}
/** Builds context for a subagent based on agent type and project */
export declare function buildSubagentContext(cwd: string, agentType: string, _sessionId: string): Promise<SubagentContext>;
