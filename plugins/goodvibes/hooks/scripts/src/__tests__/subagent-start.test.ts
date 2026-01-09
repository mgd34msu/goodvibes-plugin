/**
 * Unit tests for subagent-start hook
 *
 * Tests cover:
 * - createResponse function with all branch combinations
 * - runSubagentStartHook main flow
 * - Agent ID extraction (agent_id, subagent_id, fallback)
 * - Agent type extraction (agent_type, subagent_type, fallback)
 * - Task description extraction (task_description, task, fallback)
 * - CWD resolution (input.cwd vs process.cwd())
 * - Session ID handling (present vs empty)
 * - Git info integration
 * - Analytics tracking with and without analytics data
 * - State loading and session initialization
 * - Subagent context building with reminders
 * - GoodVibes agent system message generation
 * - Non-GoodVibes agent handling
 * - Error handling in main catch block
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('subagent-start hook', () => {
  const originalDateNow = Date.now;
  const originalProcessCwd = process.cwd;
  const fixedTimestamp = 1704067200000; // 2024-01-01T00:00:00.000Z

  // Mock functions
  let mockAccess: ReturnType<typeof vi.fn>;
  let mockMkdir: ReturnType<typeof vi.fn>;
  let mockReadFile: ReturnType<typeof vi.fn>;
  let mockWriteFile: ReturnType<typeof vi.fn>;
  let mockRename: ReturnType<typeof vi.fn>;
  let mockRespond: ReturnType<typeof vi.fn>;
  let mockReadHookInput: ReturnType<typeof vi.fn>;
  let mockDebug: ReturnType<typeof vi.fn>;
  let mockLogError: ReturnType<typeof vi.fn>;
  let mockLoadAnalytics: ReturnType<typeof vi.fn>;
  let mockSaveAnalytics: ReturnType<typeof vi.fn>;
  let mockCleanupStaleAgents: ReturnType<typeof vi.fn>;
  let mockGetGitInfo: ReturnType<typeof vi.fn>;
  let mockDeriveProjectName: ReturnType<typeof vi.fn>;
  let mockSaveAgentTracking: ReturnType<typeof vi.fn>;
  let mockBuildSubagentContext: ReturnType<typeof vi.fn>;
  let mockLoadState: ReturnType<typeof vi.fn>;
  let mockSaveState: ReturnType<typeof vi.fn>;

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
    mockDebug = vi.fn();
    mockLogError = vi.fn();
    mockLoadAnalytics = vi.fn();
    mockSaveAnalytics = vi.fn();
    mockCleanupStaleAgents = vi.fn();
    mockGetGitInfo = vi.fn();
    mockDeriveProjectName = vi.fn();
    mockSaveAgentTracking = vi.fn();
    mockBuildSubagentContext = vi.fn();
    mockLoadState = vi.fn();
    mockSaveState = vi.fn();

    // Mock Date.now for consistent timestamps
    Date.now = vi.fn(() => fixedTimestamp);

    // Mock process.cwd for fallback testing
    process.cwd = vi.fn(() => '/fallback/cwd');
  });

  afterEach(() => {
    Date.now = originalDateNow;
    process.cwd = originalProcessCwd;
    vi.resetModules();
  });

  async function setupMocksAndImport() {
    // Set default mock implementations if not already set
    if (!mockReadHookInput.getMockImplementation()) {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_id: 'agent-abc',
        agent_type: 'test-engineer',
        task_description: 'Run unit tests for the login module',
      });
    }

    if (!mockCleanupStaleAgents.getMockImplementation()) {
      mockCleanupStaleAgents.mockResolvedValue(0);
    }

    if (!mockGetGitInfo.getMockImplementation()) {
      mockGetGitInfo.mockReturnValue({ branch: 'main', commit: 'abc1234' });
    }

    if (!mockDeriveProjectName.getMockImplementation()) {
      mockDeriveProjectName.mockReturnValue('test-project');
    }

    if (!mockSaveAgentTracking.getMockImplementation()) {
      mockSaveAgentTracking.mockResolvedValue(undefined);
    }

    if (!mockLoadAnalytics.getMockImplementation()) {
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'test-session-123',
        started_at: '2024-01-01T00:00:00.000Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
        subagents_spawned: [],
      });
    }

    if (!mockSaveAnalytics.getMockImplementation()) {
      mockSaveAnalytics.mockResolvedValue(undefined);
    }

    if (!mockLoadState.getMockImplementation()) {
      mockLoadState.mockResolvedValue({
        session: {
          id: '',
          startedAt: '',
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
      });
    }

    if (!mockSaveState.getMockImplementation()) {
      mockSaveState.mockResolvedValue(undefined);
    }

    if (!mockBuildSubagentContext.getMockImplementation()) {
      mockBuildSubagentContext.mockResolvedValue({
        additionalContext: '[GoodVibes] Project: test-project\nMode: autonomous',
      });
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
      debug: mockDebug,
      logError: mockLogError,
      loadAnalytics: mockLoadAnalytics,
      saveAnalytics: mockSaveAnalytics,
      isTestEnvironment: () => false,
    }));

    // Mock telemetry module
    vi.doMock('../telemetry/index.js', () => ({
      cleanupStaleAgents: mockCleanupStaleAgents,
      getGitInfo: mockGetGitInfo,
      deriveProjectName: mockDeriveProjectName,
      getActiveAgentsFilePath: vi.fn(() => '/test/.goodvibes/state/active-agents.json'),
    }));

    // Mock subagent-stop/telemetry module
    vi.doMock('../subagent-stop/telemetry.js', () => ({
      saveAgentTracking: mockSaveAgentTracking,
    }));

    // Mock subagent-start/context-injection module
    vi.doMock('../subagent-start/context-injection.js', () => ({
      buildSubagentContext: mockBuildSubagentContext,
    }));

    // Mock state module
    vi.doMock('../state/index.js', () => ({
      loadState: mockLoadState,
      saveState: mockSaveState,
    }));

    // Import the module (this triggers the hook)
    await import('../subagent-start/index.js');

    // Allow async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
    await vi.waitFor(() => expect(mockRespond).toHaveBeenCalled(), { timeout: 1000 });
  }

  describe('runSubagentStartHook', () => {
    it('should complete successful initialization with all steps', async () => {
      await setupMocksAndImport();

      // Verify initialization sequence
      expect(mockDebug).toHaveBeenCalledWith('SubagentStart hook starting');
      expect(mockReadHookInput).toHaveBeenCalled();
      expect(mockDebug).toHaveBeenCalledWith(
        'Raw input shape:',
        expect.any(Array)
      );

      // Verify input parsing and debug logging
      expect(mockDebug).toHaveBeenCalledWith('SubagentStart received input', {
        agent_id: 'agent-abc',
        agent_type: 'test-engineer',
        session_id: 'test-session-123',
        task_preview: 'Run unit tests for the login module',
        cwd: '/test/project',
      });

      // Verify cleanup was called
      expect(mockCleanupStaleAgents).toHaveBeenCalled();

      // Verify git info
      expect(mockGetGitInfo).toHaveBeenCalledWith('/test/project');
      expect(mockDebug).toHaveBeenCalledWith('Git info', {
        branch: 'main',
        commit: 'abc1234',
      });

      // Verify project name derivation
      expect(mockDeriveProjectName).toHaveBeenCalledWith('/test/project');
      expect(mockDebug).toHaveBeenCalledWith('Project name', 'test-project');

      // Verify agent tracking saved
      expect(mockSaveAgentTracking).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          agent_id: 'agent-abc',
          agent_type: 'test-engineer',
          session_id: 'test-session-123',
          project: '/test/project',
          project_name: 'test-project',
          git_branch: 'main',
          git_commit: 'abc1234',
        })
      );
      expect(mockDebug).toHaveBeenCalledWith('Saved agent tracking', {
        agent_id: 'agent-abc',
      });

      // Verify analytics tracking
      expect(mockLoadAnalytics).toHaveBeenCalled();
      expect(mockSaveAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          subagents_spawned: expect.arrayContaining([
            expect.objectContaining({
              type: 'test-engineer',
              task: 'Run unit tests for the login module',
            }),
          ]),
        })
      );

      // Verify state loading
      expect(mockLoadState).toHaveBeenCalledWith('/test/project');

      // Verify context building
      expect(mockBuildSubagentContext).toHaveBeenCalledWith(
        '/test/project',
        'test-engineer',
        'test-session-123'
      );

      // Verify response
      expect(mockRespond).toHaveBeenCalled();
    });

    it('should use subagent_id when agent_id is not provided', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        subagent_id: 'subagent-xyz',
        agent_type: 'backend-engineer',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith(
        'SubagentStart received input',
        expect.objectContaining({
          agent_id: 'subagent-xyz',
        })
      );
    });

    it('should generate fallback agent_id when neither agent_id nor subagent_id provided', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_type: 'frontend-architect',
      });

      await setupMocksAndImport();

      // Should generate agent_id with timestamp format
      expect(mockDebug).toHaveBeenCalledWith(
        'SubagentStart received input',
        expect.objectContaining({
          agent_id: `agent_${fixedTimestamp}`,
        })
      );
    });

    it('should use subagent_type when agent_type is not provided', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_id: 'agent-abc',
        subagent_type: 'devops-deployer',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith(
        'SubagentStart received input',
        expect.objectContaining({
          agent_type: 'devops-deployer',
        })
      );
    });

    it('should fallback to "unknown" agent_type when neither provided', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_id: 'agent-abc',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith(
        'SubagentStart received input',
        expect.objectContaining({
          agent_type: 'unknown',
        })
      );
    });

    it('should use task field when task_description is not provided', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_id: 'agent-abc',
        agent_type: 'test-engineer',
        task: 'Alternative task field',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith(
        'SubagentStart received input',
        expect.objectContaining({
          task_preview: 'Alternative task field',
        })
      );
    });

    it('should fallback to empty string when no task description', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_id: 'agent-abc',
        agent_type: 'test-engineer',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith(
        'SubagentStart received input',
        expect.objectContaining({
          task_preview: '',
        })
      );
    });

    it('should use process.cwd() when input.cwd is not provided', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_id: 'agent-abc',
        agent_type: 'test-engineer',
      });

      await setupMocksAndImport();

      expect(mockGetGitInfo).toHaveBeenCalledWith('/fallback/cwd');
      expect(mockDeriveProjectName).toHaveBeenCalledWith('/fallback/cwd');
    });

    it('should handle empty session_id gracefully', async () => {
      mockReadHookInput.mockResolvedValue({
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_id: 'agent-abc',
        agent_type: 'test-engineer',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith(
        'SubagentStart received input',
        expect.objectContaining({
          session_id: '',
        })
      );
    });

    it('should truncate long task descriptions to 100 chars in debug', async () => {
      const longTask = 'A'.repeat(150);
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_id: 'agent-abc',
        agent_type: 'test-engineer',
        task_description: longTask,
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith(
        'SubagentStart received input',
        expect.objectContaining({
          task_preview: 'A'.repeat(100),
        })
      );
    });

    it('should truncate long task descriptions to 200 chars in analytics', async () => {
      const longTask = 'B'.repeat(250);
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_id: 'agent-abc',
        agent_type: 'test-engineer',
        task_description: longTask,
      });

      await setupMocksAndImport();

      expect(mockSaveAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          subagents_spawned: expect.arrayContaining([
            expect.objectContaining({
              task: 'B'.repeat(200),
            }),
          ]),
        })
      );
    });

    it('should handle null analytics gracefully', async () => {
      mockLoadAnalytics.mockResolvedValue(null);

      await setupMocksAndImport();

      // Should not attempt to save analytics when loadAnalytics returns null
      expect(mockSaveAnalytics).not.toHaveBeenCalled();
    });

    it('should initialize subagents_spawned array when undefined in analytics', async () => {
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'test-session-123',
        started_at: '2024-01-01T00:00:00.000Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
        // subagents_spawned is undefined
      });

      await setupMocksAndImport();

      expect(mockSaveAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          subagents_spawned: expect.arrayContaining([
            expect.objectContaining({
              type: 'test-engineer',
            }),
          ]),
        })
      );
    });

    it('should initialize session state when session.id is empty', async () => {
      mockLoadState.mockResolvedValue({
        session: {
          id: '',
          startedAt: '',
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
      });

      await setupMocksAndImport();

      expect(mockSaveState).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          session: expect.objectContaining({
            id: 'test-session-123',
          }),
        })
      );
    });

    it('should not update session state when session.id is already set', async () => {
      mockLoadState.mockResolvedValue({
        session: {
          id: 'existing-session',
          startedAt: '2024-01-01T00:00:00.000Z',
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
      });

      await setupMocksAndImport();

      expect(mockSaveState).not.toHaveBeenCalled();
    });

    it('should not update session state when input sessionId is empty', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: '',
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_id: 'agent-abc',
        agent_type: 'test-engineer',
      });

      mockLoadState.mockResolvedValue({
        session: {
          id: '',
          startedAt: '',
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
      });

      await setupMocksAndImport();

      // Should not save state when sessionId is empty
      expect(mockSaveState).not.toHaveBeenCalled();
    });
  });

  describe('context and reminders', () => {
    it('should add stack info to reminders when detected_stack is available', async () => {
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'test-session-123',
        started_at: '2024-01-01T00:00:00.000Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
        subagents_spawned: [],
        detected_stack: { framework: 'react', language: 'typescript' },
      });

      await setupMocksAndImport();

      const respondCall = mockRespond.mock.calls[0][0];
      expect(respondCall.additionalContext).toContain('Detected stack:');
      expect(respondCall.additionalContext).toContain('react');
    });

    it('should add git branch to reminders when available', async () => {
      mockGetGitInfo.mockReturnValue({
        branch: 'feature/new-feature',
        commit: 'def5678',
      });

      await setupMocksAndImport();

      const respondCall = mockRespond.mock.calls[0][0];
      expect(respondCall.additionalContext).toContain(
        'Git branch: feature/new-feature'
      );
    });

    it('should not add git branch reminder when branch is undefined', async () => {
      mockGetGitInfo.mockReturnValue({ commit: 'abc1234' });

      await setupMocksAndImport();

      const respondCall = mockRespond.mock.calls[0][0];
      expect(respondCall.additionalContext).not.toContain('Git branch:');
    });

    it('should add project name to reminders', async () => {
      mockDeriveProjectName.mockReturnValue('my-awesome-project');

      await setupMocksAndImport();

      const respondCall = mockRespond.mock.calls[0][0];
      expect(respondCall.additionalContext).toContain(
        'Project: my-awesome-project'
      );
    });

    it('should append reminders to subagent context when context has additionalContext', async () => {
      mockBuildSubagentContext.mockResolvedValue({
        additionalContext:
          '[GoodVibes] Project: test-project\nMode: autonomous',
      });

      await setupMocksAndImport();

      const respondCall = mockRespond.mock.calls[0][0];
      // Should contain both the original context and reminders
      expect(respondCall.additionalContext).toContain(
        '[GoodVibes] Project: test-project'
      );
      expect(respondCall.additionalContext).toContain('Project: test-project');
    });

    it('should use GoodVibes prefix when no subagent context additionalContext', async () => {
      mockBuildSubagentContext.mockResolvedValue({
        additionalContext: '',
      });

      await setupMocksAndImport();

      const respondCall = mockRespond.mock.calls[0][0];
      expect(respondCall.additionalContext).toContain(
        '[GoodVibes Project Context]'
      );
    });

    it('should handle undefined additionalContext from subagent context', async () => {
      mockBuildSubagentContext.mockResolvedValue({});

      await setupMocksAndImport();

      const respondCall = mockRespond.mock.calls[0][0];
      expect(respondCall.additionalContext).toContain(
        '[GoodVibes Project Context]'
      );
    });
  });

  describe('GoodVibes agent system messages', () => {
    const goodvibesAgentTypes = [
      'goodvibes:factory',
      'goodvibes:skill-creator',
      'goodvibes:backend-engineer',
      'goodvibes:content-platform',
      'goodvibes:devops-deployer',
      'goodvibes:frontend-architect',
      'goodvibes:fullstack-integrator',
      'goodvibes:test-engineer',
      'goodvibes:brutal-reviewer',
      'goodvibes:workflow-planner',
    ];

    for (const agentType of goodvibesAgentTypes) {
      it(`should generate system message for GoodVibes agent: ${agentType}`, async () => {
        // Set up mock for this specific agent type
        mockReadHookInput.mockResolvedValue({
          session_id: 'test-session-123',
          cwd: '/test/project',
          hook_event_name: 'SubagentStart',
          transcript_path: '/test/transcript',
          permission_mode: 'default',
          agent_id: 'agent-abc',
          agent_type: agentType,
        });

        // Use setupMocksAndImport to ensure proper module reset and mock setup
        await setupMocksAndImport();

        const respondCall = mockRespond.mock.calls[0][0];
        expect(respondCall.systemMessage).toContain('[GoodVibes]');
        expect(respondCall.systemMessage).toContain(
          `Agent ${agentType} starting`
        );
        expect(respondCall.systemMessage).toContain('Project: test-project');
      });
    }

    it('should include git branch in GoodVibes agent system message when available', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_id: 'agent-abc',
        agent_type: 'goodvibes:test-engineer',
      });
      mockGetGitInfo.mockReturnValue({
        branch: 'feature/branch',
        commit: 'abc123',
      });

      await setupMocksAndImport();

      const respondCall = mockRespond.mock.calls[0][0];
      expect(respondCall.systemMessage).toContain('Branch: feature/branch');
    });

    it('should not include branch in system message when git branch is undefined', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_id: 'agent-abc',
        agent_type: 'goodvibes:test-engineer',
      });
      mockGetGitInfo.mockReturnValue({ commit: 'abc123' });

      await setupMocksAndImport();

      const respondCall = mockRespond.mock.calls[0][0];
      expect(respondCall.systemMessage).not.toContain('Branch:');
    });

    it('should not generate system message for non-GoodVibes agents', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_id: 'agent-abc',
        agent_type: 'custom-agent',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith(
        'Non-GoodVibes agent started: custom-agent'
      );

      const respondCall = mockRespond.mock.calls[0][0];
      expect(respondCall.systemMessage).toBeUndefined();
    });

    it('should not generate system message for unknown agent type', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_id: 'agent-abc',
        agent_type: 'unknown',
      });

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith(
        'Non-GoodVibes agent started: unknown'
      );
    });
  });

  describe('error handling', () => {
    it('should handle error in main hook and respond with continue: true', async () => {
      mockReadHookInput.mockRejectedValue(new Error('Input read failed'));

      await setupMocksAndImport();

      expect(mockLogError).toHaveBeenCalledWith(
        'SubagentStart main',
        expect.any(Error)
      );

      const respondCall = mockRespond.mock.calls[0][0];
      expect(respondCall.continue).toBe(true);
    });

    it('should handle non-Error thrown values in catch block', async () => {
      mockReadHookInput.mockRejectedValue('String error');

      await setupMocksAndImport();

      expect(mockLogError).toHaveBeenCalledWith(
        'SubagentStart main',
        'String error'
      );
    });
  });

  describe('edge cases for branch coverage', () => {
    it('should handle null/undefined rawInput gracefully', async () => {
      // This tests the fallback in Object.keys(rawInput || {})
      mockReadHookInput.mockResolvedValue(null);

      await setupMocksAndImport();

      // Should log with empty array for null input
      expect(mockDebug).toHaveBeenCalledWith('Raw input shape:', []);
    });

    it('should combine subagentContext additionalContext with minimal reminders', async () => {
      // Test the branch where subagentContext has additionalContext
      // and only the project name reminder is added (no stack, no git branch)

      mockBuildSubagentContext.mockResolvedValue({
        additionalContext:
          '[GoodVibes] Project: test-project\nMode: autonomous',
      });
      mockGetGitInfo.mockReturnValue({}); // No branch, no commit
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'test-session-123',
        started_at: '2024-01-01T00:00:00.000Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
        subagents_spawned: [],
        // No detected_stack
      });

      await setupMocksAndImport();

      const respondCall = mockRespond.mock.calls[0][0];
      // Should contain the original context plus the project reminder
      expect(respondCall.additionalContext).toContain(
        '[GoodVibes] Project: test-project'
      );
      expect(respondCall.additionalContext).toContain('Project: test-project');
    });
  });

  describe('createResponse function', () => {
    it('should create response with continue: true by default', async () => {
      // Use non-GoodVibes agent with no additionalContext to test minimal response
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_id: 'agent-abc',
        agent_type: 'other-agent',
      });
      mockBuildSubagentContext.mockResolvedValue({});
      mockLoadAnalytics.mockResolvedValue(null);
      mockGetGitInfo.mockReturnValue({});

      await setupMocksAndImport();

      const respondCall = mockRespond.mock.calls[0][0];
      expect(respondCall.continue).toBe(true);
    });

    it('should include systemMessage when provided', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_id: 'agent-abc',
        agent_type: 'goodvibes:factory',
      });

      await setupMocksAndImport();

      const respondCall = mockRespond.mock.calls[0][0];
      expect(respondCall.systemMessage).toBeDefined();
      expect(respondCall.systemMessage).toContain('[GoodVibes]');
    });

    it('should include additionalContext when provided', async () => {
      await setupMocksAndImport();

      const respondCall = mockRespond.mock.calls[0][0];
      expect(respondCall.additionalContext).toBeDefined();
    });

    it('should omit systemMessage when not set', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/project',
        hook_event_name: 'SubagentStart',
        transcript_path: '/test/transcript',
        permission_mode: 'default',
        agent_id: 'agent-abc',
        agent_type: 'random-non-goodvibes-agent',
      });

      await setupMocksAndImport();

      const respondCall = mockRespond.mock.calls[0][0];
      // systemMessage should be undefined for non-GoodVibes agents
      expect(respondCall.systemMessage).toBeUndefined();
    });

    it('should handle empty reminders when no git and no stack', async () => {
      mockGetGitInfo.mockReturnValue({});
      mockLoadAnalytics.mockResolvedValue({
        session_id: 'test-session-123',
        started_at: '2024-01-01T00:00:00.000Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
        subagents_spawned: [],
        // No detected_stack
      });

      await setupMocksAndImport();

      const respondCall = mockRespond.mock.calls[0][0];
      // Should still have project reminder
      expect(respondCall.additionalContext).toContain('Project: test-project');
    });
  });
});
