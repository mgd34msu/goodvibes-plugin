/**
 * Agent Tracker Plugin — Type Definitions
 *
 * Types for tracking agent lifecycle via subagent-start/stop hook events.
 */

/** Status of a tracked agent. */
export type TrackedAgentStatus = 'spawned' | 'completed' | 'failed';

/** A tracked agent entry. */
export interface TrackedAgent {
  /** Unique agent identifier. */
  id: string;
  /** Agent type (e.g. 'goodvibes:engineer', 'goodvibes:reviewer'). */
  type: string;
  /** WRFC workflow ID this agent is bound to, if any. */
  workflow_id: string | null;
  /** Current lifecycle status. */
  status: TrackedAgentStatus;
  /** Epoch ms when the agent was spawned. */
  spawned_at: number;
  /** Epoch ms when the agent completed or failed. */
  finished_at: number | null;
  /** Duration in ms (populated on completion/failure). */
  duration_ms: number | null;
}

/** Aggregate stats returned by the tracker. */
export interface AgentTrackerStats {
  /** Total agents tracked this session. */
  total: number;
  /** Currently active (spawned but not finished). */
  active: number;
  /** Completed successfully. */
  completed: number;
  /** Failed. */
  failed: number;
  /** Distinct workflow IDs seen. */
  workflows: number;
}
