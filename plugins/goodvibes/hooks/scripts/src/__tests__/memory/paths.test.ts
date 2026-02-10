/**
 * Tests for memory/paths.ts
 *
 * Comprehensive test suite achieving 100% line and branch coverage for the
 * path utilities module including constants and path resolution functions.
 */

import * as path from 'path';

import { describe, it, expect } from 'vitest';

import {
  GOODVIBES_DIR,
  MEMORY_DIR,
  MEMORY_FILES,
  getGoodVibesDir,
  getMemoryDir,
  getMemoryFilePath,
} from '../../memory/paths.js';

import type { MemoryFileType } from '../../memory/paths.js';

describe('memory/paths', () => {
  // ==========================================================================
  // Constants tests
  // ==========================================================================
  describe('constants', () => {
    describe('GOODVIBES_DIR', () => {
      it('should be defined as .goodvibes', () => {
        expect(GOODVIBES_DIR).toBe('.goodvibes');
      });
    });

    describe('MEMORY_DIR', () => {
      it('should be defined as memory', () => {
        expect(MEMORY_DIR).toBe('memory');
      });
    });

    describe('MEMORY_FILES', () => {
      it('should have decisions file mapping', () => {
        expect(MEMORY_FILES.decisions).toBe('decisions.json');
      });

      it('should have patterns file mapping', () => {
        expect(MEMORY_FILES.patterns).toBe('patterns.json');
      });

      it('should have failures file mapping', () => {
        expect(MEMORY_FILES.failures).toBe('failures.json');
      });

      it('should have preferences file mapping', () => {
        expect(MEMORY_FILES.preferences).toBe('preferences.json');
      });

      it('should have exactly 5 memory file types', () => {
        expect(Object.keys(MEMORY_FILES)).toHaveLength(5);
      });
    });
  });

  // ==========================================================================
  // getGoodVibesDir tests
  // ==========================================================================
  describe('getGoodVibesDir', () => {
    it('should return .goodvibes path under given cwd', () => {
      const result = getGoodVibesDir('/path/to/project');
      expect(result).toBe(path.join('/path/to/project', '.goodvibes'));
    });

    it('should handle root path', () => {
      const result = getGoodVibesDir('/');
      expect(result).toBe(path.join('/', '.goodvibes'));
    });

    it('should handle Windows-style paths', () => {
      const result = getGoodVibesDir('C:\\Users\\test\\project');
      expect(result).toBe(path.join('C:\\Users\\test\\project', '.goodvibes'));
    });

    it('should handle paths with trailing slash', () => {
      const result = getGoodVibesDir('/path/to/project/');
      expect(result).toBe(path.join('/path/to/project/', '.goodvibes'));
    });

    it('should handle relative paths', () => {
      const result = getGoodVibesDir('./my-project');
      expect(result).toBe(path.join('./my-project', '.goodvibes'));
    });

    it('should handle paths with spaces', () => {
      const result = getGoodVibesDir('/path/to/my project');
      expect(result).toBe(path.join('/path/to/my project', '.goodvibes'));
    });
  });

  // ==========================================================================
  // getMemoryDir tests
  // ==========================================================================
  describe('getMemoryDir', () => {
    it('should return memory path under .goodvibes', () => {
      const result = getMemoryDir('/path/to/project');
      expect(result).toBe(
        path.join('/path/to/project', '.goodvibes', 'memory')
      );
    });

    it('should handle root path', () => {
      const result = getMemoryDir('/');
      expect(result).toBe(path.join('/', '.goodvibes', 'memory'));
    });

    it('should handle Windows-style paths', () => {
      const result = getMemoryDir('C:\\Users\\test\\project');
      expect(result).toBe(
        path.join('C:\\Users\\test\\project', '.goodvibes', 'memory')
      );
    });

    it('should handle paths with trailing slash', () => {
      const result = getMemoryDir('/path/to/project/');
      expect(result).toBe(
        path.join('/path/to/project/', '.goodvibes', 'memory')
      );
    });

    it('should handle relative paths', () => {
      const result = getMemoryDir('./my-project');
      expect(result).toBe(path.join('./my-project', '.goodvibes', 'memory'));
    });

    it('should handle paths with spaces', () => {
      const result = getMemoryDir('/path/to/my project');
      expect(result).toBe(
        path.join('/path/to/my project', '.goodvibes', 'memory')
      );
    });
  });

  // ==========================================================================
  // getMemoryFilePath tests
  // ==========================================================================
  describe('getMemoryFilePath', () => {
    const testCwd = '/path/to/project';

    describe('decisions memory file', () => {
      it('should return path to decisions.json', () => {
        const result = getMemoryFilePath(testCwd, 'decisions');
        expect(result).toBe(
          path.join(testCwd, '.goodvibes', 'memory', 'decisions.json')
        );
      });
    });

    describe('patterns memory file', () => {
      it('should return path to patterns.json', () => {
        const result = getMemoryFilePath(testCwd, 'patterns');
        expect(result).toBe(
          path.join(testCwd, '.goodvibes', 'memory', 'patterns.json')
        );
      });
    });

    describe('failures memory file', () => {
      it('should return path to failures.json', () => {
        const result = getMemoryFilePath(testCwd, 'failures');
        expect(result).toBe(
          path.join(testCwd, '.goodvibes', 'memory', 'failures.json')
        );
      });
    });

    describe('preferences memory file', () => {
      it('should return path to preferences.json', () => {
        const result = getMemoryFilePath(testCwd, 'preferences');
        expect(result).toBe(
          path.join(testCwd, '.goodvibes', 'memory', 'preferences.json')
        );
      });
    });

    describe('with different cwd values', () => {
      it('should handle root path', () => {
        const result = getMemoryFilePath('/', 'decisions');
        expect(result).toBe(
          path.join('/', '.goodvibes', 'memory', 'decisions.json')
        );
      });

      it('should handle Windows-style paths', () => {
        const result = getMemoryFilePath(
          'C:\\Users\\test\\project',
          'patterns'
        );
        expect(result).toBe(
          path.join(
            'C:\\Users\\test\\project',
            '.goodvibes',
            'memory',
            'patterns.json'
          )
        );
      });

      it('should handle paths with trailing slash', () => {
        const result = getMemoryFilePath('/path/to/project/', 'failures');
        expect(result).toBe(
          path.join('/path/to/project/', '.goodvibes', 'memory', 'failures.json')
        );
      });

      it('should handle relative paths', () => {
        const result = getMemoryFilePath('./my-project', 'preferences');
        expect(result).toBe(
          path.join('./my-project', '.goodvibes', 'memory', 'preferences.json')
        );
      });

      it('should handle paths with spaces', () => {
        const result = getMemoryFilePath('/path/to/my project', 'decisions');
        expect(result).toBe(
          path.join(
            '/path/to/my project',
            '.goodvibes',
            'memory',
            'decisions.json'
          )
        );
      });
    });

    describe('type safety', () => {
      it('should work with all valid MemoryFileType values', () => {
        const types: MemoryFileType[] = [
          'decisions',
          'patterns',
          'failures',
          'preferences',
        ];

        types.forEach((type) => {
          const result = getMemoryFilePath(testCwd, type);
          expect(result).toContain(MEMORY_FILES[type]);
        });
      });
    });
  });

  // ==========================================================================
  // Integration tests
  // ==========================================================================
  describe('integration', () => {
    it('should produce consistent path hierarchy', () => {
      const cwd = '/my/project';

      const goodVibesDir = getGoodVibesDir(cwd);
      const memoryDir = getMemoryDir(cwd);
      const decisionsPath = getMemoryFilePath(cwd, 'decisions');

      // Memory dir should be under goodvibes dir
      expect(memoryDir.startsWith(goodVibesDir)).toBe(true);

      // Decisions file should be under memory dir
      expect(decisionsPath.startsWith(memoryDir)).toBe(true);
    });

    it('should construct expected full paths', () => {
      const cwd = '/home/user/my-app';

      const expectedBase = path.join(cwd, GOODVIBES_DIR);
      const expectedMemory = path.join(expectedBase, MEMORY_DIR);

      expect(getGoodVibesDir(cwd)).toBe(expectedBase);
      expect(getMemoryDir(cwd)).toBe(expectedMemory);

      // Check all memory file paths
      Object.entries(MEMORY_FILES).forEach(([type, filename]) => {
        const filePath = getMemoryFilePath(cwd, type as MemoryFileType);
        expect(filePath).toBe(path.join(expectedMemory, filename));
      });
    });
  });
});
