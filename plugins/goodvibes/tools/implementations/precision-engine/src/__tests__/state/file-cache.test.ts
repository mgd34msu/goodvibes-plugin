/**
 * Tests for FileStateCache lookup semantics (v2 rebuild).
 * Stub-on-read behavior is deleted; lookups report freshness only and
 * never self-credit tokens_saved.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FileStateCache } from '../../state/file-cache.js';

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
    expect('tokensSaved' in hit).toBe(false);
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
    cache.update('/tmp/w.ts', 'written content', 'precision_write');
    const res = cache.lookup('/tmp/w.ts', 'written content', 'content');
    expect(res.status).toBe('unchanged');
  });
});
