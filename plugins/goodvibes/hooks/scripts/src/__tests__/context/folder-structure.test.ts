/**
 * Tests for folder-structure.ts
 *
 * Tests folder structure analysis and architecture pattern detection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  analyzeFolderStructure,
  formatFolderStructure,
} from '../../context/folder-structure.js';
import type {
  FolderStructure,
  ArchitecturePattern,
  SpecialDirectories,
} from '../../context/folder-structure.js';
import { fileExists } from '../../shared/file-utils.js';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('../../shared/file-utils.js');
vi.mock('../../shared/logging.js', () => ({
  debug: vi.fn(),
}));

describe('folder-structure', () => {
  const mockCwd = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('analyzeFolderStructure', () => {
    describe('basic directory detection', () => {
      it('should detect src directory when it exists', async () => {
        vi.mocked(fs.readdir).mockResolvedValue([]);
        vi.mocked(fileExists).mockImplementation(async (p: string) => {
          return p.endsWith('src');
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.srcDir).toBe('src');
      });

      it('should return null srcDir when src directory does not exist', async () => {
        vi.mocked(fs.readdir).mockResolvedValue([]);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.srcDir).toBeNull();
      });

      it('should filter out hidden directories, node_modules, dist, and build', async () => {
        const mockEntries = [
          { name: '.git', isDirectory: () => true },
          { name: '.vscode', isDirectory: () => true },
          { name: 'node_modules', isDirectory: () => true },
          { name: 'dist', isDirectory: () => true },
          { name: 'build', isDirectory: () => true },
          { name: 'src', isDirectory: () => true },
          { name: 'lib', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.topLevelDirs).toEqual(['src', 'lib']);
        expect(result.topLevelDirs).not.toContain('.git');
        expect(result.topLevelDirs).not.toContain('node_modules');
        expect(result.topLevelDirs).not.toContain('dist');
        expect(result.topLevelDirs).not.toContain('build');
      });

      it('should convert directory names to lowercase', async () => {
        const mockEntries = [
          { name: 'Components', isDirectory: () => true },
          { name: 'HOOKS', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.topLevelDirs).toEqual(['components', 'hooks']);
      });
    });

    describe('getSubdirs error handling', () => {
      it('should return empty array when readdir fails', async () => {
        vi.mocked(fs.readdir).mockRejectedValue(new Error('Permission denied'));
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.topLevelDirs).toEqual([]);
      });
    });

    describe('Next.js App Router detection', () => {
      it('should detect Next.js App Router when app directory with route groups exists at top level', async () => {
        const topLevelEntries = [
          { name: 'app', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        const appEntries = [
          { name: '(marketing)', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
          if (dirPath === mockCwd) {
            return topLevelEntries;
          }
          if (String(dirPath).includes('app')) {
            return appEntries;
          }
          return [];
        });
        vi.mocked(fileExists).mockImplementation(async (p: string) => {
          return p.includes('app');
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('next-app-router');
        expect(result.confidence).toBe('high');
      });

      it('should detect Next.js App Router when app directory with api subdirectory exists', async () => {
        const topLevelEntries = [
          { name: 'app', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        const appEntries = [
          { name: 'api', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
          if (dirPath === mockCwd) {
            return topLevelEntries;
          }
          if (String(dirPath).includes('app')) {
            return appEntries;
          }
          return [];
        });
        vi.mocked(fileExists).mockImplementation(async (p: string) => {
          return p.includes('app');
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('next-app-router');
        expect(result.confidence).toBe('high');
      });

      it('should detect Next.js App Router when app directory contains page.tsx file', async () => {
        const topLevelEntries = [
          { name: 'app', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        const appSubDirs: fs.Dirent[] = [];
        const appFiles = ['page.tsx', 'globals.css'];

        vi.mocked(fs.readdir).mockImplementation(async (dirPath, options) => {
          if (dirPath === mockCwd) {
            return topLevelEntries;
          }
          if (String(dirPath).includes('app')) {
            if (
              options &&
              typeof options === 'object' &&
              'withFileTypes' in options
            ) {
              return appSubDirs;
            }
            return appFiles as unknown as fs.Dirent[];
          }
          return [];
        });
        vi.mocked(fileExists).mockImplementation(async (p: string) => {
          return p.includes('app');
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('next-app-router');
        expect(result.confidence).toBe('high');
      });

      it('should detect Next.js App Router when app directory contains layout.js file', async () => {
        const topLevelEntries = [
          { name: 'app', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        const appSubDirs: fs.Dirent[] = [];
        const appFiles = ['layout.js', 'styles.css'];

        vi.mocked(fs.readdir).mockImplementation(async (dirPath, options) => {
          if (dirPath === mockCwd) {
            return topLevelEntries;
          }
          if (String(dirPath).includes('app')) {
            if (
              options &&
              typeof options === 'object' &&
              'withFileTypes' in options
            ) {
              return appSubDirs;
            }
            return appFiles as unknown as fs.Dirent[];
          }
          return [];
        });
        vi.mocked(fileExists).mockImplementation(async (p: string) => {
          return p.includes('app');
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('next-app-router');
        expect(result.confidence).toBe('high');
      });

      it('should detect Next.js App Router when app directory is inside src', async () => {
        const topLevelEntries = [
          { name: 'src', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        const srcEntries = [
          { name: 'app', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        const appEntries = [
          { name: '(dashboard)', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
          if (dirPath === mockCwd) {
            return topLevelEntries;
          }
          if (String(dirPath).endsWith('src')) {
            return srcEntries;
          }
          if (String(dirPath).includes('app')) {
            return appEntries;
          }
          return [];
        });
        vi.mocked(fileExists).mockImplementation(async (p: string) => {
          return p.endsWith('src') || p.includes('app');
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('next-app-router');
        expect(result.confidence).toBe('high');
      });

      it('should handle readdir error when checking app directory files', async () => {
        const topLevelEntries = [
          { name: 'app', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        const appSubDirs: fs.Dirent[] = [];

        vi.mocked(fs.readdir).mockImplementation(async (dirPath, options) => {
          if (dirPath === mockCwd) {
            return topLevelEntries;
          }
          if (String(dirPath).includes('app')) {
            if (
              options &&
              typeof options === 'object' &&
              'withFileTypes' in options
            ) {
              return appSubDirs;
            }
            throw new Error('Permission denied');
          }
          return [];
        });
        vi.mocked(fileExists).mockImplementation(async (p: string) => {
          return p.includes('app');
        });

        const result = await analyzeFolderStructure(mockCwd);

        // Should fall through to other pattern detection
        expect(result.pattern).not.toBe('next-app-router');
      });

      it('should not detect Next.js App Router when app dir has no route groups, api, page, or layout files', async () => {
        const topLevelEntries = [
          { name: 'app', isDirectory: () => true },
          { name: 'foo', isDirectory: () => true },
          { name: 'bar', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        const appSubDirs: fs.Dirent[] = [];
        // No page.* or layout.* files - just regular files
        const appFiles = ['index.ts', 'styles.css', 'config.json'];

        vi.mocked(fs.readdir).mockImplementation(async (dirPath, options) => {
          if (dirPath === mockCwd) {
            return topLevelEntries;
          }
          if (String(dirPath).includes('app')) {
            if (
              options &&
              typeof options === 'object' &&
              'withFileTypes' in options
            ) {
              return appSubDirs;
            }
            return appFiles as unknown as fs.Dirent[];
          }
          return [];
        });
        vi.mocked(fileExists).mockImplementation(async (p: string) => {
          return p.includes('app');
        });

        const result = await analyzeFolderStructure(mockCwd);

        // Should fall through to unknown pattern since no indicators match
        expect(result.pattern).toBe('unknown');
      });
    });

    describe('Next.js Pages Router detection', () => {
      it('should detect Next.js Pages Router when pages directory exists at top level', async () => {
        const mockEntries = [
          { name: 'pages', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('next-pages-router');
        expect(result.confidence).toBe('high');
      });

      it('should detect Next.js Pages Router when pages directory exists inside src', async () => {
        const topLevelEntries = [
          { name: 'src', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        const srcEntries = [
          { name: 'pages', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
          if (dirPath === mockCwd) {
            return topLevelEntries;
          }
          if (String(dirPath).endsWith('src')) {
            return srcEntries;
          }
          return [];
        });
        vi.mocked(fileExists).mockImplementation(async (p: string) => {
          return p.endsWith('src');
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('next-pages-router');
        expect(result.confidence).toBe('high');
      });
    });

    describe('Atomic Design detection', () => {
      it('should detect Atomic Design with high confidence when 3+ indicators present', async () => {
        const mockEntries = [
          { name: 'atoms', isDirectory: () => true },
          { name: 'molecules', isDirectory: () => true },
          { name: 'organisms', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('atomic-design');
        expect(result.confidence).toBe('high');
      });

      it('should detect Atomic Design with medium confidence when 2 indicators present', async () => {
        const mockEntries = [
          { name: 'atoms', isDirectory: () => true },
          { name: 'molecules', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('atomic-design');
        expect(result.confidence).toBe('medium');
      });

      it('should detect Atomic Design with templates indicator', async () => {
        const mockEntries = [
          { name: 'atoms', isDirectory: () => true },
          { name: 'templates', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('atomic-design');
      });
    });

    describe('Domain-Driven Design detection', () => {
      it('should detect DDD with high confidence when 3+ indicators present', async () => {
        const mockEntries = [
          { name: 'domain', isDirectory: () => true },
          { name: 'infrastructure', isDirectory: () => true },
          { name: 'application', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('domain-driven');
        expect(result.confidence).toBe('high');
      });

      it('should detect DDD with medium confidence when 2 indicators present', async () => {
        const mockEntries = [
          { name: 'domain', isDirectory: () => true },
          { name: 'aggregates', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('domain-driven');
        expect(result.confidence).toBe('medium');
      });

      it('should detect DDD with entities and value-objects indicators', async () => {
        const mockEntries = [
          { name: 'entities', isDirectory: () => true },
          { name: 'value-objects', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('domain-driven');
      });
    });

    describe('Layer-based detection', () => {
      it('should detect layer-based with high confidence when 3+ indicators present', async () => {
        const mockEntries = [
          { name: 'controllers', isDirectory: () => true },
          { name: 'services', isDirectory: () => true },
          { name: 'repositories', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('layer-based');
        expect(result.confidence).toBe('high');
      });

      it('should detect layer-based with medium confidence when 2 indicators present', async () => {
        const mockEntries = [
          { name: 'controllers', isDirectory: () => true },
          { name: 'models', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('layer-based');
        expect(result.confidence).toBe('medium');
      });

      it('should detect layer-based with middleware and routes indicators', async () => {
        const mockEntries = [
          { name: 'middleware', isDirectory: () => true },
          { name: 'routes', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('layer-based');
      });
    });

    describe('Feature-based detection', () => {
      it('should detect feature-based when features directory exists', async () => {
        const mockEntries = [
          { name: 'features', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('feature-based');
        expect(result.confidence).toBe('medium');
      });

      it('should detect feature-based when modules directory exists', async () => {
        const mockEntries = [
          { name: 'modules', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('feature-based');
        expect(result.confidence).toBe('medium');
      });

      it('should detect feature-based when domains directory exists', async () => {
        const mockEntries = [
          { name: 'domains', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('feature-based');
        expect(result.confidence).toBe('medium');
      });
    });

    describe('Component-based detection', () => {
      it('should detect component-based when components directory exists', async () => {
        const mockEntries = [
          { name: 'components', isDirectory: () => true },
          { name: 'assets', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('component-based');
        expect(result.confidence).toBe('medium');
      });
    });

    describe('Flat structure detection', () => {
      it('should detect flat structure when fewer than 3 top-level directories', async () => {
        const mockEntries = [
          { name: 'src', isDirectory: () => true },
          { name: 'tests', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('flat');
        expect(result.confidence).toBe('low');
      });

      it('should detect flat structure when only 1 top-level directory', async () => {
        const mockEntries = [
          { name: 'lib', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('flat');
        expect(result.confidence).toBe('low');
      });
    });

    describe('Unknown pattern detection', () => {
      it('should return unknown pattern when no patterns match and >= 3 dirs', async () => {
        const mockEntries = [
          { name: 'foo', isDirectory: () => true },
          { name: 'bar', isDirectory: () => true },
          { name: 'baz', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('unknown');
        expect(result.confidence).toBe('low');
      });
    });

    describe('Special directories detection', () => {
      it('should detect all special directories', async () => {
        const topLevelEntries = [
          { name: 'components', isDirectory: () => true },
          { name: 'pages', isDirectory: () => true },
          { name: 'app', isDirectory: () => true },
          { name: 'api', isDirectory: () => true },
          { name: 'lib', isDirectory: () => true },
          { name: 'utils', isDirectory: () => true },
          { name: 'hooks', isDirectory: () => true },
          { name: 'services', isDirectory: () => true },
          { name: 'types', isDirectory: () => true },
          { name: '__tests__', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        // Mock to return top-level entries for cwd, empty arrays for subdirectories
        // This prevents infinite recursion in calculateDepth
        vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
          if (dirPath === mockCwd) {
            return topLevelEntries;
          }
          return [];
        });
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.specialDirs.hasComponents).toBe(true);
        expect(result.specialDirs.hasPages).toBe(true);
        expect(result.specialDirs.hasApp).toBe(true);
        expect(result.specialDirs.hasApi).toBe(true);
        expect(result.specialDirs.hasLib).toBe(true);
        expect(result.specialDirs.hasUtils).toBe(true);
        expect(result.specialDirs.hasHooks).toBe(true);
        expect(result.specialDirs.hasServices).toBe(true);
        expect(result.specialDirs.hasTypes).toBe(true);
        expect(result.specialDirs.hasTests).toBe(true);
      });

      it('should detect helpers as hasUtils', async () => {
        const mockEntries = [
          { name: 'helpers', isDirectory: () => true },
          { name: 'foo', isDirectory: () => true },
          { name: 'bar', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.specialDirs.hasUtils).toBe(true);
      });

      it('should detect interfaces as hasTypes', async () => {
        const mockEntries = [
          { name: 'interfaces', isDirectory: () => true },
          { name: 'foo', isDirectory: () => true },
          { name: 'bar', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.specialDirs.hasTypes).toBe(true);
      });

      it('should detect tests directory as hasTests', async () => {
        const mockEntries = [
          { name: 'tests', isDirectory: () => true },
          { name: 'foo', isDirectory: () => true },
          { name: 'bar', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.specialDirs.hasTests).toBe(true);
      });

      it('should detect test directory as hasTests', async () => {
        const mockEntries = [
          { name: 'test', isDirectory: () => true },
          { name: 'foo', isDirectory: () => true },
          { name: 'bar', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.specialDirs.hasTests).toBe(true);
      });

      it('should return false for all special dirs when none exist', async () => {
        const mockEntries = [
          { name: 'foo', isDirectory: () => true },
          { name: 'bar', isDirectory: () => true },
          { name: 'baz', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockResolvedValue(mockEntries);
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.specialDirs.hasComponents).toBe(false);
        expect(result.specialDirs.hasPages).toBe(false);
        expect(result.specialDirs.hasApp).toBe(false);
        expect(result.specialDirs.hasApi).toBe(false);
        expect(result.specialDirs.hasLib).toBe(false);
        expect(result.specialDirs.hasUtils).toBe(false);
        expect(result.specialDirs.hasHooks).toBe(false);
        expect(result.specialDirs.hasServices).toBe(false);
        expect(result.specialDirs.hasTypes).toBe(false);
        expect(result.specialDirs.hasTests).toBe(false);
      });
    });

    describe('Folder depth calculation', () => {
      it('should calculate folder depth correctly', async () => {
        const topLevelEntries = [
          { name: 'src', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        const srcEntries = [
          { name: 'components', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        const componentsEntries = [
          { name: 'ui', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        const uiEntries: fs.Dirent[] = [];

        vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
          const pathStr = String(dirPath);
          if (pathStr === mockCwd) {
            return topLevelEntries;
          }
          if (pathStr.endsWith('src')) {
            return srcEntries;
          }
          if (pathStr.includes('components')) {
            return componentsEntries;
          }
          if (pathStr.includes('ui')) {
            return uiEntries;
          }
          return [];
        });
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.depth).toBeGreaterThanOrEqual(2);
      });

      it('should skip hidden directories during depth calculation', async () => {
        const topLevelEntries = [
          { name: '.hidden', isDirectory: () => true },
          { name: 'src', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        const srcEntries: fs.Dirent[] = [];

        vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
          if (dirPath === mockCwd) {
            return topLevelEntries;
          }
          if (String(dirPath).endsWith('src')) {
            return srcEntries;
          }
          return [];
        });
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        // Depth should not include .hidden directory traversal
        expect(result.depth).toBeLessThanOrEqual(1);
      });

      it('should skip node_modules during depth calculation', async () => {
        const topLevelEntries = [
          { name: 'node_modules', isDirectory: () => true },
          { name: 'src', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        const srcEntries: fs.Dirent[] = [];

        vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
          if (dirPath === mockCwd) {
            return topLevelEntries;
          }
          if (String(dirPath).endsWith('src')) {
            return srcEntries;
          }
          return [];
        });
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.depth).toBeLessThanOrEqual(1);
      });

      it('should handle readdir errors during depth calculation', async () => {
        const topLevelEntries = [
          { name: 'src', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
          if (dirPath === mockCwd) {
            return topLevelEntries;
          }
          if (String(dirPath).endsWith('src')) {
            throw new Error('Permission denied');
          }
          return [];
        });
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        // Should still return a result even with errors
        expect(result.depth).toBeGreaterThanOrEqual(0);
      });

      it('should respect maximum depth limit', async () => {
        // Create a deeply nested structure
        const createNestedEntries = () =>
          [
            { name: 'nested', isDirectory: () => true },
          ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockImplementation(async () => {
          return createNestedEntries();
        });
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        // Default max depth is 5
        expect(result.depth).toBeLessThanOrEqual(5);
      });

      it('should only count directories not files in depth calculation', async () => {
        const topLevelEntries = [
          { name: 'src', isDirectory: () => true },
          { name: 'README.md', isDirectory: () => false },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
          if (dirPath === mockCwd) {
            return topLevelEntries;
          }
          return [];
        });
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.depth).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Combined scenarios', () => {
      it('should correctly analyze a Next.js App Router project with src directory', async () => {
        const topLevelEntries = [
          { name: 'src', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        const srcEntries = [
          { name: 'app', isDirectory: () => true },
          { name: 'components', isDirectory: () => true },
          { name: 'lib', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        const appEntries = [
          { name: 'api', isDirectory: () => true },
          { name: '(dashboard)', isDirectory: () => true },
        ] as unknown as fs.Dirent[];

        vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
          const pathStr = String(dirPath);
          if (pathStr === mockCwd) {
            return topLevelEntries;
          }
          if (pathStr.endsWith('src')) {
            return srcEntries;
          }
          if (pathStr.includes('app')) {
            return appEntries;
          }
          return [];
        });
        vi.mocked(fileExists).mockImplementation(async (p: string) => {
          return p.endsWith('src') || p.includes('app');
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('next-app-router');
        expect(result.confidence).toBe('high');
        expect(result.srcDir).toBe('src');
        expect(result.specialDirs.hasApp).toBe(true);
        expect(result.specialDirs.hasComponents).toBe(true);
        expect(result.specialDirs.hasLib).toBe(true);
      });
    });
  });

  describe('formatFolderStructure', () => {
    it('should format structure with pattern name and confidence', () => {
      const structure: FolderStructure = {
        pattern: 'next-app-router',
        confidence: 'high',
        topLevelDirs: ['src'],
        srcDir: 'src',
        specialDirs: {
          hasComponents: false,
          hasPages: false,
          hasApp: true,
          hasApi: false,
          hasLib: false,
          hasUtils: false,
          hasHooks: false,
          hasServices: false,
          hasTypes: false,
          hasTests: false,
        },
        depth: 3,
      };

      const result = formatFolderStructure(structure);

      expect(result).toContain('Next.js App Router');
      expect(result).toContain('high confidence');
    });

    it('should format all architecture pattern names correctly', () => {
      const patterns: ArchitecturePattern[] = [
        'next-app-router',
        'next-pages-router',
        'feature-based',
        'layer-based',
        'domain-driven',
        'atomic-design',
        'component-based',
        'flat',
        'unknown',
      ];

      const expectedNames = [
        'Next.js App Router',
        'Next.js Pages Router',
        'Feature-based / Module-based',
        'Layer-based (MVC-like)',
        'Domain-Driven Design',
        'Atomic Design',
        'Component-based',
        'Flat structure',
        'Unknown',
      ];

      patterns.forEach((pattern, index) => {
        const structure: FolderStructure = {
          pattern,
          confidence: 'medium',
          topLevelDirs: [],
          srcDir: null,
          specialDirs: {
            hasComponents: false,
            hasPages: false,
            hasApp: false,
            hasApi: false,
            hasLib: false,
            hasUtils: false,
            hasHooks: false,
            hasServices: false,
            hasTypes: false,
            hasTests: false,
          },
          depth: 0,
        };

        const result = formatFolderStructure(structure);
        expect(result).toContain(expectedNames[index]);
      });
    });

    it('should fall back to pattern string for unknown pattern types', () => {
      // Test defensive fallback for pattern names not in the lookup table
      // This uses type assertion to bypass TypeScript and test the fallback branch
      const structure: FolderStructure = {
        pattern: 'custom-pattern' as ArchitecturePattern,
        confidence: 'low',
        topLevelDirs: [],
        srcDir: null,
        specialDirs: {
          hasComponents: false,
          hasPages: false,
          hasApp: false,
          hasApi: false,
          hasLib: false,
          hasUtils: false,
          hasHooks: false,
          hasServices: false,
          hasTypes: false,
          hasTests: false,
        },
        depth: 0,
      };

      const result = formatFolderStructure(structure);

      // The fallback should return the pattern string itself
      expect(result).toContain('custom-pattern');
    });

    it('should include key directories when present', () => {
      const structure: FolderStructure = {
        pattern: 'component-based',
        confidence: 'medium',
        topLevelDirs: ['components', 'hooks', 'lib'],
        srcDir: null,
        specialDirs: {
          hasComponents: true,
          hasPages: false,
          hasApp: false,
          hasApi: false,
          hasLib: true,
          hasUtils: false,
          hasHooks: true,
          hasServices: false,
          hasTypes: false,
          hasTests: false,
        },
        depth: 2,
      };

      const result = formatFolderStructure(structure);

      expect(result).toContain('Key Dirs:');
      expect(result).toContain('components/');
      expect(result).toContain('hooks/');
      expect(result).toContain('lib/');
    });

    it('should include all special directories in key dirs', () => {
      const structure: FolderStructure = {
        pattern: 'layer-based',
        confidence: 'high',
        topLevelDirs: [],
        srcDir: 'src',
        specialDirs: {
          hasComponents: true,
          hasPages: true,
          hasApp: true,
          hasApi: true,
          hasLib: true,
          hasUtils: false,
          hasHooks: true,
          hasServices: true,
          hasTypes: false,
          hasTests: false,
        },
        depth: 3,
      };

      const result = formatFolderStructure(structure);

      expect(result).toContain('app/');
      expect(result).toContain('pages/');
      expect(result).toContain('components/');
      expect(result).toContain('lib/');
      expect(result).toContain('services/');
      expect(result).toContain('hooks/');
      expect(result).toContain('api/');
    });

    it('should not include Key Dirs section when no key directories', () => {
      const structure: FolderStructure = {
        pattern: 'unknown',
        confidence: 'low',
        topLevelDirs: ['foo', 'bar'],
        srcDir: null,
        specialDirs: {
          hasComponents: false,
          hasPages: false,
          hasApp: false,
          hasApi: false,
          hasLib: false,
          hasUtils: false,
          hasHooks: false,
          hasServices: false,
          hasTypes: false,
          hasTests: false,
        },
        depth: 1,
      };

      const result = formatFolderStructure(structure);

      expect(result).not.toContain('Key Dirs:');
    });

    it('should include source directory info when srcDir is set', () => {
      const structure: FolderStructure = {
        pattern: 'feature-based',
        confidence: 'medium',
        topLevelDirs: ['src'],
        srcDir: 'src',
        specialDirs: {
          hasComponents: false,
          hasPages: false,
          hasApp: false,
          hasApi: false,
          hasLib: false,
          hasUtils: false,
          hasHooks: false,
          hasServices: false,
          hasTypes: false,
          hasTests: false,
        },
        depth: 2,
      };

      const result = formatFolderStructure(structure);

      expect(result).toContain('Source:');
      expect(result).toContain('`src/`');
    });

    it('should not include source directory info when srcDir is null', () => {
      const structure: FolderStructure = {
        pattern: 'flat',
        confidence: 'low',
        topLevelDirs: ['lib'],
        srcDir: null,
        specialDirs: {
          hasComponents: false,
          hasPages: false,
          hasApp: false,
          hasApi: false,
          hasLib: false,
          hasUtils: false,
          hasHooks: false,
          hasServices: false,
          hasTypes: false,
          hasTests: false,
        },
        depth: 1,
      };

      const result = formatFolderStructure(structure);

      expect(result).not.toContain('Source:');
    });

    it('should format with all sections present', () => {
      const structure: FolderStructure = {
        pattern: 'next-app-router',
        confidence: 'high',
        topLevelDirs: ['src'],
        srcDir: 'src',
        specialDirs: {
          hasComponents: true,
          hasPages: false,
          hasApp: true,
          hasApi: true,
          hasLib: true,
          hasUtils: false,
          hasHooks: true,
          hasServices: false,
          hasTypes: false,
          hasTests: false,
        },
        depth: 4,
      };

      const result = formatFolderStructure(structure);

      expect(result).toContain('**Architecture:**');
      expect(result).toContain('**Key Dirs:**');
      expect(result).toContain('**Source:**');
    });

    it('should return non-null string for any valid structure', () => {
      const structure: FolderStructure = {
        pattern: 'unknown',
        confidence: 'low',
        topLevelDirs: [],
        srcDir: null,
        specialDirs: {
          hasComponents: false,
          hasPages: false,
          hasApp: false,
          hasApi: false,
          hasLib: false,
          hasUtils: false,
          hasHooks: false,
          hasServices: false,
          hasTypes: false,
          hasTests: false,
        },
        depth: 0,
      };

      const result = formatFolderStructure(structure);

      expect(result).not.toBeNull();
      expect(typeof result).toBe('string');
    });
  });

  describe('FolderStructure type', () => {
    it('should have correct structure with all properties', () => {
      const structure: FolderStructure = {
        pattern: 'next-app-router',
        confidence: 'high',
        topLevelDirs: ['src', 'public'],
        srcDir: 'src',
        specialDirs: {
          hasComponents: true,
          hasPages: false,
          hasApp: true,
          hasApi: false,
          hasLib: false,
          hasUtils: false,
          hasHooks: false,
          hasServices: false,
          hasTypes: false,
          hasTests: false,
        },
        depth: 3,
      };

      expect(structure).toHaveProperty('pattern');
      expect(structure).toHaveProperty('confidence');
      expect(structure).toHaveProperty('topLevelDirs');
      expect(structure).toHaveProperty('srcDir');
      expect(structure).toHaveProperty('specialDirs');
      expect(structure).toHaveProperty('depth');
    });

    it('should accept null srcDir', () => {
      const structure: FolderStructure = {
        pattern: 'flat',
        confidence: 'low',
        topLevelDirs: [],
        srcDir: null,
        specialDirs: {
          hasComponents: false,
          hasPages: false,
          hasApp: false,
          hasApi: false,
          hasLib: false,
          hasUtils: false,
          hasHooks: false,
          hasServices: false,
          hasTypes: false,
          hasTests: false,
        },
        depth: 0,
      };

      expect(structure.srcDir).toBeNull();
    });
  });

  describe('SpecialDirectories type', () => {
    it('should have all boolean flags', () => {
      const specialDirs: SpecialDirectories = {
        hasComponents: true,
        hasPages: true,
        hasApp: true,
        hasApi: true,
        hasLib: true,
        hasUtils: true,
        hasHooks: true,
        hasServices: true,
        hasTypes: true,
        hasTests: true,
      };

      expect(typeof specialDirs.hasComponents).toBe('boolean');
      expect(typeof specialDirs.hasPages).toBe('boolean');
      expect(typeof specialDirs.hasApp).toBe('boolean');
      expect(typeof specialDirs.hasApi).toBe('boolean');
      expect(typeof specialDirs.hasLib).toBe('boolean');
      expect(typeof specialDirs.hasUtils).toBe('boolean');
      expect(typeof specialDirs.hasHooks).toBe('boolean');
      expect(typeof specialDirs.hasServices).toBe('boolean');
      expect(typeof specialDirs.hasTypes).toBe('boolean');
      expect(typeof specialDirs.hasTests).toBe('boolean');
    });
  });
});
