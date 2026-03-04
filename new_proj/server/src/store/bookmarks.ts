import { v4 as uuidv4 } from 'uuid';
import type { Bookmark, CreateBookmarkInput, UpdateBookmarkInput } from '../types/bookmark.js';

/**
 * Result types for store operations.
 */
export type StoreResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; statusCode: number };

/**
 * In-memory bookmark store. Thread-safe for single-process use.
 * Replace `store` map with a DB-backed implementation to scale.
 */
export class BookmarkStore {
  private readonly store = new Map<string, Bookmark>();

  /**
   * Returns a snapshot of all bookmarks sorted by createdAt descending.
   */
  getAll(): Bookmark[] {
    return Array.from(this.store.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Retrieves a single bookmark by ID.
   */
  getById(id: string): StoreResult<Bookmark> {
    const bookmark = this.store.get(id);
    if (!bookmark) {
      return { success: false, error: `Bookmark with id '${id}' not found`, statusCode: 404 };
    }
    return { success: true, data: bookmark };
  }

  /**
   * Creates a new bookmark and stores it.
   */
  create(input: CreateBookmarkInput): Bookmark {
    const bookmark: Bookmark = {
      id: uuidv4(),
      url: input.url,
      title: input.title,
      description: input.description,
      tags: input.tags ?? [],
      createdAt: new Date().toISOString(),
    };
    this.store.set(bookmark.id, bookmark);
    return bookmark;
  }

  /**
   * Updates fields on an existing bookmark. Returns error if not found.
   */
  update(id: string, input: UpdateBookmarkInput): StoreResult<Bookmark> {
    const existing = this.store.get(id);
    if (!existing) {
      return { success: false, error: `Bookmark with id '${id}' not found`, statusCode: 404 };
    }
    const updated: Bookmark = {
      ...existing,
      ...(input.url !== undefined && { url: input.url }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description ?? undefined }),
      ...(input.tags !== undefined && { tags: input.tags }),
    };
    this.store.set(id, updated);
    return { success: true, data: updated };
  }

  /**
   * Deletes a bookmark by ID. Returns error if not found.
   */
  delete(id: string): StoreResult<{ id: string }> {
    if (!this.store.has(id)) {
      return { success: false, error: `Bookmark with id '${id}' not found`, statusCode: 404 };
    }
    this.store.delete(id);
    return { success: true, data: { id } };
  }

  /**
   * Returns the number of stored bookmarks.
   */
  count(): number {
    return this.store.size;
  }

  /**
   * Clears all bookmarks. Useful for test isolation.
   */
  clear(): void {
    this.store.clear();
  }
}

/** Singleton store instance shared across the application. */
export const bookmarkStore = new BookmarkStore();
