/**
 * Tests for folder analyzer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { analyzeFolderStructure, formatFolderAnalysis, type FolderAnalysis } from '../context/folder-analyzer.js';
import { fileExists } from '../shared/file-utils.js';

vi.mock('../shared/file-utils.js');

describe('folder-analyzer', () => {
  const mockCwd = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeFolderStructure', () => {
    it('should detect src directory when it exists', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path.includes('src') && !path.includes('src/');
      });

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.srcDir).toBe('src');
    });

    it('should use current directory when no src directory', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.srcDir).toBe('.');
    });

    it('should detect feature-based pattern', async () => {
      let callCount = 0;
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        callCount++;
        if (callCount === 1) return false; // No src dir
        return path.includes('features');
      });

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.pattern).toBe('feature-based');
    });

    it('should detect module-based pattern', async () => {
      let callCount = 0;
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        callCount++;
        if (callCount === 1) return false; // No src dir
        if (path.includes('features')) return false;
        return path.includes('modules');
      });

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.pattern).toBe('module-based');
    });

    it('should detect layer-based pattern', async () => {
      let callCount = 0;
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        callCount++;
        if (callCount === 1) return false; // No src dir
        if (path.includes('features') || path.includes('modules')) return false;
        return path.includes('components') || path.includes('hooks') || path.includes('utils');
      });

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.pattern).toBe('layer-based');
    });

    it('should return unknown pattern when no recognized structure', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.pattern).toBe('unknown');
    });

    it('should detect App Router', async () => {
      let callCount = 0;
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        callCount++;
        if (callCount === 1) return true; // Has src dir
        return path.includes('/app');
      });

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.routing).toBe('App Router');
    });

    it('should detect Pages Router', async () => {
      let callCount = 0;
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        callCount++;
        if (callCount === 1) return true; // Has src dir
        if (path.includes('/app')) return false;
        return path.includes('/pages');
      });

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.routing).toBe('Pages Router');
    });

    it('should return null routing when no routing detected', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.routing).toBeNull();
    });

    it('should detect API layer in src', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('/src') && !path.includes('/src/')) return true; // Has src dir
        return path.includes('/api') || path.includes('\\api');
      });

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.hasApi).toBe(true);
    });

    it('should detect server directory as API layer', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('/src') && !path.includes('/src/')) return true; // Has src dir
        if (path.includes('/api') || path.includes('\\api')) return false;
        return path.includes('/server') || path.includes('\\server');
      });

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.hasApi).toBe(true);
    });

    it('should detect API layer in root', async () => {
      let callCount = 0;
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        callCount++;
        if (callCount === 1) return false; // No src dir
        if (path.includes('api') || path.includes('server')) {
          return !path.includes('/');
        }
        return false;
      });

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.hasApi).toBe(true);
    });

    it('should return false for API when none detected', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeFolderStructure(mockCwd);

      expect(result.hasApi).toBe(false);
    });

    it('should handle all checks in parallel', async () => {
      const calls: string[] = [];
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        calls.push(path);
        return false;
      });

      await analyzeFolderStructure(mockCwd);

      // Should have made multiple calls (parallel Promise.all)
      expect(calls.length).toBeGreaterThan(1);
    });
  });

  describe('formatFolderAnalysis', () => {
    it('should format feature-based structure', () => {
      const analysis: FolderAnalysis = {
        srcDir: 'src',
        pattern: 'feature-based',
        routing: null,
        hasApi: false,
      };

      const formatted = formatFolderAnalysis(analysis);

      expect(formatted).toBe('Structure: feature-based');
    });

    it('should format with routing', () => {
      const analysis: FolderAnalysis = {
        srcDir: 'src',
        pattern: 'layer-based',
        routing: 'App Router',
        hasApi: false,
      };

      const formatted = formatFolderAnalysis(analysis);

      expect(formatted).toContain('Structure: layer-based');
      expect(formatted).toContain('App Router');
    });

    it('should format with API layer', () => {
      const analysis: FolderAnalysis = {
        srcDir: 'src',
        pattern: 'module-based',
        routing: null,
        hasApi: true,
      };

      const formatted = formatFolderAnalysis(analysis);

      expect(formatted).toContain('Structure: module-based');
      expect(formatted).toContain('has API layer');
    });

    it('should format all components', () => {
      const analysis: FolderAnalysis = {
        srcDir: 'src',
        pattern: 'feature-based',
        routing: 'Pages Router',
        hasApi: true,
      };

      const formatted = formatFolderAnalysis(analysis);

      expect(formatted).toContain('feature-based');
      expect(formatted).toContain('Pages Router');
      expect(formatted).toContain('has API layer');
    });

    it('should skip unknown pattern', () => {
      const analysis: FolderAnalysis = {
        srcDir: '.',
        pattern: 'unknown',
        routing: null,
        hasApi: false,
      };

      const formatted = formatFolderAnalysis(analysis);

      expect(formatted).toBe('');
    });

    it('should format with only routing', () => {
      const analysis: FolderAnalysis = {
        srcDir: '.',
        pattern: 'unknown',
        routing: 'App Router',
        hasApi: false,
      };

      const formatted = formatFolderAnalysis(analysis);

      expect(formatted).toBe('App Router');
    });

    it('should format with only API', () => {
      const analysis: FolderAnalysis = {
        srcDir: '.',
        pattern: 'unknown',
        routing: null,
        hasApi: true,
      };

      const formatted = formatFolderAnalysis(analysis);

      expect(formatted).toBe('has API layer');
    });

    it('should return empty string when nothing to format', () => {
      const analysis: FolderAnalysis = {
        srcDir: '.',
        pattern: 'unknown',
        routing: null,
        hasApi: false,
      };

      const formatted = formatFolderAnalysis(analysis);

      expect(formatted).toBe('');
    });
  });
});
