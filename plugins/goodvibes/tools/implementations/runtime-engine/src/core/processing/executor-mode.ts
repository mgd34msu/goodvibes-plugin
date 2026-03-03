/**
 * ExecutorModeManager
 *
 * Determines and manages the current executor mode for the runtime engine session.
 * Mode detection priority:
 *   1. Env var GOODVIBES_EXECUTOR_MODE (explicit override)
 *   2. Config executor.mode != 'engaged' (explicit config)
 *   3. Default: 'engaged'
 *
 * Note: TMUX auto-detection was removed. Daemon mode must be opted in to
 * explicitly via GOODVIBES_EXECUTOR_MODE env var or config.executor.mode.
 */

import type { ExecutorMode, ExecutorConfig } from '../../shared/config.js';
import type { EventEmitter } from '../types.js';
import { createLogger } from '../../shared/logger.js';
import { generateEventId, timestamp } from '../../shared/utils.js';

const logger = createLogger('executor-mode');

/** How the executor mode was determined. */
export type DetectionMethod = 'explicit' | 'inferred' | 'default';

export class ExecutorModeManager {
  private currentMode: ExecutorMode;
  private detectionMethod: DetectionMethod;
  private config: ExecutorConfig;
  private eventBus: EventEmitter | null;

  constructor(config: ExecutorConfig, eventBus?: EventEmitter) {
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
   * 3. Default: 'engaged'
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

    // Priority 3: Default
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
  getDetectionMethod(): DetectionMethod {
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
        priority: 0,
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
        metadata: { session_id: '', sequence: 0, version: 1 },
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
   * Called by RuntimeEngine.updateConfig() when runtime_config changes.
   */
  updateConfig(config: ExecutorConfig): void {
    this.config = config;
  }

}

