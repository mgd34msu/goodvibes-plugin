import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'mysql2/promise';

// Mock mysql2/promise before importing db module
const mockExecute = vi.fn();
const mockPool = {
  execute: mockExecute,
} as unknown as Pool;

vi.mock('mysql2/promise', () => ({
  default: {
    createPool: vi.fn(() => mockPool),
  },
}));

// Import after mock is set up
const { db } = await import('./db');

describe('db module', () => {
  beforeEach(() => {
    mockExecute.mockClear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('query', () => {
    it('executes a query and returns results', async () => {
      const mockResults = [
        { id: 1, name: 'Test User', email: 'test@example.com' },
        { id: 2, name: 'Another User', email: 'another@example.com' },
      ];
      mockExecute.mockResolvedValue([mockResults, []]);

      const result = await db.query('SELECT * FROM users');

      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(mockExecute).toHaveBeenCalledWith('SELECT * FROM users', undefined);
      expect(result).toEqual(mockResults);
    });

    it('executes a parameterized query', async () => {
      const mockResults = [{ id: 1, name: 'Test User', email: 'test@example.com' }];
      mockExecute.mockResolvedValue([mockResults, []]);

      const result = await db.query('SELECT * FROM users WHERE id = ?', [1]);

      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(mockExecute).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', [1]);
      expect(result).toEqual(mockResults);
    });

    it('executes query with multiple parameters', async () => {
      const mockResults = [{ id: 1, name: 'Test User' }];
      mockExecute.mockResolvedValue([mockResults, []]);

      const result = await db.query(
        'SELECT * FROM users WHERE email = ? AND role = ?',
        ['test@example.com', 'admin']
      );

      expect(mockExecute).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE email = ? AND role = ?',
        ['test@example.com', 'admin']
      );
      expect(result).toEqual(mockResults);
    });

    it('returns empty array when no results found', async () => {
      mockExecute.mockResolvedValue([[], []]);

      const result = await db.query('SELECT * FROM users WHERE id = ?', [999]);

      expect(result).toEqual([]);
    });

    it('handles INSERT queries and returns result', async () => {
      const mockInsertResult = { insertId: 42, affectedRows: 1 };
      mockExecute.mockResolvedValue([mockInsertResult, []]);

      const result = await db.query(
        'INSERT INTO users (name, email, role) VALUES (?, ?, ?)',
        ['New User', 'new@example.com', 'user']
      );

      expect(result).toEqual(mockInsertResult);
    });

    it('handles DELETE queries and returns result', async () => {
      const mockDeleteResult = { affectedRows: 1 };
      mockExecute.mockResolvedValue([mockDeleteResult, []]);

      const result = await db.query('DELETE FROM users WHERE id = ?', [1]);

      expect(result).toEqual(mockDeleteResult);
    });

    it('handles UPDATE queries and returns result', async () => {
      const mockUpdateResult = { affectedRows: 1, changedRows: 1 };
      mockExecute.mockResolvedValue([mockUpdateResult, []]);

      const result = await db.query(
        'UPDATE users SET name = ? WHERE id = ?',
        ['Updated Name', 1]
      );

      expect(result).toEqual(mockUpdateResult);
    });

    it('throws error when query fails', async () => {
      const dbError = new Error('Connection failed');
      mockExecute.mockRejectedValue(dbError);

      await expect(db.query('SELECT * FROM users')).rejects.toThrow('Connection failed');
    });

    it('logs error when query fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const dbError = new Error('Syntax error');
      mockExecute.mockRejectedValue(dbError);

      await expect(db.query('INVALID SQL')).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const loggedArg = consoleErrorSpy.mock.calls[0][0];
      const loggedObj = JSON.parse(loggedArg);
      expect(loggedObj.level).toBe('ERROR');
      expect(loggedObj.message).toBe('Database query error');
      expect(loggedObj.error).toBe('Syntax error');
      consoleErrorSpy.mockRestore();
    });

    it('handles queries with empty parameter array', async () => {
      const mockResults = [{ count: 5 }];
      mockExecute.mockResolvedValue([mockResults, []]);

      const result = await db.query('SELECT COUNT(*) as count FROM users', []);

      expect(mockExecute).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM users', []);
      expect(result).toEqual(mockResults);
    });

    it('handles queries with null values in parameters', async () => {
      const mockResults = [{ id: 1 }];
      mockExecute.mockResolvedValue([mockResults, []]);

      const result = await db.query(
        'SELECT * FROM users WHERE deleted_at IS NULL OR deleted_at = ?',
        [null]
      );

      expect(mockExecute).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE deleted_at IS NULL OR deleted_at = ?',
        [null]
      );
      expect(result).toEqual(mockResults);
    });

    it('preserves type information for typed queries', async () => {
      interface UserRow {
        id: number;
        name: string;
        email: string;
      }

      const mockResults: UserRow[] = [
        { id: 1, name: 'Test', email: 'test@example.com' },
      ];
      mockExecute.mockResolvedValue([mockResults, []]);

      const result = await db.query<UserRow[]>('SELECT * FROM users');

      expect(result).toEqual(mockResults);
      // Type assertion to verify TypeScript inference
      const firstUser: UserRow = result[0];
      expect(firstUser.id).toBe(1);
    });
  });
});
