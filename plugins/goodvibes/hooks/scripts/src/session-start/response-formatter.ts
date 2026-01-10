/**
 * Response Formatter Module
 *
 * Handles the creation of session-start hook responses,
 * including system message building and response structure.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { ContextGatheringResult } from './context-builder.js';
import { PLUGIN_ROOT } from '../shared/constants.js';

/** Plugin version string */
const PLUGIN_VERSION = 'v2.1.0';

/** Length of session ID suffix to display */
const SESSION_ID_DISPLAY_LENGTH = 8;

/**
 * Get the number of available tools from the registry
 */
function getToolCount(): number {
  try {
    const registryPath = path.join(PLUGIN_ROOT, 'tools', '_registry.yaml');
    const content = fs.readFileSync(registryPath, 'utf-8');
    const registry = yaml.load(content) as { total?: number };
    return registry.total ?? 0;
  } catch {
    return 0;
  }
}

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
  parts.push(`${getToolCount()} tools available.`);

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
