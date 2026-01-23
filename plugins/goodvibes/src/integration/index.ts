/**
 * Integration & Wiring for GoodVibes v2.0
 *
 * This module connects all core systems and provides a unified API
 * for the plugin to interact with the infrastructure.
 */

import {
  StateManager,
  CheckpointManager,
  FixLoop,
  AgentPool,
  Memory,
  Telemetry,
  ModeSystem,
  ContextInjector,
  type SessionState,
  type AgentState,
  type Checkpoint,
  type DiagnosedIssue,
  type FixLoopResult,
  type PoolAgent,
  type PerformanceMetrics,
  type AssembledContext,
  type TaskType,
} from "../core/index.js";

import { BatchEngine, type TransactionResult, type Operation } from "../engines/index.js";

/**
 * Configuration for the GoodVibes runtime.
 */
export interface GoodVibesConfig {
  /** Project root directory */
  projectRoot: string;
  /** Initial operating mode */
  mode?: "vibecoding" | "justvibes";
  /** Maximum concurrent agents */
  maxAgents?: number;
  /** Default agent budget */
  defaultBudget?: number;
  /** Total budget for all agents */
  totalBudget?: number;
  /** Enable telemetry */
  telemetryEnabled?: boolean;
  /** Enable auto-checkpoints */
  autoCheckpoint?: boolean;
}

/**
 * Events emitted by the runtime.
 */
export interface RuntimeEvents {
  /** Called when an agent starts */
  onAgentStart?: (agent: PoolAgent) => void | Promise<void>;
  /** Called when an agent completes */
  onAgentComplete?: (agent: PoolAgent) => void | Promise<void>;
  /** Called when an agent fails */
  onAgentFail?: (agent: PoolAgent) => void | Promise<void>;
  /** Called when mode changes */
  onModeChange?: (oldMode: string, newMode: string) => void | Promise<void>;
  /** Called when a checkpoint is created */
  onCheckpoint?: (checkpoint: Checkpoint) => void | Promise<void>;
  /** Called on fix loop completion */
  onFixLoopComplete?: (result: FixLoopResult) => void | Promise<void>;
}

/**
 * Runtime status summary.
 */
export interface RuntimeStatus {
  /** Session info */
  session: SessionState;
  /** Mode info */
  mode: string;
  /** Agent pool stats */
  agents: {
    active: number;
    queued: number;
    completed: number;
    failed: number;
  };
  /** Memory stats */
  memory: {
    decisions: number;
    patterns: number;
    failures: number;
  };
  /** Performance metrics */
  performance: PerformanceMetrics;
  /** Number of checkpoints */
  checkpoints: number;
}

/**
 * Central runtime that wires all GoodVibes systems together.
 */
export class GoodVibesRuntime {
  // Core systems
  public readonly stateManager: StateManager;
  public readonly checkpointManager: CheckpointManager;
  public readonly fixLoop: FixLoop;
  public readonly agentPool: AgentPool;
  public readonly memory: Memory;
  public readonly telemetry: Telemetry;
  public readonly modeSystem: ModeSystem;
  public readonly contextInjector: ContextInjector;
  public readonly batchEngine: BatchEngine;

  private config: GoodVibesConfig;
  private events: RuntimeEvents;
  private initialized: boolean = false;

  /**
   * Creates a new GoodVibesRuntime instance.
   */
  constructor(config: GoodVibesConfig, events: RuntimeEvents = {}) {
    this.config = config;
    this.events = events;

    // Initialize all core systems
    this.stateManager = new StateManager(config.projectRoot, config.mode || "vibecoding");
    this.checkpointManager = new CheckpointManager(config.projectRoot);
    this.fixLoop = new FixLoop({ max_attempts: 3, auto_rollback: true });
    this.agentPool = new AgentPool({
      max_concurrent: config.maxAgents || 6,
      default_budget: config.defaultBudget || 50000,
      total_budget: config.totalBudget || 500000,
    });
    this.memory = new Memory(config.projectRoot);
    this.fixLoop.setMemory(this.memory);
    this.telemetry = new Telemetry({ tracing_enabled: config.telemetryEnabled ?? true });
    this.modeSystem = new ModeSystem({ current_mode: config.mode || "vibecoding" });
    this.contextInjector = new ContextInjector();
    this.batchEngine = new BatchEngine();

    // Wire up event handlers
    this.wireEvents();
  }

