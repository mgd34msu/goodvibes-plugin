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

import { handleFindCircularDeps, FindCircularDepsArgs, findCycles, extractCycle, createCycleSignature, FindCyclesOptions } from '../../../handlers/deps/circular.js';

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

    it('should handle unexpected errors and return error response', async () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('Unexpected system error');
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Failed to find circular dependencies');
    });
  });

  describe('external package imports', () => {
    it('should skip external package imports (not relative paths)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) {
          return `
            import React from 'react';
            import lodash from 'lodash';
            import { something } from '@scope/package';
          `;
        }
        if (p.includes('b.ts')) {
          return `
            import express from 'express';
          `;
        }
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      // No cycles should be detected since all imports are external
      expect(result.isError).toBeUndefined();
      expect(data.count).toBe(0);
    });
  });

  describe('multiple independent cycles', () => {
    it('should detect multiple separate cycles', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
        { name: 'x.ts', isDirectory: () => false, isFile: () => true },
        { name: 'y.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) return "import { b } from './b';";
        if (p.includes('b.ts')) return "import { a } from './a';";
        if (p.includes('x.ts')) return "import { y } from './y';";
        if (p.includes('y.ts')) return "import { x } from './x';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.count).toBe(2); // Two separate cycles
      expect(data.affected_files.length).toBe(4);
    });
  });

  describe('cycle sorting', () => {
    it('should sort cycles by length (shorter first)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
        { name: 'c.ts', isDirectory: () => false, isFile: () => true },
        { name: 'd.ts', isDirectory: () => false, isFile: () => true },
        { name: 'x.ts', isDirectory: () => false, isFile: () => true },
        { name: 'y.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        // 2-node cycle
        if (p.includes('x.ts')) return "import { y } from './y';";
        if (p.includes('y.ts')) return "import { x } from './x';";
        // 4-node cycle
        if (p.includes('a.ts')) return "import { b } from './b';";
        if (p.includes('b.ts')) return "import { c } from './c';";
        if (p.includes('c.ts')) return "import { d } from './d';";
        if (p.includes('d.ts')) return "import { a } from './a';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.cycles.length).toBe(2);
      // Shorter cycle should come first
      expect(data.cycles[0].length).toBeLessThanOrEqual(data.cycles[1].length);
    });
  });

  describe('cycle signature edge cases', () => {
    it('should handle single-file self-import (empty cycle)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'self.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      // Self-import doesn't actually create a cycle in the graph since it's the same file
      vi.mocked(fs.readFileSync).mockReturnValue("import { x } from './self';");

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      // Self-import should be detected as a cycle of length 1
    });
  });

  describe('file extension variations', () => {
    it('should handle all supported file extensions', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.tsx', isDirectory: () => false, isFile: () => true },
        { name: 'c.js', isDirectory: () => false, isFile: () => true },
        { name: 'd.jsx', isDirectory: () => false, isFile: () => true },
        { name: 'e.mts', isDirectory: () => false, isFile: () => true },
        { name: 'f.mjs', isDirectory: () => false, isFile: () => true },
        { name: 'g.cts', isDirectory: () => false, isFile: () => true },
        { name: 'h.cjs', isDirectory: () => false, isFile: () => true },
        { name: 'ignored.css', isDirectory: () => false, isFile: () => true },
        { name: 'ignored.json', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue('');

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);

      expect(result.isError).toBeUndefined();
    });

    it('should resolve .tsx extension from extensionless import', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.tsx', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) return "import { B } from './b';"; // No extension, should find b.tsx
        if (p.includes('b.tsx')) return "import { A } from './a';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.count).toBeGreaterThan(0);
    });
  });

  describe('import resolution', () => {
    it('should handle absolute imports starting with /', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue("import { x } from '/absolute/path';");

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      // Absolute paths starting with / should be treated as relative (resolved)
      expect(result.isError).toBeUndefined();
    });

    it('should handle mixed import and export statements', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
        { name: 'c.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) {
          return `
            import { b } from './b';
            export { x } from './c';
          `;
        }
        if (p.includes('b.ts')) return "export * from './c';";
        if (p.includes('c.ts')) return "import { a } from './a';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      // Should detect cycles through re-exports
    });
  });

  describe('affected files tracking', () => {
    it('should track all unique affected files across cycles', async () => {
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

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.affected_files).toHaveLength(3);
      // Affected files should be sorted
      expect(data.affected_files).toEqual([...data.affected_files].sort());
    });
  });

  describe('graph edge cases', () => {
    it('should handle file with no imports', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'isolated.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue('export const x = 1;');

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.count).toBe(0);
    });

    it('should handle imports to non-existent files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue("import { x } from './nonexistent';");

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      // Should not crash, just skip unresolved imports
      expect(result.isError).toBeUndefined();
      expect(data.count).toBe(0);
    });

    it('should skip duplicate imports in same file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) {
          return `
            import { x } from './b';
            import { y } from './b';
            import { z } from './b';
          `;
        }
        if (p.includes('b.ts')) return "import { a } from './a';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.count).toBe(1); // Should only count as one cycle
    });
  });

  describe('Windows path handling', () => {
    it('should normalize Windows backslashes in paths', async () => {
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

      expect(result.isError).toBeUndefined();
      // All paths in output should use forward slashes
      for (const cycle of data.cycles) {
        for (const file of cycle.path) {
          expect(file).not.toContain('\\');
        }
      }
    });
  });

  describe('out directory skipping', () => {
    it('should skip out directory', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        const d = String(dir);
        if (d.endsWith('src')) {
          return [
            { name: 'out', isDirectory: () => true, isFile: () => false },
            { name: 'valid.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue('');

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('edge case coverage', () => {
    it('should return empty array when scanning non-existent subdirectory (line 108)', async () => {
      // This tests getSourceFiles returning early when dir doesn't exist
      // We simulate a directory that exists at the root but has a subdirectory that doesn't
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        // Root path exists, but when recursing into a listed subdir, it doesn't exist
        if (pathStr.endsWith('src')) return true;
        if (pathStr.includes('ghost')) return false;
        return true;
      });
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        const d = String(dir);
        if (d.endsWith('src')) {
          return [
            { name: 'ghost', isDirectory: () => true, isFile: () => false },
            { name: 'real.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        // The ghost directory doesn't exist, so this shouldn't be called
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue('export const x = 1;');

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.count).toBe(0);
    });

    it('should resolve imports with explicit file extension (line 214)', async () => {
      // This tests resolveImportPath finding exact path match with extension
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        // Import with explicit .ts extension - should hit line 214
        if (p.includes('a.ts')) return "import { b } from './b.ts';";
        if (p.includes('b.ts')) return "import { a } from './a.ts';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.count).toBeGreaterThan(0);
    });

    it('should skip neighbors not in graph during DFS (line 311)', async () => {
      // This tests the continue statement when a neighbor import resolves
      // to a file that's not in the graph. This happens when parseImports returns
      // a path that exists in the fileSet but the import graph doesn't have it as a key.
      // This can occur with path normalization edge cases on Windows.
      vi.mocked(fs.existsSync).mockReturnValue(true);

      // Create a file that imports another file that will resolve but with
      // a path that might not match exactly in the graph
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);

      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.ts')) {
          return `
            import { b } from './b';
            import { x } from './external-resolved';
          `;
        }
        if (p.includes('b.ts')) return "import { a } from './a';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.count).toBe(1); // Should still detect a<->b cycle
    });

    it('should handle cycle signature creation with non-alphabetical order (line 382)', async () => {
      // This tests createCycleSignature finding minIndex > 0
      // Create a cycle where the lexicographically smallest file is not first in DFS order
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'z-last.ts', isDirectory: () => false, isFile: () => true },
        { name: 'a-first.ts', isDirectory: () => false, isFile: () => true },
        { name: 'm-middle.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        // Create cycle: z -> m -> a -> z
        // When DFS starts from z, cycle is [z, m, a]
        // createCycleSignature should rotate to start with 'a' (smallest)
        if (p.includes('z-last.ts')) return "import { m } from './m-middle';";
        if (p.includes('m-middle.ts')) return "import { a } from './a-first';";
        if (p.includes('a-first.ts')) return "import { z } from './z-last';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.count).toBe(1);
      // The cycle should be deduplicated correctly via signature rotation
      expect(data.cycles[0].length).toBe(3);
    });

    it('should handle deeply nested cycles for signature rotation (line 382)', async () => {
      // Create a 4-node cycle where rotation is needed: d -> c -> b -> a -> d
      // DFS starting from 'd' would find [d, c, b, a], needs rotation to [a, ...]
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'd.ts', isDirectory: () => false, isFile: () => true },
        { name: 'c.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.ts', isDirectory: () => false, isFile: () => true },
        { name: 'a.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('d.ts')) return "import { c } from './c';";
        if (p.includes('c.ts')) return "import { b } from './b';";
        if (p.includes('b.ts')) return "import { a } from './a';";
        if (p.includes('a.ts')) return "import { d } from './d';";
        return '';
      });

      const args: FindCircularDepsArgs = { path: 'src' };
      const result = await handleFindCircularDeps(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.count).toBe(1);
      expect(data.cycles[0].length).toBe(4);
      expect(data.affected_files.length).toBe(4);
    });
  });
});

describe('findCycles (direct unit tests)', () => {
  it('should skip neighbors not in graph (line 311)', () => {
    // Create a graph where a node has a neighbor that is NOT a key in the graph
    // This tests the defensive check: if (!graph.has(neighbor)) continue;
    const graph = new Map<string, string[]>();
    graph.set('a', ['b', 'external-not-in-graph']); // 'external-not-in-graph' is not a graph key
    graph.set('b', ['a']);

    const cycles = findCycles(graph);

    // Should still detect the a <-> b cycle, skipping the external neighbor
    expect(cycles.length).toBe(1);
    expect(cycles[0].length).toBe(2);
  });

  it('should handle graph with only non-existent neighbors (line 311)', () => {
    // All neighbors point to non-existent nodes
    const graph = new Map<string, string[]>();
    graph.set('a', ['non-existent-1', 'non-existent-2']);
    graph.set('b', ['non-existent-3']);

    const cycles = findCycles(graph);

    // No cycles should be found since all neighbors are skipped
    expect(cycles.length).toBe(0);
  });

  it('should handle mixed existent and non-existent neighbors (line 311)', () => {
    // Create a 3-node cycle with extra non-existent neighbors sprinkled in
    const graph = new Map<string, string[]>();
    graph.set('a', ['non-existent', 'b', 'another-non-existent']);
    graph.set('b', ['c', 'missing']);
    graph.set('c', ['a', 'phantom']);

    const cycles = findCycles(graph);

    // Should detect the a -> b -> c -> a cycle
    expect(cycles.length).toBe(1);
    expect(cycles[0].length).toBe(3);
  });
});

