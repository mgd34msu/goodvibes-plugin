/**
 * Tests for shared/analytics.ts
 * Target: 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import {
  ensureCacheDir,
  loadAnalytics,
  saveAnalytics,
  getSessionId,
  logToolUsage,
  type SessionAnalytics,
  type ToolUsage,
} from '../../shared/analytics.js';
import * as fileUtils from '../../shared/file-utils.js';
import { CACHE_DIR, ANALYTICS_FILE } from '../../shared/constants.js';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('../../shared/file-utils.js');
vi.mock('../../shared/logging.js', () => ({
  debug: vi.fn(),
}));

describe('analytics', () => {
  const mockFileExists = vi.mocked(fileUtils.fileExists);
  const mockMkdir = vi.mocked(fs.mkdir);
  const mockReadFile = vi.mocked(fs.readFile);
  const mockWriteFile = vi.mocked(fs.writeFile);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('ensureCacheDir', () => {
    it('should create cache directory when it does not exist', async () => {
      mockFileExists.mockResolvedValue(false);
      mockMkdir.mockResolvedValue(undefined);

      await ensureCacheDir();

      expect(mockFileExists).toHaveBeenCalledWith(CACHE_DIR);
      expect(mockMkdir).toHaveBeenCalledWith(CACHE_DIR, { recursive: true });
    });

    it('should not create cache directory when it already exists', async () => {
      mockFileExists.mockResolvedValue(true);

      await ensureCacheDir();

      expect(mockFileExists).toHaveBeenCalledWith(CACHE_DIR);
      expect(mockMkdir).not.toHaveBeenCalled();
    });
  });

  describe('loadAnalytics', () => {
    const mockAnalytics: SessionAnalytics = {
      session_id: 'session_123456789',
      started_at: '2025-01-05T10:00:00.000Z',
      tool_usage: [],
      skills_recommended: [],
      validations_run: 0,
      issues_found: 0,
    };

    it('should return parsed analytics when file exists and is valid JSON', async () => {
      // First call for ensureCacheDir, second for file check
      mockFileExists
        .mockResolvedValueOnce(true) // cache dir exists
        .mockResolvedValueOnce(true); // analytics file exists
      mockReadFile.mockResolvedValue(JSON.stringify(mockAnalytics));

      const result = await loadAnalytics();

      expect(result).toEqual(mockAnalytics);
      expect(mockReadFile).toHaveBeenCalledWith(ANALYTICS_FILE, 'utf-8');
    });

    it('should return null when analytics file does not exist', async () => {
      mockFileExists
        .mockResolvedValueOnce(true) // cache dir exists
        .mockResolvedValueOnce(false); // analytics file does not exist

      const result = await loadAnalytics();

      expect(result).toBeNull();
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('should return null when JSON parsing fails', async () => {
      mockFileExists
        .mockResolvedValueOnce(true) // cache dir exists
        .mockResolvedValueOnce(true); // analytics file exists
      mockReadFile.mockResolvedValue('invalid json {{{');

      const result = await loadAnalytics();

      expect(result).toBeNull();
    });

    it('should return null when file read throws an error', async () => {
      mockFileExists
        .mockResolvedValueOnce(true) // cache dir exists
        .mockResolvedValueOnce(true); // analytics file exists
      mockReadFile.mockRejectedValue(new Error('Read error'));

      const result = await loadAnalytics();

      expect(result).toBeNull();
    });

    it('should ensure cache directory exists before checking analytics file', async () => {
      mockFileExists
        .mockResolvedValueOnce(false) // cache dir does not exist
        .mockResolvedValueOnce(false); // analytics file does not exist
      mockMkdir.mockResolvedValue(undefined);

      await loadAnalytics();

      expect(mockMkdir).toHaveBeenCalledWith(CACHE_DIR, { recursive: true });
    });
  });

  describe('saveAnalytics', () => {
    const mockAnalytics: SessionAnalytics = {
      session_id: 'session_123456789',
      started_at: '2025-01-05T10:00:00.000Z',
      tool_usage: [],
      skills_recommended: [],
      validations_run: 0,
      issues_found: 0,
    };

    it('should write analytics to file with proper formatting', async () => {
      mockFileExists.mockResolvedValue(true); // cache dir exists
      mockWriteFile.mockResolvedValue(undefined);

      await saveAnalytics(mockAnalytics);

      expect(mockWriteFile).toHaveBeenCalledWith(
        ANALYTICS_FILE,
        JSON.stringify(mockAnalytics, null, 2)
      );
    });

    it('should ensure cache directory exists before writing', async () => {
      mockFileExists.mockResolvedValue(false); // cache dir does not exist
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await saveAnalytics(mockAnalytics);

      expect(mockMkdir).toHaveBeenCalledWith(CACHE_DIR, { recursive: true });
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should save analytics with all optional fields', async () => {
      const fullAnalytics: SessionAnalytics = {
        session_id: 'session_full',
        started_at: '2025-01-05T10:00:00.000Z',
        ended_at: '2025-01-05T11:00:00.000Z',
        tool_usage: [
          {
            tool: 'Bash',
            timestamp: '2025-01-05T10:30:00.000Z',
            duration_ms: 1500,
            success: true,
            args: { command: 'npm test' },
          },
        ],
        tool_failures: [
          {
            tool: 'Edit',
            error: 'File not found',
            timestamp: '2025-01-05T10:35:00.000Z',
          },
        ],
        skills_recommended: ['vitest', 'playwright'],
        subagents_spawned: [
          {
            type: 'test-engineer',
            task: 'Write unit tests',
            started_at: '2025-01-05T10:40:00.000Z',
            completed_at: '2025-01-05T10:45:00.000Z',
            success: true,
          },
        ],
        validations_run: 5,
        issues_found: 2,
        detected_stack: { framework: 'react', language: 'typescript' },
      };

      mockFileExists.mockResolvedValue(true);
      mockWriteFile.mockResolvedValue(undefined);

      await saveAnalytics(fullAnalytics);

      expect(mockWriteFile).toHaveBeenCalledWith(
        ANALYTICS_FILE,
        JSON.stringify(fullAnalytics, null, 2)
      );
    });
  });

  describe('getSessionId', () => {
    it('should return existing session ID when analytics exists', async () => {
      const mockAnalytics: SessionAnalytics = {
        session_id: 'session_existing',
        started_at: '2025-01-05T10:00:00.000Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      mockFileExists
        .mockResolvedValueOnce(true) // cache dir exists
        .mockResolvedValueOnce(true); // analytics file exists
      mockReadFile.mockResolvedValue(JSON.stringify(mockAnalytics));

      const result = await getSessionId();

      expect(result).toBe('session_existing');
    });

    it('should generate new session ID when analytics does not exist', async () => {
      mockFileExists
        .mockResolvedValueOnce(true) // cache dir exists
        .mockResolvedValueOnce(false); // analytics file does not exist

      const mockNow = 1704456000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const result = await getSessionId();

      expect(result).toBe(`session_${mockNow}`);
    });

    it('should generate new session ID when analytics has no session_id', async () => {
      // Simulate analytics without session_id (edge case)
      const malformedAnalytics = {
        started_at: '2025-01-05T10:00:00.000Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      mockFileExists
        .mockResolvedValueOnce(true) // cache dir exists
        .mockResolvedValueOnce(true); // analytics file exists
      mockReadFile.mockResolvedValue(JSON.stringify(malformedAnalytics));

      const mockNow = 1704456000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const result = await getSessionId();

      expect(result).toBe(`session_${mockNow}`);
    });

    it('should generate new session ID when loadAnalytics returns null', async () => {
      mockFileExists
        .mockResolvedValueOnce(true) // cache dir exists
        .mockResolvedValueOnce(true); // analytics file exists
      mockReadFile.mockResolvedValue('invalid json');

      const mockNow = 1704456000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const result = await getSessionId();

      expect(result).toBe(`session_${mockNow}`);
    });
  });

  describe('logToolUsage', () => {
    const mockUsage: ToolUsage = {
      tool: 'Bash',
      timestamp: '2025-01-05T10:30:00.000Z',
      duration_ms: 1500,
      success: true,
      args: { command: 'npm test' },
    };

    it('should append usage to existing analytics', async () => {
      const existingAnalytics: SessionAnalytics = {
        session_id: 'session_existing',
        started_at: '2025-01-05T10:00:00.000Z',
        tool_usage: [
          {
            tool: 'Read',
            timestamp: '2025-01-05T10:15:00.000Z',
            success: true,
          },
        ],
        skills_recommended: ['vitest'],
        validations_run: 1,
        issues_found: 0,
      };

      mockFileExists
        .mockResolvedValueOnce(true) // ensureCacheDir for loadAnalytics
        .mockResolvedValueOnce(true) // analytics file exists
        .mockResolvedValueOnce(true); // ensureCacheDir for saveAnalytics
      mockReadFile.mockResolvedValue(JSON.stringify(existingAnalytics));
      mockWriteFile.mockResolvedValue(undefined);

      await logToolUsage(mockUsage);

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const savedData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(savedData.tool_usage).toHaveLength(2);
      expect(savedData.tool_usage[1]).toEqual(mockUsage);
      expect(savedData.session_id).toBe('session_existing');
    });

    it('should create new analytics when none exists', async () => {
      mockFileExists
        .mockResolvedValueOnce(true) // ensureCacheDir for loadAnalytics
        .mockResolvedValueOnce(false) // analytics file does not exist
        .mockResolvedValueOnce(true) // ensureCacheDir for getSessionId
        .mockResolvedValueOnce(false) // analytics file for getSessionId
        .mockResolvedValueOnce(true); // ensureCacheDir for saveAnalytics
      mockWriteFile.mockResolvedValue(undefined);

      const mockNow = 1704456000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);
      vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(
        '2025-01-05T12:00:00.000Z'
      );

      await logToolUsage(mockUsage);

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const savedData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(savedData.session_id).toBe(`session_${mockNow}`);
      expect(savedData.started_at).toBe('2025-01-05T12:00:00.000Z');
      expect(savedData.tool_usage).toHaveLength(1);
      expect(savedData.tool_usage[0]).toEqual(mockUsage);
      expect(savedData.skills_recommended).toEqual([]);
      expect(savedData.validations_run).toBe(0);
      expect(savedData.issues_found).toBe(0);
    });

    it('should handle usage without optional fields', async () => {
      const minimalUsage: ToolUsage = {
        tool: 'Read',
        timestamp: '2025-01-05T10:30:00.000Z',
        success: false,
      };

      mockFileExists
        .mockResolvedValueOnce(true) // ensureCacheDir for loadAnalytics
        .mockResolvedValueOnce(false) // analytics file does not exist
        .mockResolvedValueOnce(true) // ensureCacheDir for getSessionId
        .mockResolvedValueOnce(false) // analytics file for getSessionId
        .mockResolvedValueOnce(true); // ensureCacheDir for saveAnalytics
      mockWriteFile.mockResolvedValue(undefined);

      const mockNow = 1704456000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);
      vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(
        '2025-01-05T12:00:00.000Z'
      );

      await logToolUsage(minimalUsage);

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const savedData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(savedData.tool_usage[0]).toEqual(minimalUsage);
      expect(savedData.tool_usage[0].duration_ms).toBeUndefined();
      expect(savedData.tool_usage[0].args).toBeUndefined();
    });

    it('should preserve existing analytics properties when appending usage', async () => {
      const existingAnalytics: SessionAnalytics = {
        session_id: 'session_preserve',
        started_at: '2025-01-05T09:00:00.000Z',
        ended_at: '2025-01-05T10:00:00.000Z',
        tool_usage: [],
        tool_failures: [
          {
            tool: 'Write',
            error: 'Permission denied',
            timestamp: '2025-01-05T09:30:00.000Z',
          },
        ],
        skills_recommended: ['playwright', 'vitest'],
        subagents_spawned: [
          {
            type: 'test-engineer',
            task: 'Write tests',
            started_at: '2025-01-05T09:15:00.000Z',
          },
        ],
        validations_run: 3,
        issues_found: 1,
        detected_stack: { framework: 'next', runtime: 'node' },
      };

      mockFileExists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);
      mockReadFile.mockResolvedValue(JSON.stringify(existingAnalytics));
      mockWriteFile.mockResolvedValue(undefined);

      await logToolUsage(mockUsage);

      const savedData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(savedData.ended_at).toBe('2025-01-05T10:00:00.000Z');
      expect(savedData.tool_failures).toEqual(existingAnalytics.tool_failures);
      expect(savedData.skills_recommended).toEqual(['playwright', 'vitest']);
      expect(savedData.subagents_spawned).toEqual(
        existingAnalytics.subagents_spawned
      );
      expect(savedData.validations_run).toBe(3);
      expect(savedData.issues_found).toBe(1);
      expect(savedData.detected_stack).toEqual({
        framework: 'next',
        runtime: 'node',
      });
    });
  });

  describe('type exports', () => {
    it('should allow creating valid ToolUsage objects', () => {
      const usage: ToolUsage = {
        tool: 'Bash',
        timestamp: new Date().toISOString(),
        success: true,
      };
      expect(usage.tool).toBe('Bash');
    });

    it('should allow creating ToolUsage with all optional fields', () => {
      const usage: ToolUsage = {
        tool: 'Bash',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: true,
        args: { command: 'ls' },
      };
      expect(usage.duration_ms).toBe(100);
      expect(usage.args).toEqual({ command: 'ls' });
    });
  });
});
