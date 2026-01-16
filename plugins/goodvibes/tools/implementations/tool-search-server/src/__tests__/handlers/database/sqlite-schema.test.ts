/**
 * Unit tests for SQLite schema introspection
 *
 * Tests cover:
 * - Schema types (SqliteColumn, SqliteIndex, SqliteForeignKey, etc.)
 * - Type structure validation
 * - listTables function
 * - listViews function
 * - getTableColumns function
 * - getTableIndexes function
 * - getTableForeignKeys function
 * - getTableTriggers function
 * - getCreateStatement function
 * - getRowCount function
 * - getTableSchema function
 * - getDatabaseSchema function
 * - sanitizeIdentifier helper (via integration tests)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  SqliteColumn,
  SqliteIndex,
  SqliteForeignKey,
  SqliteTrigger,
  SqliteTableSchema,
  SqliteDatabaseSchema,
} from '../../../handlers/database/sqlite-schema.js';

// =============================================================================
// Mock Setup
// =============================================================================

// Create mock statement factory
const createMockStatement = (returnValue: unknown = []) => ({
  all: vi.fn().mockReturnValue(returnValue),
  get: vi.fn().mockReturnValue(returnValue),
  run: vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 0 }),
  columns: vi.fn().mockReturnValue([]),
  bind: vi.fn().mockReturnThis(),
});

// Create mock database factory
const createMockDatabase = () => ({
  prepare: vi.fn().mockReturnValue(createMockStatement()),
  exec: vi.fn(),
  pragma: vi.fn(),
  close: vi.fn(),
  open: true,
  inTransaction: false,
  name: ':memory:',
  memory: true,
  readonly: true,
});

// Mock withConnection to capture and execute callbacks
vi.mock('../../../handlers/database/sqlite-connection.js', () => ({
  withConnection: vi.fn(),
}));

describe('SQLite Schema Types', () => {
  describe('SqliteColumn', () => {
    it('should have all required properties', () => {
      const column: SqliteColumn = {
        cid: 0,
        name: 'id',
        type: 'INTEGER',
        notnull: true,
        dflt_value: null,
        pk: 1,
      };

      expect(column.cid).toBe(0);
      expect(column.name).toBe('id');
      expect(column.type).toBe('INTEGER');
      expect(column.notnull).toBe(true);
      expect(column.dflt_value).toBeNull();
      expect(column.pk).toBe(1);
    });

    it('should support default values', () => {
      const column: SqliteColumn = {
        cid: 1,
        name: 'status',
        type: 'TEXT',
        notnull: false,
        dflt_value: "'active'",
        pk: 0,
      };

      expect(column.dflt_value).toBe("'active'");
      expect(column.pk).toBe(0);
    });

    it('should support various SQLite types', () => {
      const types = ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC', 'VARCHAR(255)', 'DATETIME'];

      for (const type of types) {
        const column: SqliteColumn = {
          cid: 0,
          name: 'test',
          type,
          notnull: false,
          dflt_value: null,
          pk: 0,
        };
        expect(column.type).toBe(type);
      }
    });
  });

  describe('SqliteIndex', () => {
    it('should have all required properties', () => {
      const index: SqliteIndex = {
        seq: 0,
        name: 'idx_users_email',
        unique: true,
        origin: 'c',
        partial: false,
        columns: ['email'],
      };

      expect(index.seq).toBe(0);
      expect(index.name).toBe('idx_users_email');
      expect(index.unique).toBe(true);
      expect(index.origin).toBe('c');
      expect(index.partial).toBe(false);
      expect(index.columns).toEqual(['email']);
    });

    it('should support composite indexes', () => {
      const index: SqliteIndex = {
        seq: 1,
        name: 'idx_orders_user_date',
        unique: false,
        origin: 'c',
        partial: false,
        columns: ['user_id', 'order_date'],
      };

      expect(index.columns).toHaveLength(2);
      expect(index.columns).toContain('user_id');
      expect(index.columns).toContain('order_date');
    });

    it('should support different index origins', () => {
      const origins: Array<'c' | 'u' | 'pk'> = ['c', 'u', 'pk'];

      for (const origin of origins) {
        const index: SqliteIndex = {
          seq: 0,
          name: 'test_idx',
          unique: origin !== 'c',
          origin,
          partial: false,
          columns: ['col'],
        };
        expect(index.origin).toBe(origin);
      }
    });

    it('should support partial indexes', () => {
      const index: SqliteIndex = {
        seq: 0,
        name: 'idx_active_users',
        unique: false,
        origin: 'c',
        partial: true,
        columns: ['email'],
      };

      expect(index.partial).toBe(true);
    });
  });

  describe('SqliteForeignKey', () => {
    it('should have all required properties', () => {
      const fk: SqliteForeignKey = {
        id: 0,
        seq: 0,
        table: 'users',
        from: 'user_id',
        to: 'id',
        on_update: 'NO ACTION',
        on_delete: 'CASCADE',
        match: 'NONE',
      };

      expect(fk.id).toBe(0);
      expect(fk.seq).toBe(0);
      expect(fk.table).toBe('users');
      expect(fk.from).toBe('user_id');
      expect(fk.to).toBe('id');
      expect(fk.on_update).toBe('NO ACTION');
      expect(fk.on_delete).toBe('CASCADE');
      expect(fk.match).toBe('NONE');
    });

    it('should support different on_update actions', () => {
      const actions = ['NO ACTION', 'RESTRICT', 'SET NULL', 'SET DEFAULT', 'CASCADE'];

      for (const action of actions) {
        const fk: SqliteForeignKey = {
          id: 0,
          seq: 0,
          table: 'parent',
          from: 'parent_id',
          to: 'id',
          on_update: action,
          on_delete: 'NO ACTION',
          match: 'NONE',
        };
        expect(fk.on_update).toBe(action);
      }
    });

    it('should support composite foreign keys', () => {
      // First column of composite FK
      const fk1: SqliteForeignKey = {
        id: 0,
        seq: 0,
        table: 'parent',
        from: 'parent_id1',
        to: 'id1',
        on_update: 'NO ACTION',
        on_delete: 'NO ACTION',
        match: 'NONE',
      };

      // Second column of composite FK
      const fk2: SqliteForeignKey = {
        id: 0,
        seq: 1,
        table: 'parent',
        from: 'parent_id2',
        to: 'id2',
        on_update: 'NO ACTION',
        on_delete: 'NO ACTION',
        match: 'NONE',
      };

      expect(fk1.id).toBe(fk2.id);
      expect(fk1.seq).toBe(0);
      expect(fk2.seq).toBe(1);
    });
  });

  describe('SqliteTrigger', () => {
    it('should have all required properties', () => {
      const trigger: SqliteTrigger = {
        name: 'trg_users_updated',
        type: 'trigger',
        table: 'users',
        sql: 'CREATE TRIGGER trg_users_updated AFTER UPDATE ON users BEGIN UPDATE users SET updated_at = datetime("now") WHERE id = NEW.id; END',
      };

      expect(trigger.name).toBe('trg_users_updated');
      expect(trigger.type).toBe('trigger');
      expect(trigger.table).toBe('users');
      expect(trigger.sql).toContain('CREATE TRIGGER');
    });
  });

  describe('SqliteTableSchema', () => {
    it('should have all required properties', () => {
      const table: SqliteTableSchema = {
        name: 'users',
        type: 'table',
        columns: [
          { cid: 0, name: 'id', type: 'INTEGER', notnull: true, dflt_value: null, pk: 1 },
          { cid: 1, name: 'name', type: 'TEXT', notnull: false, dflt_value: null, pk: 0 },
        ],
        indexes: [],
        foreign_keys: [],
        triggers: [],
        sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)',
      };

      expect(table.name).toBe('users');
      expect(table.type).toBe('table');
      expect(table.columns).toHaveLength(2);
      expect(table.sql).toContain('CREATE TABLE');
    });

    it('should support views', () => {
      const view: SqliteTableSchema = {
        name: 'active_users',
        type: 'view',
        columns: [
          { cid: 0, name: 'id', type: 'INTEGER', notnull: true, dflt_value: null, pk: 0 },
          { cid: 1, name: 'name', type: 'TEXT', notnull: false, dflt_value: null, pk: 0 },
        ],
        indexes: [],
        foreign_keys: [],
        triggers: [],
        sql: 'CREATE VIEW active_users AS SELECT id, name FROM users WHERE active = 1',
      };

      expect(view.type).toBe('view');
    });

    it('should support optional row_count', () => {
      const tableWithCount: SqliteTableSchema = {
        name: 'users',
        type: 'table',
        columns: [],
        indexes: [],
        foreign_keys: [],
        triggers: [],
        sql: '',
        row_count: 1000,
      };

      expect(tableWithCount.row_count).toBe(1000);
    });
  });

  describe('SqliteDatabaseSchema', () => {
    it('should have all required properties', () => {
      const schema: SqliteDatabaseSchema = {
        tables: [],
        views: [],
        version: '3.45.0',
      };

      expect(schema.tables).toEqual([]);
      expect(schema.views).toEqual([]);
      expect(schema.version).toBe('3.45.0');
    });

    it('should support optional database stats', () => {
      const schema: SqliteDatabaseSchema = {
        tables: [],
        views: [],
        version: '3.45.0',
        page_count: 100,
        page_size: 4096,
        file_size_bytes: 409600,
      };

      expect(schema.page_count).toBe(100);
      expect(schema.page_size).toBe(4096);
      expect(schema.file_size_bytes).toBe(409600);
    });

    it('should contain tables and views', () => {
      const schema: SqliteDatabaseSchema = {
        tables: [
          {
            name: 'users',
            type: 'table',
            columns: [{ cid: 0, name: 'id', type: 'INTEGER', notnull: true, dflt_value: null, pk: 1 }],
            indexes: [],
            foreign_keys: [],
            triggers: [],
            sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY)',
          },
        ],
        views: [
          {
            name: 'user_names',
            type: 'view',
            columns: [{ cid: 0, name: 'name', type: 'TEXT', notnull: false, dflt_value: null, pk: 0 }],
            indexes: [],
            foreign_keys: [],
            triggers: [],
            sql: 'CREATE VIEW user_names AS SELECT name FROM users',
          },
        ],
        version: '3.45.0',
      };

      expect(schema.tables).toHaveLength(1);
      expect(schema.views).toHaveLength(1);
      expect(schema.tables[0].name).toBe('users');
      expect(schema.views[0].name).toBe('user_names');
    });
  });
});

// =============================================================================
// Schema Function Tests
// =============================================================================

describe('SQLite Schema Functions', () => {
  let withConnection: ReturnType<typeof vi.fn>;
  let listTables: typeof import('../../../handlers/database/sqlite-schema.js').listTables;
  let listViews: typeof import('../../../handlers/database/sqlite-schema.js').listViews;
  let getTableColumns: typeof import('../../../handlers/database/sqlite-schema.js').getTableColumns;
  let getTableIndexes: typeof import('../../../handlers/database/sqlite-schema.js').getTableIndexes;
  let getTableForeignKeys: typeof import('../../../handlers/database/sqlite-schema.js').getTableForeignKeys;
  let getTableTriggers: typeof import('../../../handlers/database/sqlite-schema.js').getTableTriggers;
  let getCreateStatement: typeof import('../../../handlers/database/sqlite-schema.js').getCreateStatement;
  let getRowCount: typeof import('../../../handlers/database/sqlite-schema.js').getRowCount;
  let getTableSchema: typeof import('../../../handlers/database/sqlite-schema.js').getTableSchema;
  let getDatabaseSchema: typeof import('../../../handlers/database/sqlite-schema.js').getDatabaseSchema;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Get the mocked withConnection
    const connectionModule = await import('../../../handlers/database/sqlite-connection.js');
    withConnection = connectionModule.withConnection as ReturnType<typeof vi.fn>;

    // Import schema functions
    const schemaModule = await import('../../../handlers/database/sqlite-schema.js');
    listTables = schemaModule.listTables;
    listViews = schemaModule.listViews;
    getTableColumns = schemaModule.getTableColumns;
    getTableIndexes = schemaModule.getTableIndexes;
    getTableForeignKeys = schemaModule.getTableForeignKeys;
    getTableTriggers = schemaModule.getTableTriggers;
    getCreateStatement = schemaModule.getCreateStatement;
    getRowCount = schemaModule.getRowCount;
    getTableSchema = schemaModule.getTableSchema;
    getDatabaseSchema = schemaModule.getDatabaseSchema;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('listTables', () => {
    it('should return list of table names', async () => {
      const mockDb = createMockDatabase();
      const mockTables = [{ name: 'users' }, { name: 'posts' }, { name: 'comments' }];
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: vi.fn().mockReturnValue(mockTables),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await listTables({ filepath: ':memory:' });

      expect(result).toEqual(['users', 'posts', 'comments']);
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('sqlite_master'));
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining("type = 'table'"));
    });

    it('should return empty array when no tables exist', async () => {
      const mockDb = createMockDatabase();
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: vi.fn().mockReturnValue([]),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await listTables({ filepath: ':memory:' });

      expect(result).toEqual([]);
    });

    it('should exclude sqlite_ internal tables', async () => {
      const mockDb = createMockDatabase();
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: vi.fn().mockReturnValue([{ name: 'users' }]),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      await listTables({ filepath: ':memory:' });

      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining("NOT LIKE 'sqlite_%'"));
    });

    it('should pass connection options correctly', async () => {
      const mockDb = createMockDatabase();
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: vi.fn().mockReturnValue([]),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const options = { filepath: '/path/to/db.sqlite', readonly: true };
      await listTables(options);

      expect(withConnection).toHaveBeenCalledWith(options, expect.any(Function));
    });
  });

  describe('listViews', () => {
    it('should return list of view names', async () => {
      const mockDb = createMockDatabase();
      const mockViews = [{ name: 'active_users' }, { name: 'recent_posts' }];
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: vi.fn().mockReturnValue(mockViews),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await listViews({ filepath: ':memory:' });

      expect(result).toEqual(['active_users', 'recent_posts']);
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining("type = 'view'"));
    });

    it('should return empty array when no views exist', async () => {
      const mockDb = createMockDatabase();
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: vi.fn().mockReturnValue([]),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await listViews({ filepath: ':memory:' });

      expect(result).toEqual([]);
    });
  });

  describe('getTableColumns', () => {
    it('should return column information for a table', async () => {
      const mockDb = createMockDatabase();
      const mockColumns = [
        { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
        { cid: 1, name: 'name', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
        { cid: 2, name: 'email', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
      ];
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: vi.fn().mockReturnValue(mockColumns),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableColumns({ filepath: ':memory:' }, 'users');

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        cid: 0,
        name: 'id',
        type: 'INTEGER',
        notnull: true,
        dflt_value: null,
        pk: 1,
      });
      expect(result[1].notnull).toBe(false);
      expect(mockDb.prepare).toHaveBeenCalledWith('PRAGMA table_info("users")');
    });

    it('should convert notnull integer to boolean', async () => {
      const mockDb = createMockDatabase();
      const mockColumns = [
        { cid: 0, name: 'col1', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
        { cid: 1, name: 'col2', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      ];
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: vi.fn().mockReturnValue(mockColumns),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableColumns({ filepath: ':memory:' }, 'test');

      expect(result[0].notnull).toBe(true);
      expect(result[1].notnull).toBe(false);
    });

    it('should sanitize table name to prevent SQL injection', async () => {
      const mockDb = createMockDatabase();
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: vi.fn().mockReturnValue([]),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      // Attempt SQL injection with quotes
      await getTableColumns({ filepath: ':memory:' }, 'users"; DROP TABLE users;--');

      // The table name should be sanitized (quotes removed)
      expect(mockDb.prepare).toHaveBeenCalledWith('PRAGMA table_info("users; DROP TABLE users;--")');
    });

    it('should handle table with default values', async () => {
      const mockDb = createMockDatabase();
      const mockColumns = [
        { cid: 0, name: 'status', type: 'TEXT', notnull: 0, dflt_value: "'active'", pk: 0 },
        { cid: 1, name: 'count', type: 'INTEGER', notnull: 0, dflt_value: '0', pk: 0 },
      ];
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: vi.fn().mockReturnValue(mockColumns),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableColumns({ filepath: ':memory:' }, 'test');

      expect(result[0].dflt_value).toBe("'active'");
      expect(result[1].dflt_value).toBe('0');
    });
  });

  describe('getTableIndexes', () => {
    it('should return index information for a table', async () => {
      const mockDb = createMockDatabase();
      const mockIndexList = [
        { seq: 0, name: 'idx_users_email', unique: 1, origin: 'c', partial: 0 },
        { seq: 1, name: 'sqlite_autoindex_users_1', unique: 1, origin: 'pk', partial: 0 },
      ];
      const mockIndexInfo = [{ seqno: 0, cid: 1, name: 'email' }];

      let prepareCallCount = 0;
      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        prepareCallCount++;
        if (sql.includes('index_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(mockIndexList) };
        }
        return { ...createMockStatement(), all: vi.fn().mockReturnValue(mockIndexInfo) };
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableIndexes({ filepath: ':memory:' }, 'users');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        seq: 0,
        name: 'idx_users_email',
        unique: true,
        origin: 'c',
        partial: false,
        columns: ['email'],
      });
    });

    it('should convert unique and partial integers to booleans', async () => {
      const mockDb = createMockDatabase();
      const mockIndexList = [
        { seq: 0, name: 'idx1', unique: 0, origin: 'c', partial: 1 },
        { seq: 1, name: 'idx2', unique: 1, origin: 'u', partial: 0 },
      ];

      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('index_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(mockIndexList) };
        }
        return { ...createMockStatement(), all: vi.fn().mockReturnValue([]) };
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableIndexes({ filepath: ':memory:' }, 'test');

      expect(result[0].unique).toBe(false);
      expect(result[0].partial).toBe(true);
      expect(result[1].unique).toBe(true);
      expect(result[1].partial).toBe(false);
    });

    it('should handle composite indexes', async () => {
      const mockDb = createMockDatabase();
      const mockIndexList = [{ seq: 0, name: 'idx_composite', unique: 0, origin: 'c', partial: 0 }];
      const mockIndexInfo = [
        { seqno: 0, cid: 1, name: 'col1' },
        { seqno: 1, cid: 2, name: 'col2' },
      ];

      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('index_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(mockIndexList) };
        }
        return { ...createMockStatement(), all: vi.fn().mockReturnValue(mockIndexInfo) };
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableIndexes({ filepath: ':memory:' }, 'test');

      expect(result[0].columns).toEqual(['col1', 'col2']);
    });

    it('should return empty array when no indexes exist', async () => {
      const mockDb = createMockDatabase();
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: vi.fn().mockReturnValue([]),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableIndexes({ filepath: ':memory:' }, 'test');

      expect(result).toEqual([]);
    });
  });

  describe('getTableForeignKeys', () => {
    it('should return foreign key information for a table', async () => {
      const mockDb = createMockDatabase();
      const mockForeignKeys = [
        {
          id: 0,
          seq: 0,
          table: 'users',
          from: 'user_id',
          to: 'id',
          on_update: 'NO ACTION',
          on_delete: 'CASCADE',
          match: 'NONE',
        },
      ];
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: vi.fn().mockReturnValue(mockForeignKeys),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableForeignKeys({ filepath: ':memory:' }, 'posts');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 0,
        seq: 0,
        table: 'users',
        from: 'user_id',
        to: 'id',
        on_update: 'NO ACTION',
        on_delete: 'CASCADE',
        match: 'NONE',
      });
      expect(mockDb.prepare).toHaveBeenCalledWith('PRAGMA foreign_key_list("posts")');
    });

    it('should handle composite foreign keys', async () => {
      const mockDb = createMockDatabase();
      const mockForeignKeys = [
        { id: 0, seq: 0, table: 'parent', from: 'col1', to: 'pk1', on_update: 'NO ACTION', on_delete: 'NO ACTION', match: 'NONE' },
        { id: 0, seq: 1, table: 'parent', from: 'col2', to: 'pk2', on_update: 'NO ACTION', on_delete: 'NO ACTION', match: 'NONE' },
      ];
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: vi.fn().mockReturnValue(mockForeignKeys),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableForeignKeys({ filepath: ':memory:' }, 'child');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(result[1].id);
      expect(result[0].seq).toBe(0);
      expect(result[1].seq).toBe(1);
    });

    it('should return empty array when no foreign keys exist', async () => {
      const mockDb = createMockDatabase();
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: vi.fn().mockReturnValue([]),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableForeignKeys({ filepath: ':memory:' }, 'test');

      expect(result).toEqual([]);
    });
  });

  describe('getTableTriggers', () => {
    it('should return trigger information for a table', async () => {
      const mockDb = createMockDatabase();
      const mockTriggers = [
        {
          name: 'trg_users_insert',
          type: 'trigger',
          table_name: 'users',
          sql: 'CREATE TRIGGER trg_users_insert AFTER INSERT ON users BEGIN ...',
        },
      ];
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: vi.fn().mockReturnValue(mockTriggers),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableTriggers({ filepath: ':memory:' }, 'users');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'trg_users_insert',
        type: 'trigger',
        table: 'users',
        sql: 'CREATE TRIGGER trg_users_insert AFTER INSERT ON users BEGIN ...',
      });
    });

    it('should handle null sql in trigger', async () => {
      const mockDb = createMockDatabase();
      const mockTriggers = [
        { name: 'trg_test', type: 'trigger', table_name: 'test', sql: null },
      ];
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: vi.fn().mockReturnValue(mockTriggers),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableTriggers({ filepath: ':memory:' }, 'test');

      expect(result[0].sql).toBe('');
    });

    it('should return empty array when no triggers exist', async () => {
      const mockDb = createMockDatabase();
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: vi.fn().mockReturnValue([]),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableTriggers({ filepath: ':memory:' }, 'test');

      expect(result).toEqual([]);
    });

    it('should pass sanitized table name as parameter', async () => {
      const mockDb = createMockDatabase();
      const allFn = vi.fn().mockReturnValue([]);
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        all: allFn,
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      await getTableTriggers({ filepath: ':memory:' }, 'users');

      expect(allFn).toHaveBeenCalledWith('users');
    });
  });

  describe('getCreateStatement', () => {
    it('should return CREATE statement for a table', async () => {
      const mockDb = createMockDatabase();
      const mockResult = { sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)' };
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        get: vi.fn().mockReturnValue(mockResult),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getCreateStatement({ filepath: ':memory:' }, 'users');

      expect(result).toBe('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
    });

    it('should return CREATE statement for a view', async () => {
      const mockDb = createMockDatabase();
      const mockResult = { sql: 'CREATE VIEW active_users AS SELECT * FROM users WHERE active = 1' };
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        get: vi.fn().mockReturnValue(mockResult),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getCreateStatement({ filepath: ':memory:' }, 'active_users');

      expect(result).toBe('CREATE VIEW active_users AS SELECT * FROM users WHERE active = 1');
    });

    it('should return empty string when object not found', async () => {
      const mockDb = createMockDatabase();
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        get: vi.fn().mockReturnValue(undefined),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getCreateStatement({ filepath: ':memory:' }, 'nonexistent');

      expect(result).toBe('');
    });

    it('should pass sanitized object name as parameter', async () => {
      const mockDb = createMockDatabase();
      const getFn = vi.fn().mockReturnValue({ sql: 'CREATE TABLE test (id INT)' });
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        get: getFn,
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      await getCreateStatement({ filepath: ':memory:' }, 'test_table');

      expect(getFn).toHaveBeenCalledWith('test_table');
    });
  });

  describe('getRowCount', () => {
    it('should return row count using sqlite_stat1 if available', async () => {
      const mockDb = createMockDatabase();
      let queryCount = 0;
      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        queryCount++;
        if (sql.includes('sqlite_stat1')) {
          return {
            ...createMockStatement(),
            get: vi.fn().mockReturnValue({ stat: '1000 50' }),
          };
        }
        return {
          ...createMockStatement(),
          get: vi.fn().mockReturnValue({ count: 500 }),
        };
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getRowCount({ filepath: ':memory:' }, 'users');

      expect(result).toBe(1000);
    });

    it('should fall back to COUNT(*) when sqlite_stat1 not available', async () => {
      const mockDb = createMockDatabase();
      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('sqlite_stat1')) {
          return {
            ...createMockStatement(),
            get: vi.fn().mockReturnValue(undefined),
          };
        }
        return {
          ...createMockStatement(),
          get: vi.fn().mockReturnValue({ count: 500 }),
        };
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getRowCount({ filepath: ':memory:' }, 'users');

      expect(result).toBe(500);
    });

    it('should fall back to COUNT(*) when sqlite_stat1 query throws', async () => {
      const mockDb = createMockDatabase();
      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('sqlite_stat1')) {
          return {
            ...createMockStatement(),
            get: vi.fn().mockImplementation(() => {
              throw new Error('no such table: sqlite_stat1');
            }),
          };
        }
        return {
          ...createMockStatement(),
          get: vi.fn().mockReturnValue({ count: 250 }),
        };
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getRowCount({ filepath: ':memory:' }, 'users');

      expect(result).toBe(250);
    });

    it('should handle invalid stat format', async () => {
      const mockDb = createMockDatabase();
      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('sqlite_stat1')) {
          return {
            ...createMockStatement(),
            get: vi.fn().mockReturnValue({ stat: 'invalid' }),
          };
        }
        return {
          ...createMockStatement(),
          get: vi.fn().mockReturnValue({ count: 100 }),
        };
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getRowCount({ filepath: ':memory:' }, 'users');

      // Should return 0 from invalid parse, or fall through to COUNT(*)
      expect(typeof result).toBe('number');
    });

    it('should return 0 for empty stat value', async () => {
      const mockDb = createMockDatabase();
      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('sqlite_stat1')) {
          return {
            ...createMockStatement(),
            get: vi.fn().mockReturnValue({ stat: '' }),
          };
        }
        return {
          ...createMockStatement(),
          get: vi.fn().mockReturnValue({ count: 0 }),
        };
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getRowCount({ filepath: ':memory:' }, 'empty_table');

      expect(result).toBe(0);
    });
  });

  describe('getTableSchema', () => {
    it('should return complete schema for a table', async () => {
      const mockDb = createMockDatabase();
      const masterData = { type: 'table', sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY)' };
      const columnsData = [{ cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 }];
      const indexListData = [{ seq: 0, name: 'idx_users_id', unique: 1, origin: 'pk', partial: 0 }];
      const indexInfoData = [{ seqno: 0, cid: 0, name: 'id' }];
      const fkData: unknown[] = [];
      const triggerData: unknown[] = [];
      const countData = { count: 100 };

      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('sqlite_master') && sql.includes("type IN ('table', 'view')")) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(masterData) };
        }
        if (sql.includes('table_info')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(columnsData) };
        }
        if (sql.includes('index_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(indexListData) };
        }
        if (sql.includes('index_info')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(indexInfoData) };
        }
        if (sql.includes('foreign_key_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(fkData) };
        }
        if (sql.includes("type = 'trigger'")) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(triggerData) };
        }
        if (sql.includes('COUNT(*)')) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(countData) };
        }
        return createMockStatement();
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableSchema({ filepath: ':memory:' }, 'users');

      expect(result.name).toBe('users');
      expect(result.type).toBe('table');
      expect(result.columns).toHaveLength(1);
      expect(result.columns[0].name).toBe('id');
      expect(result.indexes).toHaveLength(1);
      expect(result.foreign_keys).toHaveLength(0);
      expect(result.triggers).toHaveLength(0);
      expect(result.sql).toBe('CREATE TABLE users (id INTEGER PRIMARY KEY)');
      expect(result.row_count).toBe(100);
    });

    it('should return schema for a view (no indexes, fk, or row_count)', async () => {
      const mockDb = createMockDatabase();
      const masterData = { type: 'view', sql: 'CREATE VIEW active_users AS SELECT * FROM users WHERE active = 1' };
      const columnsData = [
        { cid: 0, name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
        { cid: 1, name: 'name', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      ];
      const triggerData: unknown[] = [];

      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('sqlite_master') && sql.includes("type IN ('table', 'view')")) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(masterData) };
        }
        if (sql.includes('table_info')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(columnsData) };
        }
        if (sql.includes("type = 'trigger'")) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(triggerData) };
        }
        return createMockStatement();
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableSchema({ filepath: ':memory:' }, 'active_users');

      expect(result.name).toBe('active_users');
      expect(result.type).toBe('view');
      expect(result.columns).toHaveLength(2);
      expect(result.indexes).toHaveLength(0);
      expect(result.foreign_keys).toHaveLength(0);
      expect(result.row_count).toBeUndefined();
    });

    it('should throw error when table not found', async () => {
      const mockDb = createMockDatabase();
      mockDb.prepare = vi.fn().mockReturnValue({
        ...createMockStatement(),
        get: vi.fn().mockReturnValue(undefined),
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      await expect(getTableSchema({ filepath: ':memory:' }, 'nonexistent')).rejects.toThrow(
        "Table or view 'nonexistent' not found"
      );
    });

    it('should handle table with null sql in master', async () => {
      const mockDb = createMockDatabase();
      const masterData = { type: 'table', sql: null };
      const columnsData: unknown[] = [];
      const indexListData: unknown[] = [];
      const fkData: unknown[] = [];
      const triggerData: unknown[] = [];
      const countData = { count: 0 };

      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('sqlite_master') && sql.includes("type IN ('table', 'view')")) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(masterData) };
        }
        if (sql.includes('table_info')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(columnsData) };
        }
        if (sql.includes('index_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(indexListData) };
        }
        if (sql.includes('foreign_key_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(fkData) };
        }
        if (sql.includes("type = 'trigger'")) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(triggerData) };
        }
        if (sql.includes('COUNT(*)')) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(countData) };
        }
        return createMockStatement();
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableSchema({ filepath: ':memory:' }, 'test');

      expect(result.sql).toBe('');
    });

    it('should include foreign keys for tables', async () => {
      const mockDb = createMockDatabase();
      const masterData = { type: 'table', sql: 'CREATE TABLE posts (...)' };
      const columnsData = [{ cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 }];
      const indexListData: unknown[] = [];
      const fkData = [
        { id: 0, seq: 0, table: 'users', from: 'user_id', to: 'id', on_update: 'NO ACTION', on_delete: 'CASCADE', match: 'NONE' },
      ];
      const triggerData: unknown[] = [];
      const countData = { count: 10 };

      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('sqlite_master') && sql.includes("type IN ('table', 'view')")) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(masterData) };
        }
        if (sql.includes('table_info')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(columnsData) };
        }
        if (sql.includes('index_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(indexListData) };
        }
        if (sql.includes('foreign_key_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(fkData) };
        }
        if (sql.includes("type = 'trigger'")) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(triggerData) };
        }
        if (sql.includes('COUNT(*)')) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(countData) };
        }
        return createMockStatement();
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableSchema({ filepath: ':memory:' }, 'posts');

      expect(result.foreign_keys).toHaveLength(1);
      expect(result.foreign_keys[0].table).toBe('users');
    });

    it('should include triggers for tables', async () => {
      const mockDb = createMockDatabase();
      const masterData = { type: 'table', sql: 'CREATE TABLE users (...)' };
      const columnsData = [{ cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 }];
      const indexListData: unknown[] = [];
      const fkData: unknown[] = [];
      const triggerData = [
        { name: 'trg_audit', type: 'trigger', table_name: 'users', sql: 'CREATE TRIGGER trg_audit ...' },
      ];
      const countData = { count: 50 };

      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('sqlite_master') && sql.includes("type IN ('table', 'view')")) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(masterData) };
        }
        if (sql.includes('table_info')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(columnsData) };
        }
        if (sql.includes('index_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(indexListData) };
        }
        if (sql.includes('foreign_key_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(fkData) };
        }
        if (sql.includes("type = 'trigger'")) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(triggerData) };
        }
        if (sql.includes('COUNT(*)')) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(countData) };
        }
        return createMockStatement();
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getTableSchema({ filepath: ':memory:' }, 'users');

      expect(result.triggers).toHaveLength(1);
      expect(result.triggers[0].name).toBe('trg_audit');
    });
  });

  describe('getDatabaseSchema', () => {
    it('should return complete database schema', async () => {
      const mockDb = createMockDatabase();
      const versionData = { version: '3.45.0' };
      const tableRowsData = [
        { name: 'users', type: 'table', sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY)' },
        { name: 'posts', type: 'table', sql: 'CREATE TABLE posts (id INTEGER PRIMARY KEY)' },
      ];
      const viewRowsData = [
        { name: 'active_users', type: 'view', sql: 'CREATE VIEW active_users AS SELECT ...' },
      ];
      const columnsData = [{ cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 }];
      const indexListData: unknown[] = [];
      const fkData: unknown[] = [];
      const triggerData: unknown[] = [];
      const countData = { count: 100 };

      mockDb.pragma = vi.fn().mockImplementation((pragma: string) => {
        if (pragma === 'page_count') return 50;
        if (pragma === 'page_size') return 4096;
        return null;
      });

      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('sqlite_version()')) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(versionData) };
        }
        if (sql.includes("type = 'table'") && sql.includes('sqlite_master')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(tableRowsData) };
        }
        if (sql.includes("type = 'view'")) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(viewRowsData) };
        }
        if (sql.includes('table_info')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(columnsData) };
        }
        if (sql.includes('index_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(indexListData) };
        }
        if (sql.includes('foreign_key_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(fkData) };
        }
        if (sql.includes("type = 'trigger'")) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(triggerData) };
        }
        if (sql.includes('COUNT(*)')) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(countData) };
        }
        return createMockStatement();
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getDatabaseSchema({ filepath: ':memory:' });

      expect(result.version).toBe('3.45.0');
      expect(result.tables).toHaveLength(2);
      expect(result.views).toHaveLength(1);
      expect(result.page_count).toBe(50);
      expect(result.page_size).toBe(4096);
      expect(result.file_size_bytes).toBe(50 * 4096);
    });

    it('should handle empty database', async () => {
      const mockDb = createMockDatabase();
      const versionData = { version: '3.40.0' };

      mockDb.pragma = vi.fn().mockImplementation((pragma: string) => {
        if (pragma === 'page_count') return 1;
        if (pragma === 'page_size') return 4096;
        return null;
      });

      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('sqlite_version()')) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(versionData) };
        }
        return { ...createMockStatement(), all: vi.fn().mockReturnValue([]) };
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getDatabaseSchema({ filepath: ':memory:' });

      expect(result.tables).toHaveLength(0);
      expect(result.views).toHaveLength(0);
      expect(result.version).toBe('3.40.0');
    });

    it('should handle row count errors for virtual tables', async () => {
      const mockDb = createMockDatabase();
      const versionData = { version: '3.45.0' };
      const tableRowsData = [
        { name: 'virtual_table', type: 'table', sql: 'CREATE VIRTUAL TABLE ...' },
      ];
      const columnsData = [{ cid: 0, name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 }];
      const indexListData: unknown[] = [];
      const fkData: unknown[] = [];
      const triggerData: unknown[] = [];

      mockDb.pragma = vi.fn().mockReturnValue(10);

      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('sqlite_version()')) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(versionData) };
        }
        if (sql.includes("type = 'table'") && sql.includes('sqlite_master')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(tableRowsData) };
        }
        if (sql.includes("type = 'view'")) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue([]) };
        }
        if (sql.includes('table_info')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(columnsData) };
        }
        if (sql.includes('index_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(indexListData) };
        }
        if (sql.includes('foreign_key_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(fkData) };
        }
        if (sql.includes("type = 'trigger'")) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(triggerData) };
        }
        if (sql.includes('COUNT(*)')) {
          return {
            ...createMockStatement(),
            get: vi.fn().mockImplementation(() => {
              throw new Error('Cannot query virtual table');
            }),
          };
        }
        return createMockStatement();
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getDatabaseSchema({ filepath: ':memory:' });

      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].row_count).toBeUndefined();
    });

    it('should process multiple tables and views', async () => {
      const mockDb = createMockDatabase();
      const versionData = { version: '3.45.0' };
      const tableRowsData = [
        { name: 'users', type: 'table', sql: 'CREATE TABLE users (...)' },
        { name: 'posts', type: 'table', sql: 'CREATE TABLE posts (...)' },
        { name: 'comments', type: 'table', sql: 'CREATE TABLE comments (...)' },
      ];
      const viewRowsData = [
        { name: 'view1', type: 'view', sql: 'CREATE VIEW view1 AS ...' },
        { name: 'view2', type: 'view', sql: 'CREATE VIEW view2 AS ...' },
      ];
      const columnsData = [{ cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 }];
      const countData = { count: 50 };

      mockDb.pragma = vi.fn().mockReturnValue(100);

      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('sqlite_version()')) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(versionData) };
        }
        if (sql.includes("type = 'table'") && sql.includes('sqlite_master')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(tableRowsData) };
        }
        if (sql.includes("type = 'view'")) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(viewRowsData) };
        }
        if (sql.includes('table_info')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(columnsData) };
        }
        if (sql.includes('index_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue([]) };
        }
        if (sql.includes('foreign_key_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue([]) };
        }
        if (sql.includes("type = 'trigger'")) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue([]) };
        }
        if (sql.includes('COUNT(*)')) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(countData) };
        }
        return createMockStatement();
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getDatabaseSchema({ filepath: ':memory:' });

      expect(result.tables).toHaveLength(3);
      expect(result.views).toHaveLength(2);
      expect(result.tables.map(t => t.name)).toEqual(['users', 'posts', 'comments']);
      expect(result.views.map(v => v.name)).toEqual(['view1', 'view2']);
    });

    it('should process tables with indexes in buildTableSchemaSync', async () => {
      const mockDb = createMockDatabase();
      const versionData = { version: '3.45.0' };
      const tableRowsData = [
        { name: 'users', type: 'table', sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)' },
      ];
      const viewRowsData: unknown[] = [];
      const columnsData = [
        { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
        { cid: 1, name: 'email', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      ];
      const indexListData = [
        { seq: 0, name: 'idx_users_email', unique: 1, origin: 'c', partial: 0 },
        { seq: 1, name: 'idx_users_composite', unique: 0, origin: 'c', partial: 1 },
      ];
      const indexInfoEmail = [{ seqno: 0, cid: 1, name: 'email' }];
      const indexInfoComposite = [
        { seqno: 0, cid: 0, name: 'id' },
        { seqno: 1, cid: 1, name: 'email' },
      ];
      const triggerData: unknown[] = [];
      const countData = { count: 100 };

      mockDb.pragma = vi.fn().mockReturnValue(50);

      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('sqlite_version()')) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(versionData) };
        }
        if (sql.includes("type = 'table'") && sql.includes('sqlite_master')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(tableRowsData) };
        }
        if (sql.includes("type = 'view'")) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(viewRowsData) };
        }
        if (sql.includes('table_info')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(columnsData) };
        }
        if (sql.includes('index_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(indexListData) };
        }
        if (sql.includes('index_info') && sql.includes('idx_users_email')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(indexInfoEmail) };
        }
        if (sql.includes('index_info') && sql.includes('idx_users_composite')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(indexInfoComposite) };
        }
        if (sql.includes('index_info')) {
          // Fallback for any other index_info queries
          return { ...createMockStatement(), all: vi.fn().mockReturnValue([]) };
        }
        if (sql.includes('foreign_key_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue([]) };
        }
        if (sql.includes("type = 'trigger'")) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(triggerData) };
        }
        if (sql.includes('COUNT(*)')) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(countData) };
        }
        return createMockStatement();
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getDatabaseSchema({ filepath: ':memory:' });

      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].indexes).toHaveLength(2);

      // Verify first index (unique, non-partial, single column)
      const emailIndex = result.tables[0].indexes.find(idx => idx.name === 'idx_users_email');
      expect(emailIndex).toBeDefined();
      expect(emailIndex!.unique).toBe(true);
      expect(emailIndex!.partial).toBe(false);
      expect(emailIndex!.origin).toBe('c');
      expect(emailIndex!.columns).toEqual(['email']);

      // Verify second index (non-unique, partial, composite columns)
      const compositeIndex = result.tables[0].indexes.find(idx => idx.name === 'idx_users_composite');
      expect(compositeIndex).toBeDefined();
      expect(compositeIndex!.unique).toBe(false);
      expect(compositeIndex!.partial).toBe(true);
      expect(compositeIndex!.columns).toEqual(['id', 'email']);
    });

    it('should sanitize index names when fetching index info in buildTableSchemaSync', async () => {
      const mockDb = createMockDatabase();
      const versionData = { version: '3.45.0' };
      const tableRowsData = [
        { name: 'test_table', type: 'table', sql: 'CREATE TABLE test_table (id INTEGER)' },
      ];
      const viewRowsData: unknown[] = [];
      const columnsData = [{ cid: 0, name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 }];
      // Index name with characters that need sanitization
      const indexListData = [
        { seq: 0, name: 'idx"with"quotes', unique: 0, origin: 'c', partial: 0 },
      ];
      const indexInfoData = [{ seqno: 0, cid: 0, name: 'id' }];
      const triggerData: unknown[] = [];
      const countData = { count: 10 };

      mockDb.pragma = vi.fn().mockReturnValue(10);

      const preparedStatements: string[] = [];
      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        preparedStatements.push(sql);
        if (sql.includes('sqlite_version()')) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(versionData) };
        }
        if (sql.includes("type = 'table'") && sql.includes('sqlite_master')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(tableRowsData) };
        }
        if (sql.includes("type = 'view'")) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(viewRowsData) };
        }
        if (sql.includes('table_info')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(columnsData) };
        }
        if (sql.includes('index_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(indexListData) };
        }
        if (sql.includes('index_info')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(indexInfoData) };
        }
        if (sql.includes('foreign_key_list')) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue([]) };
        }
        if (sql.includes("type = 'trigger'")) {
          return { ...createMockStatement(), all: vi.fn().mockReturnValue(triggerData) };
        }
        if (sql.includes('COUNT(*)')) {
          return { ...createMockStatement(), get: vi.fn().mockReturnValue(countData) };
        }
        return createMockStatement();
      });

      withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
        return callback(mockDb);
      });

      const result = await getDatabaseSchema({ filepath: ':memory:' });

      // Verify index was processed
      expect(result.tables[0].indexes).toHaveLength(1);
      expect(result.tables[0].indexes[0].name).toBe('idx"with"quotes');
      expect(result.tables[0].indexes[0].columns).toEqual(['id']);

      // Verify the index name was sanitized in the PRAGMA query (quotes removed)
      const indexInfoQuery = preparedStatements.find(s => s.includes('index_info'));
      expect(indexInfoQuery).toBeDefined();
      expect(indexInfoQuery).toBe('PRAGMA index_info("idxwithquotes")');
    });
  });
});

// =============================================================================
// Sanitize Identifier Tests
// =============================================================================

describe('sanitizeIdentifier (via function calls)', () => {
  let withConnection: ReturnType<typeof vi.fn>;
  let getTableColumns: typeof import('../../../handlers/database/sqlite-schema.js').getTableColumns;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const connectionModule = await import('../../../handlers/database/sqlite-connection.js');
    withConnection = connectionModule.withConnection as ReturnType<typeof vi.fn>;

    const schemaModule = await import('../../../handlers/database/sqlite-schema.js');
    getTableColumns = schemaModule.getTableColumns;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should remove double quotes from identifier', async () => {
    const mockDb = createMockDatabase();
    mockDb.prepare = vi.fn().mockReturnValue({
      ...createMockStatement(),
      all: vi.fn().mockReturnValue([]),
    });

    withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
      return callback(mockDb);
    });

    await getTableColumns({ filepath: ':memory:' }, 'table"name');

    expect(mockDb.prepare).toHaveBeenCalledWith('PRAGMA table_info("tablename")');
  });

  it('should remove backslashes from identifier', async () => {
    const mockDb = createMockDatabase();
    mockDb.prepare = vi.fn().mockReturnValue({
      ...createMockStatement(),
      all: vi.fn().mockReturnValue([]),
    });

    withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
      return callback(mockDb);
    });

    await getTableColumns({ filepath: ':memory:' }, 'table\\name');

    expect(mockDb.prepare).toHaveBeenCalledWith('PRAGMA table_info("tablename")');
  });

  it('should handle identifier with multiple dangerous characters', async () => {
    const mockDb = createMockDatabase();
    mockDb.prepare = vi.fn().mockReturnValue({
      ...createMockStatement(),
      all: vi.fn().mockReturnValue([]),
    });

    withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
      return callback(mockDb);
    });

    await getTableColumns({ filepath: ':memory:' }, 'my"table\\with"problems\\');

    expect(mockDb.prepare).toHaveBeenCalledWith('PRAGMA table_info("mytablewithproblems")');
  });

  it('should preserve valid identifier characters', async () => {
    const mockDb = createMockDatabase();
    mockDb.prepare = vi.fn().mockReturnValue({
      ...createMockStatement(),
      all: vi.fn().mockReturnValue([]),
    });

    withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
      return callback(mockDb);
    });

    await getTableColumns({ filepath: ':memory:' }, 'valid_table_name_123');

    expect(mockDb.prepare).toHaveBeenCalledWith('PRAGMA table_info("valid_table_name_123")');
  });

  it('should handle empty identifier', async () => {
    const mockDb = createMockDatabase();
    mockDb.prepare = vi.fn().mockReturnValue({
      ...createMockStatement(),
      all: vi.fn().mockReturnValue([]),
    });

    withConnection.mockImplementation(async (options: unknown, callback: (db: unknown) => unknown) => {
      return callback(mockDb);
    });

    await getTableColumns({ filepath: ':memory:' }, '');

    expect(mockDb.prepare).toHaveBeenCalledWith('PRAGMA table_info("")');
  });
});
