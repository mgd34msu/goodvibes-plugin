import { z } from 'zod';

/**
 * Zod schema for a complete bookmark record (stored/returned).
 */
export const BookmarkSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url({ message: 'Must be a valid URL' }),
  title: z.string().min(1, { message: 'Title is required' }).max(500),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().min(1).max(100)).default([]),
  createdAt: z.string().datetime(),
});

/**
 * Zod schema for creating a new bookmark (no id or createdAt).
 */
export const CreateBookmarkSchema = z.object({
  url: z.string().url({ message: 'Must be a valid URL' }),
  title: z.string().min(1, { message: 'Title is required' }).max(500),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().min(1).max(100)).default([]),
});

/**
 * Zod schema for updating an existing bookmark (all fields optional).
 */
export const UpdateBookmarkSchema = z.object({
  url: z.string().url({ message: 'Must be a valid URL' }).optional(),
  title: z.string().min(1, { message: 'Title is required' }).max(500).optional(),
  description: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string().min(1).max(100)).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
);

export type Bookmark = z.infer<typeof BookmarkSchema>;
export type CreateBookmarkInput = z.infer<typeof CreateBookmarkSchema>;
export type UpdateBookmarkInput = z.infer<typeof UpdateBookmarkSchema>;

/**
 * Typed error response shape used across all error handlers.
 */
export interface ApiError {
  error: string;
  details?: unknown;
  statusCode: number;
}

/**
 * Success response wrapper.
 */
export interface ApiSuccess<T> {
  data: T;
}

/**
 * List response.
 */
export interface ApiList<T> {
  data: T[];
  total: number;
}
