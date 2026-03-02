import { Note, NoteStore, CreateNoteInput, UpdateNoteInput } from './types.js';
import { loadStore, saveStore, generateId } from './storage.js';

export class NoteService {
  private store: NoteStore;

  constructor() {
    this.store = loadStore();
  }

  create(input: CreateNoteInput): Note {
    const now = new Date().toISOString();
    const note: Note = {
      id: generateId(),
      title: input.title,
      content: input.content,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.store.notes.push(note);
    saveStore(this.store);
    return note;
  }

  getById(id: string): Note | undefined {
    return this.store.notes.find((n) => n.id === id);
  }

  getAll(): Note[] {
    return [...this.store.notes];
  }

  update(id: string, input: UpdateNoteInput): Note {
    const index = this.store.notes.findIndex((n) => n.id === id);
    if (index === -1) {
      throw new Error(`Note not found: ${id}`);
    }
    const existing = this.store.notes[index];
    const updated: Note = {
      ...existing,
      ...(input.title !== undefined && { title: input.title }),
      ...(input.content !== undefined && { content: input.content }),
      ...(input.tags !== undefined && { tags: input.tags }),
      updatedAt: new Date().toISOString(),
    };
    this.store.notes[index] = updated;
    saveStore(this.store);
    return updated;
  }

  delete(id: string): boolean {
    const index = this.store.notes.findIndex((n) => n.id === id);
    if (index === -1) {
      return false;
    }
    this.store.notes.splice(index, 1);
    saveStore(this.store);
    return true;
  }

  search(query: string): Note[] {
    const lower = query.toLowerCase();
    return this.store.notes.filter(
      (n) =>
        n.title.toLowerCase().includes(lower) ||
        n.content.toLowerCase().includes(lower)
    );
  }

  findByTag(tag: string): Note[] {
    const lower = tag.toLowerCase();
    return this.store.notes.filter((n) =>
      n.tags.some((t) => t.toLowerCase() === lower)
    );
  }

  listTags(): string[] {
    const tagSet = new Set<string>();
    for (const note of this.store.notes) {
      for (const tag of note.tags) {
        tagSet.add(tag);
      }
    }
    return [...tagSet].sort();
  }
}
