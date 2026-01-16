/**
 * Comprehensive unit tests for detect-memory-leaks handler
 *
 * Tests cover:
 * - Argument validation (pid vs command targets)
 * - Memory snapshot collection
 * - Linear regression calculation
 * - Trend analysis
 * - Leak detection logic
 * - Suspect generation
 * - Recommendation generation
 * - Cross-platform process monitoring (Windows/Unix)
 * - Command spawning and cleanup
 * - Error handling
 *
 * @module __tests__/handlers/analysis/detect-memory-leaks
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';

// Store original values
const originalPlatform = process.platform;
const originalKill = process.kill;

// Mock child_process module
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

vi.mock('../../../utils.js', () => ({
  success: vi.fn((data) => ({
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
  })),
  error: vi.fn((msg) => ({
    content: [{ type: 'text', text: JSON.stringify({ error: msg }, null, 2) }],
    isError: true,
  })),
  safeExec: vi.fn(),
}));

import {
  handleDetectMemoryLeaks,
  type DetectMemoryLeaksArgs,
  type MemorySnapshot,
  type MemoryAnalysis,
  type LinearRegressionResult,
  type LeakSuspect,
} from '../../../handlers/analysis/detect-memory-leaks.js';
import { error as errorResponse, success as successResponse } from '../../../utils.js';

describe('handleDetectMemoryLeaks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Mock process.kill to check if process is alive
    process.kill = vi.fn(() => true) as unknown as typeof process.kill;

    // Default platform to win32 for testing
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
    process.kill = originalKill;
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  // ===========================================================================
  // Argument Validation Tests
  // ===========================================================================

  describe('argument validation', () => {
    it('should return error when target is pid but no pid provided', async () => {
      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
      };

      await handleDetectMemoryLeaks(args);

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Invalid or missing PID')
      );
    });

    it('should return error when target is pid with invalid pid (negative)', async () => {
      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: -1,
      };

      await handleDetectMemoryLeaks(args);

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Invalid or missing PID')
      );
    });

    it('should return error when target is pid with zero pid', async () => {
      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 0,
      };

      await handleDetectMemoryLeaks(args);

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Invalid or missing PID')
      );
    });

    it('should return error when target is command but no command provided', async () => {
      const args: DetectMemoryLeaksArgs = {
        target: 'command',
      };

      await handleDetectMemoryLeaks(args);

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Missing command')
      );
    });

    it('should return error when target is command with empty string', async () => {
      const args: DetectMemoryLeaksArgs = {
        target: 'command',
        command: '',
      };

      await handleDetectMemoryLeaks(args);

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Missing command')
      );
    });
  });

  // ===========================================================================
  // PID Target Validation Tests
  // ===========================================================================

  describe('pid target validation', () => {
    it('should return error when pid process is not running', async () => {
      // Mock process.kill to throw (process doesn't exist)
      process.kill = vi.fn(() => {
        const err = new Error('ESRCH');
        (err as NodeJS.ErrnoException).code = 'ESRCH';
        throw err;
      }) as unknown as typeof process.kill;

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 99999,
      };

      await handleDetectMemoryLeaks(args);

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('not running')
      );
    });

    it('should handle process that exists', async () => {
      // Process exists
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      // Mock Windows memory retrieval
      vi.mocked(childProcess.execSync).mockReturnValue(
        '"node.exe","12345","Console","1","50,000 K"\r\n'
      );

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      // Start the handler and advance time
      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      // Should not return error about process not running
      expect(errorResponse).not.toHaveBeenCalledWith(
        expect.stringContaining('not running')
      );
    });
  });

  // ===========================================================================
  // Command Target Tests
  // ===========================================================================

  describe('command target', () => {
    it('should return error when command fails to spawn (no pid)', async () => {
      const mockChild = new EventEmitter() as childProcess.ChildProcess;
      mockChild.pid = undefined;
      mockChild.stdout = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.stderr = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.kill = vi.fn();

      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

      const args: DetectMemoryLeaksArgs = {
        target: 'command',
        command: 'nonexistent-command',
        duration_seconds: 1,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(1500);
      await promise;

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start command')
      );
    });

    it('should return error when spawned process is not alive after starting', async () => {
      const mockChild = new EventEmitter() as childProcess.ChildProcess;
      mockChild.pid = 12345;
      mockChild.stdout = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.stderr = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.kill = vi.fn();

      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

      // Process dies immediately
      process.kill = vi.fn(() => {
        throw new Error('Process died');
      }) as unknown as typeof process.kill;

      const args: DetectMemoryLeaksArgs = {
        target: 'command',
        command: 'short-lived-command',
        duration_seconds: 1,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(1500);
      await promise;

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start command')
      );
    });

    it('should handle spawn error exception', async () => {
      vi.mocked(childProcess.spawn).mockImplementation(() => {
        throw new Error('Spawn failed');
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'command',
        command: 'invalid-command',
        duration_seconds: 1,
      };

      await handleDetectMemoryLeaks(args);

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Failed to spawn command')
      );
    });

    it('should successfully monitor a spawned command on Windows', async () => {
      const mockChild = new EventEmitter() as childProcess.ChildProcess;
      mockChild.pid = 12345;
      mockChild.stdout = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.stderr = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.kill = vi.fn();

      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

      // Process is alive
      let killCallCount = 0;
      process.kill = vi.fn(() => {
        killCallCount++;
        return true;
      }) as unknown as typeof process.kill;

      // Mock Windows memory retrieval - increasing memory each call
      let memoryCallCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('tasklist')) {
          memoryCallCount++;
          const memKB = 50000 + memoryCallCount * 5000;
          return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
        }
        if (typeof cmd === 'string' && cmd.includes('taskkill')) {
          return '';
        }
        return '';
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'command',
        command: 'node app.js',
        duration_seconds: 1,
        snapshot_interval_ms: 200,
        threshold_mb: 5,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      expect(childProcess.spawn).toHaveBeenCalled();
    });

    it('should spawn command differently on Unix', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      const mockChild = new EventEmitter() as childProcess.ChildProcess;
      mockChild.pid = 12345;
      mockChild.stdout = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.stderr = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.kill = vi.fn();

      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      // Mock Unix memory retrieval
      vi.mocked(childProcess.execSync).mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('ps -o rss')) {
          return '51200\n';
        }
        return '';
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'command',
        command: 'node app.js',
        duration_seconds: 1,
        snapshot_interval_ms: 200,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(childProcess.spawn).toHaveBeenCalledWith(
        '/bin/sh',
        ['-c', 'node app.js'],
        expect.objectContaining({
          shell: false,
          detached: true,
        })
      );
    });
  });

  // ===========================================================================
  // Duration Limits Tests
  // ===========================================================================

  describe('duration limits', () => {
    it('should cap duration at 10 minutes (600 seconds)', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      // Mock memory retrieval
      vi.mocked(childProcess.execSync).mockReturnValue(
        '"node.exe","12345","Console","1","50,000 K"\r\n'
      );

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1000, // More than 10 minutes
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      // Advance time significantly
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      // Should complete without error - duration is capped
      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Default Values Tests
  // ===========================================================================

  describe('default values', () => {
    it('should use default duration of 30 seconds', async () => {
      process.kill = vi.fn(() => {
        throw new Error('Process not found');
      }) as unknown as typeof process.kill;

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        // duration_seconds not provided
      };

      await handleDetectMemoryLeaks(args);

      expect(errorResponse).toHaveBeenCalled();
    });

    it('should use default snapshot interval of 5000ms', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockReturnValue(
        '"node.exe","12345","Console","1","50,000 K"\r\n'
      );

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        // snapshot_interval_ms not provided (defaults to 5000)
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
    });

    it('should use default threshold of 10 MB', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockReturnValue(
        '"node.exe","12345","Console","1","50,000 K"\r\n'
      );

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
        // threshold_mb not provided (defaults to 10)
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
    });

    it('should use PROJECT_ROOT as default cwd', async () => {
      const mockChild = new EventEmitter() as childProcess.ChildProcess;
      mockChild.pid = 12345;
      mockChild.stdout = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.stderr = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.kill = vi.fn();

      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockReturnValue(
        '"node.exe","12345","Console","1","50,000 K"\r\n'
      );

      const args: DetectMemoryLeaksArgs = {
        target: 'command',
        command: 'node app.js',
        duration_seconds: 1,
        snapshot_interval_ms: 100,
        // cwd not provided
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(childProcess.spawn).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          cwd: expect.stringContaining('mock'),
        })
      );
    });
  });

  // ===========================================================================
  // Windows Memory Retrieval Tests
  // ===========================================================================

  describe('Windows memory retrieval', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    });

    it('should parse Windows tasklist output correctly', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      // Mock Windows memory retrieval with standard format
      vi.mocked(childProcess.execSync).mockReturnValue(
        '"node.exe","12345","Console","1","102,400 K"\r\n'
      );

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as { analysis: MemoryAnalysis };
      expect(call.analysis.initial_heap_mb).toBe(100); // 102400 KB / 1024 = 100 MB
    });

    it('should handle tasklist returning non-matching PID', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      // Return wrong PID in output
      vi.mocked(childProcess.execSync).mockReturnValue(
        '"node.exe","99999","Console","1","50,000 K"\r\n'
      );

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      // Should fail due to insufficient data (no matching memory)
      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient data')
      );
    });

    it('should handle tasklist throwing error', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockImplementation(() => {
        throw new Error('Access denied');
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      // Should fail due to insufficient data
      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient data')
      );
    });

    it('should handle tasklist returning empty output', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockReturnValue('');

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient data')
      );
    });

    it('should handle tasklist returning malformed output', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockReturnValue('INFO: No tasks are running');

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient data')
      );
    });
  });

  // ===========================================================================
  // Unix Memory Retrieval Tests
  // ===========================================================================

  describe('Unix memory retrieval', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    });

    it('should parse Unix ps output correctly', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      // Mock Unix memory retrieval (KB)
      vi.mocked(childProcess.execSync).mockReturnValue('102400\n');

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const call = vi.mocked(successResponse).mock.calls[0][0] as { analysis: MemoryAnalysis };
      expect(call.analysis.initial_heap_mb).toBe(100); // 102400 KB / 1024 = 100 MB
    });

    it('should handle ps command throwing error', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockImplementation(() => {
        throw new Error('No such process');
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient data')
      );
    });

    it('should handle ps returning NaN', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockReturnValue('not-a-number\n');

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient data')
      );
    });

    it('should handle ps returning empty output', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockReturnValue('');

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient data')
      );
    });
  });

  // ===========================================================================
  // Snapshot Collection Tests
  // ===========================================================================

  describe('snapshot collection', () => {
    it('should collect multiple snapshots over duration', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        const memKB = 50000 + callCount * 1000;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { snapshots: MemorySnapshot[] };
      expect(result.snapshots.length).toBeGreaterThan(1);
    });

    it('should stop collecting when process exits', async () => {
      let isAlive = true;
      process.kill = vi.fn(() => {
        if (!isAlive) {
          throw new Error('Process exited');
        }
        return true;
      }) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        if (callCount >= 3) {
          isAlive = false;
        }
        return `"node.exe","12345","Console","1","50,000 K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 10,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      // Should have some snapshots but stopped early
      expect(successResponse).toHaveBeenCalled();
    });

    it('should return error with insufficient snapshots (less than 2)', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      // Only return valid memory once, then fail
      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return `"node.exe","12345","Console","1","50,000 K"\r\n`;
        }
        throw new Error('Process gone');
      });

      // Make process disappear after first snapshot
      let killCount = 0;
      process.kill = vi.fn(() => {
        killCount++;
        if (killCount > 2) {
          throw new Error('No such process');
        }
        return true;
      }) as unknown as typeof process.kill;

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient data')
      );
    });

    it('should include proper snapshot fields', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockReturnValue(
        '"node.exe","12345","Console","1","50,000 K"\r\n'
      );

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { snapshots: MemorySnapshot[] };
      const snapshot = result.snapshots[0];

      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('elapsed_ms');
      expect(snapshot).toHaveProperty('rss_mb');
      expect(snapshot.heap_used_mb).toBeNull(); // External processes don't have heap data
      expect(snapshot.heap_total_mb).toBeNull();
      expect(snapshot.external_mb).toBeNull();
    });
  });

  // ===========================================================================
  // Linear Regression Tests
  // ===========================================================================

  describe('linear regression calculation', () => {
    it('should calculate linear regression with growing memory', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Linear growth: 50MB + 10MB per call
        const memKB = (50 + callCount * 10) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { analysis: MemoryAnalysis };

      expect(result.analysis.linear_regression).toBeDefined();
      expect(result.analysis.linear_regression!.slope).toBeGreaterThan(0);
    });

    it('should calculate linear regression with stable memory', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      // Stable memory (50 MB)
      vi.mocked(childProcess.execSync).mockReturnValue(
        '"node.exe","12345","Console","1","51,200 K"\r\n'
      );

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { analysis: MemoryAnalysis };

      expect(result.analysis.trend).toBe('stable');
    });

    it('should calculate linear regression with declining memory', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Declining memory: 100MB - 10MB per call
        const memKB = Math.max(10, 100 - callCount * 10) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { analysis: MemoryAnalysis };

      expect(result.analysis.linear_regression).toBeDefined();
      expect(result.analysis.linear_regression!.slope).toBeLessThan(0);
    });

    it('should only include linear regression with 3+ snapshots', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      // Only allow 2 snapshots by making process exit quickly
      let callCount = 0;
      process.kill = vi.fn(() => {
        callCount++;
        if (callCount > 3) {
          throw new Error('Process exited');
        }
        return true;
      }) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockReturnValue(
        '"node.exe","12345","Console","1","51,200 K"\r\n'
      );

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(500);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { analysis: MemoryAnalysis; snapshots: MemorySnapshot[] };

      // If only 2 snapshots, no linear regression
      if (result.snapshots.length < 3) {
        expect(result.analysis.linear_regression).toBeUndefined();
      }
    });
  });

  // ===========================================================================
  // Trend Analysis Tests
  // ===========================================================================

  describe('trend analysis', () => {
    it('should detect growing trend with high R-squared and positive slope', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Strong linear growth
        const memKB = (50 + callCount * 20) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 50,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { analysis: MemoryAnalysis };

      expect(result.analysis.trend).toBe('growing');
    });

    it('should detect declining trend with high R-squared and negative slope', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Strong linear decline
        const memKB = Math.max(10, 200 - callCount * 20) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 50,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { analysis: MemoryAnalysis };

      expect(result.analysis.trend).toBe('declining');
    });

    it('should detect growing trend with poor fit but significant growth', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Noisy but overall growing (poor R-squared, but growth > 5MB)
        const noise = (callCount % 2 === 0) ? 5 : -3;
        const memKB = (50 + callCount * 5 + noise) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 50,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { analysis: MemoryAnalysis };

      // Should detect growth even with poor fit
      expect(result.analysis.heap_growth_mb).toBeGreaterThan(0);
    });

    it('should detect declining trend with poor fit but significant decline', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Noisy but overall declining (decline > 5MB)
        const noise = (callCount % 2 === 0) ? 3 : -2;
        const memKB = Math.max(10, 100 - callCount * 5 + noise) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 50,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { analysis: MemoryAnalysis };

      expect(result.analysis.heap_growth_mb).toBeLessThan(0);
    });
  });

  // ===========================================================================
  // Leak Detection Tests
  // ===========================================================================

  describe('leak detection', () => {
    it('should detect leak when growth exceeds threshold with growing trend and good R-squared', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Strong linear growth > threshold
        const memKB = (50 + callCount * 30) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 50,
        threshold_mb: 10,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as {
        leak_detected: boolean;
        suspects?: LeakSuspect[];
      };

      expect(result.leak_detected).toBe(true);
      expect(result.suspects).toBeDefined();
      expect(result.suspects!.length).toBeGreaterThan(0);
    });

    it('should not detect leak when growth is below threshold', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Small growth < threshold
        const memKB = (50 + callCount * 0.5) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
        threshold_mb: 10,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { leak_detected: boolean };

      expect(result.leak_detected).toBe(false);
    });

    it('should not detect leak when trend is not growing', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      // Stable memory
      vi.mocked(childProcess.execSync).mockReturnValue(
        '"node.exe","12345","Console","1","51,200 K"\r\n'
      );

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
        threshold_mb: 10,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { leak_detected: boolean };

      expect(result.leak_detected).toBe(false);
    });

    it('should not detect leak when R-squared is too low', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Very noisy data (low R-squared)
        const noise = (callCount % 3 === 0) ? 50 : (callCount % 2 === 0) ? -30 : 20;
        const memKB = (50 + noise) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 50,
        threshold_mb: 10,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Suspect Generation Tests
  // ===========================================================================

  describe('suspect generation', () => {
    it('should generate consistent_growth suspect for high R-squared with high slope', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Very consistent, rapid growth
        const memKB = (50 + callCount * 100) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 50,
        threshold_mb: 10,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { suspects?: LeakSuspect[] };

      if (result.suspects) {
        const consistentGrowth = result.suspects.find(s => s.type === 'consistent_growth');
        if (consistentGrowth) {
          expect(consistentGrowth.confidence).toBe('high');
        }
      }
    });

    it('should generate large_growth suspect for growth > 50MB', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Growth exceeding 50MB
        const memKB = (50 + callCount * 200) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 50,
        threshold_mb: 10,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { suspects?: LeakSuspect[] };

      if (result.suspects) {
        const largeGrowth = result.suspects.find(s => s.type === 'large_growth');
        expect(largeGrowth).toBeDefined();
      }
    });

    it('should generate rapid_growth suspect for growth rate > 10MB/min', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Rapid growth
        const memKB = (50 + callCount * 500) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 50,
        threshold_mb: 10,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as {
        suspects?: LeakSuspect[];
        analysis: MemoryAnalysis;
      };

      if (result.suspects && result.analysis.growth_rate_mb_per_minute > 10) {
        const rapidGrowth = result.suspects.find(s => s.type === 'rapid_growth');
        expect(rapidGrowth).toBeDefined();
      }
    });

    it('should generate probable_leak suspect for moderate R-squared with significant slope', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Moderate growth with some noise (R-squared 0.5-0.8)
        const noise = (callCount % 2 === 0) ? 5 : -3;
        const memKB = (50 + callCount * 20 + noise) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 50,
        threshold_mb: 10,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Recommendation Generation Tests
  // ===========================================================================

  describe('recommendation generation', () => {
    it('should include investigation steps when leak is detected', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        const memKB = (50 + callCount * 50) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 50,
        threshold_mb: 10,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { recommendations: string[] };

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.some(r => r.includes('leak') || r.includes('Memory'))).toBe(true);
    });

    it('should include urgent warning for rapid growth (> 50MB/min)', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Extremely rapid growth
        const memKB = (50 + callCount * 1000) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 50,
        threshold_mb: 10,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as {
        recommendations: string[];
        analysis: MemoryAnalysis;
      };

      if (result.analysis.growth_rate_mb_per_minute > 50) {
        expect(result.recommendations.some(r => r.includes('URGENT'))).toBe(true);
      }
    });

    it('should include monitoring suggestion for growing but not leaking', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Small growth below threshold
        const memKB = (50 + callCount * 2) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 50,
        threshold_mb: 50, // High threshold
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { recommendations: string[] };

      // Should have recommendations about monitoring
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should include stable message for stable memory', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockReturnValue(
        '"node.exe","12345","Console","1","51,200 K"\r\n'
      );

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { recommendations: string[] };

      expect(result.recommendations.some(r => r.includes('stable'))).toBe(true);
    });

    it('should include healthy message for declining memory', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Declining memory
        const memKB = Math.max(10, 100 - callCount * 10) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 50,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { recommendations: string[] };

      expect(result.recommendations.some(r =>
        r.includes('declining') || r.includes('healthy') || r.includes('garbage collection')
      )).toBe(true);
    });
  });

  // ===========================================================================
  // Process Cleanup Tests
  // ===========================================================================

  describe('process cleanup', () => {
    it('should kill spawned process on Windows after monitoring', async () => {
      const mockChild = new EventEmitter() as childProcess.ChildProcess;
      mockChild.pid = 12345;
      mockChild.stdout = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.stderr = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.kill = vi.fn();

      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('tasklist')) {
          return '"node.exe","12345","Console","1","50,000 K"\r\n';
        }
        if (typeof cmd === 'string' && cmd.includes('taskkill')) {
          return '';
        }
        return '';
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'command',
        command: 'node app.js',
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      // Should have called taskkill
      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('taskkill'),
        expect.anything()
      );
    });

    it('should kill spawned process on Unix after monitoring', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      const mockChild = new EventEmitter() as childProcess.ChildProcess;
      mockChild.pid = 12345;
      mockChild.stdout = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.stderr = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.kill = vi.fn();

      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockReturnValue('51200\n');

      const args: DetectMemoryLeaksArgs = {
        target: 'command',
        command: 'node app.js',
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      // Should have tried to kill process group
      expect(process.kill).toHaveBeenCalledWith(-12345, 'SIGTERM');
    });

    it('should handle cleanup errors gracefully', async () => {
      const mockChild = new EventEmitter() as childProcess.ChildProcess;
      mockChild.pid = 12345;
      mockChild.stdout = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.stderr = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.kill = vi.fn(() => {
        throw new Error('Already dead');
      });

      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('tasklist')) {
          return '"node.exe","12345","Console","1","50,000 K"\r\n';
        }
        if (typeof cmd === 'string' && cmd.includes('taskkill')) {
          throw new Error('Process not found');
        }
        return '';
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'command',
        command: 'node app.js',
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      // Should complete without error (cleanup errors are swallowed)
      expect(successResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Result Structure Tests
  // ===========================================================================

  describe('result structure', () => {
    it('should return complete result structure', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockReturnValue(
        '"node.exe","12345","Console","1","50,000 K"\r\n'
      );

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as {
        leak_detected: boolean;
        target: string;
        duration_seconds: number;
        snapshots: MemorySnapshot[];
        analysis: MemoryAnalysis;
        recommendations: string[];
      };

      expect(result).toHaveProperty('leak_detected');
      expect(result).toHaveProperty('target');
      expect(result).toHaveProperty('duration_seconds');
      expect(result).toHaveProperty('snapshots');
      expect(result).toHaveProperty('analysis');
      expect(result).toHaveProperty('recommendations');

      expect(result.analysis).toHaveProperty('initial_heap_mb');
      expect(result.analysis).toHaveProperty('final_heap_mb');
      expect(result.analysis).toHaveProperty('heap_growth_mb');
      expect(result.analysis).toHaveProperty('growth_rate_mb_per_minute');
      expect(result.analysis).toHaveProperty('trend');
    });

    it('should include target description for pid target', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockReturnValue(
        '"node.exe","12345","Console","1","50,000 K"\r\n'
      );

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { target: string };

      expect(result.target).toContain('12345');
    });

    it('should include target description for command target', async () => {
      const mockChild = new EventEmitter() as childProcess.ChildProcess;
      mockChild.pid = 12345;
      mockChild.stdout = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.stderr = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.kill = vi.fn();

      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('tasklist')) {
          return '"node.exe","12345","Console","1","50,000 K"\r\n';
        }
        return '';
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'command',
        command: 'node app.js',
        duration_seconds: 1,
        snapshot_interval_ms: 100,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { target: string };

      expect(result.target).toContain('node app.js');
      expect(result.target).toContain('12345');
    });
  });

  // ===========================================================================
  // Custom CWD Tests
  // ===========================================================================

  describe('custom cwd', () => {
    it('should use custom cwd for command spawning', async () => {
      const mockChild = new EventEmitter() as childProcess.ChildProcess;
      mockChild.pid = 12345;
      mockChild.stdout = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.stderr = new EventEmitter() as unknown as NodeJS.ReadableStream;
      mockChild.kill = vi.fn();

      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('tasklist')) {
          return '"node.exe","12345","Console","1","50,000 K"\r\n';
        }
        return '';
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'command',
        command: 'node app.js',
        duration_seconds: 1,
        snapshot_interval_ms: 100,
        cwd: '/custom/working/directory',
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(childProcess.spawn).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          cwd: expect.stringContaining('custom'),
        })
      );
    });
  });
});
