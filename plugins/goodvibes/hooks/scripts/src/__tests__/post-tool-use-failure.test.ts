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

// Create mock functions that persist across module resets
const mockReadHookInput = vi.fn();
const mockLoadAnalytics = vi.fn();
const mockSaveAnalytics = vi.fn();
const mockDebug = vi.fn();
const mockLogError = vi.fn();
const mockCreateResponse = vi.fn((opts: unknown) => ({ continue: true, ...opts }));
const mockRespond = vi.fn();
const mockLoadState = vi.fn();
const mockSaveState = vi.fn();
const mockTrackError = vi.fn((state: unknown) => state);
const mockGetErrorState = vi.fn();
const mockGenerateErrorSignature = vi.fn();
const mockCategorizeError = vi.fn();
const mockCreateErrorState = vi.fn();
const mockBuildFixContext = vi.fn();
const mockFindMatchingPattern = vi.fn();
const mockGetSuggestedFix = vi.fn();
const mockGetResearchHints = vi.fn();
const mockSaveRetry = vi.fn();
const mockGetRetryCount = vi.fn();
const mockGetCurrentPhase = vi.fn();
const mockShouldEscalatePhase = vi.fn();
const mockGetPhaseDescription = vi.fn();
const mockGetRemainingAttempts = vi.fn();
const mockHasExhaustedRetries = vi.fn();
const mockGenerateRetrySignature = vi.fn();
const mockWriteFailure = vi.fn();

// Mock all external dependencies before any imports
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('{}'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
}));

// Mock shared module
vi.mock('../shared/index.js', () => ({
  respond: (...args: unknown[]) => mockRespond(...args),
  readHookInput: () => mockReadHookInput(),
  loadAnalytics: () => mockLoadAnalytics(),
  saveAnalytics: (...args: unknown[]) => mockSaveAnalytics(...args),
  debug: (...args: unknown[]) => mockDebug(...args),
  logError: (...args: unknown[]) => mockLogError(...args),
  createResponse: (...args: unknown[]) => mockCreateResponse(...args),
  PROJECT_ROOT: '/test/project',
}));

// Mock state module
vi.mock('../state.js', () => ({
  loadState: (...args: unknown[]) => mockLoadState(...args),
  saveState: (...args: unknown[]) => mockSaveState(...args),
  trackError: (...args: unknown[]) => mockTrackError(...args),
  getErrorState: (...args: unknown[]) => mockGetErrorState(...args),
}));

// Mock fix-loop module
vi.mock('../automation/fix-loop.js', () => ({
  generateErrorSignature: (...args: unknown[]) => mockGenerateErrorSignature(...args),
  categorizeError: (...args: unknown[]) => mockCategorizeError(...args),
  createErrorState: (...args: unknown[]) => mockCreateErrorState(...args),
  buildFixContext: (...args: unknown[]) => mockBuildFixContext(...args),
}));

// Mock post-tool-use-failure index
vi.mock('../post-tool-use-failure/index.js', () => ({
  findMatchingPattern: (...args: unknown[]) => mockFindMatchingPattern(...args),
  getSuggestedFix: (...args: unknown[]) => mockGetSuggestedFix(...args),
  getResearchHints: (...args: unknown[]) => mockGetResearchHints(...args),
}));

// Mock retry-tracker module
vi.mock('../post-tool-use-failure/retry-tracker.js', () => ({
  saveRetry: (...args: unknown[]) => mockSaveRetry(...args),
  getRetryCount: (...args: unknown[]) => mockGetRetryCount(...args),
  getCurrentPhase: (...args: unknown[]) => mockGetCurrentPhase(...args),
  shouldEscalatePhase: (...args: unknown[]) => mockShouldEscalatePhase(...args),
  getPhaseDescription: (...args: unknown[]) => mockGetPhaseDescription(...args),
  getRemainingAttempts: (...args: unknown[]) => mockGetRemainingAttempts(...args),
  hasExhaustedRetries: (...args: unknown[]) => mockHasExhaustedRetries(...args),
  generateErrorSignature: (...args: unknown[]) => mockGenerateRetrySignature(...args),
}));

// Mock memory failures module
vi.mock('../memory/failures.js', () => ({
  writeFailure: (...args: unknown[]) => mockWriteFailure(...args),
}));

