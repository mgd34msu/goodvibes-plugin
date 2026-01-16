/**
 * Unit tests for bundle-analyzer handler
 *
 * Tests cover:
 * - formatBytes utility function
 * - estimateGzipSize function with success and error paths
 * - findBuildDirectory with various candidate directories
 * - findBundleFiles recursive file discovery
 * - extractModules for webpack and large package patterns
 * - extractPackageName for various module path formats
 * - detectDuplicates from package-lock.json
 * - checkTreeShakingIssues for package.json analysis
 * - generateRecommendations based on analysis results
 * - handleAnalyzeBundle main handler with all code paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';

// Mock modules before imports
vi.mock('fs/promises');
vi.mock('zlib', () => ({
  gzip: vi.fn(),
}));
vi.mock('util', () => ({
  promisify: vi.fn((fn) => fn),
}));
vi.mock('../../../utils.js', () => ({
  fileExists: vi.fn(),
  readJsonFile: vi.fn(),
}));
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

import {
  handleAnalyzeBundle,
  extractPackageName,
  generateRecommendations,
  type AnalyzeBundleArgs,
  type BundleFormat,
  type BundleAnalysis,
} from '../../../handlers/build/bundle-analyzer.js';
import { fileExists, readJsonFile } from '../../../utils.js';

describe('bundle-analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('handleAnalyzeBundle - main handler', () => {
    describe('build directory handling', () => {
      it('should return error when specified path does not exist', async () => {
        vi.mocked(fileExists).mockResolvedValue(false);

        const args: AnalyzeBundleArgs = { path: 'nonexistent/dir' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(data.error).toContain('Build directory not found');
        expect(data.hint).toContain('Run your build command first');
      });

      it('should return error when no build directory is found automatically', async () => {
        vi.mocked(fileExists).mockResolvedValue(false);

        const args: AnalyzeBundleArgs = {};
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(data.error).toContain('No build output directory found');
        expect(data.hint).toContain('dist/, .next/, build/');
      });

      it('should find dist directory when it exists', async () => {
        // First call for findBuildDirectory checks, rest for processing
        vi.mocked(fileExists).mockImplementation(async (filePath) => {
          const pathStr = String(filePath);
          return pathStr.endsWith('dist');
        });
        vi.mocked(fsPromises.readdir).mockResolvedValue([]);

        const args: AnalyzeBundleArgs = {};
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        // Returns error because no bundle files found, but this confirms
        // the build directory was found
        expect(result.isError).toBe(true);
        expect(data.error).toContain('No bundle files found');
      });

      it('should find .next/static directory when it exists', async () => {
        vi.mocked(fileExists).mockImplementation(async (filePath) => {
          const pathStr = String(filePath);
          return pathStr.includes('.next') && pathStr.includes('static');
        });
        vi.mocked(fsPromises.readdir).mockResolvedValue([]);

        const args: AnalyzeBundleArgs = {};
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(data.error).toContain('No bundle files found');
      });

      it('should find build/static directory when it exists', async () => {
        vi.mocked(fileExists).mockImplementation(async (filePath) => {
          const pathStr = String(filePath);
          // Must match build/static but not just build
          return pathStr.endsWith('build/static') || pathStr.endsWith('build\\static');
        });
        vi.mocked(fsPromises.readdir).mockResolvedValue([]);

        const args: AnalyzeBundleArgs = {};
        const result = await handleAnalyzeBundle(args);

        // File finding should proceed
        expect(fileExists).toHaveBeenCalled();
      });

      it('should find build directory when it exists', async () => {
        let callCount = 0;
        vi.mocked(fileExists).mockImplementation(async (filePath) => {
          const pathStr = String(filePath);
          // Return false for dist, .next/static, build/static and true for build
          if (pathStr.endsWith('dist')) return false;
          if (pathStr.includes('.next')) return false;
          if (pathStr.endsWith('build/static') || pathStr.endsWith('build\\static')) return false;
          if (pathStr.endsWith('build')) return true;
          return false;
        });
        vi.mocked(fsPromises.readdir).mockResolvedValue([]);

        const args: AnalyzeBundleArgs = {};
        const result = await handleAnalyzeBundle(args);

        expect(fileExists).toHaveBeenCalled();
      });

      it('should find .output directory when it exists', async () => {
        vi.mocked(fileExists).mockImplementation(async (filePath) => {
          const pathStr = String(filePath);
          if (pathStr.endsWith('dist')) return false;
          if (pathStr.includes('.next')) return false;
          if (pathStr.includes('build')) return false;
          if (pathStr.endsWith('.output')) return true;
          return false;
        });
        vi.mocked(fsPromises.readdir).mockResolvedValue([]);

        const args: AnalyzeBundleArgs = {};
        const result = await handleAnalyzeBundle(args);

        expect(fileExists).toHaveBeenCalled();
      });

      it('should find out directory when it exists', async () => {
        vi.mocked(fileExists).mockImplementation(async (filePath) => {
          const pathStr = String(filePath);
          if (pathStr.endsWith('dist')) return false;
          if (pathStr.includes('.next')) return false;
          if (pathStr.includes('build')) return false;
          if (pathStr.endsWith('.output')) return false;
          if (pathStr.endsWith('out')) return true;
          return false;
        });
        vi.mocked(fsPromises.readdir).mockResolvedValue([]);

        const args: AnalyzeBundleArgs = {};
        const result = await handleAnalyzeBundle(args);

        expect(fileExists).toHaveBeenCalled();
      });

      it('should find .vercel/output/static directory when it exists', async () => {
        vi.mocked(fileExists).mockImplementation(async (filePath) => {
          const pathStr = String(filePath);
          if (pathStr.endsWith('dist')) return false;
          if (pathStr.includes('.next')) return false;
          if (pathStr.includes('build')) return false;
          if (pathStr.endsWith('.output')) return false;
          if (pathStr.endsWith('out')) return false;
          if (pathStr.includes('.vercel') && pathStr.includes('static')) return true;
          return false;
        });
        vi.mocked(fsPromises.readdir).mockResolvedValue([]);

        const args: AnalyzeBundleArgs = {};
        const result = await handleAnalyzeBundle(args);

        expect(fileExists).toHaveBeenCalled();
      });

      it('should use specified path when provided and valid', async () => {
        vi.mocked(fileExists).mockImplementation(async (filePath) => {
          const pathStr = String(filePath);
          return pathStr.includes('custom-dist');
        });
        vi.mocked(fsPromises.readdir).mockResolvedValue([]);

        const args: AnalyzeBundleArgs = { path: 'custom-dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(data.error).toContain('No bundle files found');
      });
    });

    describe('bundle file discovery', () => {
      it('should return error when no bundle files found', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([]);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(data.error).toContain('No bundle files found');
        expect(data.hint).toContain('.js or .css files');
      });

      it('should discover .js files in build directory', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('console.log("hello")'));
        vi.mocked(zlib.gzip).mockImplementation((content, options, callback) => {
          if (typeof options === 'function') {
            callback = options;
          }
          // For promisified version, return compressed buffer
          return Buffer.from('compressed');
        });
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.files_analyzed).toBe(1);
        expect(data.chunks.length).toBe(1);
        expect(data.chunks[0].name).toBe('main.js');
      });

      it('should discover .mjs files in build directory', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'module.mjs', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('export const x = 1'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.files_analyzed).toBe(1);
      });

      it('should discover .css files in build directory', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'styles.css', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('.class { color: red }'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.files_analyzed).toBe(1);
        expect(data.chunks[0].name).toBe('styles.css');
      });

      it('should skip .map files', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
          { name: 'main.js.map', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.files_analyzed).toBe(1);
      });

      it('should recursively discover files in subdirectories', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
          const dirStr = String(dir);
          if (dirStr.endsWith('dist') || dirStr.endsWith('dist/')) {
            return [
              { name: 'chunks', isDirectory: () => true, isFile: () => false },
              { name: 'main.js', isDirectory: () => false, isFile: () => true },
            ] as unknown as fsPromises.Dirent[];
          }
          if (dirStr.includes('chunks')) {
            return [
              { name: 'vendor.js', isDirectory: () => false, isFile: () => true },
            ] as unknown as fsPromises.Dirent[];
          }
          return [];
        });
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.files_analyzed).toBe(2);
      });

      it('should skip node_modules directories in bundle output', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
          const dirStr = String(dir);
          if (dirStr.endsWith('dist') || dirStr.endsWith('dist/')) {
            return [
              { name: 'node_modules', isDirectory: () => true, isFile: () => false },
              { name: 'main.js', isDirectory: () => false, isFile: () => true },
            ] as unknown as fsPromises.Dirent[];
          }
          // Should not reach here for node_modules
          if (dirStr.includes('node_modules')) {
            return [
              { name: 'huge-package.js', isDirectory: () => false, isFile: () => true },
            ] as unknown as fsPromises.Dirent[];
          }
          return [];
        });
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.files_analyzed).toBe(1);
      });

      it('should handle directory read errors gracefully', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockRejectedValue(new Error('Permission denied'));

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(data.error).toContain('No bundle files found');
      });

      it('should handle file read errors gracefully and skip unreadable files', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'readable.js', isDirectory: () => false, isFile: () => true },
          { name: 'unreadable.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        vi.mocked(fsPromises.readFile).mockImplementation(async (filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('unreadable')) {
            throw new Error('Permission denied');
          }
          return Buffer.from('readable content');
        });
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        // Both files are "analyzed" even though one failed - the error is caught and skipped
        // The files_analyzed count reflects successfully processed files
        expect(data.files_analyzed).toBe(2);
        // But only one chunk should be in the output (the readable one)
        expect(data.chunks.length).toBe(1);
      });

      it('should skip non-JS/CSS files', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
          { name: 'image.png', isDirectory: () => false, isFile: () => true },
          { name: 'data.json', isDirectory: () => false, isFile: () => true },
          { name: 'readme.txt', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.files_analyzed).toBe(1);
      });
    });

    describe('size calculation', () => {
      it('should calculate raw and gzip sizes correctly', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        const content = 'x'.repeat(1000);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(content));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('x'.repeat(300)));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.total_size.raw).toBe(1000);
        expect(data.total_size.gzip).toBe(300);
        expect(data.chunks[0].size).toBe(1000);
        expect(data.chunks[0].gzip_size).toBe(300);
      });

      it('should estimate gzip size when compression fails', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        const content = 'x'.repeat(1000);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(content));
        vi.mocked(zlib.gzip).mockImplementation(() => {
          throw new Error('Compression failed');
        });
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.total_size.raw).toBe(1000);
        // Should estimate 30% of raw size
        expect(data.total_size.gzip).toBe(300);
      });

      it('should format bytes less than 1KB', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'tiny.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('x'.repeat(500)));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('x'.repeat(150)));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(data.total_size.formatted).toContain('500 B');
      });

      it('should format bytes in KB range', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'medium.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('x'.repeat(50000)));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('x'.repeat(15000)));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(data.total_size.formatted).toContain('KB');
      });

      it('should format bytes in MB range', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'large.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('x'.repeat(2 * 1024 * 1024)));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('x'.repeat(600 * 1024)));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(data.total_size.formatted).toContain('MB');
      });
    });

    describe('module extraction', () => {
      it('should extract modules from webpack comment patterns', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        const webpackBundle = `
          /*! node_modules/lodash/lodash.js */
          /*! node_modules/@tanstack/react-query/index.js */
          /*! node_modules/react-dom/index.js */
        `;
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(webpackBundle));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.largest_modules.length).toBeGreaterThan(0);
      });

      it('should detect moment.js patterns in minified code', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        const bundleWithMoment = 'function(){moment.locale("en");moment.format("YYYY")}';
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(bundleWithMoment));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        const momentModule = data.largest_modules.find((m: { from_package: string }) => m.from_package === 'moment');
        expect(momentModule).toBeDefined();
      });

      it('should detect lodash patterns in minified code', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        const bundleWithLodash = 'var lodash=function(){_.map([1,2,3]);_.filter(arr)}';
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(bundleWithLodash));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        const lodashModule = data.largest_modules.find((m: { from_package: string }) => m.from_package === 'lodash');
        expect(lodashModule).toBeDefined();
      });

      it('should detect jQuery patterns in minified code', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        const bundleWithJQuery = 'jQuery(document);$.ajax({url:"/api"});$.get("/data")';
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(bundleWithJQuery));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        const jqueryModule = data.largest_modules.find((m: { from_package: string }) => m.from_package === 'jquery');
        expect(jqueryModule).toBeDefined();
      });

      it('should detect axios patterns in minified code', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        const bundleWithAxios = 'axios.get("/api");axios.post("/data",{});axios.delete("/item")';
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(bundleWithAxios));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        const axiosModule = data.largest_modules.find((m: { from_package: string }) => m.from_package === 'axios');
        expect(axiosModule).toBeDefined();
      });

      it('should detect React patterns in minified code', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        const bundleWithReact = 'React.createElement("div",null,"Hello")';
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(bundleWithReact));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        const reactModule = data.largest_modules.find((m: { from_package: string }) => m.from_package === 'react');
        expect(reactModule).toBeDefined();
      });

      it('should detect Chart.js patterns in minified code', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        const bundleWithChart = 'new Chart(ctx,{type:"Line"});Chart.Bar(data);Chart.Pie(options)';
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(bundleWithChart));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        const chartModule = data.largest_modules.find((m: { from_package: string }) => m.from_package === 'chart.js');
        expect(chartModule).toBeDefined();
      });

      it('should not duplicate modules already seen', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        const bundleWithDuplicates = `
          /*! node_modules/lodash/index.js */
          /*! node_modules/lodash/map.js */
          lodash.map([1,2,3]);_.filter(arr);
        `;
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(bundleWithDuplicates));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        // Should only have one lodash entry
        const lodashModules = data.largest_modules.filter((m: { from_package: string }) => m.from_package === 'lodash');
        expect(lodashModules.length).toBeLessThanOrEqual(1);
      });
    });

    describe('package name extraction', () => {
      it('should extract package name from node_modules path', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        const webpackBundle = '/*! node_modules/react/index.js */';
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(webpackBundle));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        const reactModule = data.largest_modules.find((m: { from_package: string }) => m.from_package === 'react');
        expect(reactModule).toBeDefined();
      });

      it('should extract scoped package name from node_modules path', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        const webpackBundle = '/*! node_modules/@tanstack/react-query/index.js */';
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(webpackBundle));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        const tanstackModule = data.largest_modules.find((m: { from_package: string }) => m.from_package === '@tanstack/react-query');
        expect(tanstackModule).toBeDefined();
      });

      it('should extract scoped package name from direct import path', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        const webpackBundle = '/*! @testing-library/react/pure */';
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(webpackBundle));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        const testingLibModule = data.largest_modules.find((m: { from_package: string }) => m.from_package === '@testing-library/react');
        expect(testingLibModule).toBeDefined();
      });

      it('should extract regular package name from import path', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        const webpackBundle = '/*! express/lib/router */';
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(webpackBundle));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        const expressModule = data.largest_modules.find((m: { from_package: string }) => m.from_package === 'express');
        expect(expressModule).toBeDefined();
      });

      it('should skip relative paths starting with dot', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        const webpackBundle = '/*! ./local/module */';
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(webpackBundle));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        // Should not include local modules
        expect(data.largest_modules.length).toBe(0);
      });

      it('should handle webpack comments without slashes (no package extraction)', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        // Module name without slash - should not be extracted as it doesn't match the pattern
        const webpackBundle = '/*! somesingleword */';
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(webpackBundle));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        // Single word without slash should not be extracted
        expect(data.largest_modules.length).toBe(0);
      });
    });

    describe('duplicate detection', () => {
      it('should detect duplicate packages from package-lock.json', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package-lock.json')) {
            return {
              packages: {
                'node_modules/lodash': { version: '4.17.21' },
                'node_modules/some-pkg/node_modules/lodash': { version: '4.17.15' },
              },
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.duplicates.length).toBe(1);
        expect(data.duplicates[0].package).toBe('lodash');
        expect(data.duplicates[0].versions).toContain('4.17.21');
        expect(data.duplicates[0].versions).toContain('4.17.15');
      });

      it('should detect duplicate scoped packages', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package-lock.json')) {
            return {
              packages: {
                'node_modules/@babel/core': { version: '7.23.0' },
                'node_modules/some-pkg/node_modules/@babel/core': { version: '7.22.0' },
              },
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.duplicates.length).toBe(1);
        expect(data.duplicates[0].package).toBe('@babel/core');
      });

      it('should not report packages with single version as duplicates', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package-lock.json')) {
            return {
              packages: {
                'node_modules/react': { version: '18.2.0' },
              },
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.duplicates.length).toBe(0);
      });

      it('should limit duplicates to top 10', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));

        const packages: Record<string, { version: string }> = {};
        for (let i = 0; i < 15; i++) {
          packages[`node_modules/pkg${i}`] = { version: '1.0.0' };
          packages[`node_modules/nested/node_modules/pkg${i}`] = { version: '2.0.0' };
        }

        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package-lock.json')) {
            return { packages };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.duplicates.length).toBeLessThanOrEqual(10);
      });

      it('should handle missing package-lock.json', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.duplicates.length).toBe(0);
      });

      it('should handle package-lock.json without packages field', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package-lock.json')) {
            return { name: 'project', version: '1.0.0' };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.duplicates.length).toBe(0);
      });

      it('should skip packages without version info', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package-lock.json')) {
            return {
              packages: {
                'node_modules/pkg-with-version': { version: '1.0.0' },
                'node_modules/pkg-without-version': {},
              },
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        // Should not crash and should not include pkg-without-version in duplicates
      });

      it('should skip paths not containing node_modules', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package-lock.json')) {
            return {
              packages: {
                '': { version: '1.0.0' }, // Root package
                'packages/workspace-a': { version: '1.0.0' }, // Workspace package
                'node_modules/actual-pkg': { version: '2.0.0' },
              },
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.duplicates.length).toBe(0);
      });
    });

    describe('tree-shaking issues', () => {
      it('should warn about missing sideEffects field', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package.json') && !String(filePath).includes('package-lock')) {
            return {
              name: 'my-project',
              dependencies: {},
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.recommendations.some((r: string) => r.includes('sideEffects'))).toBe(true);
      });

      it('should warn about missing type: module', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package.json') && !String(filePath).includes('package-lock')) {
            return {
              name: 'my-project',
              sideEffects: false,
              dependencies: {},
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.recommendations.some((r: string) => r.includes('type') && r.includes('module'))).toBe(true);
      });

      it('should not warn when sideEffects and type: module are present', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package.json') && !String(filePath).includes('package-lock')) {
            return {
              name: 'my-project',
              type: 'module',
              sideEffects: false,
              dependencies: {},
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.recommendations.some((r: string) => r.includes('sideEffects'))).toBe(false);
        expect(data.recommendations.some((r: string) => r.includes('type') && r.includes('module'))).toBe(false);
      });

      it('should warn about moment.js in dependencies', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package.json') && !String(filePath).includes('package-lock')) {
            return {
              name: 'my-project',
              type: 'module',
              sideEffects: false,
              dependencies: {
                moment: '^2.29.0',
              },
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.recommendations.some((r: string) => r.includes('moment') && r.includes('date-fns'))).toBe(true);
      });

      it('should warn about lodash in dependencies', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package.json') && !String(filePath).includes('package-lock')) {
            return {
              name: 'my-project',
              type: 'module',
              sideEffects: false,
              dependencies: {
                lodash: '^4.17.0',
              },
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.recommendations.some((r: string) => r.includes('lodash') && r.includes('lodash-es'))).toBe(true);
      });

      it('should warn about jquery in devDependencies', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package.json') && !String(filePath).includes('package-lock')) {
            return {
              name: 'my-project',
              type: 'module',
              sideEffects: false,
              devDependencies: {
                jquery: '^3.6.0',
              },
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.recommendations.some((r: string) => r.includes('jquery') && r.includes('vanilla'))).toBe(true);
      });

      it('should warn about underscore in dependencies', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package.json') && !String(filePath).includes('package-lock')) {
            return {
              name: 'my-project',
              type: 'module',
              sideEffects: false,
              dependencies: {
                underscore: '^1.13.0',
              },
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.recommendations.some((r: string) => r.includes('underscore'))).toBe(true);
      });

      it('should warn about axios in dependencies', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package.json') && !String(filePath).includes('package-lock')) {
            return {
              name: 'my-project',
              type: 'module',
              sideEffects: false,
              dependencies: {
                axios: '^1.6.0',
              },
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.recommendations.some((r: string) => r.includes('axios') && r.includes('fetch'))).toBe(true);
      });

      it('should warn about numeral in dependencies', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package.json') && !String(filePath).includes('package-lock')) {
            return {
              name: 'my-project',
              type: 'module',
              sideEffects: false,
              dependencies: {
                numeral: '^2.0.0',
              },
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.recommendations.some((r: string) => r.includes('numeral') && r.includes('Intl.NumberFormat'))).toBe(true);
      });

      it('should warn about chart.js in dependencies', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package.json') && !String(filePath).includes('package-lock')) {
            return {
              name: 'my-project',
              type: 'module',
              sideEffects: false,
              dependencies: {
                'chart.js': '^4.4.0',
              },
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.recommendations.some((r: string) => r.includes('chart.js'))).toBe(true);
      });

      it('should handle missing package.json gracefully', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        // Should not crash and should have empty or minimal recommendations
      });
    });

    describe('recommendations', () => {
      it('should recommend code splitting for large bundles over 1MB', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('x'.repeat(1.5 * 1024 * 1024)));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('x'.repeat(400 * 1024)));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.recommendations.some((r: string) => r.includes('1MB') && r.includes('code splitting'))).toBe(true);
      });

      it('should warn about gzipped size over 250KB', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('x'.repeat(500 * 1024)));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('x'.repeat(300 * 1024)));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.recommendations.some((r: string) => r.includes('250KB') && r.includes('page load'))).toBe(true);
      });

      it('should recommend npm dedupe when duplicates found', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package-lock.json')) {
            return {
              packages: {
                'node_modules/lodash': { version: '4.17.21' },
                'node_modules/nested/node_modules/lodash': { version: '4.17.15' },
              },
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.recommendations.some((r: string) => r.includes('duplicate') && r.includes('npm dedupe'))).toBe(true);
      });

      it('should warn about large chunks over 500KB', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'vendor.js', isDirectory: () => false, isFile: () => true },
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        let fileIndex = 0;
        vi.mocked(fsPromises.readFile).mockImplementation(async () => {
          fileIndex++;
          if (fileIndex === 1) {
            return Buffer.from('x'.repeat(600 * 1024)); // vendor.js - large
          }
          return Buffer.from('x'.repeat(100 * 1024)); // main.js - small
        });
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.recommendations.some((r: string) => r.includes('500KB') && r.includes('splitting'))).toBe(true);
      });

      it('should limit recommendations to 10', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('x'.repeat(2 * 1024 * 1024)));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('x'.repeat(500 * 1024)));

        const packages: Record<string, { version: string }> = {};
        for (let i = 0; i < 15; i++) {
          packages[`node_modules/pkg${i}`] = { version: '1.0.0' };
          packages[`node_modules/nested/node_modules/pkg${i}`] = { version: '2.0.0' };
        }

        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package-lock.json')) {
            return { packages };
          }
          if (String(filePath).includes('package.json')) {
            return {
              dependencies: {
                moment: '^2.29.0',
                lodash: '^4.17.0',
                jquery: '^3.6.0',
                underscore: '^1.13.0',
                axios: '^1.6.0',
                numeral: '^2.0.0',
                'chart.js': '^4.4.0',
              },
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.recommendations.length).toBeLessThanOrEqual(10);
      });
    });

    describe('output format', () => {
      it('should return summary format by default', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'chunk1.js', isDirectory: () => false, isFile: () => true },
          { name: 'chunk2.js', isDirectory: () => false, isFile: () => true },
          { name: 'chunk3.js', isDirectory: () => false, isFile: () => true },
          { name: 'chunk4.js', isDirectory: () => false, isFile: () => true },
          { name: 'chunk5.js', isDirectory: () => false, isFile: () => true },
          { name: 'chunk6.js', isDirectory: () => false, isFile: () => true },
          { name: 'chunk7.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        // Summary format shows only top 5 chunks
        expect(data.chunks.length).toBeLessThanOrEqual(5);
      });

      it('should return detailed format when specified', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'chunk1.js', isDirectory: () => false, isFile: () => true },
          { name: 'chunk2.js', isDirectory: () => false, isFile: () => true },
          { name: 'chunk3.js', isDirectory: () => false, isFile: () => true },
          { name: 'chunk4.js', isDirectory: () => false, isFile: () => true },
          { name: 'chunk5.js', isDirectory: () => false, isFile: () => true },
          { name: 'chunk6.js', isDirectory: () => false, isFile: () => true },
          { name: 'chunk7.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist', format: 'detailed' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        // Detailed format shows all chunks
        expect(data.chunks.length).toBe(7);
      });

      it('should sort chunks by size descending', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'small.js', isDirectory: () => false, isFile: () => true },
          { name: 'large.js', isDirectory: () => false, isFile: () => true },
          { name: 'medium.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        let fileIndex = 0;
        vi.mocked(fsPromises.readFile).mockImplementation(async () => {
          fileIndex++;
          if (fileIndex === 1) return Buffer.from('x'.repeat(100)); // small
          if (fileIndex === 2) return Buffer.from('x'.repeat(1000)); // large
          return Buffer.from('x'.repeat(500)); // medium
        });
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist', format: 'detailed' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.chunks[0].size).toBeGreaterThanOrEqual(data.chunks[1].size);
        expect(data.chunks[1].size).toBeGreaterThanOrEqual(data.chunks[2].size);
      });

      it('should include build_directory in output', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.build_directory).toBeDefined();
      });

      it('should include files_analyzed count', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
          { name: 'vendor.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.files_analyzed).toBe(2);
      });

      it('should limit largest_modules to 10', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        // Generate webpack comments for many packages
        const manyPackages = Array.from({ length: 15 }, (_, i) =>
          `/*! node_modules/pkg${i}/index.js */`
        ).join('\n');
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(manyPackages));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.largest_modules.length).toBeLessThanOrEqual(10);
      });

      it('should deduplicate modules by package name keeping largest', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle1.js', isDirectory: () => false, isFile: () => true },
          { name: 'bundle2.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        let fileIndex = 0;
        vi.mocked(fsPromises.readFile).mockImplementation(async () => {
          fileIndex++;
          if (fileIndex === 1) {
            return Buffer.from('/*! node_modules/lodash/lodash.js */');
          }
          // Same package in different bundle
          return Buffer.from('/*! node_modules/lodash/map.js */');
        });
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        // Should only have one entry for lodash
        const lodashModules = data.largest_modules.filter((m: { from_package: string }) => m.from_package === 'lodash');
        expect(lodashModules.length).toBeLessThanOrEqual(1);
      });
    });

    describe('symlink handling', () => {
      it('should skip symlinks (entries that are neither files nor directories)', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
          { name: 'symlink.js', isDirectory: () => false, isFile: () => false }, // symlink
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        // Only the actual file should be processed
        expect(data.files_analyzed).toBe(1);
      });
    });

    describe('scoped package edge cases', () => {
      it('should return null for scoped package with only scope (no package name)', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        // Webpack comment with just scope but no package name - note the slash is required for regex match
        // This pattern will not match the webpack regex since there's no / in the module name content
        const webpackBundle = '/*! @scope */';
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(webpackBundle));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        // Should not extract package since scope-only path is invalid
        expect(data.largest_modules.length).toBe(0);
      });

      it('should handle scoped package with trailing slash', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'bundle.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        // Path like "@scope/" which when split by "/" gives ["@scope", ""] - 2 parts
        // This tests the scoped package handling with empty second part
        const webpackBundle = '/*! @scope/ */';
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(webpackBundle));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        // The second part after split is empty string, resulting in @scope/ as package name
        // This is an edge case but the code handles it without crashing
        expect(data.largest_modules.some((m: { from_package: string }) => m.from_package === '@scope/')).toBe(true);
      });

    });

    describe('package-lock edge cases', () => {
      it('should handle nested node_modules paths that do not match regex', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockImplementation(async (filePath) => {
          if (String(filePath).includes('package-lock.json')) {
            return {
              packages: {
                // Path that includes node_modules/ but doesn't end with a package name
                'node_modules/': { version: '1.0.0' },
                // Malformed path
                'node_modules//': { version: '2.0.0' },
              },
            };
          }
          return null;
        });

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        // Should not crash and should have no duplicates
        expect(data.duplicates.length).toBe(0);
      });
    });

    describe('edge cases', () => {
      it('should handle empty bundle files gracefully', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'empty.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from(''));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from(''));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.total_size.raw).toBe(0);
      });

      it('should handle uppercase file extensions', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'main.JS', isDirectory: () => false, isFile: () => true },
          { name: 'styles.CSS', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);
        vi.mocked(fsPromises.readFile).mockResolvedValue(Buffer.from('code'));
        vi.mocked(zlib.gzip).mockImplementation(() => Buffer.from('compressed'));
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.files_analyzed).toBe(2);
      });

      it('should aggregate sizes from multiple files correctly', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(fsPromises.readdir).mockResolvedValue([
          { name: 'file1.js', isDirectory: () => false, isFile: () => true },
          { name: 'file2.js', isDirectory: () => false, isFile: () => true },
          { name: 'file3.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[]);

        let fileIndex = 0;
        vi.mocked(fsPromises.readFile).mockImplementation(async () => {
          fileIndex++;
          return Buffer.from('x'.repeat(1000 * fileIndex)); // 1000, 2000, 3000
        });
        vi.mocked(zlib.gzip).mockImplementation((content) => {
          // Return half the size
          return Buffer.from('x'.repeat(Math.floor((content as Buffer).length / 2)));
        });
        vi.mocked(readJsonFile).mockResolvedValue(null);

        const args: AnalyzeBundleArgs = { path: 'dist' };
        const result = await handleAnalyzeBundle(args);
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.total_size.raw).toBe(6000); // 1000 + 2000 + 3000
        expect(data.total_size.gzip).toBe(3000); // 500 + 1000 + 1500
      });
    });
  });

  // Direct unit tests for exported internal functions
  describe('extractPackageName', () => {
    it('should extract package name from node_modules path', () => {
      expect(extractPackageName('node_modules/lodash/index.js')).toBe('lodash');
    });

    it('should extract scoped package from node_modules path', () => {
      expect(extractPackageName('node_modules/@babel/core/lib/index.js')).toBe('@babel/core');
    });

    it('should extract scoped package from direct import path', () => {
      expect(extractPackageName('@testing-library/react/pure')).toBe('@testing-library/react');
    });

    it('should extract regular package from import path', () => {
      expect(extractPackageName('express/lib/router')).toBe('express');
    });

    it('should return null for relative paths starting with dot', () => {
      expect(extractPackageName('./local/module')).toBeNull();
      expect(extractPackageName('../parent/module')).toBeNull();
    });

    it('should return empty string for empty string input', () => {
      // Empty string split('/') gives [''], parts.length = 1 > 0
      // parts[0] = '' doesn't start with '.', so returns ''
      expect(extractPackageName('')).toBe('');
    });

    // Coverage for line 240: scoped package with only scope (parts.length < 2)
    it('should return first part for scoped package with no slash (parts.length < 2)', () => {
      // When modulePath = "@scope" (no slash), split('/') gives ["@scope"], length = 1
      // The condition parts.length >= 2 is false, so it falls through to regular handling
      // At line 247, parts[0] = "@scope" doesn't start with ".", so returns "@scope"
      const result = extractPackageName('@scope');
      expect(result).toBe('@scope');
    });

    it('should handle single word package name', () => {
      expect(extractPackageName('react')).toBe('react');
    });

    it('should handle paths that start with dot after split', () => {
      // This path has a leading dot when we get to the regular package handling
      expect(extractPackageName('.hidden')).toBeNull();
    });
  });

  describe('generateRecommendations', () => {
    it('should recommend code splitting for bundles over 1MB', () => {
      const analysis: Partial<BundleAnalysis> = {
        total_size: { raw: 1.5 * 1024 * 1024, gzip: 100 * 1024, formatted: '1.5 MB' },
      };
      const recommendations = generateRecommendations(analysis, []);
      expect(recommendations.some(r => r.includes('1MB') && r.includes('code splitting'))).toBe(true);
    });

    it('should warn about gzipped size over 250KB', () => {
      const analysis: Partial<BundleAnalysis> = {
        total_size: { raw: 500 * 1024, gzip: 300 * 1024, formatted: '500 KB' },
      };
      const recommendations = generateRecommendations(analysis, []);
      expect(recommendations.some(r => r.includes('250KB'))).toBe(true);
    });

    it('should recommend npm dedupe for duplicates', () => {
      const analysis: Partial<BundleAnalysis> = {
        duplicates: [{ package: 'lodash', versions: ['4.17.21', '4.17.15'], total_size: 0 }],
      };
      const recommendations = generateRecommendations(analysis, []);
      expect(recommendations.some(r => r.includes('duplicate') && r.includes('npm dedupe'))).toBe(true);
    });

    it('should include tree-shaking issues', () => {
      const analysis: Partial<BundleAnalysis> = {};
      const treeShakingIssues = ['Consider adding sideEffects: false'];
      const recommendations = generateRecommendations(analysis, treeShakingIssues);
      expect(recommendations).toContain('Consider adding sideEffects: false');
    });

    it('should warn about large chunks over 500KB', () => {
      const analysis: Partial<BundleAnalysis> = {
        chunks: [
          { name: 'vendor.js', size: 600 * 1024, gzip_size: 200 * 1024, modules: 5 },
          { name: 'main.js', size: 100 * 1024, gzip_size: 30 * 1024, modules: 2 },
        ],
      };
      const recommendations = generateRecommendations(analysis, []);
      expect(recommendations.some(r => r.includes('500KB') && r.includes('splitting'))).toBe(true);
    });

    // Coverage for line 364: when analysis.chunks is undefined
    it('should handle undefined chunks gracefully (line 364 branch)', () => {
      const analysis: Partial<BundleAnalysis> = {
        total_size: { raw: 100 * 1024, gzip: 30 * 1024, formatted: '100 KB' },
        // chunks is explicitly undefined
      };
      const recommendations = generateRecommendations(analysis, []);
      // Should not crash and should not include chunk-related recommendations
      expect(recommendations.every(r => !r.includes('500KB'))).toBe(true);
    });

    it('should handle empty analysis object', () => {
      const recommendations = generateRecommendations({}, []);
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('should limit recommendations to 10', () => {
      const analysis: Partial<BundleAnalysis> = {
        total_size: { raw: 2 * 1024 * 1024, gzip: 500 * 1024, formatted: '2 MB' },
        duplicates: Array.from({ length: 5 }, (_, i) => ({
          package: `pkg${i}`,
          versions: ['1.0.0', '2.0.0'],
          total_size: 0,
        })),
        chunks: Array.from({ length: 10 }, (_, i) => ({
          name: `chunk${i}.js`,
          size: 600 * 1024,
          gzip_size: 200 * 1024,
          modules: 3,
        })),
      };
      const treeShakingIssues = Array.from({ length: 10 }, (_, i) => `Issue ${i}`);
      const recommendations = generateRecommendations(analysis, treeShakingIssues);
      expect(recommendations.length).toBeLessThanOrEqual(10);
    });

    it('should not warn about small bundles under 1MB', () => {
      const analysis: Partial<BundleAnalysis> = {
        total_size: { raw: 500 * 1024, gzip: 100 * 1024, formatted: '500 KB' },
      };
      const recommendations = generateRecommendations(analysis, []);
      expect(recommendations.every(r => !r.includes('1MB'))).toBe(true);
    });

    it('should not warn about small gzipped size under 250KB', () => {
      const analysis: Partial<BundleAnalysis> = {
        total_size: { raw: 800 * 1024, gzip: 200 * 1024, formatted: '800 KB' },
      };
      const recommendations = generateRecommendations(analysis, []);
      expect(recommendations.every(r => !r.includes('250KB'))).toBe(true);
    });

    it('should not warn about chunks when all are under 500KB', () => {
      const analysis: Partial<BundleAnalysis> = {
        chunks: [
          { name: 'main.js', size: 400 * 1024, gzip_size: 100 * 1024, modules: 3 },
          { name: 'vendor.js', size: 300 * 1024, gzip_size: 80 * 1024, modules: 5 },
        ],
      };
      const recommendations = generateRecommendations(analysis, []);
      expect(recommendations.every(r => !r.includes('500KB'))).toBe(true);
    });

    it('should not warn about duplicates when array is empty', () => {
      const analysis: Partial<BundleAnalysis> = {
        duplicates: [],
      };
      const recommendations = generateRecommendations(analysis, []);
      expect(recommendations.every(r => !r.includes('duplicate'))).toBe(true);
    });
  });
});
