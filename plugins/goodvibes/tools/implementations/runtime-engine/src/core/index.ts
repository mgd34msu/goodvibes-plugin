/**
 * Core Layer — Barrel Exports
 *
 * Public surface of Layer 1.
 * Re-exports from all sub-module barrels and the core types.
 * Consumers should import from this module, not from individual files.
 */

export * from './types.js';
export * from './queues/index.js';
export * from './matching/index.js';
export * from './processing/index.js';
export * from './state/index.js';
export * from './observability/index.js';
export * from './utils/index.js';
export * from './runtime.js';
