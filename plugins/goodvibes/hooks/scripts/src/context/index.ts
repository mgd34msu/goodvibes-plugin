/**
 * Context Module Exports
 *
 * Re-exports all context detection and formatting utilities.
 */

export * from './stack-detector.js';
export * from './git-context.js';
// Export from environment.js (the consolidated module)
export * from './environment.js';
// Note: env-checker.js is kept for backwards compatibility but consumers should
// import from environment.js directly. We don't re-export it here to avoid conflicts.
export * from './todo-scanner.js';
export * from './health-checker.js';
export * from './folder-analyzer.js';
export * from './empty-project.js';
export * from './port-checker.js';
