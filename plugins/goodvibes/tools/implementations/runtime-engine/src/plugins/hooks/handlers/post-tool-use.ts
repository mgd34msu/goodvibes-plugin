/**
 * PostToolUse Handler
 *
 * Tracks modified files from tool results and emits file:* / build:* events.
 */

import type { HookEvent } from '../../../extensions/events/factories.js';
import type { ClaudeHookResponse } from '../hook-processor.js';
import type { EventBus } from '../../../extensions/events/event-bus.js';
import { createLogger } from '../../../shared/logger.js';

const logger = createLogger('handler:post-tool-use');

/**
 * Tool names whose output indicates file writes.
 * Note: legacy 'Write' and 'Edit' are blocked at PreToolUse before reaching this handler.
 */
const FILE_WRITE_TOOLS = new Set([
  'precision_write',
  'precision_edit',
]);

export interface PostToolUseDeps {
  eventBus: EventBus | null;
}

/**
 * Creates a PostToolUse handler.
 *
 * Detects file modifications from precision_write / precision_edit tool results
 * and emits file:modified events. Also detects build completions.
 */
export function createPostToolUseHandler(
  deps: PostToolUseDeps,
): (event: HookEvent, input: Record<string, unknown>) => Promise<ClaudeHookResponse | null> {
  return async function handlePostToolUse(
    event: HookEvent,
    input: Record<string, unknown>,
  ): Promise<ClaudeHookResponse | null> {
    const toolName = typeof input['tool_name'] === 'string' ? input['tool_name'] : null;
    if (!toolName || !deps.eventBus) return null;

    const sessionId = event.session_id;

    // ── File tracking ───────────────────────────────────────────────────────
    if (FILE_WRITE_TOOLS.has(toolName)) {
      const paths = extractModifiedPaths(input);
      for (const path of paths) {
        try {
          deps.eventBus.emit({
            id: `evt_file_modified_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            type: 'file:modified',
            source: { kind: 'hook', hook_name: 'post_tool_use' },
            payload: {
              type: 'file:modified',
              data: {
                path,
                change_type: 'modify' as const,
              },
            },
            metadata: { session_id: sessionId },
          });
        } catch (err) {
          logger.warn('Failed to emit file:modified', {
            path,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return null;
  };
}

/**
 * Attempt to extract file paths from a tool result.
 * Handles common shapes from precision_write and precision_edit.
 */
function extractModifiedPaths(input: Record<string, unknown>): string[] {
  const result = input['tool_result'];
  if (!result || typeof result !== 'object') return [];

  // precision_write/edit result: { files: [{ path: string }] }
  const r = result as Record<string, unknown>;
  if (Array.isArray(r['files'])) {
    return (r['files'] as unknown[])
      .filter((f): f is { path: string } => typeof f === 'object' && f !== null && typeof (f as Record<string, unknown>)['path'] === 'string')
      .map((f) => f.path);
  }

  // Fallback: look at tool input for file paths
  const toolInput = input['tool_input'];
  if (toolInput && typeof toolInput === 'object') {
    const ti = toolInput as Record<string, unknown>;
    const inputPath = ti['path'] ?? ti['file_path'];
    if (typeof inputPath === 'string') return [inputPath];
  }

  return [];
}