  /**
   * Wires up all event handlers between systems.
   */
  private wireEvents(): void {
    // Agent pool events
    this.agentPool.onStart((agent) => {
      // Track in telemetry
      this.telemetry.incrementCounter("agents_started", 1, { type: agent.spec.type });

      // Track in mode system
      this.modeSystem.addActiveAgent(agent.id);

      // External callback
      if (this.events.onAgentStart) {
        void this.events.onAgentStart(agent);
      }
    });

    this.agentPool.onComplete((agent) => {
      // Track in telemetry
      this.telemetry.incrementCounter("agents_completed", 1, { type: agent.spec.type });
      this.telemetry.recordTokenUsage(
        agent.budget.input_tokens,
        agent.budget.output_tokens,
        agent.budget.cost_usd
      );

      // Remove from mode system
      this.modeSystem.removeActiveAgent(agent.id);

      // External callback
      if (this.events.onAgentComplete) {
        void this.events.onAgentComplete(agent);
      }
    });

    this.agentPool.onFail((agent) => {
      // Track in telemetry
      this.telemetry.incrementCounter("agents_failed", 1, { type: agent.spec.type });

      // Record failure in memory
      void this.memory.recordFailure(
        "agent_failure",
        agent.error || "unknown",
        `Agent ${agent.spec.type} failed: ${agent.spec.task}`,
        { tags: ["agent", agent.spec.type] }
      );

      // Remove from mode system
      this.modeSystem.removeActiveAgent(agent.id);

      // External callback
      if (this.events.onAgentFail) {
        void this.events.onAgentFail(agent);
      }
    });

    // Mode system events
    this.modeSystem.onModeChange((oldMode, newMode) => {
      // Record decision in memory
      void this.memory.recordDecision(
        `Switch mode from ${oldMode} to ${newMode}`,
        "User or system requested mode change",
        `Active agents: ${this.modeSystem.getPreservedState().active_agents.length}`,
        { tags: ["mode", "switch"] }
      );

      // External callback
      if (this.events.onModeChange) {
        void this.events.onModeChange(oldMode, newMode);
      }
    });
  }

