/**
 * Tests for the v1.11 response envelope:
 * - compact JSON serialization (no pretty-printing)
 * - honest accounting: meta.token_estimate computed from the final rendered
 *   payload string (within 10% of payload chars / 3.5)
 */

import { describe, it, expect } from 'vitest';
import type { CallToolResult, TextContent, ImageContent } from '@modelcontextprotocol/sdk/types.js';
import {
  toCallToolResult,
  toMixedCallToolResult,
  estimatePayloadTokens,
  successResult,
  errorResult,
} from '../../utils/index.js';
import type { PrecisionResult } from '../../types.js';

function payloadText(result: CallToolResult): string {
  const block = result.content?.[0] as TextContent;
  expect(block.type).toBe('text');
  return block.text;
}

function expectHonestEstimate(text: string): void {
  const parsed = JSON.parse(text) as PrecisionResult<unknown>;
  expect(parsed.meta).toBeDefined();
  const estimate = parsed.meta!.token_estimate;
  const reference = text.length / 3.5;
  expect(estimate).toBeGreaterThanOrEqual(reference * 0.9);
  expect(estimate).toBeLessThanOrEqual(reference * 1.1);
}

describe('toCallToolResult compact envelope (v1.11)', () => {
  it('serializes compact JSON with no pretty-printing', () => {
    const result = toCallToolResult(successResult({ alpha: 1, beta: 'two' }, 'standard', 5));
    const text = payloadText(result);
    expect(text).not.toContain('\n');
    expect(text).toBe(JSON.stringify(JSON.parse(text)));
  });

  it('marks isError false on success and true on error', () => {
    expect(toCallToolResult(successResult({ ok: true }, 'standard', 1)).isError).toBe(false);
    expect(toCallToolResult(errorResult('boom', 'standard', 1)).isError).toBe(true);
  });
});

describe('honest accounting: meta.token_estimate from rendered payload', () => {
  it('is within 10% of payload chars / 3.5 for a small fixture', () => {
    const result = toCallToolResult(successResult({ file: 'a.ts', lines: 3 }, 'standard', 2));
    expectHonestEstimate(payloadText(result));
  });

  it('is within 10% of payload chars / 3.5 for a large fixture', () => {
    const bigData = {
      files: Array.from({ length: 400 }, (_, i) => ({
        path: 'src/generated/file-' + String(i).padStart(3, '0') + '.ts',
        line_count: i * 3,
        summary: 'x'.repeat(50),
      })),
    };
    const result = toCallToolResult(successResult(bigData, 'standard', 10));
    expectHonestEstimate(payloadText(result));
  });

  it('is within 10% on error envelopes too', () => {
    const result = toCallToolResult(errorResult('file not found: /tmp/nope.ts', 'standard', 1));
    expectHonestEstimate(payloadText(result));
  });

  it('overrides stale pre-serialization estimates', () => {
    const stale: PrecisionResult<{ blob: string }> = {
      success: true,
      data: { blob: 'y'.repeat(3500) },
      meta: { output_mode: 'standard', token_estimate: 1, execution_ms: 0 },
    };
    const text = payloadText(toCallToolResult(stale));
    const parsed = JSON.parse(text) as PrecisionResult<unknown>;
    // 3500+ chars of payload can never honestly be 1 token.
    expect(parsed.meta!.token_estimate).toBeGreaterThan(900);
    expectHonestEstimate(text);
  });

  it('serializes results without meta compactly and untouched', () => {
    const bare = { success: true, data: { a: 1 } } as PrecisionResult<{ a: number }>;
    const text = payloadText(toCallToolResult(bare));
    expect(text).toBe(JSON.stringify(bare));
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

describe('toMixedCallToolResult compact envelope (v1.11)', () => {
  const image: ImageContent = { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' };

  it('serializes the text block compactly with honest accounting', () => {
    const result = toMixedCallToolResult(successResult({ shown: 'image' }, 'standard', 3), [image]);
    const text = payloadText(result);
    expect(text).not.toContain('\n');
    expectHonestEstimate(text);
  });

  it('appends extra content blocks after the JSON block', () => {
    const result = toMixedCallToolResult(successResult({ n: 1 }, 'standard', 1), [image]);
    expect(result.content).toHaveLength(2);
    expect(result.content?.[1]).toEqual(image);
  });
});
