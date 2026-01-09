/* v8 ignore file */
/**
 * State management for GoodVibes hooks.
 *
 * This module provides a centralized state management system for tracking
 * hook execution context, session data, and error states across the GoodVibes system.
 */

// Re-export all state operations from submodules
export * from './persistence.js';
export * from './updaters.js';
export * from './error-tracking.js';
export * from './session.js';
