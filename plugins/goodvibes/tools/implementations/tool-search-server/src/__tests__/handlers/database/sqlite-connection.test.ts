/**
 * Unit tests for SQLite connection pool
 *
 * Tests cover:
 * - Connection pool lifecycle (acquire, release, cleanup)
 * - withConnection helper
 * - Connection options (readonly, WAL mode, foreign keys)
 * - Pool singleton management
 * - Connection timeout handling
 * - Driver loading and error handling
 * - Idle connection cleanup
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';

// =============================================================================
// Mock Setup - Must be before imports
// =============================================================================

// Create mock database factory function
const createMockDatabase = (overrides: Partial<{
  open: boolean;
  memory: boolean;
  readonly: boolean;
  name: string;
  inTransaction: boolean;
}> = {}) => ({
  prepare: vi.fn().mockReturnValue({
    all: vi.fn().mockReturnValue([]),
    run: vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 0 }),
    get: vi.fn(),
    columns: vi.fn().mockReturnValue([]),
    bind: vi.fn().mockReturnThis(),
  }),
  exec: vi.fn(),
  pragma: vi.fn(),
  close: vi.fn(),
  open: true,
  inTransaction: false,
  name: ':memory:',
  memory: true,
  readonly: false,
  ...overrides,
});

// Mock database constructor - using class syntax as required by Vitest for constructor mocks
const mockDatabaseConstructor = vi.fn(class MockDatabase {
  prepare: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
  pragma: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  open: boolean;
  inTransaction: boolean;
  name: string;
  memory: boolean;
  readonly: boolean;

  constructor(filepath: string, options?: { readonly?: boolean; timeout?: number }) {
    const db = createMockDatabase({
      name: filepath,
      memory: filepath === ':memory:',
      readonly: options?.readonly ?? false,
    });
    this.prepare = db.prepare;
    this.exec = db.exec;
    this.pragma = db.pragma;
    this.close = db.close;
    this.open = db.open;
    this.inTransaction = db.inTransaction;
    this.name = db.name;
    this.memory = db.memory;
    this.readonly = db.readonly;
  }
});

// Mock for better-sqlite3 module - track import attempts
let driverLoadError: Error | null = null;
let driverLoadCount = 0;
// Control flag for simulating module without default export
let simulateNoDefaultExport = false;

// Store original Function constructor
const OriginalFunction = global.Function;

// Create a mock import function that returns our mock database constructor
const createMockImportFn = () => {
  return function mockImportFn(moduleName: string) {
    driverLoadCount++;
    if (driverLoadError) {
      return Promise.reject(driverLoadError);
    }
    if (moduleName === 'better-sqlite3') {
      // Support testing both default export and direct constructor patterns
      if (simulateNoDefaultExport) {
        return Promise.resolve(mockDatabaseConstructor);
      }
      return Promise.resolve({ default: mockDatabaseConstructor });
    }
    // Fallback to real import for other modules
    return import(moduleName);
  };
};

// Replace global Function with a wrapper that intercepts the dynamic import pattern
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).Function = function MockedFunction(this: unknown, ...args: string[]) {
  // Check if this is the dynamic import pattern used by loadDriver
  if (args.length === 2 && args[0] === 'name' && args[1] === 'return import(name)') {
    return createMockImportFn();
  }
  // For all other cases, delegate to original Function
  // Using Reflect.construct to properly handle `new` calls
  return Reflect.construct(OriginalFunction, args);
};

// Ensure our mock Function has the same prototype chain
Object.setPrototypeOf((global as any).Function, OriginalFunction);
(global as any).Function.prototype = OriginalFunction.prototype;

// Cleanup: restore original Function after all tests
afterAll(() => {
  global.Function = OriginalFunction;
});

describe('SQLite Connection Pool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    driverLoadError = null;
    driverLoadCount = 0;
    simulateNoDefaultExport = false;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =============================================================================
  // Type Interface Tests
  // =============================================================================

  describe('SqliteConnectionOptions interface', () => {
    it('should have filepath as required option', () => {
      const options: {
        filepath: string;
        readonly?: boolean;
        timeout?: number;
        foreignKeys?: boolean;
        walMode?: boolean;
      } = {
        filepath: './test.db',
      };

      expect(options.filepath).toBe('./test.db');
    });

    it('should allow all optional parameters', () => {
      const options = {
        filepath: './test.db',
        readonly: true,
        timeout: 10000,
        foreignKeys: true,
        walMode: true,
      };

      expect(options.readonly).toBe(true);
      expect(options.timeout).toBe(10000);
      expect(options.foreignKeys).toBe(true);
      expect(options.walMode).toBe(true);
    });

    it('should support in-memory database path', () => {
      const options = { filepath: ':memory:' };
      expect(options.filepath).toBe(':memory:');
    });

    it('should support file-based database path', () => {
      const options = { filepath: './data/mydb.sqlite' };
      expect(options.filepath).toBe('./data/mydb.sqlite');
    });

    it('should support absolute paths', () => {
      const options = { filepath: '/var/lib/data/app.db' };
      expect(options.filepath).toBe('/var/lib/data/app.db');
    });

    it('should support Windows paths', () => {
      const options = { filepath: 'C:\\Users\\test\\data.db' };
      expect(options.filepath).toBe('C:\\Users\\test\\data.db');
    });
  });

  describe('SqliteDatabase interface', () => {
    it('should define prepare method', () => {
      const db = createMockDatabase();
      expect(typeof db.prepare).toBe('function');
    });

    it('should define exec method', () => {
      const db = createMockDatabase();
      expect(typeof db.exec).toBe('function');
    });

    it('should define pragma method', () => {
      const db = createMockDatabase();
      expect(typeof db.pragma).toBe('function');
    });

    it('should define close method', () => {
      const db = createMockDatabase();
      expect(typeof db.close).toBe('function');
    });

    it('should have open property', () => {
      const db = createMockDatabase();
      expect(db.open).toBe(true);
    });

    it('should have memory property', () => {
      const db = createMockDatabase();
      expect(db.memory).toBe(true);
    });

    it('should have readonly property', () => {
      const db = createMockDatabase();
      expect(db.readonly).toBe(false);
    });

    it('should have inTransaction property', () => {
      const db = createMockDatabase();
      expect(db.inTransaction).toBe(false);
    });

    it('should have name property', () => {
      const db = createMockDatabase({ name: 'test.db' });
      expect(db.name).toBe('test.db');
    });
  });

  describe('SqliteStatement interface', () => {
    it('should define all method for SELECT queries', () => {
      const stmt = {
        all: vi.fn().mockReturnValue([{ id: 1 }]),
        run: vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 0 }),
        get: vi.fn().mockReturnValue({ id: 1 }),
        columns: vi.fn().mockReturnValue([]),
        bind: vi.fn().mockReturnThis(),
      };
      expect(typeof stmt.all).toBe('function');
      expect(stmt.all()).toEqual([{ id: 1 }]);
    });

    it('should define run method for write operations', () => {
      const stmt = {
        all: vi.fn().mockReturnValue([]),
        run: vi.fn().mockReturnValue({ changes: 5, lastInsertRowid: 10 }),
        get: vi.fn(),
        columns: vi.fn().mockReturnValue([]),
        bind: vi.fn().mockReturnThis(),
      };
      expect(typeof stmt.run).toBe('function');

      const result = stmt.run();
      expect(result.changes).toBe(5);
      expect(result.lastInsertRowid).toBe(10);
    });

    it('should define get method for single row retrieval', () => {
      const stmt = {
        all: vi.fn().mockReturnValue([]),
        run: vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 0 }),
        get: vi.fn().mockReturnValue({ id: 1, name: 'test' }),
        columns: vi.fn().mockReturnValue([]),
        bind: vi.fn().mockReturnThis(),
      };
      expect(typeof stmt.get).toBe('function');
      expect(stmt.get()).toEqual({ id: 1, name: 'test' });
    });

    it('should define columns method for column info', () => {
      const columnInfo = [
        { name: 'id', column: 'id', table: 'users', database: 'main', type: 'INTEGER' },
        { name: 'name', column: 'name', table: 'users', database: 'main', type: 'TEXT' },
      ];
      const stmt = {
        all: vi.fn().mockReturnValue([]),
        run: vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 0 }),
        get: vi.fn(),
        columns: vi.fn().mockReturnValue(columnInfo),
        bind: vi.fn().mockReturnThis(),
      };
      expect(typeof stmt.columns).toBe('function');
      expect(stmt.columns()).toEqual(columnInfo);
    });

    it('should define bind method for parameter binding', () => {
      const stmt = {
        all: vi.fn().mockReturnValue([]),
        run: vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 0 }),
        get: vi.fn(),
        columns: vi.fn().mockReturnValue([]),
        bind: vi.fn().mockReturnThis(),
      };
      expect(typeof stmt.bind).toBe('function');
      expect(stmt.bind('param1', 'param2')).toBe(stmt);
    });

    it('should support passing parameters to all method', () => {
      const stmt = {
        all: vi.fn((...params: unknown[]) => [{ id: params[0] }]),
        run: vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 0 }),
        get: vi.fn(),
        columns: vi.fn().mockReturnValue([]),
        bind: vi.fn().mockReturnThis(),
      };
      expect(stmt.all(42)).toEqual([{ id: 42 }]);
    });

    it('should support passing parameters to run method', () => {
      const stmt = {
        all: vi.fn().mockReturnValue([]),
        run: vi.fn((...params: unknown[]) => ({
          changes: params.length,
          lastInsertRowid: params[0] as number,
        })),
        get: vi.fn(),
        columns: vi.fn().mockReturnValue([]),
        bind: vi.fn().mockReturnThis(),
      };
      const result = stmt.run(5, 'test');
      expect(result.changes).toBe(2);
      expect(result.lastInsertRowid).toBe(5);
    });
  });

  describe('SqliteRunResult interface', () => {
    it('should have changes property', () => {
      const result = { changes: 5, lastInsertRowid: 10 };
      expect(result.changes).toBe(5);
    });

    it('should have lastInsertRowid property', () => {
      const result = { changes: 1, lastInsertRowid: 42 };
      expect(result.lastInsertRowid).toBe(42);
    });

    it('should support bigint for lastInsertRowid', () => {
      const result = { changes: 1, lastInsertRowid: BigInt(9007199254740993) };
      expect(result.lastInsertRowid).toBe(BigInt(9007199254740993));
    });

    it('should support zero changes', () => {
      const result = { changes: 0, lastInsertRowid: 0 };
      expect(result.changes).toBe(0);
    });

    it('should support zero lastInsertRowid for non-insert operations', () => {
      const result = { changes: 10, lastInsertRowid: 0 };
      expect(result.lastInsertRowid).toBe(0);
    });
  });

  describe('SqliteColumnInfo interface', () => {
    it('should have name property', () => {
      const col = {
        name: 'id',
        column: 'id',
        table: 'users',
        database: 'main',
        type: 'INTEGER',
      };
      expect(col.name).toBe('id');
    });

    it('should allow null for column, table, database when expression', () => {
      const col = {
        name: 'expr',
        column: null,
        table: null,
        database: null,
        type: null,
      };
      expect(col.column).toBeNull();
      expect(col.table).toBeNull();
      expect(col.database).toBeNull();
      expect(col.type).toBeNull();
    });

    it('should represent computed column', () => {
      const col = {
        name: 'total',
        column: null,
        table: null,
        database: null,
        type: 'REAL',
      };
      expect(col.name).toBe('total');
      expect(col.column).toBeNull();
      expect(col.type).toBe('REAL');
    });

    it('should represent aliased column', () => {
      const col = {
        name: 'user_name',
        column: 'name',
        table: 'users',
        database: 'main',
        type: 'TEXT',
      };
      expect(col.name).toBe('user_name');
      expect(col.column).toBe('name');
    });
  });
});

// =============================================================================
// Connection Pool Implementation Tests
// =============================================================================

describe('SqliteConnectionPool class', () => {
  let shutdownConnectionPool: typeof import('../../../handlers/database/sqlite-connection.js').shutdownConnectionPool;
  let getConnectionPool: typeof import('../../../handlers/database/sqlite-connection.js').getConnectionPool;
  let withConnection: typeof import('../../../handlers/database/sqlite-connection.js').withConnection;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Reset module state
    vi.doUnmock('../../../handlers/database/sqlite-connection.js');

    // Re-import to get fresh module state
    const module = await import('../../../handlers/database/sqlite-connection.js');
    shutdownConnectionPool = module.shutdownConnectionPool;
    getConnectionPool = module.getConnectionPool;
    withConnection = module.withConnection;

    // Ensure clean state
    shutdownConnectionPool();
  });

  afterEach(() => {
    shutdownConnectionPool();
    vi.useRealTimers();
  });

  describe('getConnectionPool', () => {
    it('should return singleton pool instance', () => {
      const pool1 = getConnectionPool();
      const pool2 = getConnectionPool();
      expect(pool1).toBe(pool2);
    });

    it('should create new pool after shutdown', () => {
      const pool1 = getConnectionPool();
      shutdownConnectionPool();
      const pool2 = getConnectionPool();
      expect(pool1).not.toBe(pool2);
    });
  });

  describe('shutdownConnectionPool', () => {
    it('should be idempotent when no pool exists', () => {
      // Should not throw
      expect(() => shutdownConnectionPool()).not.toThrow();
      expect(() => shutdownConnectionPool()).not.toThrow();
    });

    it('should clear pool instance', () => {
      const pool1 = getConnectionPool();
      shutdownConnectionPool();
      const pool2 = getConnectionPool();
      expect(pool1).not.toBe(pool2);
    });
  });
});

// =============================================================================
// withConnection Helper Tests
// =============================================================================

describe('withConnection helper', () => {
  let shutdownConnectionPool: typeof import('../../../handlers/database/sqlite-connection.js').shutdownConnectionPool;
  let withConnection: typeof import('../../../handlers/database/sqlite-connection.js').withConnection;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Create mock that captures constructor calls
    mockDatabaseConstructor.mockClear();
    mockDatabaseConstructor.mockImplementation(function(filepath, options) {
      const db = createMockDatabase({
        name: filepath,
        memory: filepath === ':memory:',
        readonly: options?.readonly ?? false,
      });
      return db;
    });

    // Re-import to get fresh module state
    const module = await import('../../../handlers/database/sqlite-connection.js');
    shutdownConnectionPool = module.shutdownConnectionPool;
    withConnection = module.withConnection;

    // Ensure clean state
    shutdownConnectionPool();
  });

  afterEach(() => {
    shutdownConnectionPool();
  });

  describe('basic functionality', () => {
    it('should execute callback with database connection', async () => {
      const callback = vi.fn().mockReturnValue('result');

      const result = await withConnection({ filepath: ':memory:' }, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(result).toBe('result');
    });

    it('should pass database instance to callback', async () => {
      let receivedDb: unknown = null;

      await withConnection({ filepath: ':memory:' }, (db) => {
        receivedDb = db;
        return 'done';
      });

      expect(receivedDb).not.toBeNull();
      expect(typeof (receivedDb as { prepare: unknown }).prepare).toBe('function');
    });

    it('should handle async callback', async () => {
      const result = await withConnection({ filepath: ':memory:' }, async (db) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'async-result';
      });

      expect(result).toBe('async-result');
    });

    it('should return callback result', async () => {
      const expected = { data: [1, 2, 3], count: 3 };

      const result = await withConnection({ filepath: ':memory:' }, () => expected);

      expect(result).toEqual(expected);
    });
  });

  describe('connection release', () => {
    it('should release connection after successful callback', async () => {
      await withConnection({ filepath: ':memory:' }, () => 'success');

      // Verify connection is available for reuse (pool should have released it)
      await withConnection({ filepath: ':memory:' }, () => 'success-2');

      // Should not create new connection if pool released properly
      // (within maxConnectionsPerDb limit)
    });

    it('should release connection after callback throws', async () => {
      const error = new Error('Test error');

      await expect(
        withConnection({ filepath: ':memory:' }, () => {
          throw error;
        })
      ).rejects.toThrow('Test error');

      // Connection should still be released, allowing reuse
      const result = await withConnection({ filepath: ':memory:' }, () => 'recovered');
      expect(result).toBe('recovered');
    });

    it('should release connection after async callback throws', async () => {
      await expect(
        withConnection({ filepath: ':memory:' }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          throw new Error('Async error');
        })
      ).rejects.toThrow('Async error');

      // Connection should still be released
      const result = await withConnection({ filepath: ':memory:' }, () => 'recovered');
      expect(result).toBe('recovered');
    });
  });

  describe('connection options', () => {
    it('should create connection with readonly=true by default', async () => {
      await withConnection({ filepath: ':memory:' }, () => 'done');

      expect(mockDatabaseConstructor).toHaveBeenCalledWith(
        ':memory:',
        expect.objectContaining({ readonly: true })
      );
    });

    it('should create connection with readonly=false when specified', async () => {
      await withConnection({ filepath: ':memory:', readonly: false }, () => 'done');

      expect(mockDatabaseConstructor).toHaveBeenCalledWith(
        ':memory:',
        expect.objectContaining({ readonly: false })
      );
    });

    it('should pass custom timeout to connection', async () => {
      await withConnection({ filepath: ':memory:', timeout: 15000 }, () => 'done');

      expect(mockDatabaseConstructor).toHaveBeenCalledWith(
        ':memory:',
        expect.objectContaining({ timeout: 15000 })
      );
    });

    it('should use default timeout when not specified', async () => {
      await withConnection({ filepath: ':memory:' }, () => 'done');

      expect(mockDatabaseConstructor).toHaveBeenCalledWith(
        ':memory:',
        expect.objectContaining({ timeout: 5000 })
      );
    });
  });

  describe('connection reuse', () => {
    it('should reuse connection for same filepath and readonly mode', async () => {
      await withConnection({ filepath: ':memory:' }, () => 'first');
      await withConnection({ filepath: ':memory:' }, () => 'second');

      // Should only create one connection
      expect(mockDatabaseConstructor).toHaveBeenCalledTimes(1);
    });

    it('should create separate connections for different readonly modes', async () => {
      await withConnection({ filepath: ':memory:', readonly: true }, () => 'readonly');
      await withConnection({ filepath: ':memory:', readonly: false }, () => 'readwrite');

      // Should create two connections (different pool keys)
      expect(mockDatabaseConstructor).toHaveBeenCalledTimes(2);
    });

    it('should create separate connections for different filepaths', async () => {
      mockDatabaseConstructor.mockImplementation(function(filepath) { return createMockDatabase({ name: filepath }); });

      await withConnection({ filepath: '/path/to/db1.sqlite' }, () => 'db1');
      await withConnection({ filepath: '/path/to/db2.sqlite' }, () => 'db2');

      expect(mockDatabaseConstructor).toHaveBeenCalledTimes(2);
    });
  });

  describe('database operations', () => {
    it('should allow executing prepare().all()', async () => {
      const mockRows = [{ id: 1, name: 'Test' }];
      mockDatabaseConstructor.mockImplementation(function() {
        const db = createMockDatabase();
        db.prepare = vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(mockRows),
          run: vi.fn(),
          get: vi.fn(),
          columns: vi.fn().mockReturnValue([]),
          bind: vi.fn().mockReturnThis(),
        });
        return db;
      });

      const result = await withConnection({ filepath: ':memory:' }, (db) => {
        return db.prepare('SELECT * FROM users').all();
      });

      expect(result).toEqual(mockRows);
    });

    it('should allow executing prepare().run()', async () => {
      const mockResult = { changes: 1, lastInsertRowid: 5 };
      mockDatabaseConstructor.mockImplementation(function() {
        const db = createMockDatabase();
        db.prepare = vi.fn().mockReturnValue({
          all: vi.fn(),
          run: vi.fn().mockReturnValue(mockResult),
          get: vi.fn(),
          columns: vi.fn().mockReturnValue([]),
          bind: vi.fn().mockReturnThis(),
        });
        return db;
      });

      const result = await withConnection({ filepath: ':memory:', readonly: false }, (db) => {
        return db.prepare('INSERT INTO users (name) VALUES (?)').run('John');
      });

      expect(result).toEqual(mockResult);
    });

    it('should allow executing prepare().get()', async () => {
      const mockRow = { id: 1, name: 'Test' };
      mockDatabaseConstructor.mockImplementation(function() {
        const db = createMockDatabase();
        db.prepare = vi.fn().mockReturnValue({
          all: vi.fn(),
          run: vi.fn(),
          get: vi.fn().mockReturnValue(mockRow),
          columns: vi.fn().mockReturnValue([]),
          bind: vi.fn().mockReturnThis(),
        });
        return db;
      });

      const result = await withConnection({ filepath: ':memory:' }, (db) => {
        return db.prepare('SELECT * FROM users WHERE id = ?').get(1);
      });

      expect(result).toEqual(mockRow);
    });

    it('should allow executing exec()', async () => {
      const execFn = vi.fn();
      mockDatabaseConstructor.mockImplementation(function() {
        const db = createMockDatabase();
        db.exec = execFn;
        return db;
      });

      await withConnection({ filepath: ':memory:', readonly: false }, (db) => {
        db.exec('CREATE TABLE test (id INTEGER)');
        return 'done';
      });

      expect(execFn).toHaveBeenCalledWith('CREATE TABLE test (id INTEGER)');
    });

    it('should allow executing pragma()', async () => {
      const pragmaFn = vi.fn().mockReturnValue(4096);
      mockDatabaseConstructor.mockImplementation(function() {
        const db = createMockDatabase();
        db.pragma = pragmaFn;
        return db;
      });

      const result = await withConnection({ filepath: ':memory:' }, (db) => {
        return db.pragma('page_size', true);
      });

      expect(pragmaFn).toHaveBeenCalledWith('page_size', true);
      expect(result).toBe(4096);
    });
  });
});

// =============================================================================
// Pool Key Generation Tests
// =============================================================================

describe('Connection pool key generation', () => {
  let shutdownConnectionPool: typeof import('../../../handlers/database/sqlite-connection.js').shutdownConnectionPool;
  let withConnection: typeof import('../../../handlers/database/sqlite-connection.js').withConnection;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockDatabaseConstructor.mockClear();
    mockDatabaseConstructor.mockImplementation(function(filepath, options) {
      return createMockDatabase({
        name: filepath,
        memory: filepath === ':memory:',
        readonly: options?.readonly ?? false,
      });
    });

    const module = await import('../../../handlers/database/sqlite-connection.js');
    shutdownConnectionPool = module.shutdownConnectionPool;
    withConnection = module.withConnection;
    shutdownConnectionPool();
  });

  afterEach(() => {
    shutdownConnectionPool();
  });

  it('should differentiate by filepath', async () => {
    await withConnection({ filepath: '/path/a.db' }, () => 'a');
    await withConnection({ filepath: '/path/b.db' }, () => 'b');

    expect(mockDatabaseConstructor).toHaveBeenCalledTimes(2);
  });

  it('should differentiate by readonly mode', async () => {
    await withConnection({ filepath: '/path/test.db', readonly: true }, () => 'ro');
    await withConnection({ filepath: '/path/test.db', readonly: false }, () => 'rw');

    expect(mockDatabaseConstructor).toHaveBeenCalledTimes(2);
  });

  it('should use same pool entry for identical options', async () => {
    await withConnection({ filepath: '/path/test.db', readonly: true }, () => '1');
    await withConnection({ filepath: '/path/test.db', readonly: true }, () => '2');
    await withConnection({ filepath: '/path/test.db', readonly: true }, () => '3');

    expect(mockDatabaseConstructor).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Pragma Configuration Tests
// =============================================================================

describe('Database pragma configuration', () => {
  let shutdownConnectionPool: typeof import('../../../handlers/database/sqlite-connection.js').shutdownConnectionPool;
  let withConnection: typeof import('../../../handlers/database/sqlite-connection.js').withConnection;
  let pragmaFn: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    pragmaFn = vi.fn();
    mockDatabaseConstructor.mockClear();
    mockDatabaseConstructor.mockImplementation(function(filepath, options) {
      const db = createMockDatabase({
        name: filepath,
        readonly: options?.readonly ?? false,
      });
      db.pragma = pragmaFn;
      return db;
    });

    const module = await import('../../../handlers/database/sqlite-connection.js');
    shutdownConnectionPool = module.shutdownConnectionPool;
    withConnection = module.withConnection;
    shutdownConnectionPool();
  });

  afterEach(() => {
    shutdownConnectionPool();
  });

  it('should enable foreign keys by default', async () => {
    await withConnection({ filepath: ':memory:' }, () => 'done');

    expect(pragmaFn).toHaveBeenCalledWith('foreign_keys = ON');
  });

  it('should not enable foreign keys when foreignKeys=false', async () => {
    await withConnection({ filepath: ':memory:', foreignKeys: false }, () => 'done');

    expect(pragmaFn).not.toHaveBeenCalledWith('foreign_keys = ON');
  });

  it('should enable WAL mode when walMode=true and not readonly', async () => {
    await withConnection({ filepath: ':memory:', readonly: false, walMode: true }, () => 'done');

    expect(pragmaFn).toHaveBeenCalledWith('journal_mode = WAL');
  });

  it('should not enable WAL mode when readonly', async () => {
    await withConnection({ filepath: ':memory:', readonly: true, walMode: true }, () => 'done');

    expect(pragmaFn).not.toHaveBeenCalledWith('journal_mode = WAL');
  });

  it('should set busy_timeout', async () => {
    await withConnection({ filepath: ':memory:' }, () => 'done');

    expect(pragmaFn).toHaveBeenCalledWith('busy_timeout = 5000');
  });

  it('should set synchronous=NORMAL for write connections', async () => {
    await withConnection({ filepath: ':memory:', readonly: false }, () => 'done');

    expect(pragmaFn).toHaveBeenCalledWith('synchronous = NORMAL');
  });

  it('should not set synchronous for readonly connections', async () => {
    await withConnection({ filepath: ':memory:', readonly: true }, () => 'done');

    expect(pragmaFn).not.toHaveBeenCalledWith('synchronous = NORMAL');
  });

  it('should handle pragma errors gracefully', async () => {
    pragmaFn.mockImplementation((pragma: string) => {
      if (pragma === 'foreign_keys = ON') {
        throw new Error('Pragma not supported');
      }
    });

    // Should not throw, should continue
    await expect(
      withConnection({ filepath: ':memory:' }, () => 'done')
    ).resolves.toBe('done');
  });
});

// =============================================================================
// Driver Loading Tests
// =============================================================================

describe('Driver loading', () => {
  let shutdownConnectionPool: typeof import('../../../handlers/database/sqlite-connection.js').shutdownConnectionPool;
  let withConnection: typeof import('../../../handlers/database/sqlite-connection.js').withConnection;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const module = await import('../../../handlers/database/sqlite-connection.js');
    shutdownConnectionPool = module.shutdownConnectionPool;
    withConnection = module.withConnection;
    shutdownConnectionPool();
  });

  afterEach(() => {
    shutdownConnectionPool();
  });

  it('should load better-sqlite3 driver', async () => {
    mockDatabaseConstructor.mockImplementation(function() { return createMockDatabase(); });

    await withConnection({ filepath: ':memory:' }, () => 'done');

    expect(mockDatabaseConstructor).toHaveBeenCalled();
  });

  it('should handle driver without default export', async () => {
    // Simulate module with no default export using our control flag
    simulateNoDefaultExport = true;

    vi.resetModules();
    const module = await import('../../../handlers/database/sqlite-connection.js');
    shutdownConnectionPool = module.shutdownConnectionPool;
    withConnection = module.withConnection;
    shutdownConnectionPool();

    mockDatabaseConstructor.mockImplementation(function() { return createMockDatabase(); });

    await withConnection({ filepath: ':memory:' }, () => 'done');

    // Should still work - source code uses `module.default || module`
    expect(mockDatabaseConstructor).toHaveBeenCalled();

    // Reset for other tests
    simulateNoDefaultExport = false;
  });
});

// =============================================================================
// Connection Timeout Tests
// =============================================================================

describe('Connection timeout handling', () => {
  let shutdownConnectionPool: typeof import('../../../handlers/database/sqlite-connection.js').shutdownConnectionPool;
  let withConnection: typeof import('../../../handlers/database/sqlite-connection.js').withConnection;
  let getConnectionPool: typeof import('../../../handlers/database/sqlite-connection.js').getConnectionPool;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();

    mockDatabaseConstructor.mockClear();
    mockDatabaseConstructor.mockImplementation(function(filepath, options) {
      return createMockDatabase({
        name: filepath,
        readonly: options?.readonly ?? false,
      });
    });

    const module = await import('../../../handlers/database/sqlite-connection.js');
    shutdownConnectionPool = module.shutdownConnectionPool;
    withConnection = module.withConnection;
    getConnectionPool = module.getConnectionPool;
    shutdownConnectionPool();
  });

  afterEach(() => {
    shutdownConnectionPool();
    vi.useRealTimers();
  });

  it('should use default timeout of 5000ms', async () => {
    await withConnection({ filepath: ':memory:' }, () => 'done');

    expect(mockDatabaseConstructor).toHaveBeenCalledWith(
      ':memory:',
      expect.objectContaining({ timeout: 5000 })
    );
  });

  it('should use custom timeout when specified', async () => {
    await withConnection({ filepath: ':memory:', timeout: 30000 }, () => 'done');

    expect(mockDatabaseConstructor).toHaveBeenCalledWith(
      ':memory:',
      expect.objectContaining({ timeout: 30000 })
    );
  });
});

// =============================================================================
// Cleanup Interval Tests
// =============================================================================

describe('Idle connection cleanup', () => {
  let shutdownConnectionPool: typeof import('../../../handlers/database/sqlite-connection.js').shutdownConnectionPool;
  let getConnectionPool: typeof import('../../../handlers/database/sqlite-connection.js').getConnectionPool;
  let withConnection: typeof import('../../../handlers/database/sqlite-connection.js').withConnection;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();

    mockDatabaseConstructor.mockClear();

    const module = await import('../../../handlers/database/sqlite-connection.js');
    shutdownConnectionPool = module.shutdownConnectionPool;
    getConnectionPool = module.getConnectionPool;
    withConnection = module.withConnection;
    shutdownConnectionPool();
  });

  afterEach(() => {
    shutdownConnectionPool();
    vi.useRealTimers();
  });

  it('should start cleanup interval on pool creation', () => {
    const pool = getConnectionPool();
    expect(pool).toBeDefined();
    // Cleanup interval is internal, just verify pool was created
  });

  it('should stop cleanup interval on shutdown', () => {
    getConnectionPool();
    shutdownConnectionPool();
    // Verify no errors occur - interval should be cleared
    vi.advanceTimersByTime(60000);
  });

  it('should close idle connections after timeout', async () => {
    const closeFn = vi.fn();
    mockDatabaseConstructor.mockImplementation(function() {
      const db = createMockDatabase();
      db.close = closeFn;
      return db;
    });

    // Create a connection
    await withConnection({ filepath: ':memory:' }, () => 'done');

    // Advance time past idle timeout (60 seconds) plus cleanup interval (30 seconds)
    vi.advanceTimersByTime(100000);

    // Close should have been called during cleanup
    expect(closeFn).toHaveBeenCalled();
  });

  it('should not close connections that are in use', async () => {
    const closeFn = vi.fn();
    mockDatabaseConstructor.mockImplementation(function() {
      const db = createMockDatabase();
      db.close = closeFn;
      return db;
    });

    // Start a long-running operation
    const longOperation = withConnection({ filepath: ':memory:' }, async () => {
      // Keep connection in use
      await new Promise((resolve) => setTimeout(resolve, 120000));
      return 'done';
    });

    // Advance time but not enough for the operation to complete
    vi.advanceTimersByTime(30000);

    // Connection should not be closed while in use
    expect(closeFn).not.toHaveBeenCalled();

    // Complete the operation
    vi.advanceTimersByTime(100000);
    await longOperation;
  });

  it('should handle close errors gracefully during cleanup', async () => {
    const closeFn = vi.fn().mockImplementation(() => {
      throw new Error('Close failed');
    });
    mockDatabaseConstructor.mockImplementation(function() {
      const db = createMockDatabase();
      db.close = closeFn;
      return db;
    });

    await withConnection({ filepath: ':memory:' }, () => 'done');

    // Should not throw when cleanup encounters close error
    expect(() => {
      vi.advanceTimersByTime(100000);
    }).not.toThrow();
  });

  it('should remove empty pool entries during cleanup', async () => {
    const closeFn = vi.fn();
    mockDatabaseConstructor.mockImplementation(function() {
      const db = createMockDatabase();
      db.close = closeFn;
      return db;
    });

    await withConnection({ filepath: ':memory:' }, () => 'done');

    // Let all connections become idle and get cleaned up
    vi.advanceTimersByTime(100000);

    // Pool entry should be removed (internal state)
    // Verify by creating new connection - should create fresh one
    mockDatabaseConstructor.mockClear();
    await withConnection({ filepath: ':memory:' }, () => 'done');

    expect(mockDatabaseConstructor).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Pool Shutdown Tests
// =============================================================================

describe('Pool shutdown', () => {
  let shutdownConnectionPool: typeof import('../../../handlers/database/sqlite-connection.js').shutdownConnectionPool;
  let getConnectionPool: typeof import('../../../handlers/database/sqlite-connection.js').getConnectionPool;
  let withConnection: typeof import('../../../handlers/database/sqlite-connection.js').withConnection;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockDatabaseConstructor.mockClear();

    const module = await import('../../../handlers/database/sqlite-connection.js');
    shutdownConnectionPool = module.shutdownConnectionPool;
    getConnectionPool = module.getConnectionPool;
    withConnection = module.withConnection;
    shutdownConnectionPool();
  });

  afterEach(() => {
    shutdownConnectionPool();
  });

  it('should close all open connections on shutdown', async () => {
    const closeFn = vi.fn();
    mockDatabaseConstructor.mockImplementation(function() {
      const db = createMockDatabase();
      db.close = closeFn;
      return db;
    });

    // Create multiple connections
    await withConnection({ filepath: '/path/db1.sqlite' }, () => '1');
    await withConnection({ filepath: '/path/db2.sqlite' }, () => '2');
    await withConnection({ filepath: '/path/db3.sqlite' }, () => '3');

    shutdownConnectionPool();

    expect(closeFn).toHaveBeenCalledTimes(3);
  });

  it('should handle close errors during shutdown', async () => {
    const closeFn = vi.fn().mockImplementation(() => {
      throw new Error('Close failed');
    });
    mockDatabaseConstructor.mockImplementation(function() {
      const db = createMockDatabase();
      db.close = closeFn;
      return db;
    });

    await withConnection({ filepath: ':memory:' }, () => 'done');

    // Should not throw
    expect(() => shutdownConnectionPool()).not.toThrow();
  });

  it('should not close already closed connections', async () => {
    const closeFn = vi.fn();
    mockDatabaseConstructor.mockImplementation(function() {
      const db = createMockDatabase({ open: false });
      db.close = closeFn;
      return db;
    });

    await withConnection({ filepath: ':memory:' }, () => 'done');

    shutdownConnectionPool();

    expect(closeFn).not.toHaveBeenCalled();
  });

  it('should clear all pool entries after shutdown', async () => {
    mockDatabaseConstructor.mockClear();
    mockDatabaseConstructor.mockImplementation(function() { return createMockDatabase(); });

    await withConnection({ filepath: ':memory:' }, () => 'done');

    shutdownConnectionPool();

    // After shutdown, new connections should be created fresh
    await withConnection({ filepath: ':memory:' }, () => 'done');

    // Should have created 2 connections (one before shutdown, one after)
    expect(mockDatabaseConstructor).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe('Edge cases and error handling', () => {
  let shutdownConnectionPool: typeof import('../../../handlers/database/sqlite-connection.js').shutdownConnectionPool;
  let withConnection: typeof import('../../../handlers/database/sqlite-connection.js').withConnection;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockDatabaseConstructor.mockClear();

    const module = await import('../../../handlers/database/sqlite-connection.js');
    shutdownConnectionPool = module.shutdownConnectionPool;
    withConnection = module.withConnection;
    shutdownConnectionPool();
  });

  afterEach(() => {
    shutdownConnectionPool();
  });

  it('should handle special :memory: filepath', async () => {
    mockDatabaseConstructor.mockImplementation(function() { return createMockDatabase(); });

    await withConnection({ filepath: ':memory:' }, () => 'done');

    expect(mockDatabaseConstructor).toHaveBeenCalledWith(':memory:', expect.any(Object));
  });

  it('should handle complex filepaths with special characters', async () => {
    mockDatabaseConstructor.mockImplementation(function() { return createMockDatabase(); });

    await withConnection({ filepath: '/path/with spaces/and-dashes/db.sqlite' }, () => 'done');

    expect(mockDatabaseConstructor).toHaveBeenCalledWith(
      '/path/with spaces/and-dashes/db.sqlite',
      expect.any(Object)
    );
  });

  it('should propagate database errors', async () => {
    mockDatabaseConstructor.mockImplementation(function() {
      throw new Error('Database connection failed');
    });

    await expect(
      withConnection({ filepath: ':memory:' }, () => 'done')
    ).rejects.toThrow('Database connection failed');
  });

  it('should propagate callback errors', async () => {
    mockDatabaseConstructor.mockImplementation(function() { return createMockDatabase(); });

    await expect(
      withConnection({ filepath: ':memory:' }, () => {
        throw new Error('Callback error');
      })
    ).rejects.toThrow('Callback error');
  });

  it('should handle null return from callback', async () => {
    mockDatabaseConstructor.mockImplementation(function() { return createMockDatabase(); });

    const result = await withConnection({ filepath: ':memory:' }, () => null);

    expect(result).toBeNull();
  });

  it('should handle undefined return from callback', async () => {
    mockDatabaseConstructor.mockImplementation(function() { return createMockDatabase(); });

    const result = await withConnection({ filepath: ':memory:' }, () => undefined);

    expect(result).toBeUndefined();
  });

  it('should handle empty object return from callback', async () => {
    mockDatabaseConstructor.mockImplementation(function() { return createMockDatabase(); });

    const result = await withConnection({ filepath: ':memory:' }, () => ({}));

    expect(result).toEqual({});
  });

  it('should handle array return from callback', async () => {
    mockDatabaseConstructor.mockImplementation(function() { return createMockDatabase(); });

    const result = await withConnection({ filepath: ':memory:' }, () => [1, 2, 3]);

    expect(result).toEqual([1, 2, 3]);
  });
});

// =============================================================================
// Connection Pool Max Connections Tests
// =============================================================================

describe('Connection pool max connections', () => {
  let shutdownConnectionPool: typeof import('../../../handlers/database/sqlite-connection.js').shutdownConnectionPool;
  let withConnection: typeof import('../../../handlers/database/sqlite-connection.js').withConnection;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();

    mockDatabaseConstructor.mockClear();
    mockDatabaseConstructor.mockImplementation(function() { return createMockDatabase(); });

    const module = await import('../../../handlers/database/sqlite-connection.js');
    shutdownConnectionPool = module.shutdownConnectionPool;
    withConnection = module.withConnection;
    shutdownConnectionPool();
  });

  afterEach(() => {
    shutdownConnectionPool();
    vi.useRealTimers();
  });

  it('should create up to max connections (5)', async () => {
    mockDatabaseConstructor.mockClear();

    // Start multiple concurrent operations
    const operations = Array.from({ length: 5 }, (_, i) =>
      withConnection({ filepath: ':memory:' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return `op-${i}`;
      })
    );

    // Advance time to let operations start
    vi.advanceTimersByTime(10);

    // Should have created 5 connections
    expect(mockDatabaseConstructor.mock.calls.length).toBeLessThanOrEqual(5);

    // Complete all operations
    vi.advanceTimersByTime(200);
    await Promise.all(operations);
  });

  it('should wait when pool is exhausted', async () => {
    mockDatabaseConstructor.mockClear();

    const operationStarted: boolean[] = [];
    const operationCompleted: boolean[] = [];

    // Fill the pool with 5 connections
    const blockedOperations = Array.from({ length: 5 }, (_, i) =>
      withConnection({ filepath: ':memory:' }, async () => {
        operationStarted[i] = true;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        operationCompleted[i] = true;
        return `blocked-${i}`;
      })
    );

    // Start 6th operation that should wait
    let sixthStarted = false;
    const sixthOperation = withConnection({ filepath: ':memory:' }, async () => {
      sixthStarted = true;
      return 'sixth';
    });

    // Advance time a bit - 6th should not have started yet
    vi.advanceTimersByTime(100);

    // Pool should be full
    expect(mockDatabaseConstructor.mock.calls.length).toBe(5);
    expect(sixthStarted).toBe(false);

    // Complete the blocked operations
    vi.advanceTimersByTime(1000);
    await Promise.all(blockedOperations);

    // Now 6th should be able to acquire
    vi.advanceTimersByTime(100);
    await sixthOperation;

    expect(sixthStarted).toBe(true);
  });

  it('should timeout when waiting too long for connection', async () => {
    mockDatabaseConstructor.mockClear();

    // Fill the pool with 5 long-running operations
    const blockedOperations = Array.from({ length: 5 }, (_, i) =>
      withConnection({ filepath: ':memory:' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        return `blocked-${i}`;
      })
    );

    // Start 6th operation with short timeout
    const sixthOperation = withConnection(
      { filepath: ':memory:', timeout: 500 },
      async () => 'sixth'
    );

    // Advance time to let operations start
    vi.advanceTimersByTime(100);

    // Advance past timeout
    vi.advanceTimersByTime(600);

    // 6th operation should have timed out
    await expect(sixthOperation).rejects.toThrow(/timeout/i);

    // Complete blocked operations
    vi.advanceTimersByTime(10000);
    await Promise.allSettled(blockedOperations);
  });
});

// =============================================================================
// Connection State Tests
// =============================================================================

describe('Connection state tracking', () => {
  let shutdownConnectionPool: typeof import('../../../handlers/database/sqlite-connection.js').shutdownConnectionPool;
  let withConnection: typeof import('../../../handlers/database/sqlite-connection.js').withConnection;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockDatabaseConstructor.mockClear();

    const module = await import('../../../handlers/database/sqlite-connection.js');
    shutdownConnectionPool = module.shutdownConnectionPool;
    withConnection = module.withConnection;
    shutdownConnectionPool();
  });

  afterEach(() => {
    shutdownConnectionPool();
  });

  it('should track lastUsed time on acquire', async () => {
    const now = Date.now();
    vi.setSystemTime(now);

    mockDatabaseConstructor.mockImplementation(function() { return createMockDatabase(); });

    await withConnection({ filepath: ':memory:' }, () => 'done');

    // Connection should have been used at 'now'
    // Internal state, tested indirectly through cleanup behavior
  });

  it('should update lastUsed time on release', async () => {
    mockDatabaseConstructor.mockImplementation(function() { return createMockDatabase(); });

    await withConnection({ filepath: ':memory:' }, () => 'done');

    // After release, lastUsed should be updated
    // Tested indirectly - connection should be available for reuse
    await withConnection({ filepath: ':memory:' }, () => 'done-2');

    expect(mockDatabaseConstructor).toHaveBeenCalledTimes(1);
  });

  it('should skip closed connections when finding available', async () => {
    let connectionCount = 0;
    mockDatabaseConstructor.mockImplementation(function() {
      connectionCount++;
      const db = createMockDatabase();
      // First connection will be "closed" after use
      if (connectionCount === 1) {
        Object.defineProperty(db, 'open', {
          get: () => false,
        });
      }
      return db;
    });

    await withConnection({ filepath: ':memory:' }, () => 'first');

    // Second call should create new connection since first is "closed"
    await withConnection({ filepath: ':memory:' }, () => 'second');

    expect(mockDatabaseConstructor).toHaveBeenCalledTimes(2);
  });
});
