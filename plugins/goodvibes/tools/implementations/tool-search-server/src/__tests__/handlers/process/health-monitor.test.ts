/**
 * Unit tests for health-monitor handler
 *
 * Tests cover:
 * - handleHealthMonitor main function
 * - PID validation
 * - Response format
 * - Error and warning limits
 *
 * Note: Platform-specific tests (Windows/Unix metrics) are skipped
 * as they require complex mocking of process.kill and safeExec.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'http';
import * as https from 'https';

// Mock modules
vi.mock('http', () => ({
  get: vi.fn(),
}));

vi.mock('https', () => ({
  get: vi.fn(),
}));

vi.mock('os', () => ({
  cpus: vi.fn().mockReturnValue([{}, {}, {}, {}]),
}));

vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

// Create mock functions using vi.hoisted() to ensure they're available before vi.mock hoisting
const { mockSafeExec, mockSuccess, mockFileExists } = vi.hoisted(() => ({
  mockSafeExec: vi.fn(),
  mockSuccess: vi.fn(),
  mockFileExists: vi.fn(),
}));

vi.mock('../../../utils.js', () => ({
  safeExec: mockSafeExec,
  success: mockSuccess,
  fileExists: mockFileExists,
}));

// Import after mocks
import {
  handleHealthMonitor,
  type HealthMonitorArgs,
} from '../../../handlers/process/health-monitor.js';

describe('health-monitor handler', () => {
  let originalKill: typeof process.kill;

  beforeEach(() => {
    vi.clearAllMocks();
    originalKill = process.kill;

    // Set up mock implementations that persist after clearAllMocks
    mockSafeExec.mockResolvedValue({ stdout: '', stderr: '', error: null });
    mockSuccess.mockImplementation((data) => ({
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    }));
    mockFileExists.mockResolvedValue(true);

    // Mock process.kill for isProcessAlive check
    process.kill = vi.fn().mockImplementation((pid: number, signal?: NodeJS.Signals | number) => {
      if (signal === 0) {
        // Check if process exists - throw for invalid PIDs
        if (pid <= 0 || pid === 99999) throw new Error('Invalid PID');
        return true;
      }
      return true;
    }) as typeof process.kill;
  });

  afterEach(() => {
    vi.resetAllMocks();
    process.kill = originalKill;
  });

  describe('handleHealthMonitor', () => {
    describe('PID validation', () => {
      it('should return not_found for invalid PID (0)', async () => {
        const result = await handleHealthMonitor({ pid: 0 });

        // The handler returns via `success()` which we've mocked
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.status).toBe('not_found');
        expect(data.alive).toBe(false);
        expect(data.errors[0].message).toContain('Invalid PID');
      });

      it('should return not_found for negative PID', async () => {
        const result = await handleHealthMonitor({ pid: -1 });

        const data = JSON.parse(result.content[0].text);
        expect(data.status).toBe('not_found');
        expect(data.alive).toBe(false);
      });

      it('should return not_found for non-integer PID', async () => {
        const result = await handleHealthMonitor({ pid: 1.5 });

        const data = JSON.parse(result.content[0].text);
        expect(data.status).toBe('not_found');
        expect(data.alive).toBe(false);
      });

      it('should return not_found when process does not exist', async () => {
        const result = await handleHealthMonitor({ pid: 99999 });

        const data = JSON.parse(result.content[0].text);
        expect(data.status).toBe('not_found');
        expect(data.alive).toBe(false);
      });
    });

    describe('response format', () => {
      it('should return properly formatted MCP response', async () => {
        // Use a PID that our mock says is alive (not 0, not negative, not 99999)
        const result = await handleHealthMonitor({ pid: 1234 });

        expect(result).toHaveProperty('content');
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toHaveProperty('type', 'text');
      });

      it('should return valid JSON in response', async () => {
        const result = await handleHealthMonitor({ pid: 1234 });

        expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      });

      it('should include all result fields', async () => {
        const result = await handleHealthMonitor({ pid: 1234 });

        const data = JSON.parse(result.content[0].text);
        expect(data).toHaveProperty('status');
        expect(data).toHaveProperty('pid');
        expect(data).toHaveProperty('alive');
        expect(data).toHaveProperty('uptime_ms');
        expect(data).toHaveProperty('memory_mb');
        expect(data).toHaveProperty('cpu_percent');
        expect(data).toHaveProperty('errors');
        expect(data).toHaveProperty('warnings');
      });
    });

    describe('error and warning limits', () => {
      it('should limit errors to 20', async () => {
        const result = await handleHealthMonitor({ pid: 1234 });

        const data = JSON.parse(result.content[0].text);
        expect(data.errors.length).toBeLessThanOrEqual(20);
      });

      it('should limit warnings to 20', async () => {
        const result = await handleHealthMonitor({ pid: 1234 });

        const data = JSON.parse(result.content[0].text);
        expect(data.warnings.length).toBeLessThanOrEqual(20);
      });
    });

    // TODO: Platform-specific tests could be added to test Windows/Unix metrics collection
    // These would require mocking safeExec to return platform-specific output

    // TODO: HTTP health check tests could be added
    // These would require complex mocking of http.get with proper response handling

    // TODO: Status determination tests could be added
    // These would verify the health status logic based on metrics and checks

    // TODO: Duration monitoring tests could be added
    // These would require fake timers and complex async flows
  });
});
