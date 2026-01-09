/**
 * Unit tests for post-tool-use-failure hook
 *
 * Tests cover:
 * - buildResearchHintsMessage for all phases
 * - isRecord type guard
 * - runPostToolUseFailureHook main flow
 * - Error signature generation and tracking
 * - Phase escalation logic
 * - Pattern matching and suggested fixes
 * - Analytics tracking
 * - Memory failure logging
 * - Response creation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('post-tool-use-failure hook', () => {
  // Mock functions
  let mockReadHookInput: ReturnType<typeof vi.fn>;
  let mockLoadAnalytics: ReturnType<typeof vi.fn>;
  let mockSaveAnalytics: ReturnType<typeof vi.fn>;
  let mockDebug: ReturnType<typeof vi.fn>;
  let mockLogError: ReturnType<typeof vi.fn>;
  let mockCreateResponse: ReturnType<typeof vi.fn>;
  let mockRespond: ReturnType<typeof vi.fn>;
  let mockLoadState: ReturnType<typeof vi.fn>;
  let mockSaveState: ReturnType<typeof vi.fn>;
  let mockTrackError: ReturnType<typeof vi.fn>;
  let mockGetErrorState: ReturnType<typeof vi.fn>;
  let mockGenerateErrorSignature: ReturnType<typeof vi.fn>;
  let mockCategorizeError: ReturnType<typeof vi.fn>;
  let mockCreateErrorState: ReturnType<typeof vi.fn>;
  let mockBuildFixContext: ReturnType<typeof vi.fn>;
  let mockFindMatchingPattern: ReturnType<typeof vi.fn>;
  let mockGetSuggestedFix: ReturnType<typeof vi.fn>;
  let mockGetResearchHints: ReturnType<typeof vi.fn>;
  let mockSaveRetry: ReturnType<typeof vi.fn>;
  let mockGetRetryCount: ReturnType<typeof vi.fn>;
  let mockGetCurrentPhase: ReturnType<typeof vi.fn>;
  let mockShouldEscalatePhase: ReturnType<typeof vi.fn>;
  let mockGetPhaseDescription: ReturnType<typeof vi.fn>;
  let mockGetRemainingAttempts: ReturnType<typeof vi.fn>;
  let mockHasExhaustedRetries: ReturnType<typeof vi.fn>;
  let mockGenerateRetrySignature: ReturnType<typeof vi.fn>;
  let mockWriteFailure: ReturnType<typeof vi.fn>;
  let mockBuildResearchHintsMessage: ReturnType<typeof vi.fn>;
  let mockBuildFixLoopResponse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();

    // Initialize mock functions
    mockReadHookInput = vi.fn();
    mockLoadAnalytics = vi.fn();
    mockSaveAnalytics = vi.fn();
    mockDebug = vi.fn();
    mockLogError = vi.fn();
    mockCreateResponse = vi.fn((opts: unknown) => ({
      continue: true,
      ...opts,
    }));
    mockRespond = vi.fn();
    mockLoadState = vi.fn();
    mockSaveState = vi.fn();
    mockTrackError = vi.fn((state: unknown) => state);
    mockGetErrorState = vi.fn();
    mockGenerateErrorSignature = vi.fn();
    mockCategorizeError = vi.fn();
    mockCreateErrorState = vi.fn();
    mockBuildFixContext = vi.fn();
    mockFindMatchingPattern = vi.fn();
    mockGetSuggestedFix = vi.fn();
    mockGetResearchHints = vi.fn();
    mockSaveRetry = vi.fn();
    mockGetRetryCount = vi.fn();
    mockGetCurrentPhase = vi.fn();
    mockShouldEscalatePhase = vi.fn();
    mockGetPhaseDescription = vi.fn();
    mockGetRemainingAttempts = vi.fn();
    mockHasExhaustedRetries = vi.fn();
    mockGenerateRetrySignature = vi.fn();
    mockWriteFailure = vi.fn();
    mockBuildResearchHintsMessage = vi.fn();
    mockBuildFixLoopResponse = vi.fn();

    // Default mock implementations
    mockRespond.mockReturnValue(undefined);
    mockCreateResponse.mockImplementation((opts: unknown) => ({
      continue: true,
      ...opts,
    }));
    mockLoadState.mockResolvedValue({ errors: {} });
    mockSaveState.mockResolvedValue(undefined);
    mockGenerateErrorSignature.mockReturnValue('sig-123');
    mockGenerateRetrySignature.mockReturnValue('retry-sig-123');
    mockCategorizeError.mockReturnValue('unknown');
    mockBuildFixContext.mockReturnValue('Fix context');
    mockGetSuggestedFix.mockReturnValue('Generic fix suggestion');
    mockGetResearchHints.mockReturnValue({ official: [], community: [] });
    mockGetCurrentPhase.mockResolvedValue(1);
    mockGetRetryCount.mockResolvedValue(0);
    mockShouldEscalatePhase.mockResolvedValue(false);
    mockHasExhaustedRetries.mockResolvedValue(false);
    mockGetPhaseDescription.mockReturnValue('Raw Attempts');
    mockGetRemainingAttempts.mockResolvedValue(2);
    mockTrackError.mockImplementation((state: unknown) => state);
    mockFindMatchingPattern.mockReturnValue(null);
    mockLoadAnalytics.mockResolvedValue(null);
    mockSaveAnalytics.mockResolvedValue(undefined);
    mockSaveRetry.mockResolvedValue(undefined);
    mockWriteFailure.mockResolvedValue(undefined);
    mockBuildResearchHintsMessage.mockReturnValue('');
    // Default implementation - tests will override this as needed
    mockBuildFixLoopResponse.mockImplementation((options: {
      pattern: { category: string } | null;
      category: string;
      suggestedFix: string;
      researchHints: string;
      exhausted: boolean;
      errorState: { fixStrategiesAttempted: unknown[]; phase: 1 | 2 | 3 };
    }) => {
      const phaseNames = ['Raw Attempts', 'Official Documentation', 'Community Solutions'];
      const phaseName = phaseNames[options.errorState.phase - 1] || 'Raw Attempts';
      const parts: string[] = [`[GoodVibes Fix Loop - Phase ${options.errorState.phase}/3: ${phaseName}]`];

      if (options.pattern) {
        parts.push(`Detected: ${options.pattern.category.replace(/_/g, ' ')}`);
      } else {
        parts.push(`Category: ${options.category}`);
      }

      parts.push('Suggested fix:');
      parts.push(options.suggestedFix);

      if (options.researchHints) {
        parts.push(options.researchHints);
      }

      if (options.errorState.fixStrategiesAttempted.length > 0) {
        parts.push('Previously attempted (failed):');
        parts.push('Try a DIFFERENT approach.');
      }

      if (options.exhausted) {
        parts.push('[WARNING] All fix phases exhausted. Consider:');
      }

      return parts.join('\n');
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  async function setupMocksAndImport() {
    // Mock fs/promises
    vi.doMock('fs/promises', () => ({
      readFile: vi.fn().mockResolvedValue('{}'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      access: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(undefined),
    }));

    // Mock shared module with isTestEnvironment = false so hook runs
    vi.doMock('../shared/index.js', () => ({
      respond: mockRespond,
      readHookInput: mockReadHookInput,
      loadAnalytics: mockLoadAnalytics,
      saveAnalytics: mockSaveAnalytics,
      debug: mockDebug,
      logError: mockLogError,
      createResponse: mockCreateResponse,
      PROJECT_ROOT: '/test/project',
      isTestEnvironment: () => false,
    }));

    // Mock state module
    vi.doMock('../state/index.js', () => ({
      loadState: mockLoadState,
      saveState: mockSaveState,
      trackError: mockTrackError,
      getErrorState: mockGetErrorState,
    }));

    // Mock fix-loop module
    vi.doMock('../automation/fix-loop.js', () => ({
      generateErrorSignature: mockGenerateErrorSignature,
      categorizeError: mockCategorizeError,
      createErrorState: mockCreateErrorState,
      buildFixContext: mockBuildFixContext,
    }));

    // Mock post-tool-use-failure pattern-matcher
    vi.doMock('../post-tool-use-failure/pattern-matcher.js', () => ({
      findMatchingPattern: mockFindMatchingPattern,
      getSuggestedFix: mockGetSuggestedFix,
    }));

    // Mock post-tool-use-failure research-hints
    vi.doMock('../post-tool-use-failure/research-hints.js', () => ({
      getResearchHints: mockGetResearchHints,
    }));

    // Mock retry-tracker module
    vi.doMock('../post-tool-use-failure/retry-tracker.js', () => ({
      saveRetry: mockSaveRetry,
      getRetryCount: mockGetRetryCount,
      getCurrentPhase: mockGetCurrentPhase,
      shouldEscalatePhase: mockShouldEscalatePhase,
      getPhaseDescription: mockGetPhaseDescription,
      getRemainingAttempts: mockGetRemainingAttempts,
      hasExhaustedRetries: mockHasExhaustedRetries,
      generateErrorSignature: mockGenerateRetrySignature,
    }));

    // Mock memory failures module
    vi.doMock('../memory/failures.js', () => ({
      writeFailure: mockWriteFailure,
    }));

    // Mock response-builder module
    vi.doMock('../post-tool-use-failure/response-builder.js', () => ({
      buildResearchHintsMessage: mockBuildResearchHintsMessage,
      buildFixLoopResponse: mockBuildFixLoopResponse,
    }));

    // Import the module (this triggers the hook)
    await import('../post-tool-use-failure/index.js');

    // Allow async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  describe('runPostToolUseFailureHook main flow', () => {
    it('should process hook input and generate response for phase 1', async () => {
      const mockInput = {
        session_id: 'test-session',
        cwd: '/test/project',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'Command failed: npm install',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockCategorizeError.mockReturnValue('npm_install');
      mockGetErrorState.mockReturnValue(undefined);
      mockCreateErrorState.mockReturnValue({
        signature: 'sig-123',
        category: 'npm_install',
        phase: 1,
        attemptsThisPhase: 0,
        totalAttempts: 0,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      });
      mockFindMatchingPattern.mockReturnValue({
        category: 'npm_error',
        severity: 'medium',
        suggestedFix: 'Run npm install',
      });
      mockGetSuggestedFix.mockReturnValue('Run npm install');
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'test',
        issues_found: 0,
        tool_failures: [],
      });

      await setupMocksAndImport();

      expect(mockReadHookInput).toHaveBeenCalled();
      expect(mockLoadState).toHaveBeenCalledWith('/test/project');
      expect(mockCategorizeError).toHaveBeenCalledWith(
        'Command failed: npm install'
      );
    });

    it('should use PROJECT_ROOT when cwd is not provided', async () => {
      const mockInput = {
        session_id: 'test-session',
        cwd: '',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'Error message',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockGetErrorState.mockReturnValue(undefined);
      mockCreateErrorState.mockReturnValue({
        signature: 'sig-123',
        category: 'unknown',
        phase: 1,
        attemptsThisPhase: 0,
        totalAttempts: 0,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      });

      await setupMocksAndImport();

      // Should use PROJECT_ROOT (/test/project) when cwd is empty
      expect(mockLoadState).toHaveBeenCalledWith('/test/project');
    });

    it('should use "unknown" when tool_name is not provided', async () => {
      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        // No tool_name
        error: 'Error message',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockGetErrorState.mockReturnValue(undefined);
      mockCreateErrorState.mockReturnValue({
        signature: 'sig-123',
        category: 'unknown',
        phase: 1,
        attemptsThisPhase: 0,
        totalAttempts: 0,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      });

      await setupMocksAndImport();

      // The hook uses retry-tracker's generateErrorSignature with (errorMessage, toolName)
      expect(mockGenerateRetrySignature).toHaveBeenCalledWith(
        'Error message',
        'unknown'
      );
    });

    it('should handle non-string error and use "Unknown error"', async () => {
      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: { code: 123 }, // Object instead of string
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockGetErrorState.mockReturnValue(undefined);
      mockCreateErrorState.mockReturnValue({
        signature: 'sig-123',
        category: 'unknown',
        phase: 1,
        attemptsThisPhase: 0,
        totalAttempts: 0,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      });

      await setupMocksAndImport();

      expect(mockCategorizeError).toHaveBeenCalledWith('Unknown error');
    });

    it('should handle existing error state with phase synchronization', async () => {
      const existingErrorState = {
        signature: 'sig-123',
        category: 'npm_install',
        phase: 2 as 1 | 2 | 3,
        attemptsThisPhase: 1,
        totalAttempts: 3,
        fixStrategiesAttempted: [
          {
            phase: 1,
            strategy: 'npm install',
            succeeded: false,
            timestamp: '2025-01-01',
          },
        ],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      };

      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'npm ERR! ERESOLVE',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockLoadState.mockResolvedValue({
        errors: { 'sig-123': existingErrorState },
      });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(2);
      mockGetRetryCount.mockResolvedValue(3);

      await setupMocksAndImport();

      expect(mockGetErrorState).toHaveBeenCalled();
      expect(mockDebug).toHaveBeenCalledWith(
        'Existing error state',
        expect.any(Object)
      );
    });

    it('should escalate phase when shouldEscalatePhase returns true', async () => {
      const existingErrorState = {
        signature: 'sig-123',
        category: 'typescript_error',
        phase: 1 as 1 | 2 | 3,
        attemptsThisPhase: 3,
        totalAttempts: 3,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      };

      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'typescript type error',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockLoadState.mockResolvedValue({
        errors: { 'sig-123': existingErrorState },
      });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(1);
      mockShouldEscalatePhase.mockResolvedValue(true);

      await setupMocksAndImport();

      expect(mockShouldEscalatePhase).toHaveBeenCalled();
      expect(mockDebug).toHaveBeenCalledWith('Escalated to phase', {
        phase: 2,
      });
    });

    it('should not escalate phase when already at phase 3', async () => {
      const existingErrorState = {
        signature: 'sig-123',
        category: 'test_failure',
        phase: 3 as 1 | 2 | 3,
        attemptsThisPhase: 2,
        totalAttempts: 8,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      };

      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'test failure',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockLoadState.mockResolvedValue({
        errors: { 'sig-123': existingErrorState },
      });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(3);
      mockShouldEscalatePhase.mockResolvedValue(true);

      await setupMocksAndImport();

      // Should not have escalated since phase is already 3
      expect(mockDebug).not.toHaveBeenCalledWith(
        'Escalated to phase',
        expect.any(Object)
      );
    });

    it('should log failure to memory when all phases exhausted', async () => {
      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'Exhausted error - build failure',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockGetErrorState.mockReturnValue(undefined);
      mockCreateErrorState.mockReturnValue({
        signature: 'sig-123',
        category: 'build_failure',
        phase: 3 as 1 | 2 | 3,
        attemptsThisPhase: 2,
        totalAttempts: 6,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      });
      mockHasExhaustedRetries.mockResolvedValue(true);

      await setupMocksAndImport();

      expect(mockWriteFailure).toHaveBeenCalledWith(
        '/test',
        expect.objectContaining({
          approach: expect.stringContaining('Bash failed'),
          reason: expect.stringContaining('Exhausted'),
          suggestion: 'Manual intervention required',
        })
      );
      expect(mockDebug).toHaveBeenCalledWith(
        'All phases exhausted, logging to memory'
      );
    });

    it('should handle writeFailure error gracefully', async () => {
      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'Exhausted error',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockGetErrorState.mockReturnValue(undefined);
      mockCreateErrorState.mockReturnValue({
        signature: 'sig-123',
        category: 'unknown',
        phase: 3 as 1 | 2 | 3,
        attemptsThisPhase: 2,
        totalAttempts: 6,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      });
      mockHasExhaustedRetries.mockResolvedValue(true);
      mockWriteFailure.mockRejectedValue(new Error('Write failed'));

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith(
        'Failed to write failure to memory',
        expect.any(Object)
      );
    });

    it('should track tool failures in analytics when analytics exist', async () => {
      const analytics = {
        session_id: 'test',
        issues_found: 5,
        tool_failures: [
          { tool: 'Edit', error: 'previous error', timestamp: '2025-01-01' },
        ],
      };

      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'Command failed',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockGetErrorState.mockReturnValue(undefined);
      mockCreateErrorState.mockReturnValue({
        signature: 'sig-123',
        category: 'unknown',
        phase: 1 as 1 | 2 | 3,
        attemptsThisPhase: 0,
        totalAttempts: 0,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      });
      mockLoadAnalytics.mockResolvedValue(analytics);

      await setupMocksAndImport();

      expect(mockSaveAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          issues_found: 6,
          tool_failures: expect.arrayContaining([
            expect.objectContaining({ tool: 'Bash', error: 'Command failed' }),
          ]),
        })
      );
    });

    it('should initialize tool_failures array if not present in analytics', async () => {
      const analytics = {
        session_id: 'test',
        issues_found: 0,
        // No tool_failures array
      };

      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Edit',
        error: 'File not found',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockGetErrorState.mockReturnValue(undefined);
      mockCreateErrorState.mockReturnValue({
        signature: 'sig-123',
        category: 'file_not_found',
        phase: 1 as 1 | 2 | 3,
        attemptsThisPhase: 0,
        totalAttempts: 0,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      });
      mockLoadAnalytics.mockResolvedValue(analytics);

      await setupMocksAndImport();

      expect(mockSaveAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          tool_failures: expect.arrayContaining([
            expect.objectContaining({ tool: 'Edit' }),
          ]),
        })
      );
    });

    it('should include pattern category in response when pattern is found', async () => {
      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: "Cannot find module 'lodash'",
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockGetErrorState.mockReturnValue(undefined);
      mockCreateErrorState.mockReturnValue({
        signature: 'sig-123',
        category: 'npm_install',
        phase: 1 as 1 | 2 | 3,
        attemptsThisPhase: 0,
        totalAttempts: 0,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      });
      mockFindMatchingPattern.mockReturnValue({
        category: 'missing_import',
        severity: 'medium',
        suggestedFix: 'npm install lodash',
      });

      await setupMocksAndImport();

      // Check that response includes the detected pattern category
      expect(mockCreateResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('missing import'),
        })
      );
    });

    it('should include previous fix strategies in response', async () => {
      const existingErrorState = {
        signature: 'sig-123',
        category: 'build_failure',
        phase: 2 as 1 | 2 | 3,
        attemptsThisPhase: 1,
        totalAttempts: 4,
        fixStrategiesAttempted: [
          {
            phase: 1,
            strategy: 'npm run build',
            succeeded: false,
            timestamp: '2025-01-01',
          },
          {
            phase: 1,
            strategy: 'rm -rf node_modules',
            succeeded: false,
            timestamp: '2025-01-01',
          },
          {
            phase: 2,
            strategy: 'npm ci',
            succeeded: false,
            timestamp: '2025-01-01',
          },
        ],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      };

      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'build failure',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockLoadState.mockResolvedValue({
        errors: { 'sig-123': existingErrorState },
      });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(2);

      await setupMocksAndImport();

      expect(mockCreateResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('Previously attempted'),
        })
      );
    });

    it('should include research hints in response for phase 2', async () => {
      const existingErrorState = {
        signature: 'sig-123',
        category: 'typescript_error',
        phase: 2 as 1 | 2 | 3,
        attemptsThisPhase: 0,
        totalAttempts: 3,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      };

      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'typescript error',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockLoadState.mockResolvedValue({
        errors: { 'sig-123': existingErrorState },
      });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(2);
      mockGetResearchHints.mockReturnValue({
        official: ['typescriptlang.org error reference', 'typescript handbook'],
        community: [],
      });

      await setupMocksAndImport();

      expect(mockCreateResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('Phase 2'),
        })
      );
    });

    it('should include community hints in response for phase 3', async () => {
      const existingErrorState = {
        signature: 'sig-123',
        category: 'database_error',
        phase: 3 as 1 | 2 | 3,
        attemptsThisPhase: 0,
        totalAttempts: 6,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      };

      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'database connection failed',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockLoadState.mockResolvedValue({
        errors: { 'sig-123': existingErrorState },
      });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(3);
      mockGetResearchHints.mockReturnValue({
        official: ['prisma.io/docs'],
        community: ['stackoverflow database errors', 'github ORM issues'],
      });

      await setupMocksAndImport();

      expect(mockCreateResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('Phase 3'),
        })
      );
    });

    it('should include exhaustion warning in response when exhausted', async () => {
      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'final error',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockGetErrorState.mockReturnValue(undefined);
      mockCreateErrorState.mockReturnValue({
        signature: 'sig-123',
        category: 'unknown',
        phase: 3 as 1 | 2 | 3,
        attemptsThisPhase: 2,
        totalAttempts: 6,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      });
      mockHasExhaustedRetries.mockResolvedValue(true);

      await setupMocksAndImport();

      expect(mockCreateResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('WARNING'),
        })
      );
    });

    it('should handle main hook errors gracefully', async () => {
      mockReadHookInput.mockRejectedValue(new Error('stdin read failed'));

      await setupMocksAndImport();

      expect(mockLogError).toHaveBeenCalledWith(
        'PostToolUseFailure main',
        expect.any(Error)
      );
    });

    it('should clamp phase to valid range 1-3 when syncing from retry tracker (high value)', async () => {
      const existingErrorState = {
        signature: 'sig-123',
        category: 'unknown',
        phase: 1 as 1 | 2 | 3,
        attemptsThisPhase: 1,
        totalAttempts: 1,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      };

      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'error message',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockLoadState.mockResolvedValue({
        errors: { 'sig-123': existingErrorState },
      });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(5); // Invalid high value

      await setupMocksAndImport();

      // Phase should be clamped to 3 (max valid value)
      expect(mockDebug).toHaveBeenCalledWith(
        'Existing error state',
        expect.objectContaining({
          phase: 3,
        })
      );
    });

    it('should clamp phase to minimum 1 when syncing from retry tracker (low value)', async () => {
      const existingErrorState = {
        signature: 'sig-123',
        category: 'unknown',
        phase: 1 as 1 | 2 | 3,
        attemptsThisPhase: 1,
        totalAttempts: 1,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      };

      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'error message',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockLoadState.mockResolvedValue({
        errors: { 'sig-123': existingErrorState },
      });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(0); // Invalid low value

      await setupMocksAndImport();

      // Phase should be clamped to 1 (min valid value)
      expect(mockDebug).toHaveBeenCalledWith(
        'Existing error state',
        expect.objectContaining({
          phase: 1,
        })
      );
    });

    it('should handle empty research hints for phase 2', async () => {
      const existingErrorState = {
        signature: 'sig-123',
        category: 'file_not_found',
        phase: 2 as 1 | 2 | 3,
        attemptsThisPhase: 0,
        totalAttempts: 1,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      };

      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'file not found',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockLoadState.mockResolvedValue({
        errors: { 'sig-123': existingErrorState },
      });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(2);
      mockFindMatchingPattern.mockReturnValue(null);
      // file_not_found has empty official hints
      mockGetResearchHints.mockReturnValue({ official: [], community: [] });

      await setupMocksAndImport();

      // Response should not include Phase 2 hints section since they are empty
      const call = mockCreateResponse.mock.calls[0][0];
      expect(call.systemMessage).not.toContain('[Phase 2]');
    });

    it('should handle empty community hints for phase 3', async () => {
      const existingErrorState = {
        signature: 'sig-123',
        category: 'file_not_found',
        phase: 3 as 1 | 2 | 3,
        attemptsThisPhase: 0,
        totalAttempts: 2,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      };

      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'file not found',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockLoadState.mockResolvedValue({
        errors: { 'sig-123': existingErrorState },
      });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(3);
      mockFindMatchingPattern.mockReturnValue(null);
      // file_not_found has empty community hints
      mockGetResearchHints.mockReturnValue({ official: [], community: [] });

      await setupMocksAndImport();

      // Response should not include Phase 3 hints section since they are empty
      const call = mockCreateResponse.mock.calls[0][0];
      expect(call.systemMessage).not.toContain('[Phase 3]');
    });

    it('should truncate long error messages in failure logging', async () => {
      const longError = 'A'.repeat(500); // Longer than ERROR_WHAT_LENGTH (100)

      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: longError,
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockGetErrorState.mockReturnValue(undefined);
      mockCreateErrorState.mockReturnValue({
        signature: 'sig-123',
        category: 'unknown',
        phase: 3 as 1 | 2 | 3,
        attemptsThisPhase: 2,
        totalAttempts: 6,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      });
      mockHasExhaustedRetries.mockResolvedValue(true);

      await setupMocksAndImport();

      // Error message should be truncated in failure.approach
      expect(mockWriteFailure).toHaveBeenCalledWith(
        '/test',
        expect.objectContaining({
          approach: expect.stringMatching(/^Bash failed: A{100}$/),
        })
      );
    });

    it('should truncate error preview in debug logging', async () => {
      const longError = 'B'.repeat(500); // Longer than ERROR_PREVIEW_LENGTH (200)

      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: longError,
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockGetErrorState.mockReturnValue(undefined);
      mockCreateErrorState.mockReturnValue({
        signature: 'sig-123',
        category: 'unknown',
        phase: 1 as 1 | 2 | 3,
        attemptsThisPhase: 0,
        totalAttempts: 0,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      });

      await setupMocksAndImport();

      // Debug should log truncated error
      expect(mockDebug).toHaveBeenCalledWith(
        'PostToolUseFailure received input',
        expect.objectContaining({
          error: 'B'.repeat(200),
        })
      );
    });

    it('should show category when no pattern is found', async () => {
      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'some random error',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockGetErrorState.mockReturnValue(undefined);
      mockCreateErrorState.mockReturnValue({
        signature: 'sig-123',
        category: 'unknown',
        phase: 1 as 1 | 2 | 3,
        attemptsThisPhase: 0,
        totalAttempts: 0,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      });
      mockCategorizeError.mockReturnValue('unknown');
      mockFindMatchingPattern.mockReturnValue(null);

      await setupMocksAndImport();

      expect(mockCreateResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('Category: unknown'),
        })
      );
    });

    it('should use pattern category for research hints when pattern is found', async () => {
      const mockInput = {
        session_id: 'test-session',
        cwd: '/test',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'cannot find module',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
      };

      const existingErrorState = {
        signature: 'sig-123',
        category: 'npm_install',
        phase: 2 as 1 | 2 | 3,
        attemptsThisPhase: 0,
        totalAttempts: 2,
        fixStrategiesAttempted: [],
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
      };

      mockReadHookInput.mockResolvedValue(mockInput);
      mockLoadState.mockResolvedValue({
        errors: { 'sig-123': existingErrorState },
      });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(2);
      mockCategorizeError.mockReturnValue('npm_install');
      // Pattern found with different category
      mockFindMatchingPattern.mockReturnValue({
        category: 'missing_import',
        severity: 'medium',
        suggestedFix: 'Install missing package',
      });
      mockGetResearchHints.mockReturnValue({
        official: ['npm docs'],
        community: [],
      });

      await setupMocksAndImport();

      // getResearchHints should be called with the pattern's category
      expect(mockGetResearchHints).toHaveBeenCalledWith(
        'missing_import',
        'cannot find module',
        2
      );
    });
  });
});
