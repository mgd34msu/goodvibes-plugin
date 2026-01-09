/**
 * Tests for git-context.ts
 *
 * Tests the git context retrieval and formatting functions with full coverage
 * of all branches including error handling paths.
 */

import * as childProcess from 'child_process';
import * as fs from 'fs/promises';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies - must be before imports
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: <T extends (...args: unknown[]) => unknown>(fn: T) => {
    return (command: string, options: Record<string, unknown>) => {
      return new Promise((resolve, reject) => {
        fn(command, options, (error: Error | null, stdout: string, stderr: string) => {
          if (error) {
            reject(error);
          } else {
            resolve({ stdout, stderr });
          }
        });
      });
    };
  },
}));

vi.mock('fs/promises');
vi.mock('../../shared/logging.js', () => ({
  debug: vi.fn(),
}));

import {
  getGitContext,
  formatGitContext,
  type GitContext,
} from '../../context/git-context.js';

// Get reference to the mocked exec function
const mockExec = vi.mocked(childProcess.exec);

/**
 * Helper to create exec mock implementation for git commands
 */
function createGitExecMock(handlers: Record<string, string | Error>) {
  type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
  return (command: string, options: Record<string, unknown>, callback: ExecCallback) => {
    const cmd = String(command);

    for (const [key, value] of Object.entries(handlers)) {
      if (cmd.includes(key)) {
        if (value instanceof Error) {
          callback(value, '', '');
        } else {
          callback(null, value, '');
        }
        return {} as ReturnType<typeof childProcess.exec>;
      }
    }

    // Default: empty output
    callback(null, '', '');
    return {} as ReturnType<typeof childProcess.exec>;
  };
}

