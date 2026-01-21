/**
 * Vitest setup file for precision-engine tests.
 */

import { beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Store original cwd
const originalCwd = process.cwd();

// Test temp directory
export let testDir: string;

beforeEach(async () => {
  // Create a unique temp directory for each test
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'precision-engine-test-'));
  process.chdir(testDir);
});

afterEach(async () => {
  // Restore original cwd
  process.chdir(originalCwd);

  // Clean up temp directory
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }

  // Reset all mocks
  vi.restoreAllMocks();
});

// Extend global expect matchers if needed
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Vi {
    interface Assertion {
      toBeSuccessResult(): void;
      toBeErrorResult(): void;
    }
  }
}
