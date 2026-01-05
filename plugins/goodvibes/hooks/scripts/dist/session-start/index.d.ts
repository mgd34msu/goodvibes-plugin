/**
 * @module session-start
 *
 * Session-start hook utilities for initializing new Claude Code sessions.
 *
 * This module re-exports all session initialization functionality including:
 * - Context building (stack detection, environment analysis, health checks)
 * - Context injection into session prompts
 * - Crash recovery from previous failed sessions
 * - Response formatting for session startup
 */
export * from './context-builder.js';
export * from './context-injection.js';
export * from './crash-recovery.js';
export * from './response-formatter.js';
