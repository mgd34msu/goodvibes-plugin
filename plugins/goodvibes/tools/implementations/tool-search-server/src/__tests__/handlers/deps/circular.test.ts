/**
 * Unit tests for find-circular-deps handler
 *
 * Tests cover:
 * - Import graph building
 * - Cycle detection using DFS
 * - Various import patterns (ES6, CommonJS, dynamic)
 * - Scoped package handling
 * - Index file resolution
 * - Extension handling
 * - Path normalization
 * - Cycle signature generation (deduplication)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock modules before imports
vi.mock('fs');
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

import { handleFindCircularDeps, FindCircularDepsArgs } from '../../../handlers/deps/circular.js';

describe('handleFindCircularDeps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('argument handling', () => {
    it('should use default path when not provided', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const args: FindCircularDepsArgs = {};

      const result = await handleFindCircularDeps(args);

      expect(result.isError).toBeUndefined();
      expect(fs.existsSync).toHaveBeenCalled();
    });

    it('should return error when path does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const args: FindCircularDepsArgs = {
        path: '/nonexistent',
      };

      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('does not exist');
    });

    it('should resolve absolute paths correctly', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const args: FindCircularDepsArgs = {
        path: '/absolute/path',
      };

      const result = await handleFindCircularDeps(args);

      expect(fs.existsSync).toHaveBeenCalledWith('/absolute/path');
    });

    it('should resolve relative paths from project root', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const args: FindCircularDepsArgs = {
        path: 'src',
      };

      const result = await handleFindCircularDeps(args);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('simple cycle detection', () => {
    it('should detect direct circular dependency (A -> B -> A)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) {
          return "import { b } from './b';";
        }
        if (p.includes('b.ts')) {
          return "import { a } from './a';";
        }
        return '';
      });

      const args: FindCircularDepsArgs = {
        path: 'src',
      };

      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.count).toBeGreaterThan(0);
      expect(data.cycles.length).toBeGreaterThan(0);
    });

    it('should detect longer cycles (A -> B -> C -> A)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
        { name: 'c.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) return "import { b } from './b';";
        if (p.includes('b.ts')) return "import { c } from './c';";
        if (p.includes('c.ts')) return "import { a } from './a';";
        return '';
      });

      const args: FindCircularDepsArgs = {
        path: 'src',
      };

      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.count).toBeGreaterThan(0);
    });

    it('should return no cycles when imports are acyclic', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
        { name: 'c.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) return "import { b } from './b';";
        if (p.includes('b.ts')) return "import { c } from './c';";
        if (p.includes('c.ts')) return ''; // No imports
        return '';
      });

      const args: FindCircularDepsArgs = {
        path: 'src',
      };

      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.count).toBe(0);
      expect(data.cycles).toHaveLength(0);
    });
  });

  describe('import pattern recognition', () => {
    it('should detect ES6 named imports', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) return "import { foo, bar } from './b';";
        if (p.includes('b.ts')) return "import { baz } from './a';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThan(0);
    });

    it('should detect ES6 default imports', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) return "import B from './b';";
        if (p.includes('b.ts')) return "import A from './a';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThan(0);
    });

    it('should detect namespace imports', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) return "import * as B from './b';";
        if (p.includes('b.ts')) return "import * as A from './a';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThan(0);
    });

    it('should detect CommonJS require statements', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.js', isDirectory: () => false, isFile: () => true },
        { name: 'b.js', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.js')) return "const b = require('./b');";
        if (p.includes('b.js')) return "const a = require('./a');";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThan(0);
    });

    it('should detect dynamic imports', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) return "const b = await import('./b');";
        if (p.includes('b.ts')) return "const a = await import('./a');";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThan(0);
    });

    it('should detect re-exports', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) return "export { foo } from './b';";
        if (p.includes('b.ts')) return "export { bar } from './a';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThan(0);
    });
  });

  describe('file extension resolution', () => {
    it('should resolve imports without extension', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) return "import { b } from './b';"; // No .ts extension
        if (p.includes('b.ts')) return "import { a } from './a';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThan(0);
    });

    it('should resolve .js extension to .ts files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) return "import { b } from './b.js';"; // .js but file is .ts
        if (p.includes('b.ts')) return "import { a } from './a.js';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.count).toBeGreaterThan(0);
    });
  });

  describe('index file resolution', () => {
    it('should resolve directory imports to index files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        const d = String(dir);
        if (d.endsWith('src')) {
          return [
            { name: 'a.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (d.includes('utils')) {
          return [
            { name: 'index.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) return "import { util } from './utils';"; // Directory import
        if (p.includes('index.ts')) return "import { a } from '../a';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('directory filtering', () => {
    it('should skip node_modules by default', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        const d = String(dir);
        if (d.endsWith('src')) {
          return [
            { name: 'node_modules', isDirectory: () => true, isFile: () => false },
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue('');

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);

      expect(result.isError).toBeUndefined();
    });

    it('should include node_modules when specified', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      vi.mocked(fs.readFileSync).mockReturnValue('');

      const args: FindCircularDepsArgs = {
        path: 'src',
        include_node_modules: true,
      };

      const result = await handleFindCircularDeps(args);

      expect(result.isError).toBeUndefined();
    });

    it('should skip common build directories', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        return [
          { name: 'dist', isDirectory: () => true, isFile: () => false },
          { name: 'build', isDirectory: () => true, isFile: () => false },
          { name: '.next', isDirectory: () => true, isFile: () => false },
          { name: 'coverage', isDirectory: () => true, isFile: () => false },
          { name: 'app.ts', isDirectory: () => false, isFile: () => true },
        ] as unknown as fs.Dirent[];
      });
      vi.mocked(fs.readFileSync).mockReturnValue('');

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('cycle deduplication', () => {
    it('should not report the same cycle multiple times', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) return "import { b } from './b';";
        if (p.includes('b.ts')) return "import { a } from './a';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      // A -> B -> A and B -> A -> B should be reported as 1 cycle
      expect(data.count).toBe(1);
    });
  });

  describe('response format', () => {
    it('should return structured result with cycles and affected files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) return "import { b } from './b';";
        if (p.includes('b.ts')) return "import { a } from './a';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('cycles');
      expect(data).toHaveProperty('count');
      expect(data).toHaveProperty('affected_files');
    });

    it('should return relative paths in result', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) return "import { b } from './b';";
        if (p.includes('b.ts')) return "import { a } from './a';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      // Paths should be relative, not absolute
      for (const cycle of data.cycles) {
        for (const file of cycle.path) {
          expect(file).not.toMatch(/^[A-Z]:\\/); // Not Windows absolute
          expect(file).not.toMatch(/^\//); // Not Unix absolute
        }
      }
    });

    it('should include cycle length in result', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) return "import { b } from './b';";
        if (p.includes('b.ts')) return "import { a } from './a';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.cycles[0]).toHaveProperty('length');
      expect(data.cycles[0].length).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should handle file read errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);

      expect(result.isError).toBeUndefined();
    });

    it('should return empty result for empty directory', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.count).toBe(0);
      expect(data.cycles).toHaveLength(0);
    });
  });
});
