/**
 * HookProcessor — Layer 3 Plugin Entry Point
 *
 * Receives hook events from the IPC layer, normalises them to HookEvent,
 * runs registered handlers in priority order, and merges their responses
 * into a single ClaudeHookResponse.
 */

import { createHookEvent, HookType } from '../../extensions/events/factories.js';
import { HookRegistry } from './hook-registry.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('hook-processor');

// ─── Response Type ────────────────────────────────────────────────────────────

/**
 * The JSON object returned by a hook script to Claude Code.
 * All fields are optional — omitted fields use Claude Code defaults.
 */
export interface ClaudeHookResponse {
  /**
   * Whether to allow or block the current operation.
   * If any handler returns 'block', the merged response is 'block'.
   */
  decision?: 'allow' | 'block';
  /** Human-readable reason for the decision (surfaced to the user). */
  reason?: string;
  /**
   * Additional context injected into the conversation turn.
   * Multiple handlers' contexts are concatenated with newlines.
   */
  additionalContext?: string;
  /**
   * Hook-specific output structure (e.g. for UserPromptSubmit additionalContext).
   * When multiple handlers provide this, the last non-null value wins.
   */
  hookSpecificOutput?: Record<string, unknown>;
  /** Whether to suppress Claude Code's default output for this hook. */
  suppressOutput?: boolean;
}

// ─── Deps ─────────────────────────────────────────────────────────────────────

export interface HookProcessorDeps {
  /** Handler registry to consult for each hook type. */
  registry: HookRegistry;
  /** Session ID for the current Claude Code session. */
  sessionId: string;
}

// ─── Hook Name Normalisation ───────────────────────────────────────────────────

/** Canonical set of all valid HookType values. */
const VALID_HOOK_TYPES = new Set<HookType>([
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'SubagentStart',
  'SubagentStop',
  'SessionStart',
  'SessionEnd',
  'PreCompact',
  'UserPromptSubmit',
  'Notification',
  'Stop',
]);

/**
 * Normalise a raw hook name string (PascalCase or snake_case) to HookType.
 * Returns null for unknown hook names.
 *
 * Strategy:
 * 1. Exact match against the canonical HookType set (PascalCase, already valid).
 * 2. Convert snake_case to PascalCase and try again (Claude Code sends snake_case).
 */
function normalizeHookName(raw: string): HookType | null {
  if (VALID_HOOK_TYPES.has(raw as HookType)) return raw as HookType;
  const pascal = raw
    .split('_')
    .map((s) => (s[0]?.toUpperCase() ?? '') + s.slice(1))
    .join('');
  return VALID_HOOK_TYPES.has(pascal as HookType) ? (pascal as HookType) : null;
}

// ─── HookProcessor ────────────────────────────────────────────────────────────

/**
 * Main hook processing class.
 *
 * Called by the IPC router when a hook_event arrives.
 * Each handler returns ClaudeHookResponse | null.
 * Null means the handler has no opinion — it is ignored during merge.
 */
export class HookProcessor {
  private readonly registry: HookRegistry;
  private readonly sessionId: string;

  constructor(deps: HookProcessorDeps) {
    this.registry = deps.registry;
    this.sessionId = deps.sessionId;
  }

  /**
   * Process a hook event from Claude Code.
   *
   * Steps:
   * 1. Normalise hook_name to HookType.
   * 2. Create HookEvent.
   * 3. Run registered handlers in priority order.
   * 4. Merge responses: block wins over allow, contexts concatenate.
   * 5. Return ClaudeHookResponse.
   */
  async process(
    hookName: string,
    hookInput: Record<string, unknown>,
  ): Promise<ClaudeHookResponse> {
    const hookType = normalizeHookName(hookName);
    if (!hookType) {
      logger.debug('Unknown hook name — no-op', { hookName });
      return {};
    }

    const event = createHookEvent({
      hook_type: hookType,
      hook_input: hookInput,
      session_id: this.sessionId,
    });

    const handlers = this.registry.getHandlers(hookType);
    if (handlers.length === 0) {
      return {};
    }

    logger.debug('Processing hook event', {
      hookType,
      handlerCount: handlers.length,
      eventId: event.id,
    });

    const responses: ClaudeHookResponse[] = [];
    for (const registered of handlers) {
      try {
        const result = await registered.handler(event, hookInput);
        if (result !== null) {
          responses.push(result);
        }
      } catch (err) {
        logger.error('Handler threw an error', {
          handlerId: registered.id,
          hookType,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return this.mergeResponses(responses);
  }

  /**
   * Merge multiple handler responses into one.
   *
   * Rules:
   * - 'block' decision wins over 'allow' (any block → block).
   * - reasons are concatenated ('; ' separated) when blocking.
   * - additionalContext values are concatenated with '\n\n'.
   *   The merged additionalContext is capped at 100 KB (102 400 bytes UTF-8).
   *   Content beyond the cap is silently truncated to prevent oversized hook
   *   payloads from destabilising Claude Code's conversation context.
   * - hookSpecificOutput: last non-null value wins.
   * - suppressOutput: true wins (any true → true).
   */
  private mergeResponses(responses: ClaudeHookResponse[]): ClaudeHookResponse {
    if (responses.length === 0) return {};
    if (responses.length === 1) return { ...responses[0] };

    const merged: ClaudeHookResponse = {};

    const blockReasons: string[] = [];
    const contexts: string[] = [];
    let hasBlock = false;

    for (const r of responses) {
      if (r.decision === 'block') {
        hasBlock = true;
        if (r.reason) blockReasons.push(r.reason);
      }
      if (r.additionalContext) {
        contexts.push(r.additionalContext);
      }
      if (r.hookSpecificOutput) {
        merged.hookSpecificOutput = r.hookSpecificOutput;
      }
      if (r.suppressOutput) {
        merged.suppressOutput = true;
      }
    }

    if (hasBlock) {
      merged.decision = 'block';
      if (blockReasons.length > 0) {
        merged.reason = blockReasons.join('; ');
      }
    } else {
      // Check if any response explicitly allows
      const allowResp = responses.find((r) => r.decision === 'allow');
      if (allowResp) {
        merged.decision = 'allow';
        if (allowResp.reason) merged.reason = allowResp.reason;
      }
    }

    if (contexts.length > 0) {
      const joined = contexts.join('\n\n');
      // Cap merged additionalContext at 100 KB (102 400 bytes, UTF-8).
      // Oversized context strings can destabilise Claude Code's conversation
      // context and cause downstream parsing failures.
      const MAX_ADDITIONAL_CONTEXT_BYTES = 100 * 1024;
      if (Buffer.byteLength(joined, 'utf8') > MAX_ADDITIONAL_CONTEXT_BYTES) {
        logger.warn('additionalContext exceeds 100 KB cap; truncating', {
          original_bytes: Buffer.byteLength(joined, 'utf8'),
          cap_bytes: MAX_ADDITIONAL_CONTEXT_BYTES,
        });
        // Truncate to nearest character boundary within the byte budget
        merged.additionalContext = Buffer.from(joined, 'utf8')
          .subarray(0, MAX_ADDITIONAL_CONTEXT_BYTES)
          .toString('utf8')
          // Remove any trailing partial multi-byte character
          .replace(/[\uFFFD\uD800-\uDFFF]?$/, '');
      } else {
        merged.additionalContext = joined;
      }
    }

    return merged;
  }
}