describe('post-tool-use-failure hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Reset default implementations
    mockCreateResponse.mockImplementation((opts: unknown) => ({ continue: true, ...opts }));
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
  });

  afterEach(() => {
    vi.resetModules();
  });

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

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      expect(mockReadHookInput).toHaveBeenCalled();
      expect(mockLoadState).toHaveBeenCalledWith('/test/project');
      expect(mockCategorizeError).toHaveBeenCalledWith('Command failed: npm install');
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

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      expect(mockGenerateErrorSignature).toHaveBeenCalledWith('unknown', 'Error message');
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

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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
          { phase: 1, strategy: 'npm install', succeeded: false, timestamp: '2025-01-01' },
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
      mockLoadState.mockResolvedValue({ errors: { 'sig-123': existingErrorState } });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(2);
      mockGetRetryCount.mockResolvedValue(3);

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      expect(mockGetErrorState).toHaveBeenCalled();
      expect(mockDebug).toHaveBeenCalledWith('Existing error state', expect.any(Object));
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
      mockLoadState.mockResolvedValue({ errors: { 'sig-123': existingErrorState } });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(1);
      mockShouldEscalatePhase.mockResolvedValue(true);

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      expect(mockShouldEscalatePhase).toHaveBeenCalled();
      expect(mockDebug).toHaveBeenCalledWith('Escalated to phase', { phase: 2 });
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
      mockLoadState.mockResolvedValue({ errors: { 'sig-123': existingErrorState } });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(3);
      mockShouldEscalatePhase.mockResolvedValue(true);

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      // Should not have escalated since phase is already 3
      expect(mockDebug).not.toHaveBeenCalledWith('Escalated to phase', expect.any(Object));
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

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      expect(mockWriteFailure).toHaveBeenCalledWith('/test', expect.objectContaining({
        approach: expect.stringContaining('Bash failed'),
        reason: expect.stringContaining('Exhausted'),
        suggestion: 'Manual intervention required',
      }));
      expect(mockDebug).toHaveBeenCalledWith('All phases exhausted, logging to memory');
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

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      expect(mockDebug).toHaveBeenCalledWith('Failed to write failure to memory', expect.any(Object));
    });

    it('should track tool failures in analytics when analytics exist', async () => {
      const analytics = {
        session_id: 'test',
        issues_found: 5,
        tool_failures: [{ tool: 'Edit', error: 'previous error', timestamp: '2025-01-01' }],
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

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      expect(mockSaveAnalytics).toHaveBeenCalledWith(expect.objectContaining({
        issues_found: 6,
        tool_failures: expect.arrayContaining([
          expect.objectContaining({ tool: 'Bash', error: 'Command failed' }),
        ]),
      }));
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

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      expect(mockSaveAnalytics).toHaveBeenCalledWith(expect.objectContaining({
        tool_failures: expect.arrayContaining([
          expect.objectContaining({ tool: 'Edit' }),
        ]),
      }));
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

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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
          { phase: 1, strategy: 'npm run build', succeeded: false, timestamp: '2025-01-01' },
          { phase: 1, strategy: 'rm -rf node_modules', succeeded: false, timestamp: '2025-01-01' },
          { phase: 2, strategy: 'npm ci', succeeded: false, timestamp: '2025-01-01' },
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
      mockLoadState.mockResolvedValue({ errors: { 'sig-123': existingErrorState } });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(2);

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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
      mockLoadState.mockResolvedValue({ errors: { 'sig-123': existingErrorState } });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(2);
      mockGetResearchHints.mockReturnValue({
        official: ['typescriptlang.org error reference', 'typescript handbook'],
        community: [],
      });

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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
      mockLoadState.mockResolvedValue({ errors: { 'sig-123': existingErrorState } });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(3);
      mockGetResearchHints.mockReturnValue({
        official: ['prisma.io/docs'],
        community: ['stackoverflow database errors', 'github ORM issues'],
      });

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      expect(mockCreateResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('WARNING'),
        })
      );
    });

    it('should handle main hook errors gracefully', async () => {
      mockReadHookInput.mockRejectedValue(new Error('stdin read failed'));

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      expect(mockLogError).toHaveBeenCalledWith('PostToolUseFailure main', expect.any(Error));
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
      mockLoadState.mockResolvedValue({ errors: { 'sig-123': existingErrorState } });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(5); // Invalid high value

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      // Phase should be clamped to 3 (max valid value)
      expect(mockDebug).toHaveBeenCalledWith('Existing error state', expect.objectContaining({
        phase: 3,
      }));
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
      mockLoadState.mockResolvedValue({ errors: { 'sig-123': existingErrorState } });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(0); // Invalid low value

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      // Phase should be clamped to 1 (min valid value)
      expect(mockDebug).toHaveBeenCalledWith('Existing error state', expect.objectContaining({
        phase: 1,
      }));
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
      mockLoadState.mockResolvedValue({ errors: { 'sig-123': existingErrorState } });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(2);
      // file_not_found has empty official hints
      mockGetResearchHints.mockReturnValue({ official: [], community: [] });

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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
      mockLoadState.mockResolvedValue({ errors: { 'sig-123': existingErrorState } });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(3);
      // file_not_found has empty community hints
      mockGetResearchHints.mockReturnValue({ official: [], community: [] });

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      // Error message should be truncated in failure.approach
      expect(mockWriteFailure).toHaveBeenCalledWith('/test', expect.objectContaining({
        approach: expect.stringMatching(/^Bash failed: A{100}$/),
      }));
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

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      // Debug should log truncated error
      expect(mockDebug).toHaveBeenCalledWith('PostToolUseFailure received input', expect.objectContaining({
        error: 'B'.repeat(200),
      }));
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

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

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
      mockLoadState.mockResolvedValue({ errors: { 'sig-123': existingErrorState } });
      mockGetErrorState.mockReturnValue(existingErrorState);
      mockGetCurrentPhase.mockResolvedValue(2);
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

      await import('../post-tool-use-failure.js');

      await vi.waitFor(() => {
        expect(mockRespond).toHaveBeenCalled();
      });

      // getResearchHints should be called with the pattern's category
      expect(mockGetResearchHints).toHaveBeenCalledWith('missing_import', 'cannot find module', 2);
    });
  });
});
