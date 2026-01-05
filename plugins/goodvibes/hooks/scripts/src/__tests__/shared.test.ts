/**
 * Tests for shared hook utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises module
const mockAccess = vi.fn();
const mockMkdir = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();

vi.mock('fs/promises', () => ({
  access: mockAccess,
  mkdir: mockMkdir,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}));

describe('shared utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('STDIN_TIMEOUT_MS', () => {
    const originalEnv = process.env.GOODVIBES_STDIN_TIMEOUT_MS;

    afterEach(() => {
      // Restore original environment variable
      if (originalEnv !== undefined) {
        process.env.GOODVIBES_STDIN_TIMEOUT_MS = originalEnv;
      } else {
        delete process.env.GOODVIBES_STDIN_TIMEOUT_MS;
      }
      vi.resetModules();
    });

    it('should use default value of 100ms when env var not set', async () => {
      delete process.env.GOODVIBES_STDIN_TIMEOUT_MS;
      vi.resetModules();

      const { STDIN_TIMEOUT_MS } = await import('../shared/index.js');
      expect(STDIN_TIMEOUT_MS).toBe(100);
    });

    it('should use custom value from GOODVIBES_STDIN_TIMEOUT_MS env var', async () => {
      process.env.GOODVIBES_STDIN_TIMEOUT_MS = '500';
      vi.resetModules();

      const { STDIN_TIMEOUT_MS } = await import('../shared/index.js');
      expect(STDIN_TIMEOUT_MS).toBe(500);
    });

    it('should handle custom timeout of 0', async () => {
      process.env.GOODVIBES_STDIN_TIMEOUT_MS = '0';
      vi.resetModules();

      const { STDIN_TIMEOUT_MS } = await import('../shared/index.js');
      expect(STDIN_TIMEOUT_MS).toBe(0);
    });

    it('should handle large timeout values', async () => {
      process.env.GOODVIBES_STDIN_TIMEOUT_MS = '10000';
      vi.resetModules();

      const { STDIN_TIMEOUT_MS } = await import('../shared/index.js');
      expect(STDIN_TIMEOUT_MS).toBe(10000);
    });
  });

  describe('validateRegistries', () => {
    it('should return valid when all registries exist', async () => {
      mockAccess.mockResolvedValue(undefined);

      const { validateRegistries } = await import('../shared/index.js');
      const result = await validateRegistries();

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should return invalid when registries are missing', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const { validateRegistries } = await import('../shared/index.js');
      const result = await validateRegistries();

      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
    });
  });

  describe('ensureCacheDir', () => {
    it('should create cache directory if it does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockMkdir.mockResolvedValue(undefined);

      const { ensureCacheDir } = await import('../shared/index.js');
      await ensureCacheDir();

      expect(mockMkdir).toHaveBeenCalled();
    });

    it('should not create cache directory if it already exists', async () => {
      mockAccess.mockResolvedValue(undefined);

      const { ensureCacheDir } = await import('../shared/index.js');
      await ensureCacheDir();

      expect(mockMkdir).not.toHaveBeenCalled();
    });
  });

  describe('loadAnalytics', () => {
    it('should return null if analytics file does not exist', async () => {
      mockAccess.mockImplementation((p: string) => {
        const pathStr = String(p);
        // Cache dir exists but analytics file doesn't
        if (pathStr.includes('analytics.json')) {
          return Promise.reject(new Error('ENOENT'));
        }
        return Promise.resolve(undefined);
      });

      const { loadAnalytics } = await import('../shared/index.js');
      const result = await loadAnalytics();

      expect(result).toBeNull();
    });

    it('should return parsed analytics if file exists', async () => {
      const mockAnalytics = {
        session_id: 'test-session',
        started_at: '2025-01-01T00:00:00Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(mockAnalytics));

      const { loadAnalytics } = await import('../shared/index.js');
      const result = await loadAnalytics();

      expect(result).toEqual(mockAnalytics);
    });

    it('should return null if analytics file is invalid JSON', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('invalid json');

      const { loadAnalytics } = await import('../shared/index.js');
      const result = await loadAnalytics();

      expect(result).toBeNull();
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

      mockAccess.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const { saveAnalytics } = await import('../shared/index.js');
      await saveAnalytics(mockAnalytics);

      expect(mockWriteFile).toHaveBeenCalled();
    });
  });

  describe('allowTool', () => {
    it('should return a response allowing the tool', async () => {
      const { allowTool } = await import('../shared/index.js');
      const result = allowTool('PreToolUse', 'Tool allowed');

      expect(result.continue).toBe(true);
      expect(result.systemMessage).toBe('Tool allowed');
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
    });
  });

  describe('blockTool', () => {
    it('should return a response blocking the tool', async () => {
      const { blockTool } = await import('../shared/index.js');
      const result = blockTool('PreToolUse', 'Tool blocked for security');

      expect(result.continue).toBe(false);
      expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
      expect(result.hookSpecificOutput?.permissionDecisionReason).toBe('Tool blocked for security');
    });
  });

  describe('fileExists', () => {
    it('should return true if file exists', async () => {
      mockAccess.mockResolvedValue(undefined);

      const { fileExists } = await import('../shared/index.js');
      const result = await fileExists('test.txt');

      expect(result).toBe(true);
    });

    it('should return false if file does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const { fileExists } = await import('../shared/index.js');
      const result = await fileExists('nonexistent.txt');

      expect(result).toBe(false);
    });
  });

  describe('getSessionId', () => {
    it('should return existing session ID from analytics', async () => {
      const mockAnalytics = {
        session_id: 'existing-session-123',
        started_at: '2025-01-01T00:00:00Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(mockAnalytics));

      const { getSessionId } = await import('../shared/index.js');
      const result = await getSessionId();

      expect(result).toBe('existing-session-123');
    });

    it('should generate new session ID if no analytics exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockMkdir.mockResolvedValue(undefined);

      const { getSessionId } = await import('../shared/index.js');
      const result = await getSessionId();

      expect(result).toMatch(/^session_\d+$/);
    });
  });

  describe('logToolUsage', () => {
    it('should add tool usage to analytics', async () => {
      const mockAnalytics = {
        session_id: 'test-session',
        started_at: '2025-01-01T00:00:00Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(mockAnalytics));
      mockWriteFile.mockResolvedValue(undefined);

      const { logToolUsage } = await import('../shared/index.js');
      await logToolUsage({
        tool: 'search_skills',
        timestamp: new Date().toISOString(),
        success: true,
      });

      expect(mockWriteFile).toHaveBeenCalled();
    });
  });
});
