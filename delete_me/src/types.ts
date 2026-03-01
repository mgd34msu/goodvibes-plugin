export interface User {
  id: number;
  email: string;
  name: string | null;
  role: 'user' | 'admin';
  createdAt: Date;
}

export interface Post {
  id: number;
  title: string;
  content: string | null;
  published: boolean;
  authorId: number;
  createdAt: Date;
}

export interface Comment {
  id: number;
  content: string;
  authorId: number;
  postId: number;
  createdAt: Date;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  page: number;
  pageSize: number;
  total: number;
}

/** @deprecated Use ApiResponse instead */
export interface LegacyResponse {
  ok: boolean;
  result: unknown;
}

export type UserRole = 'user' | 'admin' | 'moderator';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/** Dead code - never imported anywhere */
export function formatTimestamp(date: Date): string {
  return date.toISOString();
}

/** Dead code - never imported anywhere */
export class EventEmitterHelper {
  private handlers: Map<string, Function[]> = new Map();

  on(event: string, handler: Function): void {
    const existing = this.handlers.get(event) || [];
    existing.push(handler);
    this.handlers.set(event, existing);
  }

  emit(event: string, ...args: unknown[]): void {
    const handlers = this.handlers.get(event) || [];
    handlers.forEach(h => h(...args));
  }
}