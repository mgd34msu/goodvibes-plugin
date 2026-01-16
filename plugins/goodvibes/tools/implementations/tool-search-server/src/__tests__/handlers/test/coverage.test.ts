/**
 * Unit tests for handlers/test/coverage.ts
 *
 * Tests cover:
 * - handleGetTestCoverage function
 * - LCOV parsing (parseLcov - tested via handler)
 * - Istanbul JSON parsing (parseIstanbul - tested via handler)
 * - Coverage file discovery (findCoverageReport - tested via handler)
 * - Coverage type detection (detectCoverageType - tested via handler)
 * - Coverage metrics calculation
 * - Uncovered lines extraction
 * - Uncovered functions extraction
 * - Error handling for missing/invalid coverage reports
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { handleGetTestCoverage, type GetTestCoverageArgs } from '../../../handlers/test/coverage.js';

// Mock fs module
vi.mock('fs');
const mockFs = vi.mocked(fs);

// Mock config module
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/project',
}));

// Helper to create LCOV content
function createLcovContent(files: Array<{
  path: string;
  lines?: Array<{ line: number; hits: number }>;
  functions?: Array<{ name: string; line: number; hits: number }>;
  branches?: Array<{ line: number; taken: number; total: number }>;
}>): string {
  return files.map(file => {
    const parts = [`SF:${file.path}`];

    // Add functions
    for (const fn of file.functions || []) {
      parts.push(`FN:${fn.line},${fn.name}`);
    }
    for (const fn of file.functions || []) {
      parts.push(`FNDA:${fn.hits},${fn.name}`);
    }

    // Add branches
    for (const br of file.branches || []) {
      for (let i = 0; i < br.total; i++) {
        parts.push(`BRDA:${br.line},0,${i},${i < br.taken ? '1' : '-'}`);
      }
    }

    // Add lines
    for (const line of file.lines || []) {
      parts.push(`DA:${line.line},${line.hits}`);
    }

    parts.push('end_of_record');
    return parts.join('\n');
  }).join('\n');
}

// Helper to create Istanbul JSON content
function createIstanbulContent(files: Array<{
  path: string;
  statements?: Array<{ id: string; startLine: number; endLine: number; hits: number }>;
  functions?: Array<{ id: string; name: string; line: number; hits: number }>;
  branches?: Array<{ id: string; line: number; hits: number[] }>;
}>): string {
  const result: Record<string, unknown> = {};

  for (const file of files) {
    const statementMap: Record<string, { start: { line: number }; end: { line: number } }> = {};
    const fnMap: Record<string, { name: string; decl: { start: { line: number } }; loc: { start: { line: number } } }> = {};
    const branchMap: Record<string, { loc: { start: { line: number } } }> = {};
    const s: Record<string, number> = {};
    const f: Record<string, number> = {};
    const b: Record<string, number[]> = {};

    for (const stmt of file.statements || []) {
      statementMap[stmt.id] = { start: { line: stmt.startLine }, end: { line: stmt.endLine } };
      s[stmt.id] = stmt.hits;
    }

    for (const fn of file.functions || []) {
      fnMap[fn.id] = { name: fn.name, decl: { start: { line: fn.line } }, loc: { start: { line: fn.line } } };
      f[fn.id] = fn.hits;
    }

    for (const br of file.branches || []) {
      branchMap[br.id] = { loc: { start: { line: br.line } } };
      b[br.id] = br.hits;
    }

    result[file.path] = {
      path: file.path,
      statementMap,
      fnMap,
      branchMap,
      s,
      f,
      b,
    };
  }

  return JSON.stringify(result);
}

describe('handleGetTestCoverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Coverage Report Discovery', () => {
    it('should return error when no coverage report is found', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const args: GetTestCoverageArgs = {};
      const response = await handleGetTestCoverage(args);

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('No coverage report found');
      expect(parsed.searched_paths).toBeDefined();
    });

    it('should find lcov.info in coverage directory', async () => {
      const lcovContent = createLcovContent([{
        path: '/project/src/utils.ts',
        lines: [{ line: 1, hits: 1 }, { line: 2, hits: 1 }, { line: 3, hits: 0 }],
        functions: [{ name: 'testFunction', line: 1, hits: 1 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.report_type).toBe('lcov');
      expect(parsed.coverage).toBeDefined();
    });

    it('should find coverage-final.json in coverage directory', async () => {
      const istanbulContent = createIstanbulContent([{
        path: '/project/src/utils.ts',
        statements: [
          { id: '0', startLine: 1, endLine: 1, hits: 1 },
          { id: '1', startLine: 2, endLine: 2, hits: 0 },
        ],
        functions: [{ id: '0', name: 'testFunc', line: 1, hits: 1 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        if (pathStr.includes('lcov.info')) return false;
        return pathStr.endsWith('coverage-final.json');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(istanbulContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.report_type).toBe('istanbul');
    });

    it('should use custom coverage_path when provided', async () => {
      const lcovContent = createLcovContent([{
        path: '/project/src/utils.ts',
        lines: [{ line: 1, hits: 1 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        // Return true for the directory itself OR for lcov.info inside it
        return pathStr.endsWith('custom-coverage') ||
               (pathStr.includes('custom-coverage') && pathStr.includes('lcov.info'));
      });
      mockFs.statSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        if (pathStr.endsWith('custom-coverage')) {
          return { isFile: () => false, isDirectory: () => true } as fs.Stats;
        }
        return { isFile: () => true, isDirectory: () => false } as fs.Stats;
      });
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({ coverage_path: 'custom-coverage' });

      expect(response.isError).toBeUndefined();
    });

    it('should use path alias for coverage_path', async () => {
      const lcovContent = createLcovContent([{
        path: '/project/src/utils.ts',
        lines: [{ line: 1, hits: 1 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        // Return true for the directory itself OR for lcov.info inside it
        return pathStr.endsWith('alt-coverage') ||
               (pathStr.includes('alt-coverage') && pathStr.includes('lcov.info'));
      });
      mockFs.statSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        if (pathStr.endsWith('alt-coverage')) {
          return { isFile: () => false, isDirectory: () => true } as fs.Stats;
        }
        return { isFile: () => true, isDirectory: () => false } as fs.Stats;
      });
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({ path: 'alt-coverage' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle direct file path for custom coverage', async () => {
      const lcovContent = createLcovContent([{
        path: '/project/src/utils.ts',
        lines: [{ line: 1, hits: 1 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('my-coverage.lcov');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({ coverage_path: 'my-coverage.lcov' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.report_type).toBe('lcov');
    });

    it('should fallback to PROJECT_ROOT when custom path has no coverage', async () => {
      const lcovContent = createLcovContent([{
        path: '/project/src/utils.ts',
        lines: [{ line: 1, hits: 1 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        if (pathStr.endsWith('empty-dir')) return true;
        if (pathStr.includes('empty-dir/')) return false;
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        if (pathStr.endsWith('empty-dir')) {
          return { isFile: () => false, isDirectory: () => true } as fs.Stats;
        }
        return { isFile: () => true, isDirectory: () => false } as fs.Stats;
      });
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({ coverage_path: 'empty-dir' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('LCOV Parsing', () => {
    it('should parse complete LCOV format with all sections', async () => {
      const lcovContent = createLcovContent([{
        path: '/project/src/module.ts',
        lines: [
          { line: 5, hits: 3 },
          { line: 6, hits: 3 },
          { line: 7, hits: 3 },
          { line: 8, hits: 1 },
          { line: 10, hits: 0 },
          { line: 11, hits: 0 },
        ],
        functions: [
          { name: 'helperFunction', line: 5, hits: 3 },
          { name: 'mainFunction', line: 10, hits: 0 },
        ],
        branches: [{ line: 7, taken: 1, total: 2 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.coverage.lines).toBeGreaterThan(0);
      expect(parsed.coverage.functions).toBeGreaterThan(0);
      expect(parsed.coverage.branches).toBeGreaterThan(0);
      expect(parsed.uncovered_functions.length).toBeGreaterThan(0);
    });

    it('should handle LCOV with invalid line data gracefully', async () => {
      // Invalid data that won't parse properly
      const lcovContent = `SF:/project/src/utils.ts
DA:invalid,data
DA:1,1
DA:,
FN:invalid
FNDA:bad,data
BRDA:invalid,branch,data
LF:1
LH:1
end_of_record`;

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.coverage).toBeDefined();
    });

    it('should handle multiple files in LCOV', async () => {
      const lcovContent = createLcovContent([
        {
          path: '/project/src/file1.ts',
          lines: [{ line: 1, hits: 1 }, { line: 2, hits: 0 }],
        },
        {
          path: '/project/src/file2.ts',
          lines: [{ line: 1, hits: 1 }, { line: 2, hits: 1 }],
        },
      ]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.coverage.lines).toBe(75); // 3/4 = 75%
    });

    it('should handle BRDA with dash for untaken branch', async () => {
      const lcovContent = `SF:/project/src/utils.ts
BRDA:10,0,0,-
BRDA:10,0,1,1
DA:1,1
LF:1
LH:1
end_of_record`;

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.coverage.branches).toBe(50); // 1/2 = 50%
    });
  });

  describe('Istanbul JSON Parsing', () => {
    it('should parse Istanbul coverage format', async () => {
      const istanbulContent = createIstanbulContent([{
        path: '/project/src/utils.ts',
        statements: [
          { id: '0', startLine: 1, endLine: 1, hits: 5 },
          { id: '1', startLine: 2, endLine: 3, hits: 3 },
          { id: '2', startLine: 4, endLine: 4, hits: 0 },
        ],
        functions: [
          { id: '0', name: 'foo', line: 1, hits: 5 },
          { id: '1', name: 'bar', line: 4, hits: 0 },
        ],
        branches: [{ id: '0', line: 2, hits: [3, 0] }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        if (pathStr.includes('lcov.info')) return false;
        return pathStr.endsWith('coverage-final.json');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(istanbulContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.report_type).toBe('istanbul');
      expect(parsed.coverage.functions).toBe(50); // 1/2 = 50%
      expect(parsed.uncovered_functions).toHaveLength(1);
      expect(parsed.uncovered_functions[0].name).toBe('bar');
    });

    it('should handle Istanbul format with missing optional fields', async () => {
      const istanbulContent = createIstanbulContent([{
        path: '/project/src/utils.ts',
        statements: [],
        functions: [],
        branches: [],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        if (pathStr.includes('lcov.info')) return false;
        return pathStr.endsWith('coverage-final.json');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(istanbulContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.coverage.lines).toBe(0);
    });

    it('should handle invalid JSON gracefully', async () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        if (pathStr.includes('lcov.info')) return false;
        return pathStr.endsWith('coverage-final.json');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue('{ invalid json }');

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBe(true);
    });

    it('should use fnMap loc when decl is missing', async () => {
      // Create content with loc but no decl
      const content = JSON.stringify({
        '/project/src/utils.ts': {
          path: '/project/src/utils.ts',
          statementMap: { '0': { start: { line: 1 }, end: { line: 1 } } },
          fnMap: {
            '0': { name: 'noDecl', loc: { start: { line: 5 } } },
          },
          branchMap: {},
          s: { '0': 1 },
          f: { '0': 0 },
          b: {},
        },
      });

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        if (pathStr.includes('lcov.info')) return false;
        return pathStr.endsWith('coverage-final.json');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(content);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.uncovered_functions[0].line).toBe(5);
    });
  });

  describe('Coverage Type Detection', () => {
    it('should detect .lcov extension', async () => {
      const lcovContent = createLcovContent([{
        path: '/project/src/utils.ts',
        lines: [{ line: 1, hits: 1 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage.lcov');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({ coverage_path: 'coverage.lcov' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.report_type).toBe('lcov');
    });

    it('should detect coverage-summary.json format', async () => {
      const summaryContent = JSON.stringify({
        total: {
          lines: { total: 100, covered: 80, pct: 80 },
          statements: { total: 100, covered: 80, pct: 80 },
          functions: { total: 20, covered: 15, pct: 75 },
          branches: { total: 30, covered: 20, pct: 66.67 },
        },
      });

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        if (pathStr.includes('lcov.info')) return false;
        if (pathStr.includes('coverage-final.json')) return false;
        return pathStr.endsWith('coverage-summary.json');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(summaryContent);

      const response = await handleGetTestCoverage({});

      // coverage-summary.json is detected as istanbul type
      expect(response.isError).toBeUndefined();
    });

    it('should return error for unknown file types', async () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('unknown.txt');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const response = await handleGetTestCoverage({ coverage_path: 'unknown.txt' });

      expect(response.isError).toBe(true);
    });

    it('should detect vitest coverage format from path containing vitest', async () => {
      const istanbulContent = createIstanbulContent([{
        path: '/project/src/utils.ts',
        statements: [{ id: '0', startLine: 1, endLine: 1, hits: 1 }],
        functions: [{ id: '0', name: 'testFunc', line: 1, hits: 1 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.includes('.vitest/coverage-final.json');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(istanbulContent);

      const response = await handleGetTestCoverage({ coverage_path: '.vitest/coverage-final.json' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.report_type).toBe('vitest');
    });

    it('should detect jest coverage format from path containing jest', async () => {
      const istanbulContent = createIstanbulContent([{
        path: '/project/src/utils.ts',
        statements: [{ id: '0', startLine: 1, endLine: 1, hits: 1 }],
        functions: [{ id: '0', name: 'testFunc', line: 1, hits: 1 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.includes('.jest/coverage-final.json');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(istanbulContent);

      const response = await handleGetTestCoverage({ coverage_path: '.jest/coverage-final.json' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.report_type).toBe('jest');
    });
  });

  describe('File-Specific Coverage', () => {
    it('should return coverage for specific file', async () => {
      const lcovContent = createLcovContent([
        {
          path: '/project/src/file1.ts',
          lines: [{ line: 1, hits: 1 }, { line: 2, hits: 0 }],
          functions: [{ name: 'func1', line: 1, hits: 1 }],
        },
        {
          path: '/project/src/file2.ts',
          lines: [{ line: 1, hits: 1 }, { line: 2, hits: 1 }],
          functions: [{ name: 'func2', line: 1, hits: 1 }],
        },
      ]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info') || pathStr.includes('file1.ts');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({ file: 'src/file1.ts' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.coverage.lines).toBe(50); // 1/2 = 50%
    });

    it('should handle file not found in coverage report', async () => {
      const lcovContent = createLcovContent([{
        path: '/project/src/covered.ts',
        lines: [{ line: 1, hits: 1 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({ file: 'src/not-covered.ts' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('File not found in coverage report');
    });

    it('should find file by partial path match', async () => {
      const lcovContent = createLcovContent([{
        path: '/project/src/deeply/nested/file.ts',
        lines: [{ line: 1, hits: 1 }, { line: 2, hits: 0 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({ file: 'nested/file.ts' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.coverage.lines).toBe(50);
    });

    it('should handle absolute file path', async () => {
      const lcovContent = createLcovContent([{
        path: '/project/src/utils.ts',
        lines: [{ line: 1, hits: 1 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({ file: '/project/src/utils.ts' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('Coverage Metrics Calculation', () => {
    it('should calculate 100% coverage correctly', async () => {
      const lcovContent = createLcovContent([{
        path: '/project/src/perfect.ts',
        lines: [{ line: 1, hits: 1 }, { line: 2, hits: 1 }, { line: 3, hits: 1 }],
        functions: [{ name: 'fn1', line: 1, hits: 1 }],
        branches: [{ line: 2, taken: 2, total: 2 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.coverage.lines).toBe(100);
      expect(parsed.coverage.functions).toBe(100);
      expect(parsed.coverage.branches).toBe(100);
    });

    it('should calculate 0% coverage correctly', async () => {
      const lcovContent = createLcovContent([{
        path: '/project/src/uncovered.ts',
        lines: [{ line: 1, hits: 0 }, { line: 2, hits: 0 }, { line: 3, hits: 0 }],
        functions: [{ name: 'fn1', line: 1, hits: 0 }],
        branches: [{ line: 2, taken: 0, total: 2 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.coverage.lines).toBe(0);
      expect(parsed.coverage.functions).toBe(0);
      expect(parsed.coverage.branches).toBe(0);
    });

    it('should round coverage percentages to one decimal', async () => {
      const lcovContent = createLcovContent([{
        path: '/project/src/file.ts',
        lines: [{ line: 1, hits: 1 }, { line: 2, hits: 1 }, { line: 3, hits: 0 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.coverage.lines).toBe(66.7); // 2/3 = 66.666... -> 66.7
    });

    it('should handle empty coverage data', async () => {
      const lcovContent = `SF:/project/src/empty.ts
end_of_record`;

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.coverage.lines).toBe(0);
      expect(parsed.coverage.functions).toBe(0);
      expect(parsed.coverage.branches).toBe(0);
    });
  });

  describe('Uncovered Lines Extraction', () => {
    it('should extract uncovered lines sorted by line number', async () => {
      const lcovContent = createLcovContent([{
        path: '/project/src/file.ts',
        lines: [
          { line: 5, hits: 0 },
          { line: 1, hits: 1 },
          { line: 3, hits: 0 },
          { line: 2, hits: 1 },
          { line: 4, hits: 0 },
        ],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.uncovered_lines).toHaveLength(1);
      expect(parsed.uncovered_lines[0].lines).toEqual([3, 4, 5]);
    });

    it('should not include files with no uncovered lines', async () => {
      const lcovContent = createLcovContent([
        {
          path: '/project/src/covered.ts',
          lines: [{ line: 1, hits: 1 }, { line: 2, hits: 1 }],
        },
        {
          path: '/project/src/partial.ts',
          lines: [{ line: 1, hits: 1 }, { line: 2, hits: 0 }],
        },
      ]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.uncovered_lines).toHaveLength(1);
      expect(parsed.uncovered_lines[0].file).toContain('partial.ts');
    });
  });

  describe('Uncovered Functions Extraction', () => {
    it('should extract uncovered functions sorted by file and line', async () => {
      const lcovContent = createLcovContent([
        {
          path: '/project/src/a.ts',
          lines: [{ line: 1, hits: 0 }],
          functions: [
            { name: 'funcB', line: 10, hits: 0 },
            { name: 'funcA', line: 5, hits: 0 },
          ],
        },
        {
          path: '/project/src/b.ts',
          lines: [{ line: 1, hits: 0 }],
          functions: [{ name: 'funcC', line: 1, hits: 0 }],
        },
      ]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.uncovered_functions.length).toBe(3);
      expect(parsed.uncovered_functions[0].file).toContain('a.ts');
      expect(parsed.uncovered_functions[0].name).toBe('funcA');
      expect(parsed.uncovered_functions[0].line).toBe(5);
    });

    it('should not include covered functions', async () => {
      const lcovContent = createLcovContent([{
        path: '/project/src/file.ts',
        lines: [{ line: 1, hits: 1 }],
        functions: [
          { name: 'covered', line: 1, hits: 5 },
          { name: 'uncovered', line: 5, hits: 0 },
        ],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.uncovered_functions).toHaveLength(1);
      expect(parsed.uncovered_functions[0].name).toBe('uncovered');
    });
  });

  describe('Error Handling', () => {
    it('should handle fs.readFileSync errors after finding report', async () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Failed to get test coverage');
    });

    it('should handle empty coverage file', async () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue('');

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('empty or could not be parsed');
    });

    it('should handle non-Error exceptions', async () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockImplementation(() => {
        throw 'String error';
      });

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Failed to get test coverage');
    });
  });

  describe('Response Format', () => {
    it('should include all required fields in successful response', async () => {
      const lcovContent = createLcovContent([{
        path: '/project/src/file.ts',
        lines: [{ line: 1, hits: 1 }],
        functions: [{ name: 'test', line: 1, hits: 1 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);

      expect(parsed).toHaveProperty('coverage');
      expect(parsed.coverage).toHaveProperty('lines');
      expect(parsed.coverage).toHaveProperty('branches');
      expect(parsed.coverage).toHaveProperty('functions');
      expect(parsed.coverage).toHaveProperty('statements');
      expect(parsed).toHaveProperty('uncovered_lines');
      expect(parsed).toHaveProperty('uncovered_functions');
      expect(parsed).toHaveProperty('report_path');
      expect(parsed).toHaveProperty('report_type');
    });

    it('should return relative paths in report_path', async () => {
      const lcovContent = createLcovContent([{
        path: '/project/src/file.ts',
        lines: [{ line: 1, hits: 1 }],
      }]);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.endsWith('coverage/lcov.info');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(lcovContent);

      const response = await handleGetTestCoverage({});

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Should be a relative path
      expect(parsed.report_path).not.toMatch(/^\/project\//);
    });
  });
});
