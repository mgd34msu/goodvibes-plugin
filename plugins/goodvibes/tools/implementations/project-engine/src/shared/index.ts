/**
 * Barrel export for the shared/ foundation layer.
 *
 * Layer 0 — zero domain knowledge, pure infrastructure.
 * All other layers depend on this module.
 *
 * @module shared
 */

export * from './constants.js';
export * from './config.js';
export * from './logger.js';
export * from './types.js';
export * from './response.js';
export * from './utils.js';
