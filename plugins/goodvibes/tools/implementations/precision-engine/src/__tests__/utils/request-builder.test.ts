import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('request-builder', () => {
  let tmpDir: string;
  let builder: typeof import('../../utils/fetch/request-builder.js');
  let registry: typeof import('../../utils/fetch/service-registry.js');

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'request-builder-test-'));
    await fs.promises.mkdir(path.join(tmpDir, '.goodvibes'), { recursive: true });
    await fs.promises.writeFile(
      path.join(tmpDir, '.goodvibes', 'goodvibes.json'),
      JSON.stringify({ sandbox: false }),
      'utf-8'
    );
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    vi.resetModules();
    builder = await import('../../utils/fetch/request-builder.js');
    registry = await import('../../utils/fetch/service-registry.js');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('buildRequestUrl', () => {
    it('should return absolute URL as-is', () => {
      const url = builder.buildRequestUrl({ url: 'https://example.com/api' });
      expect(url).toBe('https://example.com/api');
    });

    it('should append query params', () => {
      const url = builder.buildRequestUrl({
        url: 'https://example.com/search',
        params: { q: 'test', page: 1, active: true },
      });
      expect(url).toContain('q=test');
      expect(url).toContain('page=1');
      expect(url).toContain('active=true');
    });

    it('should override existing query params', () => {
      const url = builder.buildRequestUrl({
        url: 'https://example.com/search?q=old',
        params: { q: 'new' },
      });
      expect(url).toContain('q=new');
      expect(url).not.toContain('q=old');
    });
  });

  describe('buildRequestBody', () => {
    it('should encode JSON body', () => {
      const [body, contentType] = builder.buildRequestBody({
        url: 'https://example.com',
        body_type: 'json',
        body_data: { key: 'value', num: 42 },
      });
      expect(body).toBe('{"key":"value","num":42}');
      expect(contentType).toBe('application/json');
    });

    it('should encode form body', () => {
      const [body, contentType] = builder.buildRequestBody({
        url: 'https://example.com',
        body_type: 'form',
        body_data: { username: 'admin', password: 'secret' },
      });
      expect(body).toContain('username=admin');
      expect(body).toContain('password=secret');
      expect(contentType).toBe('application/x-www-form-urlencoded');
    });

    it('should handle multipart body', () => {
      const [body, contentType] = builder.buildRequestBody({
        url: 'https://example.com',
        body_type: 'multipart',
        body_data: { field1: 'value1' },
      });
      expect(body).toContain('field1');
      expect(body).toContain('value1');
      expect(contentType).toContain('multipart/form-data');
    });

    it('should pass raw body through', () => {
      const [body, contentType] = builder.buildRequestBody({
        url: 'https://example.com',
        body_type: 'raw',
        body_data: 'raw content here',
      });
      expect(body).toBe('raw content here');
      expect(contentType).toBeUndefined();
    });

    it('should default to json when body_data provided without body_type', () => {
      const [body, contentType] = builder.buildRequestBody({
        url: 'https://example.com',
        body_data: { key: 'value' },
      });
      expect(contentType).toBe('application/json');
    });

    it('should handle legacy body_base64', () => {
      const [body] = builder.buildRequestBody({
        url: 'https://example.com',
        body_base64: Buffer.from('hello').toString('base64'),
      });
      expect(body).toBe('hello');
    });

    it('should handle legacy body string', () => {
      const [body] = builder.buildRequestBody({
        url: 'https://example.com',
        body: 'raw body',
      });
      expect(body).toBe('raw body');
    });

    it('should return undefined for no body', () => {
      const [body, contentType] = builder.buildRequestBody({ url: 'https://example.com' });
      expect(body).toBeUndefined();
      expect(contentType).toBeUndefined();
    });
  });

  describe('buildRequestHeaders', () => {
    it('should apply bearer auth', () => {
      const headers = builder.buildRequestHeaders(
        { url: 'https://example.com', auth: { type: 'bearer', token: 'tok123' } },
        undefined,
        undefined
      );
      expect(headers['Authorization']).toBe('Bearer tok123');
    });

    it('should apply basic auth', () => {
      const headers = builder.buildRequestHeaders(
        { url: 'https://example.com', auth: { type: 'basic', username: 'user', password: 'pass' } },
        undefined,
        undefined
      );
      const expected = 'Basic ' + Buffer.from('user:pass').toString('base64');
      expect(headers['Authorization']).toBe(expected);
    });

    it('should apply api-key auth', () => {
      const headers = builder.buildRequestHeaders(
        { url: 'https://example.com', auth: { type: 'api-key', header: 'X-API-Key', key: 'mykey' } },
        undefined,
        undefined
      );
      expect(headers['X-API-Key']).toBe('mykey');
    });

    it('should set auto content-type', () => {
      const headers = builder.buildRequestHeaders(
        { url: 'https://example.com' },
        undefined,
        'application/json'
      );
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should not override existing content-type', () => {
      const headers = builder.buildRequestHeaders(
        { url: 'https://example.com', headers: { 'Content-Type': 'text/xml' } },
        undefined,
        'application/json'
      );
      expect(headers['Content-Type']).toBe('text/xml');
    });
  });

  describe('buildRequest', () => {
    it('should build a basic request', async () => {
      const built = await builder.buildRequest({
        url: 'https://example.com/api',
        method: 'POST',
        body_data: { test: true },
      });
      expect(built.url).toBe('https://example.com/api');
      expect(built.method).toBe('POST');
      expect(built.body).toBe('{"test":true}');
      expect(built.headers['Content-Type']).toBe('application/json');
    });

    it('should resolve service and use its timeout', async () => {
      await registry.addService('fast-api', {
        base_url: 'https://fast.example.com',
        timeout_ms: 5000,
      });
      const built = await builder.buildRequest({
        url: 'https://fast.example.com/test',
        service: 'fast-api',
      });
      expect(built.timeout_ms).toBe(5000);
      expect(built.service).toBeDefined();
      expect(built.service!.name).toBe('fast-api');
    });
  });
});
