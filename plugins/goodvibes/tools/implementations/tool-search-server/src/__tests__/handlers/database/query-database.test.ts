/**
 * Unit tests for SQLite database query handler
 *
 * Tests cover:
 * - Database URL parsing (SQLite variants, in-memory, file paths)
 * - Query execution (SELECT, INSERT, UPDATE, DELETE)
 * - Parameterized queries
 * - Readonly mode enforcement
 * - Error handling and enhanced error messages
 * - Result formatting (JSON and table)
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { handleQueryDatabase, type QueryDatabaseArgs } from '../../../handlers/database/query-database.js';
import { shutdownConnectionPool } from '../../../handlers/database/sqlite-connection.js';

// Mock the sqlite-connection module
vi.mock('../../../handlers/database/sqlite-connection.js', () => {
  const mockDatabase = {
    prepare: vi.fn(),
    exec: vi.fn(),
    pragma: vi.fn(),
    close: vi.fn(),
    open: true,
    inTransaction: false,
    name: 'test.db',
    memory: false,
    readonly: false,
  };

  return {
    withConnection: vi.fn(),
    getConnectionPool: vi.fn(),
    shutdownConnectionPool: vi.fn(),
  };
});

// Import after mocking
import { withConnection } from '../../../handlers/database/sqlite-connection.js';

describe('query_database handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Database URL parsing', () => {
    it('should parse sqlite:// URL format', async () => {
      const mockRows = [{ id: 1, name: 'Test' }];
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        // sqlite:///data.db becomes /data.db (absolute path on Unix)
        expect(options.filepath).toBe('/data.db');
        // Simulate what the callback would return
        const mockDb = {
          prepare: () => ({
            all: () => mockRows,
            columns: () => [{ name: 'id', type: 'INTEGER' }, { name: 'name', type: 'TEXT' }],
          }),
        };
        return callback(mockDb as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///data.db',
      });

      expect(result.isError).toBeUndefined();
    });

    it('should parse sqlite::memory: URL for in-memory database', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        expect(options.filepath).toBe(':memory:');
        return callback({
          prepare: () => ({
            all: () => [],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT 1',
        database_url: 'sqlite::memory:',
      });

      expect(result.isError).toBeUndefined();
    });

    it('should parse bare :memory: URL', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        expect(options.filepath).toBe(':memory:');
        return callback({
          prepare: () => ({
            all: () => [],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT 1',
        database_url: ':memory:',
      });

      expect(result.isError).toBeUndefined();
    });

    it('should parse bare .db file path', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        expect(options.filepath).toBe('./mydata.db');
        return callback({
          prepare: () => ({
            all: () => [],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT 1',
        database_url: 'mydata.db',
      });

      expect(result.isError).toBeUndefined();
    });

    it('should parse .sqlite3 file path', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        expect(options.filepath).toBe('./test.sqlite3');
        return callback({
          prepare: () => ({
            all: () => [],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT 1',
        database_url: 'test.sqlite3',
      });

      expect(result.isError).toBeUndefined();
    });

    it('should use DATABASE_URL environment variable as fallback', async () => {
      process.env.DATABASE_URL = 'sqlite::memory:';

      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        expect(options.filepath).toBe(':memory:');
        return callback({
          prepare: () => ({
            all: () => [],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT 1',
      });

      expect(result.isError).toBeUndefined();
    });

    it('should return error when no database URL provided', async () => {
      const result = await handleQueryDatabase({
        query: 'SELECT 1',
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('No database URL provided');
    });

    it('should return error for unsupported URL format', async () => {
      const result = await handleQueryDatabase({
        query: 'SELECT 1',
        database_url: 'unknown://localhost/db',
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('Unable to parse database URL');
    });
  });

  describe('Readonly mode', () => {
    it('should reject INSERT in readonly mode (default)', async () => {
      const result = await handleQueryDatabase({
        query: 'INSERT INTO users (name) VALUES ("Test")',
        database_url: 'sqlite:///test.db',
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('Write operations');
      expect(data.error).toContain('not allowed in readonly mode');
    });

    it('should reject UPDATE in readonly mode', async () => {
      const result = await handleQueryDatabase({
        query: 'UPDATE users SET name = "New"',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      expect(result.isError).toBe(true);
    });

    it('should reject DELETE in readonly mode', async () => {
      const result = await handleQueryDatabase({
        query: 'DELETE FROM users WHERE id = 1',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      expect(result.isError).toBe(true);
    });

    it('should reject DROP in readonly mode', async () => {
      const result = await handleQueryDatabase({
        query: 'DROP TABLE users',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      expect(result.isError).toBe(true);
    });

    it('should reject CREATE in readonly mode', async () => {
      const result = await handleQueryDatabase({
        query: 'CREATE TABLE test (id INTEGER)',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      expect(result.isError).toBe(true);
    });

    it('should allow write operations when readonly=false', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        expect(options.readonly).toBe(false);
        return callback({
          prepare: () => ({
            run: () => ({ changes: 1, lastInsertRowid: 5 }),
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'INSERT INTO users (name) VALUES ("Test")',
        database_url: 'sqlite:///test.db',
        readonly: false,
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.changes).toBe(1);
      expect(data.last_insert_rowid).toBe(5);
    });
  });

  describe('Parameterized queries', () => {
    it('should pass parameters to prepared statement', async () => {
      const capturedParams: unknown[] = [];

      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: (...params: unknown[]) => {
              capturedParams.push(...params);
              return [{ id: 1, name: 'Test' }];
            },
            columns: () => [{ name: 'id', type: 'INTEGER' }, { name: 'name', type: 'TEXT' }],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      await handleQueryDatabase({
        query: 'SELECT * FROM users WHERE id = ? AND name = ?',
        database_url: 'sqlite:///test.db',
        params: [1, 'John'],
      });

      expect(capturedParams).toEqual([1, 'John']);
    });

    it('should handle empty params array', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///test.db',
        params: [],
      });

      expect(result.isError).toBeUndefined();
    });
  });

  describe('Result formatting', () => {
    it('should return JSON format by default', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [{ id: 1, name: 'Test' }],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///test.db',
        format: 'json',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.database_type).toBe('sqlite');
      expect(data.rows).toHaveLength(1);
      expect(data.row_count).toBe(1);
    });

    it('should return ASCII table format when requested', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [{ id: 1, name: 'Test' }],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///test.db',
        format: 'table',
      });

      const text = result.content[0].text;
      expect(text).toContain('Query executed successfully');
      expect(text).toContain('|');
      expect(text).toContain('id');
      expect(text).toContain('name');
    });

    it('should show write operation result in table format', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            run: () => ({ changes: 3, lastInsertRowid: 10 }),
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'UPDATE users SET active = 1',
        database_url: 'sqlite:///test.db',
        readonly: false,
        format: 'table',
      });

      const text = result.content[0].text;
      expect(text).toContain('Query executed successfully');
      expect(text).toContain('Rows affected: 3');
    });

    it('should include execution time in result', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT 1',
        database_url: 'sqlite:///test.db',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.execution_time_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('LIMIT handling', () => {
    it('should add LIMIT to SELECT queries by default', async () => {
      let capturedQuery = '';

      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: (query: string) => {
            capturedQuery = query;
            return {
              all: () => [],
              columns: () => [],
            };
          },
        } as unknown as Parameters<typeof callback>[0]);
      });

      await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///test.db',
      });

      expect(capturedQuery).toContain('LIMIT 100');
    });

    it('should respect custom limit value', async () => {
      let capturedQuery = '';

      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: (query: string) => {
            capturedQuery = query;
            return {
              all: () => [],
              columns: () => [],
            };
          },
        } as unknown as Parameters<typeof callback>[0]);
      });

      await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///test.db',
        limit: 50,
      });

      expect(capturedQuery).toContain('LIMIT 50');
    });

    it('should not add LIMIT when limit=0', async () => {
      let capturedQuery = '';

      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: (query: string) => {
            capturedQuery = query;
            return {
              all: () => [],
              columns: () => [],
            };
          },
        } as unknown as Parameters<typeof callback>[0]);
      });

      await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///test.db',
        limit: 0,
      });

      expect(capturedQuery).not.toContain('LIMIT');
    });

    it('should not add LIMIT if already present', async () => {
      let capturedQuery = '';

      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: (query: string) => {
            capturedQuery = query;
            return {
              all: () => [],
              columns: () => [],
            };
          },
        } as unknown as Parameters<typeof callback>[0]);
      });

      await handleQueryDatabase({
        query: 'SELECT * FROM users LIMIT 10',
        database_url: 'sqlite:///test.db',
      });

      // Should not have double LIMIT
      expect(capturedQuery.match(/LIMIT/gi)?.length).toBe(1);
    });
  });

  describe('Error handling', () => {
    it('should enhance SQLite readonly error', async () => {
      vi.mocked(withConnection).mockRejectedValue(new Error('SQLITE_READONLY: database is locked'));

      const result = await handleQueryDatabase({
        query: 'INSERT INTO users (name) VALUES ("Test")',
        database_url: 'sqlite:///test.db',
        readonly: false,
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('Hint:');
      expect(data.error).toContain('readonly');
    });

    it('should enhance no such table error', async () => {
      vi.mocked(withConnection).mockRejectedValue(new Error('no such table: nonexistent'));

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM nonexistent',
        database_url: 'sqlite:///test.db',
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('Hint:');
      expect(data.error).toContain('sqlite_master');
    });

    it('should enhance no such column error', async () => {
      vi.mocked(withConnection).mockRejectedValue(new Error('no such column: missing_col'));

      const result = await handleQueryDatabase({
        query: 'SELECT missing_col FROM users',
        database_url: 'sqlite:///test.db',
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('Hint:');
      expect(data.error).toContain('PRAGMA table_info');
    });

    it('should include execution time in error response', async () => {
      vi.mocked(withConnection).mockRejectedValue(new Error('Test error'));

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///test.db',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.execution_time_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Column type inference', () => {
    it('should infer integer type', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [{ value: 42 }],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT 42 as value',
        database_url: 'sqlite:///test.db',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.columns[0].type).toBe('integer');
    });

    it('should infer real type for floats', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [{ value: 3.14 }],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT 3.14 as value',
        database_url: 'sqlite:///test.db',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.columns[0].type).toBe('real');
    });

    it('should infer text type for strings', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [{ value: 'hello' }],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT "hello" as value',
        database_url: 'sqlite:///test.db',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.columns[0].type).toBe('text');
    });

    it('should infer null type', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [{ value: null }],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT NULL as value',
        database_url: 'sqlite:///test.db',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.columns[0].type).toBe('null');
    });
  });
});
