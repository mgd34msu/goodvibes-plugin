/**
 * Tests for git-context.ts
 *
 * Tests the git context retrieval and formatting functions with full coverage
 * of all branches including error handling paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getGitContext,
  formatGitContext,
  type GitContext,
} from '../../context/git-context.js';
import * as childProcess from 'child_process';
import * as fs from 'fs/promises';

// Mock dependencies
vi.mock('child_process');
vi.mock('fs/promises');
vi.mock('../../shared/logging.js', () => ({
  debug: vi.fn(),
}));

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
        vi.mocked(childProcess.execSync).mockImplementation(
          (command: string) => {
            const cmd = String(command);
            if (cmd.includes('branch --show-current')) {
              return 'main\n';
            }
            if (cmd.includes('status --porcelain')) {
              return ' M file1.ts\n M file2.ts\n';
            }
            if (cmd.includes('log -1 --format')) {
              return 'Fix bug (2 hours ago)\n';
            }
            if (cmd.includes('log -5 --format')) {
              return '- Fix bug\n- Add feature\n- Initial commit\n';
            }
            if (cmd.includes('rev-list --left-right')) {
              return '3\t1\n';
            }
            return '';
          }
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
        vi.mocked(childProcess.execSync).mockImplementation(
          (command: string) => {
            const cmd = String(command);
            if (cmd.includes('branch --show-current')) {
              return '\n';
            }
            if (cmd.includes('status --porcelain')) {
              return '';
            }
            if (cmd.includes('log -1 --format')) {
              return 'Detached commit (1 day ago)\n';
            }
            if (cmd.includes('log -5 --format')) {
              return '- Detached commit\n';
            }
            if (cmd.includes('rev-list --left-right')) {
              throw new Error('No upstream');
            }
            return '';
          }
        );

        const result = await getGitContext(mockCwd);

        expect(result.branch).toBe('');
        expect(result.aheadBehind).toBeNull();
      });

      it('should handle null branch when git command fails', async () => {
        vi.mocked(childProcess.execSync).mockImplementation(
          (command: string) => {
            const cmd = String(command);
            if (cmd.includes('branch --show-current')) {
              throw new Error('Git error');
            }
            if (cmd.includes('status --porcelain')) {
              return '';
            }
            if (cmd.includes('log -1 --format')) {
              return '';
            }
            if (cmd.includes('log -5 --format')) {
              return '';
            }
            if (cmd.includes('rev-list --left-right')) {
              throw new Error('No upstream');
            }
            return '';
          }
        );

        const result = await getGitContext(mockCwd);

        expect(result.branch).toBeNull();
      });

      it('should handle empty status (no uncommitted changes)', async () => {
        vi.mocked(childProcess.execSync).mockImplementation(
          (command: string) => {
            const cmd = String(command);
            if (cmd.includes('branch --show-current')) {
              return 'main\n';
            }
            if (cmd.includes('status --porcelain')) {
              return '';
            }
            if (cmd.includes('log -1 --format')) {
              return 'Last commit (1 hour ago)\n';
            }
            if (cmd.includes('log -5 --format')) {
              return '- Last commit\n';
            }
            if (cmd.includes('rev-list --left-right')) {
              return '0\t0\n';
            }
            return '';
          }
        );

        const result = await getGitContext(mockCwd);

        expect(result.hasUncommittedChanges).toBe(false);
        expect(result.uncommittedFileCount).toBe(0);
      });

      it('should handle status command returning null (failure)', async () => {
        vi.mocked(childProcess.execSync).mockImplementation(
          (command: string) => {
            const cmd = String(command);
            if (cmd.includes('branch --show-current')) {
              return 'main\n';
            }
            if (cmd.includes('status --porcelain')) {
              throw new Error('Status failed');
            }
            if (cmd.includes('log -1 --format')) {
              return 'Commit\n';
            }
            if (cmd.includes('log -5 --format')) {
              return '- Commit\n';
            }
            if (cmd.includes('rev-list --left-right')) {
              return '0\t0\n';
            }
            return '';
          }
        );

        const result = await getGitContext(mockCwd);

        // When status returns null, we use empty string which splits to [''] then filters to []
        expect(result.hasUncommittedChanges).toBe(false);
        expect(result.uncommittedFileCount).toBe(0);
      });

      it('should handle null lastCommit when log command fails', async () => {
        vi.mocked(childProcess.execSync).mockImplementation(
          (command: string) => {
            const cmd = String(command);
            if (cmd.includes('branch --show-current')) {
              return 'main\n';
            }
            if (cmd.includes('status --porcelain')) {
              return '';
            }
            if (cmd.includes('log -1 --format')) {
              throw new Error('No commits');
            }
            if (cmd.includes('log -5 --format')) {
              throw new Error('No commits');
            }
            if (cmd.includes('rev-list --left-right')) {
              throw new Error('No upstream');
            }
            return '';
          }
        );

        const result = await getGitContext(mockCwd);

        expect(result.lastCommit).toBeNull();
        expect(result.recentCommits).toEqual([]);
      });

      it('should handle null recentCommitsRaw returning empty array', async () => {
        vi.mocked(childProcess.execSync).mockImplementation(
          (command: string) => {
            const cmd = String(command);
            if (cmd.includes('branch --show-current')) {
              return 'feature\n';
            }
            if (cmd.includes('status --porcelain')) {
              return '';
            }
            if (cmd.includes('log -1 --format')) {
              return 'First commit (now)\n';
            }
            if (cmd.includes('log -5 --format')) {
              throw new Error('Log failed');
            }
            if (cmd.includes('rev-list --left-right')) {
              return '1\t0\n';
            }
            return '';
          }
        );

        const result = await getGitContext(mockCwd);

        expect(result.recentCommits).toEqual([]);
      });

      it('should handle ahead/behind when no upstream is configured', async () => {
        vi.mocked(childProcess.execSync).mockImplementation(
          (command: string) => {
            const cmd = String(command);
            if (cmd.includes('branch --show-current')) {
              return 'feature-branch\n';
            }
            if (cmd.includes('status --porcelain')) {
              return '';
            }
            if (cmd.includes('log -1 --format')) {
              return 'Add feature (5 min ago)\n';
            }
            if (cmd.includes('log -5 --format')) {
              return '- Add feature\n';
            }
            if (cmd.includes('rev-list --left-right')) {
              throw new Error('No upstream configured');
            }
            return '';
          }
        );

        const result = await getGitContext(mockCwd);

        expect(result.aheadBehind).toBeNull();
      });

      it('should handle multiple uncommitted files', async () => {
        vi.mocked(childProcess.execSync).mockImplementation(
          (command: string) => {
            const cmd = String(command);
            if (cmd.includes('branch --show-current')) {
              return 'develop\n';
            }
            if (cmd.includes('status --porcelain')) {
              return ' M src/file1.ts\n M src/file2.ts\nA  new-file.ts\n?? untracked.txt\nD  deleted.ts\n';
            }
            if (cmd.includes('log -1 --format')) {
              return 'WIP (just now)\n';
            }
            if (cmd.includes('log -5 --format')) {
              return '- WIP\n';
            }
            if (cmd.includes('rev-list --left-right')) {
              return '5\t2\n';
            }
            return '';
          }
        );

        const result = await getGitContext(mockCwd);

        expect(result.hasUncommittedChanges).toBe(true);
        expect(result.uncommittedFileCount).toBe(5);
      });

      it('should correctly parse ahead/behind values', async () => {
        vi.mocked(childProcess.execSync).mockImplementation(
          (command: string) => {
            const cmd = String(command);
            if (cmd.includes('branch --show-current')) {
              return 'main\n';
            }
            if (cmd.includes('status --porcelain')) {
              return '';
            }
            if (cmd.includes('log -1 --format')) {
              return 'Sync (1 min ago)\n';
            }
            if (cmd.includes('log -5 --format')) {
              return '- Sync\n';
            }
            if (cmd.includes('rev-list --left-right')) {
              return '10\t5\n';
            }
            return '';
          }
        );

        const result = await getGitContext(mockCwd);

        expect(result.aheadBehind).toEqual({ ahead: 10, behind: 5 });
      });

      it('should handle zero ahead/behind', async () => {
        vi.mocked(childProcess.execSync).mockImplementation(
          (command: string) => {
            const cmd = String(command);
            if (cmd.includes('branch --show-current')) {
              return 'main\n';
            }
            if (cmd.includes('status --porcelain')) {
              return '';
            }
            if (cmd.includes('log -1 --format')) {
              return 'In sync (2 days ago)\n';
            }
            if (cmd.includes('log -5 --format')) {
              return '- In sync\n';
            }
            if (cmd.includes('rev-list --left-right')) {
              return '0\t0\n';
            }
            return '';
          }
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
