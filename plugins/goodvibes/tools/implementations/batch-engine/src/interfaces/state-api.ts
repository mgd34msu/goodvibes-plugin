/**
 * State Operations API interfaces for Batch Engine
 * @see SPEC-v2 Section 7.3
 */

import type {
  SessionState,
  ActiveAgent,
  CompletedAgent,
  Checkpoint,
  Lock
} from './state.js';

export interface AgentResult {
  status: 'success' | 'failed' | 'timeout' | 'budget_exceeded';
  tokens_used: number;
  turns_used: number;
  files_modified: string[];
  files_read?: number;
  tool_calls?: number;
  tools_used?: string[];
  summary?: string;
}

export interface StateAPI {
  // Session
  getSession(): SessionState;
  updateSession(updates: Partial<SessionState>): void;

  // Agents
  registerAgent(agent: ActiveAgent): void;
  updateAgent(id: string, updates: Partial<ActiveAgent>): void;
  completeAgent(id: string, result: AgentResult): void;
  getActiveAgents(): ActiveAgent[];

  // Checkpoints
  createCheckpoint(batch_id: string, reason: string): Checkpoint;
  restoreCheckpoint(checkpoint_id: string): void;
  cleanupCheckpoints(): void;

  // Locks
  acquireLock(lock: Omit<Lock, 'id' | 'acquired_at'>): Lock | null;
  releaseLock(lock_id: string): void;
  isLocked(target: string): boolean;

  // Persistence
  persist(): Promise<void>;
  load(): Promise<void>;
}

export interface StateManager extends StateAPI {
  // Extended functionality
  getState(): import('./state.js').GoodVibesState;
  reset(): void;

  // Events
  onStateChange(callback: (state: import('./state.js').GoodVibesState) => void): () => void;
}
