/**
 * Unit tests for handleAutoRollback
 *
 * Tests the auto-rollback handler that runs validation and automatically
 * rolls back git changes if validation fails.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process before importing the handler
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Mock config
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

// Mock utils
vi.mock('../../../utils.js', () => ({
  detectPackageManager: vi.fn().mockResolvedValue('npm'),
}));

// Import after mocks are set up
import { execSync } from 'child_process';
import { handleAutoRollback, getValidationCommand } from '../../../handlers/edit/auto-rollback.js';
import { detectPackageManager } from '../../../utils.js';

// Type the mocked function
const mockedExecSync = vi.mocked(execSync);

/**
 * Helper to create properly formatted git status --porcelain output.
 * Git porcelain format: XY PATH where XY is 2 chars, then space, then path.
 * Example: " M file.ts" for worktree-modified file.
 */
function gitStatus(entries: Array<{ status: string; path: string }>): string {
  return entries
    .map(({ status, path }) => {
      // Ensure status is exactly 2 characters, pad with space if needed
      const s = status.padEnd(2, ' ').substring(0, 2);
      return `${s} ${path}`;
    })
    .join('\n');
}

describe('getValidationCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('throws error when custom trigger has no command', async () => {
    await expect(getValidationCommand('custom')).rejects.toThrow(
      'validation_command is required when trigger is "custom"'
    );
  });
});

