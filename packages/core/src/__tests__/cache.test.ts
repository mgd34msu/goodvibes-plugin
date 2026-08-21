/**
 * F4, no-stub cache / probe mode (release gate 2).
 *
 * Ports the v1 file-cache rebuild tests (miss→unchanged, no self-credit,
 * modified diff, update-then-freshness) and adds probe-mode coverage. The v1
 * test that asserted stub-on-read behavior is intentionally absent, it dies
 * with the stub (gate 2).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FileStateCache } from '../cache/index.js';

describe('FileStateCache lookup (v2 rebuild)', () => {
  beforeEach(() => {
    FileStateCache.resetInstance();
  });

  it('reports miss on first read, then unchanged with previousReadAt', () => {
    const cache = FileStateCache.getInstance();
    const first = cache.lookup('/tmp/x.ts', 'abc', 'content');
    expect(first.status).toBe('miss');
    expect(first.entry.readCount).toBe(1);

    const second = cache.lookup('/tmp/x.ts', 'abc', 'content');
    expect(second.status).toBe('unchanged');
    expect(second.previousReadAt).toBeDefined();
    expect(second.entry.readCount).toBe(2);
  });

  it('does not self-credit tokens saved on cache hits', () => {
    const cache = FileStateCache.getInstance();
    cache.lookup('/tmp/y.ts', 'some content here', 'content');
    const hit = cache.lookup('/tmp/y.ts', 'some content here', 'content');
    expect(hit.status).toBe('unchanged');
    expect(hit.entry.tokensSaved).toBe(0);
    expect(cache.getStats().tokensSaved).toBe(0);
  });

  it('reports modified with diff, changes, and previous line count', () => {
    const cache = FileStateCache.getInstance();
    cache.lookup('/tmp/z.ts', 'a\nb', 'content');
    const res = cache.lookup('/tmp/z.ts', 'a\nc', 'content');
    expect(res.status).toBe('modified');
    expect(res.previousLineCount).toBe(2);
    expect(res.previousReadAt).toBeDefined();
    expect(res.diff).toContain('+c');
    expect(res.changes?.added).toBe(1);
    expect(res.changes?.removed).toBe(1);
  });

  it('update() registers content so a later lookup is a freshness hit', () => {
    const cache = FileStateCache.getInstance();
    cache.update('/tmp/w.ts', 'written content', 'write');
    const res = cache.lookup('/tmp/w.ts', 'written content', 'content');
    expect(res.status).toBe('unchanged');
  });

  it('attaches freshness metadata (hash + unchanged flag), never a stub', () => {
    const cache = FileStateCache.getInstance();
    const miss = cache.lookup('/tmp/f.ts', 'hello', 'content');
    const missFresh = cache.freshness(miss);
    expect(missFresh.unchanged_since_last_read).toBe(false);
    expect(missFresh.content_hash).toMatch(/^[0-9a-f]{64}$/);

    const hit = cache.lookup('/tmp/f.ts', 'hello', 'content');
    const hitFresh = cache.freshness(hit);
    expect(hitFresh.unchanged_since_last_read).toBe(true);
    expect(hitFresh.content_hash).toBe(missFresh.content_hash);
    // The content is always available on the entry, never withheld as a stub.
    expect(hit.entry.content).toBe('hello');
  });
});

describe('FileStateCache probe mode (contentless change-status)', () => {
  beforeEach(() => {
    FileStateCache.resetInstance();
  });

  it('probes miss → unchanged → modified without returning content', () => {
    const cache = FileStateCache.getInstance();

    const miss = cache.probe('/tmp/p.ts', 'v1');
    expect(miss.status).toBe('miss');
    expect(miss.unchanged_since_last_read).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(miss, 'content')).toBe(false);

    const unchanged = cache.probe('/tmp/p.ts', 'v1');
    expect(unchanged.status).toBe('unchanged');
    expect(unchanged.unchanged_since_last_read).toBe(true);

    const modified = cache.probe('/tmp/p.ts', 'v2');
    expect(modified.status).toBe('modified');
    expect(modified.unchanged_since_last_read).toBe(false);
    expect(modified.content_hash).not.toBe(unchanged.content_hash);
  });

  it('a probe does not count as a content read', () => {
    const cache = FileStateCache.getInstance();
    cache.lookup('/tmp/q.ts', 'body', 'content'); // readCount = 1
    cache.probe('/tmp/q.ts', 'body'); // must not bump readCount
    expect(cache.getEntryInfo('/tmp/q.ts')?.readCount).toBe(1);
  });
});
