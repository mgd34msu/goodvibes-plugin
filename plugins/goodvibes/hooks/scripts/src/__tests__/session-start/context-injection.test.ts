/**
 * Unit tests for session-start/context-injection.ts
 *
 * Tests cover:
 * - Empty project detection and context formatting
 * - Full context gathering with all data populated
 * - Context gathering with partial/empty data
 * - Various combinations of populated/empty formatters
 * - 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock context/index.js
const mockIsEmptyProject = vi.fn();
const mockFormatEmptyProjectContext = vi.fn();
const mockDetectStack = vi.fn();
const mockFormatStackInfo = vi.fn();
const mockGetGitContext = vi.fn();
const mockFormatGitContext = vi.fn();
const mockCheckEnvStatus = vi.fn();
const mockFormatEnvStatus = vi.fn();
const mockScanTodos = vi.fn();
const mockFormatTodos = vi.fn();
const mockCheckProjectHealth = vi.fn();
const mockFormatHealthStatus = vi.fn();
const mockAnalyzeFolderStructure = vi.fn();
const mockFormatFolderAnalysis = vi.fn();

vi.mock('../../context/index.js', () => ({
  isEmptyProject: mockIsEmptyProject,
  formatEmptyProjectContext: mockFormatEmptyProjectContext,
  detectStack: mockDetectStack,
  formatStackInfo: mockFormatStackInfo,
  getGitContext: mockGetGitContext,
  formatGitContext: mockFormatGitContext,
  checkEnvStatus: mockCheckEnvStatus,
  formatEnvStatus: mockFormatEnvStatus,
  scanTodos: mockScanTodos,
  formatTodos: mockFormatTodos,
  checkProjectHealth: mockCheckProjectHealth,
  formatHealthStatus: mockFormatHealthStatus,
  analyzeFolderStructure: mockAnalyzeFolderStructure,
  formatFolderAnalysis: mockFormatFolderAnalysis,
}));

// Mock memory/index.js
const mockLoadProjectMemory = vi.fn();
const mockFormatMemoryContext = vi.fn();

vi.mock('../../memory/index.js', () => ({
  loadProjectMemory: mockLoadProjectMemory,
  formatMemoryContext: mockFormatMemoryContext,
}));

describe('context-injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('gatherAndFormatContext', () => {
    describe('empty project handling', () => {
      it('should return empty project context when project is empty', async () => {
        mockIsEmptyProject.mockResolvedValue(true);
        mockFormatEmptyProjectContext.mockReturnValue(
          '[Empty Project Context]'
        );

        const { gatherAndFormatContext } =
          await import('../../session-start/context-injection.js');
        const result = await gatherAndFormatContext('/test/cwd');

        expect(mockIsEmptyProject).toHaveBeenCalledWith('/test/cwd');
        expect(mockFormatEmptyProjectContext).toHaveBeenCalled();
        expect(result.context).toBe('[Empty Project Context]');
        expect(result.isEmpty).toBe(true);
      });

      it('should not call other context gatherers when project is empty', async () => {
        mockIsEmptyProject.mockResolvedValue(true);
        mockFormatEmptyProjectContext.mockReturnValue('Empty');

        const { gatherAndFormatContext } =
          await import('../../session-start/context-injection.js');
        await gatherAndFormatContext('/test/cwd');

        expect(mockDetectStack).not.toHaveBeenCalled();
        expect(mockGetGitContext).not.toHaveBeenCalled();
        expect(mockCheckEnvStatus).not.toHaveBeenCalled();
        expect(mockScanTodos).not.toHaveBeenCalled();
        expect(mockCheckProjectHealth).not.toHaveBeenCalled();
        expect(mockAnalyzeFolderStructure).not.toHaveBeenCalled();
        expect(mockLoadProjectMemory).not.toHaveBeenCalled();
      });
    });

    describe('non-empty project context gathering', () => {
      beforeEach(() => {
        mockIsEmptyProject.mockResolvedValue(false);
      });

      it('should gather all context in parallel for non-empty project', async () => {
        // Set up mock return values
        mockDetectStack.mockResolvedValue({
          frameworks: ['Next.js'],
          packageManager: 'pnpm',
          hasTypeScript: true,
          isStrict: true,
        });
        mockGetGitContext.mockResolvedValue({
          isRepo: true,
          branch: 'main',
          hasUncommittedChanges: false,
          uncommittedFileCount: 0,
          lastCommit: 'Initial commit',
          recentCommits: [],
          aheadBehind: null,
        });
        mockCheckEnvStatus.mockResolvedValue({
          hasEnvFile: true,
          hasEnvExample: true,
          missingVars: [],
          warnings: [],
        });
        mockScanTodos.mockResolvedValue([]);
        mockCheckProjectHealth.mockResolvedValue({ checks: [] });
        mockAnalyzeFolderStructure.mockResolvedValue({
          srcDir: 'src',
          pattern: 'feature-based',
          routing: 'App Router',
          hasApi: true,
        });
        mockLoadProjectMemory.mockResolvedValue({
          decisions: [],
          patterns: [],
          failures: [],
          preferences: [],
        });

        // Set up format mocks
        mockFormatStackInfo.mockReturnValue('Stack: Next.js');
        mockFormatFolderAnalysis.mockReturnValue('Structure: feature-based');
        mockFormatGitContext.mockReturnValue('Git: main branch');
        mockFormatEnvStatus.mockReturnValue('Environment: .env present');
        mockFormatMemoryContext.mockReturnValue('Memory info');
        mockFormatTodos.mockReturnValue('');
        mockFormatHealthStatus.mockReturnValue('Health: All good');

        const { gatherAndFormatContext } =
          await import('../../session-start/context-injection.js');
        const result = await gatherAndFormatContext('/test/project');

        // Verify all context gatherers were called
        expect(mockDetectStack).toHaveBeenCalledWith('/test/project');
        expect(mockGetGitContext).toHaveBeenCalledWith('/test/project');
        expect(mockCheckEnvStatus).toHaveBeenCalledWith('/test/project');
        expect(mockScanTodos).toHaveBeenCalledWith('/test/project');
        expect(mockCheckProjectHealth).toHaveBeenCalledWith('/test/project');
        expect(mockAnalyzeFolderStructure).toHaveBeenCalledWith(
          '/test/project'
        );
        expect(mockLoadProjectMemory).toHaveBeenCalledWith('/test/project');

        // Verify result
        expect(result.isEmpty).toBe(false);
        expect(result.context).toContain('[GoodVibes SessionStart]');
      });

      it('should include all formatted sections when all have content', async () => {
        mockDetectStack.mockResolvedValue({});
        mockGetGitContext.mockResolvedValue({});
        mockCheckEnvStatus.mockResolvedValue({});
        mockScanTodos.mockResolvedValue([
          { type: 'TODO', file: 'test.ts', line: 1, text: 'Fix this' },
        ]);
        mockCheckProjectHealth.mockResolvedValue({ checks: [] });
        mockAnalyzeFolderStructure.mockResolvedValue({});
        mockLoadProjectMemory.mockResolvedValue({
          decisions: [],
          patterns: [],
          failures: [],
          preferences: [],
        });

        mockFormatStackInfo.mockReturnValue('Stack: React');
        mockFormatFolderAnalysis.mockReturnValue('Structure: layer-based');
        mockFormatGitContext.mockReturnValue('Git: feature-branch');
        mockFormatEnvStatus.mockReturnValue('Env: configured');
        mockFormatMemoryContext.mockReturnValue('Previous decisions...');
        mockFormatTodos.mockReturnValue(
          'TODOs in code:\n- TODO: test.ts:1 - Fix this'
        );
        mockFormatHealthStatus.mockReturnValue('Health: warnings');

        const { gatherAndFormatContext } =
          await import('../../session-start/context-injection.js');
        const result = await gatherAndFormatContext('/test/project');

        expect(result.context).toContain('Stack: React');
        expect(result.context).toContain('Structure: layer-based');
        expect(result.context).toContain('Git: feature-branch');
        expect(result.context).toContain('Env: configured');
        expect(result.context).toContain('Previous decisions...');
        expect(result.context).toContain('TODOs in code:');
        expect(result.context).toContain('Health: warnings');
      });

      it('should handle empty stack info', async () => {
        mockDetectStack.mockResolvedValue({});
        mockGetGitContext.mockResolvedValue({});
        mockCheckEnvStatus.mockResolvedValue({});
        mockScanTodos.mockResolvedValue([]);
        mockCheckProjectHealth.mockResolvedValue({ checks: [] });
        mockAnalyzeFolderStructure.mockResolvedValue({});
        mockLoadProjectMemory.mockResolvedValue({
          decisions: [],
          patterns: [],
          failures: [],
          preferences: [],
        });

        // Return empty string for stack info (branch: if (stackStr) parts.push(stackStr))
        mockFormatStackInfo.mockReturnValue('');
        mockFormatFolderAnalysis.mockReturnValue('Structure: module-based');
        mockFormatGitContext.mockReturnValue('Git: main');
        mockFormatEnvStatus.mockReturnValue('Env: ok');
        mockFormatMemoryContext.mockReturnValue('');
        mockFormatTodos.mockReturnValue('');
        mockFormatHealthStatus.mockReturnValue('Health: ok');

        const { gatherAndFormatContext } =
          await import('../../session-start/context-injection.js');
        const result = await gatherAndFormatContext('/test/project');

        expect(result.context).not.toContain('Stack:');
        expect(result.context).toContain('Structure: module-based');
      });

      it('should handle empty folder analysis', async () => {
        mockDetectStack.mockResolvedValue({});
        mockGetGitContext.mockResolvedValue({});
        mockCheckEnvStatus.mockResolvedValue({});
        mockScanTodos.mockResolvedValue([]);
        mockCheckProjectHealth.mockResolvedValue({ checks: [] });
        mockAnalyzeFolderStructure.mockResolvedValue({});
        mockLoadProjectMemory.mockResolvedValue({
          decisions: [],
          patterns: [],
          failures: [],
          preferences: [],
        });

        mockFormatStackInfo.mockReturnValue('Stack: Vue');
        // Return empty string for folder analysis (branch: if (folderStr) parts.push(folderStr))
        mockFormatFolderAnalysis.mockReturnValue('');
        mockFormatGitContext.mockReturnValue('Git: dev');
        mockFormatEnvStatus.mockReturnValue('');
        mockFormatMemoryContext.mockReturnValue('');
        mockFormatTodos.mockReturnValue('');
        mockFormatHealthStatus.mockReturnValue('');

        const { gatherAndFormatContext } =
          await import('../../session-start/context-injection.js');
        const result = await gatherAndFormatContext('/test/project');

        expect(result.context).toContain('Stack: Vue');
        expect(result.context).not.toContain('Structure:');
      });

      it('should handle empty git context', async () => {
        mockDetectStack.mockResolvedValue({});
        mockGetGitContext.mockResolvedValue({ isRepo: false });
        mockCheckEnvStatus.mockResolvedValue({});
        mockScanTodos.mockResolvedValue([]);
        mockCheckProjectHealth.mockResolvedValue({ checks: [] });
        mockAnalyzeFolderStructure.mockResolvedValue({});
        mockLoadProjectMemory.mockResolvedValue({
          decisions: [],
          patterns: [],
          failures: [],
          preferences: [],
        });

        mockFormatStackInfo.mockReturnValue('Stack: Angular');
        mockFormatFolderAnalysis.mockReturnValue('Structure: feature-based');
        // Return empty string for git context (branch: if (gitStr) parts.push(gitStr))
        mockFormatGitContext.mockReturnValue('');
        mockFormatEnvStatus.mockReturnValue('Env: .env present');
        mockFormatMemoryContext.mockReturnValue('');
        mockFormatTodos.mockReturnValue('');
        mockFormatHealthStatus.mockReturnValue('');

        const { gatherAndFormatContext } =
          await import('../../session-start/context-injection.js');
        const result = await gatherAndFormatContext('/test/project');

        expect(result.context).toContain('Stack: Angular');
        expect(result.context).not.toContain('Git:');
      });

      it('should handle empty env status', async () => {
        mockDetectStack.mockResolvedValue({});
        mockGetGitContext.mockResolvedValue({});
        mockCheckEnvStatus.mockResolvedValue({
          hasEnvFile: false,
          hasEnvExample: false,
          missingVars: [],
          warnings: [],
        });
        mockScanTodos.mockResolvedValue([]);
        mockCheckProjectHealth.mockResolvedValue({ checks: [] });
        mockAnalyzeFolderStructure.mockResolvedValue({});
        mockLoadProjectMemory.mockResolvedValue({
          decisions: [],
          patterns: [],
          failures: [],
          preferences: [],
        });

        mockFormatStackInfo.mockReturnValue('Stack: Svelte');
        mockFormatFolderAnalysis.mockReturnValue('');
        mockFormatGitContext.mockReturnValue('Git: main');
        // Return empty string for env status (branch: if (envStr) parts.push(envStr))
        mockFormatEnvStatus.mockReturnValue('');
        mockFormatMemoryContext.mockReturnValue('');
        mockFormatTodos.mockReturnValue('');
        mockFormatHealthStatus.mockReturnValue('');

        const { gatherAndFormatContext } =
          await import('../../session-start/context-injection.js');
        const result = await gatherAndFormatContext('/test/project');

        expect(result.context).toContain('Git: main');
        expect(result.context).not.toContain('Environment:');
        expect(result.context).not.toContain('Env:');
      });

      it('should handle empty memory context', async () => {
        mockDetectStack.mockResolvedValue({});
        mockGetGitContext.mockResolvedValue({});
        mockCheckEnvStatus.mockResolvedValue({});
        mockScanTodos.mockResolvedValue([]);
        mockCheckProjectHealth.mockResolvedValue({ checks: [] });
        mockAnalyzeFolderStructure.mockResolvedValue({});
        mockLoadProjectMemory.mockResolvedValue({
          decisions: [],
          patterns: [],
          failures: [],
          preferences: [],
        });

        mockFormatStackInfo.mockReturnValue('Stack: Astro');
        mockFormatFolderAnalysis.mockReturnValue('Structure: module-based');
        mockFormatGitContext.mockReturnValue('Git: develop');
        mockFormatEnvStatus.mockReturnValue('Env: configured');
        // Return empty string for memory context (branch: if (memoryStr) parts.push(memoryStr))
        mockFormatMemoryContext.mockReturnValue('');
        mockFormatTodos.mockReturnValue('');
        mockFormatHealthStatus.mockReturnValue('');

        const { gatherAndFormatContext } =
          await import('../../session-start/context-injection.js');
        const result = await gatherAndFormatContext('/test/project');

        expect(result.context).toContain('Stack: Astro');
        expect(result.context).not.toContain('Previous Decisions');
        expect(result.context).not.toContain('Established Patterns');
      });

      it('should handle todos with content', async () => {
        mockDetectStack.mockResolvedValue({});
        mockGetGitContext.mockResolvedValue({});
        mockCheckEnvStatus.mockResolvedValue({});
        mockScanTodos.mockResolvedValue([
          {
            type: 'FIXME',
            file: 'app.ts',
            line: 42,
            text: 'FIXME: Critical bug',
          },
        ]);
        mockCheckProjectHealth.mockResolvedValue({ checks: [] });
        mockAnalyzeFolderStructure.mockResolvedValue({});
        mockLoadProjectMemory.mockResolvedValue({
          decisions: [],
          patterns: [],
          failures: [],
          preferences: [],
        });

        mockFormatStackInfo.mockReturnValue('');
        mockFormatFolderAnalysis.mockReturnValue('');
        mockFormatGitContext.mockReturnValue('');
        mockFormatEnvStatus.mockReturnValue('');
        mockFormatMemoryContext.mockReturnValue('');
        // Return non-empty string for todos (branch: if (todoStr) { parts.push(''); parts.push(todoStr); })
        mockFormatTodos.mockReturnValue('TODOs:\n- FIXME: app.ts:42');
        mockFormatHealthStatus.mockReturnValue('');

        const { gatherAndFormatContext } =
          await import('../../session-start/context-injection.js');
        const result = await gatherAndFormatContext('/test/project');

        expect(result.context).toContain('TODOs:');
        expect(result.context).toContain('FIXME: app.ts:42');
      });

      it('should handle empty todos', async () => {
        mockDetectStack.mockResolvedValue({});
        mockGetGitContext.mockResolvedValue({});
        mockCheckEnvStatus.mockResolvedValue({});
        mockScanTodos.mockResolvedValue([]);
        mockCheckProjectHealth.mockResolvedValue({ checks: [] });
        mockAnalyzeFolderStructure.mockResolvedValue({});
        mockLoadProjectMemory.mockResolvedValue({
          decisions: [],
          patterns: [],
          failures: [],
          preferences: [],
        });

        mockFormatStackInfo.mockReturnValue('Stack: Remix');
        mockFormatFolderAnalysis.mockReturnValue('');
        mockFormatGitContext.mockReturnValue('');
        mockFormatEnvStatus.mockReturnValue('');
        mockFormatMemoryContext.mockReturnValue('');
        // Return empty string for todos (branch: if (todoStr) {...} - skip)
        mockFormatTodos.mockReturnValue('');
        mockFormatHealthStatus.mockReturnValue('Health: All good');

        const { gatherAndFormatContext } =
          await import('../../session-start/context-injection.js');
        const result = await gatherAndFormatContext('/test/project');

        expect(result.context).not.toContain('TODOs');
      });

      it('should handle empty health status', async () => {
        mockDetectStack.mockResolvedValue({});
        mockGetGitContext.mockResolvedValue({});
        mockCheckEnvStatus.mockResolvedValue({});
        mockScanTodos.mockResolvedValue([]);
        mockCheckProjectHealth.mockResolvedValue({ checks: [] });
        mockAnalyzeFolderStructure.mockResolvedValue({});
        mockLoadProjectMemory.mockResolvedValue({
          decisions: [],
          patterns: [],
          failures: [],
          preferences: [],
        });

        mockFormatStackInfo.mockReturnValue('Stack: Nuxt');
        mockFormatFolderAnalysis.mockReturnValue('');
        mockFormatGitContext.mockReturnValue('');
        mockFormatEnvStatus.mockReturnValue('');
        mockFormatMemoryContext.mockReturnValue('');
        mockFormatTodos.mockReturnValue('');
        // Return empty string for health status (branch: if (healthStr) parts.push(healthStr))
        mockFormatHealthStatus.mockReturnValue('');

        const { gatherAndFormatContext } =
          await import('../../session-start/context-injection.js');
        const result = await gatherAndFormatContext('/test/project');

        expect(result.context).not.toContain('Health:');
      });

      it('should include separator lines', async () => {
        mockDetectStack.mockResolvedValue({});
        mockGetGitContext.mockResolvedValue({});
        mockCheckEnvStatus.mockResolvedValue({});
        mockScanTodos.mockResolvedValue([]);
        mockCheckProjectHealth.mockResolvedValue({ checks: [] });
        mockAnalyzeFolderStructure.mockResolvedValue({});
        mockLoadProjectMemory.mockResolvedValue({
          decisions: [],
          patterns: [],
          failures: [],
          preferences: [],
        });

        mockFormatStackInfo.mockReturnValue('');
        mockFormatFolderAnalysis.mockReturnValue('');
        mockFormatGitContext.mockReturnValue('');
        mockFormatEnvStatus.mockReturnValue('');
        mockFormatMemoryContext.mockReturnValue('');
        mockFormatTodos.mockReturnValue('');
        mockFormatHealthStatus.mockReturnValue('');

        const { gatherAndFormatContext } =
          await import('../../session-start/context-injection.js');
        const result = await gatherAndFormatContext('/test/project');

        // Check for separator lines (50 characters of '━')
        const separator = '\u2501'.repeat(50);
        expect(result.context).toContain(separator);
        // Should have header and footer separators
        const separatorCount = (
          result.context.match(new RegExp(separator, 'g')) || []
        ).length;
        expect(separatorCount).toBe(2);
      });

      it('should format context with proper structure', async () => {
        mockDetectStack.mockResolvedValue({
          frameworks: ['Next.js', 'Tailwind CSS'],
          packageManager: 'npm',
          hasTypeScript: true,
          isStrict: false,
        });
        mockGetGitContext.mockResolvedValue({
          isRepo: true,
          branch: 'feature/test',
          hasUncommittedChanges: true,
          uncommittedFileCount: 3,
          lastCommit: 'Add tests',
          recentCommits: ['- Add tests', '- Setup project'],
          aheadBehind: { ahead: 2, behind: 0 },
        });
        mockCheckEnvStatus.mockResolvedValue({
          hasEnvFile: true,
          hasEnvExample: true,
          missingVars: ['API_KEY'],
          warnings: ['Missing env vars: API_KEY'],
        });
        mockScanTodos.mockResolvedValue([
          {
            type: 'TODO',
            file: 'src/index.ts',
            line: 10,
            text: 'Implement feature',
          },
        ]);
        mockCheckProjectHealth.mockResolvedValue({
          checks: [
            {
              check: 'dependencies',
              status: 'warning',
              message: 'Missing deps',
            },
          ],
        });
        mockAnalyzeFolderStructure.mockResolvedValue({
          srcDir: 'src',
          pattern: 'feature-based',
          routing: 'App Router',
          hasApi: true,
        });
        mockLoadProjectMemory.mockResolvedValue({
          decisions: [
            {
              title: 'Use TypeScript',
              date: '2024-01-01',
              rationale: 'Type safety',
              alternatives: [],
            },
          ],
          patterns: [],
          failures: [],
          preferences: [],
        });

        mockFormatStackInfo.mockReturnValue(
          'Stack: Next.js, Tailwind CSS\nTypeScript: not strict\nPackage Manager: npm'
        );
        mockFormatFolderAnalysis.mockReturnValue(
          'Structure: feature-based, App Router, has API layer'
        );
        mockFormatGitContext.mockReturnValue(
          'Git: feature/test branch, 3 uncommitted files, 2 ahead\nLast: "Add tests"'
        );
        mockFormatEnvStatus.mockReturnValue(
          'Environment: .env present\nWarning: Missing env vars: API_KEY'
        );
        mockFormatMemoryContext.mockReturnValue(
          'Previous Decisions:\n- Use TypeScript (Type safety)'
        );
        mockFormatTodos.mockReturnValue(
          'TODOs in code:\n- TODO: src/index.ts:10 - Implement feature'
        );
        mockFormatHealthStatus.mockReturnValue('Health:\n[!] Missing deps');

        const { gatherAndFormatContext } =
          await import('../../session-start/context-injection.js');
        const result = await gatherAndFormatContext('/test/project');

        expect(result.isEmpty).toBe(false);
        expect(result.context).toContain('[GoodVibes SessionStart]');
        expect(result.context).toContain('Stack: Next.js');
        expect(result.context).toContain('Structure: feature-based');
        expect(result.context).toContain('Git: feature/test');
        expect(result.context).toContain('Environment: .env present');
        expect(result.context).toContain('Previous Decisions:');
        expect(result.context).toContain('TODOs in code:');
        expect(result.context).toContain('Health:');
      });
    });

    describe('edge cases', () => {
      it('should handle all formatters returning empty strings', async () => {
        mockIsEmptyProject.mockResolvedValue(false);
        mockDetectStack.mockResolvedValue({});
        mockGetGitContext.mockResolvedValue({});
        mockCheckEnvStatus.mockResolvedValue({});
        mockScanTodos.mockResolvedValue([]);
        mockCheckProjectHealth.mockResolvedValue({ checks: [] });
        mockAnalyzeFolderStructure.mockResolvedValue({});
        mockLoadProjectMemory.mockResolvedValue({
          decisions: [],
          patterns: [],
          failures: [],
          preferences: [],
        });

        mockFormatStackInfo.mockReturnValue('');
        mockFormatFolderAnalysis.mockReturnValue('');
        mockFormatGitContext.mockReturnValue('');
        mockFormatEnvStatus.mockReturnValue('');
        mockFormatMemoryContext.mockReturnValue('');
        mockFormatTodos.mockReturnValue('');
        mockFormatHealthStatus.mockReturnValue('');

        const { gatherAndFormatContext } =
          await import('../../session-start/context-injection.js');
        const result = await gatherAndFormatContext('/test/empty-formatters');

        expect(result.isEmpty).toBe(false);
        expect(result.context).toContain('[GoodVibes SessionStart]');
        // Should still have the separator structure even with no content
        const separator = '\u2501'.repeat(50);
        expect(result.context.split(separator).length).toBe(3); // 2 separators = 3 parts
      });

      it('should use cwd parameter correctly for all context gatherers', async () => {
        const testCwd = '/custom/path/to/project';
        mockIsEmptyProject.mockResolvedValue(false);
        mockDetectStack.mockResolvedValue({});
        mockGetGitContext.mockResolvedValue({});
        mockCheckEnvStatus.mockResolvedValue({});
        mockScanTodos.mockResolvedValue([]);
        mockCheckProjectHealth.mockResolvedValue({ checks: [] });
        mockAnalyzeFolderStructure.mockResolvedValue({});
        mockLoadProjectMemory.mockResolvedValue({
          decisions: [],
          patterns: [],
          failures: [],
          preferences: [],
        });

        mockFormatStackInfo.mockReturnValue('');
        mockFormatFolderAnalysis.mockReturnValue('');
        mockFormatGitContext.mockReturnValue('');
        mockFormatEnvStatus.mockReturnValue('');
        mockFormatMemoryContext.mockReturnValue('');
        mockFormatTodos.mockReturnValue('');
        mockFormatHealthStatus.mockReturnValue('');

        const { gatherAndFormatContext } =
          await import('../../session-start/context-injection.js');
        await gatherAndFormatContext(testCwd);

        expect(mockIsEmptyProject).toHaveBeenCalledWith(testCwd);
        expect(mockDetectStack).toHaveBeenCalledWith(testCwd);
        expect(mockGetGitContext).toHaveBeenCalledWith(testCwd);
        expect(mockCheckEnvStatus).toHaveBeenCalledWith(testCwd);
        expect(mockScanTodos).toHaveBeenCalledWith(testCwd);
        expect(mockCheckProjectHealth).toHaveBeenCalledWith(testCwd);
        expect(mockAnalyzeFolderStructure).toHaveBeenCalledWith(testCwd);
        expect(mockLoadProjectMemory).toHaveBeenCalledWith(testCwd);
      });
    });
  });
});
