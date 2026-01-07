/**
 * Unit tests for pre-tool-use hook
 *
 * Tests cover:
 * - extractBashCommand: bash command extraction from tool input
 * - handleGitCommit: quality gates before git commit
 * - handleGitCommand: branch guards and merge readiness checks
 * - handleBashTool: routing bash commands to appropriate handlers
 * - validateDetectStack: package.json existence check
 * - validateGetSchema: schema file existence check
 * - validateRunSmokeTest: package manager availability check
 * - validateCheckTypes: tsconfig.json existence check
 * - validateImplementation: allow by default
 * - runPreToolUseHook: main entry point with all tool routing
 * - Error handling and edge cases
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import type { HookInput } from '../shared/index.js';
import type { HooksState } from '../types/state.js';
import type { GateResult } from '../pre-tool-use/quality-gates.js';
import type { GitGuardResult } from '../pre-tool-use/git-guards.js';

// Mock all dependencies
vi.mock('../shared/index.js', () => ({
  respond: vi.fn(),
  readHookInput: vi.fn(),
  allowTool: vi.fn((hookEventName: string, systemMessage?: string) => ({
    continue: true,
    systemMessage,
    hookSpecificOutput: {
      hookEventName,
      permissionDecision: 'allow',
    },
  })),
  blockTool: vi.fn((hookEventName: string, reason: string) => ({
    continue: false,
    hookSpecificOutput: {
      hookEventName,
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  })),
  fileExistsRelative: vi.fn(),
  fileExists: vi.fn(),
  debug: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../state.js', () => ({
  loadState: vi.fn(),
}));

vi.mock('../types/config.js', () => ({
  getDefaultConfig: vi.fn(() => ({
    automation: {
      enabled: true,
      mode: 'default',
      testing: {
        runAfterFileChange: true,
        runBeforeCommit: true,
        runBeforeMerge: true,
        testCommand: 'npm test',
        maxRetries: 3,
      },
      building: {
        runAfterFileThreshold: 5,
        runBeforeCommit: true,
        runBeforeMerge: true,
        buildCommand: 'npm run build',
        typecheckCommand: 'npx tsc --noEmit',
        maxRetries: 3,
      },
      git: {
        autoFeatureBranch: true,
        autoCheckpoint: true,
        autoMerge: true,
        checkpointThreshold: 5,
        mainBranch: 'main',
      },
      recovery: {
        maxRetriesPerError: 3,
        logFailures: true,
        skipAfterMaxRetries: true,
      },
    },
  })),
}));

vi.mock('../pre-tool-use/quality-gates.js', () => ({
  runQualityGates: vi.fn(),
  isCommitCommand: vi.fn(),
  formatGateResults: vi.fn(),
}));

vi.mock('../pre-tool-use/git-guards.js', () => ({
  checkBranchGuard: vi.fn(),
  checkMergeReadiness: vi.fn(),
  isGitCommand: vi.fn(),
  isMergeCommand: vi.fn(),
}));

// Store original process methods
const originalProcessCwd = process.cwd;

describe('pre-tool-use hook', () => {
  let mockRespond: Mock;
  let mockReadHookInput: Mock;
  let mockAllowTool: Mock;
  let mockBlockTool: Mock;
  let mockFileExistsRelative: Mock;
  let mockFileExists: Mock;
  let mockDebug: Mock;
  let mockLogError: Mock;
  let mockLoadState: Mock;
  let mockGetDefaultConfig: Mock;
  let mockRunQualityGates: Mock;
  let mockIsCommitCommand: Mock;
  let mockFormatGateResults: Mock;
  let mockCheckBranchGuard: Mock;
  let mockCheckMergeReadiness: Mock;
  let mockIsGitCommand: Mock;
  let mockIsMergeCommand: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Re-import mocks after reset
    const sharedModule = await import('../shared/index.js');
    mockRespond = sharedModule.respond as Mock;
    mockReadHookInput = sharedModule.readHookInput as Mock;
    mockAllowTool = sharedModule.allowTool as Mock;
    mockBlockTool = sharedModule.blockTool as Mock;
    mockFileExistsRelative = sharedModule.fileExistsRelative as Mock;
    mockFileExists = sharedModule.fileExists as Mock;
    mockDebug = sharedModule.debug as Mock;
    mockLogError = sharedModule.logError as Mock;

    const stateModule = await import('../state.js');
    mockLoadState = stateModule.loadState as Mock;

    const configModule = await import('../types/config.js');
    mockGetDefaultConfig = configModule.getDefaultConfig as Mock;

    const qualityGatesModule = await import('../pre-tool-use/quality-gates.js');
    mockRunQualityGates = qualityGatesModule.runQualityGates as Mock;
    mockIsCommitCommand = qualityGatesModule.isCommitCommand as Mock;
    mockFormatGateResults = qualityGatesModule.formatGateResults as Mock;

    const gitGuardsModule = await import('../pre-tool-use/git-guards.js');
    mockCheckBranchGuard = gitGuardsModule.checkBranchGuard as Mock;
    mockCheckMergeReadiness = gitGuardsModule.checkMergeReadiness as Mock;
    mockIsGitCommand = gitGuardsModule.isGitCommand as Mock;
    mockIsMergeCommand = gitGuardsModule.isMergeCommand as Mock;

    // Default mock implementations
    // Don't throw from respond - allow code after respond() to execute for coverage
    mockRespond.mockImplementation(() => {
      // No-op - just record the call
    });
    mockFormatGateResults.mockReturnValue('TypeScript: passed, ESLint: passed');
  });

  afterEach(() => {
    process.cwd = originalProcessCwd;
    vi.resetAllMocks();
  });

  // Helper to create a minimal HookInput
  function createHookInput(overrides: Partial<HookInput> = {}): HookInput {
    return {
      session_id: 'test-session',
      transcript_path: '/path/to/transcript',
      cwd: '/test/project',
      permission_mode: 'default',
      hook_event_name: 'PreToolUse',
      ...overrides,
    };
  }

  // Helper to create a minimal HooksState
  function createHooksState(overrides: Partial<HooksState> = {}): HooksState {
    return {
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
      ...overrides,
    };
  }

  describe('extractBashCommand', () => {
    it('should return null for non-Bash tools', async () => {
      const { extractBashCommand } = await import('../pre-tool-use.js');
      const input = createHookInput({ tool_name: 'Read' });
      expect(extractBashCommand(input)).toBeNull();
    });

    it('should return null for Bash tool without command', async () => {
      const { extractBashCommand } = await import('../pre-tool-use.js');
      const input = createHookInput({ tool_name: 'Bash', tool_input: {} });
      expect(extractBashCommand(input)).toBeNull();
    });

    it('should extract command from Bash tool', async () => {
      const { extractBashCommand } = await import('../pre-tool-use.js');
      const input = createHookInput({
        tool_name: 'Bash',
        tool_input: { command: 'git status' },
      });
      expect(extractBashCommand(input)).toBe('git status');
    });

    it('should extract command from MCP-prefixed Bash tool', async () => {
      const { extractBashCommand } = await import('../pre-tool-use.js');
      const input = createHookInput({
        tool_name: 'mcp__server__Bash',
        tool_input: { command: 'npm install' },
      });
      expect(extractBashCommand(input)).toBe('npm install');
    });

    it('should return null when tool_input is undefined', async () => {
      const { extractBashCommand } = await import('../pre-tool-use.js');
      const input = createHookInput({ tool_name: 'Bash' });
      expect(extractBashCommand(input)).toBeNull();
    });
  });

  describe('handleGitCommit', () => {
    it('should allow commit when quality gates are disabled', async () => {
      // Must set up config mock BEFORE importing the module under test
      // because getDefaultConfig is called during function execution
      mockGetDefaultConfig.mockReturnValue({
        automation: {
          building: { runBeforeCommit: false },
          testing: { runBeforeCommit: false },
        },
      });

      const { handleGitCommit } = await import('../pre-tool-use.js');
      const input = createHookInput({ cwd: '/test/project' });

      try {
        await handleGitCommit(input, 'git commit -m "test"');
      } catch (e) {
        // Expected due to respond throwing
      }

      // Verify debug was called for disabled gates path
      expect(mockDebug).toHaveBeenCalledWith(
        'Git commit detected, running quality gates',
        expect.anything()
      );
      expect(mockDebug).toHaveBeenCalledWith(
        'Quality gates disabled for commits'
      );
      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
      expect(mockRespond).toHaveBeenCalled();
      // Quality gates should NOT have been run since they're disabled
      expect(mockRunQualityGates).not.toHaveBeenCalled();
    });

    it('should block commit when quality gates have blocking failures', async () => {
      mockRunQualityGates.mockResolvedValue({
        allPassed: false,
        blocking: true,
        results: [{ gate: 'TypeScript', status: 'failed' }],
      });
      mockFormatGateResults.mockReturnValue('TypeScript: failed');

      const { handleGitCommit } = await import('../pre-tool-use.js');
      const input = createHookInput({ cwd: '/test/project' });

      try {
        await handleGitCommit(input, 'git commit -m "test"');
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        'Quality gates failed: TypeScript: failed. Fix issues before committing.'
      );
      expect(mockRespond).toHaveBeenCalledWith(expect.anything(), true);
    });

    it('should allow commit with warning when non-blocking failures exist', async () => {
      mockRunQualityGates.mockResolvedValue({
        allPassed: false,
        blocking: false,
        results: [{ gate: 'Prettier', status: 'failed' }],
      });
      mockFormatGateResults.mockReturnValue('Prettier: failed');

      const { handleGitCommit } = await import('../pre-tool-use.js');
      const input = createHookInput({ cwd: '/test/project' });

      try {
        await handleGitCommit(input, 'git commit -m "test"');
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith(
        'PreToolUse',
        'Quality gates partially passed: Prettier: failed. Proceeding with commit.'
      );
    });

    it('should allow commit when all quality gates pass', async () => {
      mockRunQualityGates.mockResolvedValue({
        allPassed: true,
        blocking: false,
        results: [{ gate: 'TypeScript', status: 'passed' }],
      });
      mockFormatGateResults.mockReturnValue('TypeScript: passed');

      const { handleGitCommit } = await import('../pre-tool-use.js');
      const input = createHookInput({ cwd: '/test/project' });

      try {
        await handleGitCommit(input, 'git commit -m "test"');
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith(
        'PreToolUse',
        'All quality gates passed: TypeScript: passed'
      );
    });

    it('should use process.cwd() when input.cwd is undefined', async () => {
      mockRunQualityGates.mockResolvedValue({
        allPassed: true,
        blocking: false,
        results: [],
      });
      process.cwd = vi.fn(() => '/fallback/cwd');

      const { handleGitCommit } = await import('../pre-tool-use.js');
      const input = createHookInput();
      delete (input as Record<string, unknown>).cwd;

      try {
        await handleGitCommit(input, 'git commit -m "test"');
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockRunQualityGates).toHaveBeenCalledWith('/fallback/cwd');
    });
  });

  describe('handleGitCommand', () => {
    it('should block when branch guard denies operation', async () => {
      mockLoadState.mockResolvedValue(createHooksState());
      mockCheckBranchGuard.mockResolvedValue({
        allowed: false,
        reason: 'Force push to main is not allowed',
      } as GitGuardResult);

      const { handleGitCommand } = await import('../pre-tool-use.js');
      const input = createHookInput({ cwd: '/test/project' });

      try {
        await handleGitCommand(input, 'git push --force');
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        'Force push to main is not allowed'
      );
      expect(mockRespond).toHaveBeenCalledWith(expect.anything(), true);
    });

    it('should block with default reason when branch guard reason is undefined', async () => {
      mockLoadState.mockResolvedValue(createHooksState());
      mockCheckBranchGuard.mockResolvedValue({
        allowed: false,
      } as GitGuardResult);

      const { handleGitCommand } = await import('../pre-tool-use.js');
      const input = createHookInput({ cwd: '/test/project' });

      try {
        await handleGitCommand(input, 'git push --force');
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        'Git operation blocked'
      );
    });

    it('should check merge readiness for merge commands', async () => {
      mockLoadState.mockResolvedValue(createHooksState());
      mockCheckBranchGuard.mockResolvedValue({
        allowed: true,
      } as GitGuardResult);
      mockIsMergeCommand.mockReturnValue(true);
      mockCheckMergeReadiness.mockReturnValue({
        allowed: false,
        reason: 'Cannot merge: build is failing',
      } as GitGuardResult);

      const { handleGitCommand } = await import('../pre-tool-use.js');
      const input = createHookInput({ cwd: '/test/project' });

      try {
        await handleGitCommand(input, 'git merge feature');
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockCheckMergeReadiness).toHaveBeenCalled();
      expect(mockBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        'Cannot merge: build is failing'
      );
    });

    it('should use default reason when merge guard reason is undefined', async () => {
      mockLoadState.mockResolvedValue(createHooksState());
      mockCheckBranchGuard.mockResolvedValue({
        allowed: true,
      } as GitGuardResult);
      mockIsMergeCommand.mockReturnValue(true);
      mockCheckMergeReadiness.mockReturnValue({
        allowed: false,
      } as GitGuardResult);

      const { handleGitCommand } = await import('../pre-tool-use.js');
      const input = createHookInput({ cwd: '/test/project' });

      try {
        await handleGitCommand(input, 'git merge feature');
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockBlockTool).toHaveBeenCalledWith('PreToolUse', 'Merge blocked');
    });

    it('should allow merge with warning when merge guard has warning', async () => {
      mockLoadState.mockResolvedValue(createHooksState());
      mockCheckBranchGuard.mockResolvedValue({
        allowed: true,
      } as GitGuardResult);
      mockIsMergeCommand.mockReturnValue(true);
      mockCheckMergeReadiness.mockReturnValue({
        allowed: true,
        warning: 'Merge warning: consider reviewing first',
      } as GitGuardResult);

      const { handleGitCommand } = await import('../pre-tool-use.js');
      const input = createHookInput({ cwd: '/test/project' });

      await handleGitCommand(input, 'git merge feature');

      expect(mockAllowTool).toHaveBeenCalledWith(
        'PreToolUse',
        'Merge warning: consider reviewing first'
      );
    });

    it('should allow merge without warning when merge guard has no warning', async () => {
      mockLoadState.mockResolvedValue(createHooksState());
      mockCheckBranchGuard.mockResolvedValue({
        allowed: true,
      } as GitGuardResult);
      mockIsMergeCommand.mockReturnValue(true);
      mockCheckMergeReadiness.mockReturnValue({
        allowed: true,
        // No warning property
      } as GitGuardResult);

      const { handleGitCommand } = await import('../pre-tool-use.js');
      const input = createHookInput({ cwd: '/test/project' });

      await handleGitCommand(input, 'git merge feature');

      // Should proceed to branch guard warning check, which also has no warning
      // So should call allowTool without a message
      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should allow with warning from branch guard', async () => {
      mockLoadState.mockResolvedValue(createHooksState());
      mockCheckBranchGuard.mockResolvedValue({
        allowed: true,
        warning: 'Force push detected - ensure this is intentional',
      } as GitGuardResult);
      mockIsMergeCommand.mockReturnValue(false);

      const { handleGitCommand } = await import('../pre-tool-use.js');
      const input = createHookInput({ cwd: '/test/project' });

      try {
        await handleGitCommand(input, 'git push -f origin feature');
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith(
        'PreToolUse',
        'Force push detected - ensure this is intentional'
      );
    });

    it('should allow git command when all guards pass', async () => {
      mockLoadState.mockResolvedValue(createHooksState());
      mockCheckBranchGuard.mockResolvedValue({
        allowed: true,
      } as GitGuardResult);
      mockIsMergeCommand.mockReturnValue(false);

      const { handleGitCommand } = await import('../pre-tool-use.js');
      const input = createHookInput({ cwd: '/test/project' });

      try {
        await handleGitCommand(input, 'git status');
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should use process.cwd() when input.cwd is undefined', async () => {
      mockLoadState.mockResolvedValue(createHooksState());
      mockCheckBranchGuard.mockResolvedValue({
        allowed: true,
      } as GitGuardResult);
      mockIsMergeCommand.mockReturnValue(false);
      process.cwd = vi.fn(() => '/fallback/cwd');

      const { handleGitCommand } = await import('../pre-tool-use.js');
      const input = createHookInput();
      delete (input as Record<string, unknown>).cwd;

      try {
        await handleGitCommand(input, 'git status');
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockLoadState).toHaveBeenCalledWith('/fallback/cwd');
    });
  });

  describe('handleBashTool', () => {
    it('should allow when no command is extracted', async () => {
      const { handleBashTool } = await import('../pre-tool-use.js');
      const input = createHookInput({ tool_name: 'Bash', tool_input: {} });

      try {
        await handleBashTool(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should route to handleGitCommit for commit commands', async () => {
      mockIsCommitCommand.mockReturnValue(true);
      mockRunQualityGates.mockResolvedValue({
        allPassed: true,
        blocking: false,
        results: [],
      });

      const { handleBashTool } = await import('../pre-tool-use.js');
      const input = createHookInput({
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m "test"' },
      });

      try {
        await handleBashTool(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockIsCommitCommand).toHaveBeenCalledWith('git commit -m "test"');
      expect(mockRunQualityGates).toHaveBeenCalled();
    });

    it('should route to handleGitCommand for non-commit git commands', async () => {
      mockIsCommitCommand.mockReturnValue(false);
      mockIsGitCommand.mockReturnValue(true);
      mockLoadState.mockResolvedValue(createHooksState());
      mockCheckBranchGuard.mockResolvedValue({
        allowed: true,
      } as GitGuardResult);
      mockIsMergeCommand.mockReturnValue(false);

      const { handleBashTool } = await import('../pre-tool-use.js');
      const input = createHookInput({
        tool_name: 'Bash',
        tool_input: { command: 'git push origin main' },
      });

      try {
        await handleBashTool(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockIsGitCommand).toHaveBeenCalledWith('git push origin main');
      expect(mockCheckBranchGuard).toHaveBeenCalled();
    });

    it('should allow non-git bash commands directly', async () => {
      mockIsCommitCommand.mockReturnValue(false);
      mockIsGitCommand.mockReturnValue(false);

      const { handleBashTool } = await import('../pre-tool-use.js');
      const input = createHookInput({
        tool_name: 'Bash',
        tool_input: { command: 'npm install' },
      });

      try {
        await handleBashTool(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
      expect(mockRunQualityGates).not.toHaveBeenCalled();
      expect(mockCheckBranchGuard).not.toHaveBeenCalled();
    });
  });

  describe('validateDetectStack', () => {
    it('should block when package.json is missing', async () => {
      mockFileExists.mockResolvedValue(false);

      const { validateDetectStack } = await import('../pre-tool-use.js');
      const input = createHookInput();

      try {
        await validateDetectStack(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        'No package.json found in project root. Cannot detect stack.'
      );
      expect(mockRespond).toHaveBeenCalledWith(expect.anything(), true);
    });

    it('should allow when package.json exists', async () => {
      mockFileExists.mockResolvedValue(true);

      const { validateDetectStack } = await import('../pre-tool-use.js');
      const input = createHookInput();

      try {
        await validateDetectStack(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });
  });

  describe('validateGetSchema', () => {
    it('should allow with warning when no schema file found', async () => {
      mockFileExists.mockResolvedValue(false);

      const { validateGetSchema } = await import('../pre-tool-use.js');
      const input = createHookInput();

      try {
        await validateGetSchema(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith(
        'PreToolUse',
        'No schema file detected. get_schema may fail.'
      );
    });

    it('should allow when prisma schema exists', async () => {
      mockFileExists.mockImplementation((path: string) => {
        const normalizedPath = path.replace(/\\/g, '/');
        return Promise.resolve(normalizedPath.endsWith('prisma/schema.prisma'));
      });

      const { validateGetSchema } = await import('../pre-tool-use.js');
      const input = createHookInput();

      try {
        await validateGetSchema(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should allow when drizzle.config.ts exists', async () => {
      mockFileExists.mockImplementation((path: string) => {
        const normalizedPath = path.replace(/\\/g, '/');
        return Promise.resolve(normalizedPath.endsWith('drizzle.config.ts'));
      });

      const { validateGetSchema } = await import('../pre-tool-use.js');
      const input = createHookInput();

      try {
        await validateGetSchema(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should allow when drizzle/schema.ts exists', async () => {
      mockFileExists.mockImplementation((path: string) => {
        const normalizedPath = path.replace(/\\/g, '/');
        return Promise.resolve(normalizedPath.endsWith('drizzle/schema.ts'));
      });

      const { validateGetSchema } = await import('../pre-tool-use.js');
      const input = createHookInput();

      try {
        await validateGetSchema(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });
  });

  describe('validateRunSmokeTest', () => {
    it('should block when package.json is missing', async () => {
      mockFileExists.mockResolvedValue(false);

      const { validateRunSmokeTest } = await import('../pre-tool-use.js');
      const input = createHookInput();

      try {
        await validateRunSmokeTest(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        'No package.json found. Cannot run smoke tests.'
      );
      expect(mockRespond).toHaveBeenCalledWith(expect.anything(), true);
    });

    it('should allow with warning when no lockfile found', async () => {
      mockFileExists.mockImplementation((path: string) => {
        return Promise.resolve(path.endsWith('package.json'));
      });

      const { validateRunSmokeTest } = await import('../pre-tool-use.js');
      const input = createHookInput();

      try {
        await validateRunSmokeTest(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith(
        'PreToolUse',
        'No lockfile detected. Install dependencies first.'
      );
    });

    it('should allow when pnpm lockfile exists', async () => {
      mockFileExists.mockImplementation((path: string) => {
        return Promise.resolve(
          path.endsWith('package.json') || path.endsWith('pnpm-lock.yaml')
        );
      });

      const { validateRunSmokeTest } = await import('../pre-tool-use.js');
      const input = createHookInput();

      try {
        await validateRunSmokeTest(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should allow when yarn lockfile exists', async () => {
      mockFileExists.mockImplementation((path: string) => {
        return Promise.resolve(
          path.endsWith('package.json') || path.endsWith('yarn.lock')
        );
      });

      const { validateRunSmokeTest } = await import('../pre-tool-use.js');
      const input = createHookInput();

      try {
        await validateRunSmokeTest(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should allow when npm lockfile exists', async () => {
      mockFileExists.mockImplementation((path: string) => {
        return Promise.resolve(
          path.endsWith('package.json') || path.endsWith('package-lock.json')
        );
      });

      const { validateRunSmokeTest } = await import('../pre-tool-use.js');
      const input = createHookInput();

      try {
        await validateRunSmokeTest(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });
  });

  describe('validateCheckTypes', () => {
    it('should block when tsconfig.json is missing', async () => {
      mockFileExists.mockResolvedValue(false);

      const { validateCheckTypes } = await import('../pre-tool-use.js');
      const input = createHookInput();

      try {
        await validateCheckTypes(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        'No tsconfig.json found. TypeScript not configured.'
      );
      expect(mockRespond).toHaveBeenCalledWith(expect.anything(), true);
    });

    it('should allow when tsconfig.json exists', async () => {
      mockFileExists.mockResolvedValue(true);

      const { validateCheckTypes } = await import('../pre-tool-use.js');
      const input = createHookInput();

      try {
        await validateCheckTypes(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });
  });

  describe('validateImplementation', () => {
    it('should always allow', async () => {
      const { validateImplementation } = await import('../pre-tool-use.js');
      const input = createHookInput();

      try {
        await validateImplementation(input);
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });
  });

  describe('runPreToolUseHook', () => {
    it('should handle Bash tool', async () => {
      mockReadHookInput.mockResolvedValue(
        createHookInput({
          tool_name: 'Bash',
          tool_input: { command: 'npm install' },
        })
      );
      mockIsCommitCommand.mockReturnValue(false);
      mockIsGitCommand.mockReturnValue(false);

      const { runPreToolUseHook } = await import('../pre-tool-use.js');

      try {
        await runPreToolUseHook();
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should handle MCP-prefixed Bash tool', async () => {
      mockReadHookInput.mockResolvedValue(
        createHookInput({
          tool_name: 'mcp__server__Bash',
          tool_input: { command: 'ls -la' },
        })
      );
      mockIsCommitCommand.mockReturnValue(false);
      mockIsGitCommand.mockReturnValue(false);

      const { runPreToolUseHook } = await import('../pre-tool-use.js');

      try {
        await runPreToolUseHook();
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should route to detect_stack validator', async () => {
      mockReadHookInput.mockResolvedValue(
        createHookInput({ tool_name: 'mcp__goodvibes__detect_stack' })
      );
      mockFileExists.mockResolvedValue(true);

      const { runPreToolUseHook } = await import('../pre-tool-use.js');

      try {
        await runPreToolUseHook();
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockFileExists).toHaveBeenCalled();
      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should route to get_schema validator', async () => {
      mockReadHookInput.mockResolvedValue(
        createHookInput({ tool_name: 'get_schema' })
      );
      mockFileExists.mockResolvedValue(false);

      const { runPreToolUseHook } = await import('../pre-tool-use.js');

      try {
        await runPreToolUseHook();
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith(
        'PreToolUse',
        'No schema file detected. get_schema may fail.'
      );
    });

    it('should route to run_smoke_test validator', async () => {
      mockReadHookInput.mockResolvedValue(
        createHookInput({ tool_name: 'run_smoke_test' })
      );
      mockFileExists.mockResolvedValue(false);

      const { runPreToolUseHook } = await import('../pre-tool-use.js');

      try {
        await runPreToolUseHook();
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        'No package.json found. Cannot run smoke tests.'
      );
    });

    it('should route to check_types validator', async () => {
      mockReadHookInput.mockResolvedValue(
        createHookInput({ tool_name: 'check_types' })
      );
      mockFileExists.mockResolvedValue(true);

      const { runPreToolUseHook } = await import('../pre-tool-use.js');

      try {
        await runPreToolUseHook();
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockFileExists).toHaveBeenCalled();
      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should route to validate_implementation validator', async () => {
      mockReadHookInput.mockResolvedValue(
        createHookInput({ tool_name: 'validate_implementation' })
      );

      const { runPreToolUseHook } = await import('../pre-tool-use.js');

      try {
        await runPreToolUseHook();
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should allow unknown tools by default', async () => {
      mockReadHookInput.mockResolvedValue(
        createHookInput({ tool_name: 'some_unknown_tool' })
      );

      const { runPreToolUseHook } = await import('../pre-tool-use.js');

      try {
        await runPreToolUseHook();
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockDebug).toHaveBeenCalledWith(
        expect.stringContaining("Unknown tool 'some_unknown_tool'")
      );
      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should handle empty tool name', async () => {
      mockReadHookInput.mockResolvedValue(createHookInput({ tool_name: '' }));

      const { runPreToolUseHook } = await import('../pre-tool-use.js');

      try {
        await runPreToolUseHook();
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should handle undefined tool name', async () => {
      const input = createHookInput();
      delete (input as Record<string, unknown>).tool_name;
      mockReadHookInput.mockResolvedValue(input);

      const { runPreToolUseHook } = await import('../pre-tool-use.js');

      try {
        await runPreToolUseHook();
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should handle errors gracefully', async () => {
      mockReadHookInput.mockRejectedValue(new Error('Failed to read input'));

      const { runPreToolUseHook } = await import('../pre-tool-use.js');

      try {
        await runPreToolUseHook();
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockLogError).toHaveBeenCalledWith(
        'PreToolUse main',
        expect.any(Error)
      );
      expect(mockAllowTool).toHaveBeenCalledWith(
        'PreToolUse',
        'Hook error: Failed to read input'
      );
    });

    it('should handle non-Error exceptions', async () => {
      mockReadHookInput.mockRejectedValue('string error');

      const { runPreToolUseHook } = await import('../pre-tool-use.js');

      try {
        await runPreToolUseHook();
      } catch (e) {
        // Expected due to respond throwing
      }

      expect(mockLogError).toHaveBeenCalledWith(
        'PreToolUse main',
        'string error'
      );
      expect(mockAllowTool).toHaveBeenCalledWith(
        'PreToolUse',
        'Hook error: string error'
      );
    });
  });
});
