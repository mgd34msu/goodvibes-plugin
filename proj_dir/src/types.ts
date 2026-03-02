export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteStore {
  notes: Note[];
  version: number;
}

export type CreateNoteInput = Pick<Note, 'title' | 'content'> & { tags?: string[] };
export type UpdateNoteInput = Partial<Pick<Note, 'title' | 'content' | 'tags'>>;
