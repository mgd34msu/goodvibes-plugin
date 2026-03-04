import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BookmarkStore } from '../bookmarks.js';

describe('BookmarkStore', () => {
  let store: BookmarkStore;

  beforeEach(() => {
    store = new BookmarkStore();
  });

  describe('getAll()', () => {
    it('returns empty array when store is empty', () => {
      expect(store.getAll()).toEqual([]);
    });

    it('returns all bookmarks sorted by createdAt descending', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
        const first = store.create({ url: 'https://first.com', title: 'First', tags: [] });
        vi.advanceTimersByTime(100);
        const second = store.create({ url: 'https://second.com', title: 'Second', tags: [] });

        const all = store.getAll();
        expect(all).toHaveLength(2);
        // Most recent first
        expect(all[0]!.id).toBe(second.id);
        expect(all[1]!.id).toBe(first.id);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('getById()', () => {
    it('returns the bookmark when it exists', () => {
      const created = store.create({ url: 'https://example.com', title: 'Example', tags: [] });
      const result = store.getById(created.id);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(created);
      }
    });

    it('returns error when bookmark does not exist', () => {
      const result = store.getById('00000000-0000-0000-0000-000000000000');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.error).toMatch(/not found/i);
      }
    });
  });

  describe('create()', () => {
    it('creates a bookmark with required fields', () => {
      const input = { url: 'https://example.com', title: 'Example', tags: [] };
      const bookmark = store.create(input);

      expect(bookmark.id).toBeDefined();
      expect(bookmark.url).toBe(input.url);
      expect(bookmark.title).toBe(input.title);
      expect(bookmark.tags).toEqual([]);
      expect(bookmark.createdAt).toBeDefined();
      expect(bookmark.description).toBeUndefined();
    });

    it('creates a bookmark with optional description and tags', () => {
      const input = {
        url: 'https://example.com',
        title: 'Example',
        description: 'A description',
        tags: ['react', 'typescript'],
      };
      const bookmark = store.create(input);

      expect(bookmark.description).toBe('A description');
      expect(bookmark.tags).toEqual(['react', 'typescript']);
    });

    it('assigns unique IDs to each bookmark', () => {
      const a = store.create({ url: 'https://a.com', title: 'A', tags: [] });
      const b = store.create({ url: 'https://b.com', title: 'B', tags: [] });
      expect(a.id).not.toBe(b.id);
    });

    it('stores created bookmarks (count increases)', () => {
      expect(store.count()).toBe(0);
      store.create({ url: 'https://example.com', title: 'Test', tags: [] });
      expect(store.count()).toBe(1);
    });
  });

  describe('update()', () => {
    it('updates specified fields on an existing bookmark', () => {
      const created = store.create({ url: 'https://old.com', title: 'Old Title', tags: [] });
      const result = store.update(created.id, { title: 'New Title', url: 'https://new.com' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('New Title');
        expect(result.data.url).toBe('https://new.com');
        expect(result.data.id).toBe(created.id);
        expect(result.data.createdAt).toBe(created.createdAt);
      }
    });

    it('preserves unchanged fields', () => {
      const created = store.create({
        url: 'https://example.com',
        title: 'Title',
        description: 'Desc',
        tags: ['tag1'],
      });
      const result = store.update(created.id, { title: 'Updated' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.url).toBe('https://example.com');
        expect(result.data.description).toBe('Desc');
        expect(result.data.tags).toEqual(['tag1']);
      }
    });

    it('updates tags', () => {
      const created = store.create({ url: 'https://example.com', title: 'Title', tags: ['old'] });
      const result = store.update(created.id, { tags: ['new1', 'new2'] });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toEqual(['new1', 'new2']);
      }
    });

    it('returns error when bookmark does not exist', () => {
      const result = store.update('00000000-0000-0000-0000-000000000000', { title: 'X' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
      }
    });
  });

  describe('delete()', () => {
    it('deletes an existing bookmark', () => {
      const created = store.create({ url: 'https://example.com', title: 'Test', tags: [] });
      const result = store.delete(created.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(created.id);
      }
      expect(store.count()).toBe(0);
    });

    it('returns error when bookmark does not exist', () => {
      const result = store.delete('00000000-0000-0000-0000-000000000000');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
      }
    });

    it('removes the bookmark from getAll() after deletion', () => {
      const created = store.create({ url: 'https://example.com', title: 'Test', tags: [] });
      store.delete(created.id);
      expect(store.getAll()).toEqual([]);
    });
  });

  describe('count()', () => {
    it('returns 0 for empty store', () => {
      expect(store.count()).toBe(0);
    });

    it('tracks count accurately across operations', () => {
      const a = store.create({ url: 'https://a.com', title: 'A', tags: [] });
      store.create({ url: 'https://b.com', title: 'B', tags: [] });
      expect(store.count()).toBe(2);
      store.delete(a.id);
      expect(store.count()).toBe(1);
    });
  });

  describe('clear()', () => {
    it('removes all bookmarks', () => {
      store.create({ url: 'https://a.com', title: 'A', tags: [] });
      store.create({ url: 'https://b.com', title: 'B', tags: [] });
      store.clear();
      expect(store.count()).toBe(0);
      expect(store.getAll()).toEqual([]);
    });
  });
});
