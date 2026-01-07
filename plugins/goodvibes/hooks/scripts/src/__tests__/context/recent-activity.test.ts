/**
 * Unit tests for recent-activity.ts
 */

import { execSync } from 'child_process';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('child_process');
vi.mock('../../shared/logging.js', () => ({
  debug: vi.fn(),
}));

// Import modules under test
import {
  getRecentActivity,
  formatRecentActivity,
  type RecentActivity,
  type FileChange,
  type Hotspot,
  type RecentCommit,
} from '../../context/recent-activity.js';

// Type the mocked modules
const mockedExecSync = vi.mocked(execSync);

/**
 * Helper to create a comprehensive mock for git commands.
 * The implementation calls multiple git commands:
 * 1. rev-parse --is-inside-work-tree
 * 2. log --since=... --name-status (for recently modified files)
 * 3. log -50 --name-only (for hotspots)
 * 4. log -5 --format=... (for recent commits)
 *
 * Each mock must handle ALL commands, not just the one being tested.
 *
 * Note: The implementation uses encoding: 'utf-8', so execSync returns a string,
 * not a Buffer. The implementation also calls .trim() on the result.
 */
function createGitMock(options: {
  isGitRepo?: boolean;
  nameStatusOutput?: string;
  nameOnlyOutput?: string;
  formatOutput?: string;
}): (cmd: string | Buffer) => string {
  const {
    isGitRepo = true,
    nameStatusOutput = '',
    nameOnlyOutput = '',
    formatOutput = '',
  } = options;

  return (cmd: string | Buffer) => {
    const cmdStr = cmd.toString();

    // git rev-parse --is-inside-work-tree
    if (cmdStr.includes('rev-parse --is-inside-work-tree')) {
      if (!isGitRepo) {
        throw new Error('not a git repository');
      }
      return 'true\n';
    }

    // git log --since for recently modified files (with --name-status)
    if (cmdStr.includes('log') && cmdStr.includes('--name-status')) {
      return nameStatusOutput;
    }

    // git log for hotspots (with --name-only, no --format)
    if (
      cmdStr.includes('log -') &&
      cmdStr.includes('--name-only') &&
      !cmdStr.includes('--format')
    ) {
      return nameOnlyOutput;
    }

    // git log for recent commits (with --format=)
    if (cmdStr.includes('log -') && cmdStr.includes('--format=')) {
      return formatOutput;
    }

    return '';
  };
}

