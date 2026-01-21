/**
 * State Structure interfaces for Batch Engine
 * @see SPEC-v2 Section 7.1
 */

export interface GoodVibesState {
  session: SessionState;
  agents: AgentState;
  checkpoints: CheckpointState;
  locks: LockState;
}

export interface SessionState {
  id: string;
  started_at: string;
  mode: 'vibecoding' | 'justvibes';
  current_batch?: string;
  current_feature?: string;
  batches_completed: number;
  operations_completed: number;
  tokens_used: number;
  last_typecheck: HealthResult;
  last_lint: HealthResult;
  last_test: HealthResult;
  last_build: HealthResult;
  git: {
    main_branch: string;
    current_branch: string;
    feature_branch?: string;
    uncommitted_files: string[];
    last_commit: string;
  };
  files: {
    modified_this_session: string[];
    created_this_session: string[];
    deleted_this_session: string[];
  };
}

export interface HealthResult {
  status: 'pass' | 'fail' | 'unknown';
  timestamp: string;
  errors?: number;
  warnings?: number;
}

export interface AgentState {
  active: Map<string, ActiveAgent>;
  completed: CompletedAgent[];
  total_spawned: number;
  total_tokens: number;
}

export interface ActiveAgent {
  id: string;
  agent_type: string;
  task: string;
  started_at: string;
  budget: {
    max_tokens: number;
    max_turns: number;
    tokens_used: number;
    turns_used: number;
  };
  batch_id: string;
  operation_id: string;
}

export interface CompletedAgent {
  id: string;
  agent_type: string;
  task: string;
  started_at: string;
  completed_at: string;
  status: 'success' | 'failed' | 'timeout' | 'budget_exceeded';
  tokens_used: number;
  turns_used: number;
  files_modified: string[];
  summary?: string;
}

export interface CheckpointState {
  checkpoints: Checkpoint[];
  max_checkpoints: number;
  cleanup_after_hours: number;
}

export interface Checkpoint {
  id: string;
  created_at: string;
  batch_id: string;
  type: 'auto' | 'manual' | 'pre_risky';
  files: {
    path: string;
    backup_path: string;
    hash: string;
  }[];
  state_snapshot: string;
  reason: string;
  expires_at: string;
}

export interface LockState {
  locks: Lock[];
}

export interface Lock {
  id: string;
  type: 'file' | 'resource';
  target: string;
  mode: 'exclusive' | 'shared';
  holder: string;
  acquired_at: string;
  expires_at?: string;
}
