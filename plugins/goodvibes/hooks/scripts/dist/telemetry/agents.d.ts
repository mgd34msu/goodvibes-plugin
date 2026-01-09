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
 * Gets the path to the active agents file.
 *
 * @param goodVibesDir - Path to the .goodvibes directory
 * @param stateDir - Name of the state subdirectory
 * @returns Full path to the active-agents.json file
 *
 * @example
 * const filePath = getActiveAgentsFilePath('/project/.goodvibes', 'state');
 * // Returns: '/project/.goodvibes/state/active-agents.json'
 */
export declare function getActiveAgentsFilePath(goodVibesDir: string, stateDir: string): string;
/**
 * Gets git branch and commit info for the current directory.
 * Returns partial results if git commands fail.
 *
 * @param cwd - The current working directory
 * @returns Promise resolving to GitInfo with branch and/or commit
 *
 * @example
 * const gitInfo = await getGitInfo('/path/to/project');
 * // Returns: { branch: 'main', commit: 'abc123' }
 */
export declare function getGitInfo(cwd: string): Promise<GitInfo>;
/**
 * Derives project name from working directory path.
 * Falls back to parent directory name for temp directories.
 *
 * @param cwd - The current working directory
 * @returns Project name string (directory name or 'unknown-project')
 *
 * @example
 * deriveProjectName('/home/user/my-project');
 * // Returns: 'my-project'
 */
export declare function deriveProjectName(cwd: string): string;
/**
 * Loads active agents state from file.
 * Returns empty state if file doesn't exist or is invalid.
 *
 * @param activeAgentsFile - Path to the active-agents.json file
 * @returns Promise resolving to ActiveAgentsState
 *
 * @example
 * const state = await loadActiveAgents('/project/.goodvibes/state/active-agents.json');
 */
export declare function loadActiveAgents(activeAgentsFile: string): Promise<ActiveAgentsState>;
/**
 * Saves active agents state to file.
 * Updates the last_updated timestamp automatically.
 *
 * @param activeAgentsFile - Path to the active-agents.json file
 * @param state - The ActiveAgentsState to save
 * @returns Promise that resolves when state is saved
 */
export declare function saveActiveAgents(activeAgentsFile: string, state: ActiveAgentsState): Promise<void>;
/**
 * Registers a new active agent.
 * Adds the agent entry to the active agents state file.
 *
 * @param activeAgentsFile - Path to the active-agents.json file
 * @param entry - The agent entry to register
 * @returns Promise that resolves when agent is registered
 *
 * @example
 * await registerActiveAgent(filePath, {
 *   agent_id: 'agent-123',
 *   agent_type: 'backend-engineer',
 *   session_id: 'session-456',
 *   // ...other fields
 * });
 */
export declare function registerActiveAgent(activeAgentsFile: string, entry: ActiveAgentEntry): Promise<void>;
/**
 * Looks up and removes an active agent entry.
 * Used when an agent completes to retrieve its start data and clean up.
 *
 * @param activeAgentsFile - Path to the active-agents.json file
 * @param agentId - The unique identifier of the agent to pop
 * @returns Promise resolving to the agent entry, or null if not found
 *
 * @example
 * const entry = await popActiveAgent(filePath, 'agent-123');
 * if (entry) {
 *   const duration = Date.now() - new Date(entry.started_at).getTime();
 * }
 */
export declare function popActiveAgent(activeAgentsFile: string, agentId: string): Promise<ActiveAgentEntry | null>;
/**
 * Removes agent entries older than 24 hours.
 * Cleans up orphaned agents that were never properly stopped.
 *
 * @param activeAgentsFile - Path to the active-agents.json file
 * @returns Promise resolving to count of removed entries
 *
 * @example
 * const removed = await cleanupStaleAgents(filePath);
 * console.log(`Cleaned up ${removed} stale agents`);
 */
export declare function cleanupStaleAgents(activeAgentsFile: string): Promise<number>;
