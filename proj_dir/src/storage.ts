import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { NoteStore } from './types.js';

export const STORAGE_PATH = path.join(os.homedir(), '.quick-notes', 'data.json');

const EMPTY_STORE: NoteStore = {
  notes: [],
  version: 1,
};

export function loadStore(): NoteStore {
  try {
    const raw = fs.readFileSync(STORAGE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as NoteStore;
    // Rehydrate Date objects from JSON strings
    parsed.notes = parsed.notes.map((note) => ({
      ...note,
      createdAt: new Date(note.createdAt),
      updatedAt: new Date(note.updatedAt),
    }));
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...EMPTY_STORE };
    }
    throw err;
  }
}

export function saveStore(store: NoteStore): void {
  const dir = path.dirname(STORAGE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORAGE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
