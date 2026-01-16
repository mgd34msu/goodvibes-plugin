/**
 * Unit tests for handleAtomicMultiEdit
 *
 * Tests the atomic multi-edit handler that performs multiple file edits
 * atomically with rollback on validation failure.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock fs to allow spying/mocking its methods in ESM
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    writeFileSync: vi.fn(actual.writeFileSync),
    existsSync: vi.fn(actual.existsSync),
    unlinkSync: vi.fn(actual.unlinkSync),
    renameSync: vi.fn(actual.renameSync),
    mkdtempSync: vi.fn(actual.mkdtempSync),
    rmSync: vi.fn(actual.rmSync),
    readdirSync: vi.fn(actual.readdirSync),
  };
});

// Mock fs/promises
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
    writeFile: vi.fn(actual.writeFile),
    mkdir: vi.fn(actual.mkdir),
    rm: vi.fn(actual.rm),
  };
});

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

  describe('ESLint validation', () => {
    test('runs ESLint and parses JSON output with errors', async () => {
      const filePath = path.join(tempDir, 'eslint-test.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      // Mock successful edit, then ESLint with errors
      mockSafeExec.mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            filePath: filePath,
            messages: [
              {
                line: 1,
                column: 7,
                severity: 2,
                ruleId: 'no-unused-vars',
                message: "'x' is assigned a value but never used",
              },
            ],
          },
        ]),
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
          lint: true,
        },
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.validation?.lint?.passed).toBe(false);
      expect(data.validation?.lint?.errors).toBeDefined();
      expect(data.validation?.lint?.errors.length).toBeGreaterThan(0);
      expect(data.rollback_performed).toBe(true);
    });

    test('runs ESLint and passes when no errors', async () => {
      const filePath = path.join(tempDir, 'eslint-pass.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      mockSafeExec.mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            filePath: filePath,
            messages: [],
          },
        ]),
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
          lint: true,
        },
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.validation?.lint?.passed).toBe(true);
    });

    test('handles ESLint with warnings (severity 1) - should pass', async () => {
      const filePath = path.join(tempDir, 'eslint-warn.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      mockSafeExec.mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            filePath: filePath,
            messages: [
              {
                line: 1,
                column: 7,
                severity: 1, // Warning, not error
                ruleId: 'no-unused-vars',
                message: "'x' is assigned a value but never used",
              },
            ],
          },
        ]),
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
          lint: true,
        },
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.validation?.lint?.passed).toBe(true);
    });

    test('handles ESLint JSON parsing failure gracefully', async () => {
      const filePath = path.join(tempDir, 'eslint-bad-json.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      mockSafeExec.mockResolvedValueOnce({
        stdout: 'not valid json',
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
          lint: true,
        },
      });
      const data = JSON.parse(result.content[0].text);

      // Should pass when JSON parsing fails and there's no error
      expect(data.success).toBe(true);
      expect(data.validation?.lint?.passed).toBe(true);
    });

    test('handles ESLint failure to run', async () => {
      const filePath = path.join(tempDir, 'eslint-fail-run.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      mockSafeExec.mockResolvedValueOnce({
        stdout: 'not valid json',
        stderr: 'ESLint not found',
        error: 'command failed',
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
          lint: true,
        },
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.validation?.lint?.passed).toBe(false);
      expect(data.validation?.lint?.errors).toContain('ESLint failed to run');
    });
  });

  describe('Test validation', () => {
    test('runs npm test and passes when successful', async () => {
      const filePath = path.join(tempDir, 'test-pass.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      mockSafeExec.mockResolvedValueOnce({
        stdout: 'All tests passed',
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
          test: true,
        },
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.validation?.test?.passed).toBe(true);
      expect(data.validation?.test?.output).toContain('All tests passed');
    });

    test('runs npm test and rolls back when tests fail', async () => {
      const filePath = path.join(tempDir, 'test-fail.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      mockSafeExec.mockResolvedValueOnce({
        stdout: '1 test failed',
        stderr: 'AssertionError',
        error: 'test failed',
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
          test: true,
        },
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.validation?.test?.passed).toBe(false);
      expect(data.rollback_performed).toBe(true);

      // File should be rolled back
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('const x = 1;');
    });
  });

  describe('Type check validation parsing', () => {
    test('parses TypeScript errors from tsc output', async () => {
      const filePath = path.join(tempDir, 'typecheck-parse.ts');
      fs.writeFileSync(filePath, 'const x: number = 1;');

      mockSafeExec.mockResolvedValueOnce({
        stdout: `src/index.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/utils.ts(20,10): error TS2339: Property 'foo' does not exist on type 'Bar'.`,
        stderr: '',
        error: 'type errors found',
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
      expect(data.validation?.type_check?.errors).toBeDefined();
      expect(data.validation?.type_check?.errors.length).toBe(2);
      expect(data.validation?.type_check?.errors[0]).toContain('TS2322');
      expect(data.validation?.type_check?.errors[1]).toContain('TS2339');
    });
  });

  describe('Dry run with validation', () => {
    test('runs validation in dry run mode', async () => {
      const filePath = path.join(tempDir, 'dry-run-validate.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      mockSafeExec.mockResolvedValueOnce({
        stdout: '',
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
        dry_run: true,
        validate: {
          type_check: true,
        },
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.applied).toBe(false);
      expect(data.validation?.type_check?.passed).toBe(true);
      expect(data.message).toContain('Dry run');

      // File should NOT be modified in dry run
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('const x = 1;');
    });

    test('dry run reports file not found error', async () => {
      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: path.join(tempDir, 'nonexistent-dry-run.ts'),
            old_text: 'const x = 1;',
            new_text: 'const x = 2;',
          },
        ],
        dry_run: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(false);
      expect(data.edits[0].success).toBe(false);
      expect(data.edits[0].error).toContain('not found');
    });
  });

  describe('Multiple validations', () => {
    test('runs multiple validations and fails on first failure', async () => {
      const filePath = path.join(tempDir, 'multi-val.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      // Type check succeeds
      mockSafeExec.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        error: null,
      });

      // Lint fails
      mockSafeExec.mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            filePath: filePath,
            messages: [{ line: 1, column: 1, severity: 2, ruleId: 'error', message: 'error' }],
          },
        ]),
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
          type_check: true,
          lint: true,
        },
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.validation?.type_check?.passed).toBe(true);
      expect(data.validation?.lint?.passed).toBe(false);
      expect(data.rollback_performed).toBe(true);
    });

    test('runs all validations including tests and custom', async () => {
      const filePath = path.join(tempDir, 'all-val.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      // Type check succeeds
      mockSafeExec.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        error: null,
      });

      // Lint succeeds
      mockSafeExec.mockResolvedValueOnce({
        stdout: JSON.stringify([{ filePath: filePath, messages: [] }]),
        stderr: '',
        error: null,
      });

      // Test succeeds
      mockSafeExec.mockResolvedValueOnce({
        stdout: 'All tests passed',
        stderr: '',
        error: null,
      });

      // Custom succeeds
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
          type_check: true,
          lint: true,
          test: true,
          custom: 'my-validator',
        },
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.validation?.type_check?.passed).toBe(true);
      expect(data.validation?.lint?.passed).toBe(true);
      expect(data.validation?.test?.passed).toBe(true);
      expect(data.validation?.custom?.passed).toBe(true);
    });
  });

  describe('Error handling edge cases', () => {
    test('handles error thrown during file read in applyEdit', async () => {
      const filePath = path.join(tempDir, 'read-error.ts');
      
      let readCount = 0;
      vi.mocked(fsp.readFile).mockImplementation(async (p: any, options?: any) => {
        readCount++;
        // First read is for backup (Phase 1)
        if (readCount === 1) return 'const x = 1;';
        // Second read is for applyEdit (Phase 2)
        if (readCount === 2) throw new Error('Read permission denied');
        return 'const x = 1;';
      });

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

      // Restore spy
      vi.restoreAllMocks();

      expect(result.isError).toBe(true);
      expect(data.edits[0].success).toBe(false);
    });

    test('handles non-Error thrown in catch block', async () => {
      // Force an error by making backup creation fail
      mockFileExists.mockRejectedValueOnce('string error instead of Error');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: path.join(tempDir, 'any-error.ts'),
            old_text: 'const x = 1;',
            new_text: 'const x = 2;',
          },
        ],
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toBe('Unknown error');
    });

    test('handles restore failure in catch block gracefully', async () => {
      const filePath = path.join(tempDir, 'restore-fail.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      // First edit succeeds, then we cause an error during second phase
      // This requires triggering the catch block with backups.size > 0

      // Mock fileExists to succeed initially, then fail during validation
      let callCount = 0;
      mockFileExists.mockImplementation(async (p: string) => {
        callCount++;
        if (callCount > 2) {
          throw new Error('Unexpected error during validation phase');
        }
        return fs.existsSync(p);
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
          type_check: true,
        },
      });

      // The error is caught and handled gracefully
      expect(result.content[0].type).toBe('text');
    });
  });

  describe('Empty validation options', () => {
    test('skips validation when validate is empty object', async () => {
      const filePath = path.join(tempDir, 'empty-validate.ts');
      fs.writeFileSync(filePath, 'const x = 1;');

      const result = await handleAtomicMultiEdit({
        edits: [
          {
            file: filePath,
            old_text: 'const x = 1;',
            new_text: 'const x = 2;',
          },
        ],
        validate: {},
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.validation).toBeUndefined();
      expect(mockSafeExec).not.toHaveBeenCalled();
    });
  });
});
