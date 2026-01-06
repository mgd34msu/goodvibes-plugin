/**
 * Tests for folder-analyzer.ts
 *
 * Tests folder structure analysis and architecture pattern detection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzeFolderStructure, formatFolderAnalysis } from '../../context/folder-analyzer.js';
import type { FolderAnalysis } from '../../context/folder-analyzer.js';
import { fileExists } from '../../shared/file-utils.js';

// Mock dependencies
vi.mock('../../shared/file-utils.js');
vi.mock('../../shared/logging.js', () => ({
  debug: vi.fn(),
}));

describe('folder-analyzer', () => {
  const mockCwd = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('analyzeFolderStructure', () => {
    describe('srcDir detection', () => {
      it('should detect src directory when it exists', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.endsWith('src');
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.srcDir).toBe('src');
      });

      it('should use "." when src directory does not exist', async () => {
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.srcDir).toBe('.');
      });
    });

    describe('pattern detection', () => {
      it('should detect feature-based pattern when features directory exists', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          if (path.includes('features')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('feature-based');
      });

      it('should detect module-based pattern when modules directory exists', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          if (path.includes('modules')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('module-based');
      });

      it('should detect layer-based pattern when components, hooks, and utils exist', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          if (path.includes('components')) return true;
          if (path.includes('hooks')) return true;
          if (path.includes('utils')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('layer-based');
      });

      it('should return unknown pattern when no standard pattern is detected', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('unknown');
      });

      it('should prioritize feature-based over module-based pattern', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          if (path.includes('features')) return true;
          if (path.includes('modules')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('feature-based');
      });

      it('should prioritize module-based over layer-based pattern', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          if (path.includes('modules')) return true;
          if (path.includes('components')) return true;
          if (path.includes('hooks')) return true;
          if (path.includes('utils')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('module-based');
      });

      it('should not detect layer-based if only components exist', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          if (path.includes('components')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('unknown');
      });

      it('should not detect layer-based if only components and hooks exist', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          if (path.includes('components')) return true;
          if (path.includes('hooks')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('unknown');
      });

      it('should not detect layer-based if only components and utils exist', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          if (path.includes('components')) return true;
          if (path.includes('utils')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('unknown');
      });

      it('should not detect layer-based if only hooks and utils exist', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          if (path.includes('hooks')) return true;
          if (path.includes('utils')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.pattern).toBe('unknown');
      });
    });

    describe('routing detection', () => {
      it('should detect App Router when app directory exists', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          if (path.includes('app')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.routing).toBe('App Router');
      });

      it('should detect Pages Router when pages directory exists', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          if (path.includes('pages')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.routing).toBe('Pages Router');
      });

      it('should return null routing when neither app nor pages exist', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.routing).toBeNull();
      });

      it('should prioritize App Router over Pages Router', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          if (path.includes('app')) return true;
          if (path.includes('pages')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.routing).toBe('App Router');
      });
    });

    describe('API layer detection', () => {
      it('should detect API layer when api directory exists in src', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          // Match api inside src but not at root
          if (path.includes('src') && path.endsWith('api')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.hasApi).toBe(true);
      });

      it('should detect API layer when server directory exists in src', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          if (path.includes('server')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.hasApi).toBe(true);
      });

      it('should detect API layer when api directory exists at project root', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return false;
          // Match api at project root level - use endsWith to be path separator agnostic
          // When src doesn't exist, srcPath = cwd, so srcPath/api = cwd/api = hasApiRoot path
          // Both hasApiInSrc and hasApiRoot will check the same path
          if (path.endsWith('api')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.hasApi).toBe(true);
      });

      it('should not detect API layer when no api or server directories exist', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.hasApi).toBe(false);
      });

      it('should detect API layer when multiple api directories exist', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          if (path.includes('api')) return true;
          if (path.includes('server')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result.hasApi).toBe(true);
      });
    });

    describe('combined scenarios', () => {
      it('should correctly analyze a typical Next.js App Router project', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          if (path.includes('app')) return true;
          if (path.includes('components')) return true;
          if (path.includes('hooks')) return true;
          if (path.includes('utils')) return true;
          // api route inside app directory
          if (path.includes('api')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result).toEqual({
          srcDir: 'src',
          pattern: 'layer-based',
          routing: 'App Router',
          hasApi: true,
        });
      });

      it('should correctly analyze a feature-based project with Pages Router', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.endsWith('src')) return true;
          if (path.includes('features')) return true;
          if (path.includes('pages')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result).toEqual({
          srcDir: 'src',
          pattern: 'feature-based',
          routing: 'Pages Router',
          hasApi: false,
        });
      });

      it('should correctly analyze a project without src directory', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.includes('modules')) return true;
          // Use endsWith to match api at root level, path separator agnostic
          if (path.endsWith('api')) return true;
          return false;
        });

        const result = await analyzeFolderStructure(mockCwd);

        expect(result).toEqual({
          srcDir: '.',
          pattern: 'module-based',
          routing: null,
          hasApi: true,
        });
      });

      it('should return minimal analysis for an empty project', async () => {
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await analyzeFolderStructure(mockCwd);

        expect(result).toEqual({
          srcDir: '.',
          pattern: 'unknown',
          routing: null,
          hasApi: false,
        });
      });
    });
  });

  describe('formatFolderAnalysis', () => {
    it('should format analysis with pattern, routing, and API', () => {
      const analysis: FolderAnalysis = {
        srcDir: 'src',
        pattern: 'feature-based',
        routing: 'App Router',
        hasApi: true,
      };

      const result = formatFolderAnalysis(analysis);

      expect(result).toBe('Structure: feature-based, App Router, has API layer');
    });

    it('should format analysis with only pattern', () => {
      const analysis: FolderAnalysis = {
        srcDir: 'src',
        pattern: 'module-based',
        routing: null,
        hasApi: false,
      };

      const result = formatFolderAnalysis(analysis);

      expect(result).toBe('Structure: module-based');
    });

    it('should format analysis with only routing', () => {
      const analysis: FolderAnalysis = {
        srcDir: 'src',
        pattern: 'unknown',
        routing: 'Pages Router',
        hasApi: false,
      };

      const result = formatFolderAnalysis(analysis);

      expect(result).toBe('Pages Router');
    });

    it('should format analysis with only API', () => {
      const analysis: FolderAnalysis = {
        srcDir: 'src',
        pattern: 'unknown',
        routing: null,
        hasApi: true,
      };

      const result = formatFolderAnalysis(analysis);

      expect(result).toBe('has API layer');
    });

    it('should format analysis with pattern and routing', () => {
      const analysis: FolderAnalysis = {
        srcDir: 'src',
        pattern: 'layer-based',
        routing: 'App Router',
        hasApi: false,
      };

      const result = formatFolderAnalysis(analysis);

      expect(result).toBe('Structure: layer-based, App Router');
    });

    it('should format analysis with pattern and API', () => {
      const analysis: FolderAnalysis = {
        srcDir: 'src',
        pattern: 'feature-based',
        routing: null,
        hasApi: true,
      };

      const result = formatFolderAnalysis(analysis);

      expect(result).toBe('Structure: feature-based, has API layer');
    });

    it('should format analysis with routing and API', () => {
      const analysis: FolderAnalysis = {
        srcDir: 'src',
        pattern: 'unknown',
        routing: 'Pages Router',
        hasApi: true,
      };

      const result = formatFolderAnalysis(analysis);

      expect(result).toBe('Pages Router, has API layer');
    });

    it('should return empty string when no relevant data', () => {
      const analysis: FolderAnalysis = {
        srcDir: '.',
        pattern: 'unknown',
        routing: null,
        hasApi: false,
      };

      const result = formatFolderAnalysis(analysis);

      expect(result).toBe('');
    });

    it('should not include srcDir in formatted output', () => {
      const analysis: FolderAnalysis = {
        srcDir: 'src',
        pattern: 'feature-based',
        routing: 'App Router',
        hasApi: true,
      };

      const result = formatFolderAnalysis(analysis);

      expect(result).not.toContain('srcDir');
      expect(result).not.toContain('src/');
    });
  });

  describe('FolderAnalysis type', () => {
    it('should have correct structure', () => {
      const analysis: FolderAnalysis = {
        srcDir: 'src',
        pattern: 'feature-based',
        routing: 'App Router',
        hasApi: true,
      };

      expect(analysis).toHaveProperty('srcDir');
      expect(analysis).toHaveProperty('pattern');
      expect(analysis).toHaveProperty('routing');
      expect(analysis).toHaveProperty('hasApi');
    });

    it('should accept null routing', () => {
      const analysis: FolderAnalysis = {
        srcDir: '.',
        pattern: 'unknown',
        routing: null,
        hasApi: false,
      };

      expect(analysis.routing).toBeNull();
    });
  });
});
