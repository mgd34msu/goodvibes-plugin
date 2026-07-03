/**
 * Daemon module barrel export.
 *
 * Re-exports all public symbols from the analytics-engine daemon module.
 */

export { Aggregator } from './aggregator.js';
export { AnomalyDetector } from './anomaly-detector.js';
export type { AnomalyRule } from './anomaly-detector.js';
export { BudgetTracker } from './budget-tracker.js';
export { DataWatcher } from './watcher.js';
export type { WatcherEvents, WatcherEventName } from './watcher.js';
export { MemoryUpdater } from './memory-updater.js';
export type { PatternUpdate, PreferenceUpdate } from './memory-updater.js';
