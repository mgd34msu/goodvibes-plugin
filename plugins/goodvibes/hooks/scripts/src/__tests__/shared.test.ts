/**
 * Tests for shared hook utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
vi.mock('fs');

describe('shared utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  describe('loadAnalytics', () => {
    it('should return null if analytics file does not exist', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        // Cache dir exists but analytics file doesn't
        return pathStr.includes('.cache') && !pathStr.includes('analytics.json');
      });

      const { loadAnalytics } = await import('../shared.js');
      const result = loadAnalytics();

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

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockAnalytics));

      const { loadAnalytics } = await import('../shared.js');
      const result = loadAnalytics();

      expect(result).toEqual(mockAnalytics);
    });

    it('should return null if analytics file is invalid JSON', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

      const { loadAnalytics } = await import('../shared.js');
      const result = loadAnalytics();

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

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const { saveAnalytics } = await import('../shared.js');
      saveAnalytics(mockAnalytics);

      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('allowTool', () => {
    it('should return a response allowing the tool', async () => {
      const { allowTool } = await import('../shared.js');
      const result = allowTool('PreToolUse', 'Tool allowed');

      expect(result.continue).toBe(true);
      expect(result.systemMessage).toBe('Tool allowed');
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
    });
  });

  describe('blockTool', () => {
    it('should return a response blocking the tool', async () => {
      const { blockTool } = await import('../shared.js');
      const result = blockTool('PreToolUse', 'Tool blocked for security');

      expect(result.continue).toBe(false);
      expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
      expect(result.hookSpecificOutput?.permissionDecisionReason).toBe('Tool blocked for security');
    });
  });

  describe('fileExists', () => {
    it('should return true if file exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const { fileExists } = await import('../shared.js');
      const result = fileExists('test.txt');

      expect(result).toBe(true);
    });

    it('should return false if file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { fileExists } = await import('../shared.js');
      const result = fileExists('nonexistent.txt');

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

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockAnalytics));

      const { getSessionId } = await import('../shared.js');
      const result = getSessionId();

      expect(result).toBe('existing-session-123');
    });

    it('should generate new session ID if no analytics exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getSessionId } = await import('../shared.js');
      const result = getSessionId();

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

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockAnalytics));
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const { logToolUsage } = await import('../shared.js');
      logToolUsage({
        tool: 'search_skills',
        timestamp: new Date().toISOString(),
        success: true,
      });

      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });
});
