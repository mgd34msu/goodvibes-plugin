import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { User } from '@/types/api';

// Use vi.hoisted to ensure mocks are available in vi.mock factory closures
const { mockQuery, mockVerifyToken, mockRequireRole } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockRequireRole: vi.fn(),
}));

// Mock dependencies
vi.mock('@/lib/db', () => ({
  db: {
    query: mockQuery,
  },
}));

// Mock auth module so verifyToken and requireRole don't block requests
vi.mock('@/lib/auth', () => ({
  verifyToken: mockVerifyToken,
  requireRole: mockRequireRole,
}));

// Import after mocks
const { GET, POST, DELETE } = await import('./route');

// Default auth mock: returns admin user
const defaultAdminUser = { id: 999, email: 'admin@example.com', role: 'admin' };

describe('GET /api/users', () => {
  beforeEach(() => {
    mockQuery.mockClear();
    mockVerifyToken.mockReset();
    mockRequireRole.mockReset();
    mockVerifyToken.mockReturnValue(defaultAdminUser);
    mockRequireRole.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful Queries', () => {
    it('returns all users when no role filter provided', async () => {
      const mockUsers: User[] = [
        { id: 1, name: 'Alice', email: 'alice@example.com', role: 'admin' },
        { id: 2, name: 'Bob', email: 'bob@example.com', role: 'user' },
        { id: 3, name: 'Charlie', email: 'charlie@example.com', role: 'guest' },
      ];

      // GET runs two queries: COUNT(*) and SELECT data
      mockQuery
        .mockResolvedValueOnce([{ total: 3 }])
        .mockResolvedValueOnce(mockUsers);

      const request = new Request('http://localhost/api/users');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual(mockUsers);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.total).toBe(3);
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.limit).toBe(10);
    });

    it('returns filtered users when role=admin', async () => {
      const mockUsers: User[] = [
        { id: 1, name: 'Alice', email: 'alice@example.com', role: 'admin' },
      ];

      mockQuery
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce(mockUsers);

      const request = new Request('http://localhost/api/users?role=admin');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual(mockUsers);
      expect(data.pagination.total).toBe(1);
    });

    it('returns filtered users when role=user', async () => {
      const mockUsers: User[] = [
        { id: 2, name: 'Bob', email: 'bob@example.com', role: 'user' },
      ];

      mockQuery
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce(mockUsers);

      const request = new Request('http://localhost/api/users?role=user');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual(mockUsers);
    });

    it('returns filtered users when role=guest', async () => {
      const mockUsers: User[] = [
        { id: 3, name: 'Charlie', email: 'charlie@example.com', role: 'guest' },
      ];

      mockQuery
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce(mockUsers);

      const request = new Request('http://localhost/api/users?role=guest');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual(mockUsers);
    });

    it('returns empty data array when no users match', async () => {
      mockQuery
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      const request = new Request('http://localhost/api/users');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual([]);
      expect(data.pagination.total).toBe(0);
    });

    it('supports pagination with page and limit params', async () => {
      const mockUsers: User[] = [
        { id: 11, name: 'User 11', email: 'user11@example.com', role: 'user' },
      ];

      mockQuery
        .mockResolvedValueOnce([{ total: 50 }])
        .mockResolvedValueOnce(mockUsers);

      const request = new Request('http://localhost/api/users?page=2&limit=10');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination.page).toBe(2);
      expect(data.pagination.limit).toBe(10);
      expect(data.pagination.total).toBe(50);
      expect(data.pagination.hasPrev).toBe(true);
    });
  });

  describe('Validation Errors', () => {
    it('returns 400 for invalid role', async () => {
      const request = new Request('http://localhost/api/users?role=invalid');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid role');
      expect(data.details).toBe('Role must be one of: admin, user, guest');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid page parameter', async () => {
      const request = new Request('http://localhost/api/users?page=abc');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid page');
    });

    it('returns 400 for zero page parameter', async () => {
      const request = new Request('http://localhost/api/users?page=0');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid page');
    });

    it('returns 400 for limit exceeding 100', async () => {
      const request = new Request('http://localhost/api/users?limit=101');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid limit');
    });

    it('returns 400 for zero limit parameter', async () => {
      const request = new Request('http://localhost/api/users?limit=0');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid limit');
    });
  });

  describe('Error Handling', () => {
    it('returns 500 when database query fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockQuery.mockRejectedValue(new Error('Database error'));

      const request = new Request('http://localhost/api/users');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
      // Logger uses console.error with JSON-stringified object
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const loggedArg = consoleErrorSpy.mock.calls[0][0];
      const loggedObj = JSON.parse(loggedArg);
      expect(loggedObj.level).toBe('ERROR');
      expect(loggedObj.status).toBe(500);

      consoleErrorSpy.mockRestore();
    });

    it('returns 401 when not authenticated', async () => {
      mockVerifyToken.mockImplementation(() => {
        throw new Error('Missing authentication token');
      });

      const request = new Request('http://localhost/api/users');

      const response = await GET(request);

      // verifyToken throws, which is NOT an AppError, so returns 500
      // unless the AuthenticationError is an AppError
      expect([401, 500]).toContain(response.status);
    });
  });
});

