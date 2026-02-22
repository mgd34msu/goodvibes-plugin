/**
 * Audit Hook Dependencies Handler
 *
 * Analyzes React hook dependency arrays for stale closures, missing/unnecessary
 * dependencies, unstable references, and anti-patterns like derived state in effects.
 *
 * @module handlers/frontend/audit-hook-dependencies
 */

// Re-export everything from the modular implementation
export {
  handleAuditHookDependencies,
  type AuditHookDependenciesArgs,
  type AuditResult,
  type HookInfo,
  type HookIssue,
} from './hook-dependencies/index.js';
