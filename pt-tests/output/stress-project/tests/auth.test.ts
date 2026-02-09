/**
 * Authentication service tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../src/services/auth.js';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  describe('register', () => {
    it('should register a new user', async () => {
      const result = await authService.register(
        'test@example.com',
        'Password123',
        'testuser'
      );

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.username).toBe('testuser');
      expect(result.token).toBeDefined();
      expect(result.token.token).toBeTruthy();
    });

    it('should reject invalid email', async () => {
      await expect(
        authService.register('invalid-email', 'Password123', 'testuser')
      ).rejects.toThrow('Invalid email address');
    });

    it('should reject weak password', async () => {
      await expect(
        authService.register('test@example.com', 'weak', 'testuser')
      ).rejects.toThrow('Password must be at least 8 characters');
    });

    it('should reject duplicate email', async () => {
      await authService.register('test@example.com', 'Password123', 'user1');

      await expect(
        authService.register('test@example.com', 'Password123', 'user2')
      ).rejects.toThrow('User already exists');
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await authService.register('test@example.com', 'Password123', 'testuser');
    });

    it('should login with valid credentials', async () => {
      const result = await authService.login({
        email: 'test@example.com',
        password: 'Password123',
      });

      expect(result.user).toBeDefined();
      expect(result.token).toBeDefined();
    });

    it('should reject invalid email', async () => {
      await expect(
        authService.login({
          email: 'wrong@example.com',
          password: 'Password123',
        })
      ).rejects.toThrow('Invalid credentials');
    });

    it('should record login', async () => {
      const result = await authService.login({
        email: 'test@example.com',
        password: 'Password123',
      });

      expect(result.user.metadata.loginCount).toBe(1);
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', async () => {
      const { token } = await authService.register(
        'test@example.com',
        'Password123',
        'testuser'
      );

      const user = await authService.verifyToken(token.token);
      expect(user).toBeDefined();
      expect(user?.email).toBe('test@example.com');
    });

    it('should reject invalid token', async () => {
      const user = await authService.verifyToken('invalid_token');
      expect(user).toBeNull();
    });
  });

  describe('logout', () => {
    it('should invalidate token', async () => {
      const { token } = await authService.register(
        'test@example.com',
        'Password123',
        'testuser'
      );

      await authService.logout(token.token);

      const user = await authService.verifyToken(token.token);
      expect(user).toBeNull();
    });
  });

  describe('refreshToken', () => {
    it('should generate new token from refresh token', async () => {
      const { token: oldToken } = await authService.register(
        'test@example.com',
        'Password123',
        'testuser'
      );

      const newToken = await authService.refreshToken(oldToken.refreshToken!);
      expect(newToken).toBeDefined();
      expect(newToken.token).not.toBe(oldToken.token);
    });

    it('should reject invalid refresh token', async () => {
      await expect(
        authService.refreshToken('invalid_refresh_token')
      ).rejects.toThrow('Invalid refresh token');
    });
  });
});
