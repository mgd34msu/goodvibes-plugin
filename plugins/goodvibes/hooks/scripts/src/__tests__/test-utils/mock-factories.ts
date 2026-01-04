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

import type { Dirent } from 'fs';
import type { FileState, HooksState } from '../../types/state.js';
import type {
  ActiveAgentEntry,
  ActiveAgentsState,
  ParsedTranscript,
  TelemetryRecord,
} from '../../telemetry/index.js';

// ============================================================================
// File System Mocks
// ============================================================================

/**
 * Creates a mock fs.Dirent object for testing directory reads.
 *
 * Use this when mocking `fs.promises.readdir()` which returns `Dirent[]` objects.
 *
 * @param name - The file or directory name
 * @param options - Optional flags for file type (defaults to file)
 * @returns A properly typed Dirent object
 *
 * @example
 * const dirent = createMockDirent('file.ts');
 * const dirDirent = createMockDirent('src', { isDirectory: true });
 */
export function createMockDirent(
  name: string,
  options?: { isFile?: boolean; isDirectory?: boolean }
): Dirent {
  const isFile = options?.isFile ?? !options?.isDirectory;
  const isDirectory = options?.isDirectory ?? false;

  return {
    name,
    isFile: () => isFile,
    isDirectory: () => isDirectory,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    path: '',
    parentPath: '',
  } as Dirent;
}

/**
 * Creates an array of mock Dirent objects from file names.
 *
 * All items are treated as files by default. Use `createMockDirentsWithTypes`
 * if you need to specify directories.
 *
 * @param names - Array of file/directory names
 * @returns Array of properly typed Dirent objects
 *
 * @example
 * mockedFsPromises.readdir.mockResolvedValue(
 *   createMockDirents(['README.md', 'LICENSE', '.gitignore'])
 * );
 */
export function createMockDirents(names: string[]): Dirent[] {
  return names.map((name) => createMockDirent(name));
}

/**
 * Creates a mock readdir result for string-only returns.
 *
 * Use this when mocking `fs.promises.readdir()` called without `{ withFileTypes: true }`.
 * The function returns a string array, but TypeScript's overloaded types require
 * casting to satisfy the mock's expected return type.
 *
 * @param names - Array of file/directory names as strings
 * @returns The same string array, typed to satisfy readdir mock
 *
 * @example
 * // For readdir without withFileTypes option (returns string[])
 * mockedFsPromises.readdir.mockResolvedValue(
 *   createMockReaddirStrings(['package.json', 'src', 'README.md'])
 * );
 */
export function createMockReaddirStrings(names: string[]): string[] & Dirent[] {
  // This cast is safe because readdir without { withFileTypes: true }
  // returns string[], but the mock type expects Dirent[] | string[]
  return names as string[] & Dirent[];
}

/**
 * Creates an array of mock Dirent objects with specified types.
 *
 * @param items - Array of objects with name and type specification
 * @returns Array of properly typed Dirent objects
 *
 * @example
 * mockedFsPromises.readdir.mockResolvedValue(
 *   createMockDirentsWithTypes([
 *     { name: 'src', isDirectory: true },
 *     { name: 'package.json', isFile: true },
 *   ])
 * );
 */
export function createMockDirentsWithTypes(
  items: Array<{ name: string; isFile?: boolean; isDirectory?: boolean }>
): Dirent[] {
  return items.map((item) => createMockDirent(item.name, item));
}

// ============================================================================
// Buffer Mocks for Git Commands
// ============================================================================

/**
 * Creates a mock Buffer object that mimics execSync output.
 *
 * When execSync is called without encoding option, it returns a Buffer.
 * When called with { encoding: 'utf-8' }, it returns a string.
 * This factory creates a Buffer-like object that works for both cases.
 *
 * @param content - The string content to wrap
 * @returns A Buffer containing the content
 *
 * @example
 * vi.mocked(execSync).mockReturnValue(createMockExecBuffer('main\n'));
 */
