/**
 * Unit tests for handleCreatePullRequest
 *
 * Tests the create pull request handler that creates GitHub PRs with
 * auto-generated descriptions using LLM analysis.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock functions using vi.hoisted() to ensure they're available before vi.mock() is hoisted
const { mockExecSync, mockSpawnSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
  mockSpawnSync: vi.fn(),
}));

// Mock child_process before importing the module under test
vi.mock('child_process', () => ({
  execSync: mockExecSync,
  spawnSync: mockSpawnSync,
}));

// Mock config
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

// Import after mocks are set up
import { handleCreatePullRequest } from '../../../handlers/git/create-pull-request.js';

describe('handleCreatePullRequest', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('gh CLI validation', () => {
    test('returns error when gh CLI is not installed', async () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 1,
        stdout: '',
        stderr: 'command not found',
        pid: 0,
        output: [],
        signal: null,
      });

      const result = await handleCreatePullRequest({});
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('GitHub CLI');
    });

    test('returns error when gh CLI is not authenticated', async () => {
      // First call: gh --version succeeds
      mockSpawnSync
        .mockReturnValueOnce({
          status: 0,
          stdout: 'gh version 2.0.0',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        // Second call: gh auth status fails
        .mockReturnValueOnce({
          status: 1,
          stdout: '',
          stderr: 'not logged in',
          pid: 0,
          output: [],
          signal: null,
        });

      const result = await handleCreatePullRequest({});
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('not authenticated');
    });
  });

  describe('git state validation', () => {
    test('returns error when not in a git repository', async () => {
      // gh CLI checks pass
      mockSpawnSync
        .mockReturnValueOnce({
          status: 0,
          stdout: 'gh version 2.0.0',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'Logged in',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

      // execSync for git commands fails - branch --show-current returns null
      // which causes getGitInfo to return null
      mockExecSync.mockImplementation((cmd: string) => {
        // All git commands fail when not in a git repository
        throw new Error('not a git repository');
      });

      const result = await handleCreatePullRequest({});
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Failed to get git information');
    });

    test('returns error when on base branch', async () => {
      // gh CLI checks pass
      mockSpawnSync
        .mockReturnValueOnce({
          status: 0,
          stdout: 'gh version 2.0.0',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'Logged in',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

      // Mock execSync to simulate being on main branch
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('symbolic-ref refs/remotes/origin/HEAD')) {
          return 'refs/remotes/origin/main';
        }
        if (cmd.includes('branch --show-current')) {
          return 'main'; // Same as base
        }
        return '';
      });

      const result = await handleCreatePullRequest({ base: 'main' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Cannot create PR from main to main');
    });

    test('returns error when no commits between branches', async () => {
      // gh CLI checks pass
      mockSpawnSync
        .mockReturnValueOnce({
          status: 0,
          stdout: 'gh version 2.0.0',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'Logged in',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

      // Mock git commands
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --show-current')) {
          return 'feature-branch';
        }
        if (cmd.includes('diff --stat')) {
          return '';
        }
        if (cmd.includes('diff --name-only')) {
          return '';
        }
        if (cmd.includes('diff --numstat')) {
          return '';
        }
        if (cmd.includes('log') && cmd.includes('--oneline')) {
          return ''; // No commits
        }
        if (cmd.includes('symbolic-ref')) {
          return 'refs/remotes/origin/main';
        }
        return '';
      });

      const result = await handleCreatePullRequest({});
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('No commits found');
    });
  });

  describe('title generation', () => {
    test('generates title from branch name following conventional commit', async () => {
      // Set up successful gh CLI and git mocks
      mockSpawnSync
        .mockReturnValueOnce({
          status: 0,
          stdout: 'gh version 2.0.0',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'Logged in',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        // gh pr create (no Claude CLI call since auto_description: false)
        .mockReturnValueOnce({
          status: 0,
          stdout: 'https://github.com/test/repo/pull/123',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --show-current')) {
          return 'feat/add-new-feature';
        }
        if (cmd.includes('diff --stat')) {
          return 'file.ts | 10 ++++';
        }
        if (cmd.includes('diff --name-only')) {
          return 'file.ts';
        }
        if (cmd.includes('diff --numstat')) {
          return '10\t2\tfile.ts';
        }
        if (cmd.includes('log') && cmd.includes('--oneline')) {
          return 'abc123 add feature';
        }
        if (cmd.includes('symbolic-ref')) {
          return 'refs/remotes/origin/main';
        }
        if (cmd.includes('rev-parse')) {
          return 'origin/feature-branch';
        }
        if (cmd.includes('status -sb')) {
          return '## feature-branch';
        }
        if (cmd.includes('push')) {
          return '';
        }
        return '';
      });

      const result = await handleCreatePullRequest({ auto_description: false });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.title).toBe('feat: add new feature');
    });

    test('uses first commit message when branch name does not follow convention', async () => {
      mockSpawnSync
        .mockReturnValueOnce({
          status: 0,
          stdout: 'gh version 2.0.0',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'Logged in',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'https://github.com/test/repo/pull/123',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --show-current')) {
          return 'my-random-branch';
        }
        if (cmd.includes('diff --stat')) {
          return 'file.ts | 10 ++++';
        }
        if (cmd.includes('diff --name-only')) {
          return 'file.ts';
        }
        if (cmd.includes('diff --numstat')) {
          return '10\t2\tfile.ts';
        }
        if (cmd.includes('log') && cmd.includes('--oneline')) {
          return 'abc123 My awesome commit message';
        }
        if (cmd.includes('symbolic-ref')) {
          return 'refs/remotes/origin/main';
        }
        if (cmd.includes('rev-parse')) {
          return 'origin/my-random-branch';
        }
        if (cmd.includes('status -sb')) {
          return '## my-random-branch';
        }
        return '';
      });

      const result = await handleCreatePullRequest({ auto_description: false });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.title).toBe('My awesome commit message');
    });

    test('uses provided title instead of generating one', async () => {
      mockSpawnSync
        .mockReturnValueOnce({
          status: 0,
          stdout: 'gh version 2.0.0',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'Logged in',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'https://github.com/test/repo/pull/123',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --show-current')) {
          return 'feature-branch';
        }
        if (cmd.includes('diff --stat')) {
          return 'file.ts | 10 ++++';
        }
        if (cmd.includes('diff --name-only')) {
          return 'file.ts';
        }
        if (cmd.includes('diff --numstat')) {
          return '10\t2\tfile.ts';
        }
        if (cmd.includes('log') && cmd.includes('--oneline')) {
          return 'abc123 commit';
        }
        if (cmd.includes('symbolic-ref')) {
          return 'refs/remotes/origin/main';
        }
        if (cmd.includes('rev-parse')) {
          return 'origin/feature-branch';
        }
        if (cmd.includes('status -sb')) {
          return '## feature-branch';
        }
        return '';
      });

      const result = await handleCreatePullRequest({
        title: 'My Custom Title',
        auto_description: false,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.title).toBe('My Custom Title');
    });
  });

  describe('push handling', () => {
    test('pushes branch with -u when no upstream exists', async () => {
      let pushCalled = false;

      mockSpawnSync
        .mockReturnValueOnce({
          status: 0,
          stdout: 'gh version 2.0.0',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'Logged in',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'https://github.com/test/repo/pull/123',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --show-current')) {
          return 'feature-branch';
        }
        if (cmd.includes('diff --stat')) {
          return 'file.ts | 10 ++++';
        }
        if (cmd.includes('diff --name-only')) {
          return 'file.ts';
        }
        if (cmd.includes('diff --numstat')) {
          return '10\t2\tfile.ts';
        }
        if (cmd.includes('log') && cmd.includes('--oneline')) {
          return 'abc123 commit';
        }
        if (cmd.includes('symbolic-ref')) {
          return 'refs/remotes/origin/main';
        }
        if (cmd.includes('rev-parse') && cmd.includes('@{upstream}')) {
          throw new Error('no upstream');
        }
        if (cmd.includes('status -sb')) {
          return '## feature-branch';
        }
        if (cmd.includes('push -u')) {
          pushCalled = true;
          return '';
        }
        return '';
      });

      await handleCreatePullRequest({ auto_description: false });

      expect(pushCalled).toBe(true);
    });

    test('returns error when push fails', async () => {
      mockSpawnSync
        .mockReturnValueOnce({
          status: 0,
          stdout: 'gh version 2.0.0',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'Logged in',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --show-current')) {
          return 'feature-branch';
        }
        if (cmd.includes('diff --stat')) {
          return 'file.ts | 10 ++++';
        }
        if (cmd.includes('diff --name-only')) {
          return 'file.ts';
        }
        if (cmd.includes('diff --numstat')) {
          return '10\t2\tfile.ts';
        }
        if (cmd.includes('log') && cmd.includes('--oneline')) {
          return 'abc123 commit';
        }
        if (cmd.includes('symbolic-ref')) {
          return 'refs/remotes/origin/main';
        }
        if (cmd.includes('rev-parse') && cmd.includes('@{upstream}')) {
          throw new Error('no upstream');
        }
        if (cmd.includes('status -sb')) {
          return '## feature-branch';
        }
        if (cmd.includes('push')) {
          throw new Error('push rejected');
        }
        return '';
      });

      const result = await handleCreatePullRequest({ auto_description: false });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('push');
    });
  });

  describe('PR creation', () => {
    test('creates PR successfully with all options', async () => {
      mockSpawnSync
        .mockReturnValueOnce({
          status: 0,
          stdout: 'gh version 2.0.0',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'Logged in',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'https://github.com/test/repo/pull/456',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --show-current')) {
          return 'fix/bug-fix';
        }
        if (cmd.includes('diff --stat')) {
          return 'file.ts | 10 ++++\ntest.ts | 5 ++';
        }
        if (cmd.includes('diff --name-only')) {
          return 'file.ts\ntest.ts';
        }
        if (cmd.includes('diff --numstat')) {
          return '10\t2\tfile.ts\n5\t1\ttest.ts';
        }
        if (cmd.includes('log') && cmd.includes('--oneline')) {
          return 'abc123 fix bug\ndef456 add tests';
        }
        if (cmd.includes('symbolic-ref')) {
          return 'refs/remotes/origin/main';
        }
        if (cmd.includes('rev-parse')) {
          return 'origin/fix/bug-fix';
        }
        if (cmd.includes('status -sb')) {
          return '## fix/bug-fix';
        }
        return '';
      });

      const result = await handleCreatePullRequest({
        base: 'main',
        draft: true,
        labels: ['bug', 'priority-high'],
        reviewers: ['teammate1', 'teammate2'],
        auto_description: false,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.pr_url).toBe('https://github.com/test/repo/pull/456');
      expect(data.pr_number).toBe(456);
      expect(data.head_branch).toBe('fix/bug-fix');
      expect(data.base_branch).toBe('main');
      expect(data.files_changed).toBe(2);
      expect(data.additions).toBe(15);
      expect(data.deletions).toBe(3);
      expect(data.commits).toBe(2);
      expect(data.draft).toBe(true);
      expect(data.labels).toEqual(['bug', 'priority-high']);
    });

    test('returns error when gh pr create fails', async () => {
      mockSpawnSync
        .mockReturnValueOnce({
          status: 0,
          stdout: 'gh version 2.0.0',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'Logged in',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 1,
          stdout: '',
          stderr: 'PR already exists',
          pid: 0,
          output: [],
          signal: null,
        });

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --show-current')) {
          return 'feature-branch';
        }
        if (cmd.includes('diff --stat')) {
          return 'file.ts | 10 ++++';
        }
        if (cmd.includes('diff --name-only')) {
          return 'file.ts';
        }
        if (cmd.includes('diff --numstat')) {
          return '10\t2\tfile.ts';
        }
        if (cmd.includes('log') && cmd.includes('--oneline')) {
          return 'abc123 commit';
        }
        if (cmd.includes('symbolic-ref')) {
          return 'refs/remotes/origin/main';
        }
        if (cmd.includes('rev-parse')) {
          return 'origin/feature-branch';
        }
        if (cmd.includes('status -sb')) {
          return '## feature-branch';
        }
        return '';
      });

      const result = await handleCreatePullRequest({ auto_description: false });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('gh pr create failed');
    });
  });

  describe('default branch detection', () => {
    test('detects main as default branch', async () => {
      mockSpawnSync
        .mockReturnValueOnce({
          status: 0,
          stdout: 'gh version 2.0.0',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'Logged in',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'https://github.com/test/repo/pull/123',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --show-current')) {
          return 'feature-branch';
        }
        if (cmd.includes('symbolic-ref refs/remotes/origin/HEAD')) {
          throw new Error('not found');
        }
        if (cmd.includes('rev-parse --verify origin/main')) {
          return 'abc123';
        }
        if (cmd.includes('diff --stat')) {
          return 'file.ts | 10 ++++';
        }
        if (cmd.includes('diff --name-only')) {
          return 'file.ts';
        }
        if (cmd.includes('diff --numstat')) {
          return '10\t2\tfile.ts';
        }
        if (cmd.includes('log') && cmd.includes('--oneline')) {
          return 'abc123 commit';
        }
        if (cmd.includes('rev-parse')) {
          return 'origin/feature-branch';
        }
        if (cmd.includes('status -sb')) {
          return '## feature-branch';
        }
        return '';
      });

      const result = await handleCreatePullRequest({ auto_description: false });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.base_branch).toBe('main');
    });

    test('falls back to master when main does not exist', async () => {
      mockSpawnSync
        .mockReturnValueOnce({
          status: 0,
          stdout: 'gh version 2.0.0',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'Logged in',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'https://github.com/test/repo/pull/123',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --show-current')) {
          return 'feature-branch';
        }
        if (cmd.includes('symbolic-ref refs/remotes/origin/HEAD')) {
          throw new Error('not found');
        }
        if (cmd.includes('rev-parse --verify origin/main')) {
          throw new Error('not found');
        }
        if (cmd.includes('rev-parse --verify origin/master')) {
          return 'abc123';
        }
        if (cmd.includes('diff --stat')) {
          return 'file.ts | 10 ++++';
        }
        if (cmd.includes('diff --name-only')) {
          return 'file.ts';
        }
        if (cmd.includes('diff --numstat')) {
          return '10\t2\tfile.ts';
        }
        if (cmd.includes('log') && cmd.includes('--oneline')) {
          return 'abc123 commit';
        }
        if (cmd.includes('rev-parse')) {
          return 'origin/feature-branch';
        }
        if (cmd.includes('status -sb')) {
          return '## feature-branch';
        }
        return '';
      });

      const result = await handleCreatePullRequest({ auto_description: false });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.base_branch).toBe('master');
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      mockSpawnSync
        .mockReturnValueOnce({
          status: 0,
          stdout: 'gh version 2.0.0',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'Logged in',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'https://github.com/test/repo/pull/123',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --show-current')) {
          return 'feature-branch';
        }
        if (cmd.includes('diff --stat')) {
          return 'file.ts | 10 ++++';
        }
        if (cmd.includes('diff --name-only')) {
          return 'file.ts';
        }
        if (cmd.includes('diff --numstat')) {
          return '10\t2\tfile.ts';
        }
        if (cmd.includes('log') && cmd.includes('--oneline')) {
          return 'abc123 commit';
        }
        if (cmd.includes('symbolic-ref')) {
          return 'refs/remotes/origin/main';
        }
        if (cmd.includes('rev-parse')) {
          return 'origin/feature-branch';
        }
        if (cmd.includes('status -sb')) {
          return '## feature-branch';
        }
        return '';
      });

      const result = await handleCreatePullRequest({ auto_description: false });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('pr_url');
      expect(data).toHaveProperty('title');
      expect(data).toHaveProperty('body');
      expect(data).toHaveProperty('base_branch');
      expect(data).toHaveProperty('head_branch');
      expect(data).toHaveProperty('files_changed');
      expect(data).toHaveProperty('additions');
      expect(data).toHaveProperty('deletions');
      expect(data).toHaveProperty('commits');
    });

    test('returns valid JSON', async () => {
      mockSpawnSync
        .mockReturnValueOnce({
          status: 0,
          stdout: 'gh version 2.0.0',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'Logged in',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: 'https://github.com/test/repo/pull/123',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('branch --show-current')) {
          return 'feature-branch';
        }
        if (cmd.includes('diff --stat')) {
          return 'file.ts | 10 ++++';
        }
        if (cmd.includes('diff --name-only')) {
          return 'file.ts';
        }
        if (cmd.includes('diff --numstat')) {
          return '10\t2\tfile.ts';
        }
        if (cmd.includes('log') && cmd.includes('--oneline')) {
          return 'abc123 commit';
        }
        if (cmd.includes('symbolic-ref')) {
          return 'refs/remotes/origin/main';
        }
        if (cmd.includes('rev-parse')) {
          return 'origin/feature-branch';
        }
        if (cmd.includes('status -sb')) {
          return '## feature-branch';
        }
        return '';
      });

      const result = await handleCreatePullRequest({ auto_description: false });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe('error handling', () => {
    test('catches and wraps unexpected errors', async () => {
      mockSpawnSync.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await handleCreatePullRequest({});
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Failed to check gh CLI');
    });
  });
});
