/**
 * AdapterRegistry — Manages the lifecycle of all registered EventSourceAdapters.
 *
 * Provides a central point for registering, starting, stopping, and querying
 * the status of all adapters in the runtime engine.
 */

import type { EventSourceAdapter, AdapterStatus } from './types.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('adapter-registry');

// ─── AdapterRegistry ─────────────────────────────────────────────────────────────

/**
 * Manages all EventSourceAdapters for the runtime engine.
 *
 * Adapters are registered by name and started/stopped together.
 * The registry provides a unified view of adapter status for observability.
 */
export class AdapterRegistry {
  private readonly adapters = new Map<string, EventSourceAdapter>();

  // ─── Registration ────────────────────────────────────────────────────────────

  /**
   * Register an adapter. Throws if an adapter with the same name is already registered.
   */
  register(adapter: EventSourceAdapter): void {
    if (this.adapters.has(adapter.name)) {
      throw new Error(
        `AdapterRegistry: adapter '${adapter.name}' is already registered. ` +
        'Deregister the existing adapter before registering a new one.',
      );
    }
    this.adapters.set(adapter.name, adapter);
    logger.debug('Adapter registered', { name: adapter.name });
  }

  /**
   * Deregister an adapter by name. Stops the adapter before removing it.
   * No-op if the adapter is not registered.
   */
  async deregister(name: string): Promise<void> {
    const adapter = this.adapters.get(name);
    if (!adapter) return;
    await adapter.stop();
    this.adapters.delete(name);
    logger.debug('Adapter deregistered', { name });
  }

  /**
   * Retrieve a registered adapter by name.
   * Returns undefined if not found.
   */
  get(name: string): EventSourceAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Returns all registered adapter names.
   */
  names(): string[] {
    return Array.from(this.adapters.keys());
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────────

  /**
   * Start all registered adapters.
   * Adapters are started in registration order.
   * If any adapter fails to start, the error is logged and remaining adapters
   * are still attempted (partial start is allowed).
   */
  async startAll(): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(this.adapters.values()).map(async (adapter) => {
        await adapter.start();
        logger.debug('Adapter started', { name: adapter.name });
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Adapter failed to start', {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
  }

  /**
   * Stop all registered adapters.
   * All adapters are stopped regardless of individual failures.
   */
  async stopAll(): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(this.adapters.values()).map(async (adapter) => {
        await adapter.stop();
        logger.debug('Adapter stopped', { name: adapter.name });
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Adapter failed to stop cleanly', {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
  }

  // ─── Observability ────────────────────────────────────────────────────────────

  /**
   * Returns a map of adapter name → AdapterStatus for all registered adapters.
   */
  getStatus(): Map<string, AdapterStatus> {
    const status = new Map<string, AdapterStatus>();
    for (const [name, adapter] of this.adapters) {
      status.set(name, adapter.status());
    }
    return status;
  }
}
