/**
 * Event Bridge — Extensions Layer
 *
 * Bridges EventBus events to the core EventQueue, enabling hook-originated
 * events (agent:spawned, agent:completed) to reach plugin handlers.
 * Uses origin tagging to prevent infinite forwarding loops.
 */
import { createLogger } from '../../shared/logger.js';
import type { EventQueueInterface, RuntimeEvent as CoreRuntimeEvent } from '../../core/types.js';
import type { EventBus } from './event-bus.js';
import type { RuntimeEvent } from './types.js';

const logger = createLogger('event-bridge');

/** Origin tag added to forwarded events to prevent loops */
const BRIDGE_ORIGIN = '__event_bridge__';

/** Event type patterns to forward to the core pipeline */
const FORWARDED_PATTERNS = new Set<string>([
  'agent:spawned',
  'agent:completed',
  'hook:subagent_start',
  'hook:subagent_stop',
  'workflow:created',
  'workflow:state_changed',
]);

/**
 * Unidirectional bridge: EventBus → CoreEventQueue only.
 *
 * Events flow from the extensions EventBus into the core EventQueue.
 * Reverse bridging (CoreEventQueue → EventBus) is intentionally omitted:
 * adding it would require a separate loop-prevention mechanism (distinct from
 * the origin-tag guard used here), since core events re-entering the EventBus
 * would trigger new subscriptions and risk infinite forwarding.
 */
export class EventBridge {
  private unsubscribe?: () => void;
  private forwarded = 0;
  private filtered = 0;

  constructor(
    private readonly eventBus: EventBus,
    private readonly eventQueue: EventQueueInterface,
  ) {}

  /**
   * Start forwarding events from EventBus to the core EventQueue.
   * Uses wildcard subscription and filters to relevant event types.
   */
  start(): void {
    if (this.unsubscribe) {
      logger.warn('Event bridge already started');
      return;
    }

    this.unsubscribe = this.eventBus.on('*', (event: RuntimeEvent) => {
      // Skip events that originated from the bridge (prevent loops)
      const meta = event.metadata;
      if (meta && typeof meta === 'object' && 'origin' in meta && meta.origin === BRIDGE_ORIGIN) {
        return;
      }

      // Only forward relevant event types
      if (!FORWARDED_PATTERNS.has(event.type)) {
        this.filtered++;
        return;
      }

      // Map EventBus source kind to core EventSource string
      const source = event.source.kind === 'agent'
        ? 'agent' as const
        : event.source.kind === 'system' || event.source.kind === 'hook'
          || event.source.kind === 'trigger'
          ? 'internal' as const
          : 'external' as const;

      // Construct a proper CoreRuntimeEvent — no `as any` cast
      const v3Event: CoreRuntimeEvent = {
        id: event.id,
        type: event.type,
        source,
        payload: event.payload,
        timestamp: typeof event.timestamp === 'string'
          ? new Date(event.timestamp).getTime()
          : Date.now(),
        priority: 0,
        context: {
          // Preserve correlation ref from source metadata if present
          ...(event.metadata?.correlation_id !== undefined && {
            ref: event.metadata.correlation_id,
          }),
        },
      };

      this.eventQueue.enqueue(v3Event);
      this.forwarded++;

      logger.debug('Bridged event', {
        type: event.type,
        forwarded: this.forwarded,
      });
    });

    logger.info('Event bridge started', {
      patterns: [...FORWARDED_PATTERNS],
    });
  }

  /** Stop forwarding events */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
      logger.info('Event bridge stopped', {
        forwarded: this.forwarded,
        filtered: this.filtered,
      });
    }
  }

  /** Get bridge statistics */
  getStats(): { forwarded: number; filtered: number; active: boolean } {
    return {
      forwarded: this.forwarded,
      filtered: this.filtered,
      active: !!this.unsubscribe,
    };
  }
}
