/**
 * Data module barrel export.
 *
 * Re-exports all public symbols from the analytics-engine data module.
 */

export { TelemetryReader } from './telemetry-reader.js';
export { SessionReader } from './session-reader.js';
export type { SessionData } from './session-reader.js';
export { IndexReader } from './index-reader.js';
export { HistoricalStore } from './historical-store.js';
