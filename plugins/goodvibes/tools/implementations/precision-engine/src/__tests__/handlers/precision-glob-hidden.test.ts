/**
 * Tests for precision_glob include_hidden parameter.
 * Tests that hidden files and directories are properly included/excluded.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { handlePrecisionGlob } from '../../handlers/precision-glob.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glob-hidden-test-'));
  
  // Create test structure with hidden and visible files
  fs.writeFileSync(path.join(tmpDir, 'visible-file.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(tmpDir, '.hidden-file.ts'), 'export const b = 2;\n');
  
  fs.mkdirSync(path.join(tmpDir, '.hidden-dir'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.hidden-dir', 'inside-hidden.ts'), 'export const c = 3;\n');
  fs.writeFileSync(path.join(tmpDir, '.hidden-dir', 'match.ts'), 'const x = "FINDME_MARKER";\n');
  
  fs.mkdirSync(path.join(tmpDir, 'visible-dir'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'visible-dir', 'normal.ts'), 'export const d = 4;\n');
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

describe('precision_glob include_hidden parameter', () => {
  describe('default behavior (include_hidden not set)', () => {
    it('should include hidden files by default', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['**/*.ts'],
        base_path: tmpDir,
        output: { format: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.files as string[];
      
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
      const result = await handlePrecisionGlob({
        patterns: ['**/*.ts'],
        base_path: tmpDir,
        include_hidden: true,
        output: { format: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.files as string[];
      
      // Should include visible files
      expect(files.some((f: string) => f.includes('visible-file.ts'))).toBe(true);
      
      // Should include hidden file at root
      expect(files.some((f: string) => f.includes('.hidden-file.ts'))).toBe(true);
    });

    it('should include files inside hidden directories', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['**/*.ts'],
        base_path: tmpDir,
        include_hidden: true,
        output: { format: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.files as string[];
      
      // Should include files inside hidden directory
      expect(files.some((f: string) => f.includes('.hidden-dir/inside-hidden.ts'))).toBe(true);
      expect(files.some((f: string) => f.includes('.hidden-dir/match.ts'))).toBe(true);
    });
  });

  describe('include_hidden: false (explicit)', () => {
    it('should exclude hidden files when include_hidden is explicitly false', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['**/*.ts'],
        base_path: tmpDir,
        include_hidden: false,
        output: { format: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.files as string[];
      
      // Should include visible files
      expect(files.some((f: string) => f.includes('visible-file.ts'))).toBe(true);
      
      // Should NOT include hidden files
      expect(files.some((f: string) => f.includes('.hidden-file.ts'))).toBe(false);
      expect(files.some((f: string) => f.includes('.hidden-dir'))).toBe(false);
    });
  });

  describe('backend compatibility', () => {
    it('should work with fast-glob backend', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['**/*.ts'],
        base_path: tmpDir,
        include_hidden: true,
        backend: 'fast-glob',
        output: { format: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.files as string[];
      
      // Should include hidden files
      expect(files.some((f: string) => f.includes('.hidden-file.ts'))).toBe(true);
      expect(files.some((f: string) => f.includes('.hidden-dir/inside-hidden.ts'))).toBe(true);
    });

    it('should work with ripgrep backend (or fallback)', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['**/*.ts'],
        base_path: tmpDir,
        include_hidden: true,
        backend: 'ripgrep',
        output: { format: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.files as string[];
      
      // Should include hidden files (ripgrep may fall back to fast-glob for subdirs)
      expect(files.some((f: string) => f.includes('.hidden-file.ts'))).toBe(true);
      expect(files.some((f: string) => f.includes('.hidden-dir/inside-hidden.ts'))).toBe(true);
    });
  });

  describe('filters integration', () => {
    it('should work with has_content filter and include_hidden', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['**/*.ts'],
        base_path: tmpDir,
        include_hidden: true,
        filters: {
          has_content: 'FINDME_MARKER',
        },
        output: { format: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.files as string[];
      
      // Should find the file with marker inside hidden directory
      expect(files.some((f: string) => f.includes('.hidden-dir/match.ts'))).toBe(true);
      
      // Should not include other files
      expect(files.length).toBe(1);
    });

    it('should exclude hidden files with has_content filter when include_hidden is false', async () => {
      const result = await handlePrecisionGlob({
        patterns: ['**/*.ts'],
        base_path: tmpDir,
        include_hidden: false,
        filters: {
          has_content: 'FINDME_MARKER',
        },
        output: { format: 'paths_only' },
      });

      const parsed = expectSuccess(result);
      const files = parsed.data.files as string[];
      
      // Should NOT find the file inside hidden directory
      expect(files.some((f: string) => f.includes('.hidden-dir/match.ts'))).toBe(false);
      expect(files.length).toBe(0);
    });
  });
});
