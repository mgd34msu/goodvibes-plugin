/**
 * Tests for issues.ts re-export facade
 *
 * This test file ensures the facade file (issues.ts) achieves 100% coverage
 * by importing and testing the re-exported function.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

// Import from the facade file to ensure it's covered
import { handleProjectIssues } from '../../handlers/issues.js';
import type { ProjectIssuesArgs } from '../../handlers/issues.js';

// Mock fs module
vi.mock('fs');

// Helper to create mock Stats
function createMockStats(options: { isDirectory: boolean }): fs.Stats {
  return {
    isDirectory: () => options.isDirectory,
    isFile: () => !options.isDirectory,
    isSymbolicLink: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  } as fs.Stats;
}

// Helper to create mock Dirent
function createMockDirent(name: string, options: { isDirectory: boolean }): fs.Dirent {
  return {
    name,
    isDirectory: () => options.isDirectory,
    isFile: () => !options.isDirectory,
    isSymbolicLink: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    path: name,
    parentPath: '.',
  } as fs.Dirent;
}

// Helper to check if path is the test directory root
function isTestPath(pathStr: string): boolean {
  return pathStr.endsWith('test') || pathStr.endsWith('test\\') || pathStr.endsWith('test/') || pathStr === 'C:\\test' || pathStr === '/test';
}

describe('issues.ts facade', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console.error to suppress expected error output during tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Default: return valid empty JSON for any config file that might be read
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.resetAllMocks();
  });

  it('should re-export handleProjectIssues function', () => {
    expect(typeof handleProjectIssues).toBe('function');
  });

  it('should call re-exported handleProjectIssues with valid path', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = String(p);
      return isTestPath(pathStr);
    });
    vi.mocked(fs.statSync).mockReturnValue(createMockStats({ isDirectory: true }));
    vi.mocked(fs.readdirSync).mockReturnValue([] as unknown as ReturnType<typeof fs.readdirSync>);

    const args: ProjectIssuesArgs = { path: '/test' };
    const result = handleProjectIssues(args);

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('## Project Issues');
  });

  it('should call re-exported handleProjectIssues with include_low_priority', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = String(p);
      return isTestPath(pathStr);
    });
    vi.mocked(fs.statSync).mockReturnValue(createMockStats({ isDirectory: true }));
    vi.mocked(fs.readdirSync).mockReturnValue([] as unknown as ReturnType<typeof fs.readdirSync>);

    const args: ProjectIssuesArgs = {
      path: '/test',
      include_low_priority: true
    };
    const result = handleProjectIssues(args);

    expect(result).toBeDefined();
    expect(result.content[0].text).toContain('## Project Issues');
  });

  it('should call re-exported handleProjectIssues without arguments', () => {
    // When path is not specified, handler uses process.cwd()
    // Mock existsSync to pass path validation for cwd but not for config files
    const cwd = process.cwd();
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = String(p);
      // Pass validation for cwd but not for config files like tsconfig.json
      return pathStr === cwd || pathStr === cwd + '\\' || pathStr === cwd + '/';
    });
    vi.mocked(fs.statSync).mockReturnValue(createMockStats({ isDirectory: true }));
    vi.mocked(fs.readdirSync).mockReturnValue([] as unknown as ReturnType<typeof fs.readdirSync>);

    const result = handleProjectIssues({});

    expect(result).toBeDefined();
    expect(result.content[0].text).toContain('## Project Issues');
  });

  it('should handle path does not exist error through facade', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = handleProjectIssues({ path: '/nonexistent' });

    expect(result.content[0].text).toContain('Error: Path does not exist');
    expect(result.content[0].text).toContain('nonexistent');
  });

  it('should handle path is not directory error through facade', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = String(p);
      return pathStr.includes('file.txt');
    });
    vi.mocked(fs.statSync).mockReturnValue(createMockStats({ isDirectory: false }));

    const result = handleProjectIssues({ path: '/test/file.txt' });

    expect(result.content[0].text).toContain('Error: Path is not a directory');
    expect(result.content[0].text).toContain('file.txt'); // Platform-agnostic: checks filename only
  });

  it('should detect TODOs through the facade', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = String(p);
      return isTestPath(pathStr);
    });
    vi.mocked(fs.statSync).mockReturnValue(createMockStats({ isDirectory: true }));
    vi.mocked(fs.readdirSync).mockReturnValue([
      createMockDirent('app.ts', { isDirectory: false }),
    ] as unknown as ReturnType<typeof fs.readdirSync>);
    vi.mocked(fs.readFileSync).mockReturnValue('// FIXME: Critical bug\nconst x = 1;');

    const result = handleProjectIssues({ path: '/test' });
    const output = result.content[0].text;

    expect(output).toContain('High-Priority TODOs');
    expect(output).toContain('FIXME');
    expect(output).toContain('Critical bug');
  });

  it('should verify ProjectIssuesArgs type is exported', () => {
    // Type-only test - if this compiles, the type is properly exported
    const args: ProjectIssuesArgs = {
      path: '/test',
      include_low_priority: false,
    };

    expect(args.path).toBe('/test');
    expect(args.include_low_priority).toBe(false);
  });
});
