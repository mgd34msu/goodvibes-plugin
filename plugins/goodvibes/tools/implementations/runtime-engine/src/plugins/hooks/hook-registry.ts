/**
 * HookRegistry — Layer 3 Plugin
 *
 * Priority-sorted handler registration per hook type.
 * Higher priority handlers run first.
 */

import type { HookEvent, HookType } from '../../extensions/events/factories.js';
import type { ClaudeHookResponse } from './hook-processor.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('hook-registry');

// ─── Handler Types ────────────────────────────────────────────────────────────

/**
 * A hook handler function. Returns null to indicate "no opinion"
 * (pass-through). Returns ClaudeHookResponse to influence the outcome.
 */
export type HookHandler = (
  event: HookEvent,
  input: Record<string, unknown>,
) => Promise<ClaudeHookResponse | null>;

/**
 * A registered handler entry.
 */
export interface RegisteredHandler {
  /** Unique handler ID. */
  id: string;
  /** Which hook type this handler processes. */
  hook_type: HookType;
  /** The handler function. */
  handler: HookHandler;
  /** Higher priority = runs first. Default 50. */
  priority: number;
  /** Whether this handler is currently active. */
  enabled: boolean;
}

// ─── HookRegistry ─────────────────────────────────────────────────────────────

/**
 * Registry for hook handlers.
 * Maintains per-hook-type lists sorted by priority (descending).
 */
export class HookRegistry {
  /** Per-hook-type handler lists. Maintained in priority-descending order by register(). */
  private readonly handlers = new Map<HookType, RegisteredHandler[]>();

  /** Flat index of all handlers by ID for enable/disable/unregister. */
  private readonly byId = new Map<string, RegisteredHandler>();

  /**
   * Register a new handler.
   * If a handler with the same ID already exists, it is replaced.
   */
  register(handler: RegisteredHandler): void {
    // Deduplicate by ID
    if (this.byId.has(handler.id)) {
      this.unregister(handler.id);
    }

    const list = this.handlers.get(handler.hook_type) ?? [];
    // Maintain sorted order (descending priority) via binary insertion
    const insertIdx = list.findIndex((h) => h.priority < handler.priority);
    list.splice(insertIdx === -1 ? list.length : insertIdx, 0, handler);
    this.handlers.set(handler.hook_type, list);
    this.byId.set(handler.id, handler);

    logger.debug('Handler registered', {
      id: handler.id,
      hook_type: handler.hook_type,
      priority: handler.priority,
    });
  }

  /**
   * Remove a handler by ID.
   * Returns true if the handler was found and removed.
   */
  unregister(id: string): boolean {
    const handler = this.byId.get(id);
    if (!handler) return false;

    const list = this.handlers.get(handler.hook_type);
    if (list) {
      const idx = list.findIndex((h) => h.id === id);
      if (idx !== -1) list.splice(idx, 1);
    }
    this.byId.delete(id);
    logger.debug('Handler unregistered', { id });
    return true;
  }

  /**
   * Enable a previously disabled handler.
   * No-op if the handler does not exist.
   */
  enable(id: string): void {
    const handler = this.byId.get(id);
    if (handler) {
      handler.enabled = true;
      logger.debug('Handler enabled', { id });
    }
  }

  /**
   * Disable a handler without removing it.
   * Disabled handlers are skipped during processing.
   */
  disable(id: string): void {
    const handler = this.byId.get(id);
    if (handler) {
      handler.enabled = false;
      logger.debug('Handler disabled', { id });
    }
  }

  /**
   * Get all enabled handlers for a given hook type.
   * Order is already priority-descending — maintained by register().
   */
  getHandlers(hookType: HookType): RegisteredHandler[] {
    const list = this.handlers.get(hookType) ?? [];
    return list.filter((h) => h.enabled);
  }

  /**
   * Return the number of registered (not necessarily enabled) handlers
   * for a given hook type.
   */
  count(hookType?: HookType): number {
    if (hookType) {
      return this.handlers.get(hookType)?.length ?? 0;
    }
    return this.byId.size;
  }
}
