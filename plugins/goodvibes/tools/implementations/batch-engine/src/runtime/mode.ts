/**
 * Mode System Runtime Implementation for Batch Engine
 * @see SPEC-v2 Section 10
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  ModeConfig,
  ModeName,
} from '../interfaces/mode.js';
import { MODES } from '../interfaces/mode-configs.js';
import type {
  Situation,
  OutputMode,
  ErrorAction,
  ResultFormat,
} from '../interfaces/mode-behavior.js';
import type { BatchResult } from '../interfaces/batch.js';

/**
 * Mode file paths
 */
const MODE_CONFIG_PATH = '.goodvibes/config/modes.json';
const MODE_PREFERENCE_PATH = '.goodvibes/config/mode-preference.json';

/**
 * Custom mode definitions loaded from user config
 */
interface CustomModeConfig {
  modes?: Record<string, ModeConfig>;
  default_mode?: ModeName | string;
}

/**
 * Mode Manager handles mode switching and mode-aware behaviors
 */
export interface ModeManager {
  /**
   * Get the current active mode configuration
   */
  getCurrentMode(): ModeConfig;

  /**
   * Get the current mode name
   */
  getCurrentModeName(): ModeName | string;

  /**
   * Switch to a different mode
   */
  setMode(name: ModeName | string): void;

  /**
   * Load custom mode definitions from file
   */
  loadCustomModes(): Promise<void>;

  /**
   * Save current mode preference
   */
  savePreference(): Promise<void>;

  /**
   * Load saved mode preference
   */
  loadPreference(): Promise<void>;

  /**
   * Check if should ask user based on situation
   */
  shouldAskUser(situation: Situation): boolean;

  /**
   * Get output mode for current mode
   */
  getOutputMode(operation?: string): OutputMode;

  /**
   * Handle error based on current mode
   */
  handleError(error: Error): ErrorAction;

  /**
   * Format result based on current mode
   */
  formatResult(result: BatchResult): string;

  /**
   * Check if progress should be shown
   */
  shouldShowProgress(): boolean;

  /**
   * Check if decisions should be explained
   */
  shouldExplainDecisions(): boolean;

  /**
   * Check if diffs should be shown
   */
  shouldShowDiffs(): boolean;

  /**
   * Check if telemetry should be shown
   */
  shouldShowTelemetry(): 'none' | 'summary' | 'detailed';

  /**
   * Check if batch should auto-chain
   */
  shouldAutoChain(): boolean;

  /**
   * Get maximum autonomous batches
   */
  getMaxAutonomousBatches(): number | 'unlimited';

  /**
   * Get checkpoint frequency
   */
  getCheckpointFrequency(): 'never' | 'per_batch' | 'per_phase' | 'per_operation';

  /**
   * Get parallel agents limit
   */
  getParallelAgentsLimit(): number;

  /**
   * Get max fix attempts
   */
  getMaxFixAttempts(): number;

  /**
   * Get log path
   */
  getLogPath(): string;

  /**
   * Check if decisions should be logged
   */
  shouldLogDecisions(): boolean;

  /**
   * Check if errors should be logged
   */
  shouldLogErrors(): boolean;

  /**
   * Check if activity should be logged
   */
  shouldLogActivity(): boolean;
}

/**
 * Mode Manager Implementation
 */
export class ModeManagerImpl implements ModeManager {
  private currentMode: ModeConfig;
  private customModes: Map<string, ModeConfig> = new Map();
  private projectRoot: string;

  constructor(projectRoot?: string, initialMode: ModeName = 'vibecoding') {
    this.projectRoot = projectRoot || process.cwd();
    this.currentMode = MODES[initialMode];
  }

  getCurrentMode(): ModeConfig {
    return this.currentMode;
  }

  getCurrentModeName(): ModeName | string {
    return this.currentMode.name;
  }

  setMode(name: ModeName | string): void {
    // Check built-in modes first
    if (name === 'vibecoding' || name === 'justvibes') {
      this.currentMode = MODES[name];
      return;
    }

    // Check custom modes
    const customMode = this.customModes.get(name);
    if (customMode) {
      this.currentMode = customMode;
      return;
    }

    // Fallback to vibecoding if mode not found
    console.warn(`Mode "${name}" not found. Falling back to vibecoding.`);
    this.currentMode = MODES.vibecoding;
  }

