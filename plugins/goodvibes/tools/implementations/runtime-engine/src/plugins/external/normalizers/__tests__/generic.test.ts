/**
 * Tests for normalizeGeneric()
 *
 * Covers: payload variations, event type extraction, header handling.
 */

import { describe, it, expect, vi } from 'vitest';
import { normalizeGeneric } from '../generic.js';

vi.mock('../../../../extensions/events/factories.js', () => ({
  createExternalEvent: vi.fn((opts: Record<string, unknown>) => ({
    id: 'test-id',
    timestamp: '2025-01-01T00:00:00.000Z',
    type: opts['type'],
    source: { kind: 'external', external_source: opts['external_source'] },
    external_source: opts['external_source'],
    raw_payload: opts['raw_payload'],
    payload: opts['payload'],
    normalized: opts['normalized'],
    priority: 50,
    context: {},
  })),
}));

describe('normalizeGeneric()', () => {
  // ─── Event type extraction ──────────────────────────────────────────────────

  describe('event type generation', () => {
    it('produces default event type for null payload', () => {
      const result = normalizeGeneric(null, 'mySource');
      expect(result.type).toBe('webhook:mySource:event');
    });

    it('produces default event type for string payload', () => {
      const result = normalizeGeneric('plain string', 'src');
      expect(result.type).toBe('webhook:src:event');
    });

    it('produces default event type for number payload', () => {
      const result = normalizeGeneric(42, 'src');
      expect(result.type).toBe('webhook:src:event');
    });

    it('produces default event type for array payload', () => {
      const result = normalizeGeneric([1, 2, 3], 'src');
      expect(result.type).toBe('webhook:src:event');
    });

    it('produces default event type for empty object', () => {
      const result = normalizeGeneric({}, 'src');
      expect(result.type).toBe('webhook:src:event');
    });

    it('extracts event type from payload.event field', () => {
      const result = normalizeGeneric({ event: 'push' }, 'github');
      expect(result.type).toBe('webhook:github:push');
    });

    it('extracts event type from payload.type field (falls back from event)', () => {
      const result = normalizeGeneric({ type: 'order_created' }, 'stripe');
      expect(result.type).toBe('webhook:stripe:order_created');
    });

    it('extracts event type from payload.action field (falls back from event and type)', () => {
      const result = normalizeGeneric({ action: 'opened' }, 'github');
      expect(result.type).toBe('webhook:github:opened');
    });

    it('prefers payload.event over payload.type', () => {
      const result = normalizeGeneric({ event: 'push', type: 'fallback' }, 'src');
      expect(result.type).toBe('webhook:src:push');
    });

    it('prefers payload.type over payload.action', () => {
      const result = normalizeGeneric({ type: 'push', action: 'fallback' }, 'src');
      expect(result.type).toBe('webhook:src:push');
    });

    it('sanitizes special characters in event type', () => {
      const result = normalizeGeneric({ event: 'my event with spaces & chars!' }, 'src');
      // Spaces → underscores, lowercase
      expect(result.type).toBe('webhook:src:my_event_with_spaces___chars_');
    });

    it('lowercases the extracted event type', () => {
      const result = normalizeGeneric({ event: 'PushEvent' }, 'src');
      expect(result.type).toBe('webhook:src:pushevent');
    });

    it('uses default when payload.event is empty string', () => {
      const result = normalizeGeneric({ event: '' }, 'src');
      expect(result.type).toBe('webhook:src:event');
    });

    it('uses default when payload.event is non-string', () => {
      const result = normalizeGeneric({ event: 42 }, 'src');
      expect(result.type).toBe('webhook:src:event');
    });

    it('uses default when payload.type is empty string and action is missing', () => {
      const result = normalizeGeneric({ type: '' }, 'src');
      expect(result.type).toBe('webhook:src:event');
    });

    it('allows colons and dots in event type (valid characters)', () => {
      const result = normalizeGeneric({ event: 'repo:push.main' }, 'src');
      expect(result.type).toBe('webhook:src:repo:push.main');
    });
  });

  // ─── Source field ────────────────────────────────────────────────────────────

  describe('external_source field', () => {
    it('sets external_source to the provided source', () => {
      const result = normalizeGeneric({}, 'myWebhook');
      expect(result.external_source).toBe('myWebhook');
    });

    it('handles empty string source', () => {
      const result = normalizeGeneric({}, '');
      expect(result.external_source).toBe('');
      expect(result.type).toBe('webhook::event');
    });
  });

  // ─── Raw payload ─────────────────────────────────────────────────────────────

  describe('raw_payload field', () => {
    it('stores the original payload in raw_payload', () => {
      const raw = { foo: 'bar' };
      const result = normalizeGeneric(raw, 'src');
      expect(result.raw_payload).toBe(raw);
    });

    it('stores null raw_payload when null passed', () => {
      const result = normalizeGeneric(null, 'src');
      expect(result.raw_payload).toBeNull();
    });
  });

  // ─── Normalized payload ───────────────────────────────────────────────────────

  describe('normalized payload construction', () => {
    it('wraps payload in data field', () => {
      const raw = { foo: 'bar' };
      const result = normalizeGeneric(raw, 'src');
      expect(result.payload).toMatchObject({ data: raw });
    });

    it('includes headers in payload when provided and non-empty', () => {
      const headers = { 'x-signature': 'abc123', 'content-type': 'application/json' };
      const result = normalizeGeneric({}, 'src', headers);
      expect(result.payload).toMatchObject({ headers });
    });

    it('excludes headers from payload when headers is undefined', () => {
      const result = normalizeGeneric({}, 'src', undefined);
      expect(result.payload).not.toHaveProperty('headers');
    });

    it('excludes headers from payload when headers is empty object', () => {
      const result = normalizeGeneric({}, 'src', {});
      expect(result.payload).not.toHaveProperty('headers');
    });

    it('sets normalized to false (generic does not deep-normalize)', () => {
      const result = normalizeGeneric({}, 'src');
      expect(result.normalized).toBe(false);
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles boolean payload', () => {
      const result = normalizeGeneric(true, 'src');
      expect(result.type).toBe('webhook:src:event');
      expect(result.raw_payload).toBe(true);
    });

    it('handles deeply nested payload without crashing', () => {
      const deep = { a: { b: { c: { d: 'deep' } } } };
      expect(() => normalizeGeneric(deep, 'src')).not.toThrow();
    });

    it('handles undefined payload gracefully', () => {
      expect(() => normalizeGeneric(undefined, 'src')).not.toThrow();
    });
  });
});
