/**
 * Available operating modes.
 */
export type OperatingMode = "vibecoding" | "justvibes";

/**
 * Mode-specific behavior configuration.
 */
export interface ModeBehavior {
  /** Whether to show explanations */
  show_explanations: boolean;
  /** Whether to show progress updates */
  show_progress: boolean;
  /** Whether to ask clarifying questions */
  ask_questions: boolean;
  /** Whether to show decision rationale */
  show_rationale: boolean;
  /** Whether to announce agent spawns */
  announce_agents: boolean;
  /** Whether to show intermediate results */
  show_intermediate: boolean;
  /** Output verbosity level */
  verbosity: "minimal" | "normal" | "verbose";
  /** Whether to auto-commit work */
  auto_commit: boolean;
  /** Whether to log silently to files */
  silent_logging: boolean;
}

/**
 * Mode configuration.
 */
export interface ModeConfig {
  /** Current operating mode */
  current_mode: OperatingMode;
  /** Behavior for vibecoding mode */
  vibecoding: ModeBehavior;
  /** Behavior for justvibes mode */
  justvibes: ModeBehavior;
  /** Whether mode can be switched at runtime */
  allow_runtime_switch: boolean;
  /** Callback when mode changes */
  on_mode_change?: (oldMode: OperatingMode, newMode: OperatingMode) => void | Promise<void>;
}

/**
 * State preserved across mode switches.
 */
export interface PreservedState {
  /** Current task description */
  current_task?: string;
  /** Active agent IDs */
  active_agents: string[];
  /** Pending operations */
  pending_operations: string[];
  /** Custom state data */
  custom: Record<string, unknown>;
}

/**
 * Default vibecoding mode behavior.
 */
const VIBECODING_BEHAVIOR: ModeBehavior = {
  show_explanations: true,
  show_progress: true,
  ask_questions: true,
  show_rationale: true,
  announce_agents: true,
  show_intermediate: true,
  verbosity: "verbose",
  auto_commit: false,
  silent_logging: false,
};

/**
 * Default justvibes mode behavior.
 */
const JUSTVIBES_BEHAVIOR: ModeBehavior = {
  show_explanations: false,
  show_progress: false,
  ask_questions: false,
  show_rationale: false,
  announce_agents: false,
  show_intermediate: false,
  verbosity: "minimal",
  auto_commit: true,
  silent_logging: true,
};

/**
 * Default configuration.
 */
const DEFAULT_CONFIG: ModeConfig = {
  current_mode: "vibecoding",
  vibecoding: VIBECODING_BEHAVIOR,
  justvibes: JUSTVIBES_BEHAVIOR,
  allow_runtime_switch: true,
};

/**
 * Mode system for managing operating modes and their behaviors.
 */
export class ModeSystem {
  private config: ModeConfig;
  private preservedState: PreservedState;
  private modeHistory: Array<{ mode: OperatingMode; timestamp: string; reason?: string }>;