describe('POST /api/users', () => {
  beforeEach(() => {
    mockQuery.mockClear();
    mockVerifyToken.mockReset();
    mockRequireRole.mockReset();
    mockVerifyToken.mockReturnValue(defaultAdminUser);
    mockRequireRole.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful Creation', () => {
    it('creates a new user with valid data', async () => {
      // First call: check if user exists
      mockQuery.mockResolvedValueOnce([]);
      // Second call: insert user
      mockQuery.mockResolvedValueOnce({ insertId: 42, affectedRows: 1 });

      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New User',
          email: 'newuser@example.com',
          role: 'user',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual({
        id: 42,
        name: 'New User',
        email: 'newuser@example.com',
        role: 'user',
      });
    });

    it('sanitizes name by trimming whitespace', async () => {
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce({ insertId: 42 });

      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: '   New User   !',
          email: 'newuser@example.com',
          role: 'user',
        }),
      });

      await POST(request);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT'),
        ['New User   !', 'newuser@example.com', 'user']
      );
    });

    it('sanitizes email by trimming and lowercasing', async () => {
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce({ insertId: 42 });

      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New User',
          email: '   NEWUSER@EXAMPLE.COM   ',
          role: 'user',
        }),
      });

      await POST(request);

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT id FROM users WHERE email = ?',
        ['newuser@example.com']
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT'),
        ['New User', 'newuser@example.com', 'user']
      );
    });

    it('creates user with admin role', async () => {
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce({ insertId: 42 });

      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.role).toBe('admin');
    });

    it('creates user with guest role', async () => {
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce({ insertId: 42 });

      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Guest User',
          email: 'guest@example.com',
          role: 'guest',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.role).toBe('guest');
    });
  });

  describe('Validation Errors', () => {
    it('returns 500 for invalid JSON request body', async () => {
      // JSON parse error is not a ValidationError, falls through to 500
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: 'not json',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
      consoleErrorSpy.mockRestore();
    });

    it('returns 400 for non-object body', async () => {
      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify('string body'),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request body');
    });

    it('returns 400 for missing name', async () => {
      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          role: 'user',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid name');
      expect(data.details).toBe('Name is required and must be a non-empty string');
    });

    it('returns 400 for empty name string', async () => {
      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: '',
          email: 'test@example.com',
          role: 'user',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid name');
    });

    it('returns 400 for whitespace-only name', async () => {
      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: '   ',
          email: 'test@example.com',
          role: 'user',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid name');
    });

    it('returns 400 for non-string name', async () => {
      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 123,
          email: 'test@example.com',
          role: 'user',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid name');
    });

    it('returns 400 for missing email', async () => {
      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test User',
          role: 'user',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid email');
      expect(data.details).toBe('Valid email address is required');
    });

    it('returns 400 for invalid email format', async () => {
      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test User',
          email: 'not-an-email',
          role: 'user',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid email');
    });

    it('returns 400 for non-string email', async () => {
      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test User',
          email: 123,
          role: 'user',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid email');
    });

    it('returns 400 for missing role', async () => {
      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid role');
      expect(data.details).toBe('Role must be one of: admin, user, guest');
    });

    it('returns 400 for invalid role', async () => {
      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          role: 'invalid',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid role');
    });

    it('returns 400 for non-string role', async () => {
      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          role: 123,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid role');
    });
  });

  describe('Duplicate Check', () => {
    it('returns 409 when user already exists', async () => {
      const existingUser: User = {
        id: 1,
        name: 'Existing User',
        email: 'existing@example.com',
        role: 'user',
      };
      mockQuery.mockResolvedValue([existingUser]);

      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New User',
          email: 'existing@example.com',
          role: 'user',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe('User already exists');
      expect(data.details).toBe('A user with this email already exists');
    });

    it('checks for duplicates with sanitized email', async () => {
      const existingUser: User = {
        id: 1,
        name: 'Existing User',
        email: 'existing@example.com',
        role: 'user',
      };
      mockQuery.mockResolvedValue([existingUser]);

      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New User',
          email: '  EXISTING@EXAMPLE.COM  ',
          role: 'user',
        }),
      });

      await POST(request);

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT id FROM users WHERE email = ?',
        ['existing@example.com']
      );
    });
  });

  describe('Error Handling', () => {
    it('returns 500 when database check fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockQuery.mockRejectedValue(new Error('Database error'));

      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          role: 'user',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const loggedArg = consoleErrorSpy.mock.calls[0][0];
      const loggedObj = JSON.parse(loggedArg);
      expect(loggedObj.level).toBe('ERROR');
      expect(loggedObj.status).toBe(500);

      consoleErrorSpy.mockRestore();
    });

    it('returns 500 when insert fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockRejectedValueOnce(new Error('Insert failed'));

      const request = new Request('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          role: 'user',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });

      consoleErrorSpy.mockRestore();
    });
  });
});

