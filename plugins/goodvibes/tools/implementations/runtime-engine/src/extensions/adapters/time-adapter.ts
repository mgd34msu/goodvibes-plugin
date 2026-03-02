/**
 * TimeAdapter — Layer 2 Extension Adapter
 *
 * Adapts the Layer 3 TimePlugin to the L2 TimeSourceAdapter interface.
 * This breaks the direct L2→L3 import in the TickDriver by introducing
 * a stable interface boundary.
 *
 * Responsibilities:
 * - Wraps TimePlugin.onTick() and delegates to it unchanged
 * - Exposes getScheduler() as a SchedulerAccessor (interface-only view)
 * - Implements EventSourceAdapter for generic adapter registration
 *
 * Cross-layer note: This file intentionally imports from L3 (plugins/time).
 * Adapter files are the ONLY L2 files permitted to import from L3. All other
 * L2 consumers must use the adapter interfaces defined in types.ts.
 */

import type { TimePlugin } from '../../plugins/time/index.js';
import type {
  TimeSourceAdapter,
  TimeTickResult,
  SchedulerAccessor,
} from './types.js';

// ─── TimeAdapter ──────────────────────────────────────────────────────────────

/**
 * Wraps a TimePlugin instance and exposes it via the L2 TimeSourceAdapter
 * interface, eliminating the direct L3 import from the TickDriver.
 *
 * @example
 * ```ts
 * const adapter = new TimeAdapter(timePlugin);
 * const result = adapter.onTick();
 * // → { heartbeat_emitted: boolean, scheduled_emitted: number }
 * ```
 */
export class TimeAdapter implements TimeSourceAdapter {
  readonly kind = 'time' as const;

  constructor(private readonly plugin: TimePlugin) {}

  /**
   * Delegates to TimePlugin.onTick().
   * Heartbeat and scheduled events are enqueued by the plugin into the
   * shared event queue — no additional normalization is needed here since
   * TimePlugin already uses createTimeEvent() from extensions/events/factories.
   */
  onTick(): TimeTickResult {
    return this.plugin.onTick();
  }

  /**
   * Returns a SchedulerAccessor view of the underlying EventScheduler.
   * The TickDriver uses this to schedule/cancel the daemon heartbeat
   * without needing a direct reference to EventScheduler.
   */
  getScheduler(): SchedulerAccessor {
    const scheduler = this.plugin.getScheduler();
    return {
      getItem: (id: string) => scheduler.getItem(id),
      cancel: (id: string) => scheduler.cancel(id),
      scheduleHeartbeat: (params: {
        id: string;
        event_type: string;
        interval_ms: number;
      }) => {
        scheduler.scheduleHeartbeat(params);
      },
    };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a TimeAdapter wrapping the given TimePlugin.
 * Prefer this factory over direct construction for testability.
 */
export function createTimeAdapter(plugin: TimePlugin): TimeAdapter {
  return new TimeAdapter(plugin);
}