export function createMockExecBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf-8');
}

/**
 * Type-safe mock return for execSync when encoding is specified.
 *
 * When execSync is called with { encoding: 'utf-8' }, TypeScript expects
 * the return type to be string. This function provides type-safe string returns.
 *
 * @param content - The string content to return
 * @returns The content as a string (with proper typing for execSync mock)
 *
 * @example
 * vi.mocked(execSync).mockImplementation((cmd, opts) => {
 *   if (cmd.includes('branch')) {
 *     return createMockExecOutput('main\n');
 *   }
 *   throw new Error('Unknown command');
 * });
 */
export function createMockExecOutput(content: string): string {
  return content;
}

// ============================================================================
// State Mocks
// ============================================================================

/**
 * Creates a partial FileState object with default empty arrays.
 *
 * Useful when you need to test with a FileState that has missing properties,
 * without using `as any`.
 *
 * @param overrides - Optional partial FileState to merge
 * @returns A complete FileState object
 *
 * @example
 * const state: HooksState = {
 *   ...baseState,
 *   files: createMockFileState(), // Empty but typed
 * };
 *
 * // Or with partial data:
 * const state: HooksState = {
 *   ...baseState,
 *   files: createMockFileState({ modifiedThisSession: ['/src/file.ts'] }),
 * };
 */
export function createMockFileState(overrides?: Partial<FileState>): FileState {
  return {
    modifiedSinceCheckpoint: [],
    modifiedThisSession: [],
    createdThisSession: [],
    ...overrides,
  };
}

/**
 * Creates a minimal HooksState object for testing.
 *
 * Provides sensible defaults for all required fields while allowing
 * overrides for specific test scenarios.
 *
 * @param overrides - Optional partial HooksState to merge
 * @returns A complete HooksState object
 *
 * @example
 * const state = createMockHooksState({
 *   files: createMockFileState({ modifiedThisSession: ['/src/test.ts'] }),
 * });
 */
