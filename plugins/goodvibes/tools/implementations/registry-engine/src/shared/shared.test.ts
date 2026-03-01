/**
 * Tests for shared/ layer (L0): constants, config, logger, types, response, utils.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';

// ============================================================================
// constants.ts
// ============================================================================

describe('constants', () => {
  it('SERVER_NAME is a non-empty string', async () => {
    const { SERVER_NAME } = await import('./constants.js');
    expect(typeof SERVER_NAME).toBe('string');
    expect(SERVER_NAME.length).toBeGreaterThan(0);
  });

  it('SERVER_VERSION is a non-empty string', async () => {
    const { SERVER_VERSION } = await import('./constants.js');
    expect(typeof SERVER_VERSION).toBe('string');
    expect(SERVER_VERSION.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// config.ts
// ============================================================================

describe('config', () => {
  it('PLUGIN_ROOT is a non-empty string', async () => {
    const { PLUGIN_ROOT } = await import('./config.js');
    expect(typeof PLUGIN_ROOT).toBe('string');
    expect(PLUGIN_ROOT.length).toBeGreaterThan(0);
  });

  it('PROJECT_ROOT is a non-empty string', async () => {
    const { PROJECT_ROOT } = await import('./config.js');
    expect(typeof PROJECT_ROOT).toBe('string');
    expect(PROJECT_ROOT.length).toBeGreaterThan(0);
  });

  it('getProjectRoot() returns PROJECT_ROOT env var when set', async () => {
    const original = process.env.PROJECT_ROOT;
    process.env.PROJECT_ROOT = '/test/project';
    const { getProjectRoot } = await import('./config.js');
    expect(getProjectRoot()).toBe('/test/project');
    if (original === undefined) {
      delete process.env.PROJECT_ROOT;
    } else {
      process.env.PROJECT_ROOT = original;
    }
  });

  it('getProjectRoot() returns CLAUDE_PROJECT_DIR when PROJECT_ROOT not set', async () => {
    const origPR = process.env.PROJECT_ROOT;
    const origCPD = process.env.CLAUDE_PROJECT_DIR;
    delete process.env.PROJECT_ROOT;
    process.env.CLAUDE_PROJECT_DIR = '/test/claude/project';
    const { getProjectRoot } = await import('./config.js');
    expect(getProjectRoot()).toBe('/test/claude/project');
    if (origPR !== undefined) process.env.PROJECT_ROOT = origPR;
    if (origCPD === undefined) {
      delete process.env.CLAUDE_PROJECT_DIR;
    } else {
      process.env.CLAUDE_PROJECT_DIR = origCPD;
    }
  });

  it('getProjectRoot() falls back to process.cwd() when no env vars set', async () => {
    const origPR = process.env.PROJECT_ROOT;
    const origCPD = process.env.CLAUDE_PROJECT_DIR;
    delete process.env.PROJECT_ROOT;
    delete process.env.CLAUDE_PROJECT_DIR;
    const { getProjectRoot } = await import('./config.js');
    expect(getProjectRoot()).toBe(process.cwd());
    if (origPR !== undefined) process.env.PROJECT_ROOT = origPR;
    if (origCPD !== undefined) process.env.CLAUDE_PROJECT_DIR = origCPD;
  });
});

// ============================================================================
// logger.ts
// ============================================================================

describe('logger', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('logger.info writes to stderr with INFO level', async () => {
    const { logger } = await import('./logger.js');
    logger.info('test message');
    expect(stderrSpy).toHaveBeenCalledOnce();
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain('[INFO]');
    expect(output).toContain('test message');
  });

  it('logger.error writes to stderr with ERROR level', async () => {
    const { logger } = await import('./logger.js');
    logger.error('error message');
    expect(stderrSpy).toHaveBeenCalledOnce();
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain('[ERROR]');
    expect(output).toContain('error message');
  });

  it('logger.warn writes to stderr with WARN level', async () => {
    const { logger } = await import('./logger.js');
    logger.warn('warn message');
    expect(stderrSpy).toHaveBeenCalledOnce();
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain('[WARN]');
    expect(output).toContain('warn message');
  });

  it('logger.debug writes to stderr with DEBUG level', async () => {
    const { logger } = await import('./logger.js');
    logger.debug('debug message');
    expect(stderrSpy).toHaveBeenCalledOnce();
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain('[DEBUG]');
    expect(output).toContain('debug message');
  });

  it('logger.request writes to stderr with REQUEST level', async () => {
    const { logger } = await import('./logger.js');
    logger.request('myTool');
    expect(stderrSpy).toHaveBeenCalledOnce();
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain('[REQUEST]');
    expect(output).toContain('myTool');
  });

  it('logger includes timestamp in output', async () => {
    const { logger } = await import('./logger.js');
    logger.info('timestamp test');
    const output = stderrSpy.mock.calls[0][0] as string;
    // ISO timestamp format: [2024-01-01T00:00:00.000Z]
    expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
  });

  it('logger includes data when provided', async () => {
    const { logger } = await import('./logger.js');
    const data = { key: 'value' };
    logger.info('with data', data);
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain('{"key":"value"');
  });

  it('logger omits data when not provided', async () => {
    const { logger } = await import('./logger.js');
    logger.info('no data');
    const output = stderrSpy.mock.calls[0][0] as string;
    // Should not contain extra JSON beyond the message
    expect(output).not.toContain('{"');
  });

  it('logger.request passes args as data', async () => {
    const { logger } = await import('./logger.js');
    const args = { param: 'test' };
    logger.request('toolName', args);
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain('toolName');
    expect(output).toContain('param');
  });
});

// ============================================================================
// types.ts — runtime shape checks
// ============================================================================

describe('types', () => {
  it('McpContent has correct shape for text type', async () => {
    const { } = await import('./types.js');
    // TypeScript compile-time check — verified by tsc. Runtime: create conforming objects.
    const content = { type: 'text' as const, text: 'hello' };
    expect(content.type).toBe('text');
    expect(content.text).toBe('hello');
  });

  it('McpContent has correct shape for image type', async () => {
    const content = { type: 'image' as const, data: 'base64data', mimeType: 'image/png' };
    expect(content.type).toBe('image');
    expect(content.data).toBe('base64data');
    expect(content.mimeType).toBe('image/png');
  });

  it('McpContent has correct shape for resource type', async () => {
    const content = { type: 'resource' as const };
    expect(content.type).toBe('resource');
  });

  it('McpResponse has content array and optional isError', async () => {
    const response = {
      content: [{ type: 'text' as const, text: 'hello' }],
      isError: false,
    };
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content[0].type).toBe('text');
    expect(response.isError).toBe(false);
  });

  it('McpResponse isError is optional', async () => {
    const response = { content: [] };
    expect(response.content).toEqual([]);
    // isError being absent is valid
    expect('isError' in response).toBe(false);
  });
});

// ============================================================================
// response.ts
// ============================================================================

describe('response', () => {
  it('ok() returns McpResponse with text content for string input', async () => {
    const { ok } = await import('./response.js');
    const result = ok('hello world');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('hello world');
    expect(result.isError).toBeUndefined();
  });

  it('ok() JSON.stringifies non-string input', async () => {
    const { ok } = await import('./response.js');
    const data = { foo: 'bar', num: 42 };
    const result = ok(data);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toEqual(data);
  });

  it('ok() handles null input', async () => {
    const { ok } = await import('./response.js');
    const result = ok(null);
    expect(result.content[0].text).toBe('null');
  });

  it('ok() handles array input', async () => {
    const { ok } = await import('./response.js');
    const result = ok([1, 2, 3]);
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed).toEqual([1, 2, 3]);
  });

  it('ok() does not set isError', async () => {
    const { ok } = await import('./response.js');
    const result = ok('test');
    expect(result.isError).toBeUndefined();
  });

  it('fail() returns McpResponse with isError true', async () => {
    const { fail } = await import('./response.js');
    const result = fail('something went wrong');
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
  });

  it('fail() includes error message in content', async () => {
    const { fail } = await import('./response.js');
    const result = fail('something went wrong');
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.error).toBe('something went wrong');
  });

  it('fail() wraps message in { error } JSON', async () => {
    const { fail } = await import('./response.js');
    const result = fail('bad input');
    expect(result.content[0].text).toBe(JSON.stringify({ error: 'bad input' }));
  });
});

// ============================================================================
// utils.ts
// ============================================================================

describe('utils', () => {
  describe('fileExists', () => {
    it('returns true for an existing file', async () => {
      const { fileExists } = await import('./utils.js');
      // Use this test file itself as a known-existing file
      const thisFile = new URL(import.meta.url).pathname;
      const result = await fileExists(thisFile);
      expect(result).toBe(true);
    });

    it('returns false for a non-existent file', async () => {
      const { fileExists } = await import('./utils.js');
      const result = await fileExists('/tmp/__definitely_does_not_exist_xyz_abc_12345.txt');
      expect(result).toBe(false);
    });

    it('returns true for an existing directory', async () => {
      const { fileExists } = await import('./utils.js');
      const result = await fileExists(os.tmpdir());
      expect(result).toBe(true);
    });
  });

  describe('resolveEsmDir', () => {
    it('returns a non-empty absolute string path in ESM context', async () => {
      const { resolveEsmDir } = await import('./utils.js');
      const result = resolveEsmDir();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(path.isAbsolute(result)).toBe(true);
    });
  });

  describe('resolveModuleDir', () => {
    it('returns a non-empty string directory path', async () => {
      const { resolveModuleDir } = await import('./utils.js');
      const result = resolveModuleDir();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns an absolute path', async () => {
      const { resolveModuleDir } = await import('./utils.js');
      const result = resolveModuleDir();
      expect(path.isAbsolute(result)).toBe(true);
    });
  });

  describe('startTimer', () => {
    it('returns a function that returns elapsed ms >= 0', async () => {
      const { startTimer } = await import('./utils.js');
      const elapsed = startTimer();
      const ms = elapsed();
      expect(typeof ms).toBe('number');
      expect(ms).toBeGreaterThanOrEqual(0);
    });

    it('elapsed increases over time', async () => {
      const { startTimer } = await import('./utils.js');
      const elapsed = startTimer();
      await new Promise(resolve => setTimeout(resolve, 10));
      const ms = elapsed();
      expect(ms).toBeGreaterThanOrEqual(1);
    });

    it('returns rounded integer', async () => {
      const { startTimer } = await import('./utils.js');
      const elapsed = startTimer();
      const ms = elapsed();
      expect(Number.isInteger(ms)).toBe(true);
    });
  });

  describe('estimateTokens', () => {
    it('returns a positive integer for non-empty string', async () => {
      const { estimateTokens } = await import('./utils.js');
      const result = estimateTokens('hello world');
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('returns 0 for empty string', async () => {
      const { estimateTokens } = await import('./utils.js');
      const result = estimateTokens('');
      expect(result).toBe(0);
    });

    it('approximates ~4 chars per token', async () => {
      const { estimateTokens } = await import('./utils.js');
      // 8 chars -> ceil(8/4) = 2
      expect(estimateTokens('12345678')).toBe(2);
      // 5 chars -> ceil(5/4) = 2
      expect(estimateTokens('12345')).toBe(2);
      // 4 chars -> ceil(4/4) = 1
      expect(estimateTokens('1234')).toBe(1);
    });

    it('uses ceiling division', async () => {
      const { estimateTokens } = await import('./utils.js');
      // 1 char -> ceil(1/4) = 1
      expect(estimateTokens('a')).toBe(1);
      // 12 chars -> ceil(12/4) = 3
      expect(estimateTokens('abcdefghijkl')).toBe(3);
    });

    it('handles longer text proportionally', async () => {
      const { estimateTokens } = await import('./utils.js');
      const text = 'a'.repeat(400);
      expect(estimateTokens(text)).toBe(100);
    });
  });
});
