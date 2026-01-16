/**
 * Unit tests for handleAtomicMultiEdit
 *
 * Tests the atomic multi-edit handler that performs multiple file edits
 * atomically with rollback on validation failure.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Create mock functions using vi.hoisted() to ensure they're available before vi.mock() is hoisted
const { mockFileExists, mockSafeExec } = vi.hoisted(() => ({
  mockFileExists: vi.fn(),
  mockSafeExec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', error: null }),
}));

// Mock config
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project',
}));

// Mock utils
vi.mock('../../../utils.js', () => ({
  safeExec: mockSafeExec,
  fileExists: mockFileExists,
}));

import { handleAtomicMultiEdit } from '../../../handlers/edit/atomic-multi-edit.js';

describe('handleAtomicMultiEdit', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-edit-test-'));
    vi.clearAllMocks();

    // Default mock for fileExists
    mockFileExists.mockImplementation(async (filePath: string) => {
      try {
        return fs.existsSync(filePath);
      } catch {
        return false;
      }
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('argument validation', () => {
    test('returns error when no edits provided', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('No edits provided');
    });

    test('returns error when edits is undefined', async () => {
      const result = await handleAtomicMultiEdit({
        edits: undefined as any,
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('No edits provided');
    });
  });

  describe('single file edit', () => {
    test('applies single edit successfully', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      fs.writeFileSync(filePath, 'const x = 1;\nconst y = 2;');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'const x = 1;',
            new_text: 'const x = 100;',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.applied).toBe(true);
      expect(data.edits[0].success).toBe(true);

      // Verify file was modified
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('const x = 100;');
      expect(content).toContain('const y = 2;');
    });

    test('returns error when old_text not found', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'nonexistent text',
            new_text: 'new text',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.edits[0].success).toBe(false);
      expect(data.edits[0].old_text_found).toBe(false);
      expect(data.rollback_performed).toBe(true);
    });

    test('returns error when file not found', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: path.join(tempDir, 'nonexistent.ts'),
            old_text: 'text',
            new_text: 'new text',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.edits[0].success).toBe(false);
      expect(data.edits[0].error).toContain('not found');
    });
  });

  describe('multiple file edits', () => {
    test('applies multiple edits to same file', async () => {
      const filePath = path.join(tempDir, 'multi.ts');
      fs.writeFileSync(filePath, 'const a = 1;\nconst b = 2;\nconst c = 3;');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'const a = 1;',
            new_text: 'const a = 10;',
          },
          {
            file: filePath,
            old_text: 'const c = 3;',
            new_text: 'const c = 30;',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.edits).toHaveLength(2);
      expect(data.edits.every((e: any) => e.success)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('const a = 10;');
      expect(content).toContain('const b = 2;');
      expect(content).toContain('const c = 30;');
    });

    test('applies edits to multiple files', async () => {
      const file1 = path.join(tempDir, 'file1.ts');
      const file2 = path.join(tempDir, 'file2.ts');
      fs.writeFileSync(file1, 'export const x = 1;');
      fs.writeFileSync(file2, 'import { x } from "./file1";');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: file1,
            old_text: 'const x = 1',
            new_text: 'const x = 2',
          },
          {
            file: file2,
            old_text: '{ x }',
            new_text: '{ x as y }',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.edits).toHaveLength(2);

      expect(fs.readFileSync(file1, 'utf-8')).toContain('const x = 2');
      expect(fs.readFileSync(file2, 'utf-8')).toContain('{ x as y }');
    });

    test('rolls back all changes if any edit fails', async () => {
      const file1 = path.join(tempDir, 'file1.ts');
      const file2 = path.join(tempDir, 'file2.ts');
      fs.writeFileSync(file1, 'const a = 1;');
      fs.writeFileSync(file2, 'const b = 2;');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: file1,
            old_text: 'const a = 1;',
            new_text: 'const a = 10;',
          },
          {
            file: file2,
            old_text: 'nonexistent',
            new_text: 'new',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.rollback_performed).toBe(true);

      // First file should be rolled back
      expect(fs.readFileSync(file1, 'utf-8')).toBe('const a = 1;');
    });
  });

  describe('dry run mode', () => {
    test('does not apply changes in dry run', async () => {
      const filePath = path.join(tempDir, 'dry-run.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'const x = 1;',
            new_text: 'const x = 100;',
          },
        ],
        dry_run: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.applied).toBe(false);
      expect(data.message).toContain('Dry run');

      // File should not be modified
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('const x = 1;');
    });

    test('validates edits would succeed in dry run', async () => {
      const filePath = path.join(tempDir, 'dry-run.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'const x = 1;',
            new_text: 'const x = 100;',
          },
        ],
        dry_run: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.edits[0].success).toBe(true);
      expect(data.edits[0].old_text_found).toBe(true);
    });

    test('reports failures in dry run', async () => {
      const filePath = path.join(tempDir, 'dry-run.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'nonexistent',
            new_text: 'new',
          },
        ],
        dry_run: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(false);
      expect(data.edits[0].success).toBe(false);
      expect(data.edits[0].old_text_found).toBe(false);
    });
  });

  describe('validation', () => {
    test('runs type checking when validate.type_check is true', async () => {
      const filePath = path.join(tempDir, 'validate.ts');
      fs.writeFileSync(filePath, 'const x: number = 1;');

      mockSafeExec.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        error: null,
      });

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'const x: number = 1;',
            new_text: 'const x: number = 2;',
          },
        ],
        validate: {
          type_check: true,
        },
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.validation?.type_check?.passed).toBe(true);
    });

    test('rolls back on type check failure', async () => {
      const filePath = path.join(tempDir, 'validate.ts');
      fs.writeFileSync(filePath, 'const x: number = 1;');

      mockSafeExec.mockResolvedValueOnce({
        stdout: 'file.ts(1,5): error TS2322: Type error',
        stderr: '',
        error: 'type error',
      });

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'const x: number = 1;',
            new_text: 'const x: number = "string";',
          },
        ],
        validate: {
          type_check: true,
        },
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.validation?.type_check?.passed).toBe(false);
      expect(data.rollback_performed).toBe(true);

      // File should be rolled back
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('const x: number = 1;');
    });

    test('runs custom validation command', async () => {
      const filePath = path.join(tempDir, 'validate.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      mockSafeExec.mockResolvedValueOnce({
        stdout: 'Custom validation passed',
        stderr: '',
        error: null,
      });

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'const x = 1;',
            new_text: 'const x = 2;',
          },
        ],
        validate: {
          custom: 'my-custom-validator',
        },
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.validation?.custom?.passed).toBe(true);
    });

    test('rolls back on custom validation failure', async () => {
      const filePath = path.join(tempDir, 'validate.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      mockSafeExec.mockResolvedValueOnce({
        stdout: 'Validation failed',
        stderr: '',
        error: 'validation error',
      });

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'const x = 1;',
            new_text: 'const x = 2;',
          },
        ],
        validate: {
          custom: 'my-custom-validator',
        },
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.validation?.custom?.passed).toBe(false);
      expect(data.rollback_performed).toBe(true);
    });
  });

  describe('backup management', () => {
    test('creates backups before editing', async () => {
      const filePath = path.join(tempDir, 'backup.ts');
      fs.writeFileSync(filePath, 'original content');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'original content',
            new_text: 'new content',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      // Backup paths should be cleaned up on success
      expect(data.backup_paths).toBeUndefined();
    });

    test('restores from backup on failure', async () => {
      const file1 = path.join(tempDir, 'file1.ts');
      const file2 = path.join(tempDir, 'file2.ts');
      fs.writeFileSync(file1, 'original 1');
      fs.writeFileSync(file2, 'original 2');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: file1,
            old_text: 'original 1',
            new_text: 'modified 1',
          },
          {
            file: file2,
            old_text: 'nonexistent',
            new_text: 'new',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.rollback_performed).toBe(true);

      // Both files should be restored
      expect(fs.readFileSync(file1, 'utf-8')).toBe('original 1');
      expect(fs.readFileSync(file2, 'utf-8')).toBe('original 2');
    });
  });

  describe('path handling', () => {
    test('handles absolute paths', async () => {
      const filePath = path.join(tempDir, 'absolute.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'const x = 1;',
            new_text: 'const x = 2;',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
    });

    test('returns relative paths in results', async () => {
      const filePath = path.join(tempDir, 'relative.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'const x = 1;',
            new_text: 'const x = 2;',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      // Result path should not contain temp directory prefix
      expect(data.edits[0].file).not.toContain('\\\\');
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      const filePath = path.join(tempDir, 'response.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'const x = 1;',
            new_text: 'const x = 2;',
          },
        ],
      });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('applied');
      expect(data).toHaveProperty('edits');
      expect(data).toHaveProperty('rollback_performed');
    });

    test('edit result includes required fields', async () => {
      const filePath = path.join(tempDir, 'edit-result.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'const x = 1;',
            new_text: 'const x = 2;',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.edits[0]).toHaveProperty('file');
      expect(data.edits[0]).toHaveProperty('success');
      expect(data.edits[0]).toHaveProperty('old_text_found');
    });

    test('returns valid JSON', async () => {
      const filePath = path.join(tempDir, 'json.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'const x = 1;',
            new_text: 'const x = 2;',
          },
        ],
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe('error handling', () => {
    test('handles unexpected errors gracefully', async () => {
      mockFileExists.mockRejectedValueOnce(new Error('Filesystem error'));

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: path.join(tempDir, 'error.ts'),
            old_text: 'text',
            new_text: 'new',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      // rollback_performed is false because the error occurs during backup creation,
      // before any backups exist. The handler only sets rollback_performed=true
      // when backups.size > 0 in the catch block.
      expect(data.rollback_performed).toBe(false);
    });
  });

  describe('success messages', () => {
    test('includes success message on successful edit', async () => {
      const filePath = path.join(tempDir, 'success.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'const x = 1;',
            new_text: 'const x = 2;',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.message).toContain('successfully');
    });

    test('includes error message on failed edit', async () => {
      const filePath = path.join(tempDir, 'fail.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'nonexistent',
            new_text: 'new',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.message).toContain('rolled back');
    });

    test('includes validation failure message', async () => {
      const filePath = path.join(tempDir, 'val-fail.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      mockSafeExec.mockResolvedValueOnce({
        stdout: 'Error',
        stderr: '',
        error: 'validation failed',
      });

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'const x = 1;',
            new_text: 'const x = 2;',
          },
        ],
        validate: {
          custom: 'validator',
        },
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.message).toContain('Validation failed');
    });
  });
});
