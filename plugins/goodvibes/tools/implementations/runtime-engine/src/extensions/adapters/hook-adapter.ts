/**
 * HookAdapter — L2 Event Source Adapter for Claude Code Hooks
 *
 * Bridges Claude Code hook callbacks into the unified RuntimeEvent stream.
 * Implements EventSourceAdapter so the runtime engine can manage it uniformly
 * alongside time and external adapters.
 *
 * Bug fix: normalizeHookName() now handles colon-syntax input (e.g., IPC event
 * type strings like 'hook:pre_tool_use') by stripping the colon prefix before
 * PascalCase conversion. Previously, such strings would cause the PascalCase
 * converter to produce 'Hook:pre_tool_use' instead of 'PreToolUse', resulting
 * in a silent no-op (unknown hook name returned null).
 */

import { generateEventId } from '../../shared/utils.js';
import type { RuntimeEvent } from '../../shared/events.js';
import type { EventSourceAdapter, AdapterStatus } from './types.js';
import type { HookType } from '../events/factories.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('hook-adapter');

// ─── Hook Name Normalisation ─────────────────────────────────────────────────────────

/** Canonical set of all valid HookType values. */
export const VALID_HOOK_TYPES = new Set<HookType>([
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

/** Lookup map from HookType to its IPC event type string. */
const hookTypeToEventType: Record<HookType, string> = {
  PreToolUse: 'hook:pre_tool_use',
  PostToolUse: 'hook:post_tool_use',
  PostToolUseFailure: 'hook:post_tool_use_failure',
  SubagentStart: 'hook:subagent_start',
  SubagentStop: 'hook:subagent_stop',
  SessionStart: 'hook:session_start',
  SessionEnd: 'hook:session_end',
  PreCompact: 'hook:pre_compact',
  UserPromptSubmit: 'hook:user_prompt_submit',
  Notification: 'hook:notification',
  Stop: 'hook:stop',
};

/**
 * Normalise a raw hook name string to HookType.
 * Returns null for unknown hook names.
 *
 * Strategy (in order):
 * 1. Exact match against the canonical HookType set (already PascalCase).
 * 2. Strip a leading colon-prefix segment (e.g., 'hook:pre_tool_use' → 'pre_tool_use').
 *    This fixes the colon-syntax bug where IPC event type strings were passed
 *    directly as hook names, causing the PascalCase conversion to produce
 *    'Hook:pre_tool_use' (treating 'hook' as a word) instead of 'PreToolUse'.
 * 3. Convert snake_case to PascalCase and try again (Claude Code sends snake_case).
 */
export function normalizeHookName(raw: string): HookType | null {
  // Step 1: Exact match (PascalCase, already valid)
  if (VALID_HOOK_TYPES.has(raw as HookType)) return raw as HookType;

  // Step 2: Strip colon-prefix segment
  // e.g., 'hook:pre_tool_use' → 'pre_tool_use', 'hook:SubagentStop' → 'SubagentStop'
  const colonIdx = raw.indexOf(':');
  const withoutPrefix = colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;

  // Check if stripping the prefix gave us a direct PascalCase match
  if (VALID_HOOK_TYPES.has(withoutPrefix as HookType)) return withoutPrefix as HookType;

  // Step 3: Convert snake_case (or colon-stripped snake_case) to PascalCase
  const pascal = withoutPrefix
    .split('_')
    .map((s) => (s[0]?.toUpperCase() ?? '') + s.slice(1))
    .join('');

  return VALID_HOOK_TYPES.has(pascal as HookType) ? (pascal as HookType) : null;
}

// ─── Raw Hook Payload ───────────────────────────────────────────────────────────────────

/**
 * Expected shape of a raw hook payload from Claude Code / IPC.
 */
export interface RawHookPayload {
  /** Hook name (PascalCase or snake_case, optionally colon-prefixed). */
  hook_name: string;
  /** Raw hook-specific data. */
  [key: string]: unknown;
}

// ─── HookAdapter ───────────────────────────────────────────────────────────────────────────

/**
 * L2 adapter for Claude Code hook events.
 *
 * Normalises raw hook payloads (from the IPC router or Claude Code hook scripts)
 * into unified RuntimeEvents with:
 *   - source: { kind: 'hook', hook_name: <PascalCase hook type> }
 *   - type: 'hook:<snake_case>' (e.g. 'hook:pre_tool_use')
 *   - payload: typed HookEventPayload matching the event type
 */
export class HookAdapter implements EventSourceAdapter {
  readonly name = 'hook';

  private _running = false;
  private _eventsProcessed = 0;
  private _lastEventAt: number | undefined;
  private _errors = 0;

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this._running) return;
    this._running = true;
    logger.debug('HookAdapter started');
  }

  async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;
    logger.debug('HookAdapter stopped');
  }

  status(): AdapterStatus {
    return {
      running: this._running,
      eventsProcessed: this._eventsProcessed,
      lastEventAt: this._lastEventAt,
      errors: this._errors,
    };
  }

  // ─── Normalisation ─────────────────────────────────────────────────────────────

  /**
   * Normalise a raw hook payload into a unified RuntimeEvent.
   *
   * Accepts either:
   *   - A RawHookPayload object with a `hook_name` field.
   *   - A plain string hook name (normalised with empty data).
   *
   * Returns null if the input is malformed or the hook name is unknown.
   */
  normalize(rawInput: unknown): RuntimeEvent | null {
    try {
      let hookName: string;
      let hookData: Record<string, unknown>;

      if (typeof rawInput === 'string') {
        hookName = rawInput;
        hookData = {};
      } else if (
        rawInput !== null &&
        typeof rawInput === 'object' &&
        'hook_name' in rawInput &&
        typeof (rawInput as Record<string, unknown>).hook_name === 'string'
      ) {
        const raw = rawInput as RawHookPayload;
        hookName = raw.hook_name;
        hookData = raw;
      } else {
        logger.debug('HookAdapter.normalize: malformed input, missing hook_name', { rawInput });
        this._errors++;
        return null;
      }

      const hookType = normalizeHookName(hookName);
      if (!hookType) {
        logger.debug('HookAdapter.normalize: unknown hook name', { hookName });
        this._errors++;
        return null;
      }

      const eventType = hookTypeToEventType[hookType];
      const now = Date.now();

      // Construct the RuntimeEvent directly to avoid createEvent's metadata requirement.
      // Metadata (session_id, sequence) is populated by the EventBus on emit.
      const event: RuntimeEvent = {
        id: generateEventId(),
        source: { kind: 'hook', hook_name: hookType },
        // Cast needed: eventType is a runtime string mapped from known HookType values
        // so it is always a valid EventType member.
        type: eventType as RuntimeEvent['type'],
        payload: {
          type: eventType,
          data: {
            hook_name: hookType,
            ...hookData,
            duration_ms: 0,
          },
        } as RuntimeEvent['payload'],
        timestamp: now,
        priority: 50,
        metadata: {
          session_id: '',
          sequence: 0,
          version: 1,
        },
      };

      this._eventsProcessed++;
      this._lastEventAt = now;
      return event;
    } catch (err) {
      logger.error('HookAdapter.normalize: unexpected error', {
        error: err instanceof Error ? err.message : String(err),
      });
      this._errors++;
      return null;
    }
  }
}
