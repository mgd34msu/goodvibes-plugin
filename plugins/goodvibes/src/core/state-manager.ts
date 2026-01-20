import { randomUUID } from "crypto";

/**
 * Represents the current session state for the GoodVibes plugin.
 */
export interface SessionState {
  /** Unique session identifier (UUID v4) */
  id: string;
  /** ISO 8601 timestamp when the session started */
  started_at: string;
  /** Current operational mode */
  mode: "vibecoding" | "justvibes";
  /** Current working directory */
  cwd: string;
  /** Detected project root directory */
  project_root: string;
}

/**
 * Represents the state of a spawned agent.
 */
export interface AgentState {
  /** Unique agent identifier */
  id: string;
  /** Agent type (backend-engineer, frontend-architect, etc.) */
  type: string;
  /** Task description */
  task: string;
  /** Current status */
  status: "queued" | "running" | "completed" | "failed";
  /** ISO timestamp when spawned */
  spawned_at: string;
  /** ISO timestamp when completed (if applicable) */
  completed_at?: string;
  /** Parent agent ID if nested */
  parent_id?: string;
  /** Budget tracking */
  budget: AgentBudget;
  /** Error message if failed */
  error?: string;
}

/**
 * Budget allocation for an agent.
 */
export interface AgentBudget {
  /** Maximum tokens allocated */
  allocated: number;
  /** Tokens used so far */
  spent: number;
  /** Remaining tokens (allocated - spent) */
  remaining: number;
}

/**
 * Represents a file lock.
 */
export interface FileLock {
  /** Absolute file path */
  path: string;
  /** Agent ID or 'orchestrator' */
  holder: string;
  /** ISO timestamp when acquired */
  acquired_at: string;
  /** Lock timeout in milliseconds */
  timeout_ms: number;
  /** Purpose of the lock */
  purpose: string;
}

/**
 * Represents a dirty (modified) file.
 */
export interface DirtyFile {
  /** Absolute file path */
  path: string;
  /** ISO timestamp when modified */
  modified_at: string;
  /** Agent ID or 'orchestrator' that modified it */
  modified_by: string;
  /** Hash of original content (for rollback) */
  original_hash?: string;
}

/**
 * Manages session state, agents, locks, and dirty files for the GoodVibes plugin.
 */
export class StateManager {
  private session: SessionState;
  private agents: Map<string, AgentState>;
  private locks: Map<string, FileLock>;
  private dirty: Map<string, DirtyFile>;

  /**
   * Creates a new StateManager instance.
   * @param cwd - The current working directory
   * @param mode - The operational mode, defaults to "vibecoding"
   */
  constructor(cwd: string, mode: "vibecoding" | "justvibes" = "vibecoding") {
    this.session = {
      id: randomUUID(),
      started_at: new Date().toISOString(),
      mode,
      cwd,
      project_root: this.detectProjectRoot(cwd),
    };
    this.agents = new Map();
    this.locks = new Map();
    this.dirty = new Map();
  }

  /**
   * Detects the project root by looking for common project markers.
   */
  private detectProjectRoot(cwd: string): string {
    // For now, use cwd as project root
    // Future: traverse up to find package.json, .git, etc.
    return cwd;
  }

  // ============ Session Methods ============

  /**
   * Returns the complete session state object.
   */
  getSession(): SessionState {
    return { ...this.session };
  }

  /**
   * Returns the unique session identifier.
   */
  getSessionId(): string {
    return this.session.id;
  }

  /**
   * Returns the current operational mode.
   */
  getMode(): "vibecoding" | "justvibes" {
    return this.session.mode;
  }

  /**
   * Sets the operational mode.
   */
  setMode(mode: "vibecoding" | "justvibes"): void {
    this.session.mode = mode;
  }

  /**
   * Calculates the duration since the session started.
   * @returns Duration in milliseconds
   */
  getSessionDuration(): number {
    const startTime = new Date(this.session.started_at).getTime();
    return Date.now() - startTime;
  }

  // ============ Agent Methods ============

  /**
   * Spawns a new agent and returns its ID.
   */
  spawnAgent(
    type: string,
    task: string,
    budget: number,
    parent_id?: string
  ): string {
    const id = randomUUID();
    const agent: AgentState = {
      id,
      type,
      task,
      status: "queued",
      spawned_at: new Date().toISOString(),
      parent_id,
      budget: {
        allocated: budget,
        spent: 0,
        remaining: budget,
      },
    };
    this.agents.set(id, agent);
    return id;
  }

  /**
   * Gets an agent by ID.
   */
  getAgent(id: string): AgentState | undefined {
    const agent = this.agents.get(id);
    return agent ? { ...agent } : undefined;
  }

