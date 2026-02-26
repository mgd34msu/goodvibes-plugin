/**
 * Loop Lifecycle — Layer 1
 *
 * State machine for the event processing loop.
 *
 * Valid transitions:
 *   stopped  → running    (start)
 *   running  → paused     (pause)
 *   paused   → running    (resume)
 *   running  → draining   (drain)
 *   draining → stopped    (drain completes)
 *   running  → stopped    (shutdown)
 *   paused   → stopped    (shutdown)
 *   draining → stopped    (shutdown)
 *
 * Events are accepted in all states except 'stopped'.
 * Events are processed only in 'running' state.
 */

import { createLogger } from '../shared/logger.js';
import type { LoopLifecycle, LoopStatus } from './types.js';

const logger = createLogger('core:lifecycle');

export interface LifecycleOptions {
  /**
   * Optional callback invoked on every valid state transition.
   * Receives (from, to) as arguments.
   */
  onTransition?: (from: LoopStatus, to: LoopStatus) => void;
  /**
   * Optional async callback invoked during shutdown before stopping.
   * Use for state persistence, resource cleanup, etc.
   */
  onShutdown?: () => Promise<void>;
  /**
   * Optional async callback invoked during drain.
   * Should process all remaining events.
   */
  onDrain?: () => Promise<void>;
}

/**
 * Valid state transition table.
 */
const VALID_TRANSITIONS: Record<LoopStatus, LoopStatus[]> = {
  stopped: ['running'],
  /**
   * 'stopped' is included here to support forceTransition() during shutdown
   * (which bypasses this table). It is NOT reachable via the public API —
   * the only public path to 'stopped' is through drain() or shutdown().
   * Reserved for future use if a direct stop() method is added.
   */
  running: ['paused', 'draining', 'stopped'],
  paused: ['running', 'stopped'],
  draining: ['stopped'],
};

/**
 * Loop lifecycle state machine.
 * Implements {@link LoopLifecycle}.
 */
export class LoopLifecycleManager implements LoopLifecycle {
  private _status: LoopStatus = 'stopped';
  private readonly options: LifecycleOptions;

  constructor(options: LifecycleOptions = {}) {
    this.options = options;
  }

  /**
   * Current loop status.
   */
  status(): LoopStatus {
    return this._status;
  }

  /**
   * Transition to 'running'.
   * @throws if the current state does not allow this transition.
   */
  start(): void {
    this.transition('running');
  }

  /**
   * Transition to 'paused'.
   * Events continue to be accepted but are not processed.
   * @throws if the current state does not allow this transition.
   */
  pause(): void {
    this.transition('paused');
  }

  /**
   * Resume from 'paused' → 'running'.
   * @throws if the current state is not 'paused'.
   */
  resume(): void {
    if (this._status !== 'paused') {
      throw new Error(`Cannot resume from status '${this._status}': must be 'paused'`);
    }
    this.transition('running');
  }

  /**
   * Drain: process all remaining events then transition to 'stopped'.
   * Calls options.onDrain() if provided.
   * @throws if the current state does not allow transitioning to 'draining'.
   */
  async drain(): Promise<void> {
    this.transition('draining');
    try {
      if (this.options.onDrain) {
        await this.options.onDrain();
      }
    } finally {
      this.transition('stopped');
    }
  }

  /**
   * Graceful shutdown: run onShutdown callback then transition to 'stopped'.
   * May be called from any non-stopped state.
   *
   * Shutdown bypasses the normal transition table because it must always
   * succeed regardless of the current state (running, paused, or draining).
   * Rather than adding 'stopped' as a valid target from every state — which
   * would undermine the state machine's purpose — we use forceTransition()
   * which logs a warning when it bypasses the table.
   */
  async shutdown(): Promise<void> {
    if (this._status === 'stopped') {
      logger.debug('Shutdown called but already stopped');
      return;
    }
    logger.info('Shutting down event loop', { current: this._status });
    try {
      if (this.options.onShutdown) {
        await this.options.onShutdown();
      }
    } catch (err) {
      logger.error('Error during shutdown callback', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.forceTransition('stopped');
    }
  }

  /**
   * Returns true if events should be accepted (any state except stopped).
   */
  acceptsEvents(): boolean {
    return this._status !== 'stopped';
  }

  /**
   * Returns true if events should be processed (only 'running').
   */
  isProcessing(): boolean {
    return this._status === 'running';
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private transition(to: LoopStatus): void {
    const from = this._status;
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      throw new Error(
        `Invalid lifecycle transition: '${from}' → '${to}'. ` +
        `Allowed from '${from}': [${allowed.join(', ')}]`,
      );
    }
    this._status = to;
    logger.info('Lifecycle transition', { from, to });
    this.options.onTransition?.(from, to);
  }

  /**
   * Force a state transition regardless of the transition table.
   * Logs a warning so that unexpected forced transitions are visible.
   * Only use for shutdown — do not add new callers without justification.
   */
  private forceTransition(to: LoopStatus): void {
    const from = this._status;
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      logger.warn('Forcing lifecycle transition outside transition table', { from, to });
    }
    this._status = to;
    logger.info('Lifecycle transition (forced)', { from, to });
    this.options.onTransition?.(from, to);
  }
}
