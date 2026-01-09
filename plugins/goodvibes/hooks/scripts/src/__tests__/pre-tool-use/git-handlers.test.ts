/**
 * Tests for pre-tool-use/git-handlers.ts
 * Target: 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  extractBashCommand,
  handleGitCommit,
  handleGitCommand,
} from '../../pre-tool-use/git-handlers.js';

import type { HookInput } from '../../shared/hook-io.js';

// Mock dependencies
vi.mock('../../pre-tool-use/git-guards.js');
vi.mock('../../pre-tool-use/quality-gates.js');
vi.mock('../../shared/index.js');
vi.mock('../../state/index.js');
vi.mock('../../types/config.js');

import {
  checkBranchGuard,
  checkMergeReadiness,
  isMergeCommand,
} from '../../pre-tool-use/git-guards.js';
import {
  runQualityGates,
  isCommitCommand,
  formatGateResults,
} from '../../pre-tool-use/quality-gates.js';
import { respond, allowTool, blockTool, debug } from '../../shared/index.js';
import { loadState } from '../../state/index.js';
import { getDefaultConfig } from '../../types/config.js';

const mockedCheckBranchGuard = vi.mocked(checkBranchGuard);
const mockedCheckMergeReadiness = vi.mocked(checkMergeReadiness);
const mockedIsMergeCommand = vi.mocked(isMergeCommand);
const mockedRunQualityGates = vi.mocked(runQualityGates);
const mockedFormatGateResults = vi.mocked(formatGateResults);
const mockedRespond = vi.mocked(respond);
const mockedAllowTool = vi.mocked(allowTool);
const mockedBlockTool = vi.mocked(blockTool);
const mockedDebug = vi.mocked(debug);
const mockedLoadState = vi.mocked(loadState);
const mockedGetDefaultConfig = vi.mocked(getDefaultConfig);

describe('git-handlers', () => {
  let mockInput: HookInput;
  let mockConfig: ReturnType<typeof getDefaultConfig>;
  let mockState: Awaited<ReturnType<typeof loadState>>;

  beforeEach(() => {
    mockInput = {
      session_id: 'test-session',
      transcript_path: '/path/to/transcript',
      cwd: '/test/cwd',
      permission_mode: 'default',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "test"' },
    };

    mockConfig = {
      automation: {
        building: { runBeforeCommit: true, runBeforePR: false },
        testing: { runBeforeCommit: true, runBeforePR: false },
      },
    } as ReturnType<typeof getDefaultConfig>;

    mockState = {};

    vi.clearAllMocks();

    mockedGetDefaultConfig.mockReturnValue(mockConfig);
    mockedLoadState.mockResolvedValue(mockState);
    mockedAllowTool.mockReturnValue({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    });
    mockedBlockTool.mockReturnValue({
      continue: false,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractBashCommand', () => {
    it('should extract command from Bash tool input', () => {
      const result = extractBashCommand(mockInput);
      expect(result).toBe('git commit -m "test"');
    });

    it('should extract command from namespaced Bash tool', () => {
      const input = {
        ...mockInput,
        tool_name: 'namespace__Bash',
      };
      const result = extractBashCommand(input);
      expect(result).toBe('git commit -m "test"');
    });

    it('should return null for non-Bash tools', () => {
      const input = {
        ...mockInput,
        tool_name: 'Read',
      };
      const result = extractBashCommand(input);
      expect(result).toBeNull();
    });

    it('should return null when command is missing', () => {
      const input = {
        ...mockInput,
        tool_input: {},
      };
      const result = extractBashCommand(input);
      expect(result).toBeNull();
    });

    it('should return null when tool_input is undefined', () => {
      const input = {
        ...mockInput,
        tool_input: undefined,
      };
      const result = extractBashCommand(input);
      expect(result).toBeNull();
    });
  });

  describe('handleGitCommit', () => {
    beforeEach(() => {
      mockedRunQualityGates.mockResolvedValue({
        allPassed: true,
        blocking: false,
        results: [
          { name: 'TypeScript', status: 'passed' as const, autoFixAttempted: false },
        ],
      });
      mockedFormatGateResults.mockReturnValue('TypeScript passed');
    });

    it('should allow commit when quality gates are disabled', async () => {
      mockConfig.automation.building.runBeforeCommit = false;
      mockConfig.automation.testing.runBeforeCommit = false;

      await handleGitCommit(mockInput, 'git commit -m "test"');

      expect(mockedDebug).toHaveBeenCalledWith(
        'Quality gates disabled for commits'
      );
      expect(mockedRespond).toHaveBeenCalledWith(
        expect.objectContaining({ continue: true })
      );
      expect(mockedRunQualityGates).not.toHaveBeenCalled();
    });

    it('should run quality gates when enabled', async () => {
      await handleGitCommit(mockInput, 'git commit -m "test"');

      expect(mockedRunQualityGates).toHaveBeenCalledWith('/test/cwd');
      expect(mockedDebug).toHaveBeenCalledWith(
        'Git commit detected, running quality gates',
        { command: 'git commit -m "test"' }
      );
    });

    it('should allow commit when all quality gates pass', async () => {
      await handleGitCommit(mockInput, 'git commit -m "test"');

      expect(mockedRespond).toHaveBeenCalledWith(
        expect.objectContaining({ continue: true })
      );
      expect(mockedAllowTool).toHaveBeenCalledWith(
        'PreToolUse',
        'All quality gates passed: TypeScript passed'
      );
    });

    it('should block commit when quality gates fail with blocking issues', async () => {
      mockedRunQualityGates.mockResolvedValue({
        allPassed: false,
        blocking: true,
        results: [
          { name: 'TypeScript', status: 'failed' as const, autoFixAttempted: false },
        ],
      });
      mockedFormatGateResults.mockReturnValue('TypeScript failed');

      await handleGitCommit(mockInput, 'git commit -m "test"');

      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        'Quality gates failed: TypeScript failed. Fix issues before committing.'
      );
      expect(mockedRespond).toHaveBeenCalledWith(
        expect.objectContaining({ continue: false }),
        true
      );
    });

    it('should allow commit with warning for non-blocking failures', async () => {
      mockedRunQualityGates.mockResolvedValue({
        allPassed: false,
        blocking: false,
        results: [
          { name: 'Prettier', status: 'failed' as const, autoFixAttempted: false },
        ],
      });
      mockedFormatGateResults.mockReturnValue('Prettier failed');

      await handleGitCommit(mockInput, 'git commit -m "test"');

      expect(mockedAllowTool).toHaveBeenCalledWith(
        'PreToolUse',
        'Quality gates partially passed: Prettier failed. Proceeding with commit.'
      );
      expect(mockedRespond).toHaveBeenCalledWith(
        expect.objectContaining({ continue: true })
      );
    });

    it('should use cwd from input if provided', async () => {
      await handleGitCommit(mockInput, 'git commit -m "test"');

      expect(mockedRunQualityGates).toHaveBeenCalledWith('/test/cwd');
    });

    it('should use process.cwd() if input.cwd is undefined', async () => {
      const inputNoCwd = { ...mockInput, cwd: undefined };
      const originalCwd = process.cwd();

      await handleGitCommit(inputNoCwd, 'git commit -m "test"');

      expect(mockedRunQualityGates).toHaveBeenCalledWith(originalCwd);
    });
  });

  describe('handleGitCommand', () => {
    beforeEach(() => {
      mockedCheckBranchGuard.mockResolvedValue({
        allowed: true,
        warning: undefined,
      });
      mockedCheckMergeReadiness.mockReturnValue({
        allowed: true,
        warning: undefined,
      });
      mockedIsMergeCommand.mockReturnValue(false);
    });

    it('should check branch guards for git commands', async () => {
      await handleGitCommand(mockInput, 'git push');

      expect(mockedLoadState).toHaveBeenCalledWith('/test/cwd');
      expect(mockedCheckBranchGuard).toHaveBeenCalledWith(
        'git push',
        '/test/cwd',
        mockState
      );
    });

    it('should allow command when branch guard passes', async () => {
      await handleGitCommand(mockInput, 'git push');

      expect(mockedRespond).toHaveBeenCalledWith(
        expect.objectContaining({ continue: true })
      );
    });

    it('should block command when branch guard fails', async () => {
      mockedCheckBranchGuard.mockResolvedValue({
        allowed: false,
        reason: 'Force push to main is not allowed',
      });

      await handleGitCommand(mockInput, 'git push --force');

      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        'Force push to main is not allowed'
      );
      expect(mockedRespond).toHaveBeenCalledWith(
        expect.objectContaining({ continue: false }),
        true
      );
    });

    it('should use default reason when branch guard reason is undefined', async () => {
      mockedCheckBranchGuard.mockResolvedValue({
        allowed: false,
        reason: undefined,
      });

      await handleGitCommand(mockInput, 'git push --force');

      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        'Git operation blocked'
      );
    });

    it('should check merge readiness for merge commands', async () => {
      mockedIsMergeCommand.mockReturnValue(true);

      await handleGitCommand(mockInput, 'git merge feature');

      expect(mockedIsMergeCommand).toHaveBeenCalledWith('git merge feature');
      expect(mockedCheckMergeReadiness).toHaveBeenCalledWith(
        '/test/cwd',
        mockState
      );
    });

    it('should block merge when merge readiness fails', async () => {
      mockedIsMergeCommand.mockReturnValue(true);
      mockedCheckMergeReadiness.mockReturnValue({
        allowed: false,
        reason: 'Tests are failing',
      });

      await handleGitCommand(mockInput, 'git merge feature');

      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        'Tests are failing'
      );
      expect(mockedRespond).toHaveBeenCalledWith(
        expect.objectContaining({ continue: false }),
        true
      );
    });

    it('should use default reason when merge guard reason is undefined', async () => {
      mockedIsMergeCommand.mockReturnValue(true);
      mockedCheckMergeReadiness.mockReturnValue({
        allowed: false,
        reason: undefined,
      });

      await handleGitCommand(mockInput, 'git merge feature');

      expect(mockedBlockTool).toHaveBeenCalledWith('PreToolUse', 'Merge blocked');
    });

    it('should allow merge with warning when merge readiness has warning', async () => {
      mockedIsMergeCommand.mockReturnValue(true);
      mockedCheckMergeReadiness.mockReturnValue({
        allowed: true,
        warning: 'No tests found, proceeding anyway',
      });

      await handleGitCommand(mockInput, 'git merge feature');

      expect(mockedAllowTool).toHaveBeenCalledWith(
        'PreToolUse',
        'No tests found, proceeding anyway'
      );
      expect(mockedRespond).toHaveBeenCalledWith(
        expect.objectContaining({ continue: true })
      );
    });

    it('should allow command with warning from branch guard', async () => {
      mockedCheckBranchGuard.mockResolvedValue({
        allowed: true,
        warning: 'Pushing to main, be careful',
      });

      await handleGitCommand(mockInput, 'git push origin main');

      expect(mockedAllowTool).toHaveBeenCalledWith(
        'PreToolUse',
        'Pushing to main, be careful'
      );
    });

    it('should use process.cwd() if input.cwd is undefined', async () => {
      const inputNoCwd = { ...mockInput, cwd: undefined };
      const originalCwd = process.cwd();

      await handleGitCommand(inputNoCwd, 'git push');

      expect(mockedLoadState).toHaveBeenCalledWith(originalCwd);
      expect(mockedCheckBranchGuard).toHaveBeenCalledWith(
        'git push',
        originalCwd,
        mockState
      );
    });

    it('should not check merge readiness for non-merge commands', async () => {
      mockedIsMergeCommand.mockReturnValue(false);

      await handleGitCommand(mockInput, 'git push');

      expect(mockedCheckMergeReadiness).not.toHaveBeenCalled();
    });
  });
});
