/**
 * Unit tests for smart-glob handler
 *
 * Tests cover:
 * - Basic glob functionality
 * - Output modes (count_only, minimal, standard)
 * - Preview functionality with various configurations
 * - Edge cases (empty files, large files, non-existent files)
 * - Preview offset and lines parameters
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { handleSmartGlob } from '../../handlers/batch/smart-glob.js';

// Mock modules
vi.mock('fs');
vi.mock('../../config.js', () => ({
  PROJECT_ROOT: '/mock/project',
}));

/**
 * Helper to generate a file with N lines
 */
function generateFileContent(lineCount: number, prefix = 'Line'): string {
  return Array.from({ length: lineCount }, (_, i) => `${prefix} ${i + 1}`).join('\n');
}

/**
 * Helper to parse result from handler response
 */
function parseResult(response: { content: Array<{ text: string }> }) {
  return JSON.parse(response.content[0].text);
}

/**
 * Mock file system structure
 * Creates a proper mock structure for fs.readdirSync with withFileTypes: true
 */
function setupMockFs(files: Record<string, { content: string; size?: number; mtime?: Date }>) {
  // Normalize all paths to use forward slashes
  const normalizedFiles: Record<string, { content: string; size?: number; mtime?: Date }> = {};
  for (const [path, data] of Object.entries(files)) {
    normalizedFiles[path.replace(/\\/g, '/')] = data;
  }

  // Build directory structure
  const mockDirents: Record<string, fs.Dirent[]> = {};

  // Initialize project root
  mockDirents['/mock/project'] = [];

  for (const filePath of Object.keys(normalizedFiles)) {
    const parts = filePath.split('/').filter(p => p.length > 0);
    let currentPath = '/mock/project';

    // Create all parent directories
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      const nextPath = `${currentPath}/${dir}`;

      if (!mockDirents[nextPath]) {
        mockDirents[nextPath] = [];
        // Add directory entry to parent if not already there
        const existingInParent = mockDirents[currentPath]?.find(d => d.name === dir);
        if (!existingInParent) {
          const dirent = {
            name: dir,
            isFile: () => false,
            isDirectory: () => true,
          } as fs.Dirent;
          mockDirents[currentPath] = mockDirents[currentPath] || [];
          mockDirents[currentPath].push(dirent);
        }
      }
      currentPath = nextPath;
    }

    // Add file entry to its parent directory
    const fileName = parts[parts.length - 1];
    const existingInParent = mockDirents[currentPath]?.find(d => d.name === fileName);
    if (!existingInParent) {
      const dirent = {
        name: fileName,
        isFile: () => true,
        isDirectory: () => false,
      } as fs.Dirent;
      mockDirents[currentPath] = mockDirents[currentPath] || [];
      mockDirents[currentPath].push(dirent);
    }
  }

  // Mock readdirSync
  vi.mocked(fs.readdirSync).mockImplementation((dir: fs.PathLike, _options?: unknown) => {
    const dirStr = String(dir).replace(/\\/g, '/');
    const entries = mockDirents[dirStr] || [];
    return entries;
  });

  // Helper to extract relative path from any path format
  const getRelativePath = (pathStr: string): string => {
    // Normalize to forward slashes
    const normalized = pathStr.replace(/\\/g, '/');
    // Try different patterns to extract relative path
    if (normalized.startsWith('/mock/project/')) {
      return normalized.replace('/mock/project/', '');
    }
    // Handle Windows-style absolute paths that might be created
    const match = normalized.match(/\/mock\/project\/(.+)$/);
    if (match) {
      return match[1];
    }
    return normalized;
  };

  // Mock statSync
  vi.mocked(fs.statSync).mockImplementation((filePath: fs.PathLike) => {
    const pathStr = String(filePath);
    const relativePath = getRelativePath(pathStr);
    const fileData = normalizedFiles[relativePath];

    if (!fileData) {
      const err = new Error(`ENOENT: no such file or directory '${pathStr}'`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }

    return {
      size: fileData.size ?? fileData.content.length,
      mtime: fileData.mtime ?? new Date('2024-01-01T00:00:00Z'),
      isFile: () => true,
      isDirectory: () => false,
    } as fs.Stats;
  });

  // Mock readFileSync
  vi.mocked(fs.readFileSync).mockImplementation((filePath: fs.PathOrFileDescriptor) => {
    const pathStr = String(filePath);
    const relativePath = getRelativePath(pathStr);
    const fileData = normalizedFiles[relativePath];

    if (!fileData) {
      const err = new Error(`ENOENT: no such file or directory '${pathStr}'`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }

    return fileData.content;
  });
}

describe('smart-glob handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('basic functionality', () => {
    it('should return error when no patterns provided', async () => {
      const result = await handleSmartGlob({ patterns: [] });
      const parsed = parseResult(result);

      expect(result.isError).toBe(true);
      expect(parsed.error).toBe('No patterns provided');
    });

    it('should find files matching glob patterns', async () => {
      setupMockFs({
        'src/index.ts': { content: 'export {}' },
        'src/utils.ts': { content: 'export function util() {}' },
        'src/test.js': { content: 'console.log("test")' },
      });

      const result = await handleSmartGlob({
        patterns: ['src/*.ts'],
        output_mode: 'minimal',
      });
      const parsed = parseResult(result);

      expect(parsed.count).toBe(2);
      expect(parsed.files).toContain('src/index.ts');
      expect(parsed.files).toContain('src/utils.ts');
      expect(parsed.files).not.toContain('src/test.js');
    });

    it('should exclude patterns correctly', async () => {
      setupMockFs({
        'src/index.ts': { content: 'export {}' },
        'src/index.test.ts': { content: 'test()' },
        'src/utils.ts': { content: 'export function util() {}' },
      });

      const result = await handleSmartGlob({
        patterns: ['src/*.ts'],
        exclude: ['**/*.test.ts'],
        output_mode: 'minimal',
      });
      const parsed = parseResult(result);

      expect(parsed.count).toBe(2);
      expect(parsed.files).toContain('src/index.ts');
      expect(parsed.files).toContain('src/utils.ts');
      expect(parsed.files).not.toContain('src/index.test.ts');
    });

    it('should respect limit parameter', async () => {
      setupMockFs({
        'a.ts': { content: 'a' },
        'b.ts': { content: 'b' },
        'c.ts': { content: 'c' },
        'd.ts': { content: 'd' },
        'e.ts': { content: 'e' },
      });

      const result = await handleSmartGlob({
        patterns: ['*.ts'],
        limit: 3,
        output_mode: 'minimal',
      });
      const parsed = parseResult(result);

      expect(parsed.count).toBe(3);
      expect(parsed.truncated).toBe(true);
    });
  });

  describe('output modes', () => {
    beforeEach(() => {
      setupMockFs({
        'src/index.ts': { content: generateFileContent(100) },
        'src/utils.ts': { content: generateFileContent(50) },
      });
    });

    it('should return only count in count_only mode', async () => {
      const result = await handleSmartGlob({
        patterns: ['src/*.ts'],
        output_mode: 'count_only',
      });
      const parsed = parseResult(result);

      expect(parsed.count).toBe(2);
      expect(parsed.files).toBeUndefined();
    });

    it('should return only paths in minimal mode', async () => {
      const result = await handleSmartGlob({
        patterns: ['src/*.ts'],
        output_mode: 'minimal',
      });
      const parsed = parseResult(result);

      expect(parsed.files).toEqual(['src/index.ts', 'src/utils.ts']);
      expect(typeof parsed.files[0]).toBe('string');
    });

    it('should return file info in standard mode', async () => {
      const result = await handleSmartGlob({
        patterns: ['src/*.ts'],
        output_mode: 'standard',
      });
      const parsed = parseResult(result);

      expect(parsed.files[0]).toHaveProperty('path');
      expect(parsed.files[0]).toHaveProperty('size');
      expect(parsed.files[0]).toHaveProperty('modified');
    });
  });

  describe('preview functionality', () => {
    describe('basic preview', () => {
      it('should include preview when enabled in standard mode', async () => {
        setupMockFs({
          'src/index.ts': { content: generateFileContent(50) },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
          preview: { enabled: true },
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].preview).toBeDefined();
        expect(parsed.files[0].preview.content).toContain('Line 1');
        expect(parsed.files[0].preview.lines_shown).toBe(10); // Default
        expect(parsed.files[0].preview.total_lines).toBe(50);
        expect(parsed.files[0].preview.offset).toBe(1);
        expect(parsed.files[0].preview.has_more).toBe(true);
      });

      it('should not include preview when disabled', async () => {
        setupMockFs({
          'src/index.ts': { content: generateFileContent(50) },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
          preview: { enabled: false },
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].preview).toBeUndefined();
      });

      it('should not include preview without preview config', async () => {
        setupMockFs({
          'src/index.ts': { content: generateFileContent(50) },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].preview).toBeUndefined();
      });

      it('should not include preview in minimal mode even if enabled', async () => {
        setupMockFs({
          'src/index.ts': { content: generateFileContent(50) },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'minimal',
          preview: { enabled: true },
        });
        const parsed = parseResult(result);

        // In minimal mode, files are just strings, not objects
        expect(typeof parsed.files[0]).toBe('string');
      });

      it('should not include preview in count_only mode', async () => {
        setupMockFs({
          'src/index.ts': { content: generateFileContent(50) },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'count_only',
          preview: { enabled: true },
        });
        const parsed = parseResult(result);

        expect(parsed.files).toBeUndefined();
      });
    });

    describe('preview lines parameter', () => {
      it('should respect custom lines parameter', async () => {
        setupMockFs({
          'src/index.ts': { content: generateFileContent(100) },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
          preview: { enabled: true, lines: 5 },
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].preview.lines_shown).toBe(5);
        expect(parsed.files[0].preview.content.split('\n').length).toBe(5);
      });

      it('should clamp lines to available content', async () => {
        setupMockFs({
          'src/index.ts': { content: generateFileContent(3) },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
          preview: { enabled: true, lines: 100 },
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].preview.lines_shown).toBe(3);
        expect(parsed.files[0].preview.has_more).toBe(false);
      });
    });

    describe('preview offset parameter', () => {
      it('should start preview from specified offset', async () => {
        setupMockFs({
          'src/index.ts': { content: generateFileContent(100) },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
          preview: { enabled: true, offset: 20, lines: 10 },
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].preview.offset).toBe(20);
        expect(parsed.files[0].preview.content).toContain('Line 20');
        expect(parsed.files[0].preview.content).toContain('Line 29');
        expect(parsed.files[0].preview.content).not.toContain('Line 19');
        expect(parsed.files[0].preview.has_more).toBe(true);
      });

      it('should handle offset at end of file', async () => {
        setupMockFs({
          'src/index.ts': { content: generateFileContent(50) },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
          preview: { enabled: true, offset: 45, lines: 10 },
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].preview.offset).toBe(45);
        expect(parsed.files[0].preview.lines_shown).toBe(6); // Lines 45-50
        expect(parsed.files[0].preview.has_more).toBe(true); // has_more is true because offset > 1
      });

      it('should handle offset beyond file length', async () => {
        setupMockFs({
          'src/index.ts': { content: generateFileContent(10) },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
          preview: { enabled: true, offset: 100, lines: 10 },
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].preview.lines_shown).toBe(0);
        expect(parsed.files[0].preview.content).toBe('');
      });

      it('should treat offset 0 or negative as 1', async () => {
        setupMockFs({
          'src/index.ts': { content: generateFileContent(50) },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
          preview: { enabled: true, offset: 0, lines: 5 },
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].preview.offset).toBe(1);
        expect(parsed.files[0].preview.content).toContain('Line 1');
      });
    });

    describe('preview has_more metadata', () => {
      it('should be true when more content exists after preview', async () => {
        setupMockFs({
          'src/index.ts': { content: generateFileContent(50) },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
          preview: { enabled: true, offset: 1, lines: 10 },
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].preview.has_more).toBe(true);
      });

      it('should be true when content exists before preview (offset > 1)', async () => {
        setupMockFs({
          'src/index.ts': { content: generateFileContent(20) },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
          preview: { enabled: true, offset: 15, lines: 100 },
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].preview.has_more).toBe(true);
      });

      it('should be false when preview contains entire file from start', async () => {
        setupMockFs({
          'src/index.ts': { content: generateFileContent(5) },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
          preview: { enabled: true, offset: 1, lines: 100 },
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].preview.has_more).toBe(false);
      });
    });

    describe('preview with large files', () => {
      it('should skip preview for files exceeding MAX_PREVIEW_FILE_SIZE', async () => {
        setupMockFs({
          'src/large.ts': {
            content: 'x'.repeat(100),
            size: 2 * 1024 * 1024, // 2MB (exceeds 1MB limit)
          },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
          preview: { enabled: true },
        });
        const parsed = parseResult(result);

        // File info should exist but preview should be undefined
        expect(parsed.files[0].path).toBe('src/large.ts');
        expect(parsed.files[0].preview).toBeUndefined();
      });

      it('should include preview for files under size limit', async () => {
        setupMockFs({
          'src/normal.ts': {
            content: generateFileContent(100),
            size: 500 * 1024, // 500KB
          },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
          preview: { enabled: true },
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].preview).toBeDefined();
      });
    });

    describe('preview edge cases', () => {
      it('should handle empty files', async () => {
        setupMockFs({
          'src/empty.ts': { content: '' },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
          preview: { enabled: true },
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].preview.content).toBe('');
        expect(parsed.files[0].preview.lines_shown).toBe(1); // Empty string splits to ['']
        expect(parsed.files[0].preview.total_lines).toBe(1);
      });

      it('should handle single line files', async () => {
        setupMockFs({
          'src/single.ts': { content: 'export const x = 1;' },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
          preview: { enabled: true, lines: 10 },
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].preview.content).toBe('export const x = 1;');
        expect(parsed.files[0].preview.lines_shown).toBe(1);
        expect(parsed.files[0].preview.total_lines).toBe(1);
        expect(parsed.files[0].preview.has_more).toBe(false);
      });

      it('should handle files with trailing newline', async () => {
        setupMockFs({
          'src/trailing.ts': { content: 'Line 1\nLine 2\n' },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
          preview: { enabled: true },
        });
        const parsed = parseResult(result);

        expect(parsed.files[0].preview.total_lines).toBe(3); // Includes empty string after trailing newline
      });

      it('should include preview for multiple files', async () => {
        setupMockFs({
          'src/a.ts': { content: generateFileContent(20) },
          'src/b.ts': { content: generateFileContent(30) },
          'src/c.ts': { content: generateFileContent(40) },
        });

        const result = await handleSmartGlob({
          patterns: ['src/*.ts'],
          output_mode: 'standard',
          preview: { enabled: true, lines: 5 },
        });
        const parsed = parseResult(result);

        expect(parsed.files).toHaveLength(3);
        for (const file of parsed.files) {
          expect(file.preview).toBeDefined();
          expect(file.preview.lines_shown).toBe(5);
        }
      });
    });
  });

  describe('usage examples from spec', () => {
    it('should find config files with preview of first 5 lines', async () => {
      setupMockFs({
        'vite.config.ts': { content: generateFileContent(50, 'Config') },
        'tsconfig.json': { content: '{\n  "compilerOptions": {\n    "target": "es2020"\n  }\n}' },
        'eslint.config.js': { content: generateFileContent(30, 'ESLint') },
      });

      const result = await handleSmartGlob({
        patterns: ['**/*.config.ts', '**/*.config.js'],
        preview: { enabled: true, lines: 5 },
      });
      const parsed = parseResult(result);

      expect(parsed.count).toBe(2);
      for (const file of parsed.files) {
        expect(file.preview).toBeDefined();
        expect(file.preview.lines_shown).toBeLessThanOrEqual(5);
      }
    });

    it('should preview specific region', async () => {
      setupMockFs({
        'src/utils.ts': { content: generateFileContent(100, 'Util') },
      });

      const result = await handleSmartGlob({
        patterns: ['src/**/*.ts'],
        limit: 10,
        preview: { enabled: true, offset: 1, lines: 20 },
      });
      const parsed = parseResult(result);

      expect(parsed.files[0].preview.offset).toBe(1);
      expect(parsed.files[0].preview.lines_shown).toBe(20);
    });

    it('should return just file list without preview in minimal mode', async () => {
      setupMockFs({
        'src/a.ts': { content: 'a' },
        'src/b.ts': { content: 'b' },
      });

      const result = await handleSmartGlob({
        patterns: ['**/*.ts'],
        output_mode: 'minimal',
      });
      const parsed = parseResult(result);

      expect(Array.isArray(parsed.files)).toBe(true);
      expect(typeof parsed.files[0]).toBe('string');
    });
  });
});
