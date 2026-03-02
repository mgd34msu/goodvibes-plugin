/**
 * ExternalAdapter — Layer 2 Extension Adapter
 *
 * Adapts the Layer 3 ExternalPlugin to the L2 ExternalSourceAdapter interface.
 * This breaks the direct L2→L3 import in the TickDriver by introducing
 * a stable interface boundary.
 *
 * Responsibilities:
 * - Wraps ExternalPlugin.onTick() and ExternalPlugin.initialize()
 * - Delegates file-drop scanning and HTTP ingestion to the plugin unchanged
 * - Implements EventSourceAdapter for generic adapter registration
 *
 * Cross-layer note: This file intentionally imports from L3 (plugins/external).
 * Adapter files are the ONLY L2 files permitted to import from L3. All other
 * L2 consumers must use the adapter interfaces defined in types.ts.
 */

import type { ExternalPlugin } from '../../plugins/external/index.js';
import type {
  ExternalSourceAdapter,
  ExternalTickResult,
} from './types.js';

// ─── ExternalAdapter ──────────────────────────────────────────────────────────

/**
 * Wraps an ExternalPlugin instance and exposes it via the L2 ExternalSourceAdapter
 * interface, eliminating the direct L3 import from the TickDriver.
 *
 * @example
 * ```ts
 * const adapter = new ExternalAdapter(externalPlugin);
 * await adapter.initialize();
 * const result = await adapter.onTick();
 * // → { events_ingested: number }
 * ```
 */
export class ExternalAdapter implements ExternalSourceAdapter {
  readonly kind = 'external' as const;

  constructor(private readonly plugin: ExternalPlugin) {}

  /**
   * Delegates to ExternalPlugin.initialize().
   * Ensures the file-drop directories exist before the first tick.
   */
  async initialize(): Promise<void> {
    await this.plugin.initialize();
  }

  /**
   * Delegates to ExternalPlugin.onTick().
   * The plugin scans the incoming directory, normalizes JSON drop files via
   * the NormalizerRegistry, and enqueues ExternalEvents into the shared queue.
   * No additional normalization is needed here.
   */
  async onTick(): Promise<ExternalTickResult> {
    return this.plugin.onTick();
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an ExternalAdapter wrapping the given ExternalPlugin.
 * Prefer this factory over direct construction for testability.
 */
export function createExternalAdapter(plugin: ExternalPlugin): ExternalAdapter {
  return new ExternalAdapter(plugin);
}
