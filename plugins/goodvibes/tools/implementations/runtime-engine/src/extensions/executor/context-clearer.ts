/**
 * ContextClearer
 *
 * Clears Claude's conversation context after a daemon batch.
 * Primary method: tmux send-keys to inject /clear into the session.
 * Fallback: queue injection for non-tmux environments.
 */

import { execFileSync } from 'node:child_process';
import type { DaemonConfig } from '../../shared/config.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('context-clearer');

/** Timeout in ms for tmux send-keys command. */
const TMUX_TIMEOUT_MS = 5000;

export class ContextClearer {
  private config: DaemonConfig;

  constructor(config: DaemonConfig) {
    this.config = config;
  }

  /**
   * Clear context using the best available method.
   *
   * 1. Primary: tmux send-keys to inject /clear into the session
   * 2. Fallback: queue injection (handled on next tick)
   *
   * @returns Method used and success status.
   */
  async clearContext(): Promise<{ method: 'tmux' | 'queue_injection'; success: boolean }> {
    if (this.isTmuxAvailable()) {
      try {
        const success = await this.clearViaTmux();
        if (success) {
          logger.info('Context cleared via tmux', { session: this.config.tmux_session_name });
          return { method: 'tmux', success: true };
        }
        logger.warn('tmux clear failed, falling back to queue injection');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('tmux clear threw an error, falling back to queue injection', { error: msg });
      }
    } else {
      logger.debug('tmux not available, using queue injection fallback');
    }

    // Fallback: queue injection
    // The /clear directive will be included in the next tick's additionalContext.
    // This is a degraded path — context is not immediately cleared but the
    // instruction is delivered on the next tick.
    logger.info('Context clear queued via injection fallback');
    return { method: 'queue_injection', success: true };
  }

  /**
   * Check if tmux is available.
   * Returns true if the TMUX environment variable is set (indicating we are
   * running inside a tmux session).
   */
  private isTmuxAvailable(): boolean {
    return typeof process.env['TMUX'] === 'string' && process.env['TMUX'].length > 0;
  }

  /**
   * Execute tmux send-keys to type /clear into the configured session.
   * Uses execSync with a 5-second timeout.
   *
   * @returns true if the command succeeded, false if it failed.
   */
  private async clearViaTmux(): Promise<boolean> {
    const sessionName = this.config.tmux_session_name;
    try {
      execFileSync('tmux', ['send-keys', '-t', sessionName, '/clear'], { timeout: TMUX_TIMEOUT_MS, stdio: 'pipe' });
      execFileSync('tmux', ['send-keys', '-t', sessionName, 'Enter'], { timeout: TMUX_TIMEOUT_MS, stdio: 'pipe' });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('tmux send-keys failed', { session: sessionName, error: msg });
      return false;
    }
  }
}
