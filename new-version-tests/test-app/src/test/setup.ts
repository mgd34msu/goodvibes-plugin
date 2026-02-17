import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { rateLimiter } from '../lib/rate-limiter';

// Force React to run in development mode for tests
process.env.NODE_ENV = 'test';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock environment variables
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test_user';
process.env.DB_PASS = 'test_pass';
process.env.DB_NAME = 'test_db';
process.env.JWT_SECRET = 'test-secret-key-for-jwt-signing';
process.env.JWT_EXPIRES_IN = '7d';

// Reset rate limiter before each test
beforeEach(() => {
  rateLimiter.reset();
});

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
