/**
 * Test setup for batch-engine integration tests
 * Runs before all tests to configure the test environment
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Global test state
const testState = new Map<string, any>();

beforeAll(() => {
  // Setup global test environment
  console.log('Starting batch-engine integration tests');

  // Initialize test directories if needed
  testState.set('test_start_time', Date.now());
});

afterAll(() => {
  // Cleanup global test environment
  const duration = Date.now() - testState.get('test_start_time');
  console.log(`Tests completed in ${duration}ms`);

  // Clear test state
  testState.clear();
});

beforeEach(() => {
  // Reset state before each test
  // Individual tests should use their own mock instances
});

afterEach(() => {
  // Cleanup after each test
});

// Export utilities for tests
export { testState };

/**
 * Helper to create test batch ID
 */
export function createTestBatchId(prefix = 'test'): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `${prefix}-batch-${timestamp}-${random}`;
}

/**
 * Helper to create test checkpoint ID
 */
export function createTestCheckpointId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  return `cp_${date}_${time}`;
}

/**
 * Helper to wait for async operations
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper to create mock file system
 */
export class MockFileSystem {
  private files: Map<string, string> = new Map();

  write(path: string, content: string): void {
    this.files.set(path, content);
  }

  read(path: string): string | undefined {
    return this.files.get(path);
  }

  exists(path: string): boolean {
    return this.files.has(path);
  }

  delete(path: string): boolean {
    return this.files.delete(path);
  }

  list(): string[] {
    return Array.from(this.files.keys());
  }

  clear(): void {
    this.files.clear();
  }
}
