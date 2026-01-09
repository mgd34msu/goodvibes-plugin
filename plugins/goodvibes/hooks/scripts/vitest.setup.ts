/**
 * Global test setup for vitest
 *
 * This file runs before all tests and sets up global mocks
 * that are needed across all test files.
 */

import { vi, beforeEach, afterEach } from 'vitest';

// Set environment variable to indicate we're in test mode
// This prevents hook entry points from executing when imported
process.env.VITEST = 'true';
process.env.NODE_ENV = 'test';

// Mock isTestEnvironment globally to return true
// This ensures hook entry points don't execute during tests
vi.mock('./src/shared/hook-io.js', async (importOriginal) => {
  const actual: unknown = await importOriginal();
  return {
    ...(actual as object),
    isTestEnvironment: vi.fn(() => true),
  };
});

// Global mock for process.exit
// This prevents tests from actually exiting the test runner
// when hooks call respond() which calls process.exit()
let processExitMock: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Mock process.exit to prevent actual process termination
  // Store the mock so tests can inspect the calls
  processExitMock = vi.spyOn(process, 'exit').mockImplementation(((
    _code?: number | string | null | undefined
  ) => {
    // Don't throw, don't exit - just record the call
    // Tests can check if process.exit was called via processExitMock
    return undefined as never;
  }) as (code?: number) => never);
});

afterEach(() => {
  // Restore process.exit after each test
  processExitMock?.mockRestore();
  vi.clearAllMocks();
});
