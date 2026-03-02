/**
 * Adapters barrel — EventSourceAdapter interface and built-in adapters.
 *
 * The adapter pattern bridges external event sources (hooks, time, external
 * webhooks) into the unified RuntimeEvent stream at L2.
 */

export type {
  EventSourceAdapter,
  AdapterStatus,
  TimeSourceAdapter,
  ExternalSourceAdapter,
  TimeTickResult,
  ExternalTickResult,
  SchedulerAccessor,
} from './types.js';

export {
  HookAdapter,
  normalizeHookName,
  VALID_HOOK_TYPES,
} from './hook-adapter.js';
export type { RawHookPayload } from './hook-adapter.js';

export { AdapterRegistry } from './registry.js';
export { TimeAdapter, createTimeAdapter } from './time-adapter.js';
export { ExternalAdapter, createExternalAdapter } from './external-adapter.js';

