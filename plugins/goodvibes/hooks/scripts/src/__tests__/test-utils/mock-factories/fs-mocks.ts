/**
 * File System Mock Factories
 *
 * Provides properly typed mock factory functions for filesystem operations.
 */

import type { Dirent, Stats } from 'fs';

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

/**
 * Creates a mock readdir result for directory listings with file types.
 * Use this when mocking `fs.promises.readdir()` called with `{ withFileTypes: true }`.
 *
 * @param entries - Array of file/directory entries
 * @returns Array of properly typed Dirent objects
 *
 * @example
 * vi.mocked(fs.readdir).mockImplementation(async (dirPath: string) => {
 *   if (dirPath === '/test/project') {
 *     return createMockReaddirResult([
 *       { name: 'src', type: 'directory' },
 *       { name: 'file.ts', type: 'file' },
 *     ]);
 *   }
 *   return [];
 * });
 */
export function createMockReaddirResult(
  entries: Array<{ name: string; type: 'file' | 'directory' }>
): Dirent[] {
  return entries.map((entry) =>
    createMockDirent(entry.name, {
      isFile: entry.type === 'file',
      isDirectory: entry.type === 'directory',
    })
  );
}

/**
 * Creates a mock fs.Stats object for stat operations.
 *
 * @param options - Stats options (isDirectory, isFile, etc.)
 * @returns A properly typed Stats object
 *
 * @example
 * vi.mocked(fs.stat).mockResolvedValue(createMockStats({ isDirectory: true }));
 */
export function createMockStats(options?: {
  isFile?: boolean;
  isDirectory?: boolean;
  size?: number;
  mtime?: Date;
}): Stats {
  const isFile = options?.isFile ?? !options?.isDirectory;
  const isDirectory = options?.isDirectory ?? false;

  return {
    isFile: () => isFile,
    isDirectory: () => isDirectory,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    dev: 0,
    ino: 0,
    mode: 0,
    nlink: 1,
    uid: 0,
    gid: 0,
    rdev: 0,
    size: options?.size ?? 0,
    blksize: 4096,
    blocks: 0,
    atimeMs: Date.now(),
    mtimeMs: Date.now(),
    ctimeMs: Date.now(),
    birthtimeMs: Date.now(),
    atime: new Date(),
    mtime: options?.mtime ?? new Date(),
    ctime: new Date(),
    birthtime: new Date(),
  } as Stats;
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
}): (_command: string) => string {
  return (command: string): string => {
    // Handle branch command
    if (
      command.includes('branch --show-current') ||
      command.includes('--abbrev-ref HEAD')
    ) {
      if (config.errors?.branch) {
        throw new Error('git error: not a git repository');
      }
      return (config.branch ?? 'main') + '\n';
    }

    // Handle commit/short hash command
    if (
      command.includes('--short HEAD') ||
      command.includes('rev-parse HEAD')
    ) {
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
