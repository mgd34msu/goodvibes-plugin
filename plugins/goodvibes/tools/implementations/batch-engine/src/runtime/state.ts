/**
 * State Manager implementation for Batch Engine
 * @see SPEC-v2 Sections 7.1-7.3
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
  GoodVibesState,
  SessionState,
  AgentState,
  CheckpointState,
  LockState,
  ActiveAgent,
  CompletedAgent,
  Checkpoint,
  Lock,
  HealthResult,
} from '../interfaces/state.js';
import type { StateManager, AgentResult } from '../interfaces/state-api.js';
import {
  STATE_PATHS,
  getCheckpointPath,
  type StatePath,
  type StateFileManager,
} from '../interfaces/state-files.js';

/**
 * Generate a unique ID with prefix
 */
function generateId(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Create default health result
 */
function createDefaultHealthResult(): HealthResult {
  return {
    status: 'unknown',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create default session state
 */
function createDefaultSessionState(): SessionState {
  return {
    id: generateId('session'),
    started_at: new Date().toISOString(),
    mode: 'vibecoding',
    batches_completed: 0,
    operations_completed: 0,
    tokens_used: 0,
    last_typecheck: createDefaultHealthResult(),
    last_lint: createDefaultHealthResult(),
    last_test: createDefaultHealthResult(),
    last_build: createDefaultHealthResult(),
    git: {
      main_branch: 'main',
      current_branch: 'main',
      uncommitted_files: [],
      last_commit: '',
    },
    files: {
      modified_this_session: [],
      created_this_session: [],
      deleted_this_session: [],
    },
  };
}

/**
 * Create default agent state
 */
function createDefaultAgentState(): AgentState {
  return {
    active: new Map(),
    completed: [],
    total_spawned: 0,
    total_tokens: 0,
  };
}

/**
 * Create default checkpoint state
 */
function createDefaultCheckpointState(): CheckpointState {
  return {
    checkpoints: [],
    max_checkpoints: 10,
    cleanup_after_hours: 24,
  };
}

/**
 * Create default lock state
 */
function createDefaultLockState(): LockState {
  return {
    locks: [],
  };
}

/**
 * Create default GoodVibes state
 */
function createDefaultState(): GoodVibesState {
  return {
    session: createDefaultSessionState(),
    agents: createDefaultAgentState(),
    checkpoints: createDefaultCheckpointState(),
    locks: createDefaultLockState(),
  };
}

/**
 * StateManager implementation
 */
export class StateManagerImpl implements StateManager {
  private state: GoodVibesState;
  private projectRoot: string;
  private changeCallbacks: Set<(state: GoodVibesState) => void>;
  private persistLock: Promise<void> | null = null;

  constructor(projectRoot: string = process.cwd()) {
    this.state = createDefaultState();
    this.projectRoot = projectRoot;
    this.changeCallbacks = new Set();
  }

  // =========================================================================
  // StateManager Extended Methods
  // =========================================================================

  getState(): GoodVibesState {
    return this.state;
  }

  reset(): void {
    this.state = createDefaultState();
    this.notifyChange();
  }

  onStateChange(callback: (state: GoodVibesState) => void): () => void {
    this.changeCallbacks.add(callback);
    return () => this.changeCallbacks.delete(callback);
  }

  private notifyChange(): void {
    for (const callback of this.changeCallbacks) {
      try {
        callback(this.state);
      } catch {
        // Ignore callback errors
      }
    }
  }

  // =========================================================================
  // Session Methods
  // =========================================================================

  getSession(): SessionState {
    return this.state.session;
  }

  updateSession(updates: Partial<SessionState>): void {
    this.state.session = { ...this.state.session, ...updates };
    this.notifyChange();
  }

  // =========================================================================
  // Agent Methods
  // =========================================================================

  registerAgent(agent: ActiveAgent): void {
    this.state.agents.active.set(agent.id, agent);
    this.state.agents.total_spawned++;
    this.notifyChange();
  }

  updateAgent(id: string, updates: Partial<ActiveAgent>): void {
    const agent = this.state.agents.active.get(id);
    if (agent) {
      this.state.agents.active.set(id, { ...agent, ...updates });
      this.notifyChange();
    }
  }

  completeAgent(id: string, result: AgentResult): void {
    const agent = this.state.agents.active.get(id);
    if (!agent) return;

    const completed: CompletedAgent = {
      id: agent.id,
      agent_type: agent.agent_type,
      task: agent.task,
      started_at: agent.started_at,
      completed_at: new Date().toISOString(),
      status: result.status,
      tokens_used: result.tokens_used,
      turns_used: result.turns_used,
      files_modified: result.files_modified,
      summary: result.summary,
    };

    this.state.agents.active.delete(id);
    this.state.agents.completed.push(completed);
    this.state.agents.total_tokens += result.tokens_used;
    this.notifyChange();
  }

  getActiveAgents(): ActiveAgent[] {
    return Array.from(this.state.agents.active.values());
  }

  // =========================================================================
  // Checkpoint Methods
  // =========================================================================

  createCheckpoint(batch_id: string, reason: string): Checkpoint {
    const id = generateId('cp');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.state.checkpoints.cleanup_after_hours * 60 * 60 * 1000);

    const checkpoint: Checkpoint = {
      id,
      created_at: now.toISOString(),
      batch_id,
      type: 'auto',
      files: [],
      state_snapshot: JSON.stringify(this.state.session),
      reason,
      expires_at: expiresAt.toISOString(),
    };

    this.state.checkpoints.checkpoints.push(checkpoint);

    // Cleanup old checkpoints if exceeding max
    while (this.state.checkpoints.checkpoints.length > this.state.checkpoints.max_checkpoints) {
      this.state.checkpoints.checkpoints.shift();
    }

    this.notifyChange();
    return checkpoint;
  }

  restoreCheckpoint(checkpoint_id: string): void {
    const checkpoint = this.state.checkpoints.checkpoints.find(cp => cp.id === checkpoint_id);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpoint_id}`);
    }

    try {
      const restoredSession = JSON.parse(checkpoint.state_snapshot) as SessionState;
      this.state.session = restoredSession;
      this.notifyChange();
    } catch {
      throw new Error(`Failed to restore checkpoint: ${checkpoint_id}`);
    }
  }

  cleanupCheckpoints(): void {
    const now = new Date();
    this.state.checkpoints.checkpoints = this.state.checkpoints.checkpoints.filter(cp => {
      if (!cp.expires_at) return true;
      return new Date(cp.expires_at) > now;
    });
    this.notifyChange();
  }

  // =========================================================================
  // Lock Methods
  // =========================================================================

  acquireLock(lock: Omit<Lock, 'id' | 'acquired_at'>): Lock | null {
    // Check if already locked
    const existingLock = this.state.locks.locks.find(l => l.target === lock.target);
    if (existingLock) {
      if (existingLock.mode === 'exclusive') {
        return null;
      }
      if (lock.mode === 'exclusive') {
        return null;
      }
    }

    const newLock: Lock = {
      ...lock,
      id: generateId('lock'),
      acquired_at: new Date().toISOString(),
    };

    this.state.locks.locks.push(newLock);
    this.notifyChange();
    return newLock;
  }

  releaseLock(lock_id: string): void {
    const index = this.state.locks.locks.findIndex(l => l.id === lock_id);
    if (index !== -1) {
      this.state.locks.locks.splice(index, 1);
      this.notifyChange();
    }
  }

  isLocked(target: string): boolean {
    return this.state.locks.locks.some(l => l.target === target);
  }

  // =========================================================================
  // Persistence Methods
  // =========================================================================

  async persist(): Promise<void> {
    // Serialize persistence to avoid race conditions
    if (this.persistLock) {
      await this.persistLock;
    }

    this.persistLock = this.doPersist();
    await this.persistLock;
    this.persistLock = null;
  }

  private async doPersist(): Promise<void> {
    await this.ensureDirectories();

    // Convert Map to array for serialization
    const agentsForStorage = {
      ...this.state.agents,
      active: Array.from(this.state.agents.active.entries()),
    };

    // Write session state
    await this.writeStateFile(
      STATE_PATHS.SESSION_FILE,
      this.state.session
    );

    // Write agents state
    await this.writeStateFile(
      STATE_PATHS.AGENTS_FILE,
      agentsForStorage
    );

    // Write locks state
    await this.writeStateFile(
      STATE_PATHS.LOCKS_FILE,
      this.state.locks
    );

    // Write health state
    await this.writeStateFile(
      STATE_PATHS.HEALTH_FILE,
      {
        typecheck: this.state.session.last_typecheck,
        lint: this.state.session.last_lint,
        test: this.state.session.last_test,
        build: this.state.session.last_build,
      }
    );
  }

  async load(): Promise<void> {
    await this.ensureDirectories();

    // Load session state
    const session = await this.readStateFile<SessionState>(STATE_PATHS.SESSION_FILE);
    if (session) {
      this.state.session = session;
    }

    // Load agents state
    const agentsData = await this.readStateFile<{
      active: [string, ActiveAgent][];
      completed: CompletedAgent[];
      total_spawned: number;
      total_tokens: number;
    }>(STATE_PATHS.AGENTS_FILE);
    if (agentsData) {
      this.state.agents = {
        active: new Map(agentsData.active || []),
        completed: agentsData.completed || [],
        total_spawned: agentsData.total_spawned || 0,
        total_tokens: agentsData.total_tokens || 0,
      };
    }

    // Load locks state
    const locks = await this.readStateFile<LockState>(STATE_PATHS.LOCKS_FILE);
    if (locks) {
      this.state.locks = locks;
    }

    // Load health state
    const health = await this.readStateFile<{
      typecheck: HealthResult;
      lint: HealthResult;
      test: HealthResult;
      build: HealthResult;
    }>(STATE_PATHS.HEALTH_FILE);
    if (health) {
      this.state.session.last_typecheck = health.typecheck || createDefaultHealthResult();
      this.state.session.last_lint = health.lint || createDefaultHealthResult();
      this.state.session.last_test = health.test || createDefaultHealthResult();
      this.state.session.last_build = health.build || createDefaultHealthResult();
    }

    this.notifyChange();
  }

  // =========================================================================
  // File System Helpers
  // =========================================================================

  private getAbsolutePath(relativePath: string): string {
    return path.join(this.projectRoot, relativePath);
  }

  private async ensureDirectories(): Promise<void> {
    const dirs = [
      STATE_PATHS.ROOT,
      STATE_PATHS.STATE_DIR,
      STATE_PATHS.CHECKPOINTS_DIR,
      STATE_PATHS.CACHE_DIR,
    ];

    for (const dir of dirs) {
      const absPath = this.getAbsolutePath(dir);
      try {
        await fs.mkdir(absPath, { recursive: true });
      } catch {
        // Directory may already exist
      }
    }
  }

  private async readStateFile<T>(relativePath: StatePath): Promise<T | null> {
    const absPath = this.getAbsolutePath(relativePath);
    try {
      const content = await fs.readFile(absPath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  private async writeStateFile<T>(relativePath: StatePath, data: T): Promise<void> {
    const absPath = this.getAbsolutePath(relativePath);
    await fs.writeFile(absPath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

/**
 * Create a new StateManager instance
 */
export function createStateManager(projectRoot?: string): StateManager {
  return new StateManagerImpl(projectRoot);
}

/**
 * Singleton state manager instance
 */
let globalStateManager: StateManager | null = null;

/**
 * Get the global StateManager instance
 */
export function getStateManager(projectRoot?: string): StateManager {
  if (!globalStateManager) {
    globalStateManager = createStateManager(projectRoot);
  }
  return globalStateManager;
}

/**
 * Reset the global StateManager (useful for testing)
 */
export function resetGlobalStateManager(): void {
  globalStateManager = null;
}
