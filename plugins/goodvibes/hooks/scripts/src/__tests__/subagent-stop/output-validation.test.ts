/**
 * Tests for subagent-stop/output-validation module
 *
 * Tests cover:
 * - validateAgentOutput: validates agent output by checking type errors in modified files
 *   - Parses transcript to get files modified
 *   - Tracks all modified files in state
 *   - Runs type check only when TypeScript files are modified
 *   - Returns validation result with errors and updated state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { BuildResult } from '../../automation/build-runner.js';
import type { TranscriptData } from '../../shared/transcript.js';
import type { HooksState } from '../../types/state.js';

// Mock dependencies
const mockParseTranscript = vi.fn<(path: string) => Promise<TranscriptData>>();
const mockRunTypeCheck = vi.fn<(cwd: string) => BuildResult>();
const mockTrackFileModification =
  vi.fn<(state: HooksState, filePath: string) => HooksState>();

// Mock shared/index.js
vi.mock('../../shared/index.js', () => ({
  parseTranscript: (path: string) => mockParseTranscript(path),
  isTestEnvironment: () => false,
}));

// Mock automation/build-runner.js
vi.mock('../../automation/build-runner.js', () => ({
  runTypeCheck: (cwd: string) => mockRunTypeCheck(cwd),
}));

// Mock post-tool-use/file-tracker.js
vi.mock('../../post-tool-use/file-tracker.js', () => ({
  trackFileModification: (state: HooksState, filePath: string) =>
    mockTrackFileModification(state, filePath),
}));

// Helper to create minimal test state
function createTestState(): HooksState {
  return {
    session: {
      id: 'test-session',
      startedAt: '2025-01-01T00:00:00Z',
      mode: 'default',
      featureDescription: null,
    },
    errors: {},
    tests: {
      lastFullRun: null,
      lastQuickRun: null,
      passingFiles: [],
      failingFiles: [],
      pendingFixes: [],
    },
    build: {
      lastRun: null,
      status: 'unknown',
      errors: [],
      fixAttempts: 0,
    },
    git: {
      mainBranch: 'main',
      currentBranch: 'main',
      featureBranch: null,
      featureStartedAt: null,
      featureDescription: null,
      checkpoints: [],
      pendingMerge: false,
    },
    files: {
      modifiedSinceCheckpoint: [],
      modifiedThisSession: [],
      createdThisSession: [],
    },
    devServers: {},
  };
}

describe('subagent-stop/output-validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Default mock: trackFileModification returns state with file added
    mockTrackFileModification.mockImplementation((state, filePath) => ({
      ...state,
      files: {
        ...state.files,
        modifiedThisSession: [...state.files.modifiedThisSession, filePath],
        modifiedSinceCheckpoint: [
          ...state.files.modifiedSinceCheckpoint,
          filePath,
        ],
      },
    }));
  });

  // ============================================================================
  // validateAgentOutput tests
  // ============================================================================
  describe('validateAgentOutput', () => {
    it('should return valid result when no TypeScript files modified', async () => {
      const state = createTestState();
      mockParseTranscript.mockResolvedValue({
        toolsUsed: ['Write', 'Bash'],
        filesModified: ['/project/README.md', '/project/config.json'],
        summary: 'Updated documentation',
      });

      const { validateAgentOutput } =
        await import('../../subagent-stop/output-validation.js');
      const result = await validateAgentOutput(
        '/project',
        '/path/to/transcript.jsonl',
        state
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.filesModified).toEqual([
        '/project/README.md',
        '/project/config.json',
      ]);
      expect(mockRunTypeCheck).not.toHaveBeenCalled();
    });

    it('should run type check when .ts files are modified', async () => {
      const state = createTestState();
      mockParseTranscript.mockResolvedValue({
        toolsUsed: ['Write', 'Edit'],
        filesModified: ['/project/src/index.ts', '/project/src/utils.ts'],
        summary: 'Implemented new feature',
      });
      mockRunTypeCheck.mockReturnValue({
        passed: true,
        summary: 'Type check passed',
        errors: [],
      });

      const { validateAgentOutput } =
        await import('../../subagent-stop/output-validation.js');
      const result = await validateAgentOutput(
        '/project',
        '/path/to/transcript.jsonl',
        state
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(mockRunTypeCheck).toHaveBeenCalledWith('/project');
    });

    it('should run type check when .tsx files are modified', async () => {
      const state = createTestState();
      mockParseTranscript.mockResolvedValue({
        toolsUsed: ['Write'],
        filesModified: ['/project/src/App.tsx', '/project/src/Button.tsx'],
        summary: 'Created React components',
      });
      mockRunTypeCheck.mockReturnValue({
        passed: true,
        summary: 'Type check passed',
        errors: [],
      });

      const { validateAgentOutput } =
        await import('../../subagent-stop/output-validation.js');
      const result = await validateAgentOutput(
        '/project',
        '/path/to/transcript.jsonl',
        state
      );

      expect(result.valid).toBe(true);
      expect(mockRunTypeCheck).toHaveBeenCalledWith('/project');
    });

    it('should return invalid result with errors when type check fails', async () => {
      const state = createTestState();
      mockParseTranscript.mockResolvedValue({
        toolsUsed: ['Edit'],
        filesModified: ['/project/src/broken.ts'],
        summary: 'Made some changes',
      });
      mockRunTypeCheck.mockReturnValue({
        passed: false,
        summary: 'Type errors found',
        errors: [
          {
            file: '/project/src/broken.ts',
            line: 10,
            message: "Cannot find name 'foo'",
          },
          {
            file: '/project/src/broken.ts',
            line: 15,
            message: "Property 'bar' does not exist",
          },
        ],
      });

      const { validateAgentOutput } =
        await import('../../subagent-stop/output-validation.js');
      const result = await validateAgentOutput(
        '/project',
        '/path/to/transcript.jsonl',
        state
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe('Type errors after agent work: 2 errors');
    });

    it('should track all modified files in state', async () => {
      const state = createTestState();
      mockParseTranscript.mockResolvedValue({
        toolsUsed: ['Write', 'Edit'],
        filesModified: [
          '/project/src/a.ts',
          '/project/src/b.ts',
          '/project/config.json',
        ],
        summary: 'Modified multiple files',
      });
      mockRunTypeCheck.mockReturnValue({
        passed: true,
        summary: 'Type check passed',
        errors: [],
      });

      const { validateAgentOutput } =
        await import('../../subagent-stop/output-validation.js');
      const result = await validateAgentOutput(
        '/project',
        '/path/to/transcript.jsonl',
        state
      );

      // trackFileModification should be called for each file
      expect(mockTrackFileModification).toHaveBeenCalledTimes(3);
      expect(mockTrackFileModification).toHaveBeenCalledWith(
        expect.any(Object),
        '/project/src/a.ts'
      );
      expect(mockTrackFileModification).toHaveBeenCalledWith(
        expect.any(Object),
        '/project/src/b.ts'
      );
      expect(mockTrackFileModification).toHaveBeenCalledWith(
        expect.any(Object),
        '/project/config.json'
      );

      // State should be updated
      expect(result.state).toBeDefined();
    });

    it('should chain state updates through multiple file modifications', async () => {
      const state = createTestState();
      mockParseTranscript.mockResolvedValue({
        toolsUsed: ['Write'],
        filesModified: ['/project/a.js', '/project/b.js'],
        summary: 'Modified files',
      });

      // Track how state is chained
      let callCount = 0;
      mockTrackFileModification.mockImplementation((currentState) => {
        callCount++;
        return {
          ...currentState,
          files: {
            ...currentState.files,
            modifiedThisSession: [
              ...currentState.files.modifiedThisSession,
              `file-${callCount}`,
            ],
          },
        };
      });

      const { validateAgentOutput } =
        await import('../../subagent-stop/output-validation.js');
      const result = await validateAgentOutput(
        '/project',
        '/path/to/transcript.jsonl',
        state
      );

      // State should contain both files from chained calls
      expect(result.state.files.modifiedThisSession).toEqual([
        'file-1',
        'file-2',
      ]);
    });

    it('should handle empty filesModified list', async () => {
      const state = createTestState();
      mockParseTranscript.mockResolvedValue({
        toolsUsed: ['Bash'],
        filesModified: [],
        summary: 'Ran some commands',
      });

      const { validateAgentOutput } =
        await import('../../subagent-stop/output-validation.js');
      const result = await validateAgentOutput(
        '/project',
        '/path/to/transcript.jsonl',
        state
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.filesModified).toEqual([]);
      expect(mockTrackFileModification).not.toHaveBeenCalled();
      expect(mockRunTypeCheck).not.toHaveBeenCalled();
    });

    it('should handle mixed file types with only some TypeScript', async () => {
      const state = createTestState();
      mockParseTranscript.mockResolvedValue({
        toolsUsed: ['Write', 'Edit'],
        filesModified: [
          '/project/README.md',
          '/project/src/index.ts',
          '/project/package.json',
          '/project/src/App.tsx',
        ],
        summary: 'Mixed file types',
      });
      mockRunTypeCheck.mockReturnValue({
        passed: true,
        summary: 'Type check passed',
        errors: [],
      });

      const { validateAgentOutput } =
        await import('../../subagent-stop/output-validation.js');
      const result = await validateAgentOutput(
        '/project',
        '/path/to/transcript.jsonl',
        state
      );

      expect(result.valid).toBe(true);
      expect(mockRunTypeCheck).toHaveBeenCalledTimes(1);
      expect(mockTrackFileModification).toHaveBeenCalledTimes(4);
    });

    it('should return correct filesModified from transcript', async () => {
      const state = createTestState();
      const expectedFiles = [
        '/project/src/components/Button.tsx',
        '/project/src/utils/helpers.ts',
        '/project/styles/main.css',
      ];
      mockParseTranscript.mockResolvedValue({
        toolsUsed: ['Write'],
        filesModified: expectedFiles,
        summary: 'Created files',
      });
      mockRunTypeCheck.mockReturnValue({
        passed: true,
        summary: 'Type check passed',
        errors: [],
      });

      const { validateAgentOutput } =
        await import('../../subagent-stop/output-validation.js');
      const result = await validateAgentOutput(
        '/project',
        '/path/to/transcript.jsonl',
        state
      );

      expect(result.filesModified).toEqual(expectedFiles);
    });

    it('should pass transcript path to parseTranscript', async () => {
      const state = createTestState();
      const transcriptPath = '/custom/path/to/agent-transcript.jsonl';
      mockParseTranscript.mockResolvedValue({
        toolsUsed: [],
        filesModified: [],
        summary: '',
      });

      const { validateAgentOutput } =
        await import('../../subagent-stop/output-validation.js');
      await validateAgentOutput('/project', transcriptPath, state);

      expect(mockParseTranscript).toHaveBeenCalledWith(transcriptPath);
    });

    it('should pass cwd to runTypeCheck', async () => {
      const state = createTestState();
      const projectDir = '/custom/project/directory';
      mockParseTranscript.mockResolvedValue({
        toolsUsed: ['Write'],
        filesModified: ['/custom/project/directory/src/file.ts'],
        summary: 'Added file',
      });
      mockRunTypeCheck.mockReturnValue({
        passed: true,
        summary: 'Type check passed',
        errors: [],
      });

      const { validateAgentOutput } =
        await import('../../subagent-stop/output-validation.js');
      await validateAgentOutput(projectDir, '/path/to/transcript.jsonl', state);

      expect(mockRunTypeCheck).toHaveBeenCalledWith(projectDir);
    });

    it('should return updated state with original state preserved', async () => {
      const state = createTestState();
      state.session.id = 'preserve-me';
      state.build.status = 'passing';

      mockParseTranscript.mockResolvedValue({
        toolsUsed: ['Write'],
        filesModified: ['/project/file.md'],
        summary: 'Modified markdown',
      });

      // Mock returns state with file added but preserves other fields
      mockTrackFileModification.mockImplementation(
        (currentState, filePath) => ({
          ...currentState,
          files: {
            ...currentState.files,
            modifiedThisSession: [
              ...currentState.files.modifiedThisSession,
              filePath,
            ],
            modifiedSinceCheckpoint: [
              ...currentState.files.modifiedSinceCheckpoint,
              filePath,
            ],
          },
        })
      );

      const { validateAgentOutput } =
        await import('../../subagent-stop/output-validation.js');
      const result = await validateAgentOutput(
        '/project',
        '/path/to/transcript.jsonl',
        state
      );

      expect(result.state.session.id).toBe('preserve-me');
      expect(result.state.build.status).toBe('passing');
    });

    it('should handle type check with single error', async () => {
      const state = createTestState();
      mockParseTranscript.mockResolvedValue({
        toolsUsed: ['Edit'],
        filesModified: ['/project/src/single-error.ts'],
        summary: 'Single error file',
      });
      mockRunTypeCheck.mockReturnValue({
        passed: false,
        summary: 'Type errors found',
        errors: [
          {
            file: '/project/src/single-error.ts',
            line: 5,
            message: 'Type error message',
          },
        ],
      });

      const { validateAgentOutput } =
        await import('../../subagent-stop/output-validation.js');
      const result = await validateAgentOutput(
        '/project',
        '/path/to/transcript.jsonl',
        state
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toBe('Type errors after agent work: 1 errors');
    });
  });
});