describe('git-context', () => {
  const mockCwd = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getGitContext', () => {
    describe('when directory is not a git repository', () => {
      it('should return isRepo: false when .git directory does not exist', async () => {
        vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

        const result = await getGitContext(mockCwd);

        expect(result).toEqual({
          isRepo: false,
          branch: null,
          hasUncommittedChanges: false,
          uncommittedFileCount: 0,
          lastCommit: null,
          recentCommits: [],
          aheadBehind: null,
        });
      });
    });

    describe('when directory is a git repository', () => {
      beforeEach(() => {
        // Default: .git directory exists
        vi.mocked(fs.access).mockResolvedValue(undefined);
      });

      it('should return full git context with all data available', async () => {
        mockExec.mockImplementation(
          createGitExecMock({
            'branch --show-current': 'main\n',
            'status --porcelain': ' M file1.ts\n M file2.ts\n',
            'log -1 --format': 'Fix bug (2 hours ago)\n',
            'log -5 --format': '- Fix bug\n- Add feature\n- Initial commit\n',
            'rev-list --left-right': '3\t1\n',
          })
        );

        const result = await getGitContext(mockCwd);

        expect(result).toEqual({
          isRepo: true,
          branch: 'main',
          hasUncommittedChanges: true,
          uncommittedFileCount: 2,
          lastCommit: 'Fix bug (2 hours ago)',
          recentCommits: ['- Fix bug', '- Add feature', '- Initial commit'],
          aheadBehind: { ahead: 3, behind: 1 },
        });
      });

      it('should handle empty branch (detached HEAD state)', async () => {
        mockExec.mockImplementation(
          createGitExecMock({
            'branch --show-current': '\n',
            'status --porcelain': '',
            'log -1 --format': 'Detached commit (1 day ago)\n',
            'log -5 --format': '- Detached commit\n',
            'rev-list --left-right': new Error('No upstream'),
          })
        );

        const result = await getGitContext(mockCwd);

        expect(result.branch).toBe('');
        expect(result.aheadBehind).toBeNull();
      });

      it('should handle null branch when git command fails', async () => {
        mockExec.mockImplementation(
          createGitExecMock({
            'branch --show-current': new Error('Git error'),
            'status --porcelain': '',
            'log -1 --format': '',
            'log -5 --format': '',
            'rev-list --left-right': new Error('No upstream'),
          })
        );

        const result = await getGitContext(mockCwd);

        expect(result.branch).toBeNull();
      });

      it('should handle empty status (no uncommitted changes)', async () => {
        mockExec.mockImplementation(
          createGitExecMock({
            'branch --show-current': 'main\n',
            'status --porcelain': '',
            'log -1 --format': 'Last commit (1 hour ago)\n',
            'log -5 --format': '- Last commit\n',
            'rev-list --left-right': '0\t0\n',
          })
        );

        const result = await getGitContext(mockCwd);

        expect(result.hasUncommittedChanges).toBe(false);
        expect(result.uncommittedFileCount).toBe(0);
      });

      it('should handle status command returning null (failure)', async () => {
        mockExec.mockImplementation(
          createGitExecMock({
            'branch --show-current': 'main\n',
            'status --porcelain': new Error('Status failed'),
            'log -1 --format': 'Commit\n',
            'log -5 --format': '- Commit\n',
            'rev-list --left-right': '0\t0\n',
          })
        );

        const result = await getGitContext(mockCwd);

        // When status returns null, we use empty string which splits to [''] then filters to []
        expect(result.hasUncommittedChanges).toBe(false);
        expect(result.uncommittedFileCount).toBe(0);
      });

      it('should handle null lastCommit when log command fails', async () => {
        mockExec.mockImplementation(
          createGitExecMock({
            'branch --show-current': 'main\n',
            'status --porcelain': '',
            'log -1 --format': new Error('No commits'),
            'log -5 --format': new Error('No commits'),
            'rev-list --left-right': new Error('No upstream'),
          })
        );

        const result = await getGitContext(mockCwd);

        expect(result.lastCommit).toBeNull();
        expect(result.recentCommits).toEqual([]);
      });

      it('should handle null recentCommitsRaw returning empty array', async () => {
        mockExec.mockImplementation(
          createGitExecMock({
            'branch --show-current': 'feature\n',
            'status --porcelain': '',
            'log -1 --format': 'First commit (now)\n',
            'log -5 --format': new Error('Log failed'),
            'rev-list --left-right': '1\t0\n',
          })
        );

        const result = await getGitContext(mockCwd);

        expect(result.recentCommits).toEqual([]);
      });

      it('should handle ahead/behind when no upstream is configured', async () => {
        mockExec.mockImplementation(
          createGitExecMock({
            'branch --show-current': 'feature-branch\n',
            'status --porcelain': '',
            'log -1 --format': 'Add feature (5 min ago)\n',
            'log -5 --format': '- Add feature\n',
            'rev-list --left-right': new Error('No upstream configured'),
          })
        );

        const result = await getGitContext(mockCwd);

        expect(result.aheadBehind).toBeNull();
      });

      it('should handle multiple uncommitted files', async () => {
        mockExec.mockImplementation(
          createGitExecMock({
            'branch --show-current': 'develop\n',
            'status --porcelain':
              ' M src/file1.ts\n M src/file2.ts\nA  new-file.ts\n?? untracked.txt\nD  deleted.ts\n',
            'log -1 --format': 'WIP (just now)\n',
            'log -5 --format': '- WIP\n',
            'rev-list --left-right': '5\t2\n',
          })
        );

        const result = await getGitContext(mockCwd);

        expect(result.hasUncommittedChanges).toBe(true);
        expect(result.uncommittedFileCount).toBe(5);
      });

      it('should correctly parse ahead/behind values', async () => {
        mockExec.mockImplementation(
          createGitExecMock({
            'branch --show-current': 'main\n',
            'status --porcelain': '',
            'log -1 --format': 'Sync (1 min ago)\n',
            'log -5 --format': '- Sync\n',
            'rev-list --left-right': '10\t5\n',
          })
        );

        const result = await getGitContext(mockCwd);

        expect(result.aheadBehind).toEqual({ ahead: 10, behind: 5 });
      });

      it('should handle zero ahead/behind', async () => {
        mockExec.mockImplementation(
          createGitExecMock({
            'branch --show-current': 'main\n',
            'status --porcelain': '',
            'log -1 --format': 'In sync (2 days ago)\n',
            'log -5 --format': '- In sync\n',
            'rev-list --left-right': '0\t0\n',
          })
        );

        const result = await getGitContext(mockCwd);

        expect(result.aheadBehind).toEqual({ ahead: 0, behind: 0 });
      });
    });
  });

  describe('formatGitContext', () => {
    it('should return "Not a git repository" when isRepo is false', () => {
      const context: GitContext = {
        isRepo: false,
        branch: null,
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        lastCommit: null,
        recentCommits: [],
        aheadBehind: null,
      };

      const result = formatGitContext(context);

      expect(result).toBe('Git: Not a git repository');
    });

    it('should format with branch name', () => {
      const context: GitContext = {
        isRepo: true,
        branch: 'main',
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        lastCommit: null,
        recentCommits: [],
        aheadBehind: null,
      };

      const result = formatGitContext(context);

      expect(result).toBe('Git: main branch');
    });

    it('should show "detached" when branch is null', () => {
      const context: GitContext = {
        isRepo: true,
        branch: null,
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        lastCommit: null,
        recentCommits: [],
        aheadBehind: null,
      };

      const result = formatGitContext(context);

      expect(result).toBe('Git: detached branch');
    });

    it('should show "detached" when branch is empty string', () => {
      const context: GitContext = {
        isRepo: true,
        branch: '',
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        lastCommit: null,
        recentCommits: [],
        aheadBehind: null,
      };

      const result = formatGitContext(context);

      expect(result).toBe('Git: detached branch');
    });

    it('should include uncommitted file count when hasUncommittedChanges is true', () => {
      const context: GitContext = {
        isRepo: true,
        branch: 'feature',
        hasUncommittedChanges: true,
        uncommittedFileCount: 3,
        lastCommit: null,
        recentCommits: [],
        aheadBehind: null,
      };

      const result = formatGitContext(context);

      expect(result).toBe('Git: feature branch, 3 uncommitted files');
    });

    it('should include ahead count when ahead > 0', () => {
      const context: GitContext = {
        isRepo: true,
        branch: 'main',
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        lastCommit: null,
        recentCommits: [],
        aheadBehind: { ahead: 5, behind: 0 },
      };

      const result = formatGitContext(context);

      expect(result).toBe('Git: main branch, 5 ahead');
    });

    it('should include behind count when behind > 0', () => {
      const context: GitContext = {
        isRepo: true,
        branch: 'main',
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        lastCommit: null,
        recentCommits: [],
        aheadBehind: { ahead: 0, behind: 3 },
      };

      const result = formatGitContext(context);

      expect(result).toBe('Git: main branch, 3 behind');
    });

    it('should include both ahead and behind when both > 0', () => {
      const context: GitContext = {
        isRepo: true,
        branch: 'feature',
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        lastCommit: null,
        recentCommits: [],
        aheadBehind: { ahead: 2, behind: 4 },
      };

      const result = formatGitContext(context);

      expect(result).toBe('Git: feature branch, 2 ahead, 4 behind');
    });

    it('should not include ahead/behind when both are 0', () => {
      const context: GitContext = {
        isRepo: true,
        branch: 'main',
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        lastCommit: null,
        recentCommits: [],
        aheadBehind: { ahead: 0, behind: 0 },
      };

      const result = formatGitContext(context);

      expect(result).toBe('Git: main branch');
    });

    it('should include lastCommit on new line when available', () => {
      const context: GitContext = {
        isRepo: true,
        branch: 'main',
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        lastCommit: 'Fix critical bug (2 hours ago)',
        recentCommits: [],
        aheadBehind: null,
      };

      const result = formatGitContext(context);

      expect(result).toBe(
        'Git: main branch, \nLast: "Fix critical bug (2 hours ago)"'
      );
    });

    it('should format with all information combined', () => {
      const context: GitContext = {
        isRepo: true,
        branch: 'feature-xyz',
        hasUncommittedChanges: true,
        uncommittedFileCount: 7,
        lastCommit: 'WIP: Adding new feature (5 minutes ago)',
        recentCommits: ['- WIP', '- Initial'],
        aheadBehind: { ahead: 3, behind: 1 },
      };

      const result = formatGitContext(context);

      expect(result).toBe(
        'Git: feature-xyz branch, 7 uncommitted files, 3 ahead, 1 behind, \nLast: "WIP: Adding new feature (5 minutes ago)"'
      );
    });

    it('should not include lastCommit when it is null', () => {
      const context: GitContext = {
        isRepo: true,
        branch: 'main',
        hasUncommittedChanges: true,
        uncommittedFileCount: 1,
        lastCommit: null,
        recentCommits: [],
        aheadBehind: { ahead: 1, behind: 0 },
      };

      const result = formatGitContext(context);

      expect(result).toBe('Git: main branch, 1 uncommitted files, 1 ahead');
    });

    it('should handle uncommitted changes without ahead/behind', () => {
      const context: GitContext = {
        isRepo: true,
        branch: 'develop',
        hasUncommittedChanges: true,
        uncommittedFileCount: 2,
        lastCommit: 'Setup project (1 week ago)',
        recentCommits: [],
        aheadBehind: null,
      };

      const result = formatGitContext(context);

      expect(result).toBe(
        'Git: develop branch, 2 uncommitted files, \nLast: "Setup project (1 week ago)"'
      );
    });
  });

  describe('Module exports', () => {
    it('should export getGitContext function', async () => {
      const module = await import('../../context/git-context.js');
      expect(module.getGitContext).toBeDefined();
      expect(typeof module.getGitContext).toBe('function');
    });

    it('should export formatGitContext function', async () => {
      const module = await import('../../context/git-context.js');
      expect(module.formatGitContext).toBeDefined();
      expect(typeof module.formatGitContext).toBe('function');
    });
  });

  describe('Type exports', () => {
    it('should allow creating GitContext objects with correct structure', () => {
      const context: GitContext = {
        isRepo: true,
        branch: 'test',
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        lastCommit: 'Test commit',
        recentCommits: ['- Test commit'],
        aheadBehind: { ahead: 0, behind: 0 },
      };

      expect(context.isRepo).toBe(true);
      expect(context.branch).toBe('test');
      expect(context.hasUncommittedChanges).toBe(false);
      expect(context.uncommittedFileCount).toBe(0);
      expect(context.lastCommit).toBe('Test commit');
      expect(context.recentCommits).toEqual(['- Test commit']);
      expect(context.aheadBehind).toEqual({ ahead: 0, behind: 0 });
    });

    it('should allow GitContext with nullable fields', () => {
      const context: GitContext = {
        isRepo: false,
        branch: null,
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        lastCommit: null,
        recentCommits: [],
        aheadBehind: null,
      };

      expect(context.branch).toBeNull();
      expect(context.lastCommit).toBeNull();
      expect(context.aheadBehind).toBeNull();
    });
  });
});
