/**
 * Tests for precision_fetch handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handlePrecisionFetch, clearFetchCache } from '../../handlers/precision-fetch.js';
import { expectSuccess, expectError } from '../test-utils.js';

// Mock fetch globally
const mockFetch = vi.fn();

describe('precision_fetch handler', () => {
  beforeEach(() => {
    // @ts-ignore - Mocking global fetch
    globalThis.fetch = mockFetch;
    // Clear cache before each test to prevent cross-test pollution
    clearFetchCache();
  });

  afterEach(() => {
    mockFetch.mockReset();
  });

  describe('input validation', () => {
    it('should return error when urls array is missing', async () => {
      const result = await handlePrecisionFetch({});
      const parsed = expectError(result);
      expect(parsed.error).toContain("Missing required parameter 'urls'");
    });

    it('should return error when urls array is empty', async () => {
      const result = await handlePrecisionFetch({ urls: [] });
      const parsed = expectError(result);
      expect(parsed.error).toContain("Missing required parameter 'urls'");
    });

    it('should return error for invalid URL', async () => {
      const result = await handlePrecisionFetch({
        urls: [{ url: 'not-a-valid-url' }],
      });
      const parsed = expectError(result);
      expect(parsed.error).toContain('Invalid URL');
    });
  });

  describe('basic fetch operations', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve('<html><body>Hello World</body></html>'),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });
    });

    it('should fetch a single URL', async () => {
      const result = await handlePrecisionFetch({
        urls: [{ url: 'https://example.com' }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.fetched).toBe(1);
      expect(parsed.data.urls[0].status).toBe('success');
    });

    it('should fetch multiple URLs', async () => {
      const result = await handlePrecisionFetch({
        urls: [
          { url: 'https://example.com/1' },
          { url: 'https://example.com/2' },
        ],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.fetched).toBe(2);
    });

    it('should accept string URLs', async () => {
      const result = await handlePrecisionFetch({
        urls: ['https://example.com'],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.fetched).toBe(1);
    });
  });

  describe('extract modes', () => {
    describe('text extraction', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'text/html' }),
          text: () => Promise.resolve('<html><body><p>Hello</p> <p>World</p></body></html>'),
        });
      });

      it('should extract text from HTML', async () => {
        const result = await handlePrecisionFetch({
          urls: [{ url: 'https://example.com', extract: 'text' }],
          output_mode: 'verbose',
        });

        const parsed = expectSuccess(result);
        expect(parsed.data.urls[0].content).toBeDefined();
        expect(parsed.data.urls[0].content).not.toContain('<');
      });
    });

    describe('json extraction', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: () => Promise.resolve('{"name":"test","value":123}'),
        });
      });

      it('should extract and format JSON', async () => {
        const result = await handlePrecisionFetch({
          urls: [{ url: 'https://api.example.com', extract: 'json' }],
          output_mode: 'verbose',
        });

        const parsed = expectSuccess(result);
        expect(parsed.data.urls[0].content).toContain('"name"');
        expect(parsed.data.urls[0].content).toContain('"test"');
      });
    });

    describe('markdown extraction', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'text/html' }),
          text: () => Promise.resolve('<html><body><h1>Title</h1><p>Content</p><a href="/link">Link</a></body></html>'),
        });
      });

      it('should convert HTML to markdown', async () => {
        const result = await handlePrecisionFetch({
          urls: [{ url: 'https://example.com', extract: 'markdown' }],
          output_mode: 'verbose',
        });

        const parsed = expectSuccess(result);
        expect(parsed.data.urls[0].content).toContain('# Title');
      });
    });

    describe('structured extraction', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'text/html' }),
          text: () => Promise.resolve('<html><body><h1>Header 1</h1><h1>Header 2</h1><p class="intro">Intro text</p></body></html>'),
        });
      });

      it('should extract with CSS selectors', async () => {
        const result = await handlePrecisionFetch({
          urls: [{ url: 'https://example.com', extract: 'structured' }],
          selectors: ['h1', '.intro'],
          output_mode: 'verbose',
        });

        const parsed = expectSuccess(result);
        expect(parsed.data.urls[0].structured).toBeDefined();
        expect(parsed.data.urls[0].structured['h1']).toContain('Header 1');
      });
    });

    describe('summary extraction', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'text/html' }),
          text: () => Promise.resolve('<html><body><p>This is a long text that should be summarized. It contains many sentences about various topics.</p></body></html>'),
        });
      });

      it('should create summary from content', async () => {
        const result = await handlePrecisionFetch({
          urls: [{ url: 'https://example.com', extract: 'summary' }],
          summary_prompt: 'Summarize the main points',
          output_mode: 'verbose',
        });

        const parsed = expectSuccess(result);
        expect(parsed.data.urls[0].summary).toBeDefined();
      });
    });
  });

  describe('caching', () => {
    beforeEach(() => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'text/plain' }),
          text: () => Promise.resolve(`Call ${callCount}`),
        });
      });
    });

    it('should cache responses', async () => {
      // First request
      await handlePrecisionFetch({
        urls: [{ url: 'https://example.com/cacheable' }],
        cache_ttl_seconds: 300,
      });

      // Second request (should be cached)
      const result = await handlePrecisionFetch({
        urls: [{ url: 'https://example.com/cacheable' }],
        cache_ttl_seconds: 300,
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.urls[0].from_cache).toBe(true);
      expect(parsed.data.summary.from_cache).toBe(1);
    });

    it('should track from_cache in results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: () => Promise.resolve('Content'),
      });

      const result = await handlePrecisionFetch({
        urls: [{ url: 'https://example.com/new-url' }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.urls[0].from_cache).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
        text: () => Promise.resolve('Not found'),
      });

      const result = await handlePrecisionFetch({
        urls: [{ url: 'https://example.com/notfound' }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.urls[0].status).toBe('failed');
      expect(parsed.data.urls[0].http_status).toBe(404);
      expect(parsed.data.summary.failed).toBe(1);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await handlePrecisionFetch({
        urls: [{ url: 'https://example.com' }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.urls[0].status).toBe('failed');
      expect(parsed.data.urls[0].error).toBeDefined();
    });

    it('should handle timeout', async () => {
      mockFetch.mockImplementation(() => {
        const error = new Error('Timeout');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const result = await handlePrecisionFetch({
        urls: [{ url: 'https://example.com', timeout: 100 }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.urls[0].status).toBe('timeout');
    });
  });

  describe('HTTP methods', () => {
    it('should support POST method', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve('{"id": 1}'),
      });

      const result = await handlePrecisionFetch({
        urls: [{
          url: 'https://api.example.com/create',
          method: 'POST',
          body: '{"name": "test"}',
          headers: { 'Content-Type': 'application/json' },
        }],
      });

      const parsed = expectSuccess(result);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/create',
        expect.objectContaining({
          method: 'POST',
          body: '{"name": "test"}',
        })
      );
    });
  });

  describe('output modes', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: () => Promise.resolve('Content'),
      });
    });

    it('should return count_only output', async () => {
      const result = await handlePrecisionFetch({
        urls: [{ url: 'https://example.com' }],
        output_mode: 'count_only',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data).toHaveProperty('summary');
      expect(parsed.data).not.toHaveProperty('urls');
    });

    it('should return minimal output', async () => {
      const result = await handlePrecisionFetch({
        urls: [{ url: 'https://example.com' }],
        output_mode: 'minimal',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.urls[0]).toHaveProperty('url');
      expect(parsed.data.urls[0]).toHaveProperty('status');
      expect(parsed.data.urls[0]).not.toHaveProperty('content');
    });

    it('should return verbose output with content', async () => {
      const result = await handlePrecisionFetch({
        urls: [{ url: 'https://example.com' }],
        output_mode: 'verbose',
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.urls[0]).toHaveProperty('content');
      expect(parsed.data.urls[0]).toHaveProperty('duration_ms');
    });
  });

  describe('metadata', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: () => Promise.resolve('Content'),
      });
    });

    it('should include tokens_used', async () => {
      const result = await handlePrecisionFetch({
        urls: [{ url: 'https://example.com' }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.tokens_used).toBeGreaterThan(0);
    });

    it('should include execution time', async () => {
      const result = await handlePrecisionFetch({
        urls: [{ url: 'https://example.com' }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.meta.execution_ms).toBeGreaterThanOrEqual(0);
    });

    it('should include total_size in summary', async () => {
      const result = await handlePrecisionFetch({
        urls: [{ url: 'https://example.com' }],
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.summary.total_size).toBeGreaterThan(0);
    });
  });
});
