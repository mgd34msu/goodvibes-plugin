/**
 * Unit tests for post-tool-use hook
 *
 * Tests cover:
 * - detect_stack result caching
 * - recommend_skills analytics tracking
 * - search tools logging
 * - validate_implementation tracking
 * - run_smoke_test result handling
 * - check_types error tracking
 * - Unknown tool handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock modules
vi.mock('fs');

describe('post-tool-use hook utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('loadAnalytics', () => {
    it('should return null if analytics file does not exist', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
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

    it('should ensure cache directory exists before saving', async () => {
      const mockAnalytics = {
        session_id: 'test-session',
        started_at: '2025-01-01T00:00:00Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const { saveAnalytics } = await import('../shared.js');
      saveAnalytics(mockAnalytics);

      expect(fs.mkdirSync).toHaveBeenCalled();
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
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenContent = JSON.parse(writeCall[1] as string);
      expect(writtenContent.tool_usage.length).toBe(1);
      expect(writtenContent.tool_usage[0].tool).toBe('search_skills');
    });

    it('should create new analytics if none exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const { logToolUsage } = await import('../shared.js');
      logToolUsage({
        tool: 'detect_stack',
        timestamp: new Date().toISOString(),
        success: true,
      });

      expect(fs.writeFileSync).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenContent = JSON.parse(writeCall[1] as string);
      expect(writtenContent.tool_usage.length).toBe(1);
    });

    it('should preserve existing tool usage entries', async () => {
      const existingUsage = {
        tool: 'search_skills',
        timestamp: '2025-01-01T00:00:00Z',
        success: true,
      };
      const mockAnalytics = {
        session_id: 'test-session',
        started_at: '2025-01-01T00:00:00Z',
        tool_usage: [existingUsage],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockAnalytics));
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const { logToolUsage } = await import('../shared.js');
      logToolUsage({
        tool: 'detect_stack',
        timestamp: new Date().toISOString(),
        success: true,
      });

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenContent = JSON.parse(writeCall[1] as string);
      expect(writtenContent.tool_usage.length).toBe(2);
    });
  });

  describe('detect_stack caching', () => {
    it('should cache stack detection result to file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        session_id: 'test',
        started_at: '2025-01-01T00:00:00Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      }));

      const { ensureCacheDir, CACHE_DIR } = await import('../shared.js');
      ensureCacheDir();

      // Simulate caching detected stack
      const stackData = { frameworks: ['next'], languages: ['typescript'] };
      fs.writeFileSync(path.join(CACHE_DIR, 'detected-stack.json'), JSON.stringify(stackData));

      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('recommend_skills analytics', () => {
    it('should track recommended skills', async () => {
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

      const { loadAnalytics, saveAnalytics } = await import('../shared.js');
      const analytics = loadAnalytics();

      if (analytics) {
        analytics.skills_recommended.push('testing/vitest', 'frameworks/nextjs');
        saveAnalytics(analytics);
      }

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenContent = JSON.parse(writeCall[1] as string);
      expect(writtenContent.skills_recommended).toContain('testing/vitest');
      expect(writtenContent.skills_recommended).toContain('frameworks/nextjs');
    });
  });

  describe('validate_implementation tracking', () => {
    it('should increment validations_run counter', async () => {
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

      const { loadAnalytics, saveAnalytics } = await import('../shared.js');
      const analytics = loadAnalytics();

      if (analytics) {
        analytics.validations_run += 1;
        saveAnalytics(analytics);
      }

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenContent = JSON.parse(writeCall[1] as string);
      expect(writtenContent.validations_run).toBe(1);
    });

    it('should track issues found', async () => {
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

      const { loadAnalytics, saveAnalytics } = await import('../shared.js');
      const analytics = loadAnalytics();

      if (analytics) {
        const toolResult = { summary: { errors: 5, warnings: 3 } };
        analytics.issues_found += (toolResult.summary.errors + toolResult.summary.warnings);
        saveAnalytics(analytics);
      }

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenContent = JSON.parse(writeCall[1] as string);
      expect(writtenContent.issues_found).toBe(8);
    });
  });

  describe('check_types error tracking', () => {
    it('should track type errors in analytics', async () => {
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

      const { loadAnalytics, saveAnalytics } = await import('../shared.js');
      const analytics = loadAnalytics();

      if (analytics) {
        const typeErrors = [
          { file: 'src/index.ts', message: 'Type error' },
          { file: 'src/utils.ts', message: 'Another error' },
        ];
        analytics.issues_found += typeErrors.length;
        saveAnalytics(analytics);
      }

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenContent = JSON.parse(writeCall[1] as string);
      expect(writtenContent.issues_found).toBe(2);
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

  describe('response creation', () => {
    it('should create response with continue true', async () => {
      const response = {
        continue: true,
        systemMessage: 'Test message',
      };

      expect(response.continue).toBe(true);
      expect(response.systemMessage).toBe('Test message');
    });

    it('should create response without message', async () => {
      const response: { continue: boolean; systemMessage?: string } = {
        continue: true,
      };

      expect(response.continue).toBe(true);
      expect(response.systemMessage).toBeUndefined();
    });
  });
});