describe('extractCycle (direct unit tests)', () => {
  it('should return null when cycleStart is not in stack (line 360)', () => {
    const stack = ['a', 'b', 'c'];
    const result = extractCycle(stack, 'not-in-stack');

    expect(result).toBeNull();
  });

  it('should return null for empty stack (line 360)', () => {
    const stack: string[] = [];
    const result = extractCycle(stack, 'any');

    expect(result).toBeNull();
  });

  it('should extract cycle when cycleStart is at beginning of stack', () => {
    const stack = ['a', 'b', 'c'];
    const result = extractCycle(stack, 'a');

    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('should extract cycle when cycleStart is in middle of stack', () => {
    const stack = ['a', 'b', 'c', 'd'];
    const result = extractCycle(stack, 'b');

    expect(result).toEqual(['b', 'c', 'd']);
  });

  it('should extract cycle when cycleStart is at end of stack', () => {
    const stack = ['a', 'b', 'c'];
    const result = extractCycle(stack, 'c');

    expect(result).toEqual(['c']);
  });
});

describe('branch coverage - line 238 (.js to .tsx resolution)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should resolve .js extension to .tsx files (line 238)', async () => {
    // This tests the second branch of the .js -> .ts/.tsx resolution (line 238)
    // where the .tsx extension matches after .ts doesn't
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'a.ts', isDirectory: () => false, isFile: () => true },
      { name: 'b.tsx', isDirectory: () => false, isFile: () => true }, // Note: .tsx not .ts
    ] as unknown as fs.Dirent[]);
    vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
      const p = String(filePath);
      // Import with .js extension that should resolve to .tsx
      if (p.includes('a.ts')) return "import { B } from './b.js';"; // .js -> .tsx
      if (p.includes('b.tsx')) return "import { A } from './a.js';"; // .js -> .ts
      return '';
    });

    const args: FindCircularDepsArgs = { path: 'src' };
    const result = await handleFindCircularDeps(args);
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(data.count).toBeGreaterThan(0);
  });
});

