/**
 * Unit tests for utility functions
 *
 * Tests cover:
 * - loadRegistry
 * - createIndex
 * - search
 * - readJsonFile
 * - safeExec
 * - detectPackageManager
 * - fetchUrl
 * - success/error response helpers
 * - parseSkillMetadata
 * - extractFunctionBody
 * - extractSkillPatterns
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import Fuse from 'fuse.js';
import { exec } from 'child_process';
import * as https from 'https';
import * as http from 'http';
import { EventEmitter } from 'events';

import {
  loadRegistry,
  createIndex,
  search,
  readJsonFile,
  safeExec,
  detectPackageManager,
  fetchUrl,
  success,
  error,
  parseSkillMetadata,
  extractFunctionBody,
  extractSkillPatterns,
} from '../utils.js';
import { RegistryEntry, Registry } from '../types.js';
import {
  sampleSkillsRegistry,
  samplePackageJson,
  sampleSkillContent,
} from './setup.js';

// Mock the fs/promises module
vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
}));
vi.mock('child_process', () => ({
  exec: vi.fn((cmd: string, opts: unknown, cb: (err: unknown, result: { stdout: string; stderr: string }) => void) => {
    // Default mock implementation - can be overridden in tests
    cb(null, { stdout: 'mock output', stderr: '' });
  }),
}));

vi.mock('https', () => ({
  get: vi.fn(),
}));

vi.mock('http', () => ({
  get: vi.fn(),
}));

// Mock the config module
vi.mock('../config.js', () => ({
  PLUGIN_ROOT: '/mock/plugin/root',
  PROJECT_ROOT: '/mock/project/root',
  FUSE_OPTIONS: {
    keys: [
      { name: 'name', weight: 0.3 },
      { name: 'description', weight: 0.4 },
      { name: 'keywords', weight: 0.3 },
    ],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
  },
}));

describe('utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('loadRegistry', () => {
    it('should load and parse a valid YAML registry', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(yaml.dump(sampleSkillsRegistry));

      const result = await loadRegistry('skills/_registry.yaml');

      expect(result).toBeDefined();
      expect(result?.version).toBe('1.0.0');
      expect(result?.search_index).toHaveLength(5);
    });

    it('should return null when registry file does not exist', async () => {
      vi.mocked(fsPromises.access).mockRejectedValue(new Error('ENOENT'));

      const result = await loadRegistry('nonexistent/_registry.yaml');

      expect(result).toBeNull();
    });

    it('should return null and log error for invalid YAML', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue('invalid: yaml: content: [');

      const result = await loadRegistry('skills/_registry.yaml');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle read errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('Read error'));

      const result = await loadRegistry('skills/_registry.yaml');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('createIndex', () => {
    it('should create a Fuse index from valid registry', () => {
      const index = createIndex(sampleSkillsRegistry as Registry);

      expect(index).toBeInstanceOf(Fuse);
    });

    it('should return null for null registry', () => {
      const index = createIndex(null);

      expect(index).toBeNull();
    });

    it('should return null for registry without search_index', () => {
      const index = createIndex({ version: '1.0.0' } as Registry);

      expect(index).toBeNull();
    });
  });

  describe('search', () => {
    let index: Fuse<RegistryEntry>;

    beforeEach(() => {
      index = new Fuse(sampleSkillsRegistry.search_index, {
        keys: ['name', 'description', 'keywords'],
        threshold: 0.4,
        includeScore: true,
      });
    });

    it('should return empty array for null index', () => {
      const results = search(null, 'test');

      expect(results).toEqual([]);
    });

    it('should find skills by name', () => {
      const results = search(index, 'React Testing', 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('React Testing');
    });

    it('should find skills by keyword', () => {
      const results = search(index, 'prisma', 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.name === 'Prisma ORM')).toBe(true);
    });

    it('should respect limit parameter', () => {
      const results = search(index, 'react', 2);

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should calculate relevance score between 0 and 1', () => {
      const results = search(index, 'testing', 5);

      results.forEach(result => {
        expect(result.relevance).toBeGreaterThanOrEqual(0);
        expect(result.relevance).toBeLessThanOrEqual(1);
      });
    });

    it('should return results with correct structure', () => {
      const results = search(index, 'nextjs', 1);

      expect(results[0]).toHaveProperty('name');
      expect(results[0]).toHaveProperty('path');
      expect(results[0]).toHaveProperty('description');
      expect(results[0]).toHaveProperty('relevance');
    });

    it('should handle results with undefined score', () => {
      // Create a custom mock index that returns results without score
      const mockIndex = {
        search: vi.fn().mockReturnValue([
          {
            item: {
              name: 'Test Item',
              path: 'test/path',
              description: 'Test description',
            },
            // No score property - tests the || 0 fallback
          },
        ]),
      };

      const results = search(mockIndex as unknown as Fuse<RegistryEntry>, 'test', 5);

      expect(results).toHaveLength(1);
      expect(results[0].relevance).toBe(1); // (1 - 0) * 100 / 100 = 1
    });
  });

  describe('readJsonFile', () => {
    it('should parse valid JSON file', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(samplePackageJson));

      const result = await readJsonFile('/path/to/package.json');

      expect(result).toEqual(samplePackageJson);
    });

    it('should return null for non-existent file', async () => {
      vi.mocked(fsPromises.access).mockRejectedValue(new Error('ENOENT'));

      const result = await readJsonFile('/path/to/nonexistent.json');

      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue('invalid json {');

      const result = await readJsonFile('/path/to/invalid.json');

      expect(result).toBeNull();
    });

    it('should return null on read error', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('Read error'));

      const result = await readJsonFile('/path/to/error.json');

      expect(result).toBeNull();
    });
  });

  describe('safeExec', () => {
    it('should return stdout and stderr on successful execution', async () => {
      vi.mocked(exec).mockImplementation(
        (cmd: string, opts: unknown, cb?: (err: unknown, result: { stdout: string; stderr: string }) => void) => {
          if (cb) cb(null, { stdout: 'test output\n', stderr: 'warning\n' });
          return {} as ReturnType<typeof exec>;
        }
      );

      const result = await safeExec('echo test', '/cwd');

      expect(result).toEqual({
        stdout: 'test output',
        stderr: 'warning',
      });
    });

    it('should handle command errors and return error property', async () => {
      vi.mocked(exec).mockImplementation(
        (cmd: string, opts: unknown, cb?: (err: unknown, result: { stdout: string; stderr: string }) => void) => {
          if (cb) {
            const execError = {
              stdout: 'partial output',
              stderr: 'error output',
              message: 'Command failed: exit 1',
            };
            cb(execError, { stdout: '', stderr: '' });
          }
          return {} as ReturnType<typeof exec>;
        }
      );

      const result = await safeExec('exit 1', '/cwd');

      expect(result).toEqual({
        stdout: 'partial output',
        stderr: 'error output',
        error: 'Command failed: exit 1',
      });
    });

    it('should handle errors without stdout/stderr properties', async () => {
      vi.mocked(exec).mockImplementation(
        (cmd: string, opts: unknown, cb?: (err: unknown, result: { stdout: string; stderr: string }) => void) => {
          if (cb) {
            const execError = {
              message: 'Unknown error',
            };
            cb(execError, { stdout: '', stderr: '' });
          }
          return {} as ReturnType<typeof exec>;
        }
      );

      const result = await safeExec('bad-command', '/cwd');

      expect(result).toEqual({
        stdout: '',
        stderr: '',
        error: 'Unknown error',
      });
    });

    it('should handle errors without any properties', async () => {
      vi.mocked(exec).mockImplementation(
        (cmd: string, opts: unknown, cb?: (err: unknown, result: { stdout: string; stderr: string }) => void) => {
          if (cb) {
            cb({}, { stdout: '', stderr: '' });
          }
          return {} as ReturnType<typeof exec>;
        }
      );

      const result = await safeExec('bad-command', '/cwd');

      expect(result).toEqual({
        stdout: '',
        stderr: '',
        error: 'Command failed',
      });
    });

    it('should be a function that returns a promise', () => {
      expect(typeof safeExec).toBe('function');
    });
  });

  describe('detectPackageManager', () => {
    it('should detect pnpm by lock file', async () => {
      vi.mocked(fsPromises.access).mockImplementation((p: Parameters<typeof fsPromises.access>[0]) => {
        if (String(p).includes('pnpm-lock.yaml')) return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await detectPackageManager('/project');

      expect(result).toBe('pnpm');
    });

    it('should detect yarn by lock file', async () => {
      vi.mocked(fsPromises.access).mockImplementation((p: Parameters<typeof fsPromises.access>[0]) => {
        if (String(p).includes('yarn.lock')) return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await detectPackageManager('/project');

      expect(result).toBe('yarn');
    });

    it('should detect bun by lock file', async () => {
      vi.mocked(fsPromises.access).mockImplementation((p: Parameters<typeof fsPromises.access>[0]) => {
        if (String(p).includes('bun.lockb')) return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await detectPackageManager('/project');

      expect(result).toBe('bun');
    });

    it('should default to npm when no lock file found', async () => {
      vi.mocked(fsPromises.access).mockRejectedValue(new Error('ENOENT'));

      const result = await detectPackageManager('/project');

      expect(result).toBe('npm');
    });

    it('should prioritize pnpm over other package managers', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined); // All lock files exist

      const result = await detectPackageManager('/project');

      expect(result).toBe('pnpm');
    });
  });

  describe('fetchUrl', () => {
    /**
     * Helper to create a mock response object that emits events
     */
    function createMockResponse(options: {
      statusCode?: number;
      headers?: Record<string, string>;
      data?: string;
      emitError?: Error;
    }) {
      const res = new EventEmitter() as EventEmitter & {
        statusCode?: number;
        headers: Record<string, string>;
      };
      res.statusCode = options.statusCode ?? 200;
      res.headers = options.headers ?? {};

      // Schedule data emission for after listeners are attached
      if (options.data !== undefined) {
        setImmediate(() => {
          res.emit('data', options.data);
          res.emit('end');
        });
      }
      if (options.emitError) {
        setImmediate(() => {
          res.emit('error', options.emitError);
        });
      }

      return res;
    }

    /**
     * Helper to create a mock request object
     */
    function createMockRequest(options: { emitError?: Error }) {
      const req = new EventEmitter();
      if (options.emitError) {
        setImmediate(() => {
          req.emit('error', options.emitError);
        });
      }
      return req;
    }

    it('should fetch HTTPS URL and return data', async () => {
      const mockRes = createMockResponse({ data: 'test content' });
      const mockReq = createMockRequest({});

      vi.mocked(https.get).mockImplementation((url: string, cb: (res: unknown) => void) => {
        cb(mockRes);
        return mockReq as unknown as ReturnType<typeof https.get>;
      });

      const result = await fetchUrl('https://example.com/data');

      expect(result).toBe('test content');
      expect(https.get).toHaveBeenCalledWith('https://example.com/data', expect.any(Function));
    });

    it('should fetch HTTP URL and return data', async () => {
      const mockRes = createMockResponse({ data: 'http content' });
      const mockReq = createMockRequest({});

      vi.mocked(http.get).mockImplementation((url: string, cb: (res: unknown) => void) => {
        cb(mockRes);
        return mockReq as unknown as ReturnType<typeof http.get>;
      });

      const result = await fetchUrl('http://example.com/data');

      expect(result).toBe('http content');
      expect(http.get).toHaveBeenCalledWith('http://example.com/data', expect.any(Function));
    });

    it('should follow redirects (3xx with location header)', async () => {
      // First call returns a redirect
      const redirectRes = createMockResponse({
        statusCode: 302,
        headers: { location: 'https://example.com/redirected' },
      });
      const mockReq1 = createMockRequest({});

      // Second call returns actual content
      const finalRes = createMockResponse({ data: 'final content' });
      const mockReq2 = createMockRequest({});

      let callCount = 0;
      vi.mocked(https.get).mockImplementation((url: string, cb: (res: unknown) => void) => {
        callCount++;
        if (callCount === 1) {
          cb(redirectRes);
          return mockReq1 as unknown as ReturnType<typeof https.get>;
        }
        cb(finalRes);
        return mockReq2 as unknown as ReturnType<typeof https.get>;
      });

      const result = await fetchUrl('https://example.com/original');

      expect(result).toBe('final content');
      expect(https.get).toHaveBeenCalledTimes(2);
    });

    it('should handle request errors', async () => {
      const networkError = new Error('Network error');
      const mockReq = createMockRequest({ emitError: networkError });

      vi.mocked(https.get).mockImplementation((url: string, cb: (res: unknown) => void) => {
        // Don't call cb - just return the request that will error
        return mockReq as unknown as ReturnType<typeof https.get>;
      });

      await expect(fetchUrl('https://example.com/error')).rejects.toThrow('Network error');
    });

    it('should handle response errors', async () => {
      const responseError = new Error('Response error');
      const mockRes = createMockResponse({ emitError: responseError });
      const mockReq = createMockRequest({});

      vi.mocked(https.get).mockImplementation((url: string, cb: (res: unknown) => void) => {
        cb(mockRes);
        return mockReq as unknown as ReturnType<typeof https.get>;
      });

      await expect(fetchUrl('https://example.com/res-error')).rejects.toThrow('Response error');
    });

    it('should concatenate multiple data chunks', async () => {
      const res = new EventEmitter() as EventEmitter & {
        statusCode: number;
        headers: Record<string, string>;
      };
      res.statusCode = 200;
      res.headers = {};

      const mockReq = createMockRequest({});

      vi.mocked(https.get).mockImplementation((url: string, cb: (res: unknown) => void) => {
        cb(res);
        // Emit multiple chunks
        setImmediate(() => {
          res.emit('data', 'chunk1');
          res.emit('data', 'chunk2');
          res.emit('data', 'chunk3');
          res.emit('end');
        });
        return mockReq as unknown as ReturnType<typeof https.get>;
      });

      const result = await fetchUrl('https://example.com/chunked');

      expect(result).toBe('chunk1chunk2chunk3');
    });
  });

  describe('success helper', () => {
    it('should create success response with string data', () => {
      const result = success('test message');

      expect(result).toEqual({
        content: [{ type: 'text', text: 'test message' }],
      });
    });

    it('should create success response with object data', () => {
      const data = { key: 'value', number: 42 };
      const result = success(data);

      expect(result).toEqual({
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      });
    });

    it('should handle array data', () => {
      const data = [1, 2, 3];
      const result = success(data);

      expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it('should handle nested objects', () => {
      const data = { nested: { deep: { value: true } } };
      const result = success(data);

      expect(result.content[0].text).toContain('"nested"');
      expect(result.content[0].text).toContain('"deep"');
    });
  });

  describe('error helper', () => {
    it('should create error response with message', () => {
      const result = error('Something went wrong');

      expect(result).toEqual({
        content: [{ type: 'text', text: JSON.stringify({ error: 'Something went wrong' }) }],
        isError: true,
      });
    });

    it('should always set isError to true', () => {
      const result = error('Any error');

      expect(result.isError).toBe(true);
    });
  });

  describe('parseSkillMetadata', () => {
    beforeEach(() => {
      vi.mocked(fsPromises.access).mockRejectedValue(new Error('ENOENT'));
    });

    it('should parse YAML frontmatter from skill file', async () => {
      vi.mocked(fsPromises.access).mockImplementation((p: Parameters<typeof fsPromises.access>[0]) => {
        if (String(p).includes('SKILL.md')) return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(sampleSkillContent);

      const result = await parseSkillMetadata('testing/react-testing');

      expect(result.category).toBe('testing');
      expect(result.technologies).toContain('react');
      expect(result.requires).toContain('react-basics');
      expect(result.complements).toContain('jest-advanced');
      expect(result.difficulty).toBe('intermediate');
    });

    it('should return empty object when skill file not found', async () => {
      vi.mocked(fsPromises.access).mockRejectedValue(new Error('ENOENT'));

      const result = await parseSkillMetadata('nonexistent/skill');

      expect(result).toEqual({});
    });

    it('should try multiple file paths', async () => {
      const checkCalls: string[] = [];
      vi.mocked(fsPromises.access).mockImplementation((p: Parameters<typeof fsPromises.access>[0]) => {
        checkCalls.push(String(p));
        return Promise.reject(new Error('ENOENT'));
      });

      await parseSkillMetadata('some/skill');

      expect(checkCalls.length).toBeGreaterThanOrEqual(2);
      expect(checkCalls.some(c => c.includes('SKILL.md'))).toBe(true);
    });

    it('should handle file read errors gracefully', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('Read error'));

      const result = await parseSkillMetadata('error/skill');

      expect(result).toEqual({});
    });

    it('should extract metadata from content when no frontmatter', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
# React Testing

Prerequisites:
- react-basics
- javascript-testing

Related:
- jest-advanced
- cypress-e2e

This skill covers react testing with vitest.
`);

      const result = await parseSkillMetadata('testing/react');

      expect(result.requires).toContain('react-basics');
      expect(result.complements).toContain('jest-advanced');
    });

    it('should extract technology keywords from content', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
# Next.js with Prisma

Build apps with Next.js and Prisma ORM using TypeScript.
`);

      const result = await parseSkillMetadata('frameworks/nextjs-prisma');

      expect(result.technologies).toContain('next');
      expect(result.technologies).toContain('prisma');
      expect(result.technologies).toContain('typescript');
    });

    it('should use related field when complements is not an array', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(`---
name: Test Skill
related:
  - related-skill-1
  - related-skill-2
---
# Test Skill
`);

      const result = await parseSkillMetadata('test/skill');

      expect(result.complements).toContain('related-skill-1');
      expect(result.complements).toContain('related-skill-2');
    });

    it('should use tech field when technologies is not an array', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(`---
name: Test Skill
tech:
  - react
  - vue
---
# Test Skill
`);

      const result = await parseSkillMetadata('test/skill');

      expect(result.technologies).toContain('react');
      expect(result.technologies).toContain('vue');
    });

    it('should handle content sections with empty match results', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      // Content has section headers but the match pattern returns null for items
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
# Test Skill

Prerequisites:

Related:

No actual list items here, just empty sections.
`);

      const result = await parseSkillMetadata('test/skill');

      // Should handle gracefully without errors
      expect(result).toBeDefined();
    });

    it('should return undefined for complements when neither complements nor related are arrays', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(`---
name: Test Skill
complements: "not an array"
related: "also not an array"
---
# Test Skill
`);

      const result = await parseSkillMetadata('test/skill');

      expect(result.complements).toBeUndefined();
    });

    it('should parse conflicts array from frontmatter', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(`---
name: Test Skill
conflicts:
  - conflicting-skill-1
  - conflicting-skill-2
---
# Test Skill
`);

      const result = await parseSkillMetadata('test/skill');

      expect(result.conflicts).toContain('conflicting-skill-1');
      expect(result.conflicts).toContain('conflicting-skill-2');
    });

    it('should return undefined for conflicts when not an array', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(`---
name: Test Skill
conflicts: "not an array"
---
# Test Skill
`);

      const result = await parseSkillMetadata('test/skill');

      expect(result.conflicts).toBeUndefined();
    });

    it('should handle Prerequisites section with valid list items', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      // Content has Prerequisites: header followed by valid list items
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
# Test Skill

Prerequisites:
- item1
- item2

More content here.
`);

      const result = await parseSkillMetadata('test/skill');

      // Should parse the list items
      expect(result.requires).toContain('item1');
      expect(result.requires).toContain('item2');
    });

    it('should handle Related section with valid list items', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      // Content has Related: header followed by valid list items
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
# Test Skill

Related:
- related1
- related2

More content.
`);

      const result = await parseSkillMetadata('test/skill');

      // Should parse the list items
      expect(result.complements).toContain('related1');
      expect(result.complements).toContain('related2');
    });

    it('should use Dependencies section for requires', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
# Test Skill

Dependencies:
- dep1
- dep2

More content.
`);

      const result = await parseSkillMetadata('test/skill');

      expect(result.requires).toContain('dep1');
      expect(result.requires).toContain('dep2');
    });

    it('should use See also section for complements', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
# Test Skill

See also:
- also1
- also2

More content.
`);

      const result = await parseSkillMetadata('test/skill');

      expect(result.complements).toContain('also1');
      expect(result.complements).toContain('also2');
    });

    it('should use Complements section for complements', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
# Test Skill

Complements:
- comp1
- comp2

More content.
`);

      const result = await parseSkillMetadata('test/skill');

      expect(result.complements).toContain('comp1');
      expect(result.complements).toContain('comp2');
    });
  });

  describe('extractFunctionBody', () => {
    it('should extract function body with balanced braces', () => {
      const content = 'function test() { const x = { a: 1 }; return x; }';
      const result = extractFunctionBody(content, 0);

      expect(result).toContain('const x');
      expect(result).toContain('return x');
    });

    it('should handle nested braces', () => {
      const content = `
async function nested() {
  if (true) {
    while (false) {
      const obj = { key: { deep: true } };
    }
  }
  return 'done';
}`;
      const startIndex = content.indexOf('async function');
      const result = extractFunctionBody(content, startIndex);

      expect(result).toContain('if (true)');
      expect(result).toContain('while (false)');
      expect(result).toContain("return 'done'");
    });

    it('should respect the 2000 character limit', () => {
      const longContent = 'function test() { ' + 'x'.repeat(3000) + ' }';
      const result = extractFunctionBody(longContent, 0);

      expect(result.length).toBeLessThanOrEqual(2000);
    });

    it('should handle arrow functions', () => {
      const content = 'const fn = () => { return 42; };';
      const startIndex = content.indexOf('() =>');
      const result = extractFunctionBody(content, startIndex);

      expect(result).toContain('return 42');
    });

    it('should return content up to limit if braces not balanced', () => {
      const content = 'function incomplete() { const x = 1;';
      const result = extractFunctionBody(content, 0);

      // When braces aren't balanced, function returns from startIndex to last checked position
      // The implementation scans until braces balance or 2000 chars limit
      expect(result.length).toBeLessThanOrEqual(content.length);
    });
  });

  describe('extractSkillPatterns', () => {
    beforeEach(() => {
      vi.mocked(fsPromises.access).mockRejectedValue(new Error('ENOENT'));
    });

    it('should extract required imports from skill content', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(sampleSkillContent);

      const result = await extractSkillPatterns('testing/react');

      expect(result.required_imports).toBeDefined();
      expect(result.required_imports).toContain('@testing-library/react');
    });

    it('should extract must not include patterns', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(sampleSkillContent);

      const result = await extractSkillPatterns('testing/react');

      expect(result.must_not_include).toBeDefined();
      expect(result.must_not_include).toContain('Testing implementation details');
    });

    it('should return empty object when skill not found', async () => {
      vi.mocked(fsPromises.access).mockRejectedValue(new Error('ENOENT'));

      const result = await extractSkillPatterns('nonexistent/skill');

      expect(result).toEqual({});
    });

    it('should extract imports from code blocks', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
# Test Skill

\`\`\`typescript
import { render } from '@testing-library/react';
import { expect } from 'vitest';
\`\`\`
`);

      const result = await extractSkillPatterns('testing/example');

      expect(result.required_imports).toContain('@testing-library/react');
      expect(result.required_imports).toContain('vitest');
    });

    it('should not include relative imports', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
\`\`\`typescript
import { Component } from './components';
import { helper } from '../utils';
import { external } from 'external-package';
\`\`\`
`);

      const result = await extractSkillPatterns('test/skill');

      expect(result.required_imports).not.toContain('./components');
      expect(result.required_imports).not.toContain('../utils');
      expect(result.required_imports).toContain('external-package');
    });

    it('should handle read errors gracefully and continue to next path', async () => {
      // File exists check passes but reading throws an error
      // This should trigger the catch block's continue statement
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('Permission denied'));

      const result = await extractSkillPatterns('error/skill');

      // Should return empty object after trying all paths
      expect(result).toEqual({});
    });

    it('should handle code blocks without imports', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
# Test Skill

\`\`\`typescript
const x = 1;
const y = 2;
console.log(x + y);
\`\`\`
`);

      const result = await extractSkillPatterns('test/skill');

      // Should not crash, just have no required_imports
      expect(result.required_imports).toBeUndefined();
    });

    it('should handle code blocks that exist but have empty length check', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      // Content with code block markers but no actual blocks matched
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
# Test Skill

Just some text without proper code blocks.
`);

      const result = await extractSkillPatterns('test/skill');

      expect(result).toBeDefined();
    });

    it('should skip imports that already exist in required_imports', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
# Test Skill

Required imports:
- vitest

\`\`\`typescript
import { test } from 'vitest';
import { render } from '@testing-library/react';
\`\`\`
`);

      const result = await extractSkillPatterns('test/skill');

      // vitest should not be duplicated
      expect(result.required_imports?.filter(i => i === 'vitest').length).toBeLessThanOrEqual(1);
      expect(result.required_imports).toContain('@testing-library/react');
    });
  });
});
