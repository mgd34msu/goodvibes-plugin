/**
 * Unit tests for analyze dependencies handler
 *
 * Tests cover:
 * - handleAnalyzeDependencies main handler
 * - extractImports function (ES6, require, dynamic imports)
 * - isOutdated version comparison
 * - findSourceFiles recursive file discovery
 * - fetchLatestVersion npm registry lookup
 * - Sorting behavior (unused first, then by import count)
 * - Error handling for missing package.json
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

// Mock modules before imports
vi.mock('fs/promises');
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));
vi.mock('../../../utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as object,
    readJsonFile: vi.fn(),
    fileExists: vi.fn(),
    safeExec: vi.fn(),
  };
});

import {
  handleAnalyzeDependencies,
  AnalyzeDependenciesArgs,
} from '../../../handlers/deps/analyze.js';
import { readJsonFile, fileExists, safeExec } from '../../../utils.js';

describe('handleAnalyzeDependencies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('basic functionality', () => {
    it('should return error when package.json not found', async () => {
      vi.mocked(readJsonFile).mockResolvedValue(null);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toBe('package.json not found');
    });

    it('should use default path when not provided', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {},
        devDependencies: {},
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);

      expect(result.isError).toBeUndefined();
      expect(readJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('package.json')
      );
    });

    it('should resolve custom path relative to PROJECT_ROOT', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {},
        devDependencies: {},
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = { path: 'custom/path' };
      const result = await handleAnalyzeDependencies(args);

      expect(result.isError).toBeUndefined();
    });

    it('should return empty dependencies when none declared', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({});
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.dependencies).toEqual([]);
      expect(data.summary.total).toBe(0);
    });
  });

  describe('dependency analysis', () => {
    it('should include dependencies in analysis', async () => {
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

      expect(data.dependencies).toHaveLength(2);
      expect(data.summary.total).toBe(2);
    });

    it('should include devDependencies by default', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
        devDependencies: { vitest: '^1.0.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies).toHaveLength(2);
      expect(data.dependencies.map((d: { name: string }) => d.name)).toContain('vitest');
    });

    it('should exclude devDependencies when include_dev is false', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
        devDependencies: { vitest: '^1.0.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = { include_dev: false };
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies).toHaveLength(1);
      expect(data.dependencies[0].name).toBe('react');
    });
  });

  describe('import detection', () => {
    it('should detect ES6 imports from source files', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0', lodash: '^4.17.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.includes('src')) {
          return [
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        `import React from 'react';
import { useState } from 'react';`
      );

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.used).toBe(true);
      expect(reactDep.import_count).toBe(2);

      const lodashDep = data.dependencies.find((d: { name: string }) => d.name === 'lodash');
      expect(lodashDep.used).toBe(false);
      expect(lodashDep.import_count).toBe(0);
    });

    it('should detect CommonJS require statements', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { express: '^4.18.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.includes('src')) {
          return [
            { name: 'server.js', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        `const express = require('express');`
      );

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      const expressDep = data.dependencies.find((d: { name: string }) => d.name === 'express');
      expect(expressDep.used).toBe(true);
      expect(expressDep.import_count).toBe(1);
    });

    it('should detect dynamic imports', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { 'lodash-es': '^4.17.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.includes('src')) {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        `const lodash = await import('lodash-es');`
      );

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      const lodashDep = data.dependencies.find((d: { name: string }) => d.name === 'lodash-es');
      expect(lodashDep.used).toBe(true);
    });

    it('should handle scoped packages correctly', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          '@types/node': '^20.0.0',
          '@testing-library/react': '^14.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.includes('src')) {
          return [
            { name: 'test.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        `import { render } from '@testing-library/react';
import { render as render2 } from '@testing-library/react/pure';`
      );

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      const testingLib = data.dependencies.find(
        (d: { name: string }) => d.name === '@testing-library/react'
      );
      expect(testingLib.used).toBe(true);
      expect(testingLib.import_count).toBe(2);
    });

    it('should skip relative imports', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.includes('src')) {
          return [
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        `import { Component } from './component';
import utils from '../utils';
import config from '/absolute/path';`
      );

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      // react should not be detected since only relative imports exist
      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.used).toBe(false);
    });

    it('should extract base package name from subpath imports', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { lodash: '^4.17.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.includes('src')) {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        `import debounce from 'lodash/debounce';
import throttle from 'lodash/throttle';`
      );

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      const lodashDep = data.dependencies.find((d: { name: string }) => d.name === 'lodash');
      expect(lodashDep.used).toBe(true);
      expect(lodashDep.import_count).toBe(2);
    });
  });

  describe('source file discovery', () => {
    it('should search in standard source directories', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });

      // Track which directories are checked
      const checkedDirs: string[] = [];
      vi.mocked(fileExists).mockImplementation(async (p) => {
        checkedDirs.push(String(p));
        return false;
      });
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {};
      await handleAnalyzeDependencies(args);

      // Should check standard directories
      expect(checkedDirs.some((d) => d.includes('src'))).toBe(true);
      expect(checkedDirs.some((d) => d.includes('app'))).toBe(true);
      expect(checkedDirs.some((d) => d.includes('pages'))).toBe(true);
      expect(checkedDirs.some((d) => d.includes('lib'))).toBe(true);
      expect(checkedDirs.some((d) => d.includes('components'))).toBe(true);
      expect(checkedDirs.some((d) => d.includes('utils'))).toBe(true);
      expect(checkedDirs.some((d) => d.includes('hooks'))).toBe(true);
    });

    it('should recursively find source files in subdirectories', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockImplementation(async (p) => {
        const pathStr = String(p);
        return pathStr.includes('src');
      });
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.endsWith('src')) {
          return [
            { name: 'components', isDirectory: () => true, isFile: () => false },
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        if (d.includes('components')) {
          return [
            { name: 'Button.tsx', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`import React from 'react';`);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.used).toBe(true);
      // Should count imports from both files
      expect(reactDep.import_count).toBe(2);
    });

    it('should skip node_modules and other excluded directories', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.endsWith('src')) {
          return [
            { name: 'node_modules', isDirectory: () => true, isFile: () => false },
            { name: '.git', isDirectory: () => true, isFile: () => false },
            { name: 'dist', isDirectory: () => true, isFile: () => false },
            { name: 'build', isDirectory: () => true, isFile: () => false },
            { name: '.next', isDirectory: () => true, isFile: () => false },
            { name: 'coverage', isDirectory: () => true, isFile: () => false },
            { name: '.turbo', isDirectory: () => true, isFile: () => false },
            { name: '.cache', isDirectory: () => true, isFile: () => false },
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        // If any excluded directory is entered, return files to detect the error
        if (d.includes('node_modules') || d.includes('.git') || d.includes('dist')) {
          return [
            { name: 'bad.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`import React from 'react';`);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      // Should only have 1 import from app.ts, not from excluded directories
      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.import_count).toBe(1);
    });

    it('should check root-level files', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.endsWith('root')) {
          return [
            { name: 'index.ts', isDirectory: () => false, isFile: () => true },
            { name: 'config.ts', isDirectory: () => false, isFile: () => true },
            { name: 'README.md', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`import React from 'react';`);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      // Should pick up .ts files from root
      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.used).toBe(true);
    });

    it('should handle all supported file extensions', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.includes('src')) {
          return [
            { name: 'a.ts', isDirectory: () => false, isFile: () => true },
            { name: 'b.tsx', isDirectory: () => false, isFile: () => true },
            { name: 'c.js', isDirectory: () => false, isFile: () => true },
            { name: 'd.jsx', isDirectory: () => false, isFile: () => true },
            { name: 'e.mjs', isDirectory: () => false, isFile: () => true },
            { name: 'f.cjs', isDirectory: () => false, isFile: () => true },
            { name: 'styles.css', isDirectory: () => false, isFile: () => true },
            { name: 'data.json', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`import React from 'react';`);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      // Should count 6 source files (ts, tsx, js, jsx, mjs, cjs)
      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.import_count).toBe(6);
    });
  });

  describe('version checking', () => {
    it('should not check versions by default', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.latest_version).toBeUndefined();
      expect(reactDep.outdated).toBeUndefined();
      expect(safeExec).not.toHaveBeenCalled();
    });

    it('should check versions when check_updates is true', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({
        stdout: '18.3.0',
        stderr: '',
      });

      const args: AnalyzeDependenciesArgs = { check_updates: true };
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.latest_version).toBe('18.3.0');
      expect(reactDep.outdated).toBe(true);
      expect(safeExec).toHaveBeenCalledWith(
        'npm view react version',
        expect.any(String),
        10000
      );
    });

    it('should mark package as not outdated when versions match', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.3.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({
        stdout: '18.3.0',
        stderr: '',
      });

      const args: AnalyzeDependenciesArgs = { check_updates: true };
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.outdated).toBe(false);
    });

    it('should handle npm view errors gracefully', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { 'private-pkg': '^1.0.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({
        stdout: '',
        stderr: 'Not found',
        error: 'Command failed',
      });

      const args: AnalyzeDependenciesArgs = { check_updates: true };
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      const dep = data.dependencies[0];
      expect(dep.latest_version).toBeUndefined();
      expect(dep.outdated).toBeUndefined();
    });

    it('should count outdated dependencies in summary', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^17.0.0',
          lodash: '^4.17.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockImplementation(async (cmd: string) => {
        if (cmd.includes('react')) {
          return { stdout: '18.0.0', stderr: '' };
        }
        if (cmd.includes('lodash')) {
          return { stdout: '4.17.0', stderr: '' };
        }
        return { stdout: '', stderr: '', error: 'Unknown' };
      });

      const args: AnalyzeDependenciesArgs = { check_updates: true };
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.summary.outdated).toBe(1);
    });
  });

  describe('version comparison (isOutdated)', () => {
    it('should detect major version outdated', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { pkg: '^1.0.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({ stdout: '2.0.0', stderr: '' });

      const args: AnalyzeDependenciesArgs = { check_updates: true };
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies[0].outdated).toBe(true);
    });

    it('should detect minor version outdated', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { pkg: '^1.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({ stdout: '1.3.0', stderr: '' });

      const args: AnalyzeDependenciesArgs = { check_updates: true };
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies[0].outdated).toBe(true);
    });

    it('should detect patch version outdated', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { pkg: '^1.2.3' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({ stdout: '1.2.4', stderr: '' });

      const args: AnalyzeDependenciesArgs = { check_updates: true };
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies[0].outdated).toBe(true);
    });

    it('should handle tilde prefix', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { pkg: '~1.2.3' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({ stdout: '1.3.0', stderr: '' });

      const args: AnalyzeDependenciesArgs = { check_updates: true };
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies[0].outdated).toBe(true);
    });

    it('should handle >= prefix', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { pkg: '>=1.2.3' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({ stdout: '1.2.3', stderr: '' });

      const args: AnalyzeDependenciesArgs = { check_updates: true };
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies[0].outdated).toBe(false);
    });

    it('should handle pre-release versions', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { pkg: '^1.0.0-beta.1' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({ stdout: '1.0.0', stderr: '' });

      const args: AnalyzeDependenciesArgs = { check_updates: true };
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      // 1.0.0-beta.1 -> 1.0.0, 1.0.0 -> 1.0.0, not outdated
      expect(data.dependencies[0].outdated).toBe(false);
    });

    it('should not mark as outdated when installed is ahead', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { pkg: '^2.0.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockResolvedValue({ stdout: '1.9.0', stderr: '' });

      const args: AnalyzeDependenciesArgs = { check_updates: true };
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies[0].outdated).toBe(false);
    });
  });

  describe('sorting behavior', () => {
    it('should sort unused dependencies first', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          used: '^1.0.0',
          unused: '^1.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.includes('src')) {
          return [
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`import x from 'used';`);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      // Unused should come first
      expect(data.dependencies[0].name).toBe('unused');
      expect(data.dependencies[0].used).toBe(false);
      expect(data.dependencies[1].name).toBe('used');
      expect(data.dependencies[1].used).toBe(true);
    });

    it('should sort used dependencies by import count descending', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          few: '^1.0.0',
          many: '^1.0.0',
          medium: '^1.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.includes('src')) {
          return [
            { name: 'a.ts', isDirectory: () => false, isFile: () => true },
            { name: 'b.ts', isDirectory: () => false, isFile: () => true },
            { name: 'c.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockImplementation(async (p) => {
        const pathStr = String(p);
        if (pathStr.includes('a.ts')) {
          return `import x from 'many'; import y from 'many'; import z from 'many';`;
        }
        if (pathStr.includes('b.ts')) {
          return `import x from 'many'; import y from 'medium'; import z from 'medium';`;
        }
        if (pathStr.includes('c.ts')) {
          return `import x from 'few';`;
        }
        return '';
      });

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      // All used, sorted by import count descending
      expect(data.dependencies[0].name).toBe('many');
      expect(data.dependencies[0].import_count).toBe(4);
      expect(data.dependencies[1].name).toBe('medium');
      expect(data.dependencies[1].import_count).toBe(2);
      expect(data.dependencies[2].name).toBe('few');
      expect(data.dependencies[2].import_count).toBe(1);
    });
  });

  describe('summary statistics', () => {
    it('should calculate correct summary values', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          used1: '^1.0.0',
          used2: '^1.0.0',
          unused1: '^1.0.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.includes('src')) {
          return [
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        `import x from 'used1'; import y from 'used2';`
      );

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.summary.total).toBe(3);
      expect(data.summary.used).toBe(2);
      expect(data.summary.unused).toBe(1);
      expect(data.summary.outdated).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle directory read errors gracefully', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockRejectedValue(
        new Error('Permission denied')
      );

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);

      // Should not throw, should return result
      expect(result.isError).toBeUndefined();
    });

    it('should handle file read errors gracefully', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.includes('src')) {
          return [
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockRejectedValue(
        new Error('File read error')
      );

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);

      // Should not throw, should return result with 0 imports
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.dependencies[0].import_count).toBe(0);
    });

    it('should handle root directory read errors', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      // First call for src directories works, but root directory fails
      let callCount = 0;
      vi.mocked(fsPromises.readdir).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Root directory error');
        }
        return [];
      });

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('response format', () => {
    it('should return properly formatted response', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return valid JSON', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it('should have expected structure', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('dependencies');
      expect(data).toHaveProperty('summary');
      expect(data.summary).toHaveProperty('total');
      expect(data.summary).toHaveProperty('used');
      expect(data.summary).toHaveProperty('unused');
      expect(data.summary).toHaveProperty('outdated');
    });

    it('should have expected dependency structure', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
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

  describe('edge cases', () => {
    it('should handle empty source directories', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies[0].import_count).toBe(0);
    });

    it('should handle files with no imports', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.includes('src')) {
          return [
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        `const x = 1;\nexport default x;`
      );

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies[0].import_count).toBe(0);
    });

    it('should handle package.json with null dependencies', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: null,
        devDependencies: null,
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies).toEqual([]);
    });

    it('should handle mixed import styles in same file', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^18.2.0',
          lodash: '^4.17.0',
          express: '^4.18.0',
        },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.includes('src')) {
          return [
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        `import React from 'react';
const lodash = require('lodash');
const express = await import('express');`
      );

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.summary.used).toBe(3);
    });

    it('should handle scoped package with only scope part', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { '@scope': '^1.0.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.includes('src')) {
          return [
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      // This is an edge case - importing just @scope (unlikely but tests the code path)
      vi.mocked(fsPromises.readFile).mockResolvedValue(`import x from '@scope';`);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      const dep = data.dependencies.find((d: { name: string }) => d.name === '@scope');
      expect(dep.used).toBe(true);
    });

    it('should aggregate imports across multiple files', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.includes('src')) {
          return [
            { name: 'a.ts', isDirectory: () => false, isFile: () => true },
            { name: 'b.ts', isDirectory: () => false, isFile: () => true },
            { name: 'c.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`import React from 'react';`);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies[0].import_count).toBe(3);
    });
  });

  describe('safeExec exception handling', () => {
    it('should handle safeExec throwing an exception', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(safeExec).mockRejectedValue(new Error('Network error'));

      const args: AnalyzeDependenciesArgs = { check_updates: true };
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      // Should not crash, version info should be undefined
      expect(result.isError).toBeUndefined();
      expect(data.dependencies[0].latest_version).toBeUndefined();
    });
  });

  describe('branch coverage - symlinks and special entries', () => {
    it('should skip entries that are neither files nor directories (symlinks)', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.includes('src')) {
          return [
            // A symlink (neither file nor directory)
            { name: 'symlink.ts', isDirectory: () => false, isFile: () => false },
            // A regular file
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`import React from 'react';`);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      // Should only count the regular file, not the symlink
      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.import_count).toBe(1);
    });

    it('should skip root entries that are neither files nor directories', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.endsWith('root')) {
          return [
            // A symlink at root level
            { name: 'symlink.ts', isDirectory: () => false, isFile: () => false },
            // A regular file
            { name: 'index.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`import React from 'react';`);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      // Should only count the regular file, not the symlink
      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.import_count).toBe(1);
    });

    it('should handle root directory entries that are directories (not processed)', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: { react: '^18.2.0' },
      });
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.endsWith('root')) {
          return [
            // A directory at root level - should be skipped in root processing
            { name: 'subdir', isDirectory: () => true, isFile: () => false },
            // A regular file
            { name: 'index.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(`import React from 'react';`);

      const args: AnalyzeDependenciesArgs = {};
      const result = await handleAnalyzeDependencies(args);
      const data = JSON.parse(result.content[0].text);

      // Should only count the regular file
      const reactDep = data.dependencies.find((d: { name: string }) => d.name === 'react');
      expect(reactDep.import_count).toBe(1);
    });
  });
});
