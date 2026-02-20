import type { Aggregator } from '../daemon/aggregator.js';
import type { AnalyticsTagInput } from '../schemas/tools.js';
import { type HandlerResponse, text } from './types.js';

// === Module-level session tag/name state ===

/** The tag applied to the current session (if any). */
let _currentTag: string | null = null;

/** The display name applied to the current session (if any). */
let _currentName: string | null = null;

/**
 * Returns the current session tag, if one has been set.
 */
export function getCurrentTag(): string | null {
  return _currentTag;
}

/**
 * Returns the current session display name, if one has been set.
 */
export function getCurrentName(): string | null {
  return _currentName;
}

/**
 * Clears the module-level tag and name state.
 * Called on session reset or shutdown.
 */
export function clearTagState(): void {
  _currentTag = null;
  _currentName = null;
}

// === Handler ===

/**
 * Handle the `analytics_tag` tool.
 *
 * Actions:
 * - `tag`    — Apply a short label to the current session for historical grouping.
 * - `rename` — Set a human-readable display name for the current session.
 *
 * The tag/name is stored in module-level state and attached to the session
 * archive when the session ends via {@link SessionArchiver}.
 *
 * @param aggregator - The running Aggregator instance.
 * @param input      - Validated AnalyticsTagInput from the MCP tool call.
 * @returns MCP tool response with confirmation text.
 */
export async function handleTag(
  aggregator: Aggregator,
  input: AnalyticsTagInput,
): Promise<HandlerResponse> {
  try {
    const state = aggregator.getState();
    const sessionId = state.session_id;

    if (input.action === 'tag') {
      _currentTag = input.value;
      return text(`Session ${sessionId} tagged: "${input.value}"\n\nThe tag will be applied when this session is archived.`);
    }

    // action === 'rename'
    _currentName = input.value;
    return text(`Session ${sessionId} renamed: "${input.value}"\n\nThe display name will be applied when this session is archived.`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return text(`analytics_tag error: ${message}`);
  }
}