  /**
   * Updates an agent's status.
   */
  updateAgentStatus(id: string, status: AgentState["status"]): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.status = status;
      if (status === "running") {
        // Clear any previous completion time
        delete agent.completed_at;
      }
    }
  }

  /**
   * Marks an agent as completed with token usage.
   */
  completeAgent(id: string, tokens_spent: number): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.status = "completed";
      agent.completed_at = new Date().toISOString();
      agent.budget.spent = tokens_spent;
      agent.budget.remaining = agent.budget.allocated - tokens_spent;
    }
  }

  /**
   * Marks an agent as failed with an error message.
   */
  failAgent(id: string, error: string): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.status = "failed";
      agent.completed_at = new Date().toISOString();
      agent.error = error;
    }
  }

  /**
   * Gets all active (queued or running) agents.
   */
  getActiveAgents(): AgentState[] {
    return Array.from(this.agents.values())
      .filter((a) => a.status === "queued" || a.status === "running")
      .map((a) => ({ ...a }));
  }

  /**
   * Gets agents by status.
   */
  getAgentsByStatus(status: AgentState["status"]): AgentState[] {
    return Array.from(this.agents.values())
      .filter((a) => a.status === status)
      .map((a) => ({ ...a }));
  }

  // ============ Lock Methods ============

  /**
   * Acquires a lock on a file.
   * @returns true if lock acquired, false if already locked by another holder
   */
  acquireLock(
    path: string,
    holder: string,
    purpose: string,
    timeout_ms: number = 30000
  ): boolean {
    const existing = this.locks.get(path);

    // Check if already locked by another holder
    if (existing && existing.holder !== holder) {
      // Check if lock has expired
      const acquired = new Date(existing.acquired_at).getTime();
      if (Date.now() - acquired < existing.timeout_ms) {
        return false; // Still locked by another holder
      }
      // Lock expired, allow takeover
    }

    // Acquire or refresh lock
    this.locks.set(path, {
      path,
      holder,
      acquired_at: new Date().toISOString(),
      timeout_ms,
      purpose,
    });
    return true;
  }

  /**
   * Releases a lock on a file.
   * @returns true if released, false if not locked or locked by different holder
   */
  releaseLock(path: string, holder: string): boolean {
    const existing = this.locks.get(path);
    if (!existing || existing.holder !== holder) {
      return false;
    }
    this.locks.delete(path);
    return true;
  }

  /**
   * Checks if a file is locked.
   */
  isLocked(path: string): boolean {
    const lock = this.locks.get(path);
    if (!lock) return false;

    // Check if expired
    const acquired = new Date(lock.acquired_at).getTime();
    if (Date.now() - acquired >= lock.timeout_ms) {
      this.locks.delete(path);
      return false;
    }
    return true;
  }

  /**
   * Gets the holder of a lock.
   */
  getLockHolder(path: string): string | null {
    if (!this.isLocked(path)) return null;
    return this.locks.get(path)?.holder ?? null;
  }

  /**
   * Gets all locks held by a specific holder.
   */
  getLocksForHolder(holder: string): FileLock[] {
    return Array.from(this.locks.values())
      .filter((l) => l.holder === holder)
      .map((l) => ({ ...l }));
  }

  /**
   * Releases all locks held by a specific holder.
   * @returns Number of locks released
   */
  releaseAllLocks(holder: string): number {
    let count = 0;
    for (const [path, lock] of this.locks.entries()) {
      if (lock.holder === holder) {
        this.locks.delete(path);
        count++;
      }
    }
    return count;
  }

  /**
   * Cleans up expired locks.
   * @returns Number of locks cleaned
   */
  cleanupExpiredLocks(): number {
    const now = Date.now();
    let count = 0;
    for (const [path, lock] of this.locks.entries()) {
      const acquired = new Date(lock.acquired_at).getTime();
      if (now - acquired >= lock.timeout_ms) {
        this.locks.delete(path);
        count++;
      }
    }
    return count;
  }

  // ============ Dirty File Methods ============

  /**
   * Marks a file as dirty (modified).
   */
  markDirty(path: string, modified_by: string, original_hash?: string): void {
    const existing = this.dirty.get(path);
    this.dirty.set(path, {
      path,
      modified_at: new Date().toISOString(),
      modified_by,
      // Preserve original hash if already dirty
      original_hash: existing?.original_hash ?? original_hash,
    });
  }

  /**
   * Clears the dirty flag for a file.
   * @returns true if was dirty, false otherwise
   */
  clearDirty(path: string): boolean {
    return this.dirty.delete(path);
  }

  /**
   * Checks if a file is dirty.
   */
  isDirty(path: string): boolean {
    return this.dirty.has(path);
  }

  /**
   * Gets all dirty files.
   */
  getDirtyFiles(): DirtyFile[] {
    return Array.from(this.dirty.values()).map((d) => ({ ...d }));
  }

  /**
   * Gets dirty files modified by a specific agent.
   */
  getDirtyFilesByAgent(agent_id: string): DirtyFile[] {
    return Array.from(this.dirty.values())
      .filter((d) => d.modified_by === agent_id)
      .map((d) => ({ ...d }));
  }

  /**
   * Clears all dirty flags.
   * @returns Number of files cleared
   */
  clearAllDirty(): number {
    const count = this.dirty.size;
    this.dirty.clear();
    return count;
  }

  /**
   * Gets the count of dirty files.
   */
  getDirtyCount(): number {
    return this.dirty.size;
  }
}
