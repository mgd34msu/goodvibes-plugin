/**
 * Tests for automation/git-operations.ts
 *
 * Covers all git operations including:
 * - execGit: Execute git commands and return output
 * - isGitRepo: Check if directory is a git repository
 * - detectMainBranch: Detect main/master branch
 * - getCurrentBranch: Get current branch name
 * - hasUncommittedChanges: Check for uncommitted changes
 * - getUncommittedFiles: List files with uncommitted changes
 * - createCheckpoint: Create checkpoint commits
 * - createFeatureBranch: Create feature branches
 * - mergeFeatureBranch: Merge and delete feature branches
 * - spawnAsync: Internal promise wrapper for spawn
 * - sanitizeForGit: Sanitize strings for git commands
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('git-operations', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // =============================================================================
  // execGit tests
  // =============================================================================
  describe('execGit', () => {
    it('should return trimmed output on successful command', async () => {
      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: '  result output  \n', stderr: '' });
            }
          ),
        spawn: vi.fn(),
      }));

      const { execGit } = await import('../../automation/git-operations.js');
      const result = await execGit('git status', '/test/project');

      expect(result).toBe('result output');
    });

    it('should return null when command fails', async () => {
      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(new Error('git command failed'), {
                stdout: '',
                stderr: 'error',
              });
            }
          ),
        spawn: vi.fn(),
      }));

      const { execGit } = await import('../../automation/git-operations.js');
      const result = await execGit('git invalid', '/test/project');

      expect(result).toBeNull();
    });

    it('should pass cwd and timeout options to exec', async () => {
      const mockExec = vi
        .fn()
        .mockImplementation(
          (
            _cmd: string,
            _opts: unknown,
            callback: (
              _err: Error | null,
              _result: { stdout: string; stderr: string }
            ) => void
          ) => {
            callback(null, { stdout: 'ok', stderr: '' });
          }
        );

      vi.doMock('child_process', () => ({
        exec: mockExec,
        spawn: vi.fn(),
      }));

      const { execGit } = await import('../../automation/git-operations.js');
      await execGit('git log', '/my/repo');

      expect(mockExec).toHaveBeenCalledWith(
        'git log',
        { cwd: '/my/repo', encoding: 'utf-8', timeout: 30000 },
        expect.any(Function)
      );
    });
  });

  // =============================================================================
  // isGitRepo tests
  // =============================================================================
  describe('isGitRepo', () => {
    it('should return true when .git directory exists', async () => {
      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      const { isGitRepo } = await import('../../automation/git-operations.js');
      const result = await isGitRepo('/test/project');

      expect(result).toBe(true);
    });

    it('should return false when .git directory does not exist', async () => {
      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(false),
      }));

      const { isGitRepo } = await import('../../automation/git-operations.js');
      const result = await isGitRepo('/test/project');

      expect(result).toBe(false);
    });

    it('should check for .git in the provided directory path', async () => {
      const mockFileExists = vi.fn().mockResolvedValue(true);
      vi.doMock('../../shared/file-utils.js', () => ({
        fileExists: mockFileExists,
      }));

      const { isGitRepo } = await import('../../automation/git-operations.js');
      await isGitRepo('/custom/path');

      // Should join path with .git
      expect(mockFileExists).toHaveBeenCalledWith(
        expect.stringContaining('.git')
      );
    });
  });

  // =============================================================================
  // detectMainBranch tests
  // =============================================================================
  describe('detectMainBranch', () => {
    it('should return "main" when main branch exists', async () => {
      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              if (cmd.includes('main')) {
                callback(null, { stdout: 'abc123\n', stderr: '' });
              } else {
                callback(new Error('not found'), { stdout: '', stderr: '' });
              }
            }
          ),
        spawn: vi.fn(),
      }));

      const { detectMainBranch } =
        await import('../../automation/git-operations.js');
      const result = await detectMainBranch('/test/project');

      expect(result).toBe('main');
    });

    it('should return "master" when only master branch exists', async () => {
      let callCount = 0;
      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callCount++;
              if (callCount === 1) {
                // First call for 'main' fails
                callback(new Error('fatal: Needed a single revision'), {
                  stdout: '',
                  stderr: '',
                });
              } else {
                // Second call for 'master' succeeds
                callback(null, { stdout: 'abc123\n', stderr: '' });
              }
            }
          ),
        spawn: vi.fn(),
      }));

      const { detectMainBranch } =
        await import('../../automation/git-operations.js');
      const result = await detectMainBranch('/test/project');

      expect(result).toBe('master');
    });

    it('should default to "main" when neither branch exists', async () => {
      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(new Error('fatal: Needed a single revision'), {
                stdout: '',
                stderr: '',
              });
            }
          ),
        spawn: vi.fn(),
      }));

      const { detectMainBranch } =
        await import('../../automation/git-operations.js');
      const result = await detectMainBranch('/test/project');

      expect(result).toBe('main');
    });
  });

  // =============================================================================
  // getCurrentBranch tests
  // =============================================================================
  describe('getCurrentBranch', () => {
    it('should return current branch name', async () => {
      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: 'feature/my-branch\n', stderr: '' });
            }
          ),
        spawn: vi.fn(),
      }));

      const { getCurrentBranch } =
        await import('../../automation/git-operations.js');
      const result = await getCurrentBranch('/test/project');

      expect(result).toBe('feature/my-branch');
    });

    it('should return null on detached HEAD or error', async () => {
      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(new Error('fatal: not on a branch'), {
                stdout: '',
                stderr: '',
              });
            }
          ),
        spawn: vi.fn(),
      }));

      const { getCurrentBranch } =
        await import('../../automation/git-operations.js');
      const result = await getCurrentBranch('/test/project');

      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // hasUncommittedChanges tests
  // =============================================================================
  describe('hasUncommittedChanges', () => {
    it('should return true when there are uncommitted changes', async () => {
      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, {
                stdout: ' M src/file.ts\nA  new-file.ts',
                stderr: '',
              });
            }
          ),
        spawn: vi.fn(),
      }));

      const { hasUncommittedChanges } =
        await import('../../automation/git-operations.js');
      const result = await hasUncommittedChanges('/test/project');

      expect(result).toBe(true);
    });

    it('should return false when working directory is clean', async () => {
      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: '', stderr: '' });
            }
          ),
        spawn: vi.fn(),
      }));

      const { hasUncommittedChanges } =
        await import('../../automation/git-operations.js');
      const result = await hasUncommittedChanges('/test/project');

      expect(result).toBe(false);
    });

    it('should return false when git command fails', async () => {
      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(new Error('not a git repository'), {
                stdout: '',
                stderr: '',
              });
            }
          ),
        spawn: vi.fn(),
      }));

      const { hasUncommittedChanges } =
        await import('../../automation/git-operations.js');
      const result = await hasUncommittedChanges('/test/project');

      expect(result).toBe(false);
    });
  });

  // =============================================================================
  // getUncommittedFiles tests
  // =============================================================================
  describe('getUncommittedFiles', () => {
    it('should return list of modified files', async () => {
      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              // Git porcelain format: XY<space>filename (3 chars prefix total)
              // "MM " = modified in both index and worktree
              // "?? " = untracked
              // "A  " = added to index
              callback(null, {
                stdout: 'MM src/file1.ts\n?? src/file2.ts\nA  src/file3.ts',
                stderr: '',
              });
            }
          ),
        spawn: vi.fn(),
      }));

      const { getUncommittedFiles } =
        await import('../../automation/git-operations.js');
      const result = await getUncommittedFiles('/test/project');

      // slice(3) removes "XY " prefix
      expect(result).toEqual(['src/file1.ts', 'src/file2.ts', 'src/file3.ts']);
    });

    it('should return empty array when no changes', async () => {
      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: '', stderr: '' });
            }
          ),
        spawn: vi.fn(),
      }));

      const { getUncommittedFiles } =
        await import('../../automation/git-operations.js');
      const result = await getUncommittedFiles('/test/project');

      expect(result).toEqual([]);
    });

    it('should return empty array when git command fails', async () => {
      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(new Error('not a git repo'), { stdout: '', stderr: '' });
            }
          ),
        spawn: vi.fn(),
      }));

      const { getUncommittedFiles } =
        await import('../../automation/git-operations.js');
      const result = await getUncommittedFiles('/test/project');

      expect(result).toEqual([]);
    });

    it('should filter empty lines', async () => {
      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              // Include empty line between files - use MM format for modified files
              callback(null, {
                stdout: 'MM file1.ts\n\nMM file2.ts\n',
                stderr: '',
              });
            }
          ),
        spawn: vi.fn(),
      }));

      const { getUncommittedFiles } =
        await import('../../automation/git-operations.js');
      const result = await getUncommittedFiles('/test/project');

      expect(result).toEqual(['file1.ts', 'file2.ts']);
    });
  });

  // =============================================================================
  // createCheckpoint tests
  // =============================================================================
  describe('createCheckpoint', () => {
    it('should return false when no uncommitted changes', async () => {
      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: '', stderr: '' });
            }
          ),
        spawn: vi.fn(),
      }));

      const { createCheckpoint } =
        await import('../../automation/git-operations.js');
      const result = await createCheckpoint('/test/project', 'test checkpoint');

      expect(result).toBe(false);
    });

    it('should create checkpoint when there are changes', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(0), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: ' M file.ts\n', stderr: '' });
            }
          ),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } =
        await import('../../automation/git-operations.js');
      const result = await createCheckpoint('/test/project', 'my checkpoint');

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['commit', '-m', expect.stringContaining('checkpoint: my checkpoint')],
        expect.objectContaining({ cwd: '/test/project' })
      );
    });

    it('should sanitize shell metacharacters from commit message', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(0), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: ' M file.ts\n', stderr: '' });
            }
          ),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } =
        await import('../../automation/git-operations.js');
      await createCheckpoint(
        '/test/project',
        'test; rm -rf / && echo "hacked" | cat'
      );

      // Should have removed ; $ " | & < > etc
      const commitMsg = mockSpawn.mock.calls[0][1][2];
      expect(commitMsg).not.toContain(';');
      expect(commitMsg).not.toContain('|');
      expect(commitMsg).not.toContain('&');
      expect(commitMsg).not.toContain('"');
    });

    it('should return false when commit fails', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(1), 0); // Exit code 1 = failure
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: ' M file.ts\n', stderr: '' });
            }
          ),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } =
        await import('../../automation/git-operations.js');
      const result = await createCheckpoint('/test/project', 'checkpoint');

      expect(result).toBe(false);
    });

    it('should handle spawn error event', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'error') {
                setTimeout(() => handler(new Error('spawn ENOENT')), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: ' M file.ts\n', stderr: '' });
            }
          ),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } =
        await import('../../automation/git-operations.js');
      const result = await createCheckpoint('/test/project', 'checkpoint');

      expect(result).toBe(false);
    });

    it('should include Auto-checkpoint message', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(0), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: ' M file.ts\n', stderr: '' });
            }
          ),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } =
        await import('../../automation/git-operations.js');
      await createCheckpoint('/test/project', 'test');

      const commitMsg = mockSpawn.mock.calls[0][1][2];
      expect(commitMsg).toContain('Auto-checkpoint by GoodVibes');
    });

    it('should remove backticks from message', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(0), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: ' M file.ts\n', stderr: '' });
            }
          ),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } =
        await import('../../automation/git-operations.js');
      await createCheckpoint('/test/project', 'test `whoami` injection');

      const commitMsg = mockSpawn.mock.calls[0][1][2];
      expect(commitMsg).not.toContain('`');
      expect(commitMsg).toContain('whoami');
    });

    it('should remove dollar signs and curly braces', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(0), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: ' M file.ts\n', stderr: '' });
            }
          ),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } =
        await import('../../automation/git-operations.js');
      await createCheckpoint('/test/project', 'test $HOME ${USER} $(pwd)');

      const commitMsg = mockSpawn.mock.calls[0][1][2];
      expect(commitMsg).not.toContain('$');
      expect(commitMsg).not.toContain('{');
      expect(commitMsg).not.toContain('}');
      expect(commitMsg).not.toContain('(');
      expect(commitMsg).not.toContain(')');
    });

    it('should handle exception from git add and return false', async () => {
      const _execCallCount = 0;
      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              execCallCount++;
              if (cmd.includes('status')) {
                // First call: hasUncommittedChanges check passes
                callback(null, { stdout: ' M file.ts\n', stderr: '' });
              } else if (cmd.includes('add')) {
                // Second call: git add throws an error
                callback(new Error('fatal: Unable to add files'), {
                  stdout: '',
                  stderr: 'error',
                });
              }
            }
          ),
        spawn: vi.fn(),
      }));

      const { createCheckpoint } =
        await import('../../automation/git-operations.js');
      const result = await createCheckpoint('/test/project', 'checkpoint');

      expect(result).toBe(false);
    });
  });

  // =============================================================================
  // createFeatureBranch tests
  // =============================================================================
  describe('createFeatureBranch', () => {
    it('should create and checkout feature branch with sanitized name', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(0), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { createFeatureBranch } =
        await import('../../automation/git-operations.js');
      const result = await createFeatureBranch(
        '/test/project',
        'Add User Authentication'
      );

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['checkout', '-b', 'feature/add-user-authentication'],
        expect.any(Object)
      );
    });

    it('should normalize branch name with special characters', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(0), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { createFeatureBranch } =
        await import('../../automation/git-operations.js');
      await createFeatureBranch('/test/project', 'Fix: Bug #123 & Issue!@#$%');

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['checkout', '-b', 'feature/fix-bug-123-issue'],
        expect.any(Object)
      );
    });

    it('should convert to lowercase', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(0), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { createFeatureBranch } =
        await import('../../automation/git-operations.js');
      await createFeatureBranch('/test/project', 'UPPERCASE NAME');

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['checkout', '-b', 'feature/uppercase-name'],
        expect.any(Object)
      );
    });

    it('should remove leading and trailing hyphens', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(0), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { createFeatureBranch } =
        await import('../../automation/git-operations.js');
      await createFeatureBranch('/test/project', '---name---');

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['checkout', '-b', 'feature/name'],
        expect.any(Object)
      );
    });

    it('should return false when branch creation fails', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(1), 0); // Exit code 1 = failure
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { createFeatureBranch } =
        await import('../../automation/git-operations.js');
      const result = await createFeatureBranch('/test/project', 'test-feature');

      expect(result).toBe(false);
    });

    it('should handle spawn error event', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'error') {
                setTimeout(() => handler(new Error('spawn error')), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { createFeatureBranch } =
        await import('../../automation/git-operations.js');
      const result = await createFeatureBranch('/test/project', 'test-feature');

      expect(result).toBe(false);
    });

    it('should handle exception thrown by spawn and return false', async () => {
      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: vi.fn().mockImplementation(() => {
          throw new Error('spawn failed: ENOENT');
        }),
      }));

      const { createFeatureBranch } =
        await import('../../automation/git-operations.js');
      const result = await createFeatureBranch('/test/project', 'test-feature');

      expect(result).toBe(false);
    });
  });

  // =============================================================================
  // mergeFeatureBranch tests
  // =============================================================================
  describe('mergeFeatureBranch', () => {
    it('should merge feature branch into main and delete it', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(0), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { mergeFeatureBranch } =
        await import('../../automation/git-operations.js');
      const result = await mergeFeatureBranch(
        '/test/project',
        'feature/test',
        'main'
      );

      expect(result).toBe(true);
      // Should be called 3 times: checkout, merge, delete
      expect(mockSpawn).toHaveBeenCalledTimes(3);
      expect(mockSpawn).toHaveBeenNthCalledWith(
        1,
        'git',
        ['checkout', 'main'],
        expect.any(Object)
      );
      expect(mockSpawn).toHaveBeenNthCalledWith(
        2,
        'git',
        ['merge', 'feature/test', '--no-ff', '-m', 'Merge feature/test'],
        expect.any(Object)
      );
      expect(mockSpawn).toHaveBeenNthCalledWith(
        3,
        'git',
        ['branch', '-d', 'feature/test'],
        expect.any(Object)
      );
    });

    it('should sanitize branch names to prevent injection', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(0), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { mergeFeatureBranch } =
        await import('../../automation/git-operations.js');
      await mergeFeatureBranch(
        '/test/project',
        'feature/test; rm -rf /',
        'main; whoami'
      );

      // Verify shell metacharacters are removed
      const checkoutArgs = mockSpawn.mock.calls[0][1];
      const mergeArgs = mockSpawn.mock.calls[1][1];

      expect(checkoutArgs[1]).not.toContain(';');
      expect(mergeArgs[1]).not.toContain(';');
    });

    it('should return false when checkout fails', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(1), 0); // Checkout fails
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { mergeFeatureBranch } =
        await import('../../automation/git-operations.js');
      const result = await mergeFeatureBranch(
        '/test/project',
        'feature/test',
        'main'
      );

      expect(result).toBe(false);
      // Should only call checkout, not merge or delete
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('should return false when merge fails', async () => {
      let callCount = 0;
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                callCount++;
                const code = callCount === 1 ? 0 : 1; // Checkout succeeds, merge fails
                setTimeout(() => handler(code), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { mergeFeatureBranch } =
        await import('../../automation/git-operations.js');
      const result = await mergeFeatureBranch(
        '/test/project',
        'feature/test',
        'main'
      );

      expect(result).toBe(false);
      // Should call checkout and merge, not delete
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('should return false when branch deletion fails', async () => {
      let callCount = 0;
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                callCount++;
                const code = callCount <= 2 ? 0 : 1; // Checkout and merge succeed, delete fails
                setTimeout(() => handler(code), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { mergeFeatureBranch } =
        await import('../../automation/git-operations.js');
      const result = await mergeFeatureBranch(
        '/test/project',
        'feature/test',
        'main'
      );

      expect(result).toBe(false);
      // All three operations should be called
      expect(mockSpawn).toHaveBeenCalledTimes(3);
    });

    it('should handle spawn error event', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'error') {
                setTimeout(() => handler(new Error('spawn error')), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { mergeFeatureBranch } =
        await import('../../automation/git-operations.js');
      const result = await mergeFeatureBranch(
        '/test/project',
        'feature/test',
        'main'
      );

      expect(result).toBe(false);
    });

    it('should handle exception thrown by spawn and return false', async () => {
      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: vi.fn().mockImplementation(() => {
          throw new Error('spawn failed: ENOENT');
        }),
      }));

      const { mergeFeatureBranch } =
        await import('../../automation/git-operations.js');
      const result = await mergeFeatureBranch(
        '/test/project',
        'feature/test',
        'main'
      );

      expect(result).toBe(false);
    });
  });

  // =============================================================================
  // spawnAsync internal function tests (via exported functions)
  // =============================================================================
  describe('spawnAsync behavior', () => {
    it('should collect stdout data', async () => {
      let dataHandler: ((_data: Buffer) => void) | null = null;

      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: {
          on: vi
            .fn()
            .mockImplementation(
              (event: string, handler: (_data: Buffer) => void) => {
                if (event === 'data') {
                  dataHandler = handler;
                  setTimeout(() => handler(Buffer.from('output data')), 0);
                }
              }
            ),
        },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(0), 10);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { createFeatureBranch } =
        await import('../../automation/git-operations.js');
      await createFeatureBranch('/test/project', 'test');

      expect(dataHandler).not.toBeNull();
    });

    it('should collect stderr data', async () => {
      let dataHandler: ((_data: Buffer) => void) | null = null;

      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: {
          on: vi
            .fn()
            .mockImplementation(
              (event: string, handler: (_data: Buffer) => void) => {
                if (event === 'data') {
                  dataHandler = handler;
                  setTimeout(() => handler(Buffer.from('error data')), 0);
                }
              }
            ),
        },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(0), 10);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { createFeatureBranch } =
        await import('../../automation/git-operations.js');
      await createFeatureBranch('/test/project', 'test');

      expect(dataHandler).not.toBeNull();
    });

    it('should handle timeout when process hangs', async () => {
      const mockKill = vi.fn();
      let timeoutResolve: () => void;
      const timeoutPromise = new Promise<void>((resolve) => {
        timeoutResolve = resolve;
      });

      const mockSpawn = vi.fn().mockImplementation(() => {
        const child = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(),
          kill: vi.fn().mockImplementation(() => {
            mockKill();
            timeoutResolve();
          }),
        };
        return child;
      });

      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: ' M file.ts\n', stderr: '' });
            }
          ),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } =
        await import('../../automation/git-operations.js');

      // Start the promise - timeout will fire after 30s
      const resultPromise = createCheckpoint(
        '/test/project',
        'test checkpoint'
      );

      // Wait for the timeout to be triggered (up to 35 seconds)
      await Promise.race([
        timeoutPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 35000)),
      ]);

      // Should have called kill due to timeout
      expect(mockKill).toHaveBeenCalled();

      // Result should be false due to timeout
      const result = await resultPromise;
      expect(result).toBe(false);
    }, 40000);

    it('should clear timeout when close event fires before timeout', async () => {
      const mockKill = vi.fn();
      let _closeHandler: ((_code: number) => void) | null = null;

      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                _closeHandler = handler as (_code: number) => void;
                // Fire close immediately
                setTimeout(() => handler(0), 0);
              }
            }
          ),
        kill: mockKill,
      }));

      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: ' M file.ts\n', stderr: '' });
            }
          ),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } =
        await import('../../automation/git-operations.js');
      const result = await createCheckpoint('/test/project', 'test');

      // Kill should NOT have been called since close fired first
      expect(mockKill).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should clear timeout when error event fires before timeout', async () => {
      const mockKill = vi.fn();

      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'error') {
                // Fire error immediately
                setTimeout(() => handler(new Error('spawn error')), 0);
              }
            }
          ),
        kill: mockKill,
      }));

      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: ' M file.ts\n', stderr: '' });
            }
          ),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } =
        await import('../../automation/git-operations.js');
      const result = await createCheckpoint('/test/project', 'test');

      // Kill should NOT have been called since error fired first
      expect(mockKill).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should handle null code from timeout', async () => {
      let timeoutResolve: (_value: boolean) => void;

      const mockSpawn = vi.fn().mockImplementation(() => {
        const child = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(),
          kill: vi.fn().mockImplementation(() => {
            // When kill is called, it means timeout happened
            timeoutResolve(true);
          }),
        };
        return child;
      });

      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: ' M file.ts\n', stderr: '' });
            }
          ),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } =
        await import('../../automation/git-operations.js');

      // Create a promise that resolves when timeout happens
      const timeoutHappened = new Promise<boolean>((resolve) => {
        timeoutResolve = resolve;
      });

      const resultPromise = createCheckpoint('/test/project', 'test');

      // Wait for timeout to be triggered (up to 35 seconds)
      const didTimeout = await Promise.race([
        timeoutHappened,
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), 35000)
        ),
      ]);

      expect(didTimeout).toBe(true);

      // Result should be false due to null code
      const result = await resultPromise;
      expect(result).toBe(false);
    }, 40000);
  });

  // =============================================================================
  // sanitizeForGit behavior tests (tested via createCheckpoint/mergeFeatureBranch)
  // =============================================================================
  describe('sanitizeForGit behavior', () => {
    it('should remove all shell metacharacters', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(0), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: ' M file.ts\n', stderr: '' });
            }
          ),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } =
        await import('../../automation/git-operations.js');

      // Test all metacharacters: `$\;"'|&<>(){}[]!#*?~
      await createCheckpoint('/test/project', 'test`$\\;"\'|&<>(){}[]!#*?~end');

      const commitMsg = mockSpawn.mock.calls[0][1][2];
      expect(commitMsg).not.toMatch(/[`$\\;"'|&<>(){}[\]!#*?~]/);
      expect(commitMsg).toContain('test');
      expect(commitMsg).toContain('end');
    });

    it('should preserve safe characters in message', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (..._args: unknown[]) => void) => {
              if (event === 'close') {
                setTimeout(() => handler(0), 0);
              }
            }
          ),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi
          .fn()
          .mockImplementation(
            (
              _cmd: string,
              _opts: unknown,
              callback: (
                _err: Error | null,
                _result: { stdout: string; stderr: string }
              ) => void
            ) => {
              callback(null, { stdout: ' M file.ts\n', stderr: '' });
            }
          ),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } =
        await import('../../automation/git-operations.js');
      await createCheckpoint(
        '/test/project',
        'normal message with spaces and numbers 123'
      );

      const commitMsg = mockSpawn.mock.calls[0][1][2];
      expect(commitMsg).toContain('normal message with spaces and numbers 123');
    });
  });
});
