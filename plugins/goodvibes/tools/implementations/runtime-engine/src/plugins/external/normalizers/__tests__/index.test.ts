/**
 * Tests for NormalizerRegistry and createDefaultRegistry()
 *
 * Covers: register, get, unregister, normalize (with fallback),
 * sources(), createDefaultRegistry pre-population.
 */

import { describe, it, expect, vi } from 'vitest';
import { NormalizerRegistry, createDefaultRegistry } from '../index.js';
import type { Normalizer } from '../index.js';
import type { ExternalEvent } from '../../../../extensions/events/factories.js';

vi.mock('../../../../extensions/events/factories.js', () => ({
  createExternalEvent: vi.fn((opts: Record<string, unknown>) => ({
    id: 'mock-id',
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

vi.mock('../github.js', () => ({
  normalizeGithub: vi.fn((rawPayload: unknown, headers?: Record<string, string>) => ({
    id: 'github-id',
    timestamp: '2025-01-01T00:00:00.000Z',
    type: `webhook:github:${headers?.['x-github-event'] ?? 'unknown'}`,
    source: { kind: 'external', external_source: 'github' },
    external_source: 'github',
    raw_payload: rawPayload,
    payload: { event: headers?.['x-github-event'] ?? 'unknown' },
    normalized: true,
    priority: 50,
    context: {},
  })),
}));

vi.mock('../generic.js', () => ({
  normalizeGeneric: vi.fn((rawPayload: unknown, source: string, headers?: Record<string, string>) => ({
    id: 'generic-id',
    timestamp: '2025-01-01T00:00:00.000Z',
    type: `webhook:${source}:event`,
    source: { kind: 'external', external_source: source },
    external_source: source,
    raw_payload: rawPayload,
    payload: { data: rawPayload, ...(headers && Object.keys(headers).length > 0 && { headers }) },
    normalized: false,
    priority: 50,
    context: {},
  })),
}));

function makeNormalizer(name: string): Normalizer {
  return vi.fn((_rawPayload: unknown, _headers?: Record<string, string>): ExternalEvent => ({
    id: `${name}-id`,
    timestamp: '2025-01-01T00:00:00.000Z',
    type: `webhook:${name}:event`,
    source: { kind: 'external', external_source: name },
    external_source: name,
    raw_payload: null,
    payload: {},
    normalized: false,
    priority: 50,
    context: {},
  }));
}

describe('NormalizerRegistry', () => {
  // ─── register() and get() ────────────────────────────────────────────────────

  describe('register() and get()', () => {
    it('stores a registered normalizer retrievable by source name', () => {
      const registry = new NormalizerRegistry();
      const norm = makeNormalizer('test');
      registry.register('test', norm);
      expect(registry.get('test')).toBe(norm);
    });

    it('returns undefined for an unknown source', () => {
      const registry = new NormalizerRegistry();
      expect(registry.get('unknown')).toBeUndefined();
    });

    it('overwrites existing normalizer for same source', () => {
      const registry = new NormalizerRegistry();
      const norm1 = makeNormalizer('a');
      const norm2 = makeNormalizer('b');
      registry.register('mysource', norm1);
      registry.register('mysource', norm2);
      expect(registry.get('mysource')).toBe(norm2);
    });

    it('stores multiple normalizers independently', () => {
      const registry = new NormalizerRegistry();
      const normA = makeNormalizer('a');
      const normB = makeNormalizer('b');
      registry.register('sourceA', normA);
      registry.register('sourceB', normB);
      expect(registry.get('sourceA')).toBe(normA);
      expect(registry.get('sourceB')).toBe(normB);
    });
  });

  // ─── unregister() ────────────────────────────────────────────────────────────

  describe('unregister()', () => {
    it('removes a registered normalizer and returns true', () => {
      const registry = new NormalizerRegistry();
      registry.register('src', makeNormalizer('src'));
      expect(registry.unregister('src')).toBe(true);
      expect(registry.get('src')).toBeUndefined();
    });

    it('returns false when source was not registered', () => {
      const registry = new NormalizerRegistry();
      expect(registry.unregister('nonexistent')).toBe(false);
    });

    it('can re-register after unregister', () => {
      const registry = new NormalizerRegistry();
      const norm = makeNormalizer('src');
      registry.register('src', norm);
      registry.unregister('src');
      const norm2 = makeNormalizer('src2');
      registry.register('src', norm2);
      expect(registry.get('src')).toBe(norm2);
    });
  });

  // ─── sources() ────────────────────────────────────────────────────────────────

  describe('sources()', () => {
    it('returns empty array when no normalizers registered', () => {
      const registry = new NormalizerRegistry();
      expect(registry.sources()).toEqual([]);
    });

    it('returns all registered source names', () => {
      const registry = new NormalizerRegistry();
      registry.register('alpha', makeNormalizer('a'));
      registry.register('beta', makeNormalizer('b'));
      const srcs = registry.sources();
      expect(srcs).toContain('alpha');
      expect(srcs).toContain('beta');
      expect(srcs).toHaveLength(2);
    });

    it('does not include unregistered sources', () => {
      const registry = new NormalizerRegistry();
      registry.register('keep', makeNormalizer('k'));
      registry.register('remove', makeNormalizer('r'));
      registry.unregister('remove');
      expect(registry.sources()).toEqual(['keep']);
    });
  });

  // ─── normalize() — with registered normalizer ────────────────────────────────

  describe('normalize() — registered normalizer', () => {
    it('calls the registered normalizer with payload and headers', () => {
      const registry = new NormalizerRegistry();
      const norm = makeNormalizer('custom');
      registry.register('custom', norm);

      const payload = { data: 'test' };
      const headers = { 'content-type': 'application/json' };
      registry.normalize('custom', payload, headers);

      expect(norm).toHaveBeenCalledWith(payload, headers);
    });

    it('returns the result of the registered normalizer', () => {
      const registry = new NormalizerRegistry();
      const norm = makeNormalizer('src');
      registry.register('src', norm);

      const result = registry.normalize('src', { x: 1 });
      expect(result.type).toBe('webhook:src:event');
    });

    it('calls registered normalizer without headers when not provided', () => {
      const registry = new NormalizerRegistry();
      const norm = makeNormalizer('src');
      registry.register('src', norm);
      registry.normalize('src', {});
      expect(norm).toHaveBeenCalledWith({}, undefined);
    });
  });

  // ─── normalize() — fallback to generic ───────────────────────────────────────

  describe('normalize() — fallback to generic', () => {
    it('falls back to normalizeGeneric for unregistered source', async () => {
      const registry = new NormalizerRegistry();
      const { normalizeGeneric } = await import('../generic.js');

      const payload = { event: 'test' };
      const result = registry.normalize('unknown-source', payload);

      expect(normalizeGeneric).toHaveBeenCalledWith(payload, 'unknown-source', undefined);
      expect(result.external_source).toBe('unknown-source');
    });

    it('passes headers to normalizeGeneric fallback', async () => {
      const registry = new NormalizerRegistry();
      const { normalizeGeneric } = await import('../generic.js');

      const headers = { 'x-custom': 'value' };
      registry.normalize('unregistered', {}, headers);

      expect(normalizeGeneric).toHaveBeenCalledWith({}, 'unregistered', headers);
    });

    it('preserves original source identity in fallback (does not use "generic" as source)', async () => {
      const registry = new NormalizerRegistry();
      const result = registry.normalize('my-custom-source', {});
      expect(result.external_source).toBe('my-custom-source');
    });
  });
});

describe('createDefaultRegistry()', () => {
  it('returns a NormalizerRegistry instance', () => {
    const registry = createDefaultRegistry();
    expect(registry).toBeInstanceOf(NormalizerRegistry);
  });

  it('has "github" registered', () => {
    const registry = createDefaultRegistry();
    expect(registry.get('github')).toBeDefined();
  });

  it('has "generic" registered', () => {
    const registry = createDefaultRegistry();
    expect(registry.get('generic')).toBeDefined();
  });

  it('includes both "github" and "generic" in sources()', () => {
    const registry = createDefaultRegistry();
    const srcs = registry.sources();
    expect(srcs).toContain('github');
    expect(srcs).toContain('generic');
  });

  it('github normalizer routes through normalizeGithub', async () => {
    const { normalizeGithub } = await import('../github.js');
    const registry = createDefaultRegistry();
    const payload = { action: 'opened' };
    const headers = { 'x-github-event': 'pull_request' };
    registry.normalize('github', payload, headers);
    expect(normalizeGithub).toHaveBeenCalledWith(payload, headers);
  });

  it('generic normalizer uses "generic" as source name', async () => {
    const { normalizeGeneric } = await import('../generic.js');
    const registry = createDefaultRegistry();
    const norm = registry.get('generic')!;
    norm({ data: 'test' }, {});
    expect(normalizeGeneric).toHaveBeenCalledWith({ data: 'test' }, 'generic', {});
  });

  it('normalize() for unregistered source falls back to generic (not github)', async () => {
    const { normalizeGeneric } = await import('../generic.js');
    const registry = createDefaultRegistry();
    registry.normalize('stripe', { type: 'payment' });
    expect(normalizeGeneric).toHaveBeenCalledWith({ type: 'payment' }, 'stripe', undefined);
  });
});
