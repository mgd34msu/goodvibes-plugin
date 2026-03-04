import type { Bookmark, BookmarkFormData } from '../types/bookmark';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function buildHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json' };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const body = await response.json() as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function fetchBookmarks(): Promise<Bookmark[]> {
  const response = await fetch(`${API_BASE}/api/bookmarks`, {
    headers: buildHeaders(),
  });
  return handleResponse<Bookmark[]>(response);
}

export async function createBookmark(data: BookmarkFormData): Promise<Bookmark> {
  const payload = {
    url: data.url,
    title: data.title,
    description: data.description || undefined,
    tags: data.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  };
  const response = await fetch(`${API_BASE}/api/bookmarks`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<Bookmark>(response);
}

export async function updateBookmark(
  id: string,
  data: BookmarkFormData
): Promise<Bookmark> {
  const payload = {
    url: data.url,
    title: data.title,
    description: data.description || undefined,
    tags: data.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  };
  const response = await fetch(`${API_BASE}/api/bookmarks/${id}`, {
    method: 'PUT',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<Bookmark>(response);
}

export async function deleteBookmark(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/bookmarks/${id}`, {
    method: 'DELETE',
    headers: buildHeaders(),
  });
  await handleResponse<void>(response);
}
