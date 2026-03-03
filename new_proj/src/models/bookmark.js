import { randomUUID } from 'node:crypto';

const bookmarks = [];

export const bookmarkStore = {
  getAll() {
    return bookmarks;
  },

  findAll() {
    return bookmarks;
  },

  findById(id) {
    return bookmarks.find((b) => b.id === id) ?? null;
  },

  create({ url, title, description = '', tags = [] }) {
    const now = new Date().toISOString();
    const bookmark = { id: randomUUID(), url, title, description, tags, createdAt: now, updatedAt: now };
    bookmarks.push(bookmark);
    return bookmark;
  },

  update(id, fields) {
    const bookmark = bookmarks.find((b) => b.id === id);
    if (!bookmark) return null;
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && key !== 'id') bookmark[key] = value;
    }
    bookmark.updatedAt = new Date().toISOString();
    return bookmark;
  },

  delete(id) {
    const index = bookmarks.findIndex((b) => b.id === id);
    if (index === -1) return false;
    bookmarks.splice(index, 1);
    return true;
  },
};

export default bookmarkStore;
