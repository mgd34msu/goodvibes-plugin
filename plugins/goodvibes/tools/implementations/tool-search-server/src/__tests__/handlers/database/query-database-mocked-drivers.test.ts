/**
 * Tests for query-database with mocked database drivers
 *
 * This file tests the PostgreSQL and MySQL execution paths by using
 * the internal mock driver injection mechanism.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { __testing__ } from '../../../handlers/database/query-database.js';

const {
  executePostgresQuery,
  executeMysqlQuery,
  getPostgresTypeName,
  getMysqlTypeName,
  executeQuery,
  setMockDriver,
  clearMockDrivers,
} = __testing__;

// Mock sqlite-connection to prevent issues
vi.mock('../../../handlers/database/sqlite-connection.js', () => ({
  withConnection: vi.fn(),
  getConnectionPool: vi.fn(),
  shutdownConnectionPool: vi.fn(),
}));

describe('PostgreSQL and MySQL type mappers comprehensive coverage', () => {
  describe('getPostgresTypeName comprehensive', () => {
    it('should handle all known PostgreSQL OIDs', () => {
      // Test every single mapping to ensure code coverage
      const expectedMappings: Record<number, string> = {
        16: 'boolean',
        20: 'bigint',
        21: 'smallint',
        23: 'integer',
        25: 'text',
        114: 'json',
        700: 'real',
        701: 'double precision',
        1043: 'varchar',
        1082: 'date',
        1083: 'time',
        1114: 'timestamp',
        1184: 'timestamptz',
        2950: 'uuid',
        3802: 'jsonb',
      };

      for (const [oid, expectedType] of Object.entries(expectedMappings)) {
        expect(getPostgresTypeName(Number(oid))).toBe(expectedType);
      }

      // Test unknown OID
      expect(getPostgresTypeName(99999)).toBe('unknown');
    });
  });

  describe('getMysqlTypeName comprehensive', () => {
    it('should handle all known MySQL type codes', () => {
      const expectedMappings: Record<number, string> = {
        0: 'decimal',
        1: 'tinyint',
        2: 'smallint',
        3: 'int',
        4: 'float',
        5: 'double',
        7: 'timestamp',
        8: 'bigint',
        9: 'mediumint',
        10: 'date',
        11: 'time',
        12: 'datetime',
        13: 'year',
        15: 'varchar',
        16: 'bit',
        245: 'json',
        246: 'decimal',
        252: 'blob',
        253: 'varchar',
        254: 'char',
      };

      for (const [typeCode, expectedType] of Object.entries(expectedMappings)) {
        expect(getMysqlTypeName(Number(typeCode))).toBe(expectedType);
      }

      // Test unknown type code
      expect(getMysqlTypeName(99999)).toBe('unknown');
    });
  });
});

describe('executeQuery with unsupported database type', () => {
  it('should throw for unsupported database type in switch default', async () => {
    // This tests line 897 - the default case of the switch statement
    const connectionInfo = {
      type: 'mongodb' as 'unknown', // Force an unsupported type
      database: 'test',
    };

    await expect(
      executeQuery(connectionInfo, 'SELECT 1')
    ).rejects.toThrow('Unsupported database type: mongodb');
  });

  it('should throw for any non-standard database type', async () => {
    const connectionInfo = {
      type: 'cassandra' as 'unknown',
      database: 'keyspace',
    };

    await expect(
      executeQuery(connectionInfo, 'SELECT * FROM table')
    ).rejects.toThrow('Unsupported database type: cassandra');
  });
});

describe('PostgreSQL execution with mock driver injection', () => {
  afterEach(() => {
    clearMockDrivers();
  });

  it('should execute query and return results with column types', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [{ id: 1, name: 'Test User' }],
      fields: [
        { name: 'id', dataTypeID: 23 },      // integer
        { name: 'name', dataTypeID: 25 },    // text
      ],
    });
    const mockEnd = vi.fn().mockResolvedValue(undefined);

    // Create a mock Pool class
    class MockPool {
      query = mockQuery;
      end = mockEnd;
    }

    // Inject mock pg driver
    setMockDriver('pg', {
      Pool: MockPool,
    });

    const connectionInfo = {
      type: 'postgresql' as const,
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      user: 'user',
      password: 'pass',
    };

    const result = await executePostgresQuery(connectionInfo, 'SELECT * FROM users');

    expect(result.rows).toEqual([{ id: 1, name: 'Test User' }]);
    expect(result.columns).toEqual([
      { name: 'id', type: 'integer' },
      { name: 'name', type: 'text' },
    ]);
    expect(mockEnd).toHaveBeenCalled();
  });

  it('should handle query error and still call pool.end()', async () => {
    const mockQuery = vi.fn().mockRejectedValue(new Error('Connection refused'));
    const mockEnd = vi.fn().mockResolvedValue(undefined);

    class MockPool {
      query = mockQuery;
      end = mockEnd;
    }

    setMockDriver('pg', {
      Pool: MockPool,
    });

    const connectionInfo = {
      type: 'postgresql' as const,
      host: 'localhost',
      port: 5432,
      database: 'testdb',
    };

    await expect(
      executePostgresQuery(connectionInfo, 'SELECT * FROM nonexistent')
    ).rejects.toThrow('Connection refused');

    // Verify finally block was executed
    expect(mockEnd).toHaveBeenCalled();
  });

  it('should handle result with no fields metadata', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [{ count: 5 }],
      // fields is undefined
    });
    const mockEnd = vi.fn().mockResolvedValue(undefined);

    class MockPool {
      query = mockQuery;
      end = mockEnd;
    }

    setMockDriver('pg', {
      Pool: MockPool,
    });

    const connectionInfo = {
      type: 'postgresql' as const,
      host: 'localhost',
      port: 5432,
      database: 'testdb',
    };

    const result = await executePostgresQuery(connectionInfo, 'SELECT COUNT(*)');

    expect(result.rows).toEqual([{ count: 5 }]);
    expect(result.columns).toEqual([]);
    expect(mockEnd).toHaveBeenCalled();
  });

  it('should throw when driver is not available', async () => {
    // Set mock driver to null to simulate driver not installed
    setMockDriver('pg', null);

    const connectionInfo = {
      type: 'postgresql' as const,
      host: 'localhost',
      port: 5432,
      database: 'testdb',
    };

    await expect(
      executePostgresQuery(connectionInfo, 'SELECT 1')
    ).rejects.toThrow('PostgreSQL driver (pg) is not installed');
  });
});

describe('MySQL execution with mock driver injection', () => {
  afterEach(() => {
    clearMockDrivers();
  });

  it('should execute query and return results with column types', async () => {
    const mockConnection = {
      execute: vi.fn().mockResolvedValue([
        [{ id: 1, name: 'Test User' }],
        [
          { name: 'id', type: 3 },      // int
          { name: 'name', type: 253 },  // varchar
        ],
      ]),
      end: vi.fn().mockResolvedValue(undefined),
    };

    setMockDriver('mysql2/promise', {
      createConnection: vi.fn().mockResolvedValue(mockConnection),
    });

    const connectionInfo = {
      type: 'mysql' as const,
      host: 'localhost',
      port: 3306,
      database: 'testdb',
      user: 'user',
      password: 'pass',
    };

    const result = await executeMysqlQuery(connectionInfo, 'SELECT * FROM users');

    expect(result.rows).toEqual([{ id: 1, name: 'Test User' }]);
    expect(result.columns).toEqual([
      { name: 'id', type: 'int' },
      { name: 'name', type: 'varchar' },
    ]);
    expect(mockConnection.end).toHaveBeenCalled();
  });

  it('should handle query error and still call connection.end()', async () => {
    const mockConnection = {
      execute: vi.fn().mockRejectedValue(new Error('Access denied')),
      end: vi.fn().mockResolvedValue(undefined),
    };

    setMockDriver('mysql2/promise', {
      createConnection: vi.fn().mockResolvedValue(mockConnection),
    });

    const connectionInfo = {
      type: 'mysql' as const,
      host: 'localhost',
      port: 3306,
      database: 'testdb',
    };

    await expect(
      executeMysqlQuery(connectionInfo, 'SELECT * FROM users')
    ).rejects.toThrow('Access denied');

    // Verify finally block was executed
    expect(mockConnection.end).toHaveBeenCalled();
  });

  it('should handle result with null fields metadata', async () => {
    const mockConnection = {
      execute: vi.fn().mockResolvedValue([
        [{ result: 1 }],
        null, // No field metadata
      ]),
      end: vi.fn().mockResolvedValue(undefined),
    };

    setMockDriver('mysql2/promise', {
      createConnection: vi.fn().mockResolvedValue(mockConnection),
    });

    const connectionInfo = {
      type: 'mysql' as const,
      host: 'localhost',
      port: 3306,
      database: 'testdb',
    };

    const result = await executeMysqlQuery(connectionInfo, 'SELECT 1');

    expect(result.rows).toEqual([{ result: 1 }]);
    expect(result.columns).toEqual([]);
    expect(mockConnection.end).toHaveBeenCalled();
  });

  it('should handle non-array result (INSERT/UPDATE)', async () => {
    const mockConnection = {
      execute: vi.fn().mockResolvedValue([
        { affectedRows: 1, insertId: 42 }, // Non-array result
        [],
      ]),
      end: vi.fn().mockResolvedValue(undefined),
    };

    setMockDriver('mysql2/promise', {
      createConnection: vi.fn().mockResolvedValue(mockConnection),
    });

    const connectionInfo = {
      type: 'mysql' as const,
      host: 'localhost',
      port: 3306,
      database: 'testdb',
    };

    const result = await executeMysqlQuery(connectionInfo, 'INSERT INTO users (name) VALUES ("test")');

    expect(result.rows).toEqual([]); // Non-array becomes empty array
    expect(mockConnection.end).toHaveBeenCalled();
  });

  it('should throw when driver is not available', async () => {
    // Set mock driver to null to simulate driver not installed
    setMockDriver('mysql2/promise', null);

    const connectionInfo = {
      type: 'mysql' as const,
      host: 'localhost',
      port: 3306,
      database: 'testdb',
    };

    await expect(
      executeMysqlQuery(connectionInfo, 'SELECT 1')
    ).rejects.toThrow('MySQL driver (mysql2) is not installed');
  });
});
