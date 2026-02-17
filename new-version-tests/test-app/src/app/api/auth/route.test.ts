import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextResponse } from 'next/server';
import type { User } from '@/types/api';

// Use vi.hoisted to ensure mocks are available in vi.mock factory closures
const { mockQuery, mockCompare, mockSign, mockValidatePasswordStrength } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockCompare: vi.fn(),
  mockSign: vi.fn(),
  mockValidatePasswordStrength: vi.fn().mockReturnValue({ valid: true }),
}));

// Mock dependencies
vi.mock('@/lib/db', () => ({
  db: {
    query: mockQuery,
  },
}));

vi.mock('bcrypt', () => ({
  default: {
    compare: mockCompare,
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: mockSign,
  },
}));

// Mock auth to bypass password strength validation
vi.mock('@/lib/auth', () => ({
  validatePasswordStrength: mockValidatePasswordStrength,
}));

// Import after mocks
const { POST } = await import('./route');

describe('POST /api/auth', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockCompare.mockReset();
    mockSign.mockReset();
    mockValidatePasswordStrength.mockReset();
    mockValidatePasswordStrength.mockReturnValue({ valid: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful Authentication', () => {
    it('returns token for valid credentials', async () => {
      const mockUser: User = {
        id: 1,
        email: 'test@example.com',
        role: 'admin',
        name: 'Test User',
        password_hash: '$2b$10$hashedpassword',
      };

      mockQuery.mockResolvedValue([mockUser]);
      mockCompare.mockResolvedValue(true);
      mockSign.mockReturnValue('mock-jwt-token');

      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password1!',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ token: 'mock-jwt-token' });
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT id, email, role, password_hash FROM users WHERE email = ?',
        ['test@example.com']
      );
      expect(mockCompare).toHaveBeenCalledWith('Password1!', '$2b$10$hashedpassword');
      expect(mockSign).toHaveBeenCalledWith(
        { id: 1, email: 'test@example.com', role: 'admin' },
        'test-secret-key-for-jwt-signing',
        { expiresIn: '7d' }
      );
    });

    it('sanitizes email by trimming and lowercasing', async () => {
      const mockUser: User = {
        id: 1,
        email: 'test@example.com',
        role: 'user',
        name: 'Test User',
        password_hash: '$2b$10$hashedpassword',
      };

      mockQuery.mockResolvedValue([mockUser]);
      mockCompare.mockResolvedValue(true);
      mockSign.mockReturnValue('mock-jwt-token');

      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: '  Test@EXAMPLE.com  ',
          password: 'Password1!',
        }),
      });

      await POST(request);

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT id, email, role, password_hash FROM users WHERE email = ?',
        ['test@example.com']
      );
    });

    it('uses JWT_EXPIRES_IN from environment at module load time', async () => {
      // JWT_EXPIRES_IN is captured at module load time (const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d')
      // The value from setup.ts (process.env.JWT_EXPIRES_IN = '7d') is used
      const mockUser: User = {
        id: 1,
        email: 'test@example.com',
        role: 'user',
        name: 'Test User',
        password_hash: '$2b$10$hashedpassword',
      };

      mockQuery.mockResolvedValue([mockUser]);
      mockCompare.mockResolvedValue(true);
      mockSign.mockReturnValue('mock-jwt-token');

      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password1!',
        }),
      });

      await POST(request);

      expect(mockSign).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        { expiresIn: '7d' }
      );
    });
  });

  describe('Invalid Credentials', () => {
    it('returns 401 when user not found', async () => {
      mockQuery.mockResolvedValue([]);

      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'Password1!',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid credentials');
      expect(mockCompare).not.toHaveBeenCalled();
      expect(mockSign).not.toHaveBeenCalled();
    });

    it('returns 401 when password is incorrect', async () => {
      const mockUser: User = {
        id: 1,
        email: 'test@example.com',
        role: 'user',
        name: 'Test User',
        password_hash: '$2b$10$hashedpassword',
      };

      mockQuery.mockResolvedValue([mockUser]);
      mockCompare.mockResolvedValue(false);

      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password1!',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid credentials');
      expect(mockCompare).toHaveBeenCalledWith('Password1!', '$2b$10$hashedpassword');
      expect(mockSign).not.toHaveBeenCalled();
    });

    it('returns 401 when user has no password_hash', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockUser: User = {
        id: 1,
        email: 'test@example.com',
        role: 'user',
        name: 'Test User',
        // password_hash is undefined
      };

      mockQuery.mockResolvedValue([mockUser]);

      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password1!',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid credentials');
      // Logger calls console.error with a JSON string
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const loggedArg = consoleErrorSpy.mock.calls[0][0];
      const loggedObj = JSON.parse(loggedArg);
      expect(loggedObj.message).toContain('missing password_hash');
      expect(mockCompare).not.toHaveBeenCalled();
      expect(mockSign).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('returns 401 when password fails strength validation', async () => {
      mockValidatePasswordStrength.mockReturnValue({ valid: false, error: 'Too weak' });

      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'weak',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid credentials');
    });
  });

  describe('Validation Errors', () => {
    it('returns 500 for invalid JSON request body', async () => {
      // When request.json() throws a SyntaxError (not caught as ValidationError),
      // it falls through to the generic 500 handler
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: 'not json',
      });

      const response = await POST(request);
      const data = await response.json();

      // JSON parse error is not a ValidationError, so it returns 500
      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
      consoleErrorSpy.mockRestore();
    });

    it('returns 400 for non-object body', async () => {
      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify('string body'),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request body');
    });

    it('returns 400 for missing email', async () => {
      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          password: 'Password1!',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid email');
      expect(data.details).toBe('Valid email address is required');
    });

    it('returns 400 for invalid email format', async () => {
      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'not-an-email',
          password: 'Password1!',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid email');
      expect(data.details).toBe('Valid email address is required');
    });

    it('returns 400 for non-string email', async () => {
      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 123,
          password: 'Password1!',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid email');
    });

    it('returns 400 for missing password', async () => {
      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid password');
      expect(data.details).toBe('Password is required');
    });

    it('returns 400 for empty password', async () => {
      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: '',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid password');
      expect(data.details).toBe('Password is required');
    });

    it('returns 400 for non-string password', async () => {
      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 12345,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid password');
    });
  });

  describe('Error Handling', () => {
    it('returns 500 when database query fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password1!',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
      // Logger uses console.error with a JSON stringified object
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const loggedArg = consoleErrorSpy.mock.calls[0][0];
      const loggedObj = JSON.parse(loggedArg);
      expect(loggedObj.level).toBe('ERROR');
      expect(loggedObj.status).toBe(500);

      consoleErrorSpy.mockRestore();
    });

    it('returns 500 when bcrypt.compare fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockUser: User = {
        id: 1,
        email: 'test@example.com',
        role: 'user',
        name: 'Test User',
        password_hash: '$2b$10$hashedpassword',
      };

      mockQuery.mockResolvedValue([mockUser]);
      mockCompare.mockRejectedValue(new Error('Bcrypt error'));

      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password1!',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });

      consoleErrorSpy.mockRestore();
    });

    it('returns 500 when jwt.sign fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockUser: User = {
        id: 1,
        email: 'test@example.com',
        role: 'user',
        name: 'Test User',
        password_hash: '$2b$10$hashedpassword',
      };

      mockQuery.mockResolvedValue([mockUser]);
      mockCompare.mockResolvedValue(true);
      mockSign.mockImplementation(() => {
        throw new Error('JWT signing error');
      });

      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password1!',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('handles email with special characters', async () => {
      const mockUser: User = {
        id: 1,
        email: 'test+tag@example.com',
        role: 'user',
        name: 'Test User',
        password_hash: '$2b$10$hashedpassword',
      };

      mockQuery.mockResolvedValue([mockUser]);
      mockCompare.mockResolvedValue(true);
      mockSign.mockReturnValue('mock-jwt-token');

      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test+tag@example.com',
          password: 'Password1!',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['test+tag@example.com']
      );
    });

    it('handles very long password', async () => {
      const longPassword = 'Password1!' + 'a'.repeat(990);
      const mockUser: User = {
        id: 1,
        email: 'test@example.com',
        role: 'user',
        name: 'Test User',
        password_hash: '$2b$10$hashedpassword',
      };

      mockQuery.mockResolvedValue([mockUser]);
      mockCompare.mockResolvedValue(true);
      mockSign.mockReturnValue('mock-jwt-token');

      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: longPassword,
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockCompare).toHaveBeenCalledWith(longPassword, '$2b$10$hashedpassword');
    });

    it('handles user with different role values', async () => {
      const mockUser: User = {
        id: 1,
        email: 'test@example.com',
        role: 'guest',
        name: 'Test User',
        password_hash: '$2b$10$hashedpassword',
      };

      mockQuery.mockResolvedValue([mockUser]);
      mockCompare.mockResolvedValue(true);
      mockSign.mockReturnValue('mock-jwt-token');

      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password1!',
        }),
      });

      await POST(request);

      expect(mockSign).toHaveBeenCalledWith(
        { id: 1, email: 'test@example.com', role: 'guest' },
        expect.any(String),
        expect.any(Object)
      );
    });
  });
});
