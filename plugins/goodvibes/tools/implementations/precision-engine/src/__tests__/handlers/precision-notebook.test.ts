/**
 * Tests for precision_notebook handler with cell_id targeting.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { handlePrecisionNotebook } from '../../handlers/precision-notebook.js';
import { createTestFile, readTestFile, expectSuccess, expectError } from '../test-utils.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Helper to create a test notebook with specified cells.
 */
function createTestNotebook(cells: Array<{ type: string; source: string; id?: string }>): any {
  const generateTestId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  };

  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {},
    cells: cells.map(c => {
      const cell: any = {
        cell_type: c.type,
        source: [c.source],
        metadata: {},
        id: c.id || generateTestId()
      };
      if (c.type === 'code') {
        cell.execution_count = null;
        cell.outputs = [];
      }
      return cell;
    })
  };
}

/**
 * Helper to parse notebook from test file.
 */
async function readTestNotebook(filename: string): Promise<any> {
  const content = await readTestFile(filename);
  return JSON.parse(content);
}

describe('precision_notebook handler - cell_id targeting', () => {
  const TEST_NOTEBOOK = 'test.ipynb';

  afterEach(async () => {
    try {
      const testDir = path.join(process.cwd(), '.test-files');
      const testFilePath = path.join(testDir, TEST_NOTEBOOK);
      await fs.unlink(testFilePath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('replace with cell_id', () => {
    it('should replace a cell by cell_id', async () => {
      const notebook = createTestNotebook([
        { type: 'code', source: 'print(1)', id: 'abc12345' },
        { type: 'code', source: 'print(2)', id: 'def67890' },
        { type: 'code', source: 'print(3)', id: 'ghi11111' }
      ]);
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'replace', cell_id: 'def67890', source: 'print("replaced")', cell_type: 'code' }
        ]
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.operations_applied).toBe(1);
      expect(parsed.data.summary[0].cell_id).toBe('def67890');

      const updated = await readTestNotebook(TEST_NOTEBOOK);
      expect(updated.cells[1].source[0]).toBe('print("replaced")');
      expect(updated.cells[0].source[0]).toBe('print(1)');
      expect(updated.cells[2].source[0]).toBe('print(3)');
    });

    it('should return error if cell_id not found', async () => {
      const notebook = createTestNotebook([
        { type: 'code', source: 'print(1)', id: 'abc12345' }
      ]);
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'replace', cell_id: 'nonexistent', source: 'print(2)' }
        ]
      });

      const parsed = expectError(result);
      expect(parsed.error).toContain('cell_id "nonexistent" not found');
    });

    it('should use cell_id when both cell and cell_id are provided', async () => {
      const notebook = createTestNotebook([
        { type: 'code', source: 'print(1)', id: 'abc12345' },
        { type: 'code', source: 'print(2)', id: 'def67890' }
      ]);
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      // Provide both cell (index 0) and cell_id (for index 1) - cell_id wins
      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'replace', cell: 0, cell_id: 'def67890', source: 'print("cell_id wins")' }
        ]
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.operations_applied).toBe(1);

      const updated = await readTestNotebook(TEST_NOTEBOOK);
      expect(updated.cells[1].source[0]).toBe('print("cell_id wins")');
      expect(updated.cells[0].source[0]).toBe('print(1)'); // Unchanged
    });
  });

  describe('delete with cell_id', () => {
    it('should delete a cell by cell_id', async () => {
      const notebook = createTestNotebook([
        { type: 'code', source: 'print(1)', id: 'abc12345' },
        { type: 'code', source: 'print(2)', id: 'def67890' },
        { type: 'code', source: 'print(3)', id: 'ghi11111' }
      ]);
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'delete', cell_id: 'def67890' }
        ]
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.operations_applied).toBe(1);
      expect(parsed.data.cells_after).toBe(2);

      const updated = await readTestNotebook(TEST_NOTEBOOK);
      expect(updated.cells.length).toBe(2);
      expect(updated.cells[0].source[0]).toBe('print(1)');
      expect(updated.cells[1].source[0]).toBe('print(3)');
    });

    it('should return error if cell_id not found for delete', async () => {
      const notebook = createTestNotebook([
        { type: 'code', source: 'print(1)', id: 'abc12345' }
      ]);
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'delete', cell_id: 'nonexistent' }
        ]
      });

      const parsed = expectError(result);
      expect(parsed.error).toContain('cell_id "nonexistent" not found');
    });
  });

  describe('insert with cell_id', () => {
    it('should insert after a cell by cell_id', async () => {
      const notebook = createTestNotebook([
        { type: 'code', source: 'print(1)', id: 'abc12345' },
        { type: 'code', source: 'print(2)', id: 'def67890' }
      ]);
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'insert', cell_id: 'abc12345', source: 'print("inserted")', cell_type: 'code' }
        ]
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.operations_applied).toBe(1);
      expect(parsed.data.cells_after).toBe(3);

      const updated = await readTestNotebook(TEST_NOTEBOOK);
      expect(updated.cells.length).toBe(3);
      expect(updated.cells[0].source[0]).toBe('print(1)');
      expect(updated.cells[1].source[0]).toBe('print("inserted")');
      expect(updated.cells[2].source[0]).toBe('print(2)');
    });

    it('should return error if cell_id not found for insert', async () => {
      const notebook = createTestNotebook([
        { type: 'code', source: 'print(1)', id: 'abc12345' }
      ]);
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'insert', cell_id: 'nonexistent', source: 'print(2)', cell_type: 'code' }
        ]
      });

      const parsed = expectError(result);
      expect(parsed.error).toContain('cell_id "nonexistent" not found');
    });

    it('should generate cell IDs for inserted cells in nbformat 4.5+', async () => {
      const notebook = createTestNotebook([
        { type: 'code', source: 'print(1)', id: 'abc12345' }
      ]);
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'insert', after: 0, source: 'print("new")', cell_type: 'code' }
        ]
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.operations_applied).toBe(1);

      const updated = await readTestNotebook(TEST_NOTEBOOK);
      expect(updated.cells[1].id).toBeDefined();
      expect(updated.cells[1].id).toHaveLength(8);
      expect(updated.cells[1].id).toMatch(/^[a-z0-9]{8}$/);
    });
  });

  describe('metadata.id fallback', () => {
    it('should find cell_id in metadata.id when cell.id is not set', async () => {
      const notebook = {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {},
        cells: [
          {
            cell_type: 'code',
            source: ['print(1)'],
            metadata: { id: 'meta_abc' },
            execution_count: null,
            outputs: []
          },
          {
            cell_type: 'code',
            source: ['print(2)'],
            metadata: { id: 'meta_def' },
            execution_count: null,
            outputs: []
          }
        ]
      };
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'replace', cell_id: 'meta_def', source: 'print("found via metadata")' }
        ]
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.operations_applied).toBe(1);

      const updated = await readTestNotebook(TEST_NOTEBOOK);
      expect(updated.cells[1].source[0]).toBe('print("found via metadata")');
    });
  });

  describe('backward compatibility', () => {
    it('should still work with index-based operations', async () => {
      const notebook = createTestNotebook([
        { type: 'code', source: 'print(1)' },
        { type: 'code', source: 'print(2)' },
        { type: 'code', source: 'print(3)' }
      ]);
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'replace', cell: 0, source: 'print("replaced")' },
          { op: 'insert', after: -1, source: 'print("inserted")', cell_type: 'markdown' },
          { op: 'delete', cell: 2 }
        ]
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.operations_applied).toBe(3);
      expect(parsed.data.cells_after).toBe(3);

      const updated = await readTestNotebook(TEST_NOTEBOOK);
      // After operations: [inserted (markdown), replaced, print(2)]
      expect(updated.cells[0].source[0]).toBe('print("inserted")');
      expect(updated.cells[0].cell_type).toBe('markdown');
      expect(updated.cells[1].source[0]).toBe('print("replaced")');
      expect(updated.cells[2].source[0]).toBe('print(2)');
    });
  });

  describe('mixed operations', () => {
    it('should handle mixed cell_id and index-based operations', async () => {
      const notebook = createTestNotebook([
        { type: 'code', source: 'print(1)', id: 'abc12345' },
        { type: 'code', source: 'print(2)', id: 'def67890' },
        { type: 'code', source: 'print(3)', id: 'ghi11111' }
      ]);
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'replace', cell_id: 'abc12345', source: 'print("via id")' },
          { op: 'insert', after: 2, source: 'print("via index")', cell_type: 'code' },
          { op: 'delete', cell_id: 'def67890' }
        ]
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.operations_applied).toBe(3);
      expect(parsed.data.cells_after).toBe(3);

      const updated = await readTestNotebook(TEST_NOTEBOOK);
      expect(updated.cells[0].source[0]).toBe('print("via id")');
      expect(updated.cells[1].source[0]).toBe('print(3)');
      expect(updated.cells[2].source[0]).toBe('print("via index")');
    });
  });

  describe('cell_id bypasses indexOffset', () => {
    it('should not apply indexOffset to cell_id operations', async () => {
      const notebook = createTestNotebook([
        { type: 'code', source: 'print(1)', id: 'abc12345' },
        { type: 'code', source: 'print(2)', id: 'def67890' },
        { type: 'code', source: 'print(3)', id: 'ghi11111' }
      ]);
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      // Insert at beginning (affects indexOffset), then replace by cell_id (should ignore offset)
      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'insert', after: -1, source: 'print(0)', cell_type: 'code' },
          { op: 'replace', cell_id: 'ghi11111', source: 'print("still finds it")' }
        ]
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.operations_applied).toBe(2);

      const updated = await readTestNotebook(TEST_NOTEBOOK);
      // After insert at beginning, cells are: [new, 1, 2, 3]
      // Replace by cell_id should still find 'ghi11111' at correct position
      expect(updated.cells[3].source[0]).toBe('print("still finds it")');
    });
  });

  describe('validation', () => {
    it('should require cell or cell_id for replace', async () => {
      const notebook = createTestNotebook([{ type: 'code', source: 'print(1)' }]);
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'replace', source: 'print(2)' }
        ]
      });

      const parsed = expectError(result);
      expect(parsed.error).toContain('requires "cell" index or "cell_id"');
    });

    it('should require cell or cell_id for delete', async () => {
      const notebook = createTestNotebook([{ type: 'code', source: 'print(1)' }]);
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'delete' }
        ]
      });

      const parsed = expectError(result);
      expect(parsed.error).toContain('requires "cell" index or "cell_id"');
    });

    it('should return error for cell_id operation on empty notebook', async () => {
      const notebook = {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {},
        cells: []
      };
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'replace', cell_id: 'abc123', source: 'print(1)' }
        ]
      });

      const parsed = expectError(result);
      expect(parsed.error).toContain('cell_id "abc123" not found');
    });
  });

  describe('duplicate cell_ids', () => {
    it('should replace first cell when duplicate cell_ids exist', async () => {
      const notebook = {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {},
        cells: [
          {
            cell_type: 'code',
            source: ['print(1)'],
            metadata: {},
            id: 'duplicate_id',
            execution_count: null,
            outputs: []
          },
          {
            cell_type: 'code',
            source: ['print(2)'],
            metadata: {},
            id: 'duplicate_id',
            execution_count: null,
            outputs: []
          }
        ]
      };
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'replace', cell_id: 'duplicate_id', source: 'print("replaced")' }
        ]
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.operations_applied).toBe(1);

      const updated = await readTestNotebook(TEST_NOTEBOOK);
      expect(updated.cells[0].source[0]).toBe('print("replaced")');
      expect(updated.cells[1].source[0]).toBe('print(2)');
    });
  });

  describe('nbformat version handling', () => {
    it('should NOT generate cell IDs for nbformat < 4.5', async () => {
      const notebook = {
        nbformat: 4,
        nbformat_minor: 4,
        metadata: {},
        cells: [
          {
            cell_type: 'code',
            source: ['print(1)'],
            metadata: {},
            execution_count: null,
            outputs: []
          }
        ]
      };
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'insert', after: 0, source: 'print("new")', cell_type: 'code' }
        ]
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.operations_applied).toBe(1);

      const updated = await readTestNotebook(TEST_NOTEBOOK);
      expect(updated.cells[1].id).toBeUndefined();
    });

    it('should generate cell IDs for nbformat 5.0+', async () => {
      const notebook = {
        nbformat: 5,
        nbformat_minor: 0,
        metadata: {},
        cells: [
          {
            cell_type: 'code',
            source: ['print(1)'],
            metadata: {},
            id: 'existing123',
            execution_count: null,
            outputs: []
          }
        ]
      };
      await createTestFile(TEST_NOTEBOOK, JSON.stringify(notebook, null, 1));

      const result = await handlePrecisionNotebook({
        path: TEST_NOTEBOOK,
        operations: [
          { op: 'insert', after: 0, source: 'print("new")', cell_type: 'code' }
        ]
      });

      const parsed = expectSuccess(result);
      expect(parsed.data.operations_applied).toBe(1);

      const updated = await readTestNotebook(TEST_NOTEBOOK);
      expect(updated.cells[1].id).toBeDefined();
      expect(updated.cells[1].id).toHaveLength(8);
      expect(updated.cells[1].id).toMatch(/^[a-z0-9]{8}$/);
    });
  });
});
