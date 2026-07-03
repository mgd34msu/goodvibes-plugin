/**
 * `@goodvibes/core/envelope` — the shared v2 response envelope.
 *
 * One representation per payload, serialized to compact JSON with honest
 * accounting: `meta.token_estimate` is always recomputed from the exact string
 * that is returned (never a pre-serialization guess) at ~3.5 chars/token, so it
 * lands within ±10% of the rendered payload.
 *
 * `enforceMaxTokens` applies an `output.max_tokens` cap with UTF-8-safe
 * truncation of the content payload. `truncated` is set true ONLY when trimming
 * actually happened, and `effective_caps` echoes the cap that trimmed. A
 * `mode: restricted|open` stamp slot rides along for connect.
 *
 * Ported and consolidated from v1 precision-engine `utils/index.ts`
 * (`renderPrecisionResult`, `estimatePayloadTokens`, `toCallToolResult`) and
 * `logging.ts` (`startTimer`).
 */

import type { CallToolResult, TextContent, ImageContent } from '@modelcontextprotocol/sdk/types.js';
import { estimatePayloadTokens, tokensToChars } from '../shared/tokens.js';
import { utf8SafeSlice } from '../shared/utf8.js';
import type { EnvelopeMode } from '../config/index.js';

export type { EnvelopeMode } from '../config/index.js';
export { estimatePayloadTokens } from '../shared/tokens.js';
export { utf8SafeSlice, utf8SafeSliceBytes, utf8ByteLength } from '../shared/utf8.js';

/** Per-response metadata carried in every envelope. */
export interface EnvelopeMeta {
  /** Payload-true token estimate, recomputed from the rendered string. */
  token_estimate: number;
  /** Wall-clock execution time (ms), when measured. */
  execution_ms?: number;
  /** True ONLY when a cap actually trimmed the payload. */
  truncated?: boolean;
  /** The cap(s) that trimmed, echoed whenever any trimming happened. */
  effective_caps?: Record<string, number>;
  /** True when a per-call time budget expired and a partial result was returned. */
  budget_exceeded?: boolean;
  /** Trust-mode stamp (connect): 'restricted' | 'open'. */
  mode?: EnvelopeMode;
}

/** The standard result wrapper for every v2 tool. */
export interface Envelope<T = unknown> {
  /** Whether the operation succeeded. */
  success: boolean;
  /** Result payload (present on success). */
  data?: T;
  /** Error message (present on failure). */
  error?: string;
  /** Advisory warning (e.g. relative path resolved without base_path). */
  warning?: string;
  /** Per-response metadata. */
  meta: EnvelopeMeta;
}

/**
 * Build a success envelope. Token estimate is a placeholder here; it is made
 * honest by `renderEnvelope`/`toCallToolResult` from the final string.
 */
export function successEnvelope<T>(data: T, meta: Partial<EnvelopeMeta> = {}): Envelope<T> {
  return { success: true, data, meta: { token_estimate: 0, ...meta } };
}

/** Build an error envelope. */
export function errorEnvelope(error: string, meta: Partial<EnvelopeMeta> = {}): Envelope<never> {
  return { success: false, error, meta: { token_estimate: 0, ...meta } } as Envelope<never>;
}

/**
 * Render an envelope to its final compact JSON string with an honest
 * `meta.token_estimate` computed from that exact string.
 * @param env - the envelope to render
 * @returns compact JSON with payload-true token accounting
 */
export function renderEnvelope<T>(env: Envelope<T>): string {
  if (!env.meta) {return JSON.stringify(env);}
  const provisional = JSON.stringify(env);
  const honest: Envelope<T> = {
    ...env,
    meta: { ...env.meta, token_estimate: estimatePayloadTokens(provisional) },
  };
  return JSON.stringify(honest);
}

/**
 * Enforce an `output.max_tokens` cap on an envelope whose data carries a string
 * `content` field. Trims `content` UTF-8-safely until the rendered envelope
 * fits the budget, then marks `truncated` and `effective_caps`. Envelopes with
 * no string `content` are returned unchanged (structured data is never cut
 * mid-value).
 *
 * @param env - the envelope to cap
 * @param maxTokens - the token budget (no-op when undefined/<=0)
 * @returns a new envelope that fits the budget, with honest accounting
 */
export function enforceMaxTokens<T extends { content?: string }>(
  env: Envelope<T>,
  maxTokens?: number,
): Envelope<T> {
  if (!maxTokens || maxTokens <= 0) {return env;}
  if (!env.data || typeof env.data.content !== 'string') {return env;}

  if (estimatePayloadTokens(renderEnvelope(env)) <= maxTokens) {return env;}

  const original = env.data.content;
  // First guess: budget chars minus the envelope overhead (everything but content).
  const overheadChars = JSON.stringify({ ...env, data: { ...env.data, content: '' } }).length;
  let budgetUnits = Math.max(0, tokensToChars(maxTokens) - overheadChars);
  let content = utf8SafeSlice(original, budgetUnits);

  // Converge: JSON escaping of the content can add characters, so shrink until
  // the rendered envelope truly fits (bounded iteration).
  for (let i = 0; i < 8; i++) {
    const candidate: Envelope<T> = {
      ...env,
      data: { ...env.data, content },
      meta: {
        ...env.meta,
        truncated: true,
        effective_caps: { ...(env.meta.effective_caps ?? {}), max_tokens: maxTokens },
      },
    };
    if (content.length === 0 || estimatePayloadTokens(JSON.stringify(candidate)) <= maxTokens) {
      return candidate;
    }
    const over = estimatePayloadTokens(JSON.stringify(candidate)) - maxTokens;
    budgetUnits = Math.max(0, content.length - (Math.ceil(over * 3.5) + 8));
    content = utf8SafeSlice(content, budgetUnits);
  }

  return {
    ...env,
    data: { ...env.data, content },
    meta: {
      ...env.meta,
      truncated: true,
      effective_caps: { ...(env.meta.effective_caps ?? {}), max_tokens: maxTokens },
    },
  };
}

/** Convert an envelope to an MCP `CallToolResult` (single JSON text block). */
export function toCallToolResult<T>(env: Envelope<T>): CallToolResult {
  const block: TextContent = { type: 'text', text: renderEnvelope(env) };
  return { content: [block], isError: !env.success };
}

/**
 * Convert an envelope to an MCP `CallToolResult` with extra content blocks
 * (e.g. images) appended after the JSON text block.
 */
export function toMixedCallToolResult<T>(
  env: Envelope<T>,
  extraContent: (TextContent | ImageContent)[],
): CallToolResult {
  const block: TextContent = { type: 'text', text: renderEnvelope(env) };
  return { content: [block, ...extraContent], isError: !env.success };
}

/** Start a timer; the returned function yields elapsed whole milliseconds. */
export function startTimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}

export * from './errors.js';
export * from './overflow.js';
