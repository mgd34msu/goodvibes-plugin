import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { verifyToken, requireRole, validatePasswordStrength, TokenPayload } from './auth';
import { AuthenticationError, AuthorizationError } from './errors';

describe('auth.ts', () => {
  const JWT_SECRET = process.env.JWT_SECRET!;

  describe('verifyToken', () => {
    it('should verify valid token and return payload', () => {
      const payload: TokenPayload = { id: 1, email: 'test@example.com', role: 'user' };
      const token = jwt.sign(payload, JWT_SECRET);
      const request = new Request('http://localhost', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = verifyToken(request);

      expect(result).toMatchObject(payload);
      expect(result.id).toBe(1);
      expect(result.email).toBe('test@example.com');
      expect(result.role).toBe('user');
    });

    it('should throw AuthenticationError when Authorization header is missing', () => {
      const request = new Request('http://localhost');

      expect(() => verifyToken(request)).toThrow(AuthenticationError);
      expect(() => verifyToken(request)).toThrow('Missing authentication token');
    });

    it('should throw AuthenticationError when Authorization header does not start with Bearer', () => {
      const request = new Request('http://localhost', {
        headers: { Authorization: 'Basic xyz' },
      });

      expect(() => verifyToken(request)).toThrow(AuthenticationError);
      expect(() => verifyToken(request)).toThrow('Invalid authentication format. Use: Bearer <token>');
    });

    it('should throw AuthenticationError when token is empty after Bearer prefix', () => {
      const request = new Request('http://localhost', {
        headers: { Authorization: 'Bearer ' },
      });

      expect(() => verifyToken(request)).toThrow(AuthenticationError);
      expect(() => verifyToken(request)).toThrow('Invalid authentication format');
    });

    it('should throw AuthenticationError when token is only whitespace', () => {
      const request = new Request('http://localhost', {
        headers: { Authorization: 'Bearer    ' },
      });

      expect(() => verifyToken(request)).toThrow(AuthenticationError);
      expect(() => verifyToken(request)).toThrow('Invalid authentication format');
    });

    it('should throw AuthenticationError when token is expired', () => {
      const payload: TokenPayload = { id: 1, email: 'test@example.com', role: 'user' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '-1s' });
      const request = new Request('http://localhost', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(() => verifyToken(request)).toThrow(AuthenticationError);
      expect(() => verifyToken(request)).toThrow('Token has expired');
    });

    it('should throw AuthenticationError when token is malformed', () => {
      const request = new Request('http://localhost', {
        headers: { Authorization: 'Bearer invalid.token.here' },
      });

      expect(() => verifyToken(request)).toThrow(AuthenticationError);
      expect(() => verifyToken(request)).toThrow('Invalid token');
    });

    it('should throw AuthenticationError when token signature is invalid', () => {
      const payload: TokenPayload = { id: 1, email: 'test@example.com', role: 'user' };
      const token = jwt.sign(payload, 'wrong-secret');
      const request = new Request('http://localhost', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(() => verifyToken(request)).toThrow(AuthenticationError);
      expect(() => verifyToken(request)).toThrow('Invalid token');
    });

    it('should throw AuthenticationError for generic verification errors', () => {
      const request = new Request('http://localhost', {
        headers: { Authorization: 'Bearer not.a.jwt' },
      });

      // Mock jwt.verify to throw a generic error
      vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw new Error('Generic error');
      });

      expect(() => verifyToken(request)).toThrow(AuthenticationError);
      expect(() => verifyToken(request)).toThrow('Token verification failed');

      vi.restoreAllMocks();
    });
  });

  describe('requireRole', () => {
    const userPayload: TokenPayload = { id: 1, email: 'user@example.com', role: 'user' };
    const adminPayload: TokenPayload = { id: 2, email: 'admin@example.com', role: 'admin' };
    const moderatorPayload: TokenPayload = { id: 3, email: 'mod@example.com', role: 'moderator' };

    it('should not throw when user has required role', () => {
      expect(() => requireRole(adminPayload, ['admin'])).not.toThrow();
      expect(() => requireRole(userPayload, ['user'])).not.toThrow();
    });

    it('should not throw when user has one of multiple allowed roles', () => {
      expect(() => requireRole(adminPayload, ['admin', 'moderator'])).not.toThrow();
      expect(() => requireRole(moderatorPayload, ['admin', 'moderator'])).not.toThrow();
    });

    it('should throw AuthorizationError when user does not have required role', () => {
      expect(() => requireRole(userPayload, ['admin'])).toThrow(AuthorizationError);
      expect(() => requireRole(userPayload, ['admin'])).toThrow('Access denied. Required role: admin');
    });

    it('should throw AuthorizationError with multiple roles in message', () => {
      expect(() => requireRole(userPayload, ['admin', 'moderator'])).toThrow(AuthorizationError);
      expect(() => requireRole(userPayload, ['admin', 'moderator'])).toThrow(
        'Access denied. Required role: admin or moderator'
      );
    });

    it('should handle empty allowed roles array', () => {
      expect(() => requireRole(adminPayload, [])).toThrow(AuthorizationError);
    });
  });

  describe('validatePasswordStrength', () => {
    it('should return valid for strong password', () => {
      const result = validatePasswordStrength('StrongP@ssw0rd');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept password with all required character types', () => {
      const result = validatePasswordStrength('Abcd1234!@#$');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject password shorter than 8 characters', () => {
      const result = validatePasswordStrength('Ab1!');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Password must be at least 8 characters long');
    });

    it('should reject password exactly 7 characters', () => {
      const result = validatePasswordStrength('Abc123!');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Password must be at least 8 characters long');
    });

    it('should accept password exactly 8 characters with all requirements', () => {
      const result = validatePasswordStrength('Abcd123!');
      expect(result.valid).toBe(true);
    });

    it('should reject password without lowercase letter', () => {
      const result = validatePasswordStrength('ABCD1234!');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Password must contain at least one lowercase letter');
    });

    it('should reject password without uppercase letter', () => {
      const result = validatePasswordStrength('abcd1234!');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Password must contain at least one uppercase letter');
    });

    it('should reject password without number', () => {
      const result = validatePasswordStrength('Abcdabcd!');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Password must contain at least one number');
    });

    it('should reject password without special character', () => {
      const result = validatePasswordStrength('Abcd1234');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Password must contain at least one special character');
    });

    it('should accept various special characters', () => {
      const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '-', '=', '[', ']', '{', '}', ';', "'", ':', '"', '\\', '|', ',', '.', '<', '>', '/', '?'];
      
      specialChars.forEach(char => {
        const result = validatePasswordStrength(`Abcd1234${char}`);
        expect(result.valid).toBe(true);
      });
    });

    it('should handle empty password', () => {
      const result = validatePasswordStrength('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Password must be at least 8 characters long');
    });

    it('should validate password with exactly one of each requirement', () => {
      const result = validatePasswordStrength('Aa1!aaaa');
      expect(result.valid).toBe(true);
    });

    it('should validate very long password', () => {
      const result = validatePasswordStrength('A'.repeat(50) + 'a1!');
      expect(result.valid).toBe(true);
    });
  });
});