describe('handleAutoRollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('argument validation', () => {
    test('returns error when custom trigger without command', async () => {
      const result = await handleAutoRollback({
        trigger: 'custom',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('validation_command is required');
    });
  });

  describe('git status check', () => {
    test('returns error when not in git repository', async () => {
      mockedExecSync.mockImplementation(() => {
        const error = new Error('not a git repository');
        (error as any).status = 128;
        throw error;
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('git');
    });

    test('captures initial git status', async () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return gitStatus([
            { status: ' M', path: 'file1.ts' },
            { status: ' M', path: 'file2.ts' },
          ]);
        }
        if (cmdStr.includes('tsc')) {
          return ''; // No errors
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.git_status_before).toContain('file1.ts');
      expect(data.git_status_before).toContain('file2.ts');
    });
  });

  describe('validation triggers', () => {
    test('runs type check for type_error trigger', async () => {
      let typeCheckRan = false;

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('tsc --noEmit')) {
          typeCheckRan = true;
          return '';
        }
        return '';
      });

      await handleAutoRollback({
        trigger: 'type_error',
      });

      expect(typeCheckRan).toBe(true);
    });

    test('runs tests for test_failure trigger', async () => {
      let testRan = false;

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('npm run test')) {
          testRan = true;
          return 'All tests passed';
        }
        return '';
      });

      await handleAutoRollback({
        trigger: 'test_failure',
      });

      expect(testRan).toBe(true);
    });

    test('runs linting for lint_error trigger', async () => {
      let lintRan = false;

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('eslint')) {
          lintRan = true;
          return '';
        }
        return '';
      });

      await handleAutoRollback({
        trigger: 'lint_error',
      });

      expect(lintRan).toBe(true);
    });

    test('runs build for build_error trigger', async () => {
      let buildRan = false;

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('npm run build')) {
          buildRan = true;
          return 'Build successful';
        }
        return '';
      });

      await handleAutoRollback({
        trigger: 'build_error',
      });

      expect(buildRan).toBe(true);
    });

    test('runs custom command for custom trigger', async () => {
      let customRan = false;

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('my-custom-validator')) {
          customRan = true;
          return '';
        }
        return '';
      });

      await handleAutoRollback({
        trigger: 'custom',
        validation_command: 'my-custom-validator --strict',
      });

      expect(customRan).toBe(true);
    });
  });

  describe('package manager detection', () => {
    test('uses pnpm commands when detected', async () => {
      vi.mocked(detectPackageManager).mockResolvedValue('pnpm');

      let commandUsed = '';
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('pnpm')) {
          commandUsed = cmdStr;
          return '';
        }
        return '';
      });

      await handleAutoRollback({
        trigger: 'type_error',
      });

      expect(commandUsed).toContain('pnpm');
    });

    test('uses yarn commands when detected', async () => {
      vi.mocked(detectPackageManager).mockResolvedValue('yarn');

      let commandUsed = '';
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('yarn')) {
          commandUsed = cmdStr;
          return '';
        }
        return '';
      });

      await handleAutoRollback({
        trigger: 'type_error',
      });

      expect(commandUsed).toContain('yarn');
    });
  });

  describe('validation success', () => {
    test('does not rollback when validation passes', async () => {
      let rollbackCalled = false;

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('tsc')) {
          return ''; // Success
        }
        if (cmdStr.includes('git checkout')) {
          rollbackCalled = true;
          return '';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.validation_passed).toBe(true);
      expect(data.rollback_performed).toBe(false);
      expect(rollbackCalled).toBe(false);
    });

    test('returns validation output on success', async () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('tsc')) {
          return 'Compilation complete';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.validation_passed).toBe(true);
      expect(data.validation_output).toContain('Compilation complete');
      expect(data.validation_exit_code).toBe(0);
    });
  });

  describe('validation failure and rollback', () => {
    test('performs rollback when validation fails', async () => {
      const revertedFiles: string[] = [];

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return gitStatus([
            { status: ' M', path: 'file1.ts' },
            { status: ' M', path: 'file2.ts' },
          ]);
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 1;
          (error as any).stderr = 'error TS2339';
          throw error;
        }
        if (cmdStr.includes('git checkout --')) {
          const match = cmdStr.match(/git checkout -- "(.+)"/);
          if (match) {
            revertedFiles.push(match[1]);
          }
          return '';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.validation_passed).toBe(false);
      expect(data.rollback_performed).toBe(true);
      expect(data.files_reverted).toContain('file1.ts');
      expect(data.files_reverted).toContain('file2.ts');
    });

    test('captures validation error output', async () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 2;
          (error as any).stdout = 'file.ts(10,5): error TS2339';
          (error as any).stderr = '';
          throw error;
        }
        if (cmdStr.includes('git checkout')) {
          return '';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.validation_passed).toBe(false);
      expect(data.validation_exit_code).toBe(2);
      expect(data.validation_output).toContain('TS2339');
    });
  });

  describe('specific file rollback', () => {
    test('only reverts specified files', async () => {
      const revertedFiles: string[] = [];

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return gitStatus([
            { status: ' M', path: 'file1.ts' },
            { status: ' M', path: 'file2.ts' },
            { status: ' M', path: 'file3.ts' },
          ]);
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git checkout --')) {
          const match = cmdStr.match(/git checkout -- "(.+)"/);
          if (match) {
            revertedFiles.push(match[1]);
          }
          return '';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
        files: ['file1.ts', 'file3.ts'],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.files_reverted).toContain('file1.ts');
      expect(data.files_reverted).toContain('file3.ts');
      expect(data.files_reverted).not.toContain('file2.ts');
    });

    test('ignores files not in modified list', async () => {
      const revertedFiles: string[] = [];

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return gitStatus([{ status: ' M', path: 'file1.ts' }]);
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git checkout --')) {
          const match = cmdStr.match(/git checkout -- "(.+)"/);
          if (match) {
            revertedFiles.push(match[1]);
          }
          return '';
        }
        return '';
      });

      await handleAutoRollback({
        trigger: 'type_error',
        files: ['file1.ts', 'nonexistent.ts'],
      });

      expect(revertedFiles).toContain('file1.ts');
      expect(revertedFiles).not.toContain('nonexistent.ts');
    });
  });

  describe('untracked files', () => {
    test('handles untracked files with include_untracked option', async () => {
      const deletedFiles: string[] = [];

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return gitStatus([
            { status: ' M', path: 'file1.ts' },
            { status: '??', path: 'newfile.ts' },
          ]);
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git checkout')) {
          return '';
        }
        if (cmdStr.includes('git clean -fd')) {
          const match = cmdStr.match(/git clean -fd "(.+)"/);
          if (match) {
            deletedFiles.push(match[1]);
          }
          return '';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
        include_untracked: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.files_reverted).toContain('file1.ts');
      expect(data.files_deleted).toContain('newfile.ts');
    });

    test('does not delete untracked files by default', async () => {
      const deletedFiles: string[] = [];

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return gitStatus([
            { status: ' M', path: 'file1.ts' },
            { status: '??', path: 'newfile.ts' },
          ]);
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git checkout')) {
          return '';
        }
        if (cmdStr.includes('git clean')) {
          deletedFiles.push('cleaned');
          return '';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.files_deleted).toHaveLength(0);
      expect(deletedFiles).toHaveLength(0);
    });
  });

  describe('stash before rollback', () => {
    test('stashes changes when stash_before_rollback is true', async () => {
      let stashCalled = false;

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git stash push')) {
          stashCalled = true;
          return 'Saved working directory';
        }
        if (cmdStr.includes('git stash list')) {
          return 'stash@{0}: auto-rollback';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
        stash_before_rollback: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(stashCalled).toBe(true);
      expect(data.stash_ref).toBeDefined();
      expect(data.rollback_performed).toBe(true);
    });

    test('does not stash when stash_before_rollback is false', async () => {
      let stashCalled = false;

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git stash')) {
          stashCalled = true;
          return '';
        }
        if (cmdStr.includes('git checkout')) {
          return '';
        }
        return '';
      });

      await handleAutoRollback({
        trigger: 'type_error',
        stash_before_rollback: false,
      });

      expect(stashCalled).toBe(false);
    });
  });

  describe('git status after rollback', () => {
    test('captures git status after rollback', async () => {
      let statusCallCount = 0;

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          statusCallCount++;
          if (statusCallCount === 1) {
            return ' M file.ts';
          }
          return ''; // Clean after rollback
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git checkout')) {
          return '';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.git_status_before).toContain('file.ts');
      expect(data.git_status_after).toBe('');
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('tsc')) {
          return '';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
      });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveProperty('validation_passed');
      expect(data).toHaveProperty('validation_output');
      expect(data).toHaveProperty('validation_exit_code');
      expect(data).toHaveProperty('rollback_performed');
      expect(data).toHaveProperty('files_reverted');
      expect(data).toHaveProperty('files_deleted');
      expect(data).toHaveProperty('git_status_before');
      expect(data).toHaveProperty('git_status_after');
    });

    test('returns valid JSON', async () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('tsc')) {
          return '';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe('output truncation', () => {
    test('truncates very long validation output', async () => {
      const longOutput = 'x'.repeat(10000);

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('tsc')) {
          return longOutput;
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.validation_output.length).toBeLessThan(6000);
    });
  });

  describe('additional coverage tests', () => {
    test('throws error for unknown trigger type', async () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'unknown_trigger' as any,
      });

      const data = JSON.parse(result.content[0].text);
      expect(result.isError).toBe(true);
      expect(data.error).toContain('Unknown trigger type');
    });

    test('filters files correctly when files argument is provided', async () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file1.ts\n M file2.ts\n?? new.ts';
        }
        if (cmdStr.includes('tsc')) {
           const error = new Error('Type errors');
          (error as any).status = 1;
          throw error;
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
        files: ['file1.ts', 'new.ts'],
        include_untracked: true
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.files_reverted).toContain('file1.ts');
      expect(data.files_reverted).not.toContain('file2.ts');
      expect(data.files_deleted).toContain('new.ts');
    });

     test('stashes untracked files when include_untracked is true', async () => {
      let stashUntrackedCalled = false;

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts\n?? new.ts';
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git stash push -m')) {
           return 'Saved working directory';
        }
        if (cmdStr.includes('git stash push -u -m')) {
          stashUntrackedCalled = true;
          return 'Saved working directory';
        }
        if (cmdStr.includes('git stash list')) {
          return 'stash@{0}: auto-rollback';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
        stash_before_rollback: true,
        include_untracked: true
      });

      const data = JSON.parse(result.content[0].text);
      expect(stashUntrackedCalled).toBe(true);
      expect(data.files_deleted).toContain('new.ts');
    });
  });

  describe('branch coverage: runCommand error handling', () => {
    test('line 96: uses exit code 1 when error.status is undefined', async () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('tsc')) {
          // Throw error without status property to trigger || 1 branch
          const error = new Error('Command failed');
          (error as any).stdout = 'some output';
          (error as any).stderr = 'some error';
          // Explicitly NOT setting status to trigger the || 1 fallback
          throw error;
        }
        if (cmdStr.includes('git checkout')) {
          return '';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.validation_passed).toBe(false);
      expect(data.validation_exit_code).toBe(1);
    });

    test('line 96: handles Buffer stdout/stderr in error', async () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Command failed');
          // Use Buffer instead of string to exercise that branch
          (error as any).stdout = Buffer.from('buffer stdout');
          (error as any).stderr = Buffer.from('buffer stderr');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git checkout')) {
          return '';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.validation_passed).toBe(false);
      expect(data.validation_output).toContain('buffer stdout');
      expect(data.validation_output).toContain('buffer stderr');
    });
  });

  describe('branch coverage: parseGitStatus empty lines', () => {
    test('line 144: skips empty lines in git status output', async () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          // Include empty lines and whitespace-only lines
          return ' M file1.ts\n\n   \n M file2.ts\n';
        }
        if (cmdStr.includes('tsc')) {
          return '';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
      });
      const data = JSON.parse(result.content[0].text);

      // Should parse only the two valid files, ignoring empty lines
      expect(data.git_status_before).toContain('file1.ts');
      expect(data.git_status_before).toContain('file2.ts');
      expect(data.validation_passed).toBe(true);
    });
  });

  describe('branch coverage: non-Error thrown in getValidationCommand', () => {
    test('line 259: handles non-Error thrown during validation command generation', async () => {
      // Mock detectPackageManager to throw a non-Error value
      vi.mocked(detectPackageManager).mockRejectedValueOnce('string error');

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toBe('Unknown error');
    });
  });

  describe('branch coverage: stash with only untracked files', () => {
    test('line 301: stash_before_rollback when only filesToDelete has items', async () => {
      let stashCalled = false;

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          // Only untracked files, no modified files
          return '?? newfile.ts';
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git stash push -m')) {
          stashCalled = true;
          return 'Saved working directory';
        }
        if (cmdStr.includes('git stash list')) {
          return 'stash@{0}: auto-rollback';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
        stash_before_rollback: true,
        include_untracked: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(stashCalled).toBe(true);
      expect(data.rollback_performed).toBe(true);
    });

    test('line 301: stash skipped when no files to revert or delete', async () => {
      let stashCalled = false;

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          // No files at all
          return '';
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git stash')) {
          stashCalled = true;
          return '';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
        stash_before_rollback: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(stashCalled).toBe(false);
      expect(data.rollback_performed).toBe(false);
    });
  });

  describe('branch coverage: stash untracked failure', () => {
    test('line 322-335: stash untracked fails - files_deleted not updated', async () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts\n?? newfile.ts';
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git stash push -u -m')) {
          // Fail the untracked stash
          const error = new Error('Stash untracked failed');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git stash push -m')) {
          return 'Saved working directory';
        }
        if (cmdStr.includes('git stash list')) {
          return 'stash@{0}: auto-rollback';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
        stash_before_rollback: true,
        include_untracked: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.rollback_performed).toBe(true);
      expect(data.files_reverted).toContain('file.ts');
      // files_deleted should NOT contain newfile.ts since stash -u failed
      expect(data.files_deleted).not.toContain('newfile.ts');
    });
  });

  describe('branch coverage: git checkout failure', () => {
    test('line 335: git checkout fails for a file - file not added to reverted list', async () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file1.ts\n M file2.ts';
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git checkout -- "file1.ts"')) {
          // Fail for file1.ts
          const error = new Error('Checkout failed');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git checkout -- "file2.ts"')) {
          // Succeed for file2.ts
          return '';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.rollback_performed).toBe(true);
      // file1.ts should NOT be in reverted list since checkout failed
      expect(data.files_reverted).not.toContain('file1.ts');
      // file2.ts should be in reverted list since checkout succeeded
      expect(data.files_reverted).toContain('file2.ts');
    });
  });

  describe('branch coverage: git clean failure', () => {
    test('line 346-351: git clean fails - file not added to deleted list', async () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return '?? newfile1.ts\n?? newfile2.ts';
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git clean -fd "newfile1.ts"')) {
          // Fail for newfile1.ts
          const error = new Error('Clean failed');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git clean -fd "newfile2.ts"')) {
          // Succeed for newfile2.ts
          return '';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
        include_untracked: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.rollback_performed).toBe(true);
      // newfile1.ts should NOT be in deleted list since clean failed
      expect(data.files_deleted).not.toContain('newfile1.ts');
      // newfile2.ts should be in deleted list since clean succeeded
      expect(data.files_deleted).toContain('newfile2.ts');
    });

    test('line 350-351: rollback_performed set true only from files_deleted', async () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          // Only untracked files, no modified files
          return '?? newfile.ts';
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git clean -fd')) {
          return '';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
        include_untracked: true,
      });
      const data = JSON.parse(result.content[0].text);

      // No files were reverted (only deleted)
      expect(data.files_reverted).toHaveLength(0);
      // One file was deleted
      expect(data.files_deleted).toContain('newfile.ts');
      // rollback_performed should still be true because files were deleted
      expect(data.rollback_performed).toBe(true);
    });
  });

  describe('branch coverage: stash initial failure', () => {
    test('line 309: initial stash push fails - no rollback performed via stash path', async () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git stash push -m')) {
          // Fail the initial stash
          const error = new Error('Stash failed');
          (error as any).status = 1;
          throw error;
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
        stash_before_rollback: true,
      });
      const data = JSON.parse(result.content[0].text);

      // Since stash failed, rollback_performed should be false
      expect(data.rollback_performed).toBe(false);
      expect(data.stash_ref).toBeUndefined();
    });
  });

  describe('branch coverage: stash_ref fallback', () => {
    test('line 312: uses stashMessage when git stash list returns empty', async () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('git status --porcelain')) {
          return ' M file.ts';
        }
        if (cmdStr.includes('tsc')) {
          const error = new Error('Type errors');
          (error as any).status = 1;
          throw error;
        }
        if (cmdStr.includes('git stash push -m')) {
          return 'Saved working directory';
        }
        if (cmdStr.includes('git stash list -1')) {
          // Return empty string to trigger the || stashMessage fallback
          return '';
        }
        return '';
      });

      const result = await handleAutoRollback({
        trigger: 'type_error',
        stash_before_rollback: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.rollback_performed).toBe(true);
      // stash_ref should fall back to the generated stashMessage (auto-rollback-*)
      expect(data.stash_ref).toMatch(/^auto-rollback-/);
    });
  });
});
