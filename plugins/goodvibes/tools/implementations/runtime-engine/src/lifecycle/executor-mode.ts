/**
 * ExecutorModeManager
 *
 * Determines and manages the current executor mode for the runtime engine session.
 * Mode detection priority:
 *   1. Env var GOODVIBES_EXECUTOR_MODE (explicit override)
 *   2. Config executor.mode != 'engaged' (explicit config)
 *   3. TMUX env var present + no GOODVIBES_INTERACTIVE (inferred daemon)
 *   4. Default: 'engaged'
 */

import type { ExecutorMode, ExecutorConfig } from '../shared/config.js';
import { EventBus } from '../events/event-bus.js';
import { createLogger } from '../shared/logger.js';
import { generateEventId, timestamp } from '../shared/utils.js';

const logger = createLogger('executor-mode');

export class ExecutorModeManager {
  private currentMode: ExecutorMode;
  private detectionMethod: 'explicit' | 'inferred' | 'default';
  private config: ExecutorConfig;
  private eventBus: EventBus | null;

  constructor(config: ExecutorConfig, eventBus?: EventBus) {
    this.config = config;
    this.eventBus = eventBus ?? null;
    this.detectionMethod = 'default';
    this.currentMode = 'engaged'; // placeholder, detectMode sets it
    this.currentMode = this.detectMode();
  }

  /**
   * Determine mode using priority order:
   * 1. GOODVIBES_EXECUTOR_MODE env var (explicit override)
   * 2. config.executor.mode != 'engaged' (explicit config)
   * 3. TMUX env var present + no GOODVIBES_INTERACTIVE (inferred daemon)
   * 4. Default: 'engaged'
   */
  detectMode(): ExecutorMode {
    // Priority 1: Explicit env var override
    const envMode = process.env['GOODVIBES_EXECUTOR_MODE'];
    if (envMode === 'daemon' || envMode === 'hybrid' || envMode === 'engaged') {
      this.detectionMethod = 'explicit';
      this.currentMode = envMode as ExecutorMode;
      logger.info('Executor mode set from env var', { mode: this.currentMode });
      return this.currentMode;
    }

    // Priority 2: Config file explicitly set to non-default
    if (this.config.mode !== 'engaged') {
      this.detectionMethod = 'explicit';
      this.currentMode = this.config.mode;
      logger.info('Executor mode set from config', { mode: this.currentMode });
      return this.currentMode;
    }

    // Priority 3: Infer from environment
    const inferred = this.inferFromEnvironment();
    if (inferred !== null) {
      this.detectionMethod = 'inferred';
      this.currentMode = inferred;
      logger.info('Executor mode inferred from environment', { mode: this.currentMode });
      return this.currentMode;
    }

    // Priority 4: Default
    this.detectionMethod = 'default';
    this.currentMode = 'engaged';
    logger.debug('Executor mode defaulting to engaged');
    return this.currentMode;
  }

  /** Get the current resolved mode. */
  getMode(): ExecutorMode {
    return this.currentMode;
  }

  /** Get the detection method used. */
  getDetectionMethod(): 'explicit' | 'inferred' | 'default' {
    return this.detectionMethod;
  }

  /** Explicitly switch mode at runtime. Emits executor:mode_set. */
  setMode(mode: ExecutorMode): void {
    const previousMode = this.currentMode;
    this.currentMode = mode;
    this.detectionMethod = 'explicit';
    logger.info('Executor mode changed', { from: previousMode, to: mode });

    if (this.eventBus) {
      this.eventBus.emit({
        id: generateEventId(),
        timestamp: timestamp(),
        type: 'executor:mode_set',
        source: { kind: 'system' },
        payload: {
          type: 'executor:mode_set',
          data: {
            mode,
            previous_mode: previousMode,
            detection_method: 'explicit',
          },
        },
      });
    }
  }

  /**
   * Check if the current mode processes queued events.
   * daemon and hybrid modes process the queue; engaged does not.
   */
  shouldProcessQueue(): boolean {
    return this.currentMode === 'daemon' || this.currentMode === 'hybrid';
  }

  /**
   * Check if context should be cleared after a batch.
   * Only daemon mode with clear_context_after_batch clears context.
   */
  shouldClearContext(): boolean {
    return (
      this.currentMode === 'daemon' &&
      this.config.daemon.clear_context_after_batch
    );
  }

  /**
   * Update the config reference for hot-reload support.
   * Called by ProcessManager.updateConfig() when runtime_config changes.
   */
  updateConfig(config: ExecutorConfig): void {
    this.config = config;
  }

  /**
   * Infer the executor mode from the process environment.
   * If TMUX is set and GOODVIBES_INTERACTIVE is not set, infer daemon.
   * Hybrid is never inferred — always explicit.
   */
  private inferFromEnvironment(): ExecutorMode | null {
    const tmux = process.env['TMUX'];
    const interactive = process.env['GOODVIBES_INTERACTIVE'];
    if (tmux && !interactive) {
      return 'daemon';
    }
    return null;
  }
}