  async loadCustomModes(): Promise<void> {
    const configPath = path.join(this.projectRoot, MODE_CONFIG_PATH);

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config: CustomModeConfig = JSON.parse(content);

      if (config.modes) {
        for (const [name, modeConfig] of Object.entries(config.modes)) {
          this.customModes.set(name, modeConfig);
        }
      }

      // Load default mode if specified
      if (config.default_mode) {
        this.setMode(config.default_mode);
      }
    } catch (error) {
      // File doesn't exist or is invalid - that's okay, use built-in modes
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`Failed to load custom modes from ${configPath}:`, error);
      }
    }
  }

  async savePreference(): Promise<void> {
    const prefPath = path.join(this.projectRoot, MODE_PREFERENCE_PATH);
    const prefDir = path.dirname(prefPath);

    try {
      // Ensure directory exists
      await fs.mkdir(prefDir, { recursive: true });

      // Save preference
      await fs.writeFile(
        prefPath,
        JSON.stringify({
          mode: this.currentMode.name,
          timestamp: new Date().toISOString(),
        }, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.warn(`Failed to save mode preference to ${prefPath}:`, error);
    }
  }

  async loadPreference(): Promise<void> {
    const prefPath = path.join(this.projectRoot, MODE_PREFERENCE_PATH);

    try {
      const content = await fs.readFile(prefPath, 'utf-8');
      const pref = JSON.parse(content);

      if (pref.mode) {
        this.setMode(pref.mode);
      }
    } catch (error) {
      // File doesn't exist - that's okay, use default mode
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`Failed to load mode preference from ${prefPath}:`, error);
      }
    }
  }

  shouldAskUser(situation: Situation): boolean {
    switch (situation) {
      case 'ambiguous_requirement':
        return this.currentMode.communication.ask_on_ambiguity;
      case 'high_risk_operation':
        return this.currentMode.recovery.on_other === 'ask_user';
      case 'error_occurred':
        return this.currentMode.recovery.on_error === 'ask_user' || this.currentMode.recovery.on_error === 'ask_user_with_options';
      case 'batch_complete':
        return !this.currentMode.execution.auto_chain;
      default:
        return false;
    }
  }

  getOutputMode(_operation?: string): OutputMode {
    // Could be extended to return different modes based on operation type
    return this.currentMode.output.default_mode;
  }

  handleError(_error: Error): ErrorAction {
    switch (this.currentMode.recovery.on_error) {
      case 'halt':
        return { action: 'halt', notify: true };
      case 'ask_user':
        return { action: 'ask_user', options: ['retry', 'skip', 'abort'] };
      case 'ask_user_with_options':
        return { action: 'ask_user', options: ['retry', 'skip', 'abort', 'fix_and_continue'] };
      case 'log_and_continue':
        return { action: 'log', continue: true };
      case 'fix_and_continue':
        return {
          action: 'fix_loop',
          max_attempts: this.currentMode.recovery.max_fix_attempts
        };
      case 'fix_review_loop':
        return {
          action: 'fix_loop',
          max_attempts: this.currentMode.recovery.max_fix_attempts,
          notify: true
        };
      default:
        return { action: 'halt', notify: true };
    }
  }

  formatResult(result: BatchResult): string {
    switch (this.currentMode.communication.report_results) {
      case 'none':
        return '';
      case 'minimal':
        return this.formatMinimal(result);
      case 'summary':
        return this.formatSummary(result);
      case 'detailed':
        return this.formatDetailed(result);
    }
  }

  private formatMinimal(result: BatchResult): string {
    const { summary } = result;
    return `Done. ${summary.operations.succeeded}/${summary.operations.total} operations succeeded.`;
  }

  private formatSummary(result: BatchResult): string {
    const { summary } = result;
    const lines = [
      `Batch ${summary.status}`,
      `Operations: ${summary.operations.succeeded}/${summary.operations.total}`,
      `Duration: ${summary.duration_ms}ms`,
    ];

    if (summary.tokens_used !== undefined) {
      lines.push(`Tokens: ${summary.tokens_used}`);
    }

    return lines.join('\n');
  }

  private formatDetailed(result: BatchResult): string {
    return JSON.stringify(result, null, 2);
  }

  shouldShowProgress(): boolean {
    return this.currentMode.communication.show_progress;
  }

  shouldExplainDecisions(): boolean {
    return this.currentMode.communication.explain_decisions;
  }

  shouldShowDiffs(): boolean {
    return this.currentMode.output.show_diffs;
  }

  shouldShowTelemetry(): 'none' | 'summary' | 'detailed' {
    return this.currentMode.output.show_telemetry;
  }

  shouldAutoChain(): boolean {
    return this.currentMode.execution.auto_chain;
  }

  getMaxAutonomousBatches(): number | 'unlimited' {
    return this.currentMode.execution.max_autonomous_batches;
  }

  getCheckpointFrequency(): 'never' | 'per_batch' | 'per_phase' | 'per_operation' {
    return this.currentMode.execution.checkpoint_frequency;
  }

  getParallelAgentsLimit(): number {
    return this.currentMode.execution.parallel_agents;
  }

  getMaxFixAttempts(): number {
    return this.currentMode.recovery.max_fix_attempts;
  }

  getLogPath(): string {
    return path.join(this.projectRoot, this.currentMode.logging.log_path);
  }

  shouldLogDecisions(): boolean {
    return this.currentMode.logging.log_decisions;
  }

  shouldLogErrors(): boolean {
    return this.currentMode.logging.log_errors;
  }

  shouldLogActivity(): boolean {
    return this.currentMode.logging.log_activity;
  }
}

