/**
 * Response Formatter Module
 *
 * Handles the creation of session-start hook responses,
 * including system message building and response structure.
 */

import type { ContextGatheringResult } from './context-builder.js';

/** Plugin version string */
const PLUGIN_VERSION = 'v2.1.0';

/** Number of available tools */
const TOOLS_AVAILABLE = 17;

/** Length of session ID suffix to display */
const SESSION_ID_DISPLAY_LENGTH = 8;

/**
 * Builds the system message based on context gathering results.
 *
 * The system message provides a brief summary of the plugin state
 * and any important context about the current session.
 *
 * @param sessionId - The current session identifier
 * @param context - The gathered context result
 * @returns A formatted system message string
 */
export function buildSystemMessage(
  sessionId: string,
  context: ContextGatheringResult
): string {
  const parts: string[] = [];

  // Base message
  parts.push(`GoodVibes plugin ${PLUGIN_VERSION} initialized.`);
  parts.push(`${TOOLS_AVAILABLE} tools available.`);

  // Truncate session ID to last 8 characters for brevity
  parts.push(`Session: ${sessionId.slice(-SESSION_ID_DISPLAY_LENGTH)}`);

  // Recovery indicator
  if (context.needsRecovery) {
    parts.push('| RECOVERY MODE');
  }

  // Context summary
  if (context.isEmptyProject) {
    parts.push('| Empty project detected - scaffolding tools available.');
  } else if (context.summary) {
    parts.push(`| ${context.summary}`);
  }

  // Performance note
  if (context.gatherTimeMs > 0) {
    parts.push(`(context: ${context.gatherTimeMs}ms)`);
  }

  return parts.join(' ');
}
