/**
 * Envelope accounting suite (release gate 2/3), ported and adapted from v1
 * precision-engine `__tests__/utils/envelope.test.ts`.
 *
 * Asserts: compact JSON, `token_estimate` within 10% of the rendered payload,
 * `output.max_tokens` enforcement with UTF-8-safe truncation, `truncated`
 * truthfulness, and `effective_caps` presence whenever trimming happened.
 */

import { describe, it, expect } from 'vitest';
import type { CallToolResult, TextContent, ImageContent } from '@modelcontextprotocol/sdk/types.js';
import {
  toCallToolResult,
  toMixedCallToolResult,
  renderEnvelope,
  enforceMaxTokens,
  estimatePayloadTokens,
  successEnvelope,
  errorEnvelope,
  type Envelope,
} from '../envelope/index.js';

function payloadText(result: CallToolResult): string {
  const block = result.content?.[0] as TextContent;
  expect(block.type).toBe('text');
  return block.text;
}

function expectHonestEstimate(text: string): void {
  const parsed = JSON.parse(text) as Envelope<unknown>;
  expect(parsed.meta).toBeDefined();
  const estimate = parsed.meta.token_estimate;
  const reference = text.length / 3.5;
  expect(estimate).toBeGreaterThanOrEqual(reference * 0.9);
  expect(estimate).toBeLessThanOrEqual(reference * 1.1);
}

describe('toCallToolResult compact envelope', () => {
  it('serializes compact JSON with no pretty-printing', () => {
    const result = toCallToolResult(successEnvelope({ alpha: 1, beta: 'two' }));
    const text = payloadText(result);
    expect(text).not.toContain('\n');
    expect(text).toBe(JSON.stringify(JSON.parse(text)));
  });

  it('marks isError false on success and true on error', () => {
    expect(toCallToolResult(successEnvelope({ ok: true })).isError).toBe(false);
    expect(toCallToolResult(errorEnvelope('boom')).isError).toBe(true);
  });
});

describe('honest accounting: meta.token_estimate from rendered payload', () => {
  it('is within 10% for a small fixture', () => {
    expectHonestEstimate(payloadText(toCallToolResult(successEnvelope({ file: 'a.ts', lines: 3 }))));
  });

  it('is within 10% for a large fixture', () => {
    const bigData = {
      files: Array.from({ length: 400 }, (_, i) => ({
        path: 'src/generated/file-' + String(i).padStart(3, '0') + '.ts',
        line_count: i * 3,
        summary: 'x'.repeat(50),
      })),
    };
    expectHonestEstimate(payloadText(toCallToolResult(successEnvelope(bigData))));
  });

  it('is within 10% on error envelopes too', () => {
    expectHonestEstimate(payloadText(toCallToolResult(errorEnvelope('file not found: /tmp/nope.ts'))));
  });

  it('overrides stale pre-set estimates', () => {
    const stale: Envelope<{ blob: string }> = {
      success: true,
      data: { blob: 'y'.repeat(3500) },
      meta: { token_estimate: 1 },
    };
    const text = payloadText(toCallToolResult(stale));
    const parsed = JSON.parse(text) as Envelope<unknown>;
    expect(parsed.meta.token_estimate).toBeGreaterThan(900);
    expectHonestEstimate(text);
  });
});

describe('estimatePayloadTokens', () => {
  it('computes ceil(chars / 3.5)', () => {
    expect(estimatePayloadTokens('')).toBe(0);
    expect(estimatePayloadTokens('abc')).toBe(1);
    expect(estimatePayloadTokens('x'.repeat(35))).toBe(10);
    expect(estimatePayloadTokens('x'.repeat(36))).toBe(11);
  });
});

describe('enforceMaxTokens: cap enforcement, truncated truthfulness, effective_caps', () => {
  it('leaves a within-budget payload untouched (truncated not set)', () => {
    const env = successEnvelope({ content: 'short content' });
    const capped = enforceMaxTokens(env, 4000);
    expect(capped).toBe(env);
    expect(capped.meta.truncated).toBeUndefined();
    expect(capped.meta.effective_caps).toBeUndefined();
  });

  it('trims oversized content and stamps truncated + effective_caps', () => {
    const env = successEnvelope({ content: 'A'.repeat(10_000) });
    const capped = enforceMaxTokens(env, 100);
    expect(capped.meta.truncated).toBe(true);
    expect(capped.meta.effective_caps).toEqual({ max_tokens: 100 });
    expect((capped.data as { content: string }).content.length).toBeLessThan(10_000);
    // The rendered envelope honours the cap.
    const rendered = renderEnvelope(capped);
    expect(estimatePayloadTokens(rendered)).toBeLessThanOrEqual(100);
  });

  it('truncates on a UTF-8 boundary (never a lone surrogate)', () => {
    // 4000 astral characters (each a surrogate pair) ⇒ well over a tiny budget.
    const env = successEnvelope({ content: '😀'.repeat(4000) });
    const capped = enforceMaxTokens(env, 80);
    const content = (capped.data as { content: string }).content;
    // A lone surrogate would round-trip through JSON as U+FFFD; assert none.
    expect(content).not.toContain('�');
    expect(JSON.parse(renderEnvelope(capped)).data.content).not.toContain('�');
    expect(capped.meta.truncated).toBe(true);
  });

  it('is a no-op when data has no string content field', () => {
    const env = successEnvelope({ rows: [1, 2, 3] });
    expect(enforceMaxTokens(env as never, 1)).toBe(env);
  });
});

describe('toMixedCallToolResult', () => {
  const image: ImageContent = { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' };

  it('serializes the text block compactly with honest accounting', () => {
    const text = payloadText(toMixedCallToolResult(successEnvelope({ shown: 'image' }), [image]));
    expect(text).not.toContain('\n');
    expectHonestEstimate(text);
  });

  it('appends extra content blocks after the JSON block', () => {
    const result = toMixedCallToolResult(successEnvelope({ n: 1 }), [image]);
    expect(result.content).toHaveLength(2);
    expect(result.content?.[1]).toEqual(image);
  });
});

describe('mode stamp slot (connect)', () => {
  it('carries a restricted|open mode into the rendered envelope', () => {
    const env = successEnvelope({ ok: true }, { mode: 'restricted' });
    const parsed = JSON.parse(renderEnvelope(env)) as Envelope<unknown>;
    expect(parsed.meta.mode).toBe('restricted');
  });
});