  /**
   * Creates a new ModeSystem instance.
   */
  constructor(config: Partial<ModeConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      vibecoding: { ...VIBECODING_BEHAVIOR, ...config.vibecoding },
      justvibes: { ...JUSTVIBES_BEHAVIOR, ...config.justvibes },
    };
    this.preservedState = {
      active_agents: [],
      pending_operations: [],
      custom: {},
    };
    this.modeHistory = [
      {
        mode: this.config.current_mode,
        timestamp: new Date().toISOString(),
        reason: "initial",
      },
    ];
  }

  /**
   * Gets the current operating mode.
   */
  getCurrentMode(): OperatingMode {
    return this.config.current_mode;
  }

  /**
   * Gets the behavior for the current mode.
   */
  getCurrentBehavior(): ModeBehavior {
    return this.config[this.config.current_mode];
  }

  /**
   * Gets the behavior for a specific mode.
   */
  getModeBehavior(mode: OperatingMode): ModeBehavior {
    return { ...this.config[mode] };
  }

  /**
   * Checks if a specific behavior is enabled.
   */
  shouldShowExplanations(): boolean {
    return this.getCurrentBehavior().show_explanations;
  }

  shouldShowProgress(): boolean {
    return this.getCurrentBehavior().show_progress;
  }

  shouldAskQuestions(): boolean {
    return this.getCurrentBehavior().ask_questions;
  }

  shouldShowRationale(): boolean {
    return this.getCurrentBehavior().show_rationale;
  }

  shouldAnnounceAgents(): boolean {
    return this.getCurrentBehavior().announce_agents;
  }

  shouldShowIntermediate(): boolean {
    return this.getCurrentBehavior().show_intermediate;
  }

  shouldAutoCommit(): boolean {
    return this.getCurrentBehavior().auto_commit;
  }

  shouldLogSilently(): boolean {
    return this.getCurrentBehavior().silent_logging;
  }

  getVerbosity(): "minimal" | "normal" | "verbose" {
    return this.getCurrentBehavior().verbosity;
  }

  /**
   * Checks if the system is in vibecoding mode.
   */
  isVibecoding(): boolean {
    return this.config.current_mode === "vibecoding";
  }

  /**
   * Checks if the system is in justvibes mode.
   */
  isJustvibes(): boolean {
    return this.config.current_mode === "justvibes";
  }

  /**
   * Switches to a new mode.
   */
  async switchMode(newMode: OperatingMode, reason?: string): Promise<boolean> {
    if (!this.config.allow_runtime_switch) {
      return false;
    }

    if (newMode === this.config.current_mode) {
      return true; // Already in requested mode
    }

    const oldMode = this.config.current_mode;

    // Call the callback if set
    if (this.config.on_mode_change) {
      await this.config.on_mode_change(oldMode, newMode);
    }

    // Switch the mode
    this.config.current_mode = newMode;

    // Record in history
    this.modeHistory.push({
      mode: newMode,
      timestamp: new Date().toISOString(),
      reason,
    });

    return true;
  }

  /**
   * Toggles between vibecoding and justvibes modes.
   */
  async toggleMode(reason?: string): Promise<OperatingMode> {
    const newMode: OperatingMode =
      this.config.current_mode === "vibecoding" ? "justvibes" : "vibecoding";
    await this.switchMode(newMode, reason);
    return newMode;
  }

  /**
   * Sets the callback for mode changes.
   */
  onModeChange(
    callback: (oldMode: OperatingMode, newMode: OperatingMode) => void | Promise<void>
  ): void {
    this.config.on_mode_change = callback;
  }

  /**
   * Gets the mode history.
   */
  getModeHistory(): Array<{ mode: OperatingMode; timestamp: string; reason?: string }> {
    return [...this.modeHistory];
  }

  /**
   * Preserves state before a mode switch or operation.
   */
  preserveState(state: Partial<PreservedState>): void {
    this.preservedState = {
      ...this.preservedState,
      ...state,
      custom: { ...this.preservedState.custom, ...state.custom },
    };
  }

  /**
   * Gets the preserved state.
   */
  getPreservedState(): PreservedState {
    return { ...this.preservedState };
  }

  /**
   * Clears the preserved state.
   */
  clearPreservedState(): void {
    this.preservedState = {
      active_agents: [],
      pending_operations: [],
      custom: {},
    };
  }

  /**
   * Adds an active agent to preserved state.
   */
  addActiveAgent(agentId: string): void {
    if (!this.preservedState.active_agents.includes(agentId)) {
      this.preservedState.active_agents.push(agentId);
    }
  }

  /**
   * Removes an active agent from preserved state.
   */
  removeActiveAgent(agentId: string): void {
    this.preservedState.active_agents = this.preservedState.active_agents.filter(
      (id) => id !== agentId
    );
  }

  /**
   * Adds a pending operation to preserved state.
   */
  addPendingOperation(operation: string): void {
    if (!this.preservedState.pending_operations.includes(operation)) {
      this.preservedState.pending_operations.push(operation);
    }
  }

  /**
   * Removes a pending operation from preserved state.
   */
  removePendingOperation(operation: string): void {
    this.preservedState.pending_operations = this.preservedState.pending_operations.filter(
      (op) => op !== operation
    );
  }

  /**
   * Sets a custom preserved state value.
   */
  setCustomState(key: string, value: unknown): void {
    this.preservedState.custom[key] = value;
  }

  /**
   * Gets a custom preserved state value.
   */
  getCustomState<T>(key: string): T | undefined {
    return this.preservedState.custom[key] as T | undefined;
  }

  /**
   * Updates the behavior for a specific mode.
   */
  updateModeBehavior(mode: OperatingMode, behavior: Partial<ModeBehavior>): void {
    this.config[mode] = { ...this.config[mode], ...behavior };
  }

  /**
   * Gets the full configuration.
   */
  getConfig(): ModeConfig {
    return {
      ...this.config,
      vibecoding: { ...this.config.vibecoding },
      justvibes: { ...this.config.justvibes },
    };
  }

  /**
   * Enables or disables runtime mode switching.
   */
  setRuntimeSwitchEnabled(enabled: boolean): void {
    this.config.allow_runtime_switch = enabled;
  }

  /**
   * Formats output based on current mode.
   * In justvibes mode, returns empty string for most output types.
   */
  formatOutput(
    type: "explanation" | "progress" | "rationale" | "intermediate" | "result",
    content: string
  ): string {
    const behavior = this.getCurrentBehavior();

    switch (type) {
      case "explanation":
        return behavior.show_explanations ? content : "";
      case "progress":
        return behavior.show_progress ? content : "";
      case "rationale":
        return behavior.show_rationale ? content : "";
      case "intermediate":
        return behavior.show_intermediate ? content : "";
      case "result":
        // Results are always shown
        return content;
      default:
        return content;
    }
  }

  /**
   * Gets a summary of the current mode state.
   */
  getSummary(): {
    mode: OperatingMode;
    behavior: ModeBehavior;
    preserved_state: PreservedState;
    history_length: number;
  } {
    return {
      mode: this.config.current_mode,
      behavior: this.getCurrentBehavior(),
      preserved_state: this.getPreservedState(),
      history_length: this.modeHistory.length,
    };
  }
}
