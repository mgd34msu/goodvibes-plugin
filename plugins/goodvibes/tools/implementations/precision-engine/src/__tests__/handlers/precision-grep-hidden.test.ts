/**
 * Tests for precision_grep include_hidden parameter.
 * Tests that hidden files and directories are properly included/excluded.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { handlePrecisionGrep } from '../../handlers/precision-grep.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grep-hidden-test-'));
  
  // Create test structure with hidden and visible files
  fs.writeFileSync(path.join(tmpDir, 'visible-file.ts'), 'export const searchme = 1;\n');
  fs.writeFileSync(path.join(tmpDir, '.hidden-file.ts'), 'export const searchme = 2;\n');
  
  fs.mkdirSync(path.join(tmpDir, '.hidden-dir'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.hidden-dir', 'inside-hidden.ts'), 'export const searchme = 3;\n');
  fs.writeFileSync(path.join(tmpDir, '.hidden-dir', 'match.ts'), 'const x = "FINDME_MARKER";\n');
  
  fs.mkdirSync(path.join(tmpDir, 'visible-dir'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'visible-dir', 'normal.ts'), 'export const searchme = 4;\n');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function expectSuccess(result: any) {
  expect(result.isError).toBe(false);
  const parsed = JSON.parse(result.content[0].text);
  expect(parsed.success).toBe(true);
  return parsed;
}

function expectError(result: any) {
  expect(result.isError).toBe(false);
  const parsed = JSON.parse(result.content[0].text);
  expect(parsed.success).toBe(false);
  return parsed;
}

describe('precision_grep include_hidden parameter', () => {
  describe('default behavior (include_hidden not set)', () => {
    it('should include hidden files by default', async () => {
      const result = await handlePrecisionGrep({
        queries: [{
          id: 'q1',
          pattern: 'searchme',
          path: tmpDir,
        }],
        output: { format: 'files_only' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.queries['q1'].files.map((f: any) => f.file);
      
      // Should include visible files
      expect(files.some((f: string) => f.includes('visible-file.ts'))).toBe(true);
      expect(files.some((f: string) => f.includes('visible-dir/normal.ts'))).toBe(true);
      
      // Should include hidden files (default is now true)
      expect(files.some((f: string) => f.includes('.hidden-file.ts'))).toBe(true);
      expect(files.some((f: string) => f.includes('.hidden-dir'))).toBe(true);
    });
  });

  describe('include_hidden: true', () => {
    it('should include hidden files when include_hidden is true', async () => {
      const result = await handlePrecisionGrep({
        queries: [{
          id: 'q1',
          pattern: 'searchme',
          path: tmpDir,
          include_hidden: true,
        }],
        output: { format: 'files_only' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.queries['q1'].files.map((f: any) => f.file);
      
      // Should include visible files
      expect(files.some((f: string) => f.includes('visible-file.ts'))).toBe(true);
      
      // Should include hidden file at root
      expect(files.some((f: string) => f.includes('.hidden-file.ts'))).toBe(true);
    });

    it('should include files inside hidden directories', async () => {
      const result = await handlePrecisionGrep({
        queries: [{
          id: 'q1',
          pattern: 'searchme',
          path: tmpDir,
          include_hidden: true,
        }],
        output: { format: 'files_only' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.queries['q1'].files.map((f: any) => f.file);
      
      // Should include files inside hidden directory
      expect(files.some((f: string) => f.includes('.hidden-dir/inside-hidden.ts'))).toBe(true);
    });
  });

  describe('include_hidden: false (explicit)', () => {
    it('should exclude hidden files when include_hidden is explicitly false', async () => {
      const result = await handlePrecisionGrep({
        queries: [{
          id: 'q1',
          pattern: 'searchme',
          path: tmpDir,
          include_hidden: false,
        }],
        output: { format: 'files_only' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.queries['q1'].files.map((f: any) => f.file);
      
      // Should include visible files
      expect(files.some((f: string) => f.includes('visible-file.ts'))).toBe(true);
      expect(files.some((f: string) => f.includes('visible-dir/normal.ts'))).toBe(true);
      
      // Should NOT include hidden files
      expect(files.some((f: string) => f.includes('.hidden-file.ts'))).toBe(false);
      expect(files.some((f: string) => f.includes('.hidden-dir'))).toBe(false);
    });
  });

  describe('with glob filter', () => {
    it('should respect include_hidden with glob patterns', async () => {
      const result = await handlePrecisionGrep({
        queries: [{
          id: 'q1',
          pattern: 'searchme',
          path: tmpDir,
          glob: '**/*.ts',
          include_hidden: true,
        }],
        output: { format: 'files_only' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.queries['q1'].files.map((f: any) => f.file);
      
      // Should include hidden files with glob
      expect(files.some((f: string) => f.includes('.hidden-file.ts'))).toBe(true);
      expect(files.some((f: string) => f.includes('.hidden-dir/inside-hidden.ts'))).toBe(true);
    });

    it('should exclude hidden files with glob when include_hidden is false', async () => {
      const result = await handlePrecisionGrep({
        queries: [{
          id: 'q1',
          pattern: 'searchme',
          path: tmpDir,
          glob: '**/*.ts',
          include_hidden: false,
        }],
        output: { format: 'files_only' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.queries['q1'].files.map((f: any) => f.file);
      
      // Should include visible files
      expect(files.some((f: string) => f.includes('visible-file.ts'))).toBe(true);
      
      // Should NOT include hidden files
      expect(files.some((f: string) => f.includes('.hidden-file.ts'))).toBe(false);
      expect(files.some((f: string) => f.includes('.hidden-dir'))).toBe(false);
    });
  });

  describe('with matches output format', () => {
    it('should return matches from hidden files when include_hidden is true', async () => {
      const result = await handlePrecisionGrep({
        queries: [{
          id: 'q1',
          pattern: 'searchme',
          path: tmpDir,
          include_hidden: true,
        }],
        output: { format: 'matches' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.queries['q1'].files;
      const hiddenFiles = files.filter((f: any) => f.file.includes('.hidden'));
      
      // Should have matches from hidden files
      expect(hiddenFiles.length).toBeGreaterThan(0);
      
      // Should have actual match data
      hiddenFiles.forEach((f: any) => {
        expect(f.matches).toBeDefined();
        expect(f.matches.length).toBeGreaterThan(0);
        expect(f.matches[0].content).toContain('searchme');
      });
    });

    it('should not return matches from hidden files when include_hidden is false', async () => {
      const result = await handlePrecisionGrep({
        queries: [{
          id: 'q1',
          pattern: 'searchme',
          path: tmpDir,
          include_hidden: false,
        }],
        output: { format: 'matches' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.queries['q1'].files;
      const hiddenFiles = files.filter((f: any) => f.file.includes('.hidden'));
      
      // Should have NO matches from hidden files
      expect(hiddenFiles.length).toBe(0);
    });
  });

  describe('multiple queries with different include_hidden settings', () => {
    it('should respect per-query include_hidden settings', async () => {
      const result = await handlePrecisionGrep({
        queries: [
          {
            id: 'with_hidden',
            pattern: 'searchme',
            path: tmpDir,
            include_hidden: true,
          },
          {
            id: 'without_hidden',
            pattern: 'searchme',
            path: tmpDir,
            include_hidden: false,
          },
        ],
        output: { format: 'files_only' },
      });

      const parsed = expectSuccess(result);
      
      // First query should include hidden files
      const withHiddenFiles = parsed.data.queries['with_hidden'].files.map((f: any) => f.file);
      expect(withHiddenFiles.some((f: string) => f.includes('.hidden-file.ts'))).toBe(true);
      
      // Second query should exclude hidden files
      const withoutHiddenFiles = parsed.data.queries['without_hidden'].files.map((f: any) => f.file);
      expect(withoutHiddenFiles.some((f: string) => f.includes('.hidden-file.ts'))).toBe(false);
      expect(withoutHiddenFiles.some((f: string) => f.includes('visible-file.ts'))).toBe(true);
    });
  });

  describe('special marker search', () => {
    it('should find marker in hidden directory when include_hidden is true', async () => {
      const result = await handlePrecisionGrep({
        queries: [{
          id: 'q1',
          pattern: 'FINDME_MARKER',
          path: tmpDir,
          include_hidden: true,
        }],
        output: { format: 'files_only' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.queries['q1'].files.map((f: any) => f.file);
      
      // Should find the file with marker inside hidden directory
      expect(files.some((f: string) => f.includes('.hidden-dir/match.ts'))).toBe(true);
      expect(files.length).toBe(1);
    });

    it('should not find marker in hidden directory when include_hidden is false', async () => {
      const result = await handlePrecisionGrep({
        queries: [{
          id: 'q1',
          pattern: 'FINDME_MARKER',
          path: tmpDir,
          include_hidden: false,
        }],
        output: { format: 'files_only' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.queries['q1'].files;
      
      // Should NOT find the file inside hidden directory
      expect(files.length).toBe(0);
    });
  });
});
