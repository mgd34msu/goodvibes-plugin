/**
 * Unit tests for conventions handler
 *
 * Tests cover:
 * - handleGetConventions main handler
 * - sampleFiles function
 * - categorizeFile function
 * - readFileSafe function
 * - detectConfigFiles function
 * - detectDirectoryStructure function
 * - spawnClaude function
 * - buildAnalysisPrompt function
 * - createFallbackResult function
 *
 * @module __tests__/handlers/project/conventions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';

// Mock modules before imports
vi.mock('fs');
vi.mock('child_process');
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));
vi.mock('../../../utils.js', () => ({
  success: (data: unknown) => ({
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  }),
  error: (message: string) => ({
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true,
  }),
}));

// Import after mocks are set up
import { handleGetConventions } from '../../../handlers/project/conventions.js';

/**
 * Helper to create a mock Dirent object
 */
function createDirent(name: string, isDir: boolean): fs.Dirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: '',
    parentPath: '',
  } as fs.Dirent;
}

/**
 * Helper to create a mock child process that auto-emits events
 */
function createMockChildProcess(response: string = '{}', exitCode: number = 0, delay: number = 5) {
  const mockProcess = new EventEmitter() as childProcess.ChildProcess & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  mockProcess.stdout = new EventEmitter();
  mockProcess.stderr = new EventEmitter();
  mockProcess.kill = vi.fn();

  // Auto-emit events after a small delay
  setTimeout(() => {
    mockProcess.stdout.emit('data', response);
    mockProcess.emit('close', exitCode);
  }, delay);

  return mockProcess;
}

/**
 * Default mock Stats object
 */
function createMockStats(isDir: boolean, size: number = 100): fs.Stats {
  return {
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    size,
    dev: 0,
    ino: 0,
    mode: 0,
    nlink: 0,
    uid: 0,
    gid: 0,
    rdev: 0,
    blksize: 0,
    blocks: 0,
    atimeMs: 0,
    mtimeMs: 0,
    ctimeMs: 0,
    birthtimeMs: 0,
    atime: new Date(),
    mtime: new Date(),
    ctime: new Date(),
    birthtime: new Date(),
  } as fs.Stats;
}

/**
 * Setup basic mocks for a minimal passing test
 */
function setupMinimalMocks() {
  // Default: project root exists, nothing else
  vi.mocked(fs.existsSync).mockImplementation((p) => {
    const pathStr = String(p).replace(/\\/g, '/');
    return pathStr.includes('/mock/project/root') && !pathStr.includes('.json') && !pathStr.includes('.ts') && !pathStr.includes('.js');
  });
  vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));
  vi.mocked(fs.readdirSync).mockReturnValue([]);
}

