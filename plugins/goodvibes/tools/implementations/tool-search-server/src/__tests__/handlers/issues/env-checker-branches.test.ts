/**
 * Tests for environment-checker.ts edge cases that require mocking constants
 *
 * This file specifically tests the dead code branch on line 78 where
 * .env.example would be in the envFiles array. This situation can't occur
 * with the current constants configuration but is handled defensively.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

// Mock the constants module BEFORE importing environment-checker
vi.mock('../../../handlers/issues/constants.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../handlers/issues/constants.js')>();
  return {
    ...original,
    // Include .env.example in ENV_FILES to test line 78 branch
    ENV_FILES: ['.env', '.env.example', '.env.local'],
  };
});

// Mock fs module
vi.mock('fs');

// Import after mocks are set up
import { checkEnvironment } from '../../../handlers/issues/environment-checker.js';

describe('environment-checker edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should skip .env.example when checking gitignore (line 78)', () => {
    // Set up files: .env.example exists and has sensitive vars
    // Also .gitignore exists but doesn't include .env.example
    // The code should SKIP .env.example in the gitignore check (line 78 continue)
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = String(p);
      // .env.example exists (in our mocked ENV_FILES)
      if (pathStr.endsWith('.env.example')) return true;
      // .gitignore exists
      if (pathStr.endsWith('.gitignore')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const pathStr = String(p);
      // .env.example has a sensitive var
      if (pathStr.endsWith('.env.example')) {
        return 'API_KEY=example_key\nSECRET=example_secret\n';
      }
      // .gitignore does NOT include .env.example
      if (pathStr.endsWith('.gitignore')) {
        return 'node_modules\ndist\n';
      }
      return '';
    });

    const issues = checkEnvironment('/test');

    // Even though .env.example has sensitive vars and isn't gitignored,
    // it should be skipped (line 78 continue statement)
    // So no sensitive_exposed warnings should appear for .env.example
    expect(issues.filter(i => i.type === 'sensitive_exposed')).toHaveLength(0);
  });

  it('should still check other env files when .env.example is in the list', () => {
    // Set up: .env.example AND .env both exist
    // .env has sensitive vars and is not gitignored
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = String(p);
      if (pathStr.endsWith('.env.example')) return true;
      if (pathStr.endsWith('.env') && !pathStr.endsWith('.env.example')) return true;
      if (pathStr.endsWith('.gitignore')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const pathStr = String(p);
      if (pathStr.endsWith('.env.example')) {
        return 'API_KEY=\n'; // Example file
      }
      if (pathStr.endsWith('.env') && !pathStr.endsWith('.env.example')) {
        return 'API_KEY=real_secret\nPASSWORD=secure123\n';
      }
      if (pathStr.endsWith('.gitignore')) {
        return 'node_modules\n'; // Doesn't include .env
      }
      return '';
    });

    const issues = checkEnvironment('/test');

    // .env.example should be skipped, but .env should be checked
    // and should report sensitive vars not gitignored
    const sensitiveIssues = issues.filter(i => i.type === 'sensitive_exposed');
    expect(sensitiveIssues.length).toBeGreaterThan(0);
    // Verify it's for .env, not .env.example
    expect(sensitiveIssues.some(i => i.message.includes('.env') && !i.message.includes('.env.example'))).toBe(true);
  });
});