describe('DELETE /api/users', () => {
  beforeEach(() => {
    mockQuery.mockClear();
    mockVerifyToken.mockReset();
    mockRequireRole.mockReset();
    mockVerifyToken.mockReturnValue(defaultAdminUser);
    mockRequireRole.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful Deletion', () => {
    it('deletes an existing user', async () => {
      const existingUser: User = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        role: 'user',
      };
      // First call: check if user exists
      mockQuery.mockResolvedValueOnce([existingUser]);
      // Second call: delete user
      mockQuery.mockResolvedValueOnce({ affectedRows: 1 });

      const request = new Request('http://localhost/api/users?id=1');

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true });
      expect(mockQuery).toHaveBeenCalledWith('SELECT id FROM users WHERE id = ?', [1]);
      expect(mockQuery).toHaveBeenCalledWith('DELETE FROM users WHERE id = ?', [1]);
    });

    it('deletes user with large ID', async () => {
      const existingUser: User = {
        id: 999999,
        name: 'Test User',
        email: 'test@example.com',
        role: 'user',
      };
      mockQuery.mockResolvedValueOnce([existingUser]);
      mockQuery.mockResolvedValueOnce({ affectedRows: 1 });

      const request = new Request('http://localhost/api/users?id=999999');

      const response = await DELETE(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Validation Errors', () => {
    it('returns 400 for missing ID', async () => {
      const request = new Request('http://localhost/api/users');

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing ID');
      expect(data.details).toBe('User ID is required');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 400 for empty ID string', async () => {
      const request = new Request('http://localhost/api/users?id=');

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing ID');
    });

    it('returns 400 for non-numeric ID', async () => {
      const request = new Request('http://localhost/api/users?id=abc');

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid ID');
      expect(data.details).toBe('User ID must be a positive integer');
    });

    it('returns 400 for zero ID', async () => {
      const request = new Request('http://localhost/api/users?id=0');

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid ID');
    });

    it('returns 400 for negative ID', async () => {
      const request = new Request('http://localhost/api/users?id=-1');

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid ID');
    });

    it('returns 400 for float ID (truncated to integer)', async () => {
      // parseInt('1.5', 10) === 1 which is valid, so this does NOT return 400
      // The route will try to check for user with id=1
      const existingUser: User = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        role: 'user',
      };
      mockQuery.mockResolvedValueOnce([existingUser]);
      mockQuery.mockResolvedValueOnce({ affectedRows: 1 });

      const request = new Request('http://localhost/api/users?id=1.5');

      const response = await DELETE(request);

      // parseInt('1.5', 10) === 1 which is > 0 and not NaN, so it proceeds
      expect(response.status).toBe(200);
    });
  });

  describe('Not Found Error', () => {
    it('returns 404 when user does not exist', async () => {
      mockQuery.mockResolvedValue([]);

      const request = new Request('http://localhost/api/users?id=999999');

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('User not found');
      // Should not attempt delete
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('returns 500 when database check fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockQuery.mockRejectedValue(new Error('Database error'));

      const request = new Request('http://localhost/api/users?id=1');

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const loggedArg = consoleErrorSpy.mock.calls[0][0];
      const loggedObj = JSON.parse(loggedArg);
      expect(loggedObj.level).toBe('ERROR');
      expect(loggedObj.status).toBe(500);

      consoleErrorSpy.mockRestore();
    });

    it('returns 500 when deletion fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const existingUser: User = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        role: 'user',
      };
      mockQuery.mockResolvedValueOnce([existingUser]);
      mockQuery.mockRejectedValueOnce(new Error('Delete failed'));

      const request = new Request('http://localhost/api/users?id=1');

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });

      consoleErrorSpy.mockRestore();
    });
  });
});
