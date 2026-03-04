import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchBookmarks,
  createBookmark,
  updateBookmark,
  deleteBookmark,
} from '../bookmarks';
import type { Bookmark } from '../../types/bookmark';

const mockBookmark: Bookmark = {
  id: '1',
  url: 'https://example.com',
  title: 'Example',
  description: 'A description',
  tags: ['web', 'example'],
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('bookmarks API', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetchSuccess(data: unknown, status = 200): void {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status,
      statusText: 'OK',
      json: () => Promise.resolve(data),
    } as Response);
  }

  /** Mocks an error response. By default json() rejects (no body), so HTTP status format is used. */
  function mockFetchError(status: number, statusText: string, body?: unknown): void {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status,
      statusText,
      json: body !== undefined
        ? () => Promise.resolve(body)
        : () => Promise.reject(new Error('no body')),
    } as Response);
  }

  describe('fetchBookmarks', () => {
    it('returns an array of bookmarks', async () => {
      mockFetchSuccess([mockBookmark]);
      const result = await fetchBookmarks();
      expect(result).toEqual([mockBookmark]);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/bookmarks'),
        expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) })
      );
    });

    it('throws on HTTP error', async () => {
      mockFetchError(500, 'Internal Server Error');
      await expect(fetchBookmarks()).rejects.toThrow('HTTP 500');
    });

    it('uses error message from response body', async () => {
      mockFetchError(400, 'Bad Request', { message: 'Custom error' });
      await expect(fetchBookmarks()).rejects.toThrow('Custom error');
    });
  });

  describe('createBookmark', () => {
    it('sends POST and returns created bookmark', async () => {
      mockFetchSuccess(mockBookmark, 201);
      const result = await createBookmark({
        url: 'https://example.com',
        title: 'Example',
        description: 'A description',
        tags: 'web, example',
      });
      expect(result).toEqual(mockBookmark);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/bookmarks'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('parses comma-separated tags correctly', async () => {
      mockFetchSuccess(mockBookmark, 201);
      await createBookmark({
        url: 'https://example.com',
        title: 'Example',
        description: '',
        tags: ' react , typescript , web ',
      });
      const callBody = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string) as { tags: string[] };
      expect(callBody.tags).toEqual(['react', 'typescript', 'web']);
    });

    it('omits description when empty', async () => {
      mockFetchSuccess(mockBookmark, 201);
      await createBookmark({
        url: 'https://example.com',
        title: 'Example',
        description: '',
        tags: '',
      });
      const callBody = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string) as { description?: string };
      expect(callBody.description).toBeUndefined();
    });

    it('throws on HTTP error', async () => {
      mockFetchError(422, 'Unprocessable Entity', { message: 'Invalid URL' });
      await expect(
        createBookmark({ url: 'not-a-url', title: 'X', description: '', tags: '' })
      ).rejects.toThrow('Invalid URL');
    });
  });

  describe('updateBookmark', () => {
    it('sends PUT and returns updated bookmark', async () => {
      const updated = { ...mockBookmark, title: 'Updated' };
      mockFetchSuccess(updated);
      const result = await updateBookmark('1', {
        url: 'https://example.com',
        title: 'Updated',
        description: '',
        tags: '',
      });
      expect(result).toEqual(updated);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/bookmarks/1'),
        expect.objectContaining({ method: 'PUT' })
      );
    });
  });

  describe('deleteBookmark', () => {
    it('sends DELETE request', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 204,
        statusText: 'No Content',
        json: () => Promise.resolve(null),
      } as Response);
      await expect(deleteBookmark('1')).resolves.toBeUndefined();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/bookmarks/1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('throws on HTTP error', async () => {
      mockFetchError(404, 'Not Found');
      await expect(deleteBookmark('999')).rejects.toThrow('HTTP 404');
    });
  });
});
