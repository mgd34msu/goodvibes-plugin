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

// Mock fs/promises module
const mockAccess = vi.fn();
const mockMkdir = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockRename = vi.fn();

vi.mock('fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  rename: (...args: unknown[]) => mockRename(...args),
}));

// Mock shared module
const mockRespond = vi.fn();
const mockReadHookInput = vi.fn();
const mockValidateRegistries = vi.fn();
const mockEnsureCacheDir = vi.fn();
const mockSaveAnalytics = vi.fn();
const mockDebug = vi.fn();
const mockLogError = vi.fn();
const mockCreateResponse = vi.fn((opts) => ({
  continue: true,
  systemMessage: opts?.systemMessage,
  additionalContext: opts?.additionalContext,
}));

vi.mock('../shared/index.js', () => ({
  respond: (...args: unknown[]) => mockRespond(...args),
  readHookInput: () => mockReadHookInput(),
  validateRegistries: () => mockValidateRegistries(),
  ensureCacheDir: () => mockEnsureCacheDir(),
  saveAnalytics: (...args: unknown[]) => mockSaveAnalytics(...args),
  debug: (...args: unknown[]) => mockDebug(...args),
  logError: (...args: unknown[]) => mockLogError(...args),
  createResponse: (...args: unknown[]) => mockCreateResponse(...args),
  PROJECT_ROOT: '/mock/project/root',
}));

// Mock crash-recovery module
const mockCheckCrashRecovery = vi.fn();

vi.mock('../session-start/crash-recovery.js', () => ({
  checkCrashRecovery: (...args: unknown[]) => mockCheckCrashRecovery(...args),
}));

// Mock context-builder module
const mockGatherProjectContext = vi.fn();
const mockCreateFailedContextResult = vi.fn((startTime: number) => ({
  additionalContext: '',
  summary: 'Context gathering failed',
  isEmptyProject: false,
  hasIssues: false,
  issueCount: 0,
  gatherTimeMs: Date.now() - startTime,
  needsRecovery: false,
}));

vi.mock('../session-start/context-builder.js', () => ({
  gatherProjectContext: (...args: unknown[]) =>
    mockGatherProjectContext(...args),
  createFailedContextResult: (startTime: number) =>
    mockCreateFailedContextResult(startTime),
}));

// Mock response-formatter module
const mockBuildSystemMessage = vi.fn();

vi.mock('../session-start/response-formatter.js', () => ({
  buildSystemMessage: (...args: unknown[]) => mockBuildSystemMessage(...args),
}));

// Mock state module
const mockLoadState = vi.fn();
const mockSaveState = vi.fn();
const mockUpdateSessionState = vi.fn((state, updates) => ({
  ...state,
  session: { ...state.session, ...updates },
}));
const mockInitializeSession = vi.fn((state, sessionId) => ({
  ...state,
  session: {
    ...state.session,
    id: sessionId,
    startedAt: new Date().toISOString(),
  },
  files: { ...state.files, modifiedThisSession: [], createdThisSession: [] },
}));

vi.mock('../state.js', () => ({
  loadState: (...args: unknown[]) => mockLoadState(...args),
  saveState: (...args: unknown[]) => mockSaveState(...args),
  updateSessionState: (...args: unknown[]) => mockUpdateSessionState(...args),
  initializeSession: (...args: unknown[]) => mockInitializeSession(...args),
}));

// Mock types/state module
const mockCreateDefaultState = vi.fn(() => ({
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

vi.mock('../types/state.js', () => ({
  createDefaultState: () => mockCreateDefaultState(),
}));

describe('session-start hook', () => {
  const originalDateNow = Date.now;
  const fixedTimestamp = new Date('2025-01-15T12:30:00Z').getTime();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Mock Date.now for consistent timing
    Date.now = vi.fn(() => fixedTimestamp);

    // Default mock implementations
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
  });

  afterEach(() => {
    Date.now = originalDateNow;
    vi.resetModules();
  });

  describe('runSessionStartHook', () => {
    it('should complete successful initialization with all steps', async () => {
      await import('../session-start.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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

      await import('../session-start.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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

      await import('../session-start.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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

      await import('../session-start.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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

      await import('../session-start.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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

      await import('../session-start.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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

      await import('../session-start.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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

      await import('../session-start.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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

      await import('../session-start.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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

      await import('../session-start.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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

      await import('../session-start.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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

      await import('../session-start.js');

      await vi.waitFor(() => {
        expect(mockSaveAnalytics).toHaveBeenCalled();
      });

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
      await import('../session-start.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      expect(mockDebug).toHaveBeenCalledWith(
        'Project directory: /test/project'
      );
    });

    it('should log context gathering start', async () => {
      await import('../session-start.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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

      await import('../session-start.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      expect(mockDebug).toHaveBeenCalledWith('Crash recovery check', {
        needsRecovery: true,
      });
    });
  });
});
