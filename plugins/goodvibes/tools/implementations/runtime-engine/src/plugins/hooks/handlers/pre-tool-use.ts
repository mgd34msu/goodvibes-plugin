/**
 * PreToolUse Handler
 *
 * Blocks deprecated native tools and delivers any pending directives
 * via additionalContext.
 */

import type { HookEvent } from '../../../extensions/events/factories.js';
import type { ClaudeHookResponse } from '../hook-processor.js';
import { createLogger } from '../../../shared/logger.js';

const logger = createLogger('handler:pre-tool-use');

/**
 * Tools that have been deprecated in favour of precision_engine equivalents.
 * Blocking these enforces the precision tools policy.
 */
const BLOCKED_TOOLS = new Set([
  'Read',
  'Write',
  'Edit',
  'Grep',
  'Glob',
  'WebFetch',
  'Update',
  'NotebookEdit',
]);

/**
 * Specific precision_engine replacement for each deprecated tool.
 * Provides a targeted error message rather than a generic list.
 */
const REPLACEMENT_MAP: Record<string, string> = {
  Read: 'precision_read',
  Write: 'precision_write',
  Edit: 'precision_edit',
  Grep: 'precision_grep',
  Glob: 'precision_glob',
  WebFetch: 'precision_fetch',
  Update: 'precision_edit',
  NotebookEdit: 'precision_notebook',
};

/**
 * Block deprecated native tools.
 *
 * Returns a block decision with an informative reason when the tool being
 * invoked is in the blocked set. Returns null (no opinion) for all other tools.
 */
export async function handlePreToolUse(
  _event: HookEvent,
  input: Record<string, unknown>,
): Promise<ClaudeHookResponse | null> {
  const toolName = typeof input['tool_name'] === 'string' ? input['tool_name'] : null;
  if (!toolName) return null;

  if (BLOCKED_TOOLS.has(toolName)) {
    const replacement = REPLACEMENT_MAP[toolName] ?? 'the precision_engine equivalent';
    logger.info('Blocking deprecated native tool', { toolName, replacement });
    return {
      decision: 'block',
      reason: `Tool '${toolName}' is deprecated. Use ${replacement} instead.`,
    };
  }

  return null;
}
