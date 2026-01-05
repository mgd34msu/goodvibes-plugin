/**
 * @module post-tool-use
 *
 * Post-tool-use hook utilities for processing tool execution results.
 *
 * This module re-exports all post-tool-use functionality including:
 * - File tracking and modification detection
 * - Checkpoint management for automated saves
 * - Git branch management
 * - Development server monitoring
 * - Response formatting
 * - MCP tool handlers
 * - Automation runners (tests, builds)
 * - File automation triggers
 * - Bash command result processing
 */

// Existing modules
export * from './file-tracker.js';
export * from './checkpoint-manager.js';
export * from './git-branch-manager.js';
export * from './dev-server-monitor.js';

// New modules from post-tool-use.ts split
export * from './response.js';
export * from './mcp-handlers.js';
export * from './automation-runners.js';
export * from './file-automation.js';
export * from './bash-handler.js';
