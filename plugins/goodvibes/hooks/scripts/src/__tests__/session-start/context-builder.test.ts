/**
 * Comprehensive tests for context-builder.ts
 *
 * Tests cover:
 * - gatherProjectContext with all branches
 * - createFailedContextResult
 * - Empty project detection
 * - All formatting sections (recovery, stack, git, env, ports, memory, todos, health)
 * - Summary building with various combinations
 * - Issue counting logic
 * - Edge cases: missing data, errors, empty inputs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { RecoveryInfo } from '../../session-start/crash-recovery.js';

// Mock all context modules
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
const mockIsEmptyProject = vi.fn();
const mockFormatEmptyProjectContext = vi.fn();
const mockCheckPorts = vi.fn();
const mockFormatPortStatus = vi.fn();

vi.mock('../../context/index.js', () => ({
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
  isEmptyProject: mockIsEmptyProject,
  formatEmptyProjectContext: mockFormatEmptyProjectContext,
  checkPorts: mockCheckPorts,
  formatPortStatus: mockFormatPortStatus,
}));

// Mock memory module
const mockLoadProjectMemory = vi.fn();
const mockFormatMemoryContext = vi.fn();

vi.mock('../../memory/index.js', () => ({
  loadProjectMemory: mockLoadProjectMemory,
  formatMemoryContext: mockFormatMemoryContext,
}));

// Mock crash recovery module
const mockFormatRecoveryContext = vi.fn();

vi.mock('../../session-start/crash-recovery.js', async () => {
  const actual = await vi.importActual('../../session-start/crash-recovery.js');
  return {
    ...actual,
    formatRecoveryContext: mockFormatRecoveryContext,
  };
});

// Mock debug function
const mockDebug = vi.fn();

vi.mock('../../shared/index.js', () => ({
  debug: mockDebug,
}));

describe('context-builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Setup default mock returns
    mockIsEmptyProject.mockResolvedValue(false);
    mockDetectStack.mockResolvedValue({
      frameworks: [],
      packageManager: 'npm',
      hasTypeScript: false,
    });
    mockGetGitContext.mockResolvedValue({
      branch: 'main',
      hasUncommittedChanges: false,
      uncommittedFileCount: 0,
      recentCommits: [],
    });
    mockCheckEnvStatus.mockResolvedValue({
      files: [],
      warnings: [],
    });
    mockScanTodos.mockResolvedValue([]);
    mockCheckProjectHealth.mockResolvedValue({
      checks: [],
    });
    mockAnalyzeFolderStructure.mockResolvedValue({
      structure: '',
    });
    mockLoadProjectMemory.mockResolvedValue({
      decisions: [],
      patterns: [],
      failures: [],
      preferences: [],
    });
    mockCheckPorts.mockResolvedValue({
      ports: [],
    });

    // Setup format functions with default returns
    mockFormatStackInfo.mockReturnValue('Stack: Node.js');
    mockFormatGitContext.mockReturnValue('Branch: main');
    mockFormatEnvStatus.mockReturnValue('');
    mockFormatTodos.mockReturnValue('');
    mockFormatHealthStatus.mockReturnValue('Health: All good');
    mockFormatFolderAnalysis.mockReturnValue('Folders: src/');
    mockFormatMemoryContext.mockReturnValue('');
    mockFormatPortStatus.mockReturnValue('No dev servers detected');
    mockFormatEmptyProjectContext.mockReturnValue('This is an empty project');
    mockFormatRecoveryContext.mockReturnValue('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('gatherProjectContext', () => {
    it('should detect empty project and return early', async () => {
      mockIsEmptyProject.mockResolvedValue(true);

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.isEmptyProject).toBe(true);
      expect(result.summary).toBe('New project (empty directory)');
      expect(result.hasIssues).toBe(false);
      expect(result.issueCount).toBe(0);
      expect(result.needsRecovery).toBe(false);
      expect(result.additionalContext).toBe('This is an empty project');
      expect(result.gatherTimeMs).toBeGreaterThanOrEqual(0);

      // Should not call context gathering functions for empty project
      expect(mockDetectStack).not.toHaveBeenCalled();
      expect(mockGetGitContext).not.toHaveBeenCalled();
    });

    it('should gather all context in parallel for non-empty project', async () => {
      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      await gatherProjectContext('/test/project', recoveryInfo, startTime);

      // All context functions should be called
      expect(mockDetectStack).toHaveBeenCalledWith('/test/project');
      expect(mockGetGitContext).toHaveBeenCalledWith('/test/project');
      expect(mockCheckEnvStatus).toHaveBeenCalledWith('/test/project');
      expect(mockScanTodos).toHaveBeenCalledWith('/test/project');
      expect(mockCheckProjectHealth).toHaveBeenCalledWith('/test/project');
      expect(mockAnalyzeFolderStructure).toHaveBeenCalledWith('/test/project');
      expect(mockLoadProjectMemory).toHaveBeenCalledWith('/test/project');
      expect(mockCheckPorts).toHaveBeenCalledWith('/test/project');
    });

    it('should build correct summary with frameworks and git info', async () => {
      mockDetectStack.mockResolvedValue({
        frameworks: ['React', 'Next.js', 'TypeScript'],
        packageManager: 'npm',
        hasTypeScript: true,
      });
      mockGetGitContext.mockResolvedValue({
        branch: 'feature/new-feature',
        hasUncommittedChanges: true,
        uncommittedFileCount: 5,
        recentCommits: [],
      });

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.summary).toContain('React');
      expect(result.summary).toContain('Next.js');
      expect(result.summary).toContain('TypeScript');
      expect(result.summary).toContain('feature/new-feature');
      expect(result.summary).toContain('5 uncommitted');
    });

    it('should limit frameworks in summary to 3', async () => {
      mockDetectStack.mockResolvedValue({
        frameworks: ['React', 'Next.js', 'TypeScript', 'TailwindCSS', 'Vitest'],
        packageManager: 'npm',
        hasTypeScript: true,
      });

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      // Should only show first 3 frameworks
      expect(result.summary).toContain('React');
      expect(result.summary).toContain('Next.js');
      expect(result.summary).toContain('TypeScript');
      expect(result.summary).not.toContain('TailwindCSS');
      expect(result.summary).not.toContain('Vitest');
    });

    it('should include issue count in summary when issues exist', async () => {
      mockCheckProjectHealth.mockResolvedValue({
        checks: [
          { name: 'test1', status: 'warning', message: 'Warning 1' },
          { name: 'test2', status: 'error', message: 'Error 1' },
        ],
      });
      mockCheckEnvStatus.mockResolvedValue({
        files: [],
        warnings: ['Missing .env file'],
      });
      mockScanTodos.mockResolvedValue([
        { file: 'test.ts', line: 1, text: 'TODO: fix this' },
      ]);

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.hasIssues).toBe(true);
      expect(result.issueCount).toBe(4); // 2 health checks + 1 env warning + 1 todo
      expect(result.summary).toContain('4 issues');
    });

    it('should calculate issues correctly with only health warnings', async () => {
      mockCheckProjectHealth.mockResolvedValue({
        checks: [
          { name: 'test1', status: 'warning', message: 'Warning 1' },
          { name: 'test2', status: 'ok', message: 'All good' },
        ],
      });

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.issueCount).toBe(1);
      expect(result.hasIssues).toBe(true);
    });

    it('should default to "Project analyzed" when no summary parts', async () => {
      mockDetectStack.mockResolvedValue({
        frameworks: [],
        packageManager: 'npm',
        hasTypeScript: false,
      });
      mockGetGitContext.mockResolvedValue({
        branch: null,
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        recentCommits: [],
      });

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.summary).toBe('Project analyzed');
    });

    it('should set needsRecovery flag from recoveryInfo', async () => {
      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: true,
        previousFeature: 'Add user authentication',
        onBranch: 'feature/auth',
        uncommittedFiles: ['src/auth.ts', 'src/login.tsx'],
        pendingIssues: ['2 tests need fixes', 'Build is failing'],
        lastCheckpoint: {
          hash: 'abc123',
          message: 'WIP: authentication flow',
          timestamp: new Date().toISOString(),
        },
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.needsRecovery).toBe(true);
    });

    it('should call debug with context gathering metrics', async () => {
      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      await gatherProjectContext('/test/project', recoveryInfo, startTime);

      expect(mockDebug).toHaveBeenCalled();
      const debugCall = mockDebug.mock.calls[0];
      expect(debugCall[0]).toContain('Context gathered');
      expect(debugCall[1]).toHaveProperty('isEmptyProject', false);
      expect(debugCall[1]).toHaveProperty('hasIssues');
      expect(debugCall[1]).toHaveProperty('issueCount');
      expect(debugCall[1]).toHaveProperty('needsRecovery');
    });

    it('should format context with recovery section when needed', async () => {
      mockFormatRecoveryContext.mockReturnValue(
        '[Recovery Info]\nPrevious session crashed\n'
      );

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: true,
        previousFeature: 'Add user auth',
        onBranch: 'feature/auth',
        uncommittedFiles: ['src/auth.ts'],
        pendingIssues: ['Build failing'],
        lastCheckpoint: {
          hash: 'abc123',
          message: 'WIP: auth',
          timestamp: new Date().toISOString(),
        },
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(mockFormatRecoveryContext).toHaveBeenCalledWith(recoveryInfo);
      expect(result.additionalContext).toContain('[GoodVibes SessionStart]');
      expect(result.additionalContext).toContain('[Recovery Info]');
    });

    it('should skip recovery section when not needed', async () => {
      mockFormatRecoveryContext.mockReturnValue('');

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      // Should not call formatRecoveryContext when needsRecovery is false
      expect(mockFormatRecoveryContext).not.toHaveBeenCalled();
      expect(result.additionalContext).not.toContain('[Recovery Info]');
    });

    it('should include all sections in formatted context', async () => {
      mockFormatStackInfo.mockReturnValue('Stack: React + TypeScript');
      mockFormatFolderAnalysis.mockReturnValue('Folders: src/, tests/');
      mockFormatGitContext.mockReturnValue('Branch: main\nCommits: 5');
      mockFormatEnvStatus.mockReturnValue('Env files: .env.local');
      mockFormatPortStatus.mockReturnValue('Port 3000: Next.js dev server');
      mockFormatMemoryContext.mockReturnValue('Decisions: 3\nPatterns: 2');
      mockFormatTodos.mockReturnValue('TODOs: 5 found');
      mockFormatHealthStatus.mockReturnValue('Health: 2 warnings');

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      // Check all sections are present
      expect(result.additionalContext).toContain('[GoodVibes SessionStart]');
      expect(result.additionalContext).toContain('## Project Overview');
      expect(result.additionalContext).toContain('Stack: React + TypeScript');
      expect(result.additionalContext).toContain('Folders: src/, tests/');
      expect(result.additionalContext).toContain('## Git Status');
      expect(result.additionalContext).toContain('Branch: main');
      expect(result.additionalContext).toContain('## Environment');
      expect(result.additionalContext).toContain('Env files: .env.local');
      expect(result.additionalContext).toContain('## Dev Servers');
      expect(result.additionalContext).toContain(
        'Port 3000: Next.js dev server'
      );
      expect(result.additionalContext).toContain('## Project Memory');
      expect(result.additionalContext).toContain('Decisions: 3');
      expect(result.additionalContext).toContain('## Code TODOs');
      expect(result.additionalContext).toContain('TODOs: 5 found');
      expect(result.additionalContext).toContain('## Health Checks');
      expect(result.additionalContext).toContain('Health: 2 warnings');
    });

    it('should skip Environment section when formatEnvStatus returns empty', async () => {
      mockFormatEnvStatus.mockReturnValue('');

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.additionalContext).not.toContain('## Environment');
    });

    it('should skip Dev Servers section when no servers detected', async () => {
      mockFormatPortStatus.mockReturnValue('No dev servers detected');

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.additionalContext).not.toContain('## Dev Servers');
    });

    it('should skip Project Memory section when no memory', async () => {
      mockFormatMemoryContext.mockReturnValue('');

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.additionalContext).not.toContain('## Project Memory');
    });

    it('should skip Code TODOs section when no todos', async () => {
      mockFormatTodos.mockReturnValue('');

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.additionalContext).not.toContain('## Code TODOs');
    });

    it('should skip Health Checks section when all good', async () => {
      mockFormatHealthStatus.mockReturnValue('Health: All good');

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.additionalContext).not.toContain('## Health Checks');
    });

    it('should include Health Checks section when there are issues', async () => {
      mockFormatHealthStatus.mockReturnValue('Health: 2 warnings, 1 error');

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.additionalContext).toContain('## Health Checks');
      expect(result.additionalContext).toContain('Health: 2 warnings, 1 error');
    });

    it('should include separator lines in context', async () => {
      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      // Should have separator lines (50 equal signs)
      expect(result.additionalContext).toContain('='.repeat(50));
    });

    it('should measure gather time correctly', async () => {
      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now() - 100; // Simulate 100ms elapsed
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.gatherTimeMs).toBeGreaterThanOrEqual(100);
    });
  });

  describe('createFailedContextResult', () => {
    it('should create a failed result with empty context', async () => {
      const { createFailedContextResult } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();

      const result = createFailedContextResult(startTime);

      expect(result.additionalContext).toBe('');
      expect(result.summary).toBe('Context gathering failed');
      expect(result.isEmptyProject).toBe(false);
      expect(result.hasIssues).toBe(false);
      expect(result.issueCount).toBe(0);
      expect(result.needsRecovery).toBe(false);
      expect(result.gatherTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should calculate gather time correctly', async () => {
      const { createFailedContextResult } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now() - 50; // Simulate 50ms elapsed

      const result = createFailedContextResult(startTime);

      expect(result.gatherTimeMs).toBeGreaterThanOrEqual(50);
    });
  });

  describe('conditional section rendering', () => {
    it('should skip stack info when formatStackInfo returns empty', async () => {
      mockFormatStackInfo.mockReturnValue('');

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.additionalContext).toContain('## Project Overview');
      // Should not have stack info line
      expect(result.additionalContext.split('\n')).not.toContain(
        'Stack: Node.js'
      );
    });

    it('should skip folder analysis when formatFolderAnalysis returns empty', async () => {
      mockFormatFolderAnalysis.mockReturnValue('');

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.additionalContext).toContain('## Project Overview');
      // Should not have folder line
      expect(result.additionalContext.split('\n')).not.toContain(
        'Folders: src/'
      );
    });

    it('should skip git context when formatGitContext returns empty', async () => {
      mockFormatGitContext.mockReturnValue('');

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.additionalContext).toContain('## Git Status');
      // Should not have git info line
      expect(result.additionalContext.split('\n')).not.toContain(
        'Branch: main'
      );
    });

    it('should skip empty recovery context string when needsRecovery is true', async () => {
      mockFormatRecoveryContext.mockReturnValue('');

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: true,
        previousFeature: 'test',
        onBranch: 'test-branch',
        uncommittedFiles: ['test.ts'],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      // Should call formatRecoveryContext but not add it if empty
      expect(mockFormatRecoveryContext).toHaveBeenCalledWith(recoveryInfo);
      expect(result.needsRecovery).toBe(true);
    });

    it('should include port status when server is detected', async () => {
      mockFormatPortStatus.mockReturnValue('Port 3000: dev server running');

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.additionalContext).toContain('## Dev Servers');
      expect(result.additionalContext).toContain(
        'Port 3000: dev server running'
      );
    });

    it('should skip port status when empty string', async () => {
      mockFormatPortStatus.mockReturnValue('');

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.additionalContext).not.toContain('## Dev Servers');
    });

    it('should handle empty health status string', async () => {
      mockFormatHealthStatus.mockReturnValue('');

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.additionalContext).not.toContain('## Health Checks');
    });
  });

  describe('edge cases', () => {
    it('should handle empty stack frameworks array', async () => {
      mockDetectStack.mockResolvedValue({
        frameworks: [],
        packageManager: 'npm',
        hasTypeScript: false,
      });

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      // Should not crash and should work with empty frameworks
      expect(result.summary).toBeTruthy();
    });

    it('should handle null git branch', async () => {
      mockGetGitContext.mockResolvedValue({
        branch: null,
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        recentCommits: [],
      });

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      // Should not include branch in summary
      expect(result.summary).not.toContain('on ');
    });

    it('should handle zero uncommitted files', async () => {
      mockGetGitContext.mockResolvedValue({
        branch: 'main',
        hasUncommittedChanges: false,
        uncommittedFileCount: 0,
        recentCommits: [],
      });

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      // Should not include uncommitted in summary
      expect(result.summary).not.toContain('uncommitted');
    });

    it('should handle all health checks with ok status', async () => {
      mockCheckProjectHealth.mockResolvedValue({
        checks: [
          { name: 'test1', status: 'ok', message: 'All good' },
          { name: 'test2', status: 'ok', message: 'All good' },
        ],
      });

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.issueCount).toBe(0);
      expect(result.hasIssues).toBe(false);
    });

    it('should handle empty recovery info with null checkpoint', async () => {
      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      // Should not crash with null checkpoint
      expect(result.needsRecovery).toBe(false);
    });

    it('should handle recovery info with empty recovery context string', async () => {
      mockFormatRecoveryContext.mockReturnValue('');

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: true,
        previousFeature: 'test',
        onBranch: 'test-branch',
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      // Should still work even if format returns empty string
      expect(result.needsRecovery).toBe(true);
      expect(result.additionalContext).not.toContain('[Recovery Info]');
    });

    it('should handle empty todos array', async () => {
      mockScanTodos.mockResolvedValue([]);

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.issueCount).toBe(0);
    });

    it('should handle empty env warnings array', async () => {
      mockCheckEnvStatus.mockResolvedValue({
        files: ['.env.local'],
        warnings: [],
      });

      const { gatherProjectContext } =
        await import('../../session-start/context-builder.js');
      const startTime = Date.now();
      const recoveryInfo: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };

      const result = await gatherProjectContext(
        '/test/project',
        recoveryInfo,
        startTime
      );

      expect(result.issueCount).toBe(0);
    });
  });
});