export function createMockHooksState(overrides?: Partial<HooksState>): HooksState {
  return {
    session: {
      id: 'test-session',
      startedAt: new Date().toISOString(),
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
    files: createMockFileState(),
    devServers: {},
    ...overrides,
  };
}

// ============================================================================
// Telemetry Mocks
// ============================================================================

/**
 * Creates a mock ActiveAgentEntry for telemetry testing.
 *
 * @param overrides - Optional partial ActiveAgentEntry to merge
 * @returns A complete ActiveAgentEntry object
 *
 * @example
 * const entry = createMockActiveAgentEntry({
 *   agent_type: 'test-engineer',
 *   task_description: 'Write unit tests',
 * });
 */
export function createMockActiveAgentEntry(
  overrides?: Partial<ActiveAgentEntry>
): ActiveAgentEntry {
  return {
    agent_id: 'agent-' + Math.random().toString(36).substring(2, 9),
    agent_type: 'test-engineer',
    session_id: 'session-' + Math.random().toString(36).substring(2, 9),
    cwd: '/test/project',
    project_name: 'test-project',
    started_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Creates a mock ActiveAgentsState for telemetry testing.
 *
 * @param agents - Optional record of agent entries
 * @returns A complete ActiveAgentsState object
 *
 * @example
 * const state = createMockActiveAgentsState({
 *   'agent-1': createMockActiveAgentEntry({ agent_id: 'agent-1' }),
 * });
 */
export function createMockActiveAgentsState(
  agents?: Record<string, ActiveAgentEntry>
): ActiveAgentsState {
  return {
    agents: agents ?? {},
    last_updated: new Date().toISOString(),
  };
}

/**
 * Creates a mock ParsedTranscript for telemetry testing.
 *
 * @param overrides - Optional partial ParsedTranscript to merge
 * @returns A complete ParsedTranscript object
 *
 * @example
 * const transcript = createMockParsedTranscript({
 *   tools_used: ['Write', 'Bash'],
 *   files_modified: ['/src/test.ts'],
 * });
 */
export function createMockParsedTranscript(
  overrides?: Partial<ParsedTranscript>
): ParsedTranscript {
  return {
    files_modified: [],
    tools_used: [],
    error_count: 0,
    success_indicators: [],
    ...overrides,
  };
}

/**
 * Creates a mock TelemetryRecord for testing.
 *
 * @param overrides - Optional partial TelemetryRecord to merge
 * @returns A complete TelemetryRecord object
 *
 * @example
 * const record = createMockTelemetryRecord({
 *   agent_type: 'backend-engineer',
 *   success: true,
 * });
 */
export function createMockTelemetryRecord(
  overrides?: Partial<TelemetryRecord>
): TelemetryRecord {
  const now = new Date();
  const startedAt = new Date(now.getTime() - 3600000); // 1 hour ago

  return {
    type: 'subagent_complete',
    agent_id: 'agent-' + Math.random().toString(36).substring(2, 9),
    agent_type: 'test-engineer',
    session_id: 'session-' + Math.random().toString(36).substring(2, 9),
    project_name: 'test-project',
    started_at: startedAt.toISOString(),
    ended_at: now.toISOString(),
    duration_ms: 3600000,
    cwd: '/test/project',
    files_modified: [],
    tools_used: [],
    keywords: [],
    success: true,
    ...overrides,
  };
}

// ============================================================================
// Git Context Mocks
// ============================================================================

/**
 * Helper to create a mock implementation for execSync that handles
 * common git commands.
 *
 * @param config - Configuration for git command responses
 * @returns A function suitable for vi.mocked(execSync).mockImplementation()
 *
 * @example
 * vi.mocked(execSync).mockImplementation(
 *   createMockGitExecSync({
 *     branch: 'main',
 *     commit: 'abc1234',
 *     status: 'M file1.ts\nA file2.ts',
 *   })
 * );
 */
export function createMockGitExecSync(config: {
  branch?: string;
  commit?: string;
  status?: string;
  lastCommit?: string;
  recentCommits?: string;
  aheadBehind?: string;
  errors?: {
    branch?: boolean;
    commit?: boolean;
    status?: boolean;
    log?: boolean;
    revList?: boolean;
  };
}): (command: string) => string {
  return (command: string): string => {
    // Handle branch command
    if (command.includes('branch --show-current') || command.includes('--abbrev-ref HEAD')) {
      if (config.errors?.branch) {
        throw new Error('git error: not a git repository');
      }
      return (config.branch ?? 'main') + '\n';
    }

    // Handle commit/short hash command
    if (command.includes('--short HEAD') || command.includes('rev-parse HEAD')) {
      if (config.errors?.commit) {
        throw new Error('git error: no commits');
      }
      return (config.commit ?? 'abc1234') + '\n';
    }

    // Handle status command
    if (command.includes('status --porcelain')) {
      if (config.errors?.status) {
        throw new Error('git error: status failed');
      }
      return config.status ?? '';
    }

    // Handle log commands
    if (command.includes('log -1')) {
      if (config.errors?.log) {
        throw new Error('git error: log failed');
      }
      return (config.lastCommit ?? 'Initial commit (1 hour ago)') + '\n';
    }

    if (command.includes('log -5') || command.includes('log --oneline')) {
      if (config.errors?.log) {
        throw new Error('git error: log failed');
      }
      return (config.recentCommits ?? '- Initial commit') + '\n';
    }

    // Handle rev-list (ahead/behind)
    if (command.includes('rev-list')) {
      if (config.errors?.revList) {
        throw new Error('git error: no upstream');
      }
      return (config.aheadBehind ?? '0\t0') + '\n';
    }

    // Default: throw for unknown commands
    throw new Error('Unknown git command: ' + command);
  };
}