  /**
   * Initializes the runtime.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const span = this.telemetry.startSpan("runtime_init");

    try {
      // Load memory from disk
      await this.memory.load();

      // Session already initialized in StateManager constructor

      this.initialized = true;
      this.telemetry.endSpan(span.id);
    } catch (error) {
      this.telemetry.errorSpan(span.id, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Shuts down the runtime.
   */
  async shutdown(): Promise<void> {
    const span = this.telemetry.startSpan("runtime_shutdown");

    try {
      // Save memory to disk
      await this.memory.save();

      // Session cleanup is handled by StateManager lifecycle

      this.initialized = false;
      this.telemetry.endSpan(span.id);
    } catch (error) {
      this.telemetry.errorSpan(span.id, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  // ============ State Manager Wiring ============

  /**
   * Gets the current session state.
   */
  getSession(): SessionState {
    return this.stateManager.getSession();
  }

  /**
   * Gets all active agents.
   */
  getActiveAgents(): AgentState[] {
    return this.stateManager.getActiveAgents();
  }

  /**
   * Marks a file as dirty.
   */
  markDirty(path: string, modifiedBy: string = "runtime"): void {
    this.stateManager.markDirty(path, modifiedBy);
  }

  /**
   * Gets all dirty files.
   */
  getDirtyFiles(): string[] {
    return this.stateManager.getDirtyFiles().map(f => f.path);
  }

  // ============ Checkpoint Wiring ============

  /**
   * Creates a checkpoint.
   */
  async createCheckpoint(name: string): Promise<Checkpoint> {
    const span = this.telemetry.startSpan("create_checkpoint", { attributes: { name } });

    try {
      const dirtyFiles = this.stateManager.getDirtyFiles().map(f => f.path);
      const checkpoint = await this.checkpointManager.createCheckpoint(name, dirtyFiles);

      // Clear dirty files after checkpoint
      for (const file of dirtyFiles) {
        this.stateManager.clearDirty(file);
      }

      // Track in telemetry
      this.telemetry.incrementCounter("checkpoints_created", 1);
      this.telemetry.endSpan(span.id);

      // External callback
      if (this.events.onCheckpoint) {
        void this.events.onCheckpoint(checkpoint);
      }

      return checkpoint;
    } catch (error) {
      this.telemetry.errorSpan(span.id, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Rolls back to a checkpoint.
   */
  async rollbackToCheckpoint(checkpointId: string): Promise<boolean> {
    const span = this.telemetry.startSpan("rollback_checkpoint", { attributes: { checkpointId } });

    try {
      const result = await this.checkpointManager.rollbackTo(checkpointId);

      // Track in telemetry
      this.telemetry.incrementCounter("checkpoints_rolledback", 1);
      this.telemetry.endSpan(span.id);

      return result.success;
    } catch (error) {
      this.telemetry.errorSpan(span.id, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  // ============ Fix Loop Wiring ============

  /**
   * Runs the fix loop on an error.
   */
  async runFixLoop(errorOutput: string): Promise<FixLoopResult> {
    const span = this.telemetry.startSpan("fix_loop");

    try {
      // Create checkpoint before attempting fix
      if (this.config.autoCheckpoint) {
        await this.createCheckpoint("pre-fix");
      }

      const result = await this.fixLoop.execute(errorOutput);

      // Record in memory
      if (result.success) {
        await this.memory.recordDecision(
          `Fixed: ${result.original_issue.type}`,
          result.status_message,
          `Attempts: ${result.attempts.length}`,
          { tags: ["fix", "success", result.original_issue.type] }
        );
      } else {
        await this.memory.recordFailure(
          result.original_issue.type,
          result.original_issue.message,
          result.status_message,
          {
            tags: ["fix", "failure", result.original_issue.type],
          }
        );
      }

      // Track in telemetry
      this.telemetry.incrementCounter("fix_loops_run", 1);
      this.telemetry.incrementCounter(
        result.success ? "fix_loops_succeeded" : "fix_loops_failed",
        1
      );
      this.telemetry.recordHistogram("fix_loop_duration_ms", result.total_time_ms);
      this.telemetry.endSpan(span.id);

      // External callback
      if (this.events.onFixLoopComplete) {
        void this.events.onFixLoopComplete(result);
      }

      return result;
    } catch (error) {
      this.telemetry.errorSpan(span.id, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  // ============ Agent Pool Wiring ============

  /**
   * Spawns a new agent.
   */
  spawnAgent(type: string, task: string, budget?: number): string {
    return this.agentPool.spawn({
      type,
      task,
      budget: budget || this.config.defaultBudget || 50000,
    });
  }

  /**
   * Completes an agent.
   */
  completeAgent(agentId: string, result?: string, tokensSpent?: number): void {
    this.agentPool.complete(agentId, result, tokensSpent);
  }

  /**
   * Fails an agent.
   */
  failAgent(agentId: string, error: string, tokensSpent?: number): void {
    this.agentPool.fail(agentId, error, tokensSpent);
  }

  /**
   * Gets agent pool stats.
   */
  getAgentStats() {
    return this.agentPool.getStats();
  }

  // ============ Memory Wiring ============

  /**
   * Records a decision.
   */
  async recordDecision(
    decision: string,
    rationale: string,
    context: string,
    tags: string[] = []
  ): Promise<void> {
    await this.memory.recordDecision(decision, rationale, context, { tags });
  }

  /**
   * Records a pattern.
   */
  async recordPattern(
    name: string,
    description: string,
    example: string,
    useWhen: string,
    tags: string[] = []
  ): Promise<void> {
    await this.memory.recordPattern(name, description, example, useWhen, { tags });
  }

  // ============ Telemetry Wiring ============

  /**
   * Gets performance metrics.
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return this.telemetry.getPerformanceMetrics();
  }

  /**
   * Creates a telemetry span.
   */
  startSpan(name: string, attributes?: Record<string, string | number | boolean>) {
    return this.telemetry.startSpan(name, { attributes });
  }

  /**
   * Ends a telemetry span.
   */
  endSpan(spanId: string) {
    this.telemetry.endSpan(spanId);
  }

  // ============ Mode System Wiring ============

  /**
   * Gets the current mode.
   */
  getCurrentMode(): string {
    return this.modeSystem.getCurrentMode();
  }

  /**
   * Switches the mode.
   */
  async switchMode(mode: "vibecoding" | "justvibes", reason?: string): Promise<boolean> {
    return this.modeSystem.switchMode(mode, reason);
  }

  /**
   * Checks if output should be shown based on mode.
   */
  shouldShowOutput(type: "explanation" | "progress" | "rationale" | "intermediate"): boolean {
    switch (type) {
      case "explanation":
        return this.modeSystem.shouldShowExplanations();
      case "progress":
        return this.modeSystem.shouldShowProgress();
      case "rationale":
        return this.modeSystem.shouldShowRationale();
      case "intermediate":
        return this.modeSystem.shouldShowIntermediate();
      default:
        return true;
    }
  }

  // ============ Context Injector Wiring ============

  /**
   * Detects task type from input.
   */
  detectTaskType(input: string): TaskType {
    return this.contextInjector.detectTaskType(input).task_type;
  }

  /**
   * Auto-injects context for a task.
   */
  async autoInjectContext(taskDescription: string): Promise<AssembledContext> {
    return this.contextInjector.autoInject(taskDescription, {
      includeConventions: true,
      includeState: true,
    });
  }

  /**
   * Suggests an agent for a task.
   */
  suggestAgent(taskDescription: string): string {
    return this.contextInjector.suggestAgent(taskDescription);
  }

  // ============ Batch Engine Wiring ============

  /**
   * Executes a batch transaction.
   */
  async executeBatch(
    operations: Operation[],
    name: string,
    atomic: boolean = true
  ): Promise<TransactionResult> {
    const span = this.telemetry.startSpan("batch_transaction", { attributes: { name, atomic } });

    try {
      const result = await this.batchEngine.executeTransaction(operations, { name, atomic });

      // Track in telemetry
      this.telemetry.incrementCounter("batch_transactions", 1);
      this.telemetry.incrementCounter(
        result.success ? "batch_succeeded" : "batch_failed",
        1
      );

      this.telemetry.endSpan(span.id);
      return result;
    } catch (error) {
      this.telemetry.errorSpan(span.id, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  // ============ Status ============

  /**
   * Gets the runtime status.
   */
  getStatus(): RuntimeStatus {
    const agentStats = this.agentPool.getStats();
    const memoryStats = this.memory.getStats();

    return {
      session: this.stateManager.getSession(),
      mode: this.modeSystem.getCurrentMode(),
      agents: {
        active: agentStats.active,
        queued: agentStats.queued,
        completed: agentStats.completed,
        failed: agentStats.failed,
      },
      memory: {
        decisions: memoryStats.decisions,
        patterns: memoryStats.patterns,
        failures: memoryStats.failures,
      },
      performance: this.telemetry.getPerformanceMetrics(),
      checkpoints: this.checkpointManager.listCheckpoints().length,
    };
  }
}

/**
 * Creates a new GoodVibes runtime instance.
 */
export function createRuntime(
  config: GoodVibesConfig,
  events: RuntimeEvents = {}
): GoodVibesRuntime {
  return new GoodVibesRuntime(config, events);
}

// Re-export core types for convenience
export type {
  SessionState,
  AgentState,
  Checkpoint,
  DiagnosedIssue,
  FixLoopResult,
  PoolAgent,
  PerformanceMetrics,
  AssembledContext,
  TaskType,
  TransactionResult,
  Operation,
};