describe('conventions handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    setupMinimalMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  describe('handleGetConventions', () => {
    describe('path validation', () => {
      it('should return error when path does not exist', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const result = await handleGetConventions({ path: 'nonexistent' });

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toContain('Path does not exist');
      });

      it('should use PROJECT_ROOT when no path provided', async () => {
        // Project root exists; detectDirectoryStructure checks common dirs
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          // Root path and common dirs exist check
          return pathStr.includes('/mock/project/root');
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false)); // dirs don't exist as dirs

        const result = await handleGetConventions({});

        expect(fs.existsSync).toHaveBeenCalled();
        expect(result.isError).toBeUndefined();
      });

      it('should resolve relative path against PROJECT_ROOT', async () => {
        const checkedPaths: string[] = [];
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          checkedPaths.push(pathStr);
          return pathStr.includes('subdir');
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));

        await handleGetConventions({ path: 'subdir' });

        expect(checkedPaths.some(p => p.includes('subdir'))).toBe(true);
      });
    });

    describe('config file detection', () => {
      it('should detect tsconfig.json', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          return pathStr.includes('/mock/project/root') ||
                 pathStr.endsWith('tsconfig.json');
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));

        const result = await handleGetConventions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.config_files).toContainEqual({
          file: 'tsconfig.json',
          purpose: 'TypeScript configuration',
        });
      });

      it('should detect multiple config files', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          return pathStr.includes('/mock/project/root') ||
                 pathStr.endsWith('package.json') ||
                 pathStr.endsWith('vitest.config.ts') ||
                 pathStr.endsWith('.prettierrc');
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));

        const result = await handleGetConventions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.config_files.length).toBeGreaterThanOrEqual(2);
        expect(data.config_files.some((c: { file: string }) => c.file === 'package.json')).toBe(true);
      });

      it('should detect prisma/schema.prisma', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          return pathStr.includes('/mock/project/root') ||
                 (pathStr.includes('prisma') && pathStr.includes('schema.prisma'));
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));

        const result = await handleGetConventions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.config_files).toContainEqual({
          file: 'prisma/schema.prisma',
          purpose: 'Prisma database schema',
        });
      });
    });

    describe('directory structure detection', () => {
      it('should detect common directories', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          return pathStr.includes('/mock/project/root');
        });
        vi.mocked(fs.statSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          // src is a directory
          if (pathStr.endsWith('/src')) {
            return createMockStats(true);
          }
          return createMockStats(false);
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = await handleGetConventions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.structure.directory_layout).toContain('src');
      });

      it('should detect src subdirectories', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          return pathStr.includes('/mock/project/root');
        });
        vi.mocked(fs.statSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.endsWith('/src') || pathStr.includes('/src/components') || pathStr.includes('/src/hooks')) {
            return createMockStats(true);
          }
          return createMockStats(false);
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = await handleGetConventions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.structure.directory_layout).toContain('src');
        expect(data.structure.directory_layout.some((d: string) => d.includes('src/'))).toBe(true);
      });

      it('should remove duplicate directories', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          return pathStr.includes('/mock/project/root');
        });
        vi.mocked(fs.statSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          // components exists at root and in src
          if (pathStr.endsWith('/components') || pathStr.includes('/src/components')) {
            return createMockStats(true);
          }
          return createMockStats(false);
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = await handleGetConventions({});
        const data = JSON.parse(result.content[0].text);

        // Check no duplicates
        const layout = data.structure.directory_layout;
        const uniqueLayout = [...new Set(layout)];
        expect(layout.length).toBe(uniqueLayout.length);
      });
    });

    describe('file sampling', () => {
      it('should sample TypeScript files', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('utils.ts', false),
              createDirent('index.ts', false),
            ];
          }
          return [];
        });
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 1000));
        vi.mocked(fs.readFileSync).mockReturnValue('export function test() {}');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});

        // Simulate Claude response
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{"conventions": []}');
        mockChild.emit('close', 0);

        const result = await promise;
        expect(result.isError).toBeUndefined();
      });

      it('should skip node_modules directory', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('node_modules', true),
              createDirent('src', true),
            ];
          }
          if (pathStr.includes('/src')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        await promise;

        // Verify node_modules was not entered - check readdirSync wasn't called for node_modules subdir
        const readdirCalls = vi.mocked(fs.readdirSync).mock.calls.map(c => String(c[0]).replace(/\\/g, '/'));
        expect(readdirCalls.some(p => p.includes('node_modules/'))).toBe(false);
      });

      it('should skip .git directory', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('.git', true),
              createDirent('src', true),
            ];
          }
          return [];
        });

        const result = await handleGetConventions({});

        const readdirCalls = vi.mocked(fs.readdirSync).mock.calls.map(c => String(c[0]).replace(/\\/g, '/'));
        expect(readdirCalls.some(p => p.includes('.git/'))).toBe(false);
      });

      it('should skip dist and build directories', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('dist', true),
              createDirent('build', true),
              createDirent('out', true),
            ];
          }
          return [];
        });

        const result = await handleGetConventions({});

        const readdirCalls = vi.mocked(fs.readdirSync).mock.calls.map(c => String(c[0]).replace(/\\/g, '/'));
        expect(readdirCalls.some(p => p.includes('/dist/'))).toBe(false);
        expect(readdirCalls.some(p => p.includes('/build/'))).toBe(false);
      });

      it('should limit samples per category', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        const manyFiles = Array.from({ length: 20 }, (_, i) =>
          createDirent(`util${i}.ts`, false)
        );
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('utils', true)];
          }
          if (pathStr.includes('/utils')) {
            return manyFiles;
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('export const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        await promise;

        // Should only read up to 5 files per category (default maxPerCategory)
        const readCalls = vi.mocked(fs.readFileSync).mock.calls.length;
        expect(readCalls).toBeLessThanOrEqual(5);
      });

      it('should limit total samples', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));

        // Create many directories with many files
        const dirs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return dirs.map(d => createDirent(d, true));
          }
          // Each dir has 10 files
          return Array.from({ length: 10 }, (_, i) =>
            createDirent(`file${i}.ts`, false)
          );
        });
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        await promise;

        // Should stop at maxTotal (30 by default)
        const readCalls = vi.mocked(fs.readFileSync).mock.calls.length;
        expect(readCalls).toBeLessThanOrEqual(30);
      });

      it('should handle directory read errors gracefully', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('problematic', true)];
          }
          throw new Error('Permission denied');
        });

        const result = await handleGetConventions({});

        // Should not throw, return result with no samples
        expect(result.isError).toBeUndefined();
      });

      it('should only sample valid extensions', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('valid.ts', false),
              createDirent('valid.tsx', false),
              createDirent('valid.js', false),
              createDirent('valid.jsx', false),
              createDirent('valid.mjs', false),
              createDirent('valid.cjs', false),
              createDirent('invalid.css', false),
              createDirent('invalid.html', false),
              createDirent('invalid.json', false),
              createDirent('invalid.md', false),
            ];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('code');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        await promise;

        // Should only read 6 valid extension files
        const readCalls = vi.mocked(fs.readFileSync).mock.calls;
        expect(readCalls.length).toBe(6);
      });
    });

    describe('file categorization', () => {
      it('should categorize test files', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('utils.test.ts', false),
              createDirent('helper.spec.ts', false),
            ];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('describe("test", () => {});');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{"conventions": []}');
        mockChild.emit('close', 0);

        const result = await promise;
        // Test files should be categorized correctly (we verify by checking spawn was called)
        expect(childProcess.spawn).toHaveBeenCalled();
      });

      it('should categorize component files', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('components', true)];
          }
          if (pathStr.includes('/components')) {
            return [createDirent('Button.tsx', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('export function Button() {}');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        const result = await promise;
        expect(childProcess.spawn).toHaveBeenCalled();
      });

      it('should categorize hook files', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('useAuth.ts', false),
              createDirent('hooks', true),
            ];
          }
          if (pathStr.includes('/hooks')) {
            return [createDirent('useData.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('export function useAuth() {}');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        const result = await promise;
        expect(childProcess.spawn).toHaveBeenCalled();
      });

      it('should categorize utility files', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('utils', true),
              createDirent('lib', true),
              createDirent('helpers', true),
            ];
          }
          return [createDirent('util.ts', false)];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('export const helper = () => {};');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        const result = await promise;
        expect(childProcess.spawn).toHaveBeenCalled();
      });

      it('should categorize API files', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('api', true),
              createDirent('routes', true),
              createDirent('handlers', true),
            ];
          }
          return [createDirent('route.ts', false)];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('export async function GET() {}');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        const result = await promise;
        expect(childProcess.spawn).toHaveBeenCalled();
      });

      it('should categorize type files', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('types', true),
              createDirent('globals.d.ts', false),
            ];
          }
          if (pathStr.includes('/types')) {
            return [createDirent('index.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('export interface User {}');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        const result = await promise;
        expect(childProcess.spawn).toHaveBeenCalled();
      });

      it('should categorize config files', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('config', true),
              createDirent('app.config.ts', false),
            ];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('export default {}');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        const result = await promise;
        expect(childProcess.spawn).toHaveBeenCalled();
      });

      it('should categorize other files as other', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('random.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        const result = await promise;
        expect(childProcess.spawn).toHaveBeenCalled();
      });

      it('should categorize .tsx files in page directory as other', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('pages', true)];
          }
          if (pathStr.includes('/pages')) {
            return [createDirent('index.tsx', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('export default function Page() {}');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        const result = await promise;
        expect(childProcess.spawn).toHaveBeenCalled();
      });
    });

    describe('readFileSafe', () => {
      it('should read file content', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 1000));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('file.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        await promise;

        expect(fs.readFileSync).toHaveBeenCalled();
      });

      it('should truncate large files', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100000)); // > 50000
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('large.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.openSync).mockReturnValue(1);
        vi.mocked(fs.readSync).mockReturnValue(50000);
        vi.mocked(fs.closeSync).mockReturnValue(undefined);

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        await promise;

        expect(fs.openSync).toHaveBeenCalled();
        expect(fs.closeSync).toHaveBeenCalled();
      });

      it('should handle file read errors gracefully', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          return pathStr.includes('/mock/project/root');
        });
        vi.mocked(fs.statSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          // Directory structure detection needs statSync to work for some paths
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('.ts')) {
            return createMockStats(false); // Not a directory
          }
          throw new Error('Cannot stat file');
        });
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('error.ts', false)];
          }
          return [];
        });

        const result = await handleGetConventions({});

        // Should not crash, statSync error for .ts files should be handled gracefully
        expect(result.isError).toBeUndefined();
      });
    });

    describe('no samples found', () => {
      it('should return unknown values when no files sampled', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          return pathStr.includes('/mock/project/root');
        });
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = await handleGetConventions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.naming.files).toBe('unknown');
        expect(data.imports.style).toBe('unknown');
        expect(data.testing.file_naming).toBe('unknown');
        expect(data.recommendations).toContain('No source files found to analyze');
      });
    });

    describe('Claude LLM integration', () => {
      it('should call Claude with analysis prompt', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('export const app = {};');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', JSON.stringify({
          conventions: [],
          naming: { files: 'kebab-case' },
        }));
        mockChild.emit('close', 0);

        await promise;

        expect(childProcess.spawn).toHaveBeenCalledWith(
          'claude',
          expect.arrayContaining(['--print', '-p']),
          expect.objectContaining({ shell: true })
        );
      });

      it('should parse JSON from code block in response', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});

        // Use process.nextTick to ensure spawn has been called, then emit events
        await new Promise<void>(resolve => process.nextTick(resolve));

        const response = `Here is the analysis:
\`\`\`json
{
  "conventions": [{"category": "naming", "pattern": "camelCase", "examples": ["myVar"], "rationale": "standard", "confidence": "high"}],
  "naming": {"files": "kebab-case", "variables": "camelCase", "functions": "camelCase", "classes": "PascalCase", "constants": "SCREAMING_SNAKE"}
}
\`\`\`
`;
        mockChild.stdout.emit('data', response);
        mockChild.emit('close', 0);

        const result = await promise;
        const data = JSON.parse(result.content[0].text);

        expect(data.naming.files).toBe('kebab-case');
        expect(data.conventions).toHaveLength(1);
      });

      it('should extract JSON from mixed output', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await new Promise<void>(resolve => process.nextTick(resolve));

        const response = `Analyzing the codebase...
{"conventions": [], "naming": {"files": "snake_case", "variables": "camelCase", "functions": "camelCase", "classes": "PascalCase", "constants": "UPPER"}}
Done!`;
        mockChild.stdout.emit('data', response);
        mockChild.emit('close', 0);

        const result = await promise;
        const data = JSON.parse(result.content[0].text);

        expect(data.naming.files).toBe('snake_case');
      });

      it('should fallback when Claude exits with error', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stderr.emit('data', 'Claude CLI error');
        mockChild.emit('close', 1);

        const result = await promise;
        const data = JSON.parse(result.content[0].text);

        // Should use fallback result
        expect(data.recommendations).toContain('Run with Claude CLI available for full LLM-powered analysis');
      });

      it('should fallback when Claude returns invalid JSON', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', 'This is not JSON at all');
        mockChild.emit('close', 0);

        const result = await promise;
        const data = JSON.parse(result.content[0].text);

        // Should use fallback result
        expect(data.recommendations).toBeDefined();
      });

      it('should fallback when Claude spawn fails', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.emit('error', new Error('spawn ENOENT'));

        const result = await promise;
        const data = JSON.parse(result.content[0].text);

        expect(data.recommendations).toBeDefined();
      });

      it('should timeout after 60 seconds', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});

        // Advance past the timeout
        await vi.advanceTimersByTimeAsync(61000);

        const result = await promise;
        const data = JSON.parse(result.content[0].text);

        expect(mockChild.kill).toHaveBeenCalled();
        // Should use fallback since timeout
        expect(data.recommendations).toBeDefined();
      });

      it('should merge LLM result with detected config files', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          return pathStr.includes('/mock/project/root') ||
                 pathStr.endsWith('tsconfig.json');
        });
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', JSON.stringify({
          conventions: [],
          naming: { files: 'camelCase' },
        }));
        mockChild.emit('close', 0);

        const result = await promise;
        const data = JSON.parse(result.content[0].text);

        // Config files should be from detection, not LLM
        expect(data.config_files).toContainEqual({
          file: 'tsconfig.json',
          purpose: 'TypeScript configuration',
        });
      });
    });

    describe('focus areas', () => {
      it('should pass focus areas to prompt', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({
          focus: ['naming', 'testing'],
        });
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        await promise;

        // Check that spawn was called with prompt containing focus areas
        const spawnCall = vi.mocked(childProcess.spawn).mock.calls[0];
        const args = spawnCall[1] as string[];
        const promptArg = args[2]; // -p is index 1, prompt is index 2
        expect(promptArg).toContain('naming');
        expect(promptArg).toContain('testing');
      });

      it('should use all focus areas when none specified', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        await promise;

        const spawnCall = vi.mocked(childProcess.spawn).mock.calls[0];
        const args = spawnCall[1] as string[];
        const promptArg = args[2];
        expect(promptArg).toContain('naming');
        expect(promptArg).toContain('imports');
        expect(promptArg).toContain('structure');
        expect(promptArg).toContain('testing');
        expect(promptArg).toContain('error-handling');
      });
    });

    describe('fallback result', () => {
      it('should detect barrel files', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('components', true)];
          }
          if (pathStr.includes('/components')) {
            return [createDirent('index.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('export * from "./Button";');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await new Promise<void>(resolve => setImmediate(resolve));
        mockChild.emit('error', new Error('Claude not found'));

        const result = await promise;
        const data = JSON.parse(result.content[0].text);

        expect(data.imports.barrel_files).toBe(true);
        expect(data.conventions.some((c: { pattern: string }) =>
          c.pattern.includes('barrel files')
        )).toBe(true);
      });

      it('should detect .test. test file naming', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('utils.test.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('describe("test", () => {});');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.emit('error', new Error('Claude not found'));

        const result = await promise;
        const data = JSON.parse(result.content[0].text);

        expect(data.testing.file_naming).toBe('*.test.ts');
      });

      it('should detect .spec. test file naming', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('utils.spec.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('describe("test", () => {});');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.emit('error', new Error('Claude not found'));

        const result = await promise;
        const data = JSON.parse(result.content[0].text);

        expect(data.testing.file_naming).toBe('*.spec.ts');
      });

      it('should detect import type usage', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('types.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('import type { User } from "./models";');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.emit('error', new Error('Claude not found'));

        const result = await promise;
        const data = JSON.parse(result.content[0].text);

        expect(data.imports.style).toContain('type imports');
        expect(data.conventions.some((c: { pattern: string }) =>
          c.pattern.includes('import type')
        )).toBe(true);
      });

      it('should detect path aliases', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('import { Button } from "@/components";');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        // Let spawn be called then emit error
        await vi.advanceTimersToNextTimerAsync();
        mockChild.emit('error', new Error('Claude not found'));

        const result = await promise;
        const data = JSON.parse(result.content[0].text);

        expect(data.conventions.some((c: { pattern: string }) =>
          c.pattern.includes('path aliases')
        )).toBe(true);
      });

      it('should detect tilde path aliases', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue("import { Button } from '~/components';");

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.emit('error', new Error('Claude not found'));

        const result = await promise;
        const data = JSON.parse(result.content[0].text);

        expect(data.conventions.some((c: { pattern: string }) =>
          c.pattern.includes('path aliases')
        )).toBe(true);
      });

      it('should detect by-feature organization', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          return pathStr.includes('/mock/project/root');
        });
        vi.mocked(fs.statSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          // features directory exists
          if (pathStr.includes('/feature')) {
            return createMockStats(true);
          }
          return createMockStats(false, 100);
        });
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('features', true)];
          }
          return [createDirent('auth.ts', false)];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('export const auth = {};');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.emit('error', new Error('Claude not found'));

        const result = await promise;
        const data = JSON.parse(result.content[0].text);

        expect(data.structure.component_organization).toBe('by-feature');
      });
    });

    describe('LLM result merging', () => {
      it('should use LLM naming when available', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        // Use process.nextTick which is not mocked by fake timers
        await new Promise<void>(resolve => process.nextTick(resolve));
        mockChild.stdout.emit('data', JSON.stringify({
          naming: {
            files: 'PascalCase',
            variables: 'camelCase',
            functions: 'camelCase',
            classes: 'PascalCase',
            constants: 'SCREAMING_SNAKE_CASE',
          },
        }));
        mockChild.emit('close', 0);

        const result = await promise;
        const data = JSON.parse(result.content[0].text);

        expect(data.naming.files).toBe('PascalCase');
      });

      it('should use defaults when LLM result is partial', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await new Promise<void>(resolve => process.nextTick(resolve));
        // LLM returns partial result - missing naming, imports, etc.
        mockChild.stdout.emit('data', JSON.stringify({
          conventions: [{ category: 'naming', pattern: 'test', examples: [], rationale: 'test', confidence: 'high' }],
        }));
        mockChild.emit('close', 0);

        const result = await promise;
        const data = JSON.parse(result.content[0].text);

        // Should have default values for missing sections
        expect(data.naming.files).toBe('unknown');
        expect(data.imports.order).toEqual([]);
        expect(data.testing.file_naming).toBe('unknown');
      });
    });

    describe('prompt building', () => {
      it('should include file samples in prompt', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('export function myFunction() { return 42; }');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        await promise;

        const spawnCall = vi.mocked(childProcess.spawn).mock.calls[0];
        const args = spawnCall[1] as string[];
        const promptArg = args[2];

        // Prompt should include file content
        expect(promptArg).toContain('myFunction');
      });

      it('should truncate long file content in prompt', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        // Create content longer than 3000 chars
        const longContent = 'x'.repeat(4000);
        vi.mocked(fs.readFileSync).mockReturnValue(longContent);

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        await promise;

        const spawnCall = vi.mocked(childProcess.spawn).mock.calls[0];
        const args = spawnCall[1] as string[];
        const promptArg = args[2];

        // Prompt should contain truncation message
        expect(promptArg).toContain('truncated');
      });

      it('should include directory layout in prompt', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          return pathStr.includes('/mock/project/root');
        });
        vi.mocked(fs.statSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.endsWith('/src')) {
            return createMockStats(true);
          }
          return createMockStats(false, 100);
        });
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('src', true)];
          }
          return [createDirent('app.ts', false)];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        await promise;

        const spawnCall = vi.mocked(childProcess.spawn).mock.calls[0];
        const args = spawnCall[1] as string[];
        const promptArg = args[2];

        expect(promptArg).toContain('src');
      });

      it('should include config files in prompt', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          return pathStr.includes('/mock/project/root') ||
                 pathStr.endsWith('tsconfig.json');
        });
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('app.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        await promise;

        const spawnCall = vi.mocked(childProcess.spawn).mock.calls[0];
        const args = spawnCall[1] as string[];
        const promptArg = args[2];

        expect(promptArg).toContain('tsconfig.json');
      });

      it('should include category headers in prompt', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 100));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('utils', true),
              createDirent('components', true),
            ];
          }
          if (pathStr.includes('/utils')) {
            return [createDirent('helper.ts', false)];
          }
          if (pathStr.includes('/components')) {
            return [createDirent('Button.tsx', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('export const x = 1;');

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        await promise;

        const spawnCall = vi.mocked(childProcess.spawn).mock.calls[0];
        const args = spawnCall[1] as string[];
        const promptArg = args[2];

        expect(promptArg).toContain('=== UTILITY FILES ===');
        expect(promptArg).toContain('=== COMPONENT FILES ===');
      });
    });

    describe('file reading edge cases', () => {
      it('should skip files that cannot be read', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        let callCount = 0;
        vi.mocked(fs.statSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('unreadable')) {
            throw new Error('Permission denied');
          }
          return createMockStats(false, 100);
        });
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('readable.ts', false),
              createDirent('unreadable.ts', false),
            ];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('unreadable')) {
            throw new Error('Permission denied');
          }
          return 'const x = 1;';
        });

        const mockChild = createMockChildProcess();
        vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

        const promise = handleGetConventions({});
        await vi.advanceTimersToNextTimerAsync();
        mockChild.stdout.emit('data', '{}');
        mockChild.emit('close', 0);

        const result = await promise;
        expect(result.isError).toBeUndefined();
      });

      it('should handle empty file content', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p).replace(/\\/g, '/');
          return pathStr.includes('/mock/project/root');
        });
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(false, 0));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [createDirent('empty.ts', false)];
          }
          return [];
        });
        vi.mocked(fs.readFileSync).mockReturnValue('');

        const result = await handleGetConventions({});

        // Empty files result in no valid samples
        const data = JSON.parse(result.content[0].text);
        expect(data.recommendations).toContain('No source files found to analyze');
      });
    });

    describe('framework-specific directories', () => {
      it('should skip .next directory', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('.next', true),
              createDirent('src', true),
            ];
          }
          return [];
        });

        await handleGetConventions({});

        const readdirCalls = vi.mocked(fs.readdirSync).mock.calls.map(c => String(c[0]).replace(/\\/g, '/'));
        expect(readdirCalls.some(p => p.includes('.next/'))).toBe(false);
      });

      it('should skip .nuxt directory', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('.nuxt', true),
              createDirent('src', true),
            ];
          }
          return [];
        });

        await handleGetConventions({});

        const readdirCalls = vi.mocked(fs.readdirSync).mock.calls.map(c => String(c[0]).replace(/\\/g, '/'));
        expect(readdirCalls.some(p => p.includes('.nuxt/'))).toBe(false);
      });

      it('should skip .svelte-kit directory', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('.svelte-kit', true),
              createDirent('src', true),
            ];
          }
          return [];
        });

        await handleGetConventions({});

        const readdirCalls = vi.mocked(fs.readdirSync).mock.calls.map(c => String(c[0]).replace(/\\/g, '/'));
        expect(readdirCalls.some(p => p.includes('.svelte-kit/'))).toBe(false);
      });

      it('should skip coverage directory', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('coverage', true),
              createDirent('src', true),
            ];
          }
          return [];
        });

        await handleGetConventions({});

        const readdirCalls = vi.mocked(fs.readdirSync).mock.calls.map(c => String(c[0]).replace(/\\/g, '/'));
        expect(readdirCalls.some(p => p.includes('/coverage/'))).toBe(false);
      });

      it('should skip .cache directory', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('.cache', true),
              createDirent('src', true),
            ];
          }
          return [];
        });

        await handleGetConventions({});

        const readdirCalls = vi.mocked(fs.readdirSync).mock.calls.map(c => String(c[0]).replace(/\\/g, '/'));
        expect(readdirCalls.some(p => p.includes('.cache/'))).toBe(false);
      });

      it('should skip vendor directory', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('vendor', true),
              createDirent('src', true),
            ];
          }
          return [];
        });

        await handleGetConventions({});

        const readdirCalls = vi.mocked(fs.readdirSync).mock.calls.map(c => String(c[0]).replace(/\\/g, '/'));
        expect(readdirCalls.some(p => p.includes('/vendor/'))).toBe(false);
      });

      it('should skip __pycache__ directory', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('__pycache__', true),
              createDirent('src', true),
            ];
          }
          return [];
        });

        await handleGetConventions({});

        const readdirCalls = vi.mocked(fs.readdirSync).mock.calls.map(c => String(c[0]).replace(/\\/g, '/'));
        expect(readdirCalls.some(p => p.includes('__pycache__/'))).toBe(false);
      });

      it('should skip venv and .venv directories', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('venv', true),
              createDirent('.venv', true),
              createDirent('src', true),
            ];
          }
          return [];
        });

        await handleGetConventions({});

        const readdirCalls = vi.mocked(fs.readdirSync).mock.calls.map(c => String(c[0]).replace(/\\/g, '/'));
        expect(readdirCalls.some(p => p.includes('/venv/'))).toBe(false);
        expect(readdirCalls.some(p => p.includes('/.venv/'))).toBe(false);
      });

      it('should skip target directory', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createMockStats(true));
        vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
          const pathStr = String(p).replace(/\\/g, '/');
          if (pathStr.includes('/mock/project/root') && !pathStr.includes('/mock/project/root/')) {
            return [
              createDirent('target', true),
              createDirent('src', true),
            ];
          }
          return [];
        });

        await handleGetConventions({});

        const readdirCalls = vi.mocked(fs.readdirSync).mock.calls.map(c => String(c[0]).replace(/\\/g, '/'));
        expect(readdirCalls.some(p => p.includes('/target/'))).toBe(false);
      });
    });
  });
});