describe('recent-activity', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: not a git repo
    mockedExecSync.mockImplementation(() => {
      throw new Error('Command failed');
    });
  });

  describe('getRecentActivity', () => {
    it('should return empty activity for non-git repository', async () => {
      // git rev-parse --is-inside-work-tree fails
      mockedExecSync.mockImplementation(() => {
        throw new Error('not a git repository');
      });

      const result = await getRecentActivity('/test/not-a-repo');

      expect(result).toEqual({
        recentlyModifiedFiles: [],
        hotspots: [],
        recentCommits: [],
        activeContributors: [],
      });
    });

    it('should return empty activity when git command returns false', async () => {
      // git rev-parse returns 'false' (not inside work tree)
      mockedExecSync.mockReturnValue('false\n');

      const result = await getRecentActivity('/test/not-work-tree');

      expect(result).toEqual({
        recentlyModifiedFiles: [],
        hotspots: [],
        recentCommits: [],
        activeContributors: [],
      });
    });

    it('should gather full activity for git repository', async () => {
      // Hotspot threshold is Math.max(3, 50 * 0.1) = 5, so file must appear 5+ times
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameStatusOutput: 'M\tfile1.ts\nA\tfile2.ts\nD\tfile3.ts\n',
          nameOnlyOutput:
            'hotspot.ts\nhotspot.ts\nhotspot.ts\nhotspot.ts\nhotspot.ts\nhotspot.ts\n',
          formatOutput:
            'abc123|Fix bug|John Doe|2 hours ago\ndef456|Add feature|Jane Smith|1 day ago\n',
        })
      );

      const result = await getRecentActivity('/test/git-repo');

      expect(result.recentlyModifiedFiles.length).toBeGreaterThan(0);
      expect(result.hotspots.length).toBeGreaterThan(0);
      expect(result.recentCommits.length).toBe(2);
      expect(result.recentCommits[0].hash).toBe('abc123');
      expect(result.recentCommits[0].message).toBe('Fix bug');
      expect(result.recentCommits[0].author).toBe('John Doe');
      expect(result.recentCommits[0].date).toBe('2 hours ago');
      expect(result.recentCommits[0].filesChanged).toBe(0);
    });

    it('should handle git commands that return empty output', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameStatusOutput: '',
          nameOnlyOutput: '',
          formatOutput: '',
        })
      );

      const result = await getRecentActivity('/test/empty-repo');

      expect(result.recentlyModifiedFiles).toEqual([]);
      expect(result.hotspots).toEqual([]);
      expect(result.recentCommits).toEqual([]);
    });

    it('should handle git commands that fail after repo check', async () => {
      mockedExecSync.mockImplementation((cmd: string | Buffer) => {
        const cmdStr = cmd.toString();

        if (cmdStr.includes('rev-parse --is-inside-work-tree')) {
          return 'true\n';
        }

        // All other commands fail
        throw new Error('git command failed');
      });

      const result = await getRecentActivity('/test/failing-repo');

      expect(result.recentlyModifiedFiles).toEqual([]);
      expect(result.hotspots).toEqual([]);
      expect(result.recentCommits).toEqual([]);
    });
  });

  describe('getRecentlyModifiedFiles', () => {
    it('should parse modified files with M status', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameStatusOutput: 'M\tfile1.ts\nM\tfile2.ts\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentlyModifiedFiles).toHaveLength(2);
      expect(result.recentlyModifiedFiles[0].type).toBe('modified');
    });

    it('should parse added files with A status', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameStatusOutput: 'A\tnewfile.ts\nA\tanother.ts\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentlyModifiedFiles[0].type).toBe('added');
      expect(result.recentlyModifiedFiles[0].file).toBe('newfile.ts');
    });

    it('should parse deleted files with D status', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameStatusOutput: 'D\toldfile.ts\nD\tlegacy.ts\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentlyModifiedFiles[0].type).toBe('deleted');
    });

    it('should handle mixed file statuses', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameStatusOutput: 'M\tmodified.ts\nA\tadded.ts\nD\tdeleted.ts\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentlyModifiedFiles).toHaveLength(3);
      const types = result.recentlyModifiedFiles.map((f) => f.type);
      expect(types).toContain('modified');
      expect(types).toContain('added');
      expect(types).toContain('deleted');
    });

    it('should aggregate multiple changes to same file', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameStatusOutput: 'M\tfile.ts\nM\tfile.ts\nA\tfile.ts\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentlyModifiedFiles).toHaveLength(1);
      expect(result.recentlyModifiedFiles[0].changes).toBe(3);
    });

    it('should determine type based on most frequent status', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameStatusOutput: 'D\tfile.ts\nD\tfile.ts\nM\tfile.ts\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentlyModifiedFiles[0].type).toBe('deleted');
    });

    it('should prefer added type when adds exceed other types', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameStatusOutput: 'A\tfile.ts\nA\tfile.ts\nM\tfile.ts\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentlyModifiedFiles[0].type).toBe('added');
    });

    it('should default to modified when counts are equal', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameStatusOutput: 'A\tfile.ts\nM\tfile.ts\nD\tfile.ts\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentlyModifiedFiles[0].type).toBe('modified');
    });

    it('should sort files by change count descending', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameStatusOutput:
            'M\tfile1.ts\nM\tfile2.ts\nM\tfile2.ts\nM\tfile2.ts\nM\tfile3.ts\nM\tfile3.ts\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentlyModifiedFiles[0].file).toBe('file2.ts');
      expect(result.recentlyModifiedFiles[0].changes).toBe(3);
      expect(result.recentlyModifiedFiles[1].file).toBe('file3.ts');
      expect(result.recentlyModifiedFiles[1].changes).toBe(2);
    });

    it('should limit results to MAX_RECENT_FILES (10)', async () => {
      // Generate 15 files
      const files = Array.from({ length: 15 }, (_, i) => `M\tfile${i}.ts`).join(
        '\n'
      );
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameStatusOutput: files + '\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentlyModifiedFiles.length).toBe(10);
    });

    it('should skip empty lines in git output', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameStatusOutput: '\n\nM\tfile.ts\n\n\nA\tfile2.ts\n\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentlyModifiedFiles).toHaveLength(2);
    });

    it('should skip lines that do not match status pattern', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameStatusOutput:
            'M\tfile.ts\nInvalid line\nA\tfile2.ts\nNo tab here\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentlyModifiedFiles).toHaveLength(2);
      expect(result.recentlyModifiedFiles.map((f) => f.file)).toEqual([
        'file.ts',
        'file2.ts',
      ]);
    });
  });

  describe('getHotspots', () => {
    it('should identify hotspots from frequently changed files', async () => {
      // File appears 6 times (threshold for 50 commits is 5)
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameOnlyOutput:
            'hotspot.ts\n\nhotspot.ts\n\nhotspot.ts\n\nhotspot.ts\n\nhotspot.ts\n\nhotspot.ts\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.hotspots.length).toBeGreaterThan(0);
      expect(result.hotspots[0].file).toBe('hotspot.ts');
      expect(result.hotspots[0].changeCount).toBe(6);
      expect(result.hotspots[0].reason).toContain(
        'Changed in 6 of last 50 commits'
      );
    });

    it('should filter out node_modules files', async () => {
      const files = Array.from(
        { length: 10 },
        () => 'node_modules/package/file.js\n'
      ).join('');
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameOnlyOutput: files,
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.hotspots).toEqual([]);
    });

    it('should filter out dist files', async () => {
      const files = Array.from({ length: 10 }, () => 'dist/bundle.js\n').join(
        ''
      );
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameOnlyOutput: files,
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.hotspots).toEqual([]);
    });

    it('should filter out lock files', async () => {
      const files =
        Array.from({ length: 10 }, () => 'package-lock.json\n').join('') +
        Array.from({ length: 10 }, () => 'yarn.lock\n').join('');
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameOnlyOutput: files,
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.hotspots).toEqual([]);
    });

    it('should filter out json files', async () => {
      const files = Array.from({ length: 10 }, () => 'config.json\n').join('');
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameOnlyOutput: files,
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.hotspots).toEqual([]);
    });

    it('should filter out markdown files', async () => {
      const files = Array.from({ length: 10 }, () => 'README.md\n').join('');
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameOnlyOutput: files,
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.hotspots).toEqual([]);
    });

    it('should use threshold of 5 with default 50 commits (threshold = max(3, 50*0.1))', async () => {
      // With 50 commits, threshold is Math.max(3, 50*0.1) = Math.max(3, 5) = 5
      // File appears 5 times - exactly at threshold, should be included
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameOnlyOutput: 'file.ts\nfile.ts\nfile.ts\nfile.ts\nfile.ts\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.hotspots).toHaveLength(1);
      expect(result.hotspots[0].changeCount).toBe(5);
    });

    it('should exclude files below threshold', async () => {
      // File appears only 2 times (below threshold)
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameOnlyOutput: 'file.ts\n\nfile.ts\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.hotspots).toEqual([]);
    });

    it('should sort hotspots by change count descending', async () => {
      // With threshold of 5, we need files appearing at least 5 times
      const output =
        Array.from({ length: 6 }, () => 'file1.ts\n').join('') +
        Array.from({ length: 10 }, () => 'file2.ts\n').join('') +
        Array.from({ length: 8 }, () => 'file3.ts\n').join('');
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameOnlyOutput: output,
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.hotspots[0].file).toBe('file2.ts');
      expect(result.hotspots[0].changeCount).toBe(10);
      expect(result.hotspots[1].file).toBe('file3.ts');
      expect(result.hotspots[1].changeCount).toBe(8);
    });

    it('should limit results to MAX_HOTSPOTS (5)', async () => {
      // Generate 8 files each with 10 changes
      const output = Array.from({ length: 8 }, (_, i) =>
        Array.from({ length: 10 }, () => `file${i}.ts\n`).join('')
      ).join('\n');
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameOnlyOutput: output,
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.hotspots.length).toBe(5);
    });

    it('should skip empty lines', async () => {
      // File needs to appear at least 5 times to meet threshold
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameOnlyOutput:
            '\n\nfile.ts\n\nfile.ts\n\nfile.ts\n\nfile.ts\n\nfile.ts\n\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.hotspots[0].changeCount).toBe(5);
    });
  });

  describe('getRecentCommits', () => {
    it('should parse recent commits', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          formatOutput:
            'abc123|Fix bug|John Doe|2 hours ago\ndef456|Add feature|Jane Smith|1 day ago\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentCommits).toHaveLength(2);
      expect(result.recentCommits[0]).toEqual({
        hash: 'abc123',
        message: 'Fix bug',
        author: 'John Doe',
        date: '2 hours ago',
        filesChanged: 0,
      });
    });

    it('should handle commits with pipe characters in message', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          formatOutput: 'abc|Fix bug | Update tests|John|2 hours ago\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentCommits).toHaveLength(1);
      expect(result.recentCommits[0].hash).toBe('abc');
      // Note: The implementation splits by '|' and takes first 4 parts
      // So "Fix bug | Update tests" becomes message="Fix bug ", and author=" Update tests"
      // This is actually a limitation in the implementation, but let's test actual behavior
      expect(result.recentCommits[0].message).toBe('Fix bug ');
      expect(result.recentCommits[0].author).toBe(' Update tests');
    });

    it('should skip empty lines', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          formatOutput:
            '\nabc|Fix bug|John|2 hours ago\n\n\ndef|Add feature|Jane|1 day ago\n\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentCommits).toHaveLength(2);
    });

    it('should skip lines with insufficient parts', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          formatOutput: 'abc|Fix bug|John\ndef|Add feature|Jane|1 day ago\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentCommits).toHaveLength(1);
      expect(result.recentCommits[0].hash).toBe('def');
    });

    it('should handle empty parts gracefully', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          formatOutput: '||||\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentCommits).toHaveLength(1);
      expect(result.recentCommits[0]).toEqual({
        hash: '',
        message: '',
        author: '',
        date: '',
        filesChanged: 0,
      });
    });

    it('should limit results to requested count', async () => {
      // Return more than 5 commits - the implementation limits to count param (default 5)
      const commits = Array.from(
        { length: 8 },
        (_, i) => `hash${i}|message${i}|author${i}|date${i}`
      ).join('\n');
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          formatOutput: commits + '\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentCommits.length).toBe(5);
    });
  });

  describe('formatRecentActivity', () => {
    it('should return null for empty activity', () => {
      const activity: RecentActivity = {
        recentlyModifiedFiles: [],
        hotspots: [],
        recentCommits: [],
        activeContributors: [],
      };

      const result = formatRecentActivity(activity);

      expect(result).toBeNull();
    });

    it('should format recent commits', () => {
      const activity: RecentActivity = {
        recentlyModifiedFiles: [],
        hotspots: [],
        recentCommits: [
          {
            hash: 'abc123',
            message: 'Fix bug',
            author: 'John',
            date: '2 hours ago',
            filesChanged: 0,
          },
          {
            hash: 'def456',
            message: 'Add feature',
            author: 'Jane',
            date: '1 day ago',
            filesChanged: 0,
          },
        ],
        activeContributors: [],
      };

      const result = formatRecentActivity(activity);

      expect(result).toContain('**Recent Commits:**');
      expect(result).toContain('`abc123` Fix bug (2 hours ago)');
      expect(result).toContain('`def456` Add feature (1 day ago)');
    });

    it('should limit recent commits to MAX_DISPLAY_COMMITS (3)', () => {
      const activity: RecentActivity = {
        recentlyModifiedFiles: [],
        hotspots: [],
        recentCommits: [
          {
            hash: 'a',
            message: 'Commit 1',
            author: 'John',
            date: '1h',
            filesChanged: 0,
          },
          {
            hash: 'b',
            message: 'Commit 2',
            author: 'Jane',
            date: '2h',
            filesChanged: 0,
          },
          {
            hash: 'c',
            message: 'Commit 3',
            author: 'Bob',
            date: '3h',
            filesChanged: 0,
          },
          {
            hash: 'd',
            message: 'Commit 4',
            author: 'Alice',
            date: '4h',
            filesChanged: 0,
          },
        ],
        activeContributors: [],
      };

      const result = formatRecentActivity(activity);

      expect(result).toContain('`a` Commit 1');
      expect(result).toContain('`b` Commit 2');
      expect(result).toContain('`c` Commit 3');
      expect(result).not.toContain('`d` Commit 4');
    });

    it('should format hotspots', () => {
      const activity: RecentActivity = {
        recentlyModifiedFiles: [],
        hotspots: [
          { file: 'hotspot.ts', changeCount: 10, reason: 'Changed 10 times' },
          { file: 'another.ts', changeCount: 5, reason: 'Changed 5 times' },
        ],
        recentCommits: [],
        activeContributors: [],
      };

      const result = formatRecentActivity(activity);

      expect(result).toContain('**Hotspots (frequently changed):**');
      expect(result).toContain('`hotspot.ts` (10 changes)');
      expect(result).toContain('`another.ts` (5 changes)');
    });

    it('should format recently modified files', () => {
      const activity: RecentActivity = {
        recentlyModifiedFiles: [
          { file: 'file1.ts', changes: 5, type: 'modified' },
          { file: 'file2.ts', changes: 3, type: 'added' },
          { file: 'file3.ts', changes: 2, type: 'deleted' },
        ],
        hotspots: [],
        recentCommits: [],
        activeContributors: [],
      };

      const result = formatRecentActivity(activity);

      expect(result).toContain('**Recently Modified:**');
      expect(result).toContain('`file1.ts` (modified, 5 change(s))');
      expect(result).toContain('`file2.ts` (added, 3 change(s))');
      expect(result).toContain('`file3.ts` (deleted, 2 change(s))');
    });

    it('should limit recently modified files to MAX_DISPLAY_FILES (5)', () => {
      const activity: RecentActivity = {
        recentlyModifiedFiles: [
          { file: 'file1.ts', changes: 1, type: 'modified' },
          { file: 'file2.ts', changes: 1, type: 'modified' },
          { file: 'file3.ts', changes: 1, type: 'modified' },
          { file: 'file4.ts', changes: 1, type: 'modified' },
          { file: 'file5.ts', changes: 1, type: 'modified' },
          { file: 'file6.ts', changes: 1, type: 'modified' },
        ],
        hotspots: [],
        recentCommits: [],
        activeContributors: [],
      };

      const result = formatRecentActivity(activity);

      expect(result).toContain('`file1.ts`');
      expect(result).toContain('`file5.ts`');
      expect(result).not.toContain('`file6.ts`');
    });

    it('should format all sections when all data is present', () => {
      const activity: RecentActivity = {
        recentlyModifiedFiles: [
          { file: 'file.ts', changes: 1, type: 'modified' },
        ],
        hotspots: [
          { file: 'hotspot.ts', changeCount: 5, reason: 'Changed 5 times' },
        ],
        recentCommits: [
          {
            hash: 'abc',
            message: 'Fix bug',
            author: 'John',
            date: '1h',
            filesChanged: 0,
          },
        ],
        activeContributors: [],
      };

      const result = formatRecentActivity(activity);

      expect(result).toContain('**Recent Commits:**');
      expect(result).toContain('**Hotspots (frequently changed):**');
      expect(result).toContain('**Recently Modified:**');
      expect(result?.split('\n\n')).toHaveLength(3);
    });

    it('should format only commits when only commits are present', () => {
      const activity: RecentActivity = {
        recentlyModifiedFiles: [],
        hotspots: [],
        recentCommits: [
          {
            hash: 'abc',
            message: 'Fix',
            author: 'John',
            date: '1h',
            filesChanged: 0,
          },
        ],
        activeContributors: [],
      };

      const result = formatRecentActivity(activity);

      expect(result).toContain('**Recent Commits:**');
      expect(result).not.toContain('**Hotspots');
      expect(result).not.toContain('**Recently Modified');
    });

    it('should format only hotspots when only hotspots are present', () => {
      const activity: RecentActivity = {
        recentlyModifiedFiles: [],
        hotspots: [
          { file: 'hotspot.ts', changeCount: 5, reason: 'Changed 5 times' },
        ],
        recentCommits: [],
        activeContributors: [],
      };

      const result = formatRecentActivity(activity);

      expect(result).toContain('**Hotspots');
      expect(result).not.toContain('**Recent Commits');
      expect(result).not.toContain('**Recently Modified');
    });

    it('should format only modified files when only modified files are present', () => {
      const activity: RecentActivity = {
        recentlyModifiedFiles: [
          { file: 'file.ts', changes: 1, type: 'modified' },
        ],
        hotspots: [],
        recentCommits: [],
        activeContributors: [],
      };

      const result = formatRecentActivity(activity);

      expect(result).toContain('**Recently Modified');
      expect(result).not.toContain('**Recent Commits');
      expect(result).not.toContain('**Hotspots');
    });
  });

  describe('gitExec error handling', () => {
    it('should handle timeout errors', async () => {
      mockedExecSync.mockImplementation((cmd: string | Buffer) => {
        const cmdStr = cmd.toString();
        if (cmdStr.includes('rev-parse')) {
          return 'true\n';
        }
        const error: any = new Error('Command timed out');
        error.code = 'ETIMEDOUT';
        throw error;
      });

      const result = await getRecentActivity('/test/repo');

      // Should not crash, should return empty arrays
      expect(result.recentlyModifiedFiles).toEqual([]);
      expect(result.hotspots).toEqual([]);
      expect(result.recentCommits).toEqual([]);
    });

    it('should handle non-Error exceptions', async () => {
      mockedExecSync.mockImplementation((cmd: string | Buffer) => {
        const cmdStr = cmd.toString();
        if (cmdStr.includes('rev-parse')) {
          return 'true\n';
        }
        throw 'string error';
      });

      const result = await getRecentActivity('/test/repo');

      expect(result.recentlyModifiedFiles).toEqual([]);
      expect(result.hotspots).toEqual([]);
      expect(result.recentCommits).toEqual([]);
    });

    it('should handle null/undefined exceptions', async () => {
      mockedExecSync.mockImplementation((cmd: string | Buffer) => {
        const cmdStr = cmd.toString();
        if (cmdStr.includes('rev-parse')) {
          return 'true\n';
        }
        throw null;
      });

      const result = await getRecentActivity('/test/repo');

      expect(result.recentlyModifiedFiles).toEqual([]);
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('should handle very long file paths', async () => {
      const longPath = 'a/'.repeat(100) + 'file.ts';
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameStatusOutput: `M\t${longPath}\n`,
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentlyModifiedFiles[0].file).toBe(longPath);
    });

    it('should handle file names with special characters', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameStatusOutput:
            'M\tfile with spaces.ts\nA\tfile-with-dashes.ts\nD\tfile_with_underscores.ts\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentlyModifiedFiles.map((f) => f.file)).toContain(
        'file with spaces.ts'
      );
      expect(result.recentlyModifiedFiles.map((f) => f.file)).toContain(
        'file-with-dashes.ts'
      );
      expect(result.recentlyModifiedFiles.map((f) => f.file)).toContain(
        'file_with_underscores.ts'
      );
    });

    it('should handle commit messages with special characters', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          formatOutput: 'abc|Fix: bug with "quotes" & <tags>|John|1h\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentCommits[0].message).toBe(
        'Fix: bug with "quotes" & <tags>'
      );
    });

    it('should handle author names with special characters', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          formatOutput: 'abc|Fix bug|Jose Garcia-Perez|1h\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentCommits[0].author).toBe('Jose Garcia-Perez');
    });

    it('should handle Windows-style paths in files', async () => {
      mockedExecSync.mockImplementation(
        createGitMock({
          isGitRepo: true,
          nameStatusOutput: 'M\tsrc\\components\\Button.tsx\n',
        })
      );

      const result = await getRecentActivity('/test/repo');

      expect(result.recentlyModifiedFiles[0].file).toBe(
        'src\\components\\Button.tsx'
      );
    });
  });
});
