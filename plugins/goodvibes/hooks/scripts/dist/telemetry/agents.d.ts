/**
 * Agent State Management
 *
 * Provides active agent state tracking for SubagentStart/Stop correlation.
 */
/** Maximum age in ms for stale agent cleanup (24 hours). */
export declare const STALE_AGENT_MAX_AGE_MS: number;
/** Represents an active agent entry being tracked for telemetry. */
export interface ActiveAgentEntry {
    agent_id: string;
    agent_type: string;
    session_id: string;
    cwd: string;
    project_name: string;
    started_at: string;
    git_branch?: string;
    git_commit?: string;
    task_description?: string;
}
/** State containing all currently active agents. */
export interface ActiveAgentsState {
    agents: Record<string, ActiveAgentEntry>;
    last_updated: string;
}
/** Git branch and commit information. */
export interface GitInfo {
    branch?: string;
    commit?: string;
}
/**
 * Get the path to the active agents file
 */
export declare function getActiveAgentsFilePath(goodVibesDir: string, stateDir: string): string;
/**
 * Get git branch and commit info for the current directory
 */
export declare function getGitInfo(cwd: string): Promise<GitInfo>;
/**
 * Derive project name from working directory path
 */
export declare function deriveProjectName(cwd: string): string;
/**
 * Load active agents state from file
 */
export declare function loadActiveAgents(activeAgentsFile: string): Promise<ActiveAgentsState>;
/**
 * Save active agents state to file
 */
export declare function saveActiveAgents(activeAgentsFile: string, state: ActiveAgentsState): Promise<void>;
/**
 * Register a new active agent
 */
export declare function registerActiveAgent(activeAgentsFile: string, entry: ActiveAgentEntry): Promise<void>;
/**
 * Look up and remove an active agent entry
 */
export declare function popActiveAgent(activeAgentsFile: string, agentId: string): Promise<ActiveAgentEntry | null>;
/** Removes agent entries older than 24 hours. Returns count of removed entries. */
export declare function cleanupStaleAgents(activeAgentsFile: string): Promise<number>;
