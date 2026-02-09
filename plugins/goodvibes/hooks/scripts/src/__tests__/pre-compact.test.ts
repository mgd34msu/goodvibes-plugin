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

describe('pre-compact hook', () => {
  // Mock functions
  let mockWriteFile: ReturnType<typeof vi.fn>;
  let mockRespond: ReturnType<typeof vi.fn>;
  let mockReadHookInput: ReturnType<typeof vi.fn>;
  let mockLoadAnalytics: ReturnType<typeof vi.fn>;
  let mockDebug: ReturnType<typeof vi.fn>;
  let mockLogError: ReturnType<typeof vi.fn>;
  let mockCreateResponse: ReturnType<typeof vi.fn>;
  let mockParseTranscript: ReturnType<typeof vi.fn>;
  let mockFileExists: ReturnType<typeof vi.fn>;
  let mockLoadState: ReturnType<typeof vi.fn>;
  let mockCreatePreCompactCheckpoint: ReturnType<typeof vi.fn>;
  let mockSaveSessionSummary: ReturnType<typeof vi.fn>;
  let mockGetFilesModifiedThisSession: ReturnType<typeof vi.fn>;

  const originalProcessCwd = process.cwd;

  beforeEach(() => {
    vi.resetModules();

    // Initialize mock functions
    mockWriteFile = vi.fn();
    mockRespond = vi.fn();
    mockReadHookInput = vi.fn();
    mockLoadAnalytics = vi.fn();
    mockDebug = vi.fn();
    mockLogError = vi.fn();
    mockCreateResponse = vi.fn((opts) => ({
      continue: true,
      systemMessage: opts?.systemMessage,
    }));
    mockParseTranscript = vi.fn();
    mockFileExists = vi.fn();
    mockLoadState = vi.fn();
    mockCreatePreCompactCheckpoint = vi.fn();
    mockSaveSessionSummary = vi.fn();
    mockGetFilesModifiedThisSession = vi.fn();

    // Mock process.cwd
    process.cwd = vi.fn(() => '/default/cwd');

    // Default mock implementations
    mockRespond.mockReturnValue(undefined);
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
      tool_usage: [
        { tool: 'Bash', timestamp: '2025-01-15T12:00:00Z', success: true },
      ],
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

  async function setupMocksAndImport() {
    // Mock fs/promises
    vi.doMock('fs/promises', () => ({
      writeFile: mockWriteFile,
      access: vi.fn(),
      mkdir: vi.fn(),
      readFile: vi.fn(),
    }));

    // Mock shared module with isTestEnvironment = false so hook runs
    vi.doMock('../shared/index.js', () => ({
      respond: mockRespond,
      readHookInput: mockReadHookInput,
      loadAnalytics: mockLoadAnalytics,
      debug: mockDebug,
      logError: mockLogError,
      createResponse: mockCreateResponse,
      parseTranscript: mockParseTranscript,
      fileExists: mockFileExists,
      CACHE_DIR: '/mock/cache/dir',
      isTestEnvironment: () => false,
    }));

    // Mock state module
    vi.doMock('../state/index.js', () => ({
      loadState: mockLoadState,
    }));

    // Mock pre-compact/state-preservation module
    vi.doMock('../pre-compact/state-preservation.js', () => ({
      createPreCompactCheckpoint: mockCreatePreCompactCheckpoint,
      saveSessionSummary: mockSaveSessionSummary,
      getFilesModifiedThisSession: mockGetFilesModifiedThisSession,
    }));

    // Import the module (this triggers the hook)
    await import('../pre-compact/index.js');

    // Allow async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  describe('runPreCompactHook', () => {
    it('should complete successful hook execution with all data present', async () => {
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'test-session-123',
        started_at: '2025-01-15T12:00:00Z',
        tool_usage: [
          { tool: 'Bash', timestamp: '2025-01-15T12:00:00Z', success: true },
        ],
        skills_recommended: ['typescript', 'react'],
        validations_run: 5,
        issues_found: 2,
      });

      mockGetFilesModifiedThisSession.mockReturnValue([
        '/src/file1.ts',
        '/src/file2.ts',
      ]);
      mockFileExists.mockResolvedValue(true);
      mockParseTranscript.mockResolvedValue({
        summary: 'Working on feature X',
      });

      await setupMocksAndImport();

      // Verify initialization
      expect(mockDebug).toHaveBeenCalledWith('PreCompact hook starting');
      expect(mockReadHookInput).toHaveBeenCalled();
      expect(mockDebug).toHaveBeenCalledWith('PreCompact received input', {
        hook_event_name: 'PreCompact',
      });

      // Verify checkpoint creation
      expect(mockCreatePreCompactCheckpoint).toHaveBeenCalledWith(
        '/test/project'
      );

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

      await setupMocksAndImport();

      // Should use process.cwd() (/default/cwd) instead of input.cwd
      expect(mockCreatePreCompactCheckpoint).toHaveBeenCalledWith(
        '/default/cwd'
      );
      expect(mockLoadState).toHaveBeenCalledWith('/default/cwd');
    });

    it('should skip transcript parsing when transcript_path is not provided', async () => {
      mockReadHookInput.mockResolvedValue({
        hook_event_name: 'PreCompact',
        cwd: '/test/project',
        transcript_path: undefined,
      });

      await setupMocksAndImport();

      // Should not attempt to parse transcript
      expect(mockParseTranscript).not.toHaveBeenCalled();
    });

    it('should skip transcript parsing when transcript file does not exist', async () => {
      mockFileExists.mockResolvedValue(false);

      await setupMocksAndImport();

      // Should check file exists but not parse
      expect(mockFileExists).toHaveBeenCalledWith('/test/transcript.json');
      expect(mockParseTranscript).not.toHaveBeenCalled();
    });

    it('should handle null analytics without creating backup', async () => {
      mockLoadAnalytics.mockResolvedValue(null);

      await setupMocksAndImport();

      // Should not write backup file when analytics is null
      expect(mockWriteFile).not.toHaveBeenCalled();

      // Should still complete successfully
      expect(mockRespond).toHaveBeenCalled();
    });

    it('should handle errors in main catch block', async () => {
      mockReadHookInput.mockRejectedValue(new Error('Input read failed'));

      await setupMocksAndImport();

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith(
        'PreCompact main',
        expect.any(Error)
      );

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
      mockParseTranscript.mockResolvedValue({
        summary: 'Context summary here',
      });

      await setupMocksAndImport();

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

      await setupMocksAndImport();

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
      const manyFiles = Array.from(
        { length: 25 },
        (_, i) => `/src/file${i}.ts`
      );
      mockGetFilesModifiedThisSession.mockReturnValue(manyFiles);

      await setupMocksAndImport();

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

      await setupMocksAndImport();

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

      await setupMocksAndImport();

      const summaryCall = mockSaveSessionSummary.mock.calls[0];
      const summary = summaryCall[1];

      expect(summary).not.toContain('## Last Context');
    });

    it('should generate summary with null analytics', async () => {
      mockLoadAnalytics.mockResolvedValue(null);
      mockGetFilesModifiedThisSession.mockReturnValue(['/src/modified.ts']);
      mockFileExists.mockResolvedValue(true);
      mockParseTranscript.mockResolvedValue({ summary: 'Some context' });

      await setupMocksAndImport();

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

      mockGetFilesModifiedThisSession.mockReturnValue([
        '/src/a.ts',
        '/src/b.ts',
      ]);

      await setupMocksAndImport();

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

      const exactlyTwentyFiles = Array.from(
        { length: 20 },
        (_, i) => `/src/file${i}.ts`
      );
      mockGetFilesModifiedThisSession.mockReturnValue(exactlyTwentyFiles);

      await setupMocksAndImport();

      const summaryCall = mockSaveSessionSummary.mock.calls[0];
      const summary = summaryCall[1];

      expect(summary).toContain('- /src/file19.ts');
      expect(summary).not.toContain('... and');
    });

    it('should generate empty summary when all inputs are empty/null', async () => {
      mockLoadAnalytics.mockResolvedValue(null);
      mockGetFilesModifiedThisSession.mockReturnValue([]);

      await setupMocksAndImport();

      const summaryCall = mockSaveSessionSummary.mock.calls[0];
      const summary = summaryCall[1];

      // Summary should be empty string when nothing to report
      expect(summary).toBe('');
    });
  });

  describe('agent tracking in checkpoint messages', () => {
    let mockReadFile: ReturnType<typeof vi.fn>;
    let mockHasUncommittedChanges: ReturnType<typeof vi.fn>;
    let mockCreateCheckpointIfNeeded: ReturnType<typeof vi.fn>;
    let mockFileExistsForCheckpoint: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockReadFile = vi.fn();
      mockHasUncommittedChanges = vi.fn();
      mockCreateCheckpointIfNeeded = vi.fn();
      mockFileExistsForCheckpoint = vi.fn();
    });

    async function setupCheckpointMocksAndImport() {
      // Mock fs/promises
      vi.doMock('fs/promises', () => ({
        writeFile: mockWriteFile,
        readFile: mockReadFile,
        access: vi.fn(),
        mkdir: vi.fn(),
      }));

      // Mock shared module
      vi.doMock('../shared/index.js', () => ({
        respond: mockRespond,
        readHookInput: mockReadHookInput,
        loadAnalytics: mockLoadAnalytics,
        debug: mockDebug,
        logError: mockLogError,
        createResponse: mockCreateResponse,
        parseTranscript: mockParseTranscript,
        fileExists: mockFileExistsForCheckpoint,
        CACHE_DIR: '/mock/cache/dir',
        isTestEnvironment: () => false,
        ensureGoodVibesDir: vi.fn(),
      }));

      // Mock state module
      vi.doMock('../state/index.js', () => ({
        loadState: mockLoadState,
        saveState: vi.fn(),
      }));

      // Mock automation/git-operations
      vi.doMock('../automation/git-operations.js', () => ({
        hasUncommittedChanges: mockHasUncommittedChanges,
      }));

      // Mock post-tool-use/checkpoint-manager
      vi.doMock('../post-tool-use/checkpoint-manager.js', () => ({
        createCheckpointIfNeeded: mockCreateCheckpointIfNeeded,
      }));

      // Mock pre-compact/state-preservation module with actual implementation
      vi.doMock('../pre-compact/state-preservation.js', async () => {
        const actual = await vi.importActual<typeof import('../pre-compact/state-preservation.js')>(
          '../pre-compact/state-preservation.js'
        );
        return {
          ...actual,
          saveSessionSummary: mockSaveSessionSummary,
          getFilesModifiedThisSession: mockGetFilesModifiedThisSession,
        };
      });

      // Import the module
      await import('../pre-compact/index.js');

      // Allow async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    it('should include agent info in checkpoint message when agents are running', async () => {
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockLoadState.mockResolvedValue({
        session: { id: 'test-session-123' },
      });

      const trackingData = {
        'agent-1': {
          agent_id: 'agent-1',
          agent_type: 'goodvibes:tester',
          session_id: 'test-session-123',
          project: '/test/project',
          project_name: 'my-project',
          started_at: new Date().toISOString(),
          task_description: 'Write comprehensive tests for the new authentication module',
        },
        'agent-2': {
          agent_id: 'agent-2',
          agent_type: 'goodvibes:engineer',
          session_id: 'test-session-123',
          project: '/test/project',
          project_name: 'my-project',
          started_at: new Date().toISOString(),
          task_description: 'Implement user registration endpoint with email verification',
        },
      };

      mockFileExistsForCheckpoint.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify(trackingData));
      mockCreateCheckpointIfNeeded.mockResolvedValue({
        created: true,
        message: 'Checkpoint created',
      });

      await setupCheckpointMocksAndImport();

      // Verify checkpoint was called with agent info in commit message
      expect(mockCreateCheckpointIfNeeded).toHaveBeenCalled();
      const commitMessage = mockCreateCheckpointIfNeeded.mock.calls[0][2];
      expect(commitMessage).toContain('agents running during compact:');
      expect(commitMessage).toContain('agent-1 - Write comprehensive tests for the new authentication module');
      expect(commitMessage).toContain('agent-2 - Implement user registration endpoint with email verification');

    });

    it('should not include agent line when no agents are tracked', async () => {
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockLoadState.mockResolvedValue({
        session: { id: 'test-session-123' },
      });

      mockFileExistsForCheckpoint.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify({}));
      mockCreateCheckpointIfNeeded.mockResolvedValue({
        created: true,
        message: 'Checkpoint created',
      });

      await setupCheckpointMocksAndImport();

      const commitMessage = mockCreateCheckpointIfNeeded.mock.calls[0][2];
      expect(commitMessage).toBe('pre-compact: saving work before context compaction');
      expect(commitMessage).not.toContain('agents running during compact:');
    });

    it('should not include agent line when tracking file does not exist', async () => {
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockLoadState.mockResolvedValue({
        session: { id: 'test-session-123' },
      });

      mockFileExistsForCheckpoint.mockResolvedValue(false);
      mockCreateCheckpointIfNeeded.mockResolvedValue({
        created: true,
        message: 'Checkpoint created',
      });

      await setupCheckpointMocksAndImport();

      const commitMessage = mockCreateCheckpointIfNeeded.mock.calls[0][2];
      expect(commitMessage).toBe('pre-compact: saving work before context compaction');
      expect(commitMessage).not.toContain('agents running during compact:');
    });

    it('should fall back to agent_type when task_description is missing', async () => {
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockLoadState.mockResolvedValue({
        session: { id: 'test-session-123' },
      });

      const trackingData = {
        'agent-1': {
          agent_id: 'agent-1',
          agent_type: 'goodvibes:tester',
          session_id: 'test-session-123',
          project: '/test/project',
          project_name: 'my-project',
          started_at: new Date().toISOString(),
          // No task_description
        },
      };

      mockFileExistsForCheckpoint.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify(trackingData));
      mockCreateCheckpointIfNeeded.mockResolvedValue({
        created: true,
        message: 'Checkpoint created',
      });

      await setupCheckpointMocksAndImport();

      const commitMessage = mockCreateCheckpointIfNeeded.mock.calls[0][2];
      expect(commitMessage).toContain('agent-1 - goodvibes:tester');
      expect(commitMessage).not.toContain('undefined');
    });

    it('should truncate long task descriptions over 80 chars', async () => {
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockLoadState.mockResolvedValue({
        session: { id: 'test-session-123' },
      });

      const longDescription =
        'This is a very long task description that exceeds eighty characters and should be truncated to prevent the commit message from being too long';

      const trackingData = {
        'agent-1': {
          agent_id: 'agent-1',
          agent_type: 'goodvibes:tester',
          session_id: 'test-session-123',
          project: '/test/project',
          project_name: 'my-project',
          started_at: new Date().toISOString(),
          task_description: longDescription,
        },
      };

      mockFileExistsForCheckpoint.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify(trackingData));
      mockCreateCheckpointIfNeeded.mockResolvedValue({
        created: true,
        message: 'Checkpoint created',
      });

      await setupCheckpointMocksAndImport();

      const commitMessage = mockCreateCheckpointIfNeeded.mock.calls[0][2];
      const truncated = longDescription.substring(0, 80);
      expect(commitMessage).toContain(`agent-1 - ${truncated}`);
      expect(truncated.length).toBe(80);
    });

    it('should only include agents from current session', async () => {
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockLoadState.mockResolvedValue({
        session: { id: 'current-session' },
      });

      const trackingData = {
        'agent-1': {
          agent_id: 'agent-1',
          agent_type: 'goodvibes:tester',
          session_id: 'current-session',
          project: '/test/project',
          project_name: 'my-project',
          started_at: new Date().toISOString(),
          task_description: 'Current session task',
        },
        'agent-2': {
          agent_id: 'agent-2',
          agent_type: 'goodvibes:engineer',
          session_id: 'different-session',
          project: '/test/project',
          project_name: 'my-project',
          started_at: new Date().toISOString(),
          task_description: 'Different session task',
        },
      };

      mockFileExistsForCheckpoint.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify(trackingData));
      mockCreateCheckpointIfNeeded.mockResolvedValue({
        created: true,
        message: 'Checkpoint created',
      });

      await setupCheckpointMocksAndImport();

      const commitMessage = mockCreateCheckpointIfNeeded.mock.calls[0][2];
      expect(commitMessage).toContain('agent-1 - Current session task');
      expect(commitMessage).not.toContain('agent-2');
      expect(commitMessage).not.toContain('Different session task');
    });

    it('should handle malformed JSON in tracking file gracefully', async () => {
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockLoadState.mockResolvedValue({
        session: { id: 'test-session-123' },
      });

      mockFileExistsForCheckpoint.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('invalid json{');
      mockCreateCheckpointIfNeeded.mockResolvedValue({
        created: true,
        message: 'Checkpoint created',
      });

      await setupCheckpointMocksAndImport();

      // Should not crash, should use default message
      const commitMessage = mockCreateCheckpointIfNeeded.mock.calls[0][2];
      expect(commitMessage).toBe('pre-compact: saving work before context compaction');
    });

    it('should replace newlines in task_description with spaces', async () => {
      mockHasUncommittedChanges.mockResolvedValue(true);
      mockLoadState.mockResolvedValue({
        session: { id: 'test-session-123' },
      });

      const trackingData = {
        'agent-1': {
          agent_id: 'agent-1',
          agent_type: 'goodvibes:tester',
          session_id: 'test-session-123',
          project: '/test/project',
          project_name: 'my-project',
          started_at: new Date().toISOString(),
          task_description: 'Task with\nnewlines\nin it',
        },
      };

      mockFileExistsForCheckpoint.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify(trackingData));
      mockCreateCheckpointIfNeeded.mockResolvedValue({
        created: true,
        message: 'Checkpoint created',
      });

      await setupCheckpointMocksAndImport();

      const commitMessage = mockCreateCheckpointIfNeeded.mock.calls[0][2];
      expect(commitMessage).toContain('agent-1 - Task with newlines in it');
      // Verify agent line is a single line (no embedded newlines)
      const agentsLine = commitMessage.split('\n').find((l: string) => l.startsWith('agents running'));
      expect(agentsLine).toBeDefined();
      expect(agentsLine).toContain('agent-1 - Task with newlines in it');
    });
  });

});