describe('branch coverage - line 309 (empty neighbors fallback)', () => {
  it('should use empty array fallback when node has no neighbors (line 309)', () => {
    // Create a graph where graph.get(node) returns undefined
    // This happens when a node is a key but has no entry (shouldn't normally happen)
    // or when iterating over keys that don't have values
    const graph = new Map<string, string[]>();
    graph.set('a', ['b']);
    graph.set('b', []); // Empty neighbors array - this covers the normal case

    // To truly cover the `|| []` branch, we need a node where get() returns undefined
    // This can happen if we manually set undefined or delete after setting
    // But Map iteration only covers existing keys, so we simulate it differently

    const cycles = findCycles(graph);

    // No cycles because b has no outgoing edges
    expect(cycles.length).toBe(0);
  });

  it('should handle graph with undefined neighbor list (line 309)', () => {
    // Create a graph where we explicitly set undefined to trigger || []
    const graph = new Map<string, string[]>();
    graph.set('a', ['b']);
    graph.set('b', undefined as unknown as string[]); // Force undefined to trigger || []

    const cycles = findCycles(graph);

    // Should not crash, treats undefined as empty array
    expect(cycles.length).toBe(0);
  });
});

describe('branch coverage - lines 324-327 (cycle handling)', () => {
  it('should handle case when cycle is found (lines 324-327)', () => {
    // Create a scenario that exercises the truthy branch (cycle exists)
    const graph = new Map<string, string[]>();
    graph.set('a', ['b']);
    graph.set('b', ['c']);
    graph.set('c', ['a']); // Creates cycle a -> b -> c -> a

    const cycles = findCycles(graph);

    // Cycle should be detected
    expect(cycles.length).toBe(1);
  });

  it('should skip cycle when extractCycle returns null (line 324 false branch)', () => {
    // Use dependency injection to provide a custom extractCycle that returns null
    // This tests the defensive false branch at line 324
    const graph = new Map<string, string[]>();
    graph.set('a', ['b']);
    graph.set('b', ['a']); // Creates cycle a -> b -> a

    // Custom extractCycle that always returns null
    const nullExtractCycle = (): string[] | null => null;

    const options: FindCyclesOptions = {
      extractCycleFn: nullExtractCycle,
    };

    const cycles = findCycles(graph, options);

    // No cycles should be found since extractCycle returns null
    expect(cycles.length).toBe(0);
  });

  it('should skip duplicate cycle signatures (line 327 false branch)', () => {
    // Use dependency injection to provide a custom extractCycle that returns the same cycle twice
    // This tests the deduplication branch at line 327
    const graph = new Map<string, string[]>();
    graph.set('a', ['b', 'c']); // a points to both b and c
    graph.set('b', ['a']); // b -> a creates first back edge
    graph.set('c', ['a']); // c -> a creates second back edge

    let callCount = 0;

    // Custom extractCycle that returns the same cycle for both back edges
    const duplicateExtractCycle = (stack: string[], cycleStart: string): string[] | null => {
      callCount++;
      // Always return the same cycle regardless of input
      // This simulates finding the same cycle from different paths
      return ['a', 'b'];
    };

    const options: FindCyclesOptions = {
      extractCycleFn: duplicateExtractCycle,
    };

    const cycles = findCycles(graph, options);

    // Should have called extractCycle twice (for both back edges to 'a')
    expect(callCount).toBe(2);

    // But only one cycle should be recorded due to deduplication
    expect(cycles.length).toBe(1);
  });

  it('should deduplicate cycles with same signature (line 327 else branch)', () => {
    // Create a graph where the same cycle can be detected from multiple starting points
    // When the DFS visits nodes in different orders, it might find the same cycle twice
    // The signature check at line 327 should deduplicate

    // A simple 2-node cycle: a <-> b
    // DFS from 'a' finds: a -> b -> a (cycle)
    // DFS won't visit 'b' again since it's already BLACK
    // But we can create a more complex structure

    // Let's create a graph with overlapping cycles that produce same signature
    const graph = new Map<string, string[]>();
    // Create cycle: a -> b -> a
    graph.set('a', ['b']);
    graph.set('b', ['a']);

    const cycles = findCycles(graph);

    // Only 1 cycle should be reported (deduplicated)
    expect(cycles.length).toBe(1);
  });

  it('should handle multiple cycles sharing nodes (deduplication test)', () => {
    // Create interconnected cycles that might generate duplicate signatures
    // Graph: a -> b -> c -> a (3-node cycle)
    //        with b -> a as well (creating another path)
    const graph = new Map<string, string[]>();
    graph.set('a', ['b']);
    graph.set('b', ['c', 'a']); // b points to both c and back to a
    graph.set('c', ['a']);

    const cycles = findCycles(graph);

    // Should find both cycles but deduplicate any identical ones
    // Cycles found: a->b->a (2-node) and a->b->c->a (3-node)
    expect(cycles.length).toBe(2);
  });

  it('should handle dense graph with many potential duplicate cycle detections', () => {
    // Create a fully connected small graph where cycles can be detected multiple ways
    const graph = new Map<string, string[]>();
    graph.set('a', ['b', 'c']);
    graph.set('b', ['a', 'c']);
    graph.set('c', ['a', 'b']);

    const cycles = findCycles(graph);

    // Multiple cycles exist: a-b-a, a-c-a, b-c-b, a-b-c-a
    // Deduplication should reduce to unique cycles
    expect(cycles.length).toBeGreaterThan(0);

    // Check that no duplicate cycle paths exist
    const signatures = cycles.map(c => c.path.join('->'));
    const uniqueSignatures = new Set(signatures);
    expect(uniqueSignatures.size).toBe(cycles.length);
  });
});

