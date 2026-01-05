/**
 * Tests for automation modules: fix-loop, git-operations, build-runner, test-runner
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// fix-loop.ts tests (no mocking needed - pure functions)
// ============================================
describe('fix-loop', () => {
  describe('generateErrorSignature', () => {
    it('should create a stable signature from tool name and error', async () => {
      const { generateErrorSignature } = await import('../automation/fix-loop.js');

      const sig1 = generateErrorSignature('Bash', 'Error at line 42');
      const sig2 = generateErrorSignature('Bash', 'Error at line 42');

      expect(sig1).toBe(sig2);
      expect(sig1).toContain('Bash:');
    });

    it('should normalize numbers in error messages', async () => {
      const { generateErrorSignature } = await import('../automation/fix-loop.js');

      const sig1 = generateErrorSignature('Bash', 'Error at line 42');
      const sig2 = generateErrorSignature('Bash', 'Error at line 99');

      // Both should have the same signature because numbers are normalized to 'N'
      expect(sig1).toBe(sig2);
    });

    it('should normalize quoted strings in error messages', async () => {
      const { generateErrorSignature } = await import('../automation/fix-loop.js');

      const sig1 = generateErrorSignature('Edit', "Cannot find 'foo.ts'");
      const sig2 = generateErrorSignature('Edit', "Cannot find 'bar.ts'");

      // Both should have the same signature because quoted strings are normalized to 'STR'
      expect(sig1).toBe(sig2);
    });

    it('should differentiate errors from different tools', async () => {
      const { generateErrorSignature } = await import('../automation/fix-loop.js');

      const sig1 = generateErrorSignature('Bash', 'Error occurred');
      const sig2 = generateErrorSignature('Edit', 'Error occurred');

      expect(sig1).not.toBe(sig2);
    });

    it('should handle empty error message', async () => {
      const { generateErrorSignature } = await import('../automation/fix-loop.js');

      const sig = generateErrorSignature('Bash', '');

      expect(sig).toContain('Bash:');
    });

    it('should truncate long error messages', async () => {
      const { generateErrorSignature } = await import('../automation/fix-loop.js');

      const longError = 'a'.repeat(500);
      const sig = generateErrorSignature('Bash', longError);

      // Signature should still be reasonable length
      expect(sig.length).toBeLessThan(100);
    });
  });

  describe('categorizeError', () => {
    it('should categorize npm install errors', async () => {
      const { categorizeError } = await import('../automation/fix-loop.js');

      expect(categorizeError('ERESOLVE unable to resolve dependency tree')).toBe('npm_install');
      expect(categorizeError('npm ERR! peer dep missing')).toBe('npm_install');
      expect(categorizeError('npm install failed')).toBe('npm_install');
    });

    it('should categorize TypeScript errors with error keyword', async () => {
      const { categorizeError } = await import('../automation/fix-loop.js');

      // Must contain 'ts' AND ('error' OR 'type')
      expect(categorizeError('error TS2304: Cannot find name')).toBe('typescript_error');
      expect(categorizeError('tsc error: Property does not exist')).toBe('typescript_error');
    });

    it('should categorize TypeScript errors with type keyword', async () => {
      const { categorizeError } = await import('../automation/fix-loop.js');

      // String must contain 'ts' AND 'type' (not 'error')
      expect(categorizeError('tsc: Type mismatch')).toBe('typescript_error');
      expect(categorizeError('ts type check failed')).toBe('typescript_error');
    });

    it('should categorize test failures', async () => {
      const { categorizeError } = await import('../automation/fix-loop.js');

      expect(categorizeError('Test failed: expected true')).toBe('test_failure');
      expect(categorizeError('FAIL tests/unit.test.ts')).toBe('test_failure');
    });

    it('should categorize build failures', async () => {
      const { categorizeError } = await import('../automation/fix-loop.js');

      expect(categorizeError('Build failed with errors')).toBe('build_failure');
      expect(categorizeError('Compile error in module')).toBe('build_failure');
    });

    it('should categorize file not found errors', async () => {
      const { categorizeError } = await import('../automation/fix-loop.js');

      expect(categorizeError('ENOENT: no such file')).toBe('file_not_found');
      expect(categorizeError('File not found: config.ts')).toBe('file_not_found');
    });

    it('should categorize git conflict errors', async () => {
      const { categorizeError } = await import('../automation/fix-loop.js');

      expect(categorizeError('Merge conflict in file.ts')).toBe('git_conflict');
      expect(categorizeError('CONFLICT (content): Merge conflict')).toBe('git_conflict');
    });

    it('should categorize database errors', async () => {
      const { categorizeError } = await import('../automation/fix-loop.js');

      expect(categorizeError('Database connection failed')).toBe('database_error');
      expect(categorizeError('Prisma client error')).toBe('database_error');
      expect(categorizeError('SQL syntax error')).toBe('database_error');
    });

    it('should categorize API errors', async () => {
      const { categorizeError } = await import('../automation/fix-loop.js');

      expect(categorizeError('API request failed')).toBe('api_error');
      expect(categorizeError('fetch error: network timeout')).toBe('api_error');
    });

    it('should return unknown for uncategorized errors', async () => {
      const { categorizeError } = await import('../automation/fix-loop.js');

      expect(categorizeError('Something went wrong')).toBe('unknown');
      expect(categorizeError('Unexpected token')).toBe('unknown');
    });

    it('should be case insensitive', async () => {
      const { categorizeError } = await import('../automation/fix-loop.js');

      expect(categorizeError('NPM ERROR')).toBe('npm_install');
      expect(categorizeError('DATABASE ERROR')).toBe('database_error');
    });
  });

  describe('createErrorState', () => {
    it('should create initial error state with correct defaults', async () => {
      const { createErrorState } = await import('../automation/fix-loop.js');

      const state = createErrorState('sig123', 'npm_install');

      expect(state.signature).toBe('sig123');
      expect(state.category).toBe('npm_install');
      expect(state.phase).toBe(1);
      expect(state.attemptsThisPhase).toBe(0);
      expect(state.totalAttempts).toBe(0);
      expect(state.officialDocsSearched).toEqual([]);
      expect(state.officialDocsContent).toBe('');
      expect(state.unofficialDocsSearched).toEqual([]);
      expect(state.unofficialDocsContent).toBe('');
      expect(state.fixStrategiesAttempted).toEqual([]);
    });

    it('should work with different categories', async () => {
      const { createErrorState } = await import('../automation/fix-loop.js');

      const state1 = createErrorState('sig1', 'typescript_error');
      const state2 = createErrorState('sig2', 'unknown');

      expect(state1.category).toBe('typescript_error');
      expect(state2.category).toBe('unknown');
    });
  });

  describe('shouldEscalatePhase', () => {
    it('should return false when attempts are below limit', async () => {
      const { shouldEscalatePhase, createErrorState } = await import('../automation/fix-loop.js');

      const state = createErrorState('sig', 'npm_install');
      // npm_install has limit of 2
      state.attemptsThisPhase = 1;

      expect(shouldEscalatePhase(state)).toBe(false);
    });

    it('should return true when attempts reach limit', async () => {
      const { shouldEscalatePhase, createErrorState } = await import('../automation/fix-loop.js');

      const state = createErrorState('sig', 'npm_install');
      // npm_install has limit of 2
      state.attemptsThisPhase = 2;

      expect(shouldEscalatePhase(state)).toBe(true);
    });

    it('should return true when attempts exceed limit', async () => {
      const { shouldEscalatePhase, createErrorState } = await import('../automation/fix-loop.js');

      const state = createErrorState('sig', 'npm_install');
      state.attemptsThisPhase = 5;

      expect(shouldEscalatePhase(state)).toBe(true);
    });

    it('should use different limits for different categories', async () => {
      const { shouldEscalatePhase, createErrorState } = await import('../automation/fix-loop.js');

      // typescript_error has limit of 3
      const tsState = createErrorState('sig', 'typescript_error');
      tsState.attemptsThisPhase = 2;
      expect(shouldEscalatePhase(tsState)).toBe(false);

      tsState.attemptsThisPhase = 3;
      expect(shouldEscalatePhase(tsState)).toBe(true);

      // file_not_found has limit of 1
      const fileState = createErrorState('sig', 'file_not_found');
      fileState.attemptsThisPhase = 1;
      expect(shouldEscalatePhase(fileState)).toBe(true);
    });

    it('should use default limit for unknown categories', async () => {
      const { shouldEscalatePhase, createErrorState } = await import('../automation/fix-loop.js');

      const state = createErrorState('sig', 'unknown');
      // Default limit is 2
      state.attemptsThisPhase = 1;
      expect(shouldEscalatePhase(state)).toBe(false);

      state.attemptsThisPhase = 2;
      expect(shouldEscalatePhase(state)).toBe(true);
    });
  });

  describe('buildFixContext', () => {
    it('should build basic context for phase 1', async () => {
      const { buildFixContext, createErrorState } = await import('../automation/fix-loop.js');

      const state = createErrorState('sig', 'npm_install');
      state.attemptsThisPhase = 1;
      state.totalAttempts = 1;

      const context = buildFixContext(state, 'npm ERR! ERESOLVE');

      expect(context).toContain('[GoodVibes Fix Loop - Phase 1/3]');
      expect(context).toContain('Error: npm ERR! ERESOLVE');
      expect(context).toContain('Attempt: 2 this phase');
      expect(context).toContain('Total attempts: 1');
    });

    it('should include official docs in phase 2', async () => {
      const { buildFixContext, createErrorState } = await import('../automation/fix-loop.js');

      const state = createErrorState('sig', 'npm_install');
      state.phase = 2;
      state.officialDocsContent = 'Official documentation content here';

      const context = buildFixContext(state, 'npm error');

      expect(context).toContain('--- Official Documentation ---');
      expect(context).toContain('Official documentation content here');
    });

    it('should not include official docs in phase 1', async () => {
      const { buildFixContext, createErrorState } = await import('../automation/fix-loop.js');

      const state = createErrorState('sig', 'npm_install');
      state.phase = 1;
      state.officialDocsContent = 'Official documentation content here';

      const context = buildFixContext(state, 'npm error');

      expect(context).not.toContain('--- Official Documentation ---');
    });

    it('should include community solutions in phase 3', async () => {
      const { buildFixContext, createErrorState } = await import('../automation/fix-loop.js');

      const state = createErrorState('sig', 'npm_install');
      state.phase = 3;
      state.unofficialDocsContent = 'Stack Overflow solution here';

      const context = buildFixContext(state, 'npm error');

      expect(context).toContain('--- Community Solutions ---');
      expect(context).toContain('Stack Overflow solution here');
    });

    it('should not include community solutions before phase 3', async () => {
      const { buildFixContext, createErrorState } = await import('../automation/fix-loop.js');

      const state = createErrorState('sig', 'npm_install');
      state.phase = 2;
      state.unofficialDocsContent = 'Stack Overflow solution here';

      const context = buildFixContext(state, 'npm error');

      expect(context).not.toContain('--- Community Solutions ---');
    });

    it('should include previously attempted strategies', async () => {
      const { buildFixContext, createErrorState } = await import('../automation/fix-loop.js');

      const state = createErrorState('sig', 'npm_install');
      state.fixStrategiesAttempted = [
        { phase: 1, strategy: 'Cleared node_modules', succeeded: false, timestamp: '2025-01-01' },
        { phase: 1, strategy: 'Updated npm', succeeded: false, timestamp: '2025-01-01' },
      ];

      const context = buildFixContext(state, 'npm error');

      expect(context).toContain('--- Previously Attempted (failed) ---');
      expect(context).toContain('- Cleared node_modules');
      expect(context).toContain('- Updated npm');
      expect(context).toContain('Try a DIFFERENT approach.');
    });

    it('should truncate long error messages', async () => {
      const { buildFixContext, createErrorState } = await import('../automation/fix-loop.js');

      const state = createErrorState('sig', 'npm_install');
      const longError = 'x'.repeat(500);

      const context = buildFixContext(state, longError);

      // Error should be truncated to 200 chars
      expect(context).toContain('Error: ' + 'x'.repeat(200));
      expect(context).not.toContain('x'.repeat(201));
    });

    it('should show only recent 3 fix attempts', async () => {
      const { buildFixContext, createErrorState } = await import('../automation/fix-loop.js');

      const state = createErrorState('sig', 'npm_install');
      state.fixStrategiesAttempted = [
        { phase: 1, strategy: 'Strategy 1', succeeded: false, timestamp: '2025-01-01' },
        { phase: 1, strategy: 'Strategy 2', succeeded: false, timestamp: '2025-01-01' },
        { phase: 1, strategy: 'Strategy 3', succeeded: false, timestamp: '2025-01-01' },
        { phase: 1, strategy: 'Strategy 4', succeeded: false, timestamp: '2025-01-01' },
        { phase: 1, strategy: 'Strategy 5', succeeded: false, timestamp: '2025-01-01' },
      ];

      const context = buildFixContext(state, 'npm error');

      // Should show last 3 only
      expect(context).not.toContain('Strategy 1');
      expect(context).not.toContain('Strategy 2');
      expect(context).toContain('Strategy 3');
      expect(context).toContain('Strategy 4');
      expect(context).toContain('Strategy 5');
    });
  });
});

// ============================================
// git-operations.ts tests (requires mocking)
// ============================================
describe('git-operations', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isGitRepo', () => {
    it('should return true when .git directory exists', async () => {
      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(true),
      }));

      const { isGitRepo } = await import('../automation/git-operations.js');
      const result = await isGitRepo('/test/project');

      expect(result).toBe(true);
    });

    it('should return false when .git directory does not exist', async () => {
      vi.doMock('../shared/file-utils.js', () => ({
        fileExists: vi.fn().mockResolvedValue(false),
      }));

      const { isGitRepo } = await import('../automation/git-operations.js');
      const result = await isGitRepo('/test/project');

      expect(result).toBe(false);
    });
  });

  describe('detectMainBranch', () => {
    it('should return "main" when main branch exists', async () => {
      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(null, { stdout: 'abc123\n', stderr: '' });
        }),
        spawn: vi.fn(),
      }));

      const { detectMainBranch } = await import('../automation/git-operations.js');
      const result = await detectMainBranch('/test/project');

      expect(result).toBe('main');
    });

    it('should return "master" when only master branch exists', async () => {
      let callCount = 0;
      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callCount++;
          if (callCount === 1) {
            callback(new Error('fatal: Needed a single revision'), { stdout: '', stderr: '' });
          } else {
            callback(null, { stdout: 'abc123\n', stderr: '' });
          }
        }),
        spawn: vi.fn(),
      }));

      const { detectMainBranch } = await import('../automation/git-operations.js');
      const result = await detectMainBranch('/test/project');

      expect(result).toBe('master');
    });

    it('should default to "main" when neither branch exists', async () => {
      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(new Error('fatal: Needed a single revision'), { stdout: '', stderr: '' });
        }),
        spawn: vi.fn(),
      }));

      const { detectMainBranch } = await import('../automation/git-operations.js');
      const result = await detectMainBranch('/test/project');

      expect(result).toBe('main');
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should return true when there are uncommitted changes', async () => {
      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(null, { stdout: ' M src/file.ts\n', stderr: '' });
        }),
        spawn: vi.fn(),
      }));

      const { hasUncommittedChanges } = await import('../automation/git-operations.js');
      const result = await hasUncommittedChanges('/test/project');

      expect(result).toBe(true);
    });

    it('should return false when working directory is clean', async () => {
      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(null, { stdout: '', stderr: '' });
        }),
        spawn: vi.fn(),
      }));

      const { hasUncommittedChanges } = await import('../automation/git-operations.js');
      const result = await hasUncommittedChanges('/test/project');

      expect(result).toBe(false);
    });

    it('should return false when git command fails', async () => {
      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(new Error('not a git repository'), { stdout: '', stderr: '' });
        }),
        spawn: vi.fn(),
      }));

      const { hasUncommittedChanges } = await import('../automation/git-operations.js');
      const result = await hasUncommittedChanges('/test/project');

      expect(result).toBe(false);
    });
  });

  describe('sanitizeForGit (via createCheckpoint)', () => {
    it('should sanitize shell metacharacters from commit messages', async () => {
      const spawnEvents = new Map<string, (...args: unknown[]) => void>();
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          spawnEvents.set(event, handler);
          if (event === 'close') {
            setTimeout(() => handler(0), 0);
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(null, { stdout: ' M file.ts\n', stderr: '' });
        }),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } = await import('../automation/git-operations.js');

      // Attempt to inject shell command via message
      await createCheckpoint('/test/project', 'test; rm -rf /');

      // spawn should be called with sanitized message (semicolon removed)
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['commit', '-m', expect.stringContaining('test rm -rf ')],
        expect.any(Object)
      );
    });

    it('should remove backticks from commit messages', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'close') {
            setTimeout(() => handler(0), 0);
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(null, { stdout: ' M file.ts\n', stderr: '' });
        }),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } = await import('../automation/git-operations.js');

      await createCheckpoint('/test/project', 'test `whoami`');

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['commit', '-m', expect.stringContaining('test whoami')],
        expect.any(Object)
      );
    });

    it('should remove dollar signs and special characters', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'close') {
            setTimeout(() => handler(0), 0);
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(null, { stdout: ' M file.ts\n', stderr: '' });
        }),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } = await import('../automation/git-operations.js');

      await createCheckpoint('/test/project', 'test $HOME $(pwd) ${USER}');

      // Should have removed $, (, ), {, }
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['commit', '-m', expect.stringMatching(/test\s+HOME\s+pwd\s+USER/)],
        expect.any(Object)
      );
    });
  });

  describe('execGit', () => {
    it('should return trimmed output on success', async () => {
      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(null, { stdout: '  result  \n', stderr: '' });
        }),
        spawn: vi.fn(),
      }));

      const { execGit } = await import('../automation/git-operations.js');
      const result = await execGit('git status', '/test/project');

      expect(result).toBe('result');
    });

    it('should return null on failure', async () => {
      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(new Error('git error'), { stdout: '', stderr: '' });
        }),
        spawn: vi.fn(),
      }));

      const { execGit } = await import('../automation/git-operations.js');
      const result = await execGit('git invalid-command', '/test/project');

      expect(result).toBeNull();
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name', async () => {
      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(null, { stdout: 'feature/test\n', stderr: '' });
        }),
        spawn: vi.fn(),
      }));

      const { getCurrentBranch } = await import('../automation/git-operations.js');
      const result = await getCurrentBranch('/test/project');

      expect(result).toBe('feature/test');
    });

    it('should return null on detached HEAD', async () => {
      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(new Error('not on a branch'), { stdout: '', stderr: '' });
        }),
        spawn: vi.fn(),
      }));

      const { getCurrentBranch } = await import('../automation/git-operations.js');
      const result = await getCurrentBranch('/test/project');

      expect(result).toBeNull();
    });
  });

  describe('getUncommittedFiles', () => {
    it('should return list of modified files', async () => {
      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          // Git porcelain format: XY<space>filename where X=index status, Y=worktree status
          // ' M' = unmodified in index, modified in worktree
          // '??' = untracked
          callback(null, { stdout: ' M src/file1.ts\n?? src/file2.ts', stderr: '' });
        }),
        spawn: vi.fn(),
      }));

      const { getUncommittedFiles } = await import('../automation/git-operations.js');
      const result = await getUncommittedFiles('/test/project');

      // slice(3) removes first 3 chars: X, Y, and space
      expect(result).toEqual(['src/file1.ts', 'src/file2.ts']);
    });

    it('should return empty array when no changes', async () => {
      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(null, { stdout: '', stderr: '' });
        }),
        spawn: vi.fn(),
      }));

      const { getUncommittedFiles } = await import('../automation/git-operations.js');
      const result = await getUncommittedFiles('/test/project');

      expect(result).toEqual([]);
    });

    it('should return empty array when git command fails', async () => {
      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(new Error('not a git repo'), { stdout: '', stderr: '' });
        }),
        spawn: vi.fn(),
      }));

      const { getUncommittedFiles } = await import('../automation/git-operations.js');
      const result = await getUncommittedFiles('/test/project');

      expect(result).toEqual([]);
    });
  });

  describe('createCheckpoint', () => {
    it('should return false when no uncommitted changes', async () => {
      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(null, { stdout: '', stderr: '' });
        }),
        spawn: vi.fn(),
      }));

      const { createCheckpoint } = await import('../automation/git-operations.js');
      const result = await createCheckpoint('/test/project', 'test checkpoint');

      expect(result).toBe(false);
    });

    it('should create checkpoint when there are changes', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'close') {
            setTimeout(() => handler(0), 0);
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(null, { stdout: ' M file.ts\n', stderr: '' });
        }),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } = await import('../automation/git-operations.js');
      const result = await createCheckpoint('/test/project', 'test checkpoint');

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['commit', '-m', expect.stringContaining('checkpoint: test checkpoint')],
        expect.any(Object)
      );
    });

    it('should return false when commit fails', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'close') {
            setTimeout(() => handler(1), 0); // Exit code 1 = failure
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(null, { stdout: ' M file.ts\n', stderr: '' });
        }),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } = await import('../automation/git-operations.js');
      const result = await createCheckpoint('/test/project', 'test checkpoint');

      expect(result).toBe(false);
    });

    it('should handle spawn error event', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'error') {
            setTimeout(() => handler(new Error('spawn error')), 0);
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(null, { stdout: ' M file.ts\n', stderr: '' });
        }),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } = await import('../automation/git-operations.js');
      const result = await createCheckpoint('/test/project', 'test checkpoint');

      expect(result).toBe(false);
    });
  });

  describe('createFeatureBranch', () => {
    it('should create and checkout feature branch with sanitized name', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'close') {
            setTimeout(() => handler(0), 0);
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { createFeatureBranch } = await import('../automation/git-operations.js');
      const result = await createFeatureBranch('/test/project', 'Add User Authentication');

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
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'close') {
            setTimeout(() => handler(0), 0);
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { createFeatureBranch } = await import('../automation/git-operations.js');
      await createFeatureBranch('/test/project', 'Fix: Bug #123 & Issue!');

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['checkout', '-b', 'feature/fix-bug-123-issue'],
        expect.any(Object)
      );
    });

    it('should return false when branch creation fails', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'close') {
            setTimeout(() => handler(1), 0); // Exit code 1 = failure
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { createFeatureBranch } = await import('../automation/git-operations.js');
      const result = await createFeatureBranch('/test/project', 'test-feature');

      expect(result).toBe(false);
    });

    it('should handle spawn error event', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'error') {
            setTimeout(() => handler(new Error('spawn error')), 0);
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { createFeatureBranch } = await import('../automation/git-operations.js');
      const result = await createFeatureBranch('/test/project', 'test-feature');

      expect(result).toBe(false);
    });
  });

  describe('mergeFeatureBranch', () => {
    it('should merge feature branch into main and delete it', async () => {
      let callCount = 0;
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'close') {
            setTimeout(() => handler(0), 0);
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { mergeFeatureBranch } = await import('../automation/git-operations.js');
      const result = await mergeFeatureBranch('/test/project', 'feature/test', 'main');

      expect(result).toBe(true);
      // Should be called 3 times: checkout, merge, delete
      expect(mockSpawn).toHaveBeenCalledTimes(3);
      expect(mockSpawn).toHaveBeenNthCalledWith(1, 'git', ['checkout', 'main'], expect.any(Object));
      expect(mockSpawn).toHaveBeenNthCalledWith(2, 'git', ['merge', 'feature/test', '--no-ff', '-m', 'Merge feature/test'], expect.any(Object));
      expect(mockSpawn).toHaveBeenNthCalledWith(3, 'git', ['branch', '-d', 'feature/test'], expect.any(Object));
    });

    it('should sanitize branch names to prevent injection', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'close') {
            setTimeout(() => handler(0), 0);
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { mergeFeatureBranch } = await import('../automation/git-operations.js');
      await mergeFeatureBranch('/test/project', 'feature/test; rm -rf /', 'main; whoami');

      // Verify shell metacharacters are removed
      expect(mockSpawn).toHaveBeenNthCalledWith(1, 'git', ['checkout', expect.stringMatching(/^main\s+whoami$/)], expect.any(Object));
      expect(mockSpawn).toHaveBeenNthCalledWith(2, 'git', ['merge', expect.stringMatching(/^featuretest\s+rm\s+-rf\s+$/), '--no-ff', '-m', expect.any(String)], expect.any(Object));
    });

    it('should return false when checkout fails', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'close') {
            setTimeout(() => handler(1), 0); // Checkout fails
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { mergeFeatureBranch } = await import('../automation/git-operations.js');
      const result = await mergeFeatureBranch('/test/project', 'feature/test', 'main');

      expect(result).toBe(false);
      // Should only call checkout, not merge or delete
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('should return false when merge fails', async () => {
      let callCount = 0;
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'close') {
            callCount++;
            const code = callCount === 1 ? 0 : 1; // Checkout succeeds, merge fails
            setTimeout(() => handler(code), 0);
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { mergeFeatureBranch } = await import('../automation/git-operations.js');
      const result = await mergeFeatureBranch('/test/project', 'feature/test', 'main');

      expect(result).toBe(false);
      // Should call checkout and merge, not delete
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('should return false when branch deletion fails', async () => {
      let callCount = 0;
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'close') {
            callCount++;
            const code = callCount <= 2 ? 0 : 1; // Checkout and merge succeed, delete fails
            setTimeout(() => handler(code), 0);
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { mergeFeatureBranch } = await import('../automation/git-operations.js');
      const result = await mergeFeatureBranch('/test/project', 'feature/test', 'main');

      expect(result).toBe(false);
      // All three operations should be called
      expect(mockSpawn).toHaveBeenCalledTimes(3);
    });

    it('should handle spawn error event', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'error') {
            setTimeout(() => handler(new Error('spawn error')), 0);
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { mergeFeatureBranch } = await import('../automation/git-operations.js');
      const result = await mergeFeatureBranch('/test/project', 'feature/test', 'main');

      expect(result).toBe(false);
    });
  });

  describe('spawnAsync timeout and error handling', () => {
    it('should handle timeout in createCheckpoint', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => {
        const child = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(),
          kill: vi.fn(),
        };

        // Don't trigger close event, simulating a hang
        return child;
      });

      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callback(null, { stdout: ' M file.ts\n', stderr: '' });
        }),
        spawn: mockSpawn,
      }));

      const { createCheckpoint } = await import('../automation/git-operations.js');

      // This should timeout and return false
      const result = await createCheckpoint('/test/project', 'test checkpoint');

      expect(result).toBe(false);
    });

    it('should collect stdout data in spawnAsync', async () => {
      let onDataCallback: ((data: Buffer) => void) | null = null;

      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: {
          on: vi.fn().mockImplementation((event: string, handler: (data: Buffer) => void) => {
            if (event === 'data') {
              onDataCallback = handler;
              setTimeout(() => handler(Buffer.from('stdout data')), 0);
            }
          })
        },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'close') {
            setTimeout(() => handler(0), 10);
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { createFeatureBranch } = await import('../automation/git-operations.js');
      await createFeatureBranch('/test/project', 'test');

      expect(onDataCallback).toBeTruthy();
    });

    it('should collect stderr data in spawnAsync', async () => {
      let onDataCallback: ((data: Buffer) => void) | null = null;

      const mockSpawn = vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn().mockImplementation((event: string, handler: (data: Buffer) => void) => {
            if (event === 'data') {
              onDataCallback = handler;
              setTimeout(() => handler(Buffer.from('stderr data')), 0);
            }
          })
        },
        on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'close') {
            setTimeout(() => handler(0), 10);
          }
        }),
        kill: vi.fn(),
      }));

      vi.doMock('child_process', () => ({
        exec: vi.fn(),
        spawn: mockSpawn,
      }));

      const { createFeatureBranch } = await import('../automation/git-operations.js');
      await createFeatureBranch('/test/project', 'test');

      expect(onDataCallback).toBeTruthy();
    });
  });
});

// ============================================
// build-runner.ts tests
// ============================================
describe('build-runner', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectBuildCommand', () => {
    it('should detect Next.js project with next.config.js', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockImplementation((p: string) =>
          p.includes('next.config.js') ? Promise.resolve() : Promise.reject(new Error('ENOENT'))
        ),
      }));

      const { detectBuildCommand } = await import('../automation/build-runner.js');
      const result = await detectBuildCommand('/test/project');

      expect(result).toBe('npm run build');
    });

    it('should detect Next.js project with next.config.mjs', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockImplementation((p: string) =>
          p.includes('next.config.mjs') ? Promise.resolve() : Promise.reject(new Error('ENOENT'))
        ),
      }));

      const { detectBuildCommand } = await import('../automation/build-runner.js');
      const result = await detectBuildCommand('/test/project');

      expect(result).toBe('npm run build');
    });

    it('should detect Next.js project with next.config.ts', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockImplementation((p: string) =>
          p.includes('next.config.ts') ? Promise.resolve() : Promise.reject(new Error('ENOENT'))
        ),
      }));

      const { detectBuildCommand } = await import('../automation/build-runner.js');
      const result = await detectBuildCommand('/test/project');

      expect(result).toBe('npm run build');
    });

    it('should detect Vite project with vite.config.ts', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockImplementation((p: string) =>
          p.includes('vite.config.ts') ? Promise.resolve() : Promise.reject(new Error('ENOENT'))
        ),
      }));

      const { detectBuildCommand } = await import('../automation/build-runner.js');
      const result = await detectBuildCommand('/test/project');

      expect(result).toBe('npm run build');
    });

    it('should detect Vite project with vite.config.js', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockImplementation((p: string) =>
          p.includes('vite.config.js') ? Promise.resolve() : Promise.reject(new Error('ENOENT'))
        ),
      }));

      const { detectBuildCommand } = await import('../automation/build-runner.js');
      const result = await detectBuildCommand('/test/project');

      expect(result).toBe('npm run build');
    });

    it('should return default command for unknown projects', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockRejectedValue(new Error('ENOENT')),
      }));

      const { detectBuildCommand } = await import('../automation/build-runner.js');
      const result = await detectBuildCommand('/test/project');

      expect(result).toBe('npm run build');
    });
  });

  describe('parseBuildErrors (via runBuild)', () => {
    it('should parse TypeScript errors from build output', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockRejectedValue(new Error('ENOENT')),
      }));

      // Mock shared module for extractErrorOutput
      vi.doMock('../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockImplementation((error: Error & { stdout?: Buffer; stderr?: Buffer }) => {
          return error.stdout?.toString() || error.stderr?.toString() || error.message;
        }),
        fileExists: vi.fn().mockResolvedValue(false),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          const error = new Error('Build failed') as Error & { stdout?: Buffer; stderr?: Buffer };
          error.stdout = Buffer.from('');
          error.stderr = Buffer.from('src/index.ts(10,5): error TS2304: Cannot find name \'foo\'');
          throw error;
        }),
      }));

      const { runBuild } = await import('../automation/build-runner.js');
      const result = await runBuild('/test/project');

      expect(result.passed).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        file: 'src/index.ts',
        line: 10,
        message: "Cannot find name 'foo'",
      });
    });

    it('should parse multiple TypeScript errors', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockRejectedValue(new Error('ENOENT')),
      }));

      // Mock shared module for extractErrorOutput
      vi.doMock('../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockImplementation((error: Error & { stdout?: Buffer; stderr?: Buffer }) => {
          return error.stdout?.toString() || error.stderr?.toString() || error.message;
        }),
        fileExists: vi.fn().mockResolvedValue(false),
      }));

      const tsErrors = `src/a.ts(5,3): error TS2322: Type 'string' is not assignable
src/b.ts(20,10): error TS2304: Cannot find name 'bar'`;

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          const error = new Error('Build failed') as Error & { stdout?: Buffer; stderr?: Buffer };
          error.stdout = Buffer.from(tsErrors);
          error.stderr = Buffer.from('');
          throw error;
        }),
      }));

      const { runBuild } = await import('../automation/build-runner.js');
      const result = await runBuild('/test/project');

      expect(result.passed).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].file).toBe('src/a.ts');
      expect(result.errors[0].line).toBe(5);
      expect(result.errors[1].file).toBe('src/b.ts');
      expect(result.errors[1].line).toBe(20);
    });

    it('should return empty errors for non-TypeScript output', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockRejectedValue(new Error('ENOENT')),
      }));

      // Mock shared module for extractErrorOutput
      vi.doMock('../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockImplementation((error: Error & { stdout?: Buffer; stderr?: Buffer }) => {
          return error.stdout?.toString() || error.stderr?.toString() || error.message;
        }),
        fileExists: vi.fn().mockResolvedValue(false),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          const error = new Error('Build failed') as Error & { stdout?: Buffer; stderr?: Buffer };
          error.stdout = Buffer.from('Some other error format');
          error.stderr = Buffer.from('');
          throw error;
        }),
      }));

      const { runBuild } = await import('../automation/build-runner.js');
      const result = await runBuild('/test/project');

      expect(result.passed).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('should return success when build passes', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockRejectedValue(new Error('ENOENT')),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(Buffer.from('Build successful')),
      }));

      const { runBuild } = await import('../automation/build-runner.js');
      const result = await runBuild('/test/project');

      expect(result.passed).toBe(true);
      expect(result.summary).toBe('Build passed');
      expect(result.errors).toHaveLength(0);
    });
  });
});

// ============================================
// test-runner.ts tests
// ============================================
describe('test-runner', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findTestsForFile', () => {
    it('should find .test.ts files for source file', async () => {
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockImplementation((p: string) => p.endsWith('.test.ts')),
      }));

      const { findTestsForFile } = await import('../automation/test-runner.js');
      const result = findTestsForFile('src/utils/format.ts');

      expect(result).toContain('src/utils/format.test.ts');
    });

    it('should find .test.tsx files for TSX source', async () => {
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockImplementation((p: string) => p.endsWith('.test.tsx')),
      }));

      const { findTestsForFile } = await import('../automation/test-runner.js');
      const result = findTestsForFile('src/components/Button.tsx');

      expect(result).toContain('src/components/Button.test.tsx');
    });

    it('should find .spec.ts files', async () => {
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockImplementation((p: string) => p.endsWith('.spec.ts')),
      }));

      const { findTestsForFile } = await import('../automation/test-runner.js');
      const result = findTestsForFile('src/utils/format.ts');

      expect(result).toContain('src/utils/format.spec.ts');
    });

    it('should find tests in __tests__ directory', async () => {
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockImplementation((p: string) => p.includes('__tests__')),
      }));

      const { findTestsForFile } = await import('../automation/test-runner.js');
      const result = findTestsForFile('src/utils/format.ts');

      expect(result.some(f => f.includes('__tests__'))).toBe(true);
    });

    it('should return empty array when no tests exist', async () => {
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockReturnValue(false),
      }));

      const { findTestsForFile } = await import('../automation/test-runner.js');
      const result = findTestsForFile('src/utils/format.ts');

      expect(result).toEqual([]);
    });

    it('should find multiple test files if they exist', async () => {
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockImplementation((p: string) => {
          return p.endsWith('.test.ts') || p.endsWith('.spec.ts');
        }),
      }));

      const { findTestsForFile } = await import('../automation/test-runner.js');
      const result = findTestsForFile('src/utils/format.ts');

      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('parseTestFailures (via runTests)', () => {
    it('should parse FAIL lines from test output', async () => {
      const testOutput = `FAIL src/utils/format.test.ts
  Test case failed
  Expected: true
  Received: false`;

      // Mock shared module for extractErrorOutput
      vi.doMock('../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockImplementation((error: Error & { stdout?: Buffer; stderr?: Buffer }) => {
          return error.stdout?.toString() || error.stderr?.toString() || error.message;
        }),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          const error = new Error('Tests failed') as Error & { stdout?: Buffer; stderr?: Buffer };
          error.stdout = Buffer.from(testOutput);
          error.stderr = Buffer.from('');
          throw error;
        }),
      }));

      const { runTests } = await import('../automation/test-runner.js');
      const result = runTests(['src/utils/format.test.ts'], '/test/project');

      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].testFile).toBe('src/utils/format.test.ts');
    });

    it('should parse multiple test failures', async () => {
      const testOutput = `FAIL src/a.test.ts
  Error in test a
FAIL src/b.test.tsx
  Error in test b`;

      // Mock shared module for extractErrorOutput
      vi.doMock('../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockImplementation((error: Error & { stdout?: Buffer; stderr?: Buffer }) => {
          return error.stdout?.toString() || error.stderr?.toString() || error.message;
        }),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          const error = new Error('Tests failed') as Error & { stdout?: Buffer; stderr?: Buffer };
          error.stdout = Buffer.from(testOutput);
          error.stderr = Buffer.from('');
          throw error;
        }),
      }));

      const { runTests } = await import('../automation/test-runner.js');
      const result = runTests(['src/a.test.ts', 'src/b.test.tsx'], '/test/project');

      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(2);
      expect(result.failures[0].testFile).toBe('src/a.test.ts');
      expect(result.failures[1].testFile).toBe('src/b.test.tsx');
    });

    it('should include context lines in error (5 lines total)', async () => {
      // FAILURE_CONTEXT_LINES = 5 means 5 lines total from FAIL line
      const testOutput = `FAIL src/test.test.ts
  line 1
  line 2
  line 3
  line 4
  line 5
  line 6`;

      // Mock shared module for extractErrorOutput
      vi.doMock('../shared/index.js', () => ({
        extractErrorOutput: vi.fn().mockImplementation((error: Error & { stdout?: Buffer; stderr?: Buffer }) => {
          return error.stdout?.toString() || error.stderr?.toString() || error.message;
        }),
      }));

      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          const error = new Error('Tests failed') as Error & { stdout?: Buffer; stderr?: Buffer };
          error.stdout = Buffer.from(testOutput);
          error.stderr = Buffer.from('');
          throw error;
        }),
      }));

      const { runTests } = await import('../automation/test-runner.js');
      const result = runTests(['src/test.test.ts'], '/test/project');

      // Should include FAIL line + 4 more lines (5 total)
      expect(result.failures[0].error).toContain('FAIL src/test.test.ts');
      expect(result.failures[0].error).toContain('line 1');
      expect(result.failures[0].error).toContain('line 4');
      // line 5 and line 6 should NOT be included (only 5 lines total)
      expect(result.failures[0].error).not.toContain('line 5');
    });

    it('should return success when tests pass', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue(Buffer.from('All tests passed')),
      }));

      const { runTests } = await import('../automation/test-runner.js');
      const result = runTests(['src/test.test.ts'], '/test/project');

      expect(result.passed).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('should handle empty test file list', async () => {
      const { runTests } = await import('../automation/test-runner.js');
      const result = runTests([], '/test/project');

      expect(result.passed).toBe(true);
      expect(result.summary).toBe('No tests to run');
      expect(result.failures).toHaveLength(0);
    });
  });
});
