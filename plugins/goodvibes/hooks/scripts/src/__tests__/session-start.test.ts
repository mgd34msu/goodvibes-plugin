/**
 * Unit tests for session-start hook
 *
 * Tests cover:
 * - Hook initialization flow (runSessionStartHook)
 * - State loading and initialization (loadPluginState)
 * - Crash recovery checks (performCrashRecoveryCheck)
 * - Context gathering (gatherContextSafely)
 * - State saving (savePluginState)
 * - Analytics initialization (initializeAnalytics)
 * - Registry validation and missing registries warning
 * - Session ID generation (fallback when input.session_id is missing)
 * - Project directory resolution (input.cwd vs PROJECT_ROOT)
 * - Error handling for all async operations
 * - Response formatting with additionalContext
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('session-start hook', () => {
  const originalDateNow = Date.now;
  const fixedTimestamp = new Date('2025-01-15T12:30:00Z').getTime();

  // Mock functions
  let mockAccess: ReturnType<typeof vi.fn>;
  let mockMkdir: ReturnType<typeof vi.fn>;
  let mockReadFile: ReturnType<typeof vi.fn>;
  let mockWriteFile: ReturnType<typeof vi.fn>;
  let mockRename: ReturnType<typeof vi.fn>;
  let mockRespond: ReturnType<typeof vi.fn>;
  let mockReadHookInput: ReturnType<typeof vi.fn>;
  let mockValidateRegistries: ReturnType<typeof vi.fn>;
  let mockEnsureCacheDir: ReturnType<typeof vi.fn>;
  let mockSaveAnalytics: ReturnType<typeof vi.fn>;
  let mockDebug: ReturnType<typeof vi.fn>;
  let mockLogError: ReturnType<typeof vi.fn>;
  let mockCreateResponse: ReturnType<typeof vi.fn>;
  let mockCheckCrashRecovery: ReturnType<typeof vi.fn>;
  let mockGatherProjectContext: ReturnType<typeof vi.fn>;
  let mockCreateFailedContextResult: ReturnType<typeof vi.fn>;
  let mockBuildSystemMessage: ReturnType<typeof vi.fn>;
  let mockLoadState: ReturnType<typeof vi.fn>;
  let mockSaveState: ReturnType<typeof vi.fn>;
  let mockUpdateSessionState: ReturnType<typeof vi.fn>;
  let mockInitializeSession: ReturnType<typeof vi.fn>;
  let mockCreateDefaultState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Initialize mock functions
    mockAccess = vi.fn();
    mockMkdir = vi.fn();
    mockReadFile = vi.fn();
    mockWriteFile = vi.fn();
    mockRename = vi.fn();
    mockRespond = vi.fn();
    mockReadHookInput = vi.fn();
    mockValidateRegistries = vi.fn();
    mockEnsureCacheDir = vi.fn();
    mockSaveAnalytics = vi.fn();
    mockDebug = vi.fn();
    mockLogError = vi.fn();
    mockCreateResponse = vi.fn((opts) => ({
      continue: true,
      systemMessage: opts?.systemMessage,
      additionalContext: opts?.additionalContext,
    }));
    mockCheckCrashRecovery = vi.fn();
    mockGatherProjectContext = vi.fn();
    mockCreateFailedContextResult = vi.fn((startTime: number) => ({
      additionalContext: '',
      summary: 'Context gathering failed',
      isEmptyProject: false,
      hasIssues: false,
      issueCount: 0,
      gatherTimeMs: Date.now() - startTime,
      needsRecovery: false,
    }));
    mockBuildSystemMessage = vi.fn();
    mockLoadState = vi.fn();
    mockSaveState = vi.fn();
    mockUpdateSessionState = vi.fn((state, updates) => ({
      ...state,
      session: { ...state.session, ...updates },
    }));
    mockInitializeSession = vi.fn((state, sessionId) => ({
      ...state,
      session: {
        ...state.session,
        id: sessionId,
        startedAt: new Date().toISOString(),
      },
      files: { ...state.files, modifiedThisSession: [], createdThisSession: [] },
    }));
    mockCreateDefaultState = vi.fn(() => ({
      session: {
        id: '',
        startedAt: new Date().toISOString(),
        mode: 'default',
        featureDescription: null,
      },
      errors: {},
      tests: {
        lastFullRun: null,
        lastQuickRun: null,
        passingFiles: [],
        failingFiles: [],
        pendingFixes: [],
      },
      build: {
        lastRun: null,
        status: 'unknown',
        errors: [],
        fixAttempts: 0,
      },
      git: {
        mainBranch: 'main',
        currentBranch: 'main',
        featureBranch: null,
        featureStartedAt: null,
        featureDescription: null,
        checkpoints: [],
        pendingMerge: false,
      },
      files: {
        modifiedSinceCheckpoint: [],
        modifiedThisSession: [],
        createdThisSession: [],
      },
      devServers: {},
    }));

    // Mock Date.now for consistent timing
    Date.now = vi.fn(() => fixedTimestamp);
  });

  afterEach(() => {
    Date.now = originalDateNow;
    vi.resetModules();
  });

  async function setupMocksAndImport() {
    // Set default mock implementations if not already set
    if (!mockReadHookInput.getMockImplementation()) {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SessionStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      });
    }

    if (!mockValidateRegistries.getMockImplementation()) {
      mockValidateRegistries.mockResolvedValue({ valid: true, missing: [] });
    }

    if (!mockEnsureCacheDir.getMockImplementation()) {
      mockEnsureCacheDir.mockResolvedValue(undefined);
    }

    if (!mockLoadState.getMockImplementation()) {
      mockLoadState.mockResolvedValue(mockCreateDefaultState());
    }

    if (!mockSaveState.getMockImplementation()) {
      mockSaveState.mockResolvedValue(undefined);
    }

    if (!mockCheckCrashRecovery.getMockImplementation()) {
      mockCheckCrashRecovery.mockResolvedValue({
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      });
    }

    if (!mockGatherProjectContext.getMockImplementation()) {
      mockGatherProjectContext.mockResolvedValue({
        additionalContext: 'test context',
        summary: 'Test project summary',
        isEmptyProject: false,
        hasIssues: false,
        issueCount: 0,
        gatherTimeMs: 100,
        needsRecovery: false,
      });
    }

    if (!mockBuildSystemMessage.getMockImplementation()) {
      mockBuildSystemMessage.mockReturnValue(
        'GoodVibes plugin v2.1.0 initialized.'
      );
    }

    // Mock fs/promises
    vi.doMock('fs/promises', () => ({
      access: mockAccess,
      mkdir: mockMkdir,
      readFile: mockReadFile,
      writeFile: mockWriteFile,
      rename: mockRename,
    }));

    // Mock shared module with isTestEnvironment = false so hook runs
    vi.doMock('../shared/index.js', () => ({
      respond: mockRespond,
      readHookInput: mockReadHookInput,
      validateRegistries: mockValidateRegistries,
      ensureCacheDir: mockEnsureCacheDir,
      ensureGoodVibesDir: vi.fn().mockResolvedValue(undefined),
      fileExists: vi.fn().mockResolvedValue(true),
      saveAnalytics: mockSaveAnalytics,
      debug: mockDebug,
      logError: mockLogError,
      createResponse: mockCreateResponse,
      PROJECT_ROOT: '/mock/project/root',
      isTestEnvironment: () => false,
    }));

    // Mock crash-recovery module
    vi.doMock('../session-start/crash-recovery.js', () => ({
      checkCrashRecovery: mockCheckCrashRecovery,
    }));

    // Mock context-builder module
    vi.doMock('../session-start/context-builder.js', () => ({
      gatherProjectContext: mockGatherProjectContext,
      createFailedContextResult: mockCreateFailedContextResult,
    }));

    // Mock response-formatter module
    vi.doMock('../session-start/response-formatter.js', () => ({
      buildSystemMessage: mockBuildSystemMessage,
    }));

    // Mock state module
    vi.doMock('../state/index.js', () => ({
      loadState: mockLoadState,
      saveState: mockSaveState,
      updateSessionState: mockUpdateSessionState,
      initializeSession: mockInitializeSession,
    }));

    // Mock types/state module
    vi.doMock('../types/state.js', () => ({
      createDefaultState: mockCreateDefaultState,
    }));

    // Import the module (this triggers the hook)
    await import('../session-start/index.js');

    // Allow async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
    await vi.waitFor(() => expect(mockRespond).toHaveBeenCalled(), { timeout: 1000 });
  }

  describe('runSessionStartHook', () => {
    it('should complete successful initialization with all steps', async () => {
      // Set up all mocks before importing
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SessionStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      });
      mockValidateRegistries.mockResolvedValue({ valid: true, missing: [] });
      mockEnsureCacheDir.mockResolvedValue(undefined);
      mockLoadState.mockResolvedValue(mockCreateDefaultState());
      mockSaveState.mockResolvedValue(undefined);
      mockCheckCrashRecovery.mockResolvedValue({
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      });
      mockGatherProjectContext.mockResolvedValue({
        additionalContext: 'test context',
        summary: 'Test project summary',
        isEmptyProject: false,
        hasIssues: false,
        issueCount: 0,
        gatherTimeMs: 100,
        needsRecovery: false,
      });
      mockBuildSystemMessage.mockReturnValue(
        'GoodVibes plugin v2.1.0 initialized.'
      );

      await setupMocksAndImport();

      // Verify initialization sequence
      expect(mockDebug).toHaveBeenCalledWith('SessionStart hook starting');
      expect(mockReadHookInput).toHaveBeenCalled();
      expect(mockDebug).toHaveBeenCalledWith('SessionStart received input', {
        session_id: 'test-session-123',
        hook_event_name: 'SessionStart',
      });

      // Verify state loading
      expect(mockLoadState).toHaveBeenCalledWith('/test/project');
      expect(mockDebug).toHaveBeenCalledWith(
        'State loaded',
        expect.any(Object)
      );

      // Verify session initialization
      expect(mockInitializeSession).toHaveBeenCalled();

      // Verify cache directory and registry validation
      expect(mockEnsureCacheDir).toHaveBeenCalled();
      expect(mockDebug).toHaveBeenCalledWith('Cache directory ensured');
      expect(mockValidateRegistries).toHaveBeenCalled();
      expect(mockDebug).toHaveBeenCalledWith('Registry validation', {
        valid: true,
        missing: [],
      });

      // Verify crash recovery check
      expect(mockCheckCrashRecovery).toHaveBeenCalledWith('/test/project');

      // Verify context gathering
      expect(mockGatherProjectContext).toHaveBeenCalled();

      // Verify state update and save
      expect(mockUpdateSessionState).toHaveBeenCalled();
      expect(mockSaveState).toHaveBeenCalled();
      expect(mockDebug).toHaveBeenCalledWith('State saved');

      // Verify analytics initialization
      expect(mockSaveAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'test-session-123',
          tool_usage: [],
          skills_recommended: [],
          validations_run: 0,
          issues_found: 0,
          detected_stack: expect.objectContaining({
            isEmptyProject: false,
            hasIssues: false,
          }),
        })
      );

      // Verify response
      expect(mockBuildSystemMessage).toHaveBeenCalledWith(
        'test-session-123',
        expect.any(Object)
      );
      expect(mockCreateResponse).toHaveBeenCalledWith({
        systemMessage: 'GoodVibes plugin v2.1.0 initialized.',
        additionalContext: 'test context',
      });
      expect(mockRespond).toHaveBeenCalled();
    });

    it('should use PROJECT_ROOT when input.cwd is not provided', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: undefined,
        hook_event_name: 'SessionStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      });

      await setupMocksAndImport();

      // Should use PROJECT_ROOT (/mock/project/root) instead of input.cwd
      expect(mockLoadState).toHaveBeenCalledWith('/mock/project/root');
      expect(mockDebug).toHaveBeenCalledWith(
        'Project directory: /mock/project/root'
      );
    });

    it('should generate session ID when input.session_id is not provided', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: undefined,
        cwd: '/test/project',
        hook_event_name: 'SessionStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      });

      await setupMocksAndImport();

      // Should generate a session ID with the format session_{timestamp}
      expect(mockInitializeSession).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringMatching(/^session_\d+$/)
      );
    });

    it('should handle missing registries and return warning', async () => {
      mockValidateRegistries.mockResolvedValue({
        valid: false,
        missing: ['agents-registry.json', 'tools-registry.json'],
      });

      await setupMocksAndImport();

      // Verify warning response for missing registries
      expect(mockCreateResponse).toHaveBeenCalledWith({
        systemMessage:
          'GoodVibes: Warning - Missing registries: agents-registry.json, tools-registry.json. Run build-registries script.',
      });
      expect(mockRespond).toHaveBeenCalled();

      // Verify no further processing occurred
      expect(mockCheckCrashRecovery).not.toHaveBeenCalled();
      expect(mockGatherProjectContext).not.toHaveBeenCalled();
    });

    it('should handle additionalContext being empty/falsy', async () => {
      mockGatherProjectContext.mockResolvedValue({
        additionalContext: '',
        summary: 'Test project summary',
        isEmptyProject: false,
        hasIssues: false,
        issueCount: 0,
        gatherTimeMs: 100,
        needsRecovery: false,
      });

      await setupMocksAndImport();

      // When additionalContext is empty string, it should be undefined in response
      expect(mockCreateResponse).toHaveBeenCalledWith({
        systemMessage: 'GoodVibes plugin v2.1.0 initialized.',
        additionalContext: undefined,
      });
    });
  });

  describe('loadPluginState error handling', () => {
    it('should return default state when loadState throws', async () => {
      mockLoadState.mockRejectedValue(new Error('Failed to load state'));

      await setupMocksAndImport();

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith(
        'State loading',
        expect.any(Error)
      );

      // Verify createDefaultState was called as fallback
      expect(mockCreateDefaultState).toHaveBeenCalled();

      // Verify hook continued successfully
      expect(mockRespond).toHaveBeenCalled();
    });
  });

  describe('performCrashRecoveryCheck error handling', () => {
    it('should return default recovery info when checkCrashRecovery throws', async () => {
      mockCheckCrashRecovery.mockRejectedValue(
        new Error('Crash recovery check failed')
      );

      await setupMocksAndImport();

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith(
        'Crash recovery check',
        expect.any(Error)
      );

      // Verify hook continued successfully with default recovery info
      expect(mockGatherProjectContext).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          needsRecovery: false,
          previousFeature: null,
          onBranch: null,
          uncommittedFiles: [],
          pendingIssues: [],
          lastCheckpoint: null,
        }),
        expect.any(Number)
      );
    });
  });

  describe('gatherContextSafely error handling', () => {
    it('should return failed context result when gatherProjectContext throws', async () => {
      mockGatherProjectContext.mockRejectedValue(
        new Error('Context gathering failed')
      );

      await setupMocksAndImport();

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith(
        'Context gathering',
        expect.any(Error)
      );

      // Verify createFailedContextResult was called
      expect(mockCreateFailedContextResult).toHaveBeenCalled();

      // Verify hook continued successfully
      expect(mockRespond).toHaveBeenCalled();
    });
  });

  describe('savePluginState error handling', () => {
    it('should continue when saveState throws', async () => {
      mockSaveState.mockRejectedValue(new Error('Failed to save state'));

      await setupMocksAndImport();

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith(
        'State saving',
        expect.any(Error)
      );

      // Verify hook continued successfully (analytics and response still processed)
      expect(mockSaveAnalytics).toHaveBeenCalled();
      expect(mockRespond).toHaveBeenCalled();
    });
  });

  describe('main error handling', () => {
    it('should handle and report Error instances in main catch block', async () => {
      mockReadHookInput.mockRejectedValue(new Error('Input read failed'));

      await setupMocksAndImport();

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith(
        'SessionStart main',
        expect.any(Error)
      );

      // Verify error response was sent
      expect(mockCreateResponse).toHaveBeenCalledWith({
        systemMessage: 'GoodVibes: Init error - Input read failed',
      });
    });

    it('should handle non-Error types in main catch block', async () => {
      mockReadHookInput.mockRejectedValue('String error');

      await setupMocksAndImport();

      // Verify error response with "Unknown error" message
      expect(mockCreateResponse).toHaveBeenCalledWith({
        systemMessage: 'GoodVibes: Init error - Unknown error',
      });
    });
  });

  describe('initializeAnalytics', () => {
    it('should initialize analytics with correct context result data', async () => {
      mockGatherProjectContext.mockResolvedValue({
        additionalContext: 'project context',
        summary: 'Test summary',
        isEmptyProject: true,
        hasIssues: true,
        issueCount: 5,
        gatherTimeMs: 250,
        needsRecovery: true,
      });

      await setupMocksAndImport();

      expect(mockSaveAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'test-session-123',
          started_at: expect.any(String),
          tool_usage: [],
          skills_recommended: [],
          validations_run: 0,
          issues_found: 5,
          detected_stack: {
            isEmptyProject: true,
            hasIssues: true,
            gatherTimeMs: 250,
            needsRecovery: true,
          },
        })
      );

      expect(mockDebug).toHaveBeenCalledWith(
        'Analytics initialized for session test-session-123'
      );
    });
  });

  describe('debug logging', () => {
    it('should log project directory', async () => {
      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith(
        'Project directory: /test/project'
      );
    });

    it('should log context gathering start', async () => {
      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith(
        'Gathering project context from: /test/project'
      );
    });

    it('should log crash recovery check result', async () => {
      mockCheckCrashRecovery.mockResolvedValue({
        needsRecovery: true,
        previousFeature: 'Add login feature',
        onBranch: 'feature/login',
        uncommittedFiles: ['src/auth.ts'],
        pendingIssues: ['Tests failing'],
        lastCheckpoint: null,
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith('Crash recovery check', {
        needsRecovery: true,
      });
    });
  });
});
