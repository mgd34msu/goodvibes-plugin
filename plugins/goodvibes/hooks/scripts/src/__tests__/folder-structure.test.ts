/**
 * Tests for folder structure analyzer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  analyzeFolderStructure,
  formatFolderStructure,
  type FolderStructure,
  type ArchitecturePattern,
} from '../context/folder-structure.js';
import { fileExists } from '../shared/file-utils.js';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('../shared/file-utils.js');
vi.mock('../shared/logging.js', () => ({
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
    it('should detect Next.js App Router pattern with high confidence', async () => {
      // Mock file system
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: fs.PathLike) => {
        const p = dirPath.toString();
        if (p === mockCwd) {
          return [
            { name: 'app', isDirectory: () => true },
            { name: 'public', isDirectory: () => true },
            { name: 'node_modules', isDirectory: () => true },
          ] as fs.Dirent[];
        }
        if (p === path.join(mockCwd, 'app')) {
          return [
            { name: '(auth)', isDirectory: () => true },
            { name: 'api', isDirectory: () => true },
          ] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(true);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.pattern).toBe('next-app-router');
      expect(result.confidence).toBe('high');
      expect(result.specialDirs.hasApp).toBe(true);
    });

    it('should detect Next.js App Router with page files', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: fs.PathLike, options?: unknown) => {
        const p = dirPath.toString();
        if (p === mockCwd) {
          return [
            { name: 'app', isDirectory: () => true },
          ] as fs.Dirent[];
        }
        if (p === path.join(mockCwd, 'app')) {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            return [] as fs.Dirent[];
          }
          return ['page.tsx', 'layout.tsx'] as string[];
        }
        return [] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(true);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.pattern).toBe('next-app-router');
      expect(result.confidence).toBe('high');
    });

    it('should detect Next.js Pages Router pattern', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: fs.PathLike) => {
        const p = dirPath.toString();
        if (p === mockCwd) {
          return [
            { name: 'pages', isDirectory: () => true },
            { name: 'public', isDirectory: () => true },
          ] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.pattern).toBe('next-pages-router');
      expect(result.confidence).toBe('high');
      expect(result.specialDirs.hasPages).toBe(true);
    });

    it('should detect Atomic Design pattern', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: fs.PathLike) => {
        const p = dirPath.toString();
        if (p === mockCwd) {
          return [
            { name: 'atoms', isDirectory: () => true },
            { name: 'molecules', isDirectory: () => true },
            { name: 'organisms', isDirectory: () => true },
            { name: 'templates', isDirectory: () => true },
          ] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.pattern).toBe('atomic-design');
      expect(result.confidence).toBe('high');
    });

    it('should detect Atomic Design with medium confidence', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: fs.PathLike) => {
        const p = dirPath.toString();
        if (p === mockCwd) {
          return [
            { name: 'atoms', isDirectory: () => true },
            { name: 'molecules', isDirectory: () => true },
          ] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.pattern).toBe('atomic-design');
      expect(result.confidence).toBe('medium');
    });

    it('should detect Domain-Driven Design pattern', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: fs.PathLike) => {
        const p = dirPath.toString();
        if (p === mockCwd) {
          return [
            { name: 'domain', isDirectory: () => true },
            { name: 'infrastructure', isDirectory: () => true },
            { name: 'application', isDirectory: () => true },
            { name: 'entities', isDirectory: () => true },
          ] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.pattern).toBe('domain-driven');
      expect(result.confidence).toBe('high');
    });

    it('should detect Layer-based pattern', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: fs.PathLike) => {
        const p = dirPath.toString();
        if (p === mockCwd) {
          return [
            { name: 'controllers', isDirectory: () => true },
            { name: 'services', isDirectory: () => true },
            { name: 'repositories', isDirectory: () => true },
            { name: 'models', isDirectory: () => true },
          ] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.pattern).toBe('layer-based');
      expect(result.confidence).toBe('high');
    });

    it('should detect Feature-based pattern', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: fs.PathLike) => {
        const p = dirPath.toString();
        if (p === mockCwd) {
          return [
            { name: 'features', isDirectory: () => true },
            { name: 'utils', isDirectory: () => true },
          ] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.pattern).toBe('feature-based');
      expect(result.confidence).toBe('medium');
    });

    it('should detect Component-based pattern', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: fs.PathLike) => {
        const p = dirPath.toString();
        if (p === mockCwd) {
          return [
            { name: 'components', isDirectory: () => true },
            { name: 'utils', isDirectory: () => true },
          ] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.pattern).toBe('component-based');
      expect(result.confidence).toBe('medium');
    });

    it('should detect Flat structure', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: fs.PathLike) => {
        const p = dirPath.toString();
        if (p === mockCwd) {
          return [
            { name: 'index.ts', isDirectory: () => false },
            { name: 'utils.ts', isDirectory: () => false },
          ] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.pattern).toBe('flat');
      expect(result.confidence).toBe('low');
    });

    it('should return unknown for unrecognized patterns', async () => {
      vi.mocked(fs.readdir).mockImplementation(async () => {
        return [
          { name: 'weird-folder', isDirectory: () => true },
          { name: 'another-folder', isDirectory: () => true },
          { name: 'random-stuff', isDirectory: () => true },
          { name: 'more-things', isDirectory: () => true },
        ] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.pattern).toBe('unknown');
      expect(result.confidence).toBe('low');
    });

    it('should detect src directory', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: fs.PathLike) => {
        const p = dirPath.toString();
        if (p === mockCwd) {
          return [
            { name: 'src', isDirectory: () => true },
            { name: 'node_modules', isDirectory: () => true },
          ] as fs.Dirent[];
        }
        if (p === path.join(mockCwd, 'src')) {
          return [
            { name: 'components', isDirectory: () => true },
          ] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(true);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.srcDir).toBe('src');
    });

    it('should identify special directories', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: fs.PathLike) => {
        const p = dirPath.toString();
        if (p === mockCwd) {
          return [
            { name: 'components', isDirectory: () => true },
            { name: 'pages', isDirectory: () => true },
            { name: 'api', isDirectory: () => true },
            { name: 'lib', isDirectory: () => true },
            { name: 'utils', isDirectory: () => true },
            { name: 'hooks', isDirectory: () => true },
            { name: 'services', isDirectory: () => true },
            { name: 'types', isDirectory: () => true },
            { name: '__tests__', isDirectory: () => true },
          ] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.specialDirs.hasComponents).toBe(true);
      expect(result.specialDirs.hasPages).toBe(true);
      expect(result.specialDirs.hasApi).toBe(true);
      expect(result.specialDirs.hasLib).toBe(true);
      expect(result.specialDirs.hasUtils).toBe(true);
      expect(result.specialDirs.hasHooks).toBe(true);
      expect(result.specialDirs.hasServices).toBe(true);
      expect(result.specialDirs.hasTypes).toBe(true);
      expect(result.specialDirs.hasTests).toBe(true);
    });

    it('should handle helpers directory as utils', async () => {
      vi.mocked(fs.readdir).mockImplementation(async () => {
        return [
          { name: 'helpers', isDirectory: () => true },
        ] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.specialDirs.hasUtils).toBe(true);
    });

    it('should handle interfaces directory as types', async () => {
      vi.mocked(fs.readdir).mockImplementation(async () => {
        return [
          { name: 'interfaces', isDirectory: () => true },
        ] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.specialDirs.hasTypes).toBe(true);
    });

    it('should handle test/tests directories', async () => {
      vi.mocked(fs.readdir).mockImplementation(async () => {
        return [
          { name: 'tests', isDirectory: () => true },
        ] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.specialDirs.hasTests).toBe(true);
    });

    it('should filter out hidden directories', async () => {
      vi.mocked(fs.readdir).mockImplementation(async () => {
        return [
          { name: '.git', isDirectory: () => true },
          { name: '.vscode', isDirectory: () => true },
          { name: 'components', isDirectory: () => true },
        ] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.topLevelDirs).not.toContain('.git');
      expect(result.topLevelDirs).not.toContain('.vscode');
      expect(result.topLevelDirs).toContain('components');
    });

    it('should filter out node_modules, dist, and build', async () => {
      vi.mocked(fs.readdir).mockImplementation(async () => {
        return [
          { name: 'node_modules', isDirectory: () => true },
          { name: 'dist', isDirectory: () => true },
          { name: 'build', isDirectory: () => true },
          { name: 'src', isDirectory: () => true },
        ] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.topLevelDirs).not.toContain('node_modules');
      expect(result.topLevelDirs).not.toContain('dist');
      expect(result.topLevelDirs).not.toContain('build');
      expect(result.topLevelDirs).toContain('src');
    });

    it('should calculate folder depth', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: fs.PathLike) => {
        const p = dirPath.toString();
        if (p === mockCwd) {
          return [
            { name: 'level1', isDirectory: () => true },
          ] as fs.Dirent[];
        }
        if (p.includes('level1') && !p.includes('level2')) {
          return [
            { name: 'level2', isDirectory: () => true },
          ] as fs.Dirent[];
        }
        if (p.includes('level2') && !p.includes('level3')) {
          return [
            { name: 'level3', isDirectory: () => true },
          ] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.depth).toBeGreaterThan(0);
    });

    it('should handle readdir errors gracefully', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Permission denied'));
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result).toBeDefined();
      expect(result.topLevelDirs).toEqual([]);
    });

    it('should handle app directory that does not exist', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dirPath: fs.PathLike) => {
        const p = dirPath.toString();
        if (p === mockCwd) {
          return [
            { name: 'app', isDirectory: () => true },
          ] as fs.Dirent[];
        }
        return [] as fs.Dirent[];
      });

      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      // Should not crash and should continue analysis
      expect(result).toBeDefined();
    });
  });

  describe('formatFolderStructure', () => {
    it('should format Next.js App Router structure', () => {
      const structure: FolderStructure = {
        pattern: 'next-app-router',
        confidence: 'high',
        topLevelDirs: ['app', 'public'],
        srcDir: null,
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

      const formatted = formatFolderStructure(structure);

      expect(formatted).toContain('Next.js App Router');
      expect(formatted).toContain('high confidence');
      expect(formatted).toContain('app/');
    });

    it('should format Feature-based structure with src directory', () => {
      const structure: FolderStructure = {
        pattern: 'feature-based',
        confidence: 'medium',
        topLevelDirs: ['src', 'public'],
        srcDir: 'src',
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
        depth: 4,
      };

      const formatted = formatFolderStructure(structure);

      expect(formatted).toContain('Feature-based');
      expect(formatted).toContain('medium confidence');
      expect(formatted).toContain('components/');
      expect(formatted).toContain('lib/');
      expect(formatted).toContain('hooks/');
      expect(formatted).toContain('Uses `src/` directory');
    });

    it('should handle structure with no key directories', () => {
      const structure: FolderStructure = {
        pattern: 'flat',
        confidence: 'low',
        topLevelDirs: ['index.ts'],
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

      const formatted = formatFolderStructure(structure);

      expect(formatted).toContain('Flat structure');
      expect(formatted).toContain('low confidence');
      expect(formatted).not.toContain('Key Dirs:');
    });

    it('should format all special directories', () => {
      const structure: FolderStructure = {
        pattern: 'component-based',
        confidence: 'medium',
        topLevelDirs: [],
        srcDir: null,
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
        depth: 2,
      };

      const formatted = formatFolderStructure(structure);

      expect(formatted).toContain('app/');
      expect(formatted).toContain('pages/');
      expect(formatted).toContain('components/');
      expect(formatted).toContain('lib/');
      expect(formatted).toContain('services/');
      expect(formatted).toContain('hooks/');
      expect(formatted).toContain('api/');
    });

    it('should handle unknown pattern', () => {
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
        depth: 1,
      };

      const formatted = formatFolderStructure(structure);

      expect(formatted).toContain('Unknown');
      expect(formatted).toContain('low confidence');
    });
  });
});
