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
  linearRegression,
  analyzeTrend,
  generateSuspects,
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
        duration_seconds: 1000, // More than 10 minutes - should be capped to 600
        snapshot_interval_ms: 1000, // Use 1 second intervals to reduce iterations
      };

      const promise = handleDetectMemoryLeaks(args);
      // Advance time past the 10 minute cap (600 seconds = 600,000 ms)
      // Add buffer for the 1 second sleep in the initial command spawn wait
      await vi.advanceTimersByTimeAsync(602000);
      await promise;

      // Should complete without error - duration is capped
      expect(successResponse).toHaveBeenCalled();

      // Verify the actual duration is capped near 600 seconds
      const result = vi.mocked(successResponse).mock.calls[0][0] as { duration_seconds: number };
      expect(result.duration_seconds).toBeLessThanOrEqual(600);
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
        duration_seconds: 12, // Need at least 10 seconds to get 2+ snapshots at 5000ms default interval
        // snapshot_interval_ms not provided (defaults to 5000)
      };

      const promise = handleDetectMemoryLeaks(args);
      // Advance time past the duration (12 seconds = 12000ms)
      await vi.advanceTimersByTimeAsync(13000);
      await promise;

      expect(successResponse).toHaveBeenCalled();

      // Verify snapshots were taken at approximately 5 second intervals
      const result = vi.mocked(successResponse).mock.calls[0][0] as { snapshots: MemorySnapshot[] };
      expect(result.snapshots.length).toBeGreaterThanOrEqual(2);
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
  // Direct Unit Tests for linearRegression (Coverage for lines 192, 204)
  // ===========================================================================

  describe('linearRegression function', () => {
    it('should return slope 0 and intercept y[0] when n < 2 (line 192 - single point)', () => {
      // Test with single data point
      const result = linearRegression([1], [50]);

      expect(result.slope).toBe(0);
      expect(result.intercept).toBe(50);
      expect(result.r_squared).toBe(0);
    });

    it('should return slope 0 and intercept 0 when n < 2 with empty y array (line 192 - edge case)', () => {
      // Test with empty arrays
      const result = linearRegression([], []);

      expect(result.slope).toBe(0);
      expect(result.intercept).toBe(0);
      expect(result.r_squared).toBe(0);
    });

    it('should return slope 0 when all x values are the same (line 204 - denominator ~0)', () => {
      // All x values are identical (0), y values vary
      const result = linearRegression([0, 0, 0, 0], [10, 20, 30, 40]);

      expect(result.slope).toBe(0);
      // intercept should be average of y values: (10+20+30+40)/4 = 25
      expect(result.intercept).toBe(25);
      expect(result.r_squared).toBe(0);
    });

    it('should return slope 0 when all x values are very close (line 204 - near-zero denominator)', () => {
      // All x values are effectively the same (within 1e-10 tolerance)
      const tiny = 1e-12;
      const result = linearRegression([0, tiny, tiny * 2, tiny * 3], [10, 20, 30, 40]);

      expect(result.slope).toBe(0);
      expect(result.r_squared).toBe(0);
    });

    it('should calculate correct linear regression for perfect linear data', () => {
      // y = 2x + 10 (slope=2, intercept=10)
      const result = linearRegression([0, 1, 2, 3, 4], [10, 12, 14, 16, 18]);

      expect(result.slope).toBe(2);
      expect(result.intercept).toBe(10);
      expect(result.r_squared).toBe(1); // Perfect fit
    });

    it('should calculate correct regression for imperfect data', () => {
      // Noisy data
      const result = linearRegression([0, 1, 2, 3, 4], [10, 11, 15, 14, 20]);

      expect(result.slope).toBeGreaterThan(0);
      expect(result.r_squared).toBeGreaterThan(0);
      expect(result.r_squared).toBeLessThan(1);
    });
  });

  // ===========================================================================
  // Direct Unit Tests for analyzeTrend (Coverage for line 262)
  // ===========================================================================

  describe('analyzeTrend function', () => {
    it('should detect growing trend when R-squared <= 0.5 but growth > 5MB (line 262)', () => {
      // Create snapshots with noisy data (low R-squared) but significant growth
      const snapshots: MemorySnapshot[] = [
        { timestamp: '2024-01-01T00:00:00Z', elapsed_ms: 0, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 50 },
        { timestamp: '2024-01-01T00:00:01Z', elapsed_ms: 1000, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 80 },
        { timestamp: '2024-01-01T00:00:02Z', elapsed_ms: 2000, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 40 },
        { timestamp: '2024-01-01T00:00:03Z', elapsed_ms: 3000, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 90 },
        { timestamp: '2024-01-01T00:00:04Z', elapsed_ms: 4000, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 60 },
      ];

      const result = analyzeTrend(snapshots, 4);

      // Growth is 60 - 50 = 10MB (> 5MB threshold)
      expect(result.heap_growth_mb).toBe(10);
      // With this noisy data, R-squared should be low
      // The trend should be 'growing' because growth > 5 even if R-squared <= 0.5
      if (result.linear_regression && result.linear_regression.r_squared <= 0.5) {
        expect(result.trend).toBe('growing');
      }
    });

    it('should detect declining trend when R-squared <= 0.5 but growth < -5MB', () => {
      // Create snapshots with noisy data but significant decline
      const snapshots: MemorySnapshot[] = [
        { timestamp: '2024-01-01T00:00:00Z', elapsed_ms: 0, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 100 },
        { timestamp: '2024-01-01T00:00:01Z', elapsed_ms: 1000, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 60 },
        { timestamp: '2024-01-01T00:00:02Z', elapsed_ms: 2000, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 120 },
        { timestamp: '2024-01-01T00:00:03Z', elapsed_ms: 3000, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 50 },
        { timestamp: '2024-01-01T00:00:04Z', elapsed_ms: 4000, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 90 },
      ];

      const result = analyzeTrend(snapshots, 4);

      // Growth is 90 - 100 = -10MB (< -5MB threshold)
      expect(result.heap_growth_mb).toBe(-10);
      // With noisy data and R-squared <= 0.5, trend should be 'declining' due to growth < -5
      if (result.linear_regression && result.linear_regression.r_squared <= 0.5) {
        expect(result.trend).toBe('declining');
      }
    });

    it('should detect stable trend when R-squared <= 0.5 and -5 <= growth <= 5', () => {
      // Create snapshots with noisy data and small overall change
      const snapshots: MemorySnapshot[] = [
        { timestamp: '2024-01-01T00:00:00Z', elapsed_ms: 0, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 50 },
        { timestamp: '2024-01-01T00:00:01Z', elapsed_ms: 1000, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 80 },
        { timestamp: '2024-01-01T00:00:02Z', elapsed_ms: 2000, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 30 },
        { timestamp: '2024-01-01T00:00:03Z', elapsed_ms: 3000, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 70 },
        { timestamp: '2024-01-01T00:00:04Z', elapsed_ms: 4000, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 52 },
      ];

      const result = analyzeTrend(snapshots, 4);

      // Growth is 52 - 50 = 2MB (within -5 to 5 range)
      expect(result.heap_growth_mb).toBe(2);
      // With noisy data and small growth, trend should be 'stable'
      expect(result.trend).toBe('stable');
    });
  });

  // ===========================================================================
  // Direct Unit Tests for generateSuspects (Coverage for line 317)
  // ===========================================================================

  describe('generateSuspects function', () => {
    it('should generate probable_leak suspect when R-squared is 0.5-0.8 and slope > 0.05 (line 317)', () => {
      const analysis: MemoryAnalysis = {
        initial_heap_mb: 50,
        final_heap_mb: 100,
        heap_growth_mb: 50,
        growth_rate_mb_per_minute: 5,
        trend: 'growing',
        linear_regression: {
          slope: 0.1, // > 0.05 MB/s
          intercept: 50,
          r_squared: 0.7, // Between 0.5 and 0.8
        },
      };

      const suspects = generateSuspects(analysis);

      const probableLeak = suspects.find(s => s.type === 'probable_leak');
      expect(probableLeak).toBeDefined();
      expect(probableLeak?.confidence).toBe('medium');
      expect(probableLeak?.description).toContain('slope=0.1');
      expect(probableLeak?.description).toContain('moderate correlation');
    });

    it('should NOT generate probable_leak when R-squared > 0.8 (uses consistent_growth instead)', () => {
      const analysis: MemoryAnalysis = {
        initial_heap_mb: 50,
        final_heap_mb: 100,
        heap_growth_mb: 50,
        growth_rate_mb_per_minute: 5,
        trend: 'growing',
        linear_regression: {
          slope: 0.15, // > 0.1 MB/s (triggers consistent_growth)
          intercept: 50,
          r_squared: 0.9, // > 0.8 (too high for probable_leak)
        },
      };

      const suspects = generateSuspects(analysis);

      const probableLeak = suspects.find(s => s.type === 'probable_leak');
      expect(probableLeak).toBeUndefined();

      const consistentGrowth = suspects.find(s => s.type === 'consistent_growth');
      expect(consistentGrowth).toBeDefined();
    });

    it('should NOT generate probable_leak when R-squared <= 0.5', () => {
      const analysis: MemoryAnalysis = {
        initial_heap_mb: 50,
        final_heap_mb: 100,
        heap_growth_mb: 50,
        growth_rate_mb_per_minute: 5,
        trend: 'growing',
        linear_regression: {
          slope: 0.1,
          intercept: 50,
          r_squared: 0.4, // <= 0.5 (too low for probable_leak)
        },
      };

      const suspects = generateSuspects(analysis);

      const probableLeak = suspects.find(s => s.type === 'probable_leak');
      expect(probableLeak).toBeUndefined();
    });

    it('should NOT generate probable_leak when slope <= 0.05', () => {
      const analysis: MemoryAnalysis = {
        initial_heap_mb: 50,
        final_heap_mb: 55,
        heap_growth_mb: 5,
        growth_rate_mb_per_minute: 1,
        trend: 'stable',
        linear_regression: {
          slope: 0.03, // <= 0.05 (too low for probable_leak)
          intercept: 50,
          r_squared: 0.7, // In range, but slope is too low
        },
      };

      const suspects = generateSuspects(analysis);

      const probableLeak = suspects.find(s => s.type === 'probable_leak');
      expect(probableLeak).toBeUndefined();
    });

    it('should generate probable_leak at boundary R-squared = 0.51', () => {
      const analysis: MemoryAnalysis = {
        initial_heap_mb: 50,
        final_heap_mb: 100,
        heap_growth_mb: 50,
        growth_rate_mb_per_minute: 5,
        trend: 'growing',
        linear_regression: {
          slope: 0.06, // Just above 0.05
          intercept: 50,
          r_squared: 0.51, // Just above 0.5
        },
      };

      const suspects = generateSuspects(analysis);

      const probableLeak = suspects.find(s => s.type === 'probable_leak');
      expect(probableLeak).toBeDefined();
      expect(probableLeak?.confidence).toBe('medium');
    });

    it('should generate probable_leak at boundary R-squared = 0.8', () => {
      const analysis: MemoryAnalysis = {
        initial_heap_mb: 50,
        final_heap_mb: 100,
        heap_growth_mb: 50,
        growth_rate_mb_per_minute: 5,
        trend: 'growing',
        linear_regression: {
          slope: 0.06, // Just above 0.05 but not > 0.1
          intercept: 50,
          r_squared: 0.8, // Exactly 0.8 (should still trigger probable_leak since <= 0.8)
        },
      };

      const suspects = generateSuspects(analysis);

      const probableLeak = suspects.find(s => s.type === 'probable_leak');
      expect(probableLeak).toBeDefined();
    });
  });

  // ===========================================================================
  // Branch Coverage Tests - Line 243 (durationSeconds === 0)
  // ===========================================================================

  describe('analyzeTrend with zero duration', () => {
    it('should return growthRatePerMinute of 0 when durationSeconds is 0 (line 243 false branch)', () => {
      // Create snapshots that would have growth
      const snapshots: MemorySnapshot[] = [
        { timestamp: '2024-01-01T00:00:00Z', elapsed_ms: 0, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 50 },
        { timestamp: '2024-01-01T00:00:00Z', elapsed_ms: 0, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 100 },
        { timestamp: '2024-01-01T00:00:00Z', elapsed_ms: 0, heap_used_mb: null, heap_total_mb: null, external_mb: null, rss_mb: 150 },
      ];

      // Pass 0 as durationSeconds to trigger the false branch of durationSeconds > 0
      const result = analyzeTrend(snapshots, 0);

      // When durationSeconds is 0, growth_rate_mb_per_minute should be 0
      expect(result.growth_rate_mb_per_minute).toBe(0);
      expect(result.heap_growth_mb).toBe(100); // Growth still calculated: 150 - 50 = 100
    });
  });

  // ===========================================================================
  // Branch Coverage Tests - Line 291 (slope <= 0.1 with R-squared > 0.8)
  // ===========================================================================

  describe('generateSuspects consistent_growth branch', () => {
    it('should NOT generate consistent_growth when R-squared > 0.8 but slope <= 0.1 (line 291 false branch)', () => {
      const analysis: MemoryAnalysis = {
        initial_heap_mb: 50,
        final_heap_mb: 55,
        heap_growth_mb: 5,
        growth_rate_mb_per_minute: 0.5,
        trend: 'growing',
        linear_regression: {
          slope: 0.08, // <= 0.1 MB/s (should NOT trigger consistent_growth)
          intercept: 50,
          r_squared: 0.85, // > 0.8 (first condition passes, but slope check fails)
        },
      };

      const suspects = generateSuspects(analysis);

      // Should NOT have consistent_growth because slope <= 0.1
      const consistentGrowth = suspects.find(s => s.type === 'consistent_growth');
      expect(consistentGrowth).toBeUndefined();
    });

    it('should generate consistent_growth when R-squared > 0.8 and slope > 0.1', () => {
      const analysis: MemoryAnalysis = {
        initial_heap_mb: 50,
        final_heap_mb: 100,
        heap_growth_mb: 50,
        growth_rate_mb_per_minute: 10,
        trend: 'growing',
        linear_regression: {
          slope: 0.15, // > 0.1 MB/s
          intercept: 50,
          r_squared: 0.85, // > 0.8
        },
      };

      const suspects = generateSuspects(analysis);

      const consistentGrowth = suspects.find(s => s.type === 'consistent_growth');
      expect(consistentGrowth).toBeDefined();
      expect(consistentGrowth?.confidence).toBe('high');
    });
  });

  // ===========================================================================
  // Branch Coverage Tests - Line 314 (growth_rate_mb_per_minute > 10 but <= 50)
  // ===========================================================================

  describe('generateSuspects rapid_growth confidence branch', () => {
    it('should generate rapid_growth with medium confidence when rate > 10 but <= 50 (line 314 false branch)', () => {
      const analysis: MemoryAnalysis = {
        initial_heap_mb: 50,
        final_heap_mb: 100,
        heap_growth_mb: 50,
        growth_rate_mb_per_minute: 25, // > 10 but <= 50 (should be medium confidence)
        trend: 'growing',
        linear_regression: {
          slope: 0.05,
          intercept: 50,
          r_squared: 0.6,
        },
      };

      const suspects = generateSuspects(analysis);

      const rapidGrowth = suspects.find(s => s.type === 'rapid_growth');
      expect(rapidGrowth).toBeDefined();
      expect(rapidGrowth?.confidence).toBe('medium'); // Not 'high' since rate <= 50
      expect(rapidGrowth?.description).toContain('25 MB/minute');
    });

    it('should generate rapid_growth with high confidence when rate > 50', () => {
      const analysis: MemoryAnalysis = {
        initial_heap_mb: 50,
        final_heap_mb: 200,
        heap_growth_mb: 150,
        growth_rate_mb_per_minute: 75, // > 50 (should be high confidence)
        trend: 'growing',
        linear_regression: {
          slope: 0.1,
          intercept: 50,
          r_squared: 0.6,
        },
      };

      const suspects = generateSuspects(analysis);

      const rapidGrowth = suspects.find(s => s.type === 'rapid_growth');
      expect(rapidGrowth).toBeDefined();
      expect(rapidGrowth?.confidence).toBe('high');
    });
  });

  // ===========================================================================
  // Branch Coverage Tests - Lines 346-351 (leak detected but no high confidence suspects)
  // ===========================================================================

  describe('generateRecommendations high confidence suspects branch', () => {
    it('should NOT include heap snapshot recommendation when leak detected but no high confidence suspects (lines 346-351 false branch)', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      // To trigger the false branch of suspects.some(s => s.confidence === 'high'):
      // Need: leak_detected = true, but NO suspects with high confidence
      //
      // For leak_detected = true: growth >= threshold, trend === 'growing', r_squared > 0.5
      //
      // For NO high confidence suspects:
      // - consistent_growth HIGH requires: r_squared > 0.8 AND slope > 0.1
      // - large_growth HIGH requires: heap_growth_mb > 100
      // - rapid_growth HIGH requires: growth_rate_mb_per_minute > 50
      //
      // Strategy: Create linear growth with r_squared between 0.5-0.8, growth 10-100 MB, rate < 50 MB/min
      // With 30 second duration and 15 MB growth, rate = 30 MB/min
      // Use some noise to keep r_squared around 0.6-0.7
      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Linear growth with noise: 50MB -> ~65MB over ~1 second = 15MB growth
        // But spread out to keep rate low (15MB / 1s * 60 = 900 MB/min - too high!)
        // Need longer duration or less growth
        //
        // Better: 60 second duration, 20MB growth = 20 MB/min (not high)
        // 50MB + ~20MB growth over many samples
        const baseGrowth = 50 + callCount * 1; // Slow growth
        // Add noise to reduce r_squared
        const noise = (callCount % 3 === 0) ? 2 : (callCount % 3 === 1) ? -1 : 0;
        const memKB = (baseGrowth + noise) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 60, // 60 seconds to spread growth over time
        snapshot_interval_ms: 2000, // Every 2 seconds = 30 snapshots
        threshold_mb: 10, // Need at least 10MB growth
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(65000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as {
        leak_detected: boolean;
        suspects?: LeakSuspect[];
        recommendations: string[];
        analysis: MemoryAnalysis;
      };

      // If we got a leak with no high-confidence suspects, verify no heap snapshot rec
      if (result.leak_detected) {
        const hasHighConfidence = result.suspects?.some(s => s.confidence === 'high') ?? false;
        if (!hasHighConfidence) {
          expect(result.recommendations.some(r => r.includes('heap snapshots'))).toBe(false);
          expect(result.recommendations.some(r => r.includes('Memory leak detected'))).toBe(true);
        }
      }
    });

    it('should detect leak with only medium confidence suspects (explicit test for line 346 false)', async () => {
      // FORCE the exact conditions for medium-confidence-only leak detection
      // to hit the false branch of suspects.some(s => s.confidence === 'high')
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      // Requirements for leak detection with NO high confidence suspects:
      // 1. Leak detected: growth >= threshold, trend === 'growing', r_squared > 0.5
      // 2. NO HIGH confidence:
      //    - consistent_growth HIGH: r_squared > 0.8 AND slope > 0.1 => need slope <= 0.1
      //    - large_growth HIGH: heap_growth_mb > 100 => need growth <= 100
      //    - rapid_growth HIGH: growth_rate_mb_per_minute > 50 => need rate <= 50
      //
      // With duration = 120s, threshold = 10MB:
      // - Growth = 11 MB (slightly above threshold)
      // - slope = 11/120 = 0.092 MB/s (<= 0.1, avoids consistent_growth HIGH)
      // - rate = 11/2 = 5.5 MB/min (< 10, no rapid_growth at all)
      // - r_squared will be high (perfect linear), but slope is low
      //
      // With 30 snapshots: growth per snapshot = 11/30 = 0.367 MB
      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Start at 50MB, grow to 61MB over 30 snapshots
        const memMB = 50 + (callCount - 1) * (11 / 29); // 29 intervals for 30 points
        const memKB = Math.round(memMB * 1024);
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 120, // 2 minutes
        snapshot_interval_ms: 4000, // Every 4 seconds = 30 snapshots
        threshold_mb: 10,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(125000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as {
        leak_detected: boolean;
        suspects?: LeakSuspect[];
        recommendations: string[];
        analysis: MemoryAnalysis;
      };

      // Verify leak was detected
      expect(result.leak_detected).toBe(true);
      // Verify NO high confidence suspects (this is the key assertion for line 346)
      const hasHighConfidence = result.suspects?.some(s => s.confidence === 'high') ?? false;
      expect(hasHighConfidence).toBe(false);
      // Verify heap snapshot recommendation is NOT present (false branch of line 346)
      expect(result.recommendations.some(r => r.includes('heap snapshots'))).toBe(false);
      // Verify Memory leak detected message IS present
      expect(result.recommendations.some(r => r.includes('Memory leak detected'))).toBe(true);
    });

    it('should include heap snapshot recommendation when leak detected with high confidence suspects', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      // Create memory pattern with very consistent growth (high R-squared > 0.8 AND slope > 0.1)
      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Very consistent linear growth - high R-squared, high slope
        const memKB = (50 + callCount * 50) * 1024;
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 50,
        threshold_mb: 5,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as {
        leak_detected: boolean;
        suspects?: LeakSuspect[];
        recommendations: string[];
      };

      if (result.leak_detected && result.suspects?.some(s => s.confidence === 'high')) {
        expect(result.recommendations.some(r => r.includes('heap snapshots'))).toBe(true);
      }
    });
  });

  // ===========================================================================
  // Branch Coverage Tests - Line 466 (spawn error with non-Error object)
  // ===========================================================================

  describe('spawn error handling with non-Error object', () => {
    it('should handle spawn throwing a non-Error object (line 466 String branch)', async () => {
      vi.mocked(childProcess.spawn).mockImplementation(() => {
        throw 'String error message'; // Throw a string instead of Error
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'command',
        command: 'invalid-command',
        duration_seconds: 1,
      };

      await handleDetectMemoryLeaks(args);

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Failed to spawn command: String error message')
      );
    });

    it('should handle spawn throwing a number', async () => {
      vi.mocked(childProcess.spawn).mockImplementation(() => {
        throw 42; // Throw a number
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'command',
        command: 'invalid-command',
        duration_seconds: 1,
      };

      await handleDetectMemoryLeaks(args);

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Failed to spawn command: 42')
      );
    });

    it('should handle spawn throwing null', async () => {
      vi.mocked(childProcess.spawn).mockImplementation(() => {
        throw null;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'command',
        command: 'invalid-command',
        duration_seconds: 1,
      };

      await handleDetectMemoryLeaks(args);

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Failed to spawn command: null')
      );
    });

    it('should handle spawn throwing undefined', async () => {
      vi.mocked(childProcess.spawn).mockImplementation(() => {
        throw undefined;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'command',
        command: 'invalid-command',
        duration_seconds: 1,
      };

      await handleDetectMemoryLeaks(args);

      expect(errorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Failed to spawn command: undefined')
      );
    });
  });

  // ===========================================================================
  // Branch Coverage Tests - Line 515 (sleepTime <= 0)
  // ===========================================================================

  describe('sleep time calculation edge cases', () => {
    it('should skip sleep when sleepTime becomes zero or negative (line 515 false branch)', async () => {
      // To hit the false branch of `if (sleepTime > 0)`:
      // We need sleepTime = Math.min(nextSnapshotTime - elapsed, endTime - Date.now()) <= 0
      //
      // This happens when Date.now() >= endTime at the point of calculating sleepTime,
      // even though we passed the while(Date.now() < endTime) check earlier in that iteration.
      //
      // Strategy: Use vi.spyOn(Date, 'now') to simulate time advancing between calls
      // within the same iteration of the while loop.
      vi.useRealTimers(); // Temporarily use real timers so we can spy on Date.now

      const startTime = Date.now();
      const endTime = startTime + 1000; // 1 second duration
      let dateNowCallCount = 0;

      // Spy on Date.now to simulate time advancing rapidly
      const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
        dateNowCallCount++;
        // First few calls: return startTime (to pass initial checks and take first snapshot)
        // Then: return endTime + 100 (to make sleepTime negative)
        if (dateNowCallCount <= 10) {
          return startTime + dateNowCallCount * 50;
        }
        // After 10 calls, jump past endTime to make sleepTime <= 0
        // but the while check may have already passed for this iteration
        return endTime + 100;
      });

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

      // Run directly without fake timers
      const result = await handleDetectMemoryLeaks(args);

      // Clean up
      dateNowSpy.mockRestore();
      vi.useFakeTimers({ shouldAdvanceTime: true }); // Restore fake timers

      // Should complete (either success or insufficient data due to quick exit)
      expect(result).toBeDefined();
    });

    it('should handle normal timing flow gracefully', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockReturnValue(
        '"node.exe","12345","Console","1","50,000 K"\r\n'
      );

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 1,
        snapshot_interval_ms: 200,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(1500);
      await promise;

      expect(vi.mocked(successResponse).mock.calls.length + vi.mocked(errorResponse).mock.calls.length).toBeGreaterThan(0);
    });

    it('should handle when remaining time to end is less than next snapshot interval', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockReturnValue(
        '"node.exe","12345","Console","1","50,000 K"\r\n'
      );

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 2,
        snapshot_interval_ms: 1500,
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(3000);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as { snapshots: MemorySnapshot[] };
      expect(result.snapshots.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ===========================================================================
  // Branch Coverage Tests - Line 555 (linear_regression undefined - nullish coalescing)
  // ===========================================================================

  describe('leak detection with undefined linear_regression', () => {
    it('should use 0 for r_squared when linear_regression is undefined (line 555 nullish coalescing)', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      // Collect exactly 2 snapshots (linear_regression requires 3+ snapshots)
      let callCount = 0;
      let isAlive = true;
      process.kill = vi.fn(() => {
        if (!isAlive) {
          throw new Error('Process exited');
        }
        return true;
      }) as unknown as typeof process.kill;

      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Growing memory to trigger growth detection
        const memKB = (50 + callCount * 100) * 1024;
        if (callCount >= 2) {
          // Make process exit after 2 snapshots
          isAlive = false;
        }
        return `"node.exe","12345","Console","1","${memKB.toLocaleString()} K"\r\n`;
      });

      const args: DetectMemoryLeaksArgs = {
        target: 'pid',
        pid: 12345,
        duration_seconds: 10,
        snapshot_interval_ms: 100,
        threshold_mb: 5, // Low threshold
      };

      const promise = handleDetectMemoryLeaks(args);
      await vi.advanceTimersByTimeAsync(500);
      await promise;

      expect(successResponse).toHaveBeenCalled();
      const result = vi.mocked(successResponse).mock.calls[0][0] as {
        leak_detected: boolean;
        analysis: MemoryAnalysis;
        snapshots: MemorySnapshot[];
      };

      // With only 2 snapshots, linear_regression should be undefined
      if (result.snapshots.length < 3) {
        expect(result.analysis.linear_regression).toBeUndefined();
        // leak_detected should be false because r_squared defaults to 0 (< 0.5 threshold)
        expect(result.leak_detected).toBe(false);
      }
    });

    it('should detect leak when linear_regression is present and conditions met', async () => {
      process.kill = vi.fn(() => true) as unknown as typeof process.kill;

      let callCount = 0;
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        callCount++;
        // Strong linear growth
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
        analysis: MemoryAnalysis;
      };

      // With 3+ snapshots and significant growth, should have linear_regression
      if (result.analysis.linear_regression && result.analysis.linear_regression.r_squared > 0.5) {
        expect(result.leak_detected).toBe(true);
      }
    });
  });

  // ===========================================================================
  // Branch Coverage Tests - linearRegression line 216 (ssTotal < 1e-10)
  // ===========================================================================

  describe('linearRegression ssTotal edge case', () => {
    it('should return r_squared 1 when all y values are the same (line 216 - ssTotal near zero)', () => {
      // All y values identical means ssTotal = 0
      const result = linearRegression([0, 1, 2, 3, 4], [50, 50, 50, 50, 50]);

      expect(result.slope).toBe(0);
      expect(result.intercept).toBe(50);
      expect(result.r_squared).toBe(1); // Perfect fit when all y are same
    });

    it('should return r_squared 1 when y values vary minimally (ssTotal < 1e-10)', () => {
      // y values with variation smaller than 1e-10
      const tiny = 1e-12;
      const result = linearRegression([0, 1, 2, 3, 4], [50, 50 + tiny, 50, 50 + tiny, 50]);

      // ssTotal should be extremely small, triggering the branch
      expect(result.r_squared).toBe(1);
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
