/**
 * PreCompact Handler
 *
 * Persists active workflow state before context compaction so it can be
 * recovered in the subsequent user prompt.
 */

import type { HookEvent } from '../../../extensions/events/hook-event.js';
import type { ClaudeHookResponse } from '../hook-processor.js';
import type { EventBus } from '../../../events/event-bus.js';
import { createLogger } from '../../../shared/logger.js';

const logger = createLogger('handler:pre-compact');

export interface PreCompactDeps {
  eventBus: EventBus | null;
  /** Callback to snapshot active workflow state for recovery after compaction. */
  snapshotState?: () => Record<string, unknown>;
}

/**
 * Creates a PreCompact handler.
 *
 * Emits session:compact and optionally injects the current workflow state
 * as additionalContext so it survives context compaction.
 */
export function createPreCompactHandler(
  deps: PreCompactDeps,
): (event: HookEvent, input: Record<string, unknown>) => Promise<ClaudeHookResponse | null> {
  return async function handlePreCompact(
    event: HookEvent,
    _input: Record<string, unknown>,
  ): Promise<ClaudeHookResponse | null> {
    const sessionId = event.session_id;
    logger.info('Pre-compact', { sessionId });

    if (deps.eventBus) {
      try {
        deps.eventBus.emit({
          id: `evt_pre_compact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          type: 'session:compact',
          source: { kind: 'hook', hook_name: 'pre_compact' },
          payload: {
            type: 'session:compact',
            data: { session_id: sessionId },
          },
          metadata: { session_id: sessionId },
        });
      } catch (err) {
        logger.warn('Failed to emit session:compact', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Snapshot active state for recovery
    const snapshot = deps.snapshotState?.();
    if (snapshot && Object.keys(snapshot).length > 0) {
      const context = JSON.stringify({ action: 'state_snapshot', state: snapshot });
      return {
        additionalContext: `<gv>${context}</gv>`,
      };
    }

    return null;
  };
}
