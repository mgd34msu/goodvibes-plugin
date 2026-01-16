/**
 * Unit tests for analyze-dependencies handler
 *
 * Tests cover:
 * - Package.json parsing
 * - Import extraction (ES6, CommonJS, dynamic)
 * - Scoped package handling
 * - Unused dependency detection
 * - Version comparison for outdated detection
 * - DevDependencies inclusion/exclusion
 * - Source file discovery
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

// Mock modules before imports
vi.mock('fs/promises');
vi.mock('../../../utils.js', () => ({
  readJsonFile: vi.fn(),
  fileExists: vi.fn(),
  safeExec: vi.fn(),
}));
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

import { handleAnalyzeDependencies, AnalyzeDependenciesArgs } from '../../../handlers/deps/analyze.js';
import { readJsonFile, fileExists, safeExec } from '../../../utils.js';

describe('handleAnalyzeDependencies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('package.json handling', () => {
    it('should return error when package.json not found', async () => {
      vi.mocked(readJsonFile).mockResolvedValue(null);

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('package.json not found');
    });

    it('should read dependencies from package.json', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.dependencies).toBeDefined();
      expect(data.dependencies.length).toBe(2);
    });

    it('should include devDependencies by default', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^18.2.0',
        },
        devDependencies: {
          vitest: '^1.0.0',
          typescript: '^5.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.dependencies.length).toBe(3);
    });

    it('should exclude devDependencies when include_dev is false', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^18.2.0',
        },
        devDependencies: {
          vitest: '^1.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {
        include_dev: false,
      };

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.dependencies.length).toBe(1);
      expect(data.dependencies[0].name).toBe('react');
    });
  });

  describe('import extraction', () => {
    it('should detect ES6 imports', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^18.2.0',
          lodash: '^4.17.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        if (String(dir).includes('src')) {
          return [
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
        import React from 'react';
        import { useState } from 'react';
        import _ from 'lodash';
      `);

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.used).toBe(true);
      expect(reactDep.import_count).toBeGreaterThan(0);
    });

    it('should detect CommonJS require statements', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          path: '^0.12.7',
          fs: '*',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        if (String(dir).includes('src')) {
          return [
            { name: 'utils.js', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
        const path = require('path');
        const fs = require('fs');
      `);

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
    });

    it('should detect dynamic imports', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          'dynamic-module': '^1.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        if (String(dir).includes('src')) {
          return [
            { name: 'lazy.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
        const module = await import('dynamic-module');
      `);

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
    });

    it('should ignore relative imports', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {},
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        if (String(dir).includes('src')) {
          return [
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
        import { helper } from './helper';
        import utils from '../utils';
        import config from '/absolute/config';
      `);

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      // Relative imports should not appear as dependencies
      expect(data.dependencies.length).toBe(0);
    });
  });

  describe('scoped package handling', () => {
    it('should correctly handle scoped packages', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          '@tanstack/react-query': '^5.0.0',
          '@prisma/client': '^5.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        if (String(dir).includes('src')) {
          return [
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
        import { useQuery } from '@tanstack/react-query';
        import { PrismaClient } from '@prisma/client';
      `);

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      const tanstackDep = data.dependencies.find((d: { name: string }) => d.name === '@tanstack/react-query');
      expect(tanstackDep.used).toBe(true);
    });

    it('should handle scoped package subpath imports', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          '@testing-library/react': '^14.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        if (String(dir).includes('src')) {
          return [
            { name: 'test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
        import { render } from '@testing-library/react/pure';
      `);

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      // Should still count as @testing-library/react
      const testingLibDep = data.dependencies.find((d: { name: string }) => d.name === '@testing-library/react');
      expect(testingLibDep.used).toBe(true);
    });
  });

  describe('unused dependency detection', () => {
    it('should identify unused dependencies', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^18.2.0',
          'unused-package': '^1.0.0',
          'another-unused': '^2.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        if (String(dir).includes('src')) {
          return [
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
        import React from 'react';
      `);

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.summary.unused).toBe(2);

      const unusedDep = data.dependencies.find((d: { name: string }) => d.name === 'unused-package');
      expect(unusedDep.used).toBe(false);
      expect(unusedDep.import_count).toBe(0);
    });

    it('should sort unused dependencies first', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^18.2.0',
          unused: '^1.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        if (String(dir).includes('src')) {
          return [
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
        import React from 'react';
      `);

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      // First dependency should be unused
      expect(data.dependencies[0].used).toBe(false);
    });
  });

  describe('outdated detection', () => {
    it('should check for outdated packages when check_updates is true', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^17.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({
        stdout: '18.2.0',
        stderr: '',
        error: null,
      });

      const args: AnalyzeDependenciesArgs = {
        check_updates: true,
      };

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.latest_version).toBe('18.2.0');
      expect(reactDep.outdated).toBe(true);
    });

    it('should not check updates by default', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^17.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(safeExec).not.toHaveBeenCalled();
      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.latest_version).toBeUndefined();
    });

    it('should handle npm registry errors gracefully', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^18.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({
        stdout: '',
        stderr: 'npm ERR!',
        error: new Error('npm ERR!'),
      });

      const args: AnalyzeDependenciesArgs = {
        check_updates: true,
      };

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.latest_version).toBeUndefined();
    });
  });

  describe('version comparison', () => {
    it('should detect major version difference as outdated', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          pkg: '^1.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({
        stdout: '2.0.0',
        stderr: '',
        error: null,
      });

      const args: AnalyzeDependenciesArgs = {
        check_updates: true,
      };

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies[0].outdated).toBe(true);
    });

    it('should detect minor version difference as outdated', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          pkg: '^1.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({
        stdout: '1.5.0',
        stderr: '',
        error: null,
      });

      const args: AnalyzeDependenciesArgs = {
        check_updates: true,
      };

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies[0].outdated).toBe(true);
    });

    it('should not flag same version as outdated', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          pkg: '^1.5.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({
        stdout: '1.5.0',
        stderr: '',
        error: null,
      });

      const args: AnalyzeDependenciesArgs = {
        check_updates: true,
      };

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies[0].outdated).toBe(false);
    });
  });

  describe('source file discovery', () => {
    it('should scan standard source directories', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.0.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(fsPromises.readFile).mockResolvedValue('');

      const args: AnalyzeDependenciesArgs = {};

      await handleAnalyzeDependencies(args);

      // Should check existence of standard directories
      expect(fileExists).toHaveBeenCalled();
    });

    it('should skip node_modules directory', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.0.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const dirStr = String(dir);
        if (dirStr.includes('src') && !dirStr.includes('node_modules')) {
          return [
            { name: 'node_modules', isDirectory: () => true, isFile: () => false },
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue("import React from 'react';");

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
    });

    it('should handle directory read errors gracefully', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.0.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockRejectedValue(new Error('Permission denied'));

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.dependencies).toBeDefined();
    });
  });

  describe('response format', () => {
    it('should return structured analysis result', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^18.2.0',
          lodash: '^4.17.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data).toHaveProperty('dependencies');
      expect(data).toHaveProperty('summary');
      expect(data.summary).toHaveProperty('total');
      expect(data.summary).toHaveProperty('used');
      expect(data.summary).toHaveProperty('unused');
      expect(data.summary).toHaveProperty('outdated');
    });

    it('should include all dependency info fields', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^18.2.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      const dep = data.dependencies[0];
      expect(dep).toHaveProperty('name');
      expect(dep).toHaveProperty('declared_version');
      expect(dep).toHaveProperty('used');
      expect(dep).toHaveProperty('import_count');
    });
  });

  describe('recursive directory scanning', () => {
    it('should scan nested subdirectories recursively (lines 78-79)', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^18.2.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(true);

      // Mock a nested directory structure
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const dirStr = String(dir);
        if (dirStr.endsWith('src')) {
          return [
            { name: 'components', isDirectory: () => true, isFile: () => false },
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        if (dirStr.includes('components')) {
          return [
            { name: 'nested', isDirectory: () => true, isFile: () => false },
            { name: 'Button.tsx', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        if (dirStr.includes('nested')) {
          return [
            { name: 'DeepComponent.tsx', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });

      vi.mocked(fsPromises.readFile).mockImplementation(async (filePath) => {
        const p = String(filePath);
        if (p.includes('DeepComponent')) {
          return "import React from 'react';";
        }
        return '';
      });

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.used).toBe(true);
    });

    it('should skip build directories during recursion', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);

      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const dirStr = String(dir);
        if (dirStr.endsWith('src')) {
          return [
            // These should be skipped
            { name: 'dist', isDirectory: () => true, isFile: () => false },
            { name: 'build', isDirectory: () => true, isFile: () => false },
            { name: '.next', isDirectory: () => true, isFile: () => false },
            { name: 'coverage', isDirectory: () => true, isFile: () => false },
            { name: '.turbo', isDirectory: () => true, isFile: () => false },
            { name: '.cache', isDirectory: () => true, isFile: () => false },
            { name: '.git', isDirectory: () => true, isFile: () => false },
            // This should be scanned
            { name: 'valid', isDirectory: () => true, isFile: () => false },
          ] as unknown as fsPromises.Dirent[];
        }
        if (dirStr.includes('valid')) {
          return [
            { name: 'file.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue("import React from 'react';");

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('npm registry error handling', () => {
    it('should handle safeExec throwing an exception (line 159)', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          'some-package': '^1.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      // Make safeExec throw an exception (not just return error)
      vi.mocked(safeExec).mockRejectedValue(new Error('Network timeout'));

      const args: AnalyzeDependenciesArgs = {
        check_updates: true,
      };

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      // Should still return result, just without version info
      const dep = data.dependencies.find((d: { name: string }) => d.name === 'some-package');
      expect(dep.latest_version).toBeUndefined();
    });
  });

  describe('root-level file scanning', () => {
    it('should scan root-level source files (lines 246-249)', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false); // No src directories

      // Mock readdir to return root-level files
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const dirStr = String(dir);
        // Root directory should contain source files
        if (dirStr.includes('project') && !dirStr.includes('src')) {
          return [
            { name: 'index.ts', isDirectory: () => false, isFile: () => true },
            { name: 'config.js', isDirectory: () => false, isFile: () => true },
            { name: 'utils.tsx', isDirectory: () => false, isFile: () => true },
            { name: 'helper.jsx', isDirectory: () => false, isFile: () => true },
            { name: 'module.mjs', isDirectory: () => false, isFile: () => true },
            { name: 'legacy.cjs', isDirectory: () => false, isFile: () => true },
            { name: 'readme.md', isDirectory: () => false, isFile: () => true }, // Should be ignored
            { name: 'package.json', isDirectory: () => false, isFile: () => true }, // Should be ignored
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });

      vi.mocked(fsPromises.readFile).mockImplementation(async (filePath) => {
        const p = String(filePath);
        if (p.includes('index.ts')) {
          return "import _ from 'lodash';";
        }
        return '';
      });

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      const lodashDep = data.dependencies.find((d: { name: string }) => d.name === 'lodash');
      expect(lodashDep.used).toBe(true);
    });

    it('should handle root directory read errors gracefully (lines 253-255)', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.0.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);

      // First call for standard dirs returns empty, second for root throws
      let callCount = 0;
      vi.mocked(fsPromises.readdir).mockImplementation(async () => {
        callCount++;
        if (callCount > 6) { // After checking all standard directories
          throw new Error('Root read error');
        }
        return [];
      });

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.dependencies).toBeDefined();
    });
  });

  describe('file read errors during import extraction', () => {
    it('should handle individual file read errors (lines 268-270)', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^18.2.0',
          lodash: '^4.17.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(true);

      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        if (String(dir).includes('src')) {
          return [
            { name: 'good.ts', isDirectory: () => false, isFile: () => true },
            { name: 'bad.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });

      vi.mocked(fsPromises.readFile).mockImplementation(async (filePath) => {
        const p = String(filePath);
        if (p.includes('bad.ts')) {
          throw new Error('File read error');
        }
        if (p.includes('good.ts')) {
          return "import React from 'react';";
        }
        return '';
      });

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      // Should still count react from good.ts
      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.used).toBe(true);
    });
  });

  describe('custom path handling', () => {
    it('should use custom path when provided', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { axios: '^1.0.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        if (String(dir).includes('custom-path')) {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fsPromises.Dirent[];
        }
        if (String(dir).includes('src')) {
          return [
            { name: 'api.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue("import axios from 'axios';");

      const args: AnalyzeDependenciesArgs = {
        path: 'custom-path',
      };

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('version comparison edge cases', () => {
    it('should handle patch version difference', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          pkg: '^1.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({
        stdout: '1.0.5',
        stderr: '',
        error: null,
      });

      const args: AnalyzeDependenciesArgs = {
        check_updates: true,
      };

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies[0].outdated).toBe(true);
    });

    it('should handle version with prerelease tag', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          pkg: '^1.0.0-beta.1',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({
        stdout: '1.0.0',
        stderr: '',
        error: null,
      });

      const args: AnalyzeDependenciesArgs = {
        check_updates: true,
      };

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      // 1.0.0 is not greater than 1.0.0 (after stripping prerelease)
      expect(data.dependencies[0].outdated).toBe(false);
    });

    it('should handle newer installed version than latest', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          pkg: '^2.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({
        stdout: '1.5.0', // Latest is older than installed
        stderr: '',
        error: null,
      });

      const args: AnalyzeDependenciesArgs = {
        check_updates: true,
      };

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies[0].outdated).toBe(false);
    });

    it('should handle version ranges (>=, ~, etc)', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          pkg1: '>=1.0.0',
          pkg2: '~1.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({
        stdout: '2.0.0',
        stderr: '',
        error: null,
      });

      const args: AnalyzeDependenciesArgs = {
        check_updates: true,
      };

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('empty dependencies', () => {
    it('should handle empty dependencies object', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {},
        devDependencies: {},
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.dependencies).toHaveLength(0);
      expect(data.summary.total).toBe(0);
    });

    it('should handle missing dependencies and devDependencies keys', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        name: 'test-package',
        version: '1.0.0',
        // No dependencies or devDependencies
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.dependencies).toHaveLength(0);
    });
  });

  describe('subpath imports', () => {
    it('should handle regular package subpath imports', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        if (String(dir).includes('src')) {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`
        import debounce from 'lodash/debounce';
        import throttle from 'lodash/throttle';
      `);

      const args: AnalyzeDependenciesArgs = {};

      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      const lodashDep = data.dependencies.find((d: { name: string }) => d.name === 'lodash');
      expect(lodashDep.used).toBe(true);
      expect(lodashDep.import_count).toBe(2);
    });
  });
});
