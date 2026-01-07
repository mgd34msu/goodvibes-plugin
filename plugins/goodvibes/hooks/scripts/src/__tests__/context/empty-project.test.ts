/**
 * Tests for empty-project.ts
 *
 * Tests the empty project detection functionality:
 * 1. isEmptyProject - detects if directory is empty or contains only scaffolding files
 * 2. formatEmptyProjectContext - formats context for empty projects
 */

import * as fs from 'fs/promises';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  isEmptyProject,
  formatEmptyProjectContext,
} from '../../context/empty-project.js';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('../../shared/logging.js', () => ({
  debug: vi.fn(),
}));

describe('empty-project', () => {
  const mockCwd = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isEmptyProject', () => {
    it('should return true for completely empty directory', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const result = await isEmptyProject(mockCwd);

      expect(result).toBe(true);
    });

    it('should return true for directory with only readme.md', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'readme.md',
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await isEmptyProject(mockCwd);

      expect(result).toBe(true);
    });

    it('should return true for directory with only README (case insensitive)', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['README'] as unknown as Awaited<
        ReturnType<typeof fs.readdir>
      >);

      const result = await isEmptyProject(mockCwd);

      expect(result).toBe(true);
    });

    it('should return true for directory with only license', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['license'] as unknown as Awaited<
        ReturnType<typeof fs.readdir>
      >);

      const result = await isEmptyProject(mockCwd);

      expect(result).toBe(true);
    });

    it('should return true for directory with only LICENSE.md', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'LICENSE.MD',
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await isEmptyProject(mockCwd);

      expect(result).toBe(true);
    });

    it('should return true for directory with only .gitignore', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        '.gitignore',
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await isEmptyProject(mockCwd);

      expect(result).toBe(true);
    });

    it('should return true for directory with only .git', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['.git'] as unknown as Awaited<
        ReturnType<typeof fs.readdir>
      >);

      const result = await isEmptyProject(mockCwd);

      expect(result).toBe(true);
    });

    it('should return true for directory with multiple scaffolding files', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'README.md',
        'LICENSE',
        '.gitignore',
        '.git',
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await isEmptyProject(mockCwd);

      expect(result).toBe(true);
    });

    it('should return true for directory with only dot files', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        '.env',
        '.prettierrc',
        '.eslintrc',
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await isEmptyProject(mockCwd);

      expect(result).toBe(true);
    });

    it('should return false for directory with meaningful files', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'package.json',
        'README.md',
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await isEmptyProject(mockCwd);

      expect(result).toBe(false);
    });

    it('should return false for directory with source files', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'index.ts',
        'README.md',
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await isEmptyProject(mockCwd);

      expect(result).toBe(false);
    });

    it('should return false for directory with src folder', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'src',
        '.gitignore',
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await isEmptyProject(mockCwd);

      expect(result).toBe(false);
    });

    it('should return true when readdir throws an error', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(
        new Error('ENOENT: no such file or directory')
      );

      const result = await isEmptyProject(mockCwd);

      expect(result).toBe(true);
    });

    it('should return true when directory is not readable (permission denied)', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(
        new Error('EACCES: permission denied')
      );

      const result = await isEmptyProject(mockCwd);

      expect(result).toBe(true);
    });

    it('should handle mixed case scaffolding files', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'README.MD',
        'LICENSE.md',
        '.GITIGNORE',
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await isEmptyProject(mockCwd);

      // .GITIGNORE starts with dot, README.MD and LICENSE.md are scaffolding
      expect(result).toBe(true);
    });

    it('should not treat arbitrary files starting with dot as scaffolding', async () => {
      // Files starting with . are filtered out but not because they are scaffolding
      vi.mocked(fs.readdir).mockResolvedValue([
        '.hidden',
        '.config',
        'README.md',
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await isEmptyProject(mockCwd);

      expect(result).toBe(true);
    });

    it('should correctly identify non-empty project with single meaningful file', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['app.js'] as unknown as Awaited<
        ReturnType<typeof fs.readdir>
      >);

      const result = await isEmptyProject(mockCwd);

      expect(result).toBe(false);
    });
  });

  describe('formatEmptyProjectContext', () => {
    it('should return formatted context string', () => {
      const result = formatEmptyProjectContext();

      expect(result).toContain('[GoodVibes SessionStart]');
    });

    it('should indicate new project status', () => {
      const result = formatEmptyProjectContext();

      expect(result).toContain('Status: New project (empty directory)');
    });

    it('should include scaffolding suggestions', () => {
      const result = formatEmptyProjectContext();

      expect(result).toContain('Ready to scaffold');
      expect(result).toContain('Common starting points');
    });

    it('should suggest Next.js as an option', () => {
      const result = formatEmptyProjectContext();

      expect(result).toContain('Next.js');
    });

    it('should suggest Node.js API as an option', () => {
      const result = formatEmptyProjectContext();

      expect(result).toContain('Node.js API');
      expect(result).toContain('Express');
      expect(result).toContain('Prisma');
    });

    it('should suggest React library as an option', () => {
      const result = formatEmptyProjectContext();

      expect(result).toContain('React library');
      expect(result).toContain('Vite');
    });

    it('should mention automatic stack detection', () => {
      const result = formatEmptyProjectContext();

      expect(result).toContain('detect your stack automatically');
    });

    it('should return a non-empty string', () => {
      const result = formatEmptyProjectContext();

      expect(result.length).toBeGreaterThan(0);
    });

    it('should have consistent format across calls', () => {
      const result1 = formatEmptyProjectContext();
      const result2 = formatEmptyProjectContext();

      expect(result1).toBe(result2);
    });
  });
});
