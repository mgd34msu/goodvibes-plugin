/**
 * Unit tests for session-start hook
 *
 * Tests cover:
 * - Registry validation
 * - Cache directory creation
 * - Analytics initialization
 * - Error handling
 * - Response format
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

// Mock modules before importing
vi.mock('fs');

// Mock process.stdin and process.stdout
const mockStdin = {
  setEncoding: vi.fn(),
  on: vi.fn(),
};

const mockStdout = {
  write: vi.fn(),
};

const mockStderr = {
  write: vi.fn(),
};

const originalProcessStdin = process.stdin;
const originalProcessExit = process.exit;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('session-start hook', () => {
  let capturedOutput: string;
  let capturedExitCode: number | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOutput = '';
    capturedExitCode = undefined;

    // Mock console.log to capture output
    console.log = vi.fn((msg: string) => {
      capturedOutput = msg;
    });

    // Mock console.error for debug output
    console.error = vi.fn();

    // Mock process.exit
    process.exit = vi.fn((code?: number) => {
      capturedExitCode = code;
      throw new Error('process.exit called');
    }) as never;
  });

  afterEach(() => {
    process.exit = originalProcessExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    vi.resetModules();
  });

  describe('validateRegistries', () => {
    it('should return valid when all registries exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const { validateRegistries } = await import('../shared.js');
      const result = validateRegistries();

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should return invalid when registries are missing', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { validateRegistries } = await import('../shared.js');
      const result = validateRegistries();

      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
    });

    it('should identify specific missing registries', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('skills');
      });

      const { validateRegistries } = await import('../shared.js');
      const result = validateRegistries();

      expect(result.missing.some(m => m.includes('agents'))).toBe(true);
      expect(result.missing.some(m => m.includes('tools'))).toBe(true);
    });
  });

  describe('ensureCacheDir', () => {
    it('should create cache directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);

      const { ensureCacheDir } = await import('../shared.js');
      ensureCacheDir();

      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('should not create cache directory if it already exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const { ensureCacheDir } = await import('../shared.js');
      ensureCacheDir();

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('saveAnalytics', () => {
    it('should write analytics to file', async () => {
      const mockAnalytics = {
        session_id: 'test-session',
        started_at: '2025-01-01T00:00:00Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const { saveAnalytics } = await import('../shared.js');
      saveAnalytics(mockAnalytics);

      expect(fs.writeFileSync).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      expect(writeCall[1]).toContain('test-session');
    });

    it('should format analytics as JSON', async () => {
      const mockAnalytics = {
        session_id: 'test-session',
        started_at: '2025-01-01T00:00:00Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const { saveAnalytics } = await import('../shared.js');
      saveAnalytics(mockAnalytics);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenContent = writeCall[1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed.session_id).toBe('test-session');
    });
  });

  describe('response format', () => {
    it('should create response with continue true', async () => {
      const { allowTool } = await import('../shared.js');
      const response = allowTool('SessionStart', 'Test message');

      expect(response.continue).toBe(true);
      expect(response.systemMessage).toBe('Test message');
    });

    it('should include hookSpecificOutput', async () => {
      const { allowTool } = await import('../shared.js');
      const response = allowTool('SessionStart', 'Test message');

      expect(response.hookSpecificOutput).toBeDefined();
      expect(response.hookSpecificOutput?.hookEventName).toBe('SessionStart');
    });
  });
});