/**
 * Global singleton instance
 */
let globalModeManager: ModeManagerImpl | null = null;

/**
 * Create a new Mode Manager instance
 */
export function createModeManager(
  projectRoot?: string,
  initialMode: ModeName = 'vibecoding'
): ModeManagerImpl {
  return new ModeManagerImpl(projectRoot, initialMode);
}

/**
 * Get the global Mode Manager instance (singleton)
 */
export function getModeManager(projectRoot?: string): ModeManagerImpl {
  if (!globalModeManager) {
    globalModeManager = new ModeManagerImpl(projectRoot || process.cwd());
  }
  return globalModeManager;
}

/**
 * Reset the global Mode Manager (useful for testing)
 */
export function resetGlobalModeManager(): void {
  globalModeManager = null;
}

/**
 * Initialize mode system - loads custom modes and preferences
 */
export async function initializeModeSystem(
  projectRoot?: string
): Promise<ModeManagerImpl> {
  const manager = getModeManager(projectRoot);
  await manager.loadCustomModes();
  await manager.loadPreference();
  return manager;
}

/**
 * Mode-aware behavior functions (stateless, using current mode)
 */

/**
 * Check if should ask user based on situation and current mode
 */
export function shouldAskUser(situation: Situation): boolean {
  return getModeManager().shouldAskUser(situation);
}

/**
 * Get output mode for current mode
 */
export function getOutputMode(operation?: string): OutputMode {
  return getModeManager().getOutputMode(operation);
}

/**
 * Handle error based on current mode
 */
export function handleError(error: Error): ErrorAction {
  return getModeManager().handleError(error);
}

/**
 * Format result based on current mode
 */
export function formatResult(result: BatchResult): string {
  return getModeManager().formatResult(result);
}

/**
 * Mode inheritance for nested batches
 * Child batches inherit parent mode unless explicitly overridden
 */
export interface ModeOverride {
  mode?: ModeName | string;
  checkpoint_frequency?: ModeConfig['execution']['checkpoint_frequency'];
  parallel_agents?: number;
  output_mode?: OutputMode;
}

/**
 * Apply mode override to a batch context
 */
export function applyModeOverride(
  parentMode: ModeConfig,
  override?: ModeOverride
): ModeConfig {
  if (!override) {
    return parentMode;
  }

  // Deep clone parent mode
  const overriddenMode = JSON.parse(JSON.stringify(parentMode)) as ModeConfig;

  // Apply overrides
  if (override.checkpoint_frequency) {
    overriddenMode.execution.checkpoint_frequency = override.checkpoint_frequency;
  }

  if (override.parallel_agents !== undefined) {
    overriddenMode.execution.parallel_agents = override.parallel_agents;
  }

  if (override.output_mode) {
    overriddenMode.output.default_mode = override.output_mode;
  }

  // If switching mode entirely, get the new mode config
  if (override.mode && override.mode !== parentMode.name) {
    const manager = getModeManager();
    manager.setMode(override.mode);
    return manager.getCurrentMode();
  }

  return overriddenMode;
}

/**
 * Session mode tracking for mode persistence across multiple batches
 */
export class SessionModeTracker {
  private modeStack: ModeConfig[] = [];
  private manager: ModeManagerImpl;

  constructor(manager?: ModeManagerImpl) {
    this.manager = manager || getModeManager();
  }

  /**
   * Push current mode onto stack and switch to new mode
   */
  pushMode(mode: ModeName | string): void {
    this.modeStack.push(this.manager.getCurrentMode());
    this.manager.setMode(mode);
  }

  /**
   * Pop mode from stack and restore it
   */
  popMode(): void {
    const previousMode = this.modeStack.pop();
    if (previousMode) {
      this.manager.setMode(previousMode.name);
    }
  }

  /**
   * Get current stack depth
   */
  getStackDepth(): number {
    return this.modeStack.length;
  }

  /**
   * Clear mode stack
   */
  clearStack(): void {
    this.modeStack = [];
  }
}

/**
 * Create a session mode tracker
 */
export function createSessionModeTracker(
  manager?: ModeManagerImpl
): SessionModeTracker {
  return new SessionModeTracker(manager);
}
