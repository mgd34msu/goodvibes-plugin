/**
 * @module subagent-stop
 *
 * Subagent-stop hook utilities for processing subagent completion.
 *
 * This module re-exports all subagent termination functionality including:
 * - Telemetry recording for subagent sessions
 * - Output validation and result verification
 * - Test execution verification
 */

export * from './telemetry.js';
export * from './output-validation.js';
export * from './test-verification.js';
