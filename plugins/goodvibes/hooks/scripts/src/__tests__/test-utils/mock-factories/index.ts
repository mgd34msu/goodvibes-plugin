/**
 * Mock Factory Functions for Tests
 *
 * Provides properly typed mock factory functions to replace `as any` type assertions
 * in test files. Using these factories ensures type safety while mocking.
 *
 * @example
 * // Before (bad - bypasses type checking):
 * mockedFsPromises.readdir.mockResolvedValue(['file1.ts', 'file2.ts'] as any);
 *
 * // After (good - properly typed):
 * mockedFsPromises.readdir.mockResolvedValue(createMockDirents(['file1.ts', 'file2.ts']));
 */

// Re-export all filesystem mocks
export {
  createMockDirent,
  createMockDirents,
  createMockReaddirStrings,
  createMockDirentsWithTypes,
  createMockReaddirResult,
  createMockStats,
  createMockExecBuffer,
  createMockExecOutput,
  createMockGitExecSync,
} from './fs-mocks.js';

// Re-export all state mocks
export {
  createMockFileState,
  createMockHooksState,
  createMockActiveAgentEntry,
  createMockActiveAgentsState,
  createMockParsedTranscript,
  createMockTelemetryRecord,
  createErrorState,
  createMockHookInput,
  createMockBashToolInput,
} from './state-mocks.js';
