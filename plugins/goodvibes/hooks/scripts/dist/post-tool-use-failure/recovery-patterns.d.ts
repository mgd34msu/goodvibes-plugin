/**
 * Error Recovery Pattern Definitions
 *
 * Library of recovery patterns for common error types encountered during tool use.
 * Each pattern includes regex matchers and suggested fixes.
 */
import type { RecoveryPattern } from './recovery-types.js';
/**
 * Library of recovery patterns for common error types.
 * Organized by category: TypeScript, imports, tests, builds, npm, filesystem, git, etc.
 */
export declare const RECOVERY_PATTERNS: RecoveryPattern[];