describe('branch coverage - line 379 (empty cycle signature)', () => {
  it('should return empty string for empty cycle array (line 379)', () => {
    // Directly test createCycleSignature with an empty array
    // This is a defensive branch that can't be triggered through normal operation
    const result = createCycleSignature([]);

    expect(result).toBe('');
  });

  it('should handle single-element cycle', () => {
    const result = createCycleSignature(['a']);

    expect(result).toBe('a');
  });

  it('should rotate cycle to start with minimum element', () => {
    // Cycle: [c, a, b] should become [a, b, c]
    const result = createCycleSignature(['c', 'a', 'b']);

    expect(result).toBe('a -> b -> c');
  });

  it('should handle cycle already starting with minimum', () => {
    const result = createCycleSignature(['a', 'b', 'c']);

    expect(result).toBe('a -> b -> c');
  });

  it('should handle single-node self-cycle in findCycles', () => {
    // A self-referencing node creates the smallest possible cycle
    const graph = new Map<string, string[]>();
    graph.set('a', ['a']); // Self-import

    const cycles = findCycles(graph);

    // Self-cycle should be detected
    expect(cycles.length).toBe(1);
    expect(cycles[0].length).toBe(1);
  });
});

describe('branch coverage - line 498 (non-Error thrown)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should handle non-Error thrown objects (line 498)', async () => {
    // Throw a string instead of an Error to trigger String(error) branch
    vi.mocked(fs.existsSync).mockImplementation(() => {
      throw 'String error instead of Error object';
    });

    const args: FindCircularDepsArgs = { path: 'src' };
    const result = await handleFindCircularDeps(args);
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toContain('Failed to find circular dependencies');
    expect(data.error).toContain('String error instead of Error object');
  });

  it('should handle number thrown as error (line 498)', async () => {
    vi.mocked(fs.existsSync).mockImplementation(() => {
      throw 42;
    });

    const args: FindCircularDepsArgs = { path: 'src' };
    const result = await handleFindCircularDeps(args);
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toContain('42');
  });

  it('should handle object thrown as error (line 498)', async () => {
    vi.mocked(fs.existsSync).mockImplementation(() => {
      throw { custom: 'error object' };
    });

    const args: FindCircularDepsArgs = { path: 'src' };
    const result = await handleFindCircularDeps(args);
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toContain('Failed to find circular dependencies');
  });
});
