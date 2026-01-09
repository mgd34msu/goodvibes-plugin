/**
 * Unit tests for subagent-stop hook main module
 *
 * Tests cover:
 * - createResponse function (all branches)
 * - runSubagentStopHook function
 *   - Tracking found with transcript path
 *   - Tracking found without transcript path
 *   - No tracking but transcript exists
 *   - No tracking and no transcript
 *   - Validation errors
 *   - Test failures
 *   - Analytics update scenarios
 *   - Error handling (catch block)
 * - Field name variations (agent_id/subagent_id, agent_type/subagent_type, etc.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('subagent-stop hook', () => {
  // Mock functions
  let mockRespond: ReturnType<typeof vi.fn>;
  let mockReadHookInput: ReturnType<typeof vi.fn>;
  let mockLoadAnalytics: ReturnType<typeof vi.fn>;
  let mockSaveAnalytics: ReturnType<typeof vi.fn>;
  let mockDebug: ReturnType<typeof vi.fn>;
  let mockLogError: ReturnType<typeof vi.fn>;
  let mockGetAgentTracking: ReturnType<typeof vi.fn>;
  let mockRemoveAgentTracking: ReturnType<typeof vi.fn>;
  let mockWriteTelemetryEntry: ReturnType<typeof vi.fn>;
  let mockBuildTelemetryEntry: ReturnType<typeof vi.fn>;
  let mockValidateAgentOutput: ReturnType<typeof vi.fn>;
  let mockVerifyAgentTests: ReturnType<typeof vi.fn>;
  let mockLoadState: ReturnType<typeof vi.fn>;
  let mockSaveState: ReturnType<typeof vi.fn>;
  const defaultState = {
    session: {
      id: 'test-session',
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
    build: { lastRun: null, status: 'unknown', errors: [], fixAttempts: 0 },
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
  };

  const defaultTracking = {
    agent_id: 'agent-123',
    agent_type: 'test-engineer',
    session_id: 'session-456',
    project: '/workspace/project',
    project_name: 'my-project',
    started_at: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
    git_branch: 'main',
    git_commit: 'abc1234',
  };

  const defaultTelemetryEntry = {
    event: 'subagent_complete',
    agent_id: 'agent-123',
    agent_type: 'test-engineer',
    session_id: 'session-456',
    project: '/workspace/project',
    project_name: 'my-project',
    started_at: defaultTracking.started_at,
    ended_at: new Date().toISOString(),
    duration_ms: 60000,
    status: 'completed',
    keywords: ['test-engineer', 'typescript'],
    files_modified: ['/src/test.ts'],
    tools_used: ['Write', 'Bash'],
    summary: 'Completed testing',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Initialize mock functions
    mockRespond = vi.fn();
    mockReadHookInput = vi.fn();
    mockLoadAnalytics = vi.fn();
    mockSaveAnalytics = vi.fn();
    mockDebug = vi.fn();
    mockLogError = vi.fn();
    mockGetAgentTracking = vi.fn();
    mockRemoveAgentTracking = vi.fn();
    mockWriteTelemetryEntry = vi.fn();
    mockBuildTelemetryEntry = vi.fn();
    mockValidateAgentOutput = vi.fn();
    mockVerifyAgentTests = vi.fn();
    mockLoadState = vi.fn();
    mockSaveState = vi.fn();
  });

  afterEach(() => {
    vi.resetModules();
  });

  async function setupMocksAndImport() {
    // Set default mock implementations if not already set
    if (!mockReadHookInput.getMockImplementation()) {
      mockReadHookInput.mockResolvedValue({
        session_id: 'session-456',
        transcript_path: '/test/transcript',
        cwd: '/workspace/project',
        permission_mode: 'default',
        hook_event_name: 'SubagentStop',
        agent_id: 'agent-123',
        agent_type: 'test-engineer',
        agent_transcript_path: '/path/to/agent/transcript.jsonl',
      });
    }

    if (!mockLoadState.getMockImplementation()) {
      mockLoadState.mockResolvedValue(defaultState);
    }

    if (!mockSaveState.getMockImplementation()) {
      mockSaveState.mockResolvedValue(undefined);
    }

    if (!mockGetAgentTracking.getMockImplementation()) {
      mockGetAgentTracking.mockResolvedValue(defaultTracking);
    }

    if (!mockRemoveAgentTracking.getMockImplementation()) {
      mockRemoveAgentTracking.mockResolvedValue(undefined);
    }

    if (!mockWriteTelemetryEntry.getMockImplementation()) {
      mockWriteTelemetryEntry.mockResolvedValue(undefined);
    }

    if (!mockBuildTelemetryEntry.getMockImplementation()) {
      mockBuildTelemetryEntry.mockResolvedValue(defaultTelemetryEntry);
    }

    if (!mockLoadAnalytics.getMockImplementation()) {
      mockLoadAnalytics.mockResolvedValue(null);
    }

    if (!mockSaveAnalytics.getMockImplementation()) {
      mockSaveAnalytics.mockResolvedValue(undefined);
    }

    if (!mockValidateAgentOutput.getMockImplementation()) {
      mockValidateAgentOutput.mockResolvedValue({
        valid: true,
        filesModified: ['/src/test.ts'],
        errors: [],
        state: defaultState,
      });
    }

    if (!mockVerifyAgentTests.getMockImplementation()) {
      mockVerifyAgentTests.mockResolvedValue({
        ran: true,
        passed: true,
        summary: 'All tests passed',
      });
    }

    // Mock shared module with isTestEnvironment = false so hook runs
    vi.doMock('../shared/index.js', () => ({
      respond: mockRespond,
      readHookInput: mockReadHookInput,
      loadAnalytics: mockLoadAnalytics,
      saveAnalytics: mockSaveAnalytics,
      debug: mockDebug,
      logError: mockLogError,
      isTestEnvironment: () => false,
    }));

    // Mock telemetry module
    vi.doMock('../subagent-stop/telemetry.js', () => ({
      getAgentTracking: mockGetAgentTracking,
      removeAgentTracking: mockRemoveAgentTracking,
      writeTelemetryEntry: mockWriteTelemetryEntry,
      buildTelemetryEntry: mockBuildTelemetryEntry,
    }));

    // Mock output validation module
    vi.doMock('../subagent-stop/output-validation.js', () => ({
      validateAgentOutput: mockValidateAgentOutput,
    }));

    // Mock test verification module
    vi.doMock('../subagent-stop/test-verification.js', () => ({
      verifyAgentTests: mockVerifyAgentTests,
    }));

    // Mock state module
    vi.doMock('../state/index.js', () => ({
      loadState: mockLoadState,
      saveState: mockSaveState,
    }));

    // Import the module (this triggers the hook)
    await import('../subagent-stop/index.js');

    // Allow async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
    await vi.waitFor(() => expect(mockRespond).toHaveBeenCalled(), { timeout: 1000 });
  }

  describe('runSubagentStopHook', () => {
    it('should complete successfully with tracking and transcript', async () => {
      await setupMocksAndImport();

      // Verify debug logging
      expect(mockDebug).toHaveBeenCalledWith('SubagentStop hook starting');
      expect(mockDebug).toHaveBeenCalledWith(
        'Raw input shape:',
        expect.any(Array)
      );
      expect(mockDebug).toHaveBeenCalledWith(
        'SubagentStop received input',
        expect.objectContaining({
          agent_id: 'agent-123',
          agent_type: 'test-engineer',
        })
      );

      // Verify tracking lookup
      expect(mockGetAgentTracking).toHaveBeenCalledWith(
        '/workspace/project',
        'agent-123'
      );
      expect(mockDebug).toHaveBeenCalledWith(
        'Found matching tracking entry',
        expect.any(Object)
      );

      // Verify validation
      expect(mockValidateAgentOutput).toHaveBeenCalledWith(
        '/workspace/project',
        '/path/to/agent/transcript.jsonl',
        defaultState
      );
      expect(mockDebug).toHaveBeenCalledWith(
        'Validation result',
        expect.any(Object)
      );

      // Verify test verification
      expect(mockVerifyAgentTests).toHaveBeenCalledWith(
        '/workspace/project',
        ['/src/test.ts'],
        defaultState
      );
      expect(mockDebug).toHaveBeenCalledWith(
        'Test verification result',
        expect.any(Object)
      );

      // Verify telemetry
      expect(mockBuildTelemetryEntry).toHaveBeenCalledWith(
        defaultTracking,
        '/path/to/agent/transcript.jsonl',
        'completed'
      );
      expect(mockWriteTelemetryEntry).toHaveBeenCalledWith(
        '/workspace/project',
        defaultTelemetryEntry
      );
      expect(mockDebug).toHaveBeenCalledWith(
        'Telemetry entry written',
        expect.any(Object)
      );

      // Verify tracking removal
      expect(mockRemoveAgentTracking).toHaveBeenCalledWith(
        '/workspace/project',
        'agent-123'
      );
      expect(mockDebug).toHaveBeenCalledWith('Removed agent tracking', {
        agent_id: 'agent-123',
      });

      // Verify state save
      expect(mockSaveState).toHaveBeenCalled();

      // Verify response
      const responseCall = mockRespond.mock.calls[0][0];
      expect(responseCall.continue).toBe(true);
      expect(responseCall.output).toBeDefined();
      expect(responseCall.output.telemetryWritten).toBe(true);
      expect(responseCall.output.agentId).toBe('agent-123');
      expect(responseCall.output.agentType).toBe('test-engineer');
      expect(responseCall.output.durationMs).toBeGreaterThan(0);
    });

    it('should use subagent_id when agent_id is not provided', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'session-456',
        transcript_path: '/test/transcript',
        cwd: '/workspace/project',
        permission_mode: 'default',
        hook_event_name: 'SubagentStop',
        subagent_id: 'subagent-789',
        subagent_type: 'backend-engineer',
        subagent_transcript_path: '/path/to/subagent/transcript.jsonl',
      });

      mockGetAgentTracking.mockResolvedValue({
        ...defaultTracking,
        agent_id: 'subagent-789',
        agent_type: 'backend-engineer',
      });

      await setupMocksAndImport();

      expect(mockGetAgentTracking).toHaveBeenCalledWith(
        '/workspace/project',
        'subagent-789'
      );
      expect(mockValidateAgentOutput).toHaveBeenCalledWith(
        '/workspace/project',
        '/path/to/subagent/transcript.jsonl',
        expect.any(Object)
      );
    });

    it('should use process.cwd() when input.cwd is not provided', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'session-456',
        transcript_path: '/test/transcript',
        cwd: undefined,
        permission_mode: 'default',
        hook_event_name: 'SubagentStop',
        agent_id: 'agent-123',
        agent_type: 'test-engineer',
        agent_transcript_path: '/path/to/transcript.jsonl',
      });

      await setupMocksAndImport();

      // Should use process.cwd() which is the current directory
      expect(mockLoadState).toHaveBeenCalledWith(process.cwd());
    });

    it('should handle tracking not found but transcript exists', async () => {
      mockGetAgentTracking.mockResolvedValue(null);

      await setupMocksAndImport();

      // Should log no matching tracking entry
      expect(mockDebug).toHaveBeenCalledWith(
        'No matching tracking entry found',
        expect.any(Object)
      );

      // Should still validate agent output
      expect(mockValidateAgentOutput).toHaveBeenCalled();

      // Should NOT write telemetry
      expect(mockWriteTelemetryEntry).not.toHaveBeenCalled();
      expect(mockRemoveAgentTracking).not.toHaveBeenCalled();

      // Should save state
      expect(mockSaveState).toHaveBeenCalled();

      // Response should have telemetryWritten: false
      const responseCall = mockRespond.mock.calls[0][0];
      expect(responseCall.output.telemetryWritten).toBe(false);
    });

    it('should handle no tracking and no transcript', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'session-456',
        transcript_path: '/test/transcript',
        cwd: '/workspace/project',
        permission_mode: 'default',
        hook_event_name: 'SubagentStop',
        agent_id: '',
        agent_type: 'test-engineer',
        agent_transcript_path: '',
      });

      mockGetAgentTracking.mockResolvedValue(null);

      await setupMocksAndImport();

      // Should NOT call validation or telemetry
      expect(mockValidateAgentOutput).not.toHaveBeenCalled();
      expect(mockWriteTelemetryEntry).not.toHaveBeenCalled();

      // Response should be minimal
      const responseCall = mockRespond.mock.calls[0][0];
      expect(responseCall.continue).toBe(true);
      expect(responseCall.output.telemetryWritten).toBe(false);
    });

    it('should handle tracking found without transcript path', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'session-456',
        transcript_path: '/test/transcript',
        cwd: '/workspace/project',
        permission_mode: 'default',
        hook_event_name: 'SubagentStop',
        agent_id: 'agent-123',
        agent_type: 'test-engineer',
        agent_transcript_path: '',
      });

      await setupMocksAndImport();

      // Should NOT call validation since no transcript
      expect(mockValidateAgentOutput).not.toHaveBeenCalled();
      expect(mockVerifyAgentTests).not.toHaveBeenCalled();

      // Should still write telemetry
      expect(mockBuildTelemetryEntry).toHaveBeenCalled();
      expect(mockWriteTelemetryEntry).toHaveBeenCalled();
    });

    it('should report validation errors in system message', async () => {
      mockValidateAgentOutput.mockResolvedValue({
        valid: false,
        filesModified: ['/src/test.ts'],
        errors: ['Type error in test.ts', 'Missing import'],
        state: defaultState,
      });

      await setupMocksAndImport();

      // Should build telemetry with failed status
      expect(mockBuildTelemetryEntry).toHaveBeenCalledWith(
        defaultTracking,
        '/path/to/agent/transcript.jsonl',
        'failed'
      );

      // Response should have system message with errors
      const responseCall = mockRespond.mock.calls[0][0];
      expect(responseCall.systemMessage).toContain('[GoodVibes]');
      expect(responseCall.systemMessage).toContain('Validation errors');
      expect(responseCall.systemMessage).toContain('Type error in test.ts');
    });

    it('should report test failures in system message', async () => {
      mockVerifyAgentTests.mockResolvedValue({
        ran: true,
        passed: false,
        summary: '3 tests failed',
      });

      await setupMocksAndImport();

      // Should build telemetry with failed status
      expect(mockBuildTelemetryEntry).toHaveBeenCalledWith(
        defaultTracking,
        '/path/to/agent/transcript.jsonl',
        'failed'
      );

      // Response should have system message with test failures
      const responseCall = mockRespond.mock.calls[0][0];
      expect(responseCall.systemMessage).toContain('[GoodVibes]');
      expect(responseCall.systemMessage).toContain('Test failures');
      expect(responseCall.systemMessage).toContain('3 tests failed');
    });

    it('should report both validation errors and test failures', async () => {
      mockValidateAgentOutput.mockResolvedValue({
        valid: false,
        filesModified: ['/src/test.ts'],
        errors: ['Type error'],
        state: defaultState,
      });

      mockVerifyAgentTests.mockResolvedValue({
        ran: true,
        passed: false,
        summary: 'Tests failed',
      });

      await setupMocksAndImport();

      const responseCall = mockRespond.mock.calls[0][0];
      expect(responseCall.systemMessage).toContain('Validation errors');
      expect(responseCall.systemMessage).toContain('Test failures');
    });

    it('should update analytics when subagent entry is found', async () => {
      const startedAt = defaultTracking.started_at;
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'session-456',
        subagents_spawned: [
          { type: 'test-engineer', started_at: startedAt },
          { type: 'backend-engineer', started_at: '2025-01-01T00:00:00Z' },
        ],
      });

      await setupMocksAndImport();

      // Should update analytics
      expect(mockSaveAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          subagents_spawned: expect.arrayContaining([
            expect.objectContaining({
              type: 'test-engineer',
              completed_at: expect.any(String),
              success: true,
            }),
          ]),
        })
      );
    });

    it('should not update analytics when subagent entry is not found', async () => {
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'session-456',
        subagents_spawned: [
          { type: 'different-agent', started_at: '2025-01-01T00:00:00Z' },
        ],
      });

      await setupMocksAndImport();

      // Should NOT call saveAnalytics since no matching entry
      expect(mockSaveAnalytics).not.toHaveBeenCalled();
    });

    it('should not update analytics when analytics is null', async () => {
      mockLoadAnalytics.mockResolvedValue(null);

      await setupMocksAndImport();

      expect(mockSaveAnalytics).not.toHaveBeenCalled();
    });

    it('should not update analytics when subagents_spawned is missing', async () => {
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'session-456',
      });

      await setupMocksAndImport();

      expect(mockSaveAnalytics).not.toHaveBeenCalled();
    });

    it('should skip test verification when no files modified', async () => {
      mockValidateAgentOutput.mockResolvedValue({
        valid: true,
        filesModified: [],
        errors: [],
        state: defaultState,
      });

      await setupMocksAndImport();

      // Should NOT call test verification
      expect(mockVerifyAgentTests).not.toHaveBeenCalled();
    });

    it('should handle error in main catch block', async () => {
      mockReadHookInput.mockRejectedValue(new Error('Read input failed'));

      await setupMocksAndImport();

      // Should log error
      expect(mockLogError).toHaveBeenCalledWith(
        'SubagentStop main',
        expect.any(Error)
      );

      // Should still respond with continue: true
      const responseCall = mockRespond.mock.calls[0][0];
      expect(responseCall.continue).toBe(true);
    });

    it('should use default agent type when not provided', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'session-456',
        transcript_path: '/test/transcript',
        cwd: '/workspace/project',
        permission_mode: 'default',
        hook_event_name: 'SubagentStop',
        agent_id: 'agent-123',
        agent_transcript_path: '/path/to/transcript.jsonl',
      });

      await setupMocksAndImport();

      const responseCall = mockRespond.mock.calls[0][0];
      expect(responseCall.output.agentType).toBe('unknown');
    });

    it('should handle validation without tracking for files modified path', async () => {
      mockGetAgentTracking.mockResolvedValue(null);
      mockValidateAgentOutput.mockResolvedValue({
        valid: true,
        filesModified: ['/src/component.ts'],
        errors: [],
        state: defaultState,
      });

      await setupMocksAndImport();

      // Should call test verification even without tracking
      expect(mockVerifyAgentTests).toHaveBeenCalledWith(
        '/workspace/project',
        ['/src/component.ts'],
        defaultState
      );

      // Should save state
      expect(mockSaveState).toHaveBeenCalled();
    });

    it('should handle validation without tracking when no files modified', async () => {
      mockGetAgentTracking.mockResolvedValue(null);
      mockValidateAgentOutput.mockResolvedValue({
        valid: true,
        filesModified: [],
        errors: [],
        state: defaultState,
      });

      await setupMocksAndImport();

      // Should NOT call test verification since no files modified
      expect(mockVerifyAgentTests).not.toHaveBeenCalled();

      // Should still save state
      expect(mockSaveState).toHaveBeenCalled();
    });

    it('should handle null rawInput gracefully', async () => {
      mockReadHookInput.mockResolvedValue(null);
      mockGetAgentTracking.mockResolvedValue(null);

      await setupMocksAndImport();

      // Should still respond with continue: true
      const responseCall = mockRespond.mock.calls[0][0];
      expect(responseCall.continue).toBe(true);
    });

    it('should mark analytics success false when status is failed', async () => {
      const startedAt = defaultTracking.started_at;
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'session-456',
        subagents_spawned: [{ type: 'test-engineer', started_at: startedAt }],
      });

      mockValidateAgentOutput.mockResolvedValue({
        valid: false,
        filesModified: ['/src/test.ts'],
        errors: ['Type error'],
        state: defaultState,
      });

      await setupMocksAndImport();

      // Should update analytics with success: false
      expect(mockSaveAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          subagents_spawned: expect.arrayContaining([
            expect.objectContaining({
              success: false,
            }),
          ]),
        })
      );
    });
  });

  describe('createResponse', () => {
    it('should create basic response with continue: true', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'session-456',
        cwd: '/workspace/project',
        hook_event_name: 'SubagentStop',
      });

      mockGetAgentTracking.mockResolvedValue(null);

      await setupMocksAndImport();

      const responseCall = mockRespond.mock.calls[0][0];
      expect(responseCall.continue).toBe(true);
    });

    it('should include systemMessage when validation fails', async () => {
      mockValidateAgentOutput.mockResolvedValue({
        valid: false,
        filesModified: ['/src/test.ts'],
        errors: ['Error 1'],
        state: defaultState,
      });

      await setupMocksAndImport();

      const responseCall = mockRespond.mock.calls[0][0];
      expect(responseCall.systemMessage).toBeDefined();
      expect(responseCall.systemMessage).toContain('test-engineer');
    });

    it('should include output with all fields', async () => {
      await setupMocksAndImport();

      const responseCall = mockRespond.mock.calls[0][0];
      expect(responseCall.output).toBeDefined();
      expect(responseCall.output.validation).toBeDefined();
      expect(responseCall.output.tests).toBeDefined();
      expect(responseCall.output.telemetryWritten).toBe(true);
      expect(responseCall.output.agentId).toBe('agent-123');
      expect(responseCall.output.agentType).toBe('test-engineer');
      expect(responseCall.output.durationMs).toBeGreaterThan(0);
    });
  });
});
