/**
 * Unit tests for context/formatter.ts
 *
 * Tests all exported functions with 100% line and branch coverage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { formatEnvStatus } from '../../context/environment.js';
import { formatFolderAnalysis } from '../../context/folder-analyzer.js';
import {
  formatContext,
  formatMinimalContext,
  type GatheredContext,
  type FormattedContext,
} from '../../context/formatter.js';
import { formatGitContext } from '../../context/git-context.js';
import { formatHealthStatus } from '../../context/health-checker.js';
import { formatStackInfo } from '../../context/stack-detector.js';
import { formatTodos } from '../../context/todo-scanner.js';
import { formatMemoryContext } from '../../memory/index.js';

import type { EnvStatus } from '../../context/environment.js';
import type { FolderAnalysis } from '../../context/folder-analyzer.js';
import type { GitContext } from '../../context/git-context.js';
import type { HealthStatus } from '../../context/health-checker.js';
import type { StackInfo } from '../../context/stack-detector.js';
import type { TodoItem } from '../../context/todo-scanner.js';
import type { ProjectMemory } from '../../types/memory.js';

// Mock all external dependencies
vi.mock('../../context/stack-detector.js');
vi.mock('../../context/git-context.js');
vi.mock('../../memory/index.js');
vi.mock('../../context/environment.js');
vi.mock('../../context/todo-scanner.js');
vi.mock('../../context/health-checker.js');
vi.mock('../../context/folder-analyzer.js');

// Type the mocked functions
const mockedFormatStackInfo = vi.mocked(formatStackInfo);
const mockedFormatGitContext = vi.mocked(formatGitContext);
const mockedFormatMemoryContext = vi.mocked(formatMemoryContext);
const mockedFormatEnvStatus = vi.mocked(formatEnvStatus);
const mockedFormatTodos = vi.mocked(formatTodos);
const mockedFormatHealthStatus = vi.mocked(formatHealthStatus);
const mockedFormatFolderAnalysis = vi.mocked(formatFolderAnalysis);

describe('formatter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set default return values to empty strings
    mockedFormatStackInfo.mockReturnValue('');
    mockedFormatGitContext.mockReturnValue('');
    mockedFormatMemoryContext.mockReturnValue('');
    mockedFormatEnvStatus.mockReturnValue('');
    mockedFormatTodos.mockReturnValue('');
    mockedFormatHealthStatus.mockReturnValue('');
    mockedFormatFolderAnalysis.mockReturnValue('');
  });

  /** Helper to create a complete GatheredContext with sensible defaults */
  function createMockGatheredContext(
    overrides?: Partial<GatheredContext>
  ): GatheredContext {
    return {
      stack: {
        frameworks: [],
        packageManager: null,
        hasTypeScript: false,
        isStrict: false,
      },
      git: {
        isRepo: false,
        branch: null,
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        lastCommit: null,
        recentCommits: [],
        aheadBehind: null,
      },
      memory: {
        decisions: [],
        patterns: [],
        failures: [],
        preferences: [],
      },
      environment: {
        hasEnvFile: false,
        hasEnvExample: false,
        missingVars: [],
        warnings: [],
      },
      todos: [],
      health: {
        checks: [],
      },
      folderStructure: {
        srcDir: null,
        testDir: null,
        hasConfigFiles: false,
        fileCount: 0,
        directories: [],
      },
      ...overrides,
    };
  }

  describe('formatContext', () => {
    it('should format complete context with all sections', () => {
      mockedFormatStackInfo.mockReturnValue('Stack: Next.js, TypeScript');
      mockedFormatFolderAnalysis.mockReturnValue('Architecture: src/, tests/');
      mockedFormatGitContext.mockReturnValue('Git: main branch, clean');
      mockedFormatHealthStatus.mockReturnValue('Health: All good');
      mockedFormatEnvStatus.mockReturnValue('Environment: .env present');
      mockedFormatTodos.mockReturnValue('TODOs: 3 items');
      mockedFormatMemoryContext.mockReturnValue('Memory: 2 decisions');

      const context = createMockGatheredContext({
        stack: {
          frameworks: ['Next.js', 'TypeScript'],
          packageManager: 'pnpm',
          hasTypeScript: true,
          isStrict: true,
        },
        git: {
          isRepo: true,
          branch: 'main',
          hasUncommittedChanges: false,
          uncommittedFileCount: 0,
          lastCommit: null,
          recentCommits: [],
          aheadBehind: null,
        },
      });

      const result = formatContext(context);

      expect(result.full).toContain('# Project Context');
      expect(result.full).toContain('## Tech Stack');
      expect(result.full).toContain('Stack: Next.js, TypeScript');
      expect(result.full).toContain('## Architecture');
      expect(result.full).toContain('## Git Status');
      expect(result.full).toContain('## Project Health');
      expect(result.full).toContain('## Environment');
      expect(result.full).toContain('## Code TODOs');
      expect(result.full).toContain('## Project Memory');
      expect(result.summary).toContain('Next.js + TypeScript');
      expect(result.hasIssues).toBe(false);
      expect(result.issueCount).toBe(0);
    });

    it('should skip sections with no formatted output', () => {
      mockedFormatStackInfo.mockReturnValue('');
      mockedFormatFolderAnalysis.mockReturnValue('');
      mockedFormatGitContext.mockReturnValue('');
      mockedFormatHealthStatus.mockReturnValue('');
      mockedFormatEnvStatus.mockReturnValue('');
      mockedFormatTodos.mockReturnValue('');
      mockedFormatMemoryContext.mockReturnValue('');

      const context = createMockGatheredContext();
      const result = formatContext(context);

      expect(result.full).toContain('# Project Context');
      expect(result.full).not.toContain('## Tech Stack');
      expect(result.full).not.toContain('## Architecture');
      expect(result.full).not.toContain('## Git Status');
      expect(result.full).not.toContain('## Project Health');
      expect(result.full).not.toContain('## Environment');
      expect(result.full).not.toContain('## Code TODOs');
      expect(result.full).not.toContain('## Project Memory');
    });

    it('should count health check warnings and errors as issues', () => {
      mockedFormatHealthStatus.mockReturnValue('Health: 2 warnings');

      const context = createMockGatheredContext({
        health: {
          checks: [
            {
              check: 'dependencies',
              status: 'warning',
              message: 'Missing node_modules',
            },
            { check: 'typescript', status: 'error', message: 'TS errors' },
            { check: 'linter', status: 'info', message: 'All good' },
          ],
        },
      });

      const result = formatContext(context);

      expect(result.issueCount).toBe(2);
      expect(result.hasIssues).toBe(true);
      expect(result.summary).toContain('2 issue(s) to review');
    });

    it('should count missing environment variables as issues', () => {
      mockedFormatEnvStatus.mockReturnValue('Environment: Missing vars');

      const context = createMockGatheredContext({
        environment: {
          hasEnvFile: true,
          hasEnvExample: true,
          missingVars: ['API_KEY', 'DATABASE_URL', 'SECRET'],
          warnings: ['Missing env vars: API_KEY, DATABASE_URL, SECRET'],
        },
      });

      const result = formatContext(context);

      expect(result.issueCount).toBe(3);
      expect(result.hasIssues).toBe(true);
      expect(result.summary).toContain('3 issue(s) to review');
    });

    it('should count FIXME and BUG todos as issues', () => {
      mockedFormatTodos.mockReturnValue('TODOs: 5 items');

      const context = createMockGatheredContext({
        todos: [
          {
            file: 'a.ts',
            line: 1,
            type: 'TODO',
            text: 'Regular todo',
            priority: 'low',
          },
          {
            file: 'b.ts',
            line: 2,
            type: 'FIXME',
            text: 'Fix this',
            priority: 'high',
          },
          {
            file: 'c.ts',
            line: 3,
            type: 'BUG',
            text: 'Bug here',
            priority: 'high',
          },
          {
            file: 'd.ts',
            line: 4,
            type: 'HACK',
            text: 'Temporary hack',
            priority: 'medium',
          },
          {
            file: 'e.ts',
            line: 5,
            type: 'FIXME',
            text: 'Another fix',
            priority: 'high',
          },
        ],
      });

      const result = formatContext(context);

      expect(result.issueCount).toBe(3); // 2 FIXME + 1 BUG
      expect(result.hasIssues).toBe(true);
    });

    it('should combine multiple issue sources', () => {
      mockedFormatHealthStatus.mockReturnValue('Health: Issues');
      mockedFormatEnvStatus.mockReturnValue('Environment: Issues');
      mockedFormatTodos.mockReturnValue('TODOs: Issues');

      const context = createMockGatheredContext({
        health: {
          checks: [
            { check: 'deps', status: 'warning', message: 'Warning 1' },
            { check: 'ts', status: 'error', message: 'Error 1' },
          ],
        },
        environment: {
          hasEnvFile: true,
          hasEnvExample: true,
          missingVars: ['VAR1', 'VAR2'],
          warnings: ['Missing vars'],
        },
        todos: [
          {
            file: 'a.ts',
            line: 1,
            type: 'FIXME',
            text: 'Fix',
            priority: 'high',
          },
          { file: 'b.ts', line: 2, type: 'BUG', text: 'Bug', priority: 'high' },
        ],
      });

      const result = formatContext(context);

      expect(result.issueCount).toBe(6); // 2 health + 2 env + 2 todos
      expect(result.hasIssues).toBe(true);
      expect(result.summary).toContain('6 issue(s) to review');
    });

    it('should include up to 4 frameworks in summary', () => {
      const context = createMockGatheredContext({
        stack: {
          frameworks: ['Next.js', 'TypeScript', 'Tailwind', 'Prisma', 'tRPC'],
          packageManager: 'pnpm',
          hasTypeScript: true,
          isStrict: true,
        },
      });

      const result = formatContext(context);

      expect(result.summary).toBe('Next.js + TypeScript + Tailwind + Prisma');
      expect(result.summary).not.toContain('tRPC');
    });

    it('should include uncommitted changes in summary', () => {
      const context = createMockGatheredContext({
        stack: {
          frameworks: ['Vite'],
          packageManager: null,
          hasTypeScript: false,
          isStrict: false,
        },
        git: {
          isRepo: true,
          branch: 'feature',
          hasUncommittedChanges: true,
          uncommittedFileCount: 5,
          lastCommit: null,
          recentCommits: [],
          aheadBehind: null,
        },
      });

      const result = formatContext(context);

      expect(result.summary).toContain('Vite');
      expect(result.summary).toContain('5 uncommitted changes');
    });

    it('should not include uncommitted changes if repo is not a git repo', () => {
      const context = createMockGatheredContext({
        stack: {
          frameworks: ['React'],
          packageManager: null,
          hasTypeScript: false,
          isStrict: false,
        },
        git: {
          isRepo: false,
          branch: null,
          hasUncommittedChanges: false,
          uncommittedFileCount: 5,
          lastCommit: null,
          recentCommits: [],
          aheadBehind: null,
        },
      });

      const result = formatContext(context);

      expect(result.summary).toBe('React');
      expect(result.summary).not.toContain('uncommitted');
    });

    it('should not include uncommitted changes if branch is null', () => {
      const context = createMockGatheredContext({
        stack: {
          frameworks: ['Vue'],
          packageManager: null,
          hasTypeScript: false,
          isStrict: false,
        },
        git: {
          isRepo: true,
          branch: null,
          hasUncommittedChanges: true,
          uncommittedFileCount: 3,
          lastCommit: null,
          recentCommits: [],
          aheadBehind: null,
        },
      });

      const result = formatContext(context);

      expect(result.summary).toBe('Vue');
      expect(result.summary).not.toContain('uncommitted');
    });

    it('should not include uncommitted changes if count is zero', () => {
      const context = createMockGatheredContext({
        stack: {
          frameworks: ['Angular'],
          packageManager: null,
          hasTypeScript: false,
          isStrict: false,
        },
        git: {
          isRepo: true,
          branch: 'main',
          hasUncommittedChanges: false,
          uncommittedFileCount: 0,
          lastCommit: null,
          recentCommits: [],
          aheadBehind: null,
        },
      });

      const result = formatContext(context);

      expect(result.summary).toBe('Angular');
      expect(result.summary).not.toContain('uncommitted');
    });

    it('should use default summary for empty context', () => {
      const context = createMockGatheredContext();
      const result = formatContext(context);

      expect(result.summary).toBe('Project context loaded');
      expect(result.hasIssues).toBe(false);
      expect(result.issueCount).toBe(0);
    });

    it('should combine summary parts with pipe separator', () => {
      mockedFormatHealthStatus.mockReturnValue('Health: Warning');

      const context = createMockGatheredContext({
        stack: {
          frameworks: ['Express'],
          packageManager: null,
          hasTypeScript: false,
          isStrict: false,
        },
        git: {
          isRepo: true,
          branch: 'develop',
          hasUncommittedChanges: true,
          uncommittedFileCount: 2,
          lastCommit: null,
          recentCommits: [],
          aheadBehind: null,
        },
        health: {
          checks: [{ check: 'test', status: 'warning', message: 'Warning' }],
        },
      });

      const result = formatContext(context);

      expect(result.summary).toBe(
        'Express | 2 uncommitted changes | 1 issue(s) to review'
      );
    });

    it('should include proper spacing between sections', () => {
      mockedFormatStackInfo.mockReturnValue('Stack info');
      mockedFormatGitContext.mockReturnValue('Git info');
      mockedFormatMemoryContext.mockReturnValue('Memory info');

      const context = createMockGatheredContext();
      const result = formatContext(context);

      // Check that sections are separated by blank lines
      expect(result.full).toContain('Stack info\n\n## Git Status');
      expect(result.full).toContain('Git info\n\n## Project Memory');
      expect(result.full).toContain('Memory info\n');
      // Verify sections array structure creates proper spacing
      const sections = result.full.split('\n');
      expect(sections).toContain(''); // Should have empty lines for spacing
    });

    it('should handle when only stack info is present', () => {
      mockedFormatStackInfo.mockReturnValue('Stack: TypeScript');

      const context = createMockGatheredContext({
        stack: {
          frameworks: ['TypeScript'],
          packageManager: 'npm',
          hasTypeScript: true,
          isStrict: false,
        },
      });

      const result = formatContext(context);

      expect(result.full).toContain('## Tech Stack');
      expect(result.full).not.toContain('## Git Status');
      expect(result.summary).toBe('TypeScript');
    });

    it('should filter out info-level health checks from issue count', () => {
      const context = createMockGatheredContext({
        health: {
          checks: [
            { check: 'info1', status: 'info', message: 'Info message' },
            { check: 'info2', status: 'info', message: 'Another info' },
          ],
        },
      });

      const result = formatContext(context);

      expect(result.issueCount).toBe(0);
      expect(result.hasIssues).toBe(false);
    });

    it('should filter out regular TODO types from issue count', () => {
      const context = createMockGatheredContext({
        todos: [
          {
            file: 'a.ts',
            line: 1,
            type: 'TODO',
            text: 'Regular',
            priority: 'low',
          },
          {
            file: 'b.ts',
            line: 2,
            type: 'NOTE',
            text: 'Note',
            priority: 'low',
          },
          {
            file: 'c.ts',
            line: 3,
            type: 'HACK',
            text: 'Hack',
            priority: 'medium',
          },
        ],
      });

      const result = formatContext(context);

      expect(result.issueCount).toBe(0);
      expect(result.hasIssues).toBe(false);
    });
  });

  describe('formatMinimalContext', () => {
    it('should format minimal context with stack and branch', () => {
      const context = createMockGatheredContext({
        stack: {
          frameworks: ['Next.js', 'TypeScript'],
          packageManager: null,
          hasTypeScript: true,
          isStrict: false,
        },
        git: {
          isRepo: true,
          branch: 'main',
          hasUncommittedChanges: false,
          uncommittedFileCount: 0,
          lastCommit: null,
          recentCommits: [],
          aheadBehind: null,
        },
      });

      const result = formatMinimalContext(context);

      expect(result).toContain('Stack: Next.js, TypeScript');
      expect(result).toContain('Branch: main');
    });

    it('should limit to 3 frameworks max', () => {
      const context = createMockGatheredContext({
        stack: {
          frameworks: [
            'React',
            'TypeScript',
            'Tailwind',
            'Redux',
            'React Router',
          ],
          packageManager: null,
          hasTypeScript: true,
          isStrict: false,
        },
      });

      const result = formatMinimalContext(context);

      expect(result).toBe('Stack: React, TypeScript, Tailwind');
      expect(result).not.toContain('Redux');
      expect(result).not.toContain('React Router');
    });

    it('should include health warnings', () => {
      const context = createMockGatheredContext({
        health: {
          checks: [
            { check: 'dep', status: 'warning', message: 'Warning 1' },
            { check: 'ts', status: 'error', message: 'Error 1' },
            { check: 'info', status: 'info', message: 'Info' },
          ],
        },
      });

      const result = formatMinimalContext(context);

      expect(result).toBe('2 health warning(s)');
    });

    it('should include high-priority todos', () => {
      const context = createMockGatheredContext({
        todos: [
          {
            file: 'a.ts',
            line: 1,
            type: 'TODO',
            text: 'Regular',
            priority: 'low',
          },
          {
            file: 'b.ts',
            line: 2,
            type: 'FIXME',
            text: 'Fix',
            priority: 'high',
          },
          { file: 'c.ts', line: 3, type: 'BUG', text: 'Bug', priority: 'high' },
        ],
      });

      const result = formatMinimalContext(context);

      expect(result).toBe('2 high-priority TODO(s)');
    });

    it('should combine all parts with pipe separator', () => {
      const context = createMockGatheredContext({
        stack: {
          frameworks: ['Express'],
          packageManager: null,
          hasTypeScript: false,
          isStrict: false,
        },
        git: {
          isRepo: true,
          branch: 'develop',
          hasUncommittedChanges: false,
          uncommittedFileCount: 0,
          lastCommit: null,
          recentCommits: [],
          aheadBehind: null,
        },
        health: {
          checks: [{ check: 'test', status: 'warning', message: 'Warning' }],
        },
        todos: [
          {
            file: 'a.ts',
            line: 1,
            type: 'FIXME',
            text: 'Fix',
            priority: 'high',
          },
        ],
      });

      const result = formatMinimalContext(context);

      expect(result).toBe(
        'Stack: Express | Branch: develop | 1 health warning(s) | 1 high-priority TODO(s)'
      );
    });

    it('should return empty string for completely empty context', () => {
      const context = createMockGatheredContext();
      const result = formatMinimalContext(context);

      expect(result).toBe('');
    });

    it('should skip stack when no frameworks present', () => {
      const context = createMockGatheredContext({
        git: {
          isRepo: true,
          branch: 'main',
          hasUncommittedChanges: false,
          uncommittedFileCount: 0,
          lastCommit: null,
          recentCommits: [],
          aheadBehind: null,
        },
      });

      const result = formatMinimalContext(context);

      expect(result).toBe('Branch: main');
      expect(result).not.toContain('Stack:');
    });

    it('should skip branch when not a git repo', () => {
      const context = createMockGatheredContext({
        stack: {
          frameworks: ['Vue'],
          packageManager: null,
          hasTypeScript: false,
          isStrict: false,
        },
        git: {
          isRepo: false,
          branch: null,
          hasUncommittedChanges: false,
          uncommittedFileCount: 0,
          lastCommit: null,
          recentCommits: [],
          aheadBehind: null,
        },
      });

      const result = formatMinimalContext(context);

      expect(result).toBe('Stack: Vue');
      expect(result).not.toContain('Branch:');
    });

    it('should skip branch when branch is null even if repo exists', () => {
      const context = createMockGatheredContext({
        stack: {
          frameworks: ['Angular'],
          packageManager: null,
          hasTypeScript: false,
          isStrict: false,
        },
        git: {
          isRepo: true,
          branch: null,
          hasUncommittedChanges: false,
          uncommittedFileCount: 0,
          lastCommit: null,
          recentCommits: [],
          aheadBehind: null,
        },
      });

      const result = formatMinimalContext(context);

      expect(result).toBe('Stack: Angular');
      expect(result).not.toContain('Branch:');
    });

    it('should skip health warnings when none present', () => {
      const context = createMockGatheredContext({
        stack: {
          frameworks: ['Svelte'],
          packageManager: null,
          hasTypeScript: false,
          isStrict: false,
        },
        health: { checks: [] },
      });

      const result = formatMinimalContext(context);

      expect(result).toBe('Stack: Svelte');
      expect(result).not.toContain('warning');
    });

    it('should skip health warnings when only info checks', () => {
      const context = createMockGatheredContext({
        stack: {
          frameworks: ['Svelte'],
          packageManager: null,
          hasTypeScript: false,
          isStrict: false,
        },
        health: {
          checks: [
            { check: 'info1', status: 'info', message: 'Info' },
            { check: 'info2', status: 'info', message: 'Info 2' },
          ],
        },
      });

      const result = formatMinimalContext(context);

      expect(result).toBe('Stack: Svelte');
      expect(result).not.toContain('warning');
    });

    it('should skip high-priority todos when none present', () => {
      const context = createMockGatheredContext({
        stack: {
          frameworks: ['Remix'],
          packageManager: null,
          hasTypeScript: false,
          isStrict: false,
        },
        todos: [
          {
            file: 'a.ts',
            line: 1,
            type: 'TODO',
            text: 'Regular',
            priority: 'low',
          },
        ],
      });

      const result = formatMinimalContext(context);

      expect(result).toBe('Stack: Remix');
      expect(result).not.toContain('TODO');
    });

    it('should handle single health warning', () => {
      const context = createMockGatheredContext({
        health: {
          checks: [{ check: 'test', status: 'error', message: 'Error' }],
        },
      });

      const result = formatMinimalContext(context);

      expect(result).toBe('1 health warning(s)');
    });

    it('should handle single high-priority todo', () => {
      const context = createMockGatheredContext({
        todos: [
          {
            file: 'a.ts',
            line: 1,
            type: 'FIXME',
            text: 'Fix',
            priority: 'high',
          },
        ],
      });

      const result = formatMinimalContext(context);

      expect(result).toBe('1 high-priority TODO(s)');
    });
  });
});
