/**
 * Tests for memory/index.ts
 *
 * Tests the backward compatibility wrapper functions (appendDecision, appendPattern,
 * appendFailure, appendPreference). These are the only functions with actual logic
 * in index.ts - the rest are re-exports that don't require coverage testing.
 *
 * Achieves 100% line and branch coverage by testing success and error paths.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the dependencies before importing the module under test
vi.mock('../../memory/directories.js', () => ({
  ensureMemoryDir: vi.fn(),
}));

vi.mock('../../memory/decisions.js', () => ({
  writeDecision: vi.fn(),
}));

vi.mock('../../memory/patterns.js', () => ({
  writePattern: vi.fn(),
}));

vi.mock('../../memory/failures.js', () => ({
  writeFailure: vi.fn(),
}));

vi.mock('../../memory/preferences.js', () => ({
  writePreference: vi.fn(),
}));

vi.mock('../../shared/index.js', () => ({
  debug: vi.fn(),
  logError: vi.fn(),
  ensureGoodVibesDir: vi.fn(),
}));

// Import mocked modules
import { ensureMemoryDir } from '../../memory/directories.js';
import { writeDecision } from '../../memory/decisions.js';
import { writePattern } from '../../memory/patterns.js';
import { writeFailure } from '../../memory/failures.js';
import { writePreference } from '../../memory/preferences.js';
import { debug, logError } from '../../shared/index.js';

// Import the functions under test
import {
  appendDecision,
  appendPattern,
  appendFailure,
  appendPreference,
} from '../../memory/index.js';

// Type definitions for test data (duplicated here to avoid import issues with mocks)
interface Decision {
  title: string;
  date: string;
  alternatives: string[];
  rationale: string;
  agent?: string;
  context?: string;
}

interface Pattern {
  name: string;
  date: string;
  description: string;
  example?: string;
  files?: string[];
}

interface Failure {
  approach: string;
  date: string;
  reason: string;
  context?: string;
  suggestion?: string;
}

interface Preference {
  key: string;
  value: string;
  date: string;
  notes?: string;
}

describe('memory/index', () => {
  const testCwd = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('appendDecision', () => {
    const testDecision: Decision = {
      title: 'Use TypeScript',
      date: '2024-01-04',
      alternatives: ['JavaScript', 'Flow'],
      rationale: 'Better type safety and IDE support',
    };

    it('should ensure memory directory exists before writing', async () => {
      await appendDecision(testCwd, testDecision);

      expect(ensureMemoryDir).toHaveBeenCalledWith(testCwd);
      expect(ensureMemoryDir).toHaveBeenCalledBefore(
        writeDecision as ReturnType<typeof vi.fn>
      );
    });

    it('should write the decision after ensuring directory', async () => {
      await appendDecision(testCwd, testDecision);

      expect(writeDecision).toHaveBeenCalledWith(testCwd, testDecision);
    });

    it('should log debug message on success', async () => {
      await appendDecision(testCwd, testDecision);

      expect(debug).toHaveBeenCalledWith(
        `Appended decision: ${testDecision.title}`
      );
    });

    it('should log error and rethrow when ensureMemoryDir fails', async () => {
      const error = new Error('Directory creation failed');
      vi.mocked(ensureMemoryDir).mockRejectedValueOnce(error);

      await expect(appendDecision(testCwd, testDecision)).rejects.toThrow(
        'Directory creation failed'
      );
      expect(logError).toHaveBeenCalledWith('appendDecision', error);
    });

    it('should log error and rethrow when writeDecision fails', async () => {
      const error = new Error('Write failed');
      vi.mocked(writeDecision).mockRejectedValueOnce(error);

      await expect(appendDecision(testCwd, testDecision)).rejects.toThrow(
        'Write failed'
      );
      expect(logError).toHaveBeenCalledWith('appendDecision', error);
    });

    it('should handle non-Error objects in catch block', async () => {
      const errorString = 'String error';
      vi.mocked(ensureMemoryDir).mockRejectedValueOnce(errorString);

      await expect(appendDecision(testCwd, testDecision)).rejects.toBe(
        errorString
      );
      expect(logError).toHaveBeenCalledWith('appendDecision', errorString);
    });
  });

  describe('appendPattern', () => {
    const testPattern: Pattern = {
      name: 'Repository Pattern',
      date: '2024-01-04',
      description: 'Use repository classes for data access',
      example: 'class UserRepository { ... }',
      files: ['src/repositories/user.ts'],
    };

    it('should ensure memory directory exists before writing', async () => {
      await appendPattern(testCwd, testPattern);

      expect(ensureMemoryDir).toHaveBeenCalledWith(testCwd);
      expect(ensureMemoryDir).toHaveBeenCalledBefore(
        writePattern as ReturnType<typeof vi.fn>
      );
    });

    it('should write the pattern after ensuring directory', async () => {
      await appendPattern(testCwd, testPattern);

      expect(writePattern).toHaveBeenCalledWith(testCwd, testPattern);
    });

    it('should log debug message on success', async () => {
      await appendPattern(testCwd, testPattern);

      expect(debug).toHaveBeenCalledWith(
        `Appended pattern: ${testPattern.name}`
      );
    });

    it('should log error and rethrow when ensureMemoryDir fails', async () => {
      const error = new Error('Directory creation failed');
      vi.mocked(ensureMemoryDir).mockRejectedValueOnce(error);

      await expect(appendPattern(testCwd, testPattern)).rejects.toThrow(
        'Directory creation failed'
      );
      expect(logError).toHaveBeenCalledWith('appendPattern', error);
    });

    it('should log error and rethrow when writePattern fails', async () => {
      const error = new Error('Write failed');
      vi.mocked(writePattern).mockRejectedValueOnce(error);

      await expect(appendPattern(testCwd, testPattern)).rejects.toThrow(
        'Write failed'
      );
      expect(logError).toHaveBeenCalledWith('appendPattern', error);
    });

    it('should handle non-Error objects in catch block', async () => {
      const errorString = 'String error';
      vi.mocked(ensureMemoryDir).mockRejectedValueOnce(errorString);

      await expect(appendPattern(testCwd, testPattern)).rejects.toBe(
        errorString
      );
      expect(logError).toHaveBeenCalledWith('appendPattern', errorString);
    });
  });

  describe('appendFailure', () => {
    const testFailure: Failure = {
      approach: 'Direct DOM manipulation',
      date: '2024-01-04',
      reason: 'Conflicts with React virtual DOM',
      context: 'Tried to optimize performance',
      suggestion: 'Use refs instead',
    };

    it('should ensure memory directory exists before writing', async () => {
      await appendFailure(testCwd, testFailure);

      expect(ensureMemoryDir).toHaveBeenCalledWith(testCwd);
      expect(ensureMemoryDir).toHaveBeenCalledBefore(
        writeFailure as ReturnType<typeof vi.fn>
      );
    });

    it('should write the failure after ensuring directory', async () => {
      await appendFailure(testCwd, testFailure);

      expect(writeFailure).toHaveBeenCalledWith(testCwd, testFailure);
    });

    it('should log debug message on success', async () => {
      await appendFailure(testCwd, testFailure);

      expect(debug).toHaveBeenCalledWith(
        `Appended failure: ${testFailure.approach}`
      );
    });

    it('should log error and rethrow when ensureMemoryDir fails', async () => {
      const error = new Error('Directory creation failed');
      vi.mocked(ensureMemoryDir).mockRejectedValueOnce(error);

      await expect(appendFailure(testCwd, testFailure)).rejects.toThrow(
        'Directory creation failed'
      );
      expect(logError).toHaveBeenCalledWith('appendFailure', error);
    });

    it('should log error and rethrow when writeFailure fails', async () => {
      const error = new Error('Write failed');
      vi.mocked(writeFailure).mockRejectedValueOnce(error);

      await expect(appendFailure(testCwd, testFailure)).rejects.toThrow(
        'Write failed'
      );
      expect(logError).toHaveBeenCalledWith('appendFailure', error);
    });

    it('should handle non-Error objects in catch block', async () => {
      const errorString = 'String error';
      vi.mocked(ensureMemoryDir).mockRejectedValueOnce(errorString);

      await expect(appendFailure(testCwd, testFailure)).rejects.toBe(
        errorString
      );
      expect(logError).toHaveBeenCalledWith('appendFailure', errorString);
    });
  });

  describe('appendPreference', () => {
    const testPreference: Preference = {
      key: 'code-style',
      value: 'functional',
      date: '2024-01-04',
      notes: 'Prefer functional components',
    };

    it('should ensure memory directory exists before writing', async () => {
      await appendPreference(testCwd, testPreference);

      expect(ensureMemoryDir).toHaveBeenCalledWith(testCwd);
      expect(ensureMemoryDir).toHaveBeenCalledBefore(
        writePreference as ReturnType<typeof vi.fn>
      );
    });

    it('should write the preference after ensuring directory', async () => {
      await appendPreference(testCwd, testPreference);

      expect(writePreference).toHaveBeenCalledWith(testCwd, testPreference);
    });

    it('should log debug message on success', async () => {
      await appendPreference(testCwd, testPreference);

      expect(debug).toHaveBeenCalledWith(
        `Appended preference: ${testPreference.key}`
      );
    });

    it('should log error and rethrow when ensureMemoryDir fails', async () => {
      const error = new Error('Directory creation failed');
      vi.mocked(ensureMemoryDir).mockRejectedValueOnce(error);

      await expect(appendPreference(testCwd, testPreference)).rejects.toThrow(
        'Directory creation failed'
      );
      expect(logError).toHaveBeenCalledWith('appendPreference', error);
    });

    it('should log error and rethrow when writePreference fails', async () => {
      const error = new Error('Write failed');
      vi.mocked(writePreference).mockRejectedValueOnce(error);

      await expect(appendPreference(testCwd, testPreference)).rejects.toThrow(
        'Write failed'
      );
      expect(logError).toHaveBeenCalledWith('appendPreference', error);
    });

    it('should handle non-Error objects in catch block', async () => {
      const errorString = 'String error';
      vi.mocked(ensureMemoryDir).mockRejectedValueOnce(errorString);

      await expect(appendPreference(testCwd, testPreference)).rejects.toBe(
        errorString
      );
      expect(logError).toHaveBeenCalledWith('appendPreference', errorString);
    });
  });

});
