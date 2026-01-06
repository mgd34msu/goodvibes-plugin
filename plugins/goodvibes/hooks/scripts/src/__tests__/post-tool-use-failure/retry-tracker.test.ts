/**
 * Tests for retry-tracker module
 *
 * Achieves 100% coverage for:
 * - loadRetries
 * - saveRetry
 * - getRetryCount
 * - getCurrentPhase
 * - shouldEscalatePhase
 * - escalatePhase
 * - hasExhaustedRetries
 * - getPhaseDescription
 * - getRemainingAttempts
 * - generateErrorSignature
 * - clearRetry
 * - pruneOldRetries
 * - getRetryStats
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import type { ErrorState, ErrorCategory } from '../../types/errors.js';
import type { HooksState } from '../../types/state.js';

// Mock fs/promises module
const mockAccess = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();

vi.mock('fs/promises', () => ({
  access: mockAccess,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}));

// Mock shared/index.js
const mockEnsureGoodVibesDir = vi.fn();
vi.mock('../../shared/index.js', () => ({
  ensureGoodVibesDir: mockEnsureGoodVibesDir,
}));

// Mock logging
const mockDebug = vi.fn();
vi.mock('../../shared/logging.js', () => ({
  debug: mockDebug,
}));

// Mock error-handling-core
const mockGenerateErrorSignatureCore = vi.fn();
const mockShouldEscalatePhaseCore = vi.fn();
const mockEscalatePhaseCore = vi.fn();
const mockHasExhaustedRetriesCore = vi.fn();
const mockGetPhaseDescriptionCore = vi.fn();
const mockGetRemainingAttemptsInPhase = vi.fn();

vi.mock('../../shared/error-handling-core.js', () => ({
  generateErrorSignature: mockGenerateErrorSignatureCore,
  shouldEscalatePhase: mockShouldEscalatePhaseCore,
  escalatePhase: mockEscalatePhaseCore,
  hasExhaustedRetries: mockHasExhaustedRetriesCore,
  getPhaseDescription: mockGetPhaseDescriptionCore,
  getRemainingAttemptsInPhase: mockGetRemainingAttemptsInPhase,
  MAX_PHASE: 3,
  DEFAULT_RETRY_LIMIT: 2,
}));

describe('retry-tracker', () => {
  let testCwd: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    testCwd = '/test/project';
    mockEnsureGoodVibesDir.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadRetries', () => {
    it('should return empty object when file does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const { loadRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await loadRetries(testCwd);

      expect(result).toEqual({});
      expect(mockDebug).toHaveBeenCalledWith(
        expect.stringContaining('Retries file access check failed')
      );
    });

    it('should return empty object when file contains invalid JSON', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('invalid json{');

      const { loadRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await loadRetries(testCwd);

      expect(result).toEqual({});
      expect(mockDebug).toHaveBeenCalledWith('loadRetries failed', expect.anything());
    });

    it('should return empty object when file contains non-RetryData content', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify({ invalid: 'data' }));

      const { loadRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await loadRetries(testCwd);

      expect(result).toEqual({});
    });

    it('should return empty object when RetryData has invalid entry (missing signature)', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify({
        'sig1': {
          attempts: 1,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 1,
        }
      }));

      const { loadRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await loadRetries(testCwd);

      expect(result).toEqual({});
    });

    it('should return empty object when RetryData has invalid entry (missing attempts)', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify({
        'sig1': {
          signature: 'sig1',
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 1,
        }
      }));

      const { loadRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await loadRetries(testCwd);

      expect(result).toEqual({});
    });

    it('should return empty object when RetryData has invalid entry (missing lastAttempt)', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify({
        'sig1': {
          signature: 'sig1',
          attempts: 1,
          phase: 1,
        }
      }));

      const { loadRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await loadRetries(testCwd);

      expect(result).toEqual({});
    });

    it('should return empty object when RetryData has invalid entry (missing phase)', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify({
        'sig1': {
          signature: 'sig1',
          attempts: 1,
          lastAttempt: '2025-01-01T00:00:00Z',
        }
      }));

      const { loadRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await loadRetries(testCwd);

      expect(result).toEqual({});
    });

    it('should return empty object when RetryData has entry with wrong type (signature not string)', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify({
        'sig1': {
          signature: 123,
          attempts: 1,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 1,
        }
      }));

      const { loadRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await loadRetries(testCwd);

      expect(result).toEqual({});
    });

    it('should return empty object when RetryData has entry with wrong type (attempts not number)', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify({
        'sig1': {
          signature: 'sig1',
          attempts: '1',
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 1,
        }
      }));

      const { loadRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await loadRetries(testCwd);

      expect(result).toEqual({});
    });

    it('should return empty object when RetryData has entry with wrong type (lastAttempt not string)', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify({
        'sig1': {
          signature: 'sig1',
          attempts: 1,
          lastAttempt: 123,
          phase: 1,
        }
      }));

      const { loadRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await loadRetries(testCwd);

      expect(result).toEqual({});
    });

    it('should return empty object when RetryData has entry with wrong type (phase not number)', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify({
        'sig1': {
          signature: 'sig1',
          attempts: 1,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: '1',
        }
      }));

      const { loadRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await loadRetries(testCwd);

      expect(result).toEqual({});
    });

    it('should return empty object when RetryData has null entry', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify({
        'sig1': null
      }));

      const { loadRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await loadRetries(testCwd);

      expect(result).toEqual({});
    });

    it('should load valid retry data', async () => {
      const retryData = {
        'sig1': {
          signature: 'sig1',
          attempts: 2,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 1,
        },
        'sig2': {
          signature: 'sig2',
          attempts: 5,
          lastAttempt: '2025-01-02T00:00:00Z',
          phase: 2,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { loadRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await loadRetries(testCwd);

      expect(result).toEqual(retryData);
    });

    it('should return empty object when file content is not an object', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify('string'));

      const { loadRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await loadRetries(testCwd);

      expect(result).toEqual({});
    });

    it('should return empty object when file content is null', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(null));

      const { loadRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await loadRetries(testCwd);

      expect(result).toEqual({});
    });
  });

  describe('saveRetry', () => {
    it('should create new retry entry when called with cwd string and number phase', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const { saveRetry } = await import('../../post-tool-use-failure/retry-tracker.js');
      await saveRetry(testCwd, 'sig1', 1);

      expect(mockEnsureGoodVibesDir).toHaveBeenCalledWith(testCwd);
      expect(mockWriteFile).toHaveBeenCalledWith(
        path.join(testCwd, '.goodvibes', 'state', 'retries.json'),
        expect.stringContaining('"sig1"')
      );

      const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(writtenData.sig1).toMatchObject({
        signature: 'sig1',
        attempts: 1,
        phase: 1,
      });
      expect(writtenData.sig1.lastAttempt).toBeDefined();
    });

    it('should increment attempts when retry already exists (cwd string path)', async () => {
      const existingData = {
        'sig1': {
          signature: 'sig1',
          attempts: 2,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 1,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(existingData));

      const { saveRetry } = await import('../../post-tool-use-failure/retry-tracker.js');
      await saveRetry(testCwd, 'sig1', 2);

      const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(writtenData.sig1.attempts).toBe(3);
      expect(writtenData.sig1.phase).toBe(2); // Takes max of existing and new phase
    });

    it('should use max phase when existing phase is higher (cwd string path)', async () => {
      const existingData = {
        'sig1': {
          signature: 'sig1',
          attempts: 2,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 3,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(existingData));

      const { saveRetry } = await import('../../post-tool-use-failure/retry-tracker.js');
      await saveRetry(testCwd, 'sig1', 2);

      const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(writtenData.sig1.phase).toBe(3); // Keeps higher phase
    });

    it('should handle write errors gracefully (cwd string path)', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockWriteFile.mockRejectedValue(new Error('Write failed'));

      const { saveRetry } = await import('../../post-tool-use-failure/retry-tracker.js');
      await saveRetry(testCwd, 'sig1', 1);

      expect(mockDebug).toHaveBeenCalledWith('saveRetry failed', expect.anything());
    });

    it('should create new entry when called with HooksState and ErrorState', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const errorState: ErrorState = {
        signature: 'sig1',
        category: 'typescript_error',
        phase: 2,
        attemptsThisPhase: 1,
        totalAttempts: 1,
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [],
      };

      const hooksState: HooksState = {
        session: {
          id: 'test-session',
          startedAt: '2025-01-01T00:00:00Z',
          mode: 'default',
          featureDescription: null,
        },
        errors: {},
        tests: {
          lastFullRun: null,
          lastQuickRun: null,
          passingFiles: [],
          failingFiles: [],
          pendingFixes: [],
        },
        build: {
          lastRun: null,
          status: 'unknown',
          errors: [],
          fixAttempts: 0,
        },
        git: {
          mainBranch: 'main',
          currentBranch: 'main',
          featureBranch: null,
          featureStartedAt: null,
          featureDescription: null,
          checkpoints: [],
          pendingMerge: false,
        },
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: [],
          createdThisSession: [],
        },
        devServers: {},
      };

      // Mock process.cwd()
      const originalCwd = process.cwd;
      process.cwd = vi.fn().mockReturnValue(testCwd);

      const { saveRetry } = await import('../../post-tool-use-failure/retry-tracker.js');
      await saveRetry(hooksState, 'sig1', errorState);

      expect(hooksState.errors['sig1']).toBe(errorState);
      expect(mockEnsureGoodVibesDir).toHaveBeenCalledWith(testCwd);

      const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(writtenData.sig1).toMatchObject({
        signature: 'sig1',
        attempts: 1,
        phase: 2,
      });

      process.cwd = originalCwd;
    });

    it('should use phase 1 when called with HooksState and number phase', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const hooksState: HooksState = {
        session: {
          id: 'test-session',
          startedAt: '2025-01-01T00:00:00Z',
          mode: 'default',
          featureDescription: null,
        },
        errors: {},
        tests: {
          lastFullRun: null,
          lastQuickRun: null,
          passingFiles: [],
          failingFiles: [],
          pendingFixes: [],
        },
        build: {
          lastRun: null,
          status: 'unknown',
          errors: [],
          fixAttempts: 0,
        },
        git: {
          mainBranch: 'main',
          currentBranch: 'main',
          featureBranch: null,
          featureStartedAt: null,
          featureDescription: null,
          checkpoints: [],
          pendingMerge: false,
        },
        files: {
          modifiedSinceCheckpoint: [],
          modifiedThisSession: [],
          createdThisSession: [],
        },
        devServers: {},
      };

      const originalCwd = process.cwd;
      process.cwd = vi.fn().mockReturnValue(testCwd);

      const { saveRetry } = await import('../../post-tool-use-failure/retry-tracker.js');
      await saveRetry(hooksState, 'sig1', 3);

      const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(writtenData.sig1.phase).toBe(1); // Defaults to 1 when HooksState + number

      process.cwd = originalCwd;
    });

    it('should default to phase 1 when called with cwd string and ErrorState', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const errorState: ErrorState = {
        signature: 'sig1',
        category: 'typescript_error',
        phase: 2,
        attemptsThisPhase: 1,
        totalAttempts: 1,
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [],
      };

      const { saveRetry } = await import('../../post-tool-use-failure/retry-tracker.js');
      await saveRetry(testCwd, 'sig1', errorState);

      const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(writtenData.sig1.phase).toBe(1); // Defaults to 1 when cwd string + ErrorState
    });
  });

  describe('getRetryCount', () => {
    it('should return 0 when signature does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const { getRetryCount } = await import('../../post-tool-use-failure/retry-tracker.js');
      const count = await getRetryCount(testCwd, 'nonexistent');

      expect(count).toBe(0);
    });

    it('should return attempt count for existing signature', async () => {
      const retryData = {
        'sig1': {
          signature: 'sig1',
          attempts: 5,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 2,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { getRetryCount } = await import('../../post-tool-use-failure/retry-tracker.js');
      const count = await getRetryCount(testCwd, 'sig1');

      expect(count).toBe(5);
    });
  });

  describe('getCurrentPhase', () => {
    it('should return 1 when signature does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const { getCurrentPhase } = await import('../../post-tool-use-failure/retry-tracker.js');
      const phase = await getCurrentPhase(testCwd, 'nonexistent');

      expect(phase).toBe(1);
    });

    it('should return phase for existing signature', async () => {
      const retryData = {
        'sig1': {
          signature: 'sig1',
          attempts: 5,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 3,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { getCurrentPhase } = await import('../../post-tool-use-failure/retry-tracker.js');
      const phase = await getCurrentPhase(testCwd, 'sig1');

      expect(phase).toBe(3);
    });
  });

  describe('shouldEscalatePhase', () => {
    it('should return false when called with cwd string and no entry exists', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const { shouldEscalatePhase } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await shouldEscalatePhase(testCwd, 'nonexistent', 1, 'typescript_error');

      expect(result).toBe(false);
    });

    it('should return false when attempts below limit', async () => {
      const retryData = {
        'sig1': {
          signature: 'sig1',
          attempts: 2,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 1,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { shouldEscalatePhase } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await shouldEscalatePhase(testCwd, 'sig1', 1, 'typescript_error');

      expect(result).toBe(false); // typescript_error limit is 3
    });

    it('should return true when attempts reach limit and phase below max', async () => {
      const retryData = {
        'sig1': {
          signature: 'sig1',
          attempts: 3,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 1,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { shouldEscalatePhase } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await shouldEscalatePhase(testCwd, 'sig1', 1, 'typescript_error');

      expect(result).toBe(true); // 3 >= 3 and phase 1 < 3
    });

    it('should return false when at max phase', async () => {
      const retryData = {
        'sig1': {
          signature: 'sig1',
          attempts: 3,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 3,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { shouldEscalatePhase } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await shouldEscalatePhase(testCwd, 'sig1', 3, 'typescript_error');

      expect(result).toBe(false); // phase 3 is max
    });

    it('should use currentPhase parameter when provided', async () => {
      const retryData = {
        'sig1': {
          signature: 'sig1',
          attempts: 2,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 1,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { shouldEscalatePhase } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await shouldEscalatePhase(testCwd, 'sig1', 2, 'npm_install');

      expect(result).toBe(true); // npm_install limit is 2, attempts 2 >= 2, phase 2 < 3
    });

    it('should use entry.phase when currentPhase is undefined', async () => {
      const retryData = {
        'sig1': {
          signature: 'sig1',
          attempts: 2,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 2,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { shouldEscalatePhase } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await shouldEscalatePhase(testCwd, 'sig1', undefined, 'npm_install');

      expect(result).toBe(true); // npm_install limit is 2, attempts 2 >= 2, phase 2 (from entry) < 3
    });

    it('should delegate to core when called with ErrorState', async () => {
      const errorState: ErrorState = {
        signature: 'sig1',
        category: 'typescript_error',
        phase: 1,
        attemptsThisPhase: 3,
        totalAttempts: 3,
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [],
      };

      mockShouldEscalatePhaseCore.mockReturnValue(true);

      const { shouldEscalatePhase } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await shouldEscalatePhase(errorState);

      expect(mockShouldEscalatePhaseCore).toHaveBeenCalledWith(errorState);
      expect(result).toBe(true);
    });

    it('should return false when called with invalid type', async () => {
      const { shouldEscalatePhase } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await shouldEscalatePhase(123);

      expect(result).toBe(false);
    });
  });

  describe('escalatePhase', () => {
    it('should delegate to core escalatePhase', async () => {
      const errorState: ErrorState = {
        signature: 'sig1',
        category: 'typescript_error',
        phase: 1,
        attemptsThisPhase: 3,
        totalAttempts: 3,
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [],
      };

      const escalatedState: ErrorState = {
        ...errorState,
        phase: 2,
        attemptsThisPhase: 0,
      };

      mockEscalatePhaseCore.mockReturnValue(escalatedState);

      const { escalatePhase } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = escalatePhase(errorState);

      expect(mockEscalatePhaseCore).toHaveBeenCalledWith(errorState);
      expect(result).toBe(escalatedState);
    });
  });

  describe('hasExhaustedRetries', () => {
    it('should return false when called with cwd string and no entry exists', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const { hasExhaustedRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await hasExhaustedRetries(testCwd, 'nonexistent', 'typescript_error');

      expect(result).toBe(false);
    });

    it('should return false when not at max phase', async () => {
      const retryData = {
        'sig1': {
          signature: 'sig1',
          attempts: 5,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 2,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { hasExhaustedRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await hasExhaustedRetries(testCwd, 'sig1', 'typescript_error');

      expect(result).toBe(false); // phase 2 < 3
    });

    it('should return false when at max phase but attempts below limit', async () => {
      const retryData = {
        'sig1': {
          signature: 'sig1',
          attempts: 2,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 3,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { hasExhaustedRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await hasExhaustedRetries(testCwd, 'sig1', 'typescript_error');

      expect(result).toBe(false); // 2 < 3 (typescript_error limit)
    });

    it('should return true when at max phase and attempts reach limit', async () => {
      const retryData = {
        'sig1': {
          signature: 'sig1',
          attempts: 3,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 3,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { hasExhaustedRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await hasExhaustedRetries(testCwd, 'sig1', 'typescript_error');

      expect(result).toBe(true); // phase 3 >= 3 and attempts 3 >= 3
    });

    it('should delegate to core when called with ErrorState', async () => {
      const errorState: ErrorState = {
        signature: 'sig1',
        category: 'typescript_error',
        phase: 3,
        attemptsThisPhase: 3,
        totalAttempts: 9,
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [],
      };

      mockHasExhaustedRetriesCore.mockReturnValue(true);

      const { hasExhaustedRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await hasExhaustedRetries(errorState);

      expect(mockHasExhaustedRetriesCore).toHaveBeenCalledWith(errorState);
      expect(result).toBe(true);
    });

    it('should return false when called with invalid type', async () => {
      const { hasExhaustedRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await hasExhaustedRetries(123);

      expect(result).toBe(false);
    });
  });

  describe('getPhaseDescription', () => {
    it('should delegate to core getPhaseDescription', async () => {
      mockGetPhaseDescriptionCore.mockReturnValue('Phase 1 description');

      const { getPhaseDescription } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = getPhaseDescription(1);

      expect(mockGetPhaseDescriptionCore).toHaveBeenCalledWith(1);
      expect(result).toBe('Phase 1 description');
    });
  });

  describe('getRemainingAttempts', () => {
    it('should return full limit when called with cwd string and no entry exists', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const { getRemainingAttempts } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await getRemainingAttempts(testCwd, 'nonexistent', 'typescript_error');

      expect(result).toBe(3); // typescript_error limit
    });

    it('should return remaining attempts for existing entry', async () => {
      const retryData = {
        'sig1': {
          signature: 'sig1',
          attempts: 2,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 1,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { getRemainingAttempts } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await getRemainingAttempts(testCwd, 'sig1', 'typescript_error');

      expect(result).toBe(1); // 3 - 2 = 1
    });

    it('should return 0 when attempts exceed limit', async () => {
      const retryData = {
        'sig1': {
          signature: 'sig1',
          attempts: 5,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 1,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { getRemainingAttempts } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await getRemainingAttempts(testCwd, 'sig1', 'typescript_error');

      expect(result).toBe(0); // Max(0, 3 - 5) = 0
    });

    it('should delegate to core when called with ErrorState', async () => {
      const errorState: ErrorState = {
        signature: 'sig1',
        category: 'typescript_error',
        phase: 1,
        attemptsThisPhase: 2,
        totalAttempts: 2,
        officialDocsSearched: [],
        officialDocsContent: '',
        unofficialDocsSearched: [],
        unofficialDocsContent: '',
        fixStrategiesAttempted: [],
      };

      mockGetRemainingAttemptsInPhase.mockReturnValue(1);

      const { getRemainingAttempts } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await getRemainingAttempts(errorState);

      expect(mockGetRemainingAttemptsInPhase).toHaveBeenCalledWith(errorState);
      expect(result).toBe(1);
    });

    it('should return category limit for invalid type', async () => {
      const { getRemainingAttempts } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = await getRemainingAttempts(123, undefined, 'npm_install');

      expect(result).toBe(2); // npm_install limit from PHASE_RETRY_LIMITS
    });
  });

  describe('generateErrorSignature', () => {
    it('should delegate to core generateErrorSignature with error only', async () => {
      mockGenerateErrorSignatureCore.mockReturnValue('err_abc123');

      const { generateErrorSignature } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = generateErrorSignature('Test error');

      expect(mockGenerateErrorSignatureCore).toHaveBeenCalledWith('Test error', undefined);
      expect(result).toBe('err_abc123');
    });

    it('should delegate to core generateErrorSignature with error and toolName', async () => {
      mockGenerateErrorSignatureCore.mockReturnValue('Bash:abc123');

      const { generateErrorSignature } = await import('../../post-tool-use-failure/retry-tracker.js');
      const result = generateErrorSignature('Test error', 'Bash');

      expect(mockGenerateErrorSignatureCore).toHaveBeenCalledWith('Test error', 'Bash');
      expect(result).toBe('Bash:abc123');
    });
  });

  describe('clearRetry', () => {
    it('should do nothing when signature does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const { clearRetry } = await import('../../post-tool-use-failure/retry-tracker.js');
      await clearRetry(testCwd, 'nonexistent');

      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should remove signature from retry data', async () => {
      const retryData = {
        'sig1': {
          signature: 'sig1',
          attempts: 2,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 1,
        },
        'sig2': {
          signature: 'sig2',
          attempts: 3,
          lastAttempt: '2025-01-02T00:00:00Z',
          phase: 2,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { clearRetry } = await import('../../post-tool-use-failure/retry-tracker.js');
      await clearRetry(testCwd, 'sig1');

      expect(mockWriteFile).toHaveBeenCalled();
      const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(writtenData).not.toHaveProperty('sig1');
      expect(writtenData).toHaveProperty('sig2');
    });

    it('should handle write errors gracefully', async () => {
      const retryData = {
        'sig1': {
          signature: 'sig1',
          attempts: 2,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 1,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));
      mockWriteFile.mockRejectedValue(new Error('Write failed'));

      const { clearRetry } = await import('../../post-tool-use-failure/retry-tracker.js');
      await clearRetry(testCwd, 'sig1');

      expect(mockDebug).toHaveBeenCalledWith('writeRetryData failed', expect.anything());
    });
  });

  describe('pruneOldRetries', () => {
    it('should remove entries older than maxAgeHours', async () => {
      const now = new Date();
      const oldDate = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours ago
      const recentDate = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago

      const retryData = {
        'old-sig': {
          signature: 'old-sig',
          attempts: 2,
          lastAttempt: oldDate.toISOString(),
          phase: 1,
        },
        'recent-sig': {
          signature: 'recent-sig',
          attempts: 3,
          lastAttempt: recentDate.toISOString(),
          phase: 2,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { pruneOldRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      await pruneOldRetries(testCwd, 24);

      expect(mockWriteFile).toHaveBeenCalled();
      const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(writtenData).not.toHaveProperty('old-sig');
      expect(writtenData).toHaveProperty('recent-sig');
    });

    it('should not write when no entries are old', async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago

      const retryData = {
        'recent-sig': {
          signature: 'recent-sig',
          attempts: 3,
          lastAttempt: recentDate.toISOString(),
          phase: 2,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { pruneOldRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      await pruneOldRetries(testCwd, 24);

      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should use default maxAgeHours of 24 when not provided', async () => {
      const now = new Date();
      const oldDate = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours ago

      const retryData = {
        'old-sig': {
          signature: 'old-sig',
          attempts: 2,
          lastAttempt: oldDate.toISOString(),
          phase: 1,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { pruneOldRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      await pruneOldRetries(testCwd);

      expect(mockWriteFile).toHaveBeenCalled();
      const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(writtenData).not.toHaveProperty('old-sig');
    });

    it('should handle write errors gracefully', async () => {
      const now = new Date();
      const oldDate = new Date(now.getTime() - 25 * 60 * 60 * 1000);

      const retryData = {
        'old-sig': {
          signature: 'old-sig',
          attempts: 2,
          lastAttempt: oldDate.toISOString(),
          phase: 1,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));
      mockWriteFile.mockRejectedValue(new Error('Write failed'));

      const { pruneOldRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      await pruneOldRetries(testCwd, 24);

      expect(mockDebug).toHaveBeenCalledWith('writeRetryData failed', expect.anything());
    });

    it('should handle empty retry data', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const { pruneOldRetries } = await import('../../post-tool-use-failure/retry-tracker.js');
      await pruneOldRetries(testCwd, 24);

      expect(mockWriteFile).not.toHaveBeenCalled();
    });
  });

  describe('getRetryStats', () => {
    it('should return empty stats when no retries exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const { getRetryStats } = await import('../../post-tool-use-failure/retry-tracker.js');
      const stats = await getRetryStats(testCwd);

      expect(stats).toEqual({
        totalSignatures: 0,
        totalAttempts: 0,
        phase1Count: 0,
        phase2Count: 0,
        phase3Count: 0,
      });
    });

    it('should calculate stats correctly', async () => {
      const retryData = {
        'sig1': {
          signature: 'sig1',
          attempts: 2,
          lastAttempt: '2025-01-01T00:00:00Z',
          phase: 1,
        },
        'sig2': {
          signature: 'sig2',
          attempts: 3,
          lastAttempt: '2025-01-02T00:00:00Z',
          phase: 1,
        },
        'sig3': {
          signature: 'sig3',
          attempts: 5,
          lastAttempt: '2025-01-03T00:00:00Z',
          phase: 2,
        },
        'sig4': {
          signature: 'sig4',
          attempts: 7,
          lastAttempt: '2025-01-04T00:00:00Z',
          phase: 3,
        },
        'sig5': {
          signature: 'sig5',
          attempts: 1,
          lastAttempt: '2025-01-05T00:00:00Z',
          phase: 3,
        },
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(retryData));

      const { getRetryStats } = await import('../../post-tool-use-failure/retry-tracker.js');
      const stats = await getRetryStats(testCwd);

      expect(stats).toEqual({
        totalSignatures: 5,
        totalAttempts: 18, // 2 + 3 + 5 + 7 + 1
        phase1Count: 2,
        phase2Count: 1,
        phase3Count: 2,
      });
    });
  });
});
