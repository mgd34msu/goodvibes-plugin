/**
 * Events barrel — Layer 2 event type extensions.
 * Re-exports all source-specific event interfaces, type guards, and factories.
 */

export type { HookType, HookEvent } from './hook-event.js';
export { isHookEvent, createHookEvent } from './hook-event.js';

export type { TimeType, TimeEvent } from './time-event.js';
export { isTimeEvent, createTimeEvent } from './time-event.js';

export type { AgentEvent } from './agent-event.js';
export { isAgentEvent, createAgentEvent } from './agent-event.js';

export type { HumanEvent } from './human-event.js';
export { isHumanEvent, createHumanEvent } from './human-event.js';

export type { ExternalEvent } from './external-event.js';
export { isExternalEvent, createExternalEvent } from './external-event.js';
