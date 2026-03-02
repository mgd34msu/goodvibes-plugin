/**
 * Runtime Event Type System — L2 Extension Layer
 *
 * @deprecated
 * Import event types from `../../shared/events.js` instead of this file.
 * This module now re-exports everything from the shared layer for backward
 * compatibility. It will be removed in a future version.
 *
 * All type definitions have been moved to shared/events.ts which is the
 * single source of truth for all event types in the runtime engine.
 */

export type {
  EventSource,
  EventType,
  EventPayload,
  EventMetadata,
  EventContext,
  RuntimeEvent,
  EventTypePattern,
  EventHandler,
  Unsubscribe,
  EventFilter,
  SessionStartedPayload,
  HookEventPayload,
  WorkflowStateChangedPayload,
  AgentSpawnedPayload,
  AgentProgressPayload,
  TriggerFiredPayload,
  FileModifiedPayload,
  BuildResultPayload,
  TestResultPayload,
  DevServerPayload,
  EngineEventPayload,
  SystemErrorPayload,
} from '../../shared/events.js';

export {
  createEvent,
  generateEventId,
} from '../../shared/events.js';
