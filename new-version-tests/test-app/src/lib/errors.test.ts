import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
} from './errors';

describe('errors.ts', () => {
  describe('AppError', () => {
    it('should create error with all properties', () => {
      const error = new AppError('Test error', 500, 'TEST_ERROR', 'Test details');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.details).toBe('Test details');
      expect(error.name).toBe('AppError');
    });

    it('should create error without details', () => {
      const error = new AppError('Test error', 500, 'TEST_ERROR');
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.details).toBeUndefined();
    });

    it('should have stack trace', () => {
      const error = new AppError('Test error', 500, 'TEST_ERROR');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });

    it('should serialize to JSON with details', () => {
      const error = new AppError('Test error', 500, 'TEST_ERROR', 'Test details');
      const json = error.toJSON();
      
      expect(json).toEqual({
        error: 'Test error',
        code: 'TEST_ERROR',
        details: 'Test details',
      });
    });

    it('should serialize to JSON without details when not provided', () => {
      const error = new AppError('Test error', 500, 'TEST_ERROR');
      const json = error.toJSON();
      
      expect(json).toEqual({
        error: 'Test error',
        code: 'TEST_ERROR',
      });
      expect(json).not.toHaveProperty('details');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with default message', () => {
      const error = new ValidationError();
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toBeUndefined();
      expect(error.name).toBe('ValidationError');
    });

    it('should create validation error with custom message', () => {
      const error = new ValidationError('Custom validation error');
      
      expect(error.message).toBe('Custom validation error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('should create validation error with details', () => {
      const error = new ValidationError('Invalid input', 'Email format is invalid');
      
      expect(error.message).toBe('Invalid input');
      expect(error.details).toBe('Email format is invalid');
    });

    it('should serialize correctly', () => {
      const error = new ValidationError('Invalid data', 'Field X is required');
      const json = error.toJSON();
      
      expect(json).toEqual({
        error: 'Invalid data',
        code: 'VALIDATION_ERROR',
        details: 'Field X is required',
      });
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error with default message', () => {
      const error = new AuthenticationError();
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.message).toBe('Invalid credentials');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.name).toBe('AuthenticationError');
    });

    it('should create authentication error with custom message', () => {
      const error = new AuthenticationError('Token expired');
      
      expect(error.message).toBe('Token expired');
      expect(error.statusCode).toBe(401);
    });

    it('should create authentication error with details', () => {
      const error = new AuthenticationError('Login failed', 'Password incorrect');
      
      expect(error.details).toBe('Password incorrect');
    });
  });

  describe('AuthorizationError', () => {
    it('should create authorization error with default message', () => {
      const error = new AuthorizationError();
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error.message).toBe('Insufficient permissions');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.name).toBe('AuthorizationError');
    });

    it('should create authorization error with custom message', () => {
      const error = new AuthorizationError('Admin access required');
      
      expect(error.message).toBe('Admin access required');
      expect(error.statusCode).toBe(403);
    });

    it('should create authorization error with details', () => {
      const error = new AuthorizationError('Access denied', 'Role mismatch');
      
      expect(error.details).toBe('Role mismatch');
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with default resource', () => {
      const error = new NotFoundError();
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.name).toBe('NotFoundError');
    });

    it('should create not found error with custom resource', () => {
      const error = new NotFoundError('User');
      
      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
    });

    it('should create not found error with details', () => {
      const error = new NotFoundError('Product', 'ID: 123');
      
      expect(error.message).toBe('Product not found');
      expect(error.details).toBe('ID: 123');
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error with default message', () => {
      const error = new ConflictError();
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toBe('Resource conflict');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
      expect(error.name).toBe('ConflictError');
    });

    it('should create conflict error with custom message', () => {
      const error = new ConflictError('Email already exists');
      
      expect(error.message).toBe('Email already exists');
      expect(error.statusCode).toBe(409);
    });

    it('should create conflict error with details', () => {
      const error = new ConflictError('Duplicate entry', 'user@example.com');
      
      expect(error.details).toBe('user@example.com');
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with retry after', () => {
      const error = new RateLimitError(60000); // 60 seconds
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.message).toBe('Too many requests');
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.retryAfter).toBe(60000);
      expect(error.details).toBe('Retry after 60 seconds');
      expect(error.name).toBe('RateLimitError');
    });

    it('should calculate retry after seconds correctly', () => {
      const error1 = new RateLimitError(1000); // 1 second
      expect(error1.details).toBe('Retry after 1 seconds');
      
      const error2 = new RateLimitError(5500); // 5.5 seconds
      expect(error2.details).toBe('Retry after 6 seconds'); // Ceiling
      
      const error3 = new RateLimitError(120000); // 120 seconds
      expect(error3.details).toBe('Retry after 120 seconds');
    });

    it('should handle zero retry after', () => {
      const error = new RateLimitError(0);
      
      expect(error.retryAfter).toBe(0);
      expect(error.details).toBe('Retry after 0 seconds');
    });

    it('should serialize correctly', () => {
      const error = new RateLimitError(30000);
      const json = error.toJSON();
      
      expect(json).toEqual({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        details: 'Retry after 30 seconds',
      });
    });
  });
});
