/**
 * @module pre-tool-use
 *
 * Pre-tool-use hook utilities for validating and guarding tool execution.
 *
 * This module re-exports all pre-tool-use functionality including:
 * - Subagent tool blocking (redirect Read/Edit/Update/Write/Glob/Grep/WebFetch to MCP precision tools)
 * - Quality gates for file operations (require Read before Edit/Write)
 * - Git operation guards (prevent destructive operations, detect secrets)
 * - Command validation and safety checks
 */
export * from './subagent-blockers.js';
export * from './quality-gates.js';
export * from './git-guards.js';
