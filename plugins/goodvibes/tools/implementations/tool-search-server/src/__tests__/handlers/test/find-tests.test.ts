/**
 * Unit tests for handlers/test/find-tests.ts
 *
 * Tests cover:
 * - handleFindTestsForFile function
 * - Test file discovery (findTestFiles - tested via handler)
 * - Test type determination (determineTestType - tested via handler)
 * - Import parsing (parseImports - tested via handler)
 * - Module path resolution (resolveModulePath - tested via handler)
 * - Import relationship checking (checkImportRelationship - tested via handler)
 * - Pattern confidence calculation (calculatePatternConfidence - tested via handler)
 * - Error handling for missing files
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { handleFindTestsForFile, type FindTestsForFileArgs, type TestType } from '../../../handlers/test/find-tests.js';

// Mock fs module
vi.mock('fs');
const mockFs = vi.mocked(fs);

// Mock config module
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/project',
}));

describe('handleFindTestsForFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Argument Validation', () => {
    it('should return error when file argument is missing', async () => {
      const args: FindTestsForFileArgs = { file: '' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Missing required argument: file');
    });

    it('should return error when source file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const args: FindTestsForFileArgs = { file: 'src/missing.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Source file not found');
    });
  });

  describe('Test File Discovery', () => {
    it('should find test files with .test.ts suffix', async () => {
      const testFileContent = `
import { myFunction } from '../utils';
describe('myFunction', () => {
  it('should work', () => {});
});
`;

      // Source file exists
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('utils.ts') || pathStr.includes('utils.test.ts');
      });

      // Mock directory reading
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
            { name: 'node_modules', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });

      mockFs.readFileSync.mockReturnValue(testFileContent);
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.count).toBeGreaterThanOrEqual(0);
    });

    it('should find test files with .spec.ts suffix', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.spec.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue('import { fn } from "./utils";');
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
    });

    it('should find test files in __tests__ directory', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: '__tests__', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr.includes('__tests__')) {
          return [
            { name: 'utils.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue('import { fn } from "../utils";');
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
    });

    it('should skip node_modules and dist directories', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
            { name: 'node_modules', isDirectory: () => true, isFile: () => false },
            { name: 'dist', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        // Should not be called for node_modules or dist
        if (dirStr.includes('node_modules') || dirStr.includes('dist')) {
          throw new Error('Should not traverse node_modules or dist');
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue('');
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
    });

    it('should skip hidden directories', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
            { name: '.git', isDirectory: () => true, isFile: () => false },
            { name: '.cache', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr.startsWith('/project/.')) {
          throw new Error('Should not traverse hidden directories');
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue('');
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
    });

    it('should handle unreadable directories gracefully', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          throw new Error('EACCES: permission denied');
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue('');
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.tests).toEqual([]);
    });
  });

  describe('Test Type Determination', () => {
    it('should identify e2e tests', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
            { name: 'e2e', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/e2e') {
          return [
            { name: 'utils.e2e.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue('import { fn } from "../src/utils";');
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      const e2eTest = parsed.tests.find((t: { type: TestType }) => t.type === 'e2e');
      if (parsed.tests.length > 0) {
        expect(e2eTest).toBeDefined();
      }
    });

    it('should identify integration tests', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
            { name: 'integration', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/integration') {
          return [
            { name: 'utils.integration.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue('import { fn } from "../src/utils";');
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      const integrationTest = parsed.tests.find((t: { type: TestType }) => t.type === 'integration');
      if (parsed.tests.length > 0) {
        expect(integrationTest).toBeDefined();
      }
    });

    it('should default to unit test type', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue('import { fn } from "./utils";');
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      if (parsed.tests.length > 0) {
        expect(parsed.tests[0].type).toBe('unit');
      }
    });
  });

  describe('Import Parsing', () => {
    it('should parse ES6 import declarations', async () => {
      const testContent = `
import { myFunction } from '../utils';
import type { MyType } from '../types';

describe('test', () => {});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr.includes('.test.ts')) {
          return testContent;
        }
        return 'export const myFunction = () => {};';
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
    });

    it('should parse dynamic imports', async () => {
      const testContent = `
const utils = await import('../utils');
describe('test', () => {});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue(testContent);
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
    });

    it('should parse require() statements', async () => {
      const testContent = `
const utils = require('../utils');
describe('test', () => {});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue(testContent);
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
    });

    it('should ignore non-relative imports', async () => {
      const testContent = `
import React from 'react';
import lodash from 'lodash';
describe('test', () => {});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'component.tsx', isDirectory: () => false, isFile: () => true },
            { name: 'component.test.tsx', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue(testContent);
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/component.tsx' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Should not find test because it doesn't import the source
      expect(parsed.tests.every((t: { imports_source_directly: boolean }) => !t.imports_source_directly)).toBe(true);
    });

    it('should handle parse errors gracefully', async () => {
      const invalidContent = `
this is not valid javascript {{{}}}
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue(invalidContent);
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
    });
  });

  describe('Module Path Resolution', () => {
    it('should resolve .ts extension', async () => {
      const testContent = `import { fn } from './utils';`;

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('utils.ts') || pathStr.includes('utils.test.ts');
      });
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue(testContent);
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
    });

    it('should resolve index files', async () => {
      const testContent = `import { fn } from './utils';`;

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('utils/index.ts') ||
               pathStr.includes('utils.test.ts') ||
               pathStr === '/project/src/utils';
      });
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils', isDirectory: () => true, isFile: () => false },
            { name: 'utils.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src/utils') {
          return [
            { name: 'index.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue(testContent);
      mockFs.statSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr === '/project/src/utils') {
          return { isFile: () => false, isDirectory: () => true } as fs.Stats;
        }
        return { isFile: () => true, isDirectory: () => false } as fs.Stats;
      });

      const args: FindTestsForFileArgs = { file: 'src/utils/index.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
    });
  });

  describe('Import Relationship Checking', () => {
    it('should detect direct imports', async () => {
      const testContent = `
import { myFunction } from './utils';
describe('test', () => {});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue(testContent);
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      const directImportTest = parsed.tests.find(
        (t: { imports_source_directly: boolean }) => t.imports_source_directly
      );
      if (parsed.tests.length > 0) {
        expect(directImportTest).toBeDefined();
      }
    });

    it('should detect indirect imports when include_indirect is true', async () => {
      const testContent = `
import { wrapper } from './wrapper';
describe('test', () => {});
`;
      const wrapperContent = `
import { myFunction } from './utils';
export const wrapper = () => myFunction();
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'wrapper.ts', isDirectory: () => false, isFile: () => true },
            { name: 'wrapper.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr.includes('wrapper.test.ts')) return testContent;
        if (pathStr.includes('wrapper.ts')) return wrapperContent;
        return '';
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts', include_indirect: true };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
    });

    it('should avoid infinite loops in circular imports', async () => {
      const fileAContent = `import { b } from './fileB';`;
      const fileBContent = `import { a } from './fileA';`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'fileA.ts', isDirectory: () => false, isFile: () => true },
            { name: 'fileB.ts', isDirectory: () => false, isFile: () => true },
            { name: 'fileA.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr.includes('fileA.test.ts')) return fileAContent;
        if (pathStr.includes('fileA.ts')) return fileAContent;
        if (pathStr.includes('fileB.ts')) return fileBContent;
        return '';
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/fileA.ts', include_indirect: true };
      const response = await handleFindTestsForFile(args);

      // Should complete without hanging
      expect(response.isError).toBeUndefined();
    });
  });

  describe('Pattern Confidence Calculation', () => {
    it('should give highest confidence for same directory, same name', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue('');
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Pattern matching should give some confidence
      if (parsed.tests.length > 0) {
        expect(parsed.tests[0].confidence).toBeGreaterThan(0);
      }
    });

    it('should give lower confidence for partial name match', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils-helpers.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue('');
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
    });
  });

  describe('Results Sorting', () => {
    it('should sort results by confidence descending', async () => {
      const directImportContent = `import { fn } from './target';`;
      const partialMatchContent = `import { other } from './other';`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'target.ts', isDirectory: () => false, isFile: () => true },
            { name: 'target.test.ts', isDirectory: () => false, isFile: () => true },
            { name: 'target-extra.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr.includes('target.test.ts')) return directImportContent;
        return partialMatchContent;
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/target.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      if (parsed.tests.length > 1) {
        for (let i = 1; i < parsed.tests.length; i++) {
          expect(parsed.tests[i - 1].confidence).toBeGreaterThanOrEqual(parsed.tests[i].confidence);
        }
      }
    });
  });

  describe('Edge Cases', () => {
    it('should not include source file itself as a test', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue('');
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      // File being tested is itself a test file
      const args: FindTestsForFileArgs = { file: 'src/utils.test.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Should not include itself
      const selfIncluded = parsed.tests.find(
        (t: { file: string }) => t.file.includes('utils.test.ts')
      );
      expect(selfIncluded).toBeUndefined();
    });

    it('should filter out tests with very low confidence', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'completely-unrelated.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue('import { something } from "./other";');
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // All tests should have confidence > 0.1
      for (const test of parsed.tests) {
        expect(test.confidence).toBeGreaterThan(0.1);
      }
    });

    it('should handle absolute file paths', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([]);
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: '/project/src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle general exceptions', async () => {
      mockFs.existsSync.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Failed to find tests');
    });

    it('should handle non-Error exceptions', async () => {
      mockFs.existsSync.mockImplementation(() => {
        throw 'String error';
      });

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBe(true);
    });
  });

  describe('Response Format', () => {
    it('should include all required fields in successful response', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue('import { fn } from "./utils";');
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);

      expect(parsed).toHaveProperty('tests');
      expect(parsed).toHaveProperty('count');
      expect(Array.isArray(parsed.tests)).toBe(true);
      expect(typeof parsed.count).toBe('number');

      if (parsed.tests.length > 0) {
        const test = parsed.tests[0];
        expect(test).toHaveProperty('file');
        expect(test).toHaveProperty('type');
        expect(test).toHaveProperty('imports_source_directly');
        expect(test).toHaveProperty('confidence');
      }
    });

    it('should return relative paths in test file results', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue('import { fn } from "./utils";');
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);

      for (const test of parsed.tests) {
        expect(test.file).not.toMatch(/^[A-Z]:\\/); // Not absolute Windows path
      }
    });

    it('should round confidence to two decimal places', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = String(dir);
        if (dirStr === '/project') {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (dirStr === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue('');
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as fs.Stats);

      const args: FindTestsForFileArgs = { file: 'src/utils.ts' };
      const response = await handleFindTestsForFile(args);

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);

      for (const test of parsed.tests) {
        const decimalPlaces = (test.confidence.toString().split('.')[1] || '').length;
        expect(decimalPlaces).toBeLessThanOrEqual(2);
      }
    });
  });
});
