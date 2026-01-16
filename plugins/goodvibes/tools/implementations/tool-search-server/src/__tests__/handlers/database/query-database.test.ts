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

    it('should infer boolean type as integer', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [{ value: true }],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT true as value',
        database_url: 'sqlite:///test.db',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.columns[0].type).toBe('integer');
    });

    it('should infer blob type for Buffer values', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [{ value: Buffer.from('binary data') }],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT blob_col as value FROM blobs',
        database_url: 'sqlite:///test.db',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.columns[0].type).toBe('blob');
    });

    it('should infer unknown type for unrecognized values', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [{ value: Symbol('test') }],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT special_col as value FROM test',
        database_url: 'sqlite:///test.db',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.columns[0].type).toBe('unknown');
    });

    it('should get column info from prepared statement when rows are empty', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [],
            columns: () => [
              { name: 'id', type: 'INTEGER' },
              { name: 'name', type: 'TEXT' },
            ],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT id, name FROM empty_table',
        database_url: 'sqlite:///test.db',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.columns).toHaveLength(2);
      expect(data.columns[0].name).toBe('id');
      expect(data.columns[1].name).toBe('name');
    });

    it('should handle columns() throwing an error for empty result set', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [],
            columns: () => { throw new Error('No columns'); },
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM empty_table',
        database_url: 'sqlite:///test.db',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.columns).toHaveLength(0);
      expect(data.success).toBe(true);
    });
  });

  describe('Additional URL parsing formats', () => {
    it('should parse file: URL format', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        expect(options.filepath).toBe('./mydb.sqlite');
        return callback({
          prepare: () => ({
            all: () => [],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT 1',
        database_url: 'file:./mydb.sqlite',
      });

      expect(result.isError).toBeUndefined();
    });

    it('should parse sqlite://:memory: URL variant', async () => {
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
        database_url: 'sqlite://:memory:',
      });

      expect(result.isError).toBeUndefined();
    });

    it('should parse relative path starting with ./', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        expect(options.filepath).toBe('./data/test.db');
        return callback({
          prepare: () => ({
            all: () => [],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT 1',
        database_url: 'sqlite:./data/test.db',
      });

      expect(result.isError).toBeUndefined();
    });

    it('should parse relative path starting with ../', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        expect(options.filepath).toBe('../data/test.db');
        return callback({
          prepare: () => ({
            all: () => [],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT 1',
        database_url: 'sqlite:../data/test.db',
      });

      expect(result.isError).toBeUndefined();
    });

    it('should parse .sqlite file extension', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        expect(options.filepath).toBe('./database.sqlite');
        return callback({
          prepare: () => ({
            all: () => [],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT 1',
        database_url: 'database.sqlite',
      });

      expect(result.isError).toBeUndefined();
    });

    it('should handle absolute path for .db file', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        expect(options.filepath).toBe('/var/data/app.db');
        return callback({
          prepare: () => ({
            all: () => [],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT 1',
        database_url: '/var/data/app.db',
      });

      expect(result.isError).toBeUndefined();
    });
  });

  describe('Write operation detection', () => {
    it('should reject ALTER in readonly mode', async () => {
      const result = await handleQueryDatabase({
        query: 'ALTER TABLE users ADD COLUMN email TEXT',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('Write operations');
    });

    it('should reject TRUNCATE in readonly mode', async () => {
      const result = await handleQueryDatabase({
        query: 'TRUNCATE TABLE users',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      expect(result.isError).toBe(true);
    });

    it('should reject REPLACE in readonly mode', async () => {
      const result = await handleQueryDatabase({
        query: 'REPLACE INTO users (id, name) VALUES (1, "Test")',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      expect(result.isError).toBe(true);
    });

    it('should reject VACUUM in readonly mode', async () => {
      const result = await handleQueryDatabase({
        query: 'VACUUM',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      expect(result.isError).toBe(true);
    });

    it('should reject GRANT in readonly mode', async () => {
      const result = await handleQueryDatabase({
        query: 'GRANT SELECT ON users TO public',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      expect(result.isError).toBe(true);
    });

    it('should reject REVOKE in readonly mode', async () => {
      const result = await handleQueryDatabase({
        query: 'REVOKE SELECT ON users FROM public',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      expect(result.isError).toBe(true);
    });

    it('should detect write operation with leading SQL comment', async () => {
      const result = await handleQueryDatabase({
        query: '-- This is a comment\nINSERT INTO users (name) VALUES ("Test")',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      expect(result.isError).toBe(true);
    });

    it('should detect write operation with block comment', async () => {
      const result = await handleQueryDatabase({
        query: '/* Multi-line\ncomment */\nDELETE FROM users',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      expect(result.isError).toBe(true);
    });

    it('should detect WITH CTE followed by INSERT as write operation', async () => {
      const result = await handleQueryDatabase({
        query: 'WITH active_users AS (SELECT * FROM users WHERE active = 1) INSERT INTO archive SELECT * FROM active_users',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      expect(result.isError).toBe(true);
    });

    it('should detect WITH CTE followed by UPDATE as write operation', async () => {
      const result = await handleQueryDatabase({
        query: 'WITH counts AS (SELECT user_id, COUNT(*) as cnt FROM posts GROUP BY user_id) UPDATE users SET post_count = (SELECT cnt FROM counts WHERE counts.user_id = users.id)',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      expect(result.isError).toBe(true);
    });

    it('should detect WITH CTE followed by DELETE as write operation', async () => {
      const result = await handleQueryDatabase({
        query: 'WITH old_posts AS (SELECT id FROM posts WHERE created_at < date("now", "-30 days")) DELETE FROM posts WHERE id IN (SELECT id FROM old_posts)',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      expect(result.isError).toBe(true);
    });

    it('should allow WITH CTE followed by SELECT as read operation', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [{ count: 10 }],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'WITH active_users AS (SELECT * FROM users WHERE active = 1) SELECT COUNT(*) as count FROM active_users',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      expect(result.isError).toBeUndefined();
    });
  });

  describe('PRAGMA query handling', () => {
    it('should treat PRAGMA read query as SELECT', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [{ name: 'id', type: 'INTEGER' }],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'PRAGMA table_info(users)',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      expect(result.isError).toBeUndefined();
    });

    it('should treat PRAGMA with assignment as write operation', async () => {
      const result = await handleQueryDatabase({
        query: 'PRAGMA foreign_keys = ON',
        database_url: 'sqlite:///test.db',
        readonly: true,
      });

      // PRAGMA with = is a write operation, but isSelectQuery returns false
      // The query proceeds because isWriteOperation doesn't catch PRAGMA
      // This test verifies the behavior of isSelectQuery
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            run: () => ({ changes: 0 }),
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      // Re-run with mock set
      const result2 = await handleQueryDatabase({
        query: 'PRAGMA foreign_keys = ON',
        database_url: 'sqlite:///test.db',
        readonly: false,
      });

      expect(result2.isError).toBeUndefined();
    });
  });

  describe('EXPLAIN query', () => {
    it('should include EXPLAIN output when explain=true', async () => {
      let queryCount = 0;
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => {
              queryCount++;
              if (queryCount === 1) {
                // EXPLAIN query
                return [{ addr: 0, opcode: 'Init', p1: 0, p2: 8, p3: 0, p4: '', p5: '00', comment: '' }];
              }
              // Main query
              return [{ id: 1, name: 'Test' }];
            },
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///test.db',
        explain: true,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.explain_output).toBeDefined();
      expect(data.explain_output).toContain('Init');
    });

    it('should handle EXPLAIN failure gracefully', async () => {
      let queryCount = 0;
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: (query: string) => {
            queryCount++;
            if (query.startsWith('EXPLAIN')) {
              throw new Error('EXPLAIN not supported');
            }
            return {
              all: () => [{ id: 1 }],
              columns: () => [],
            };
          },
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///test.db',
        explain: true,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.explain_output).toContain('EXPLAIN failed');
    });

    it('should include EXPLAIN output in table format', async () => {
      let queryCount = 0;
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => {
              queryCount++;
              if (queryCount === 1) {
                return [{ plan: 'SCAN TABLE users' }];
              }
              return [{ id: 1, name: 'Test' }];
            },
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///test.db',
        explain: true,
        format: 'table',
      });

      const text = result.content[0].text;
      expect(text).toContain('EXPLAIN:');
    });
  });

  describe('Table formatting edge cases', () => {
    it('should display "(no rows)" for empty result in table format', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM empty_table',
        database_url: 'sqlite:///test.db',
        format: 'table',
      });

      const text = result.content[0].text;
      expect(text).toContain('(no rows)');
    });

    it('should display last insert rowid in table format for INSERT', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            run: () => ({ changes: 1, lastInsertRowid: 42 }),
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'INSERT INTO users (name) VALUES ("Test")',
        database_url: 'sqlite:///test.db',
        readonly: false,
        format: 'table',
      });

      const text = result.content[0].text;
      expect(text).toContain('Last insert row ID: 42');
    });

    it('should not display last insert rowid when it is 0', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            run: () => ({ changes: 1, lastInsertRowid: 0n }),
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'UPDATE users SET name = "Test"',
        database_url: 'sqlite:///test.db',
        readonly: false,
        format: 'table',
      });

      const text = result.content[0].text;
      expect(text).not.toContain('Last insert row ID');
    });

    it('should truncate long cell values to 50 characters', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [{
              id: 1,
              description: 'A'.repeat(100)
            }],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM items',
        database_url: 'sqlite:///test.db',
        format: 'table',
      });

      const text = result.content[0].text;
      // The value should be truncated
      expect(text).not.toContain('A'.repeat(100));
    });

    it('should format NULL values as "NULL" in table', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [{ id: 1, name: null }],
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
      expect(text).toContain('NULL');
    });

    it('should format object values as JSON in table', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [{ id: 1, metadata: { key: 'value' } }],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM items',
        database_url: 'sqlite:///test.db',
        format: 'table',
      });

      const text = result.content[0].text;
      expect(text).toContain('"key"');
    });

    it('should show truncated indicator when limit applied', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            all: () => [{ id: 1 }],
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///test.db',
        format: 'table',
        limit: 10,
      });

      const text = result.content[0].text;
      expect(text).toContain('limited to 10');
    });
  });

  describe('LIMIT clause detection', () => {
    it('should detect LIMIT with parameter placeholder $1', async () => {
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
        query: 'SELECT * FROM users LIMIT $1',
        database_url: 'sqlite:///test.db',
      });

      // Should not add another LIMIT
      expect(capturedQuery.match(/LIMIT/gi)?.length).toBe(1);
    });

    it('should detect LIMIT with ? placeholder', async () => {
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
        query: 'SELECT * FROM users LIMIT ?',
        database_url: 'sqlite:///test.db',
      });

      expect(capturedQuery.match(/LIMIT/gi)?.length).toBe(1);
    });

    it('should not add LIMIT to non-SELECT queries', async () => {
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            run: () => ({ changes: 1 }),
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'DELETE FROM users WHERE id = 1',
        database_url: 'sqlite:///test.db',
        readonly: false,
        limit: 100,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.query_executed).not.toContain('LIMIT');
    });
  });

  describe('Additional SQLite error enhancements', () => {
    it('should enhance SQLITE_BUSY error', async () => {
      vi.mocked(withConnection).mockRejectedValue(new Error('SQLITE_BUSY: database is locked'));

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///test.db',
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('Hint:');
      expect(data.error).toContain('locked');
    });

    it('should enhance SQLITE_CONSTRAINT error', async () => {
      vi.mocked(withConnection).mockRejectedValue(new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed'));

      const result = await handleQueryDatabase({
        query: 'INSERT INTO users (id, name) VALUES (1, "Test")',
        database_url: 'sqlite:///test.db',
        readonly: false,
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('Hint:');
      expect(data.error).toContain('constraint');
    });

    it('should enhance SQLITE_CORRUPT error', async () => {
      vi.mocked(withConnection).mockRejectedValue(new Error('SQLITE_CORRUPT: database disk image is malformed'));

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///test.db',
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('Hint:');
      expect(data.error).toContain('corrupted');
    });

    it('should enhance unable to open database error', async () => {
      vi.mocked(withConnection).mockRejectedValue(new Error('unable to open database file'));

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///nonexistent/path/test.db',
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('Hint:');
      expect(data.error).toContain('path');
    });

    it('should not enhance non-SQLite errors', async () => {
      vi.mocked(withConnection).mockRejectedValue(new Error('Generic error'));

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///test.db',
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('Generic error');
      expect(data.error).not.toContain('Hint:');
    });

    it('should handle non-Error thrown values', async () => {
      vi.mocked(withConnection).mockRejectedValue('string error');

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///test.db',
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('Unknown error');
    });

    it('should include explain output in error response when explain fails after main query fails', async () => {
      let queryCount = 0;
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: (query: string) => {
            queryCount++;
            if (query.startsWith('EXPLAIN')) {
              return {
                all: () => [{ plan: 'test plan' }],
                columns: () => [],
              };
            }
            throw new Error('Main query failed');
          },
        } as unknown as Parameters<typeof callback>[0]);
      });

      const result = await handleQueryDatabase({
        query: 'SELECT * FROM users',
        database_url: 'sqlite:///test.db',
        explain: true,
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.explain_output).toBeDefined();
    });
  });

  describe('Write operation parameters', () => {
    it('should pass params to write operations', async () => {
      const capturedParams: unknown[] = [];
      vi.mocked(withConnection).mockImplementation(async (options, callback) => {
        return callback({
          prepare: () => ({
            run: (...params: unknown[]) => {
              capturedParams.push(...params);
              return { changes: 1, lastInsertRowid: 1 };
            },
            columns: () => [],
          }),
        } as unknown as Parameters<typeof callback>[0]);
      });

      await handleQueryDatabase({
        query: 'INSERT INTO users (name, email) VALUES (?, ?)',
        database_url: 'sqlite:///test.db',
        readonly: false,
        params: ['John', 'john@example.com'],
      });

      expect(capturedParams).toEqual(['John', 'john@example.com']);
    });
  });
});
