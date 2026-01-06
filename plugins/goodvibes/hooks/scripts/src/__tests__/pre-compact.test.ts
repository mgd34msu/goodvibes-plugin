/**
 * Unit tests for pre-compact.ts hook
 *
 * Tests cover:
 * - generateSessionSummary function with various input combinations
 * - runPreCompactHook main flow with all data present
 * - Handling when input.cwd is undefined (uses process.cwd())
 * - Handling when transcript_path is missing or file doesn't exist
 * - Handling when analytics is null
 * - Error handling in main catch block
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises module
const mockWriteFile = vi.fn();

vi.mock('fs/promises', () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

// Mock shared module
const mockRespond = vi.fn();
const mockReadHookInput = vi.fn();
const mockLoadAnalytics = vi.fn();
const mockDebug = vi.fn();
const mockLogError = vi.fn();
const mockCreateResponse = vi.fn((opts) => ({
  continue: true,
  systemMessage: opts?.systemMessage,
}));
const mockParseTranscript = vi.fn();
const mockFileExists = vi.fn();
const mockCACHE_DIR = '/mock/cache/dir';

vi.mock('../shared/index.js', () => ({
  respond: (...args: unknown[]) => mockRespond(...args),
  readHookInput: () => mockReadHookInput(),
  loadAnalytics: () => mockLoadAnalytics(),
  debug: (...args: unknown[]) => mockDebug(...args),
  logError: (...args: unknown[]) => mockLogError(...args),
  createResponse: (...args: unknown[]) => mockCreateResponse(...args),
  parseTranscript: (...args: unknown[]) => mockParseTranscript(...args),
  fileExists: (...args: unknown[]) => mockFileExists(...args),
  CACHE_DIR: mockCACHE_DIR,
}));

// Mock state module
const mockLoadState = vi.fn();

vi.mock('../state.js', () => ({
  loadState: (...args: unknown[]) => mockLoadState(...args),
}));

// Mock pre-compact/index module
const mockCreatePreCompactCheckpoint = vi.fn();
const mockSaveSessionSummary = vi.fn();
const mockGetFilesModifiedThisSession = vi.fn();

vi.mock('../pre-compact/index.js', () => ({
  createPreCompactCheckpoint: (...args: unknown[]) => mockCreatePreCompactCheckpoint(...args),
  saveSessionSummary: (...args: unknown[]) => mockSaveSessionSummary(...args),
  getFilesModifiedThisSession: (...args: unknown[]) => mockGetFilesModifiedThisSession(...args),
}));

describe('pre-compact hook', () => {
  const originalProcessCwd = process.cwd;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Mock process.cwd
    process.cwd = vi.fn(() => '/default/cwd');

    // Default mock implementations
    mockReadHookInput.mockResolvedValue({
      hook_event_name: 'PreCompact',
      cwd: '/test/project',
      transcript_path: '/test/transcript.json',
    });

    mockLoadState.mockResolvedValue({
      session_id: 'test-session',
      started_at: new Date().toISOString(),
      git: { branch: 'main' },
      files: { modifiedThisSession: [], createdThisSession: [] },
      automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
    });

    mockLoadAnalytics.mockResolvedValue({
      session_id: 'test-session-123',
      started_at: '2025-01-15T12:00:00Z',
      tool_usage: [{ tool: 'Bash', timestamp: '2025-01-15T12:00:00Z', success: true }],
      skills_recommended: [],
      validations_run: 5,
      issues_found: 2,
    });

    mockGetFilesModifiedThisSession.mockReturnValue([]);
    mockCreatePreCompactCheckpoint.mockResolvedValue(undefined);
    mockSaveSessionSummary.mockResolvedValue(undefined);
    mockFileExists.mockResolvedValue(false);
    mockParseTranscript.mockResolvedValue({ summary: '' });
    mockWriteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.cwd = originalProcessCwd;
    vi.resetModules();
  });

  describe('runPreCompactHook', () => {
    it('should complete successful hook execution with all data present', async () => {
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'test-session-123',
        started_at: '2025-01-15T12:00:00Z',
        tool_usage: [{ tool: 'Bash', timestamp: '2025-01-15T12:00:00Z', success: true }],
        skills_recommended: ['typescript', 'react'],
        validations_run: 5,
        issues_found: 2,
      });

      mockGetFilesModifiedThisSession.mockReturnValue(['/src/file1.ts', '/src/file2.ts']);
      mockFileExists.mockResolvedValue(true);
      mockParseTranscript.mockResolvedValue({ summary: 'Working on feature X' });

      await import('../pre-compact.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      // Verify initialization
      expect(mockDebug).toHaveBeenCalledWith('PreCompact hook starting');
      expect(mockReadHookInput).toHaveBeenCalled();
      expect(mockDebug).toHaveBeenCalledWith('PreCompact received input', {
        hook_event_name: 'PreCompact',
      });

      // Verify checkpoint creation
      expect(mockCreatePreCompactCheckpoint).toHaveBeenCalledWith('/test/project');

      // Verify state and analytics loading
      expect(mockLoadState).toHaveBeenCalledWith('/test/project');
      expect(mockLoadAnalytics).toHaveBeenCalled();
      expect(mockGetFilesModifiedThisSession).toHaveBeenCalled();

      // Verify transcript parsing
      expect(mockFileExists).toHaveBeenCalledWith('/test/transcript.json');
      expect(mockParseTranscript).toHaveBeenCalledWith('/test/transcript.json');

      // Verify session summary saving
      expect(mockSaveSessionSummary).toHaveBeenCalledWith(
        '/test/project',
        expect.stringContaining('Session ID: test-session-123')
      );

      // Verify analytics backup was created (use path.join for cross-platform compatibility)
      expect(mockWriteFile).toHaveBeenCalled();
      const writeCall = mockWriteFile.mock.calls[0];
      expect(writeCall[0]).toContain('pre-compact-backup.json');
      expect(writeCall[1]).toContain('test-session-123');

      // Verify debug log for backup (path format varies by OS)
      expect(mockDebug).toHaveBeenCalledWith(
        expect.stringContaining('Saved pre-compact backup to')
      );

      // Verify response
      expect(mockCreateResponse).toHaveBeenCalled();
      expect(mockRespond).toHaveBeenCalled();
    });

    it('should use process.cwd() when input.cwd is undefined', async () => {
      mockReadHookInput.mockResolvedValue({
        hook_event_name: 'PreCompact',
        cwd: undefined,
        transcript_path: '/test/transcript.json',
      });

      await import('../pre-compact.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      // Should use process.cwd() (/default/cwd) instead of input.cwd
      expect(mockCreatePreCompactCheckpoint).toHaveBeenCalledWith('/default/cwd');
      expect(mockLoadState).toHaveBeenCalledWith('/default/cwd');
    });

    it('should skip transcript parsing when transcript_path is not provided', async () => {
      mockReadHookInput.mockResolvedValue({
        hook_event_name: 'PreCompact',
        cwd: '/test/project',
        transcript_path: undefined,
      });

      await import('../pre-compact.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      // Should not attempt to parse transcript
      expect(mockParseTranscript).not.toHaveBeenCalled();
    });

    it('should skip transcript parsing when transcript file does not exist', async () => {
      mockFileExists.mockResolvedValue(false);

      await import('../pre-compact.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      // Should check file exists but not parse
      expect(mockFileExists).toHaveBeenCalledWith('/test/transcript.json');
      expect(mockParseTranscript).not.toHaveBeenCalled();
    });

    it('should handle null analytics without creating backup', async () => {
      mockLoadAnalytics.mockResolvedValue(null);

      await import('../pre-compact.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      // Should not write backup file when analytics is null
      expect(mockWriteFile).not.toHaveBeenCalled();

      // Should still complete successfully
      expect(mockRespond).toHaveBeenCalled();
    });

    it('should handle errors in main catch block', async () => {
      mockReadHookInput.mockRejectedValue(new Error('Input read failed'));

      await import('../pre-compact.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith('PreCompact main', expect.any(Error));

      // Verify response was still sent
      expect(mockCreateResponse).toHaveBeenCalled();
      expect(mockRespond).toHaveBeenCalled();
    });
  });

  describe('generateSessionSummary', () => {
    it('should generate summary with all analytics data', async () => {
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'session-abc',
        started_at: '2025-01-15T10:00:00Z',
        tool_usage: [
          { tool: 'Bash', timestamp: '2025-01-15T10:00:00Z', success: true },
          { tool: 'Read', timestamp: '2025-01-15T10:01:00Z', success: true },
        ],
        skills_recommended: ['typescript', 'vitest'],
        validations_run: 10,
        issues_found: 3,
      });

      mockGetFilesModifiedThisSession.mockReturnValue(['/src/index.ts']);
      mockFileExists.mockResolvedValue(true);
      mockParseTranscript.mockResolvedValue({ summary: 'Context summary here' });

      await import('../pre-compact.js');

      await vi.waitFor(() => {
        expect(mockSaveSessionSummary).toHaveBeenCalled();
      });

      const summaryCall = mockSaveSessionSummary.mock.calls[0];
      const summary = summaryCall[1];

      expect(summary).toContain('Session ID: session-abc');
      expect(summary).toContain('Started: 2025-01-15T10:00:00Z');
      expect(summary).toContain('Tools used: 2');
      expect(summary).toContain('Validations run: 10');
      expect(summary).toContain('Issues found: 3');
      expect(summary).toContain('Skills recommended: typescript, vitest');
      expect(summary).toContain('## Files Modified This Session');
      expect(summary).toContain('- /src/index.ts');
      expect(summary).toContain('## Last Context');
      expect(summary).toContain('Context summary here');
    });

    it('should generate summary without skills when none recommended', async () => {
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'session-xyz',
        started_at: '2025-01-15T10:00:00Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      });

      mockGetFilesModifiedThisSession.mockReturnValue([]);

      await import('../pre-compact.js');

      await vi.waitFor(() => {
        expect(mockSaveSessionSummary).toHaveBeenCalled();
      });

      const summaryCall = mockSaveSessionSummary.mock.calls[0];
      const summary = summaryCall[1];

      expect(summary).toContain('Session ID: session-xyz');
      expect(summary).not.toContain('Skills recommended:');
    });

    it('should truncate file list when more than 20 files modified', async () => {
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'session-many-files',
        started_at: '2025-01-15T10:00:00Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      });

      // Create 25 files
      const manyFiles = Array.from({ length: 25 }, (_, i) => `/src/file${i}.ts`);
      mockGetFilesModifiedThisSession.mockReturnValue(manyFiles);

      await import('../pre-compact.js');

      await vi.waitFor(() => {
        expect(mockSaveSessionSummary).toHaveBeenCalled();
      });

      const summaryCall = mockSaveSessionSummary.mock.calls[0];
      const summary = summaryCall[1];

      // Should only list first 20 files
      expect(summary).toContain('- /src/file0.ts');
      expect(summary).toContain('- /src/file19.ts');
      expect(summary).not.toContain('- /src/file20.ts');
      expect(summary).toContain('- ... and 5 more files');
    });

    it('should generate summary without files section when no files modified', async () => {
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'session-no-files',
        started_at: '2025-01-15T10:00:00Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      });

      mockGetFilesModifiedThisSession.mockReturnValue([]);

      await import('../pre-compact.js');

      await vi.waitFor(() => {
        expect(mockSaveSessionSummary).toHaveBeenCalled();
      });

      const summaryCall = mockSaveSessionSummary.mock.calls[0];
      const summary = summaryCall[1];

      expect(summary).not.toContain('## Files Modified This Session');
    });

    it('should generate summary without context section when transcript summary is empty', async () => {
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'session-no-context',
        started_at: '2025-01-15T10:00:00Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      });

      mockGetFilesModifiedThisSession.mockReturnValue([]);
      mockFileExists.mockResolvedValue(true);
      mockParseTranscript.mockResolvedValue({ summary: '' });

      await import('../pre-compact.js');

      await vi.waitFor(() => {
        expect(mockSaveSessionSummary).toHaveBeenCalled();
      });

      const summaryCall = mockSaveSessionSummary.mock.calls[0];
      const summary = summaryCall[1];

      expect(summary).not.toContain('## Last Context');
    });

    it('should generate summary with null analytics', async () => {
      mockLoadAnalytics.mockResolvedValue(null);
      mockGetFilesModifiedThisSession.mockReturnValue(['/src/modified.ts']);
      mockFileExists.mockResolvedValue(true);
      mockParseTranscript.mockResolvedValue({ summary: 'Some context' });

      await import('../pre-compact.js');

      await vi.waitFor(() => {
        expect(mockSaveSessionSummary).toHaveBeenCalled();
      });

      const summaryCall = mockSaveSessionSummary.mock.calls[0];
      const summary = summaryCall[1];

      // Should not contain analytics data
      expect(summary).not.toContain('Session ID:');
      expect(summary).not.toContain('Started:');
      expect(summary).not.toContain('Tools used:');

      // But should contain files and context
      expect(summary).toContain('## Files Modified This Session');
      expect(summary).toContain('- /src/modified.ts');
      expect(summary).toContain('## Last Context');
      expect(summary).toContain('Some context');
    });

    it('should include files_modified in backup JSON', async () => {
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'backup-test',
        started_at: '2025-01-15T10:00:00Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      });

      mockGetFilesModifiedThisSession.mockReturnValue(['/src/a.ts', '/src/b.ts']);

      await import('../pre-compact.js');

      await vi.waitFor(() => {
        expect(mockWriteFile).toHaveBeenCalled();
      });

      const writeCall = mockWriteFile.mock.calls[0];
      const backupContent = JSON.parse(writeCall[1]);

      expect(backupContent.session_id).toBe('backup-test');
      expect(backupContent.files_modified).toEqual(['/src/a.ts', '/src/b.ts']);
      expect(backupContent.compact_at).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle exactly 20 files without truncation message', async () => {
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'session-exact-20',
        started_at: '2025-01-15T10:00:00Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      });

      const exactlyTwentyFiles = Array.from({ length: 20 }, (_, i) => `/src/file${i}.ts`);
      mockGetFilesModifiedThisSession.mockReturnValue(exactlyTwentyFiles);

      await import('../pre-compact.js');

      await vi.waitFor(() => {
        expect(mockSaveSessionSummary).toHaveBeenCalled();
      });

      const summaryCall = mockSaveSessionSummary.mock.calls[0];
      const summary = summaryCall[1];

      expect(summary).toContain('- /src/file19.ts');
      expect(summary).not.toContain('... and');
    });

    it('should generate empty summary when all inputs are empty/null', async () => {
      mockLoadAnalytics.mockResolvedValue(null);
      mockGetFilesModifiedThisSession.mockReturnValue([]);

      await import('../pre-compact.js');

      await vi.waitFor(() => {
        expect(mockSaveSessionSummary).toHaveBeenCalled();
      });

      const summaryCall = mockSaveSessionSummary.mock.calls[0];
      const summary = summaryCall[1];

      // Summary should be empty string when nothing to report
      expect(summary).toBe('');
    });
  });
});
