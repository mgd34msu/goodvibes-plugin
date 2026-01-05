/**
 * @module pre-tool-use
 *
 * Pre-tool-use hook utilities for validating and guarding tool execution.
 *
 * This module re-exports all pre-tool-use functionality including:
 * - Quality gates for file operations (require Read before Edit/Write)
 * - Git operation guards (prevent destructive operations, detect secrets)
 * - Command validation and safety checks
 */
export * from './quality-gates.js';
export * from './git-guards.js';
