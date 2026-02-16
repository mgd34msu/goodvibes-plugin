import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextResponse } from 'next/server';
import type { User } from '@/types/api';

// Mock dependencies
const mockQuery = vi.fn();
vi.mock('@/lib/db', () => ({
  db: {
    query: mockQuery,
  },
}));

const mockCompare = vi.fn();
vi.mock('bcrypt', () => ({
  default: {
    compare: mockCompare,
  },
}));

const mockSign = vi.fn();
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: mockSign,
  },
}));

// Import after mocks
const { POST } = await import('./route');

describe('POST /api/auth', () => {
  beforeEach(() => {
    mockQuery.mockClear();
    mockCompare.mockClear();
    mockSign.mockClear();
    vi.clearAllMocks();
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
          password: 'password123',
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
      expect(mockCompare).toHaveBeenCalledWith('password123', '$2b$10$hashedpassword');
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
          password: 'password123',
        }),
      });

      await POST(request);

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT id, email, role, password_hash FROM users WHERE email = ?',
        ['test@example.com']
      );
    });

    it('uses JWT_EXPIRES_IN from environment', async () => {
      const originalExpiry = process.env.JWT_EXPIRES_IN;
      process.env.JWT_EXPIRES_IN = '1d';

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
          password: 'password123',
        }),
      });

      await POST(request);

      expect(mockSign).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        { expiresIn: '1d' }
      );

      process.env.JWT_EXPIRES_IN = originalExpiry;
    });
  });

  describe('Invalid Credentials', () => {
    it('returns 401 when user not found', async () => {
      mockQuery.mockResolvedValue([]);

      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'password123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Invalid credentials' });
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
          password: 'wrongpassword',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Invalid credentials' });
      expect(mockCompare).toHaveBeenCalledWith('wrongpassword', '$2b$10$hashedpassword');
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
          password: 'password123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Invalid credentials' });
      expect(consoleErrorSpy).toHaveBeenCalledWith('User missing password_hash:', 1);
      expect(mockCompare).not.toHaveBeenCalled();
      expect(mockSign).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Validation Errors', () => {
    it('returns 400 for invalid request body', async () => {
      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: 'not json',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request body');
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
          password: 'password123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        error: 'Invalid email',
        details: 'Valid email address is required',
      });
    });

    it('returns 400 for invalid email format', async () => {
      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 'not-an-email',
          password: 'password123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        error: 'Invalid email',
        details: 'Valid email address is required',
      });
    });

    it('returns 400 for non-string email', async () => {
      const request = new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          email: 123,
          password: 'password123',
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
      expect(data).toEqual({
        error: 'Invalid password',
        details: 'Password is required',
      });
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
      expect(data).toEqual({
        error: 'Invalid password',
        details: 'Password is required',
      });
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
          password: 'password123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'POST /api/auth error:',
        expect.any(Error)
      );

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
          password: 'password123',
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
          password: 'password123',
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
          password: 'password123',
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
      const longPassword = 'a'.repeat(1000);
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
          password: 'password123',
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
