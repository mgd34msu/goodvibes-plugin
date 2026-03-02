/**
 * Events Extension — Barrel Export
 *
 * Exports the EventBus (typed pub/sub with wildcard patterns and history),
 * EventLog (persistent JSONL query interface), and the createEventSubsystem
 * factory used by bootstrap.ts to wire the events layer.
 */

export * from './event-bus.js';
export * from './event-log.js';
export * from './subsystem.js';
