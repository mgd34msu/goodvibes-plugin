/**
 * Tests for telemetry/records.ts
 *
 * Achieves 100% line and branch coverage for:
 * - ensureGoodVibesDirs: directory creation with lazy creation
 * - writeTelemetryRecord: writing records to monthly JSONL files
 * - createTelemetryRecord: creating telemetry records from agent data
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  ensureGoodVibesDirs,
  writeTelemetryRecord,
  createTelemetryRecord,
  type TelemetryRecord,
} from '../../telemetry/records.js';

import type { ActiveAgentEntry } from '../../telemetry/agents.js';
import type { ParsedTranscript } from '../../telemetry/transcript.js';

// Mock the shared module
vi.mock('../../shared/index.js', async () => {
  return {
    debug: vi.fn(),
    logError: vi.fn(),
    fileExists: vi.fn(),
  };
});

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
  appendFile: vi.fn(),
}));

// Get mock references
const mockedFs = vi.mocked(fs);

describe('telemetry/records', () => {
  let mockFileExists: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mocked fileExists function
    const shared = await import('../../shared/index.js');
    mockFileExists = vi.mocked(shared.fileExists);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ensureGoodVibesDirs', () => {
    it('should create all directories when none exist', async () => {
      mockFileExists.mockResolvedValue(false);
      mockedFs.mkdir.mockResolvedValue(undefined);

      await ensureGoodVibesDirs('/project/.goodvibes', 'state', 'telemetry');

      // Should check existence for all 3 directories
      expect(mockFileExists).toHaveBeenCalledTimes(3);
      expect(mockFileExists).toHaveBeenCalledWith('/project/.goodvibes');
      expect(mockFileExists).toHaveBeenCalledWith(
        path.join('/project/.goodvibes', 'state')
      );
      expect(mockFileExists).toHaveBeenCalledWith(
        path.join('/project/.goodvibes', 'telemetry')
      );

      // Should create all 3 directories
      expect(mockedFs.mkdir).toHaveBeenCalledTimes(3);
      expect(mockedFs.mkdir).toHaveBeenCalledWith('/project/.goodvibes', {
        recursive: true,
      });
      expect(mockedFs.mkdir).toHaveBeenCalledWith(
        path.join('/project/.goodvibes', 'state'),
        { recursive: true }
      );
      expect(mockedFs.mkdir).toHaveBeenCalledWith(
        path.join('/project/.goodvibes', 'telemetry'),
        { recursive: true }
      );
    });

    it('should skip creating directories that already exist', async () => {
      // First dir exists, others don't
      mockFileExists
        .mockResolvedValueOnce(true) // goodvibes dir exists
        .mockResolvedValueOnce(false) // state dir doesn't exist
        .mockResolvedValueOnce(true); // telemetry dir exists

      mockedFs.mkdir.mockResolvedValue(undefined);

      await ensureGoodVibesDirs('/project/.goodvibes', 'state', 'telemetry');

      // Should check all 3 directories
      expect(mockFileExists).toHaveBeenCalledTimes(3);

      // Should only create the state directory (the one that doesn't exist)
      expect(mockedFs.mkdir).toHaveBeenCalledTimes(1);
      expect(mockedFs.mkdir).toHaveBeenCalledWith(
        path.join('/project/.goodvibes', 'state'),
        { recursive: true }
      );
    });

    it('should not create any directories when all exist', async () => {
      mockFileExists.mockResolvedValue(true);

      await ensureGoodVibesDirs('/project/.goodvibes', 'state', 'telemetry');

      // Should check all 3 directories
      expect(mockFileExists).toHaveBeenCalledTimes(3);

      // Should not create any directories
      expect(mockedFs.mkdir).not.toHaveBeenCalled();
    });
  });

  describe('writeTelemetryRecord', () => {
    it('should write record to monthly JSONL file', async () => {
      mockedFs.appendFile.mockResolvedValue(undefined);

      const record: TelemetryRecord = {
        type: 'subagent_complete',
        agent_id: 'agent-123',
        agent_type: 'test-engineer',
        session_id: 'session-456',
        project_name: 'my-project',
        started_at: '2025-01-01T00:00:00Z',
        ended_at: '2025-01-01T01:00:00Z',
        duration_ms: 3600000,
        cwd: '/workspace/project',
        files_modified: ['/src/file.ts'],
        tools_used: ['Write', 'Read'],
        keywords: ['typescript'],
        success: true,
      };

      await writeTelemetryRecord('/project/.goodvibes/telemetry', record);

      // Verify appendFile was called with correct arguments
      expect(mockedFs.appendFile).toHaveBeenCalledTimes(1);

      const [filePath, content] = mockedFs.appendFile.mock.calls[0];

      // File path should be in format YYYY-MM.jsonl
      const now = new Date();
      const expectedFileName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.jsonl`;
      expect(filePath).toBe(
        path.join('/project/.goodvibes/telemetry', expectedFileName)
      );

      // Content should be JSON + newline
      expect(content).toBe(JSON.stringify(record) + '\n');
    });

    it('should include optional fields when present', async () => {
      mockedFs.appendFile.mockResolvedValue(undefined);

      const record: TelemetryRecord = {
        type: 'subagent_complete',
        agent_id: 'agent-full',
        agent_type: 'backend-engineer',
        session_id: 'session-full',
        project_name: 'full-project',
        started_at: '2025-01-01T00:00:00Z',
        ended_at: '2025-01-01T02:00:00Z',
        duration_ms: 7200000,
        cwd: '/workspace',
        git_branch: 'feature/new-api',
        git_commit: 'abc1234',
        task_description: 'Implement REST endpoint',
        files_modified: ['/src/api.ts'],
        tools_used: ['Write', 'Bash'],
        keywords: ['api', 'rest'],
        success: true,
        final_summary: 'Successfully implemented the endpoint',
      };

      await writeTelemetryRecord('/telemetry', record);

      expect(mockedFs.appendFile).toHaveBeenCalledTimes(1);
      const [, content] = mockedFs.appendFile.mock.calls[0];

      // Parse to verify all fields are present
      const parsed = JSON.parse((content as string).trim());
      expect(parsed.git_branch).toBe('feature/new-api');
      expect(parsed.git_commit).toBe('abc1234');
      expect(parsed.task_description).toBe('Implement REST endpoint');
      expect(parsed.final_summary).toBe(
        'Successfully implemented the endpoint'
      );
    });
  });

  describe('createTelemetryRecord', () => {
    const baseStartEntry: ActiveAgentEntry = {
      agent_id: 'agent-test',
      agent_type: 'test-engineer',
      session_id: 'session-test',
      cwd: '/workspace/project',
      project_name: 'test-project',
      started_at: '2025-01-01T00:00:00Z',
    };

    const baseParsedTranscript: ParsedTranscript = {
      files_modified: [],
      tools_used: [],
      error_count: 0,
      success_indicators: [],
    };

    it('should create record with all required fields', () => {
      const record = createTelemetryRecord(
        baseStartEntry,
        baseParsedTranscript,
        ['typescript']
      );

      expect(record.type).toBe('subagent_complete');
      expect(record.agent_id).toBe('agent-test');
      expect(record.agent_type).toBe('test-engineer');
      expect(record.session_id).toBe('session-test');
      expect(record.project_name).toBe('test-project');
      expect(record.started_at).toBe('2025-01-01T00:00:00Z');
      expect(record.ended_at).toBeDefined();
      expect(record.duration_ms).toBeGreaterThan(0);
      expect(record.cwd).toBe('/workspace/project');
      expect(record.files_modified).toEqual([]);
      expect(record.tools_used).toEqual([]);
      expect(record.keywords).toEqual(['typescript']);
    });

    it('should include optional git fields when present', () => {
      const entryWithGit: ActiveAgentEntry = {
        ...baseStartEntry,
        git_branch: 'main',
        git_commit: 'def5678',
        task_description: 'Write unit tests',
      };

      const record = createTelemetryRecord(
        entryWithGit,
        baseParsedTranscript,
        []
      );

      expect(record.git_branch).toBe('main');
      expect(record.git_commit).toBe('def5678');
      expect(record.task_description).toBe('Write unit tests');
    });

    it('should include files_modified and tools_used from transcript', () => {
      const transcriptWithData: ParsedTranscript = {
        files_modified: ['/src/test.ts', '/src/utils.ts'],
        tools_used: ['Write', 'Read', 'Bash'],
        error_count: 0,
        success_indicators: [],
      };

      const record = createTelemetryRecord(
        baseStartEntry,
        transcriptWithData,
        []
      );

      expect(record.files_modified).toEqual(['/src/test.ts', '/src/utils.ts']);
      expect(record.tools_used).toEqual(['Write', 'Read', 'Bash']);
    });

    it('should include final_summary from transcript', () => {
      const transcriptWithOutput: ParsedTranscript = {
        ...baseParsedTranscript,
        final_output: 'All tests passed successfully',
      };

      const record = createTelemetryRecord(
        baseStartEntry,
        transcriptWithOutput,
        []
      );

      expect(record.final_summary).toBe('All tests passed successfully');
    });

    it('should mark success as true when error_count is 0', () => {
      const transcript: ParsedTranscript = {
        ...baseParsedTranscript,
        error_count: 0,
        success_indicators: [],
      };

      const record = createTelemetryRecord(baseStartEntry, transcript, []);

      expect(record.success).toBe(true);
    });

    it('should mark success as false when error_count > 0 and no success indicators', () => {
      const transcript: ParsedTranscript = {
        ...baseParsedTranscript,
        error_count: 3,
        success_indicators: [],
      };

      const record = createTelemetryRecord(baseStartEntry, transcript, []);

      expect(record.success).toBe(false);
    });

    it('should mark success as true when error_count > 0 but success indicators present', () => {
      const transcript: ParsedTranscript = {
        ...baseParsedTranscript,
        error_count: 2,
        success_indicators: ['Task completed successfully'],
      };

      const record = createTelemetryRecord(baseStartEntry, transcript, []);

      expect(record.success).toBe(true);
    });

    it('should calculate duration from started_at to current time', () => {
      // Use a fixed time in the past
      const pastTime = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
      const entry: ActiveAgentEntry = {
        ...baseStartEntry,
        started_at: pastTime,
      };

      const record = createTelemetryRecord(entry, baseParsedTranscript, []);

      // Duration should be approximately 60000ms (1 minute)
      // Allow some tolerance for test execution time
      expect(record.duration_ms).toBeGreaterThanOrEqual(59000);
      expect(record.duration_ms).toBeLessThan(120000);
    });

    it('should handle empty keywords array', () => {
      const record = createTelemetryRecord(
        baseStartEntry,
        baseParsedTranscript,
        []
      );

      expect(record.keywords).toEqual([]);
    });

    it('should preserve multiple keywords', () => {
      const keywords = ['typescript', 'testing', 'vitest', 'react'];
      const record = createTelemetryRecord(
        baseStartEntry,
        baseParsedTranscript,
        keywords
      );

      expect(record.keywords).toEqual(keywords);
    });
  });
});
