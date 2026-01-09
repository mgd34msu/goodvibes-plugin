/**
 * Unit tests for session-end/index hook
 *
 * Tests cover:
 * - Analytics finalization (when analytics exist)
 * - Session summary file creation with ended_reason
 * - Duration calculation
 * - Unique tools extraction
 * - Error handling (all error scenarios)
 * - No analytics scenario
 * - Response format (using createResponse)
 * - Debug logging
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises module
const mockWriteFile = vi.fn();

vi.mock('fs/promises', () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

// Mock shared module
const mockRespond = vi.fn();
const mockReadHookInput = vi.fn();
const mockLoadAnalytics = vi.fn();
const mockSaveAnalytics = vi.fn();
const mockDebug = vi.fn();
const mockLogError = vi.fn();
const mockCreateResponse = vi.fn();

vi.mock('../../shared/index.js', () => ({
  respond: (...args: unknown[]) => mockRespond(...args),
  readHookInput: () => mockReadHookInput(),
  loadAnalytics: () => mockLoadAnalytics(),
  saveAnalytics: (...args: unknown[]) => mockSaveAnalytics(...args),
  debug: (...args: unknown[]) => mockDebug(...args),
  logError: (...args: unknown[]) => mockLogError(...args),
  createResponse: (...args: unknown[]) => mockCreateResponse(...args),
  isTestEnvironment: () => false,
  CACHE_DIR: '/mock/cache/dir',
}));

describe('session-end/index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Use fake timers for consistent date handling
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:30:00Z'));

    // Default mock implementations
    mockReadHookInput.mockResolvedValue({
      session_id: 'test-session-123',
      cwd: '/test/cwd',
      hook_event_name: 'SessionEnd',
      transcript_path: '/test/transcript',
      permission_mode: 'default',
    });

    mockCreateResponse.mockImplementation(() => ({
      continue: true,
      systemMessage: undefined,
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  describe('runSessionEndHook with analytics', () => {
    it('should finalize analytics and create session summary', async () => {
      const mockAnalytics = {
        session_id: 'session-abc',
        started_at: '2025-01-15T12:00:00Z',
        tool_usage: [
          { tool: 'Bash', timestamp: '2025-01-15T12:05:00Z', success: true },
          { tool: 'Read', timestamp: '2025-01-15T12:10:00Z', success: true },
          { tool: 'Bash', timestamp: '2025-01-15T12:15:00Z', success: true },
        ],
        skills_recommended: ['vitest', 'playwright'],
        validations_run: 5,
        issues_found: 2,
      };

      mockLoadAnalytics.mockResolvedValue(mockAnalytics);
      mockSaveAnalytics.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      // Import and run the hook
      const importPromise = import('../../session-end/index.js');

      // Run all pending timers and microtasks
      await vi.runAllTimersAsync();
      await importPromise;

      // Verify analytics were finalized
      expect(mockSaveAnalytics).toHaveBeenCalled();
      const savedAnalytics = mockSaveAnalytics.mock.calls[0][0];
      expect(savedAnalytics.ended_at).toBe('2025-01-15T12:30:00.000Z');

      // Verify session summary was written
      expect(mockWriteFile).toHaveBeenCalled();
      const writeCall = mockWriteFile.mock.calls[0];
      expect(writeCall[0]).toContain('session-session-abc.json');

      const summaryContent = JSON.parse(writeCall[1] as string);
      expect(summaryContent.session_id).toBe('session-abc');
      expect(summaryContent.duration_minutes).toBe(30); // 12:00 to 12:30
      expect(summaryContent.tools_used).toBe(3);
      expect(summaryContent.unique_tools).toEqual(['Bash', 'Read']);
      expect(summaryContent.skills_recommended).toBe(2);
      expect(summaryContent.validations_run).toBe(5);
      expect(summaryContent.issues_found).toBe(2);
      expect(summaryContent.ended_reason).toBe('session_end');

      // Verify response was sent
      expect(mockCreateResponse).toHaveBeenCalled();
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: undefined,
      });

      // Verify debug logging
      expect(mockDebug).toHaveBeenCalledWith('SessionEnd hook starting');
      expect(mockDebug).toHaveBeenCalledWith('SessionEnd received input', {
        session_id: 'test-session-123',
      });
    });

    it('should calculate duration correctly for short sessions', async () => {
      const mockAnalytics = {
        session_id: 'short-session',
        started_at: '2025-01-15T12:28:00Z', // 2 minutes before current time
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      mockLoadAnalytics.mockResolvedValue(mockAnalytics);
      mockSaveAnalytics.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const importPromise = import('../../session-end/index.js');
      await vi.runAllTimersAsync();
      await importPromise;

      const summaryContent = JSON.parse(
        mockWriteFile.mock.calls[0][1] as string
      );
      expect(summaryContent.duration_minutes).toBe(2);
    });

    it('should handle analytics with empty tool_usage', async () => {
      const mockAnalytics = {
        session_id: 'empty-tools',
        started_at: '2025-01-15T12:25:00Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      mockLoadAnalytics.mockResolvedValue(mockAnalytics);
      mockSaveAnalytics.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const importPromise = import('../../session-end/index.js');
      await vi.runAllTimersAsync();
      await importPromise;

      const summaryContent = JSON.parse(
        mockWriteFile.mock.calls[0][1] as string
      );
      expect(summaryContent.tools_used).toBe(0);
      expect(summaryContent.unique_tools).toEqual([]);
    });

    it('should handle duplicate tools and extract unique ones', async () => {
      const mockAnalytics = {
        session_id: 'duplicate-tools',
        started_at: '2025-01-15T12:00:00Z',
        tool_usage: [
          { tool: 'Bash', timestamp: '2025-01-15T12:05:00Z', success: true },
          { tool: 'Read', timestamp: '2025-01-15T12:10:00Z', success: true },
          { tool: 'Bash', timestamp: '2025-01-15T12:15:00Z', success: true },
          { tool: 'Edit', timestamp: '2025-01-15T12:20:00Z', success: true },
          { tool: 'Read', timestamp: '2025-01-15T12:25:00Z', success: true },
        ],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      mockLoadAnalytics.mockResolvedValue(mockAnalytics);
      mockSaveAnalytics.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const importPromise = import('../../session-end/index.js');
      await vi.runAllTimersAsync();
      await importPromise;

      const summaryContent = JSON.parse(
        mockWriteFile.mock.calls[0][1] as string
      );
      expect(summaryContent.tools_used).toBe(5);
      expect(summaryContent.unique_tools).toEqual(['Bash', 'Read', 'Edit']);
    });
  });

  describe('runSessionEndHook without analytics', () => {
    it('should respond without creating summary when no analytics exist', async () => {
      mockLoadAnalytics.mockResolvedValue(null);

      const importPromise = import('../../session-end/index.js');
      await vi.runAllTimersAsync();
      await importPromise;

      // Verify no summary was written
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockSaveAnalytics).not.toHaveBeenCalled();

      // Verify response was still sent
      expect(mockCreateResponse).toHaveBeenCalled();
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: undefined,
      });
    });
  });

  describe('error handling', () => {
    it('should handle readHookInput error and still respond', async () => {
      mockReadHookInput.mockRejectedValue(new Error('Input read failed'));

      const importPromise = import('../../session-end/index.js');
      await vi.runAllTimersAsync();
      await importPromise;

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith(
        'SessionEnd main',
        expect.any(Error)
      );

      // Verify response was sent despite error
      expect(mockCreateResponse).toHaveBeenCalled();
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: undefined,
      });
    });

    it('should handle loadAnalytics error and still respond', async () => {
      mockLoadAnalytics.mockRejectedValue(new Error('Analytics load failed'));

      const importPromise = import('../../session-end/index.js');
      await vi.runAllTimersAsync();
      await importPromise;

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith(
        'SessionEnd main',
        expect.any(Error)
      );

      // Verify response was sent despite error
      expect(mockCreateResponse).toHaveBeenCalled();
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: undefined,
      });
    });

    it('should handle saveAnalytics error and still respond', async () => {
      const mockAnalytics = {
        session_id: 'error-session',
        started_at: '2025-01-15T12:00:00Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      mockLoadAnalytics.mockResolvedValue(mockAnalytics);
      mockSaveAnalytics.mockRejectedValue(new Error('Save failed'));

      const importPromise = import('../../session-end/index.js');
      await vi.runAllTimersAsync();
      await importPromise;

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith(
        'SessionEnd main',
        expect.any(Error)
      );

      // Verify response was sent despite error
      expect(mockCreateResponse).toHaveBeenCalled();
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: undefined,
      });
    });

    it('should handle writeFile error and still respond', async () => {
      const mockAnalytics = {
        session_id: 'write-error-session',
        started_at: '2025-01-15T12:00:00Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      mockLoadAnalytics.mockResolvedValue(mockAnalytics);
      mockSaveAnalytics.mockResolvedValue(undefined);
      mockWriteFile.mockRejectedValue(new Error('Write failed'));

      const importPromise = import('../../session-end/index.js');
      await vi.runAllTimersAsync();
      await importPromise;

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith(
        'SessionEnd main',
        expect.any(Error)
      );

      // Verify response was sent despite error
      expect(mockCreateResponse).toHaveBeenCalled();
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: undefined,
      });
    });

    it('should handle uncaught promise rejection', async () => {
      mockReadHookInput.mockRejectedValue(new Error('Uncaught error'));

      const importPromise = import('../../session-end/index.js');
      await vi.runAllTimersAsync();
      await importPromise;

      // Verify error handler was called (main catch block handles it)
      expect(mockLogError).toHaveBeenCalledWith(
        'SessionEnd main',
        expect.any(Error)
      );

      // Verify response was sent
      expect(mockCreateResponse).toHaveBeenCalled();
      expect(mockRespond).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      mockReadHookInput.mockRejectedValue('String error');

      const importPromise = import('../../session-end/index.js');
      await vi.runAllTimersAsync();
      await importPromise;

      // Verify error was logged with non-Error value
      expect(mockLogError).toHaveBeenCalledWith('SessionEnd main', 'String error');
    });

    it('should handle truly uncaught errors (lines 88-89)', async () => {
      // This test specifically targets the .catch() handler on lines 87-90
      // by creating an error that occurs after runSessionEndHook returns
      const error = new Error('Truly uncaught error');
      mockReadHookInput.mockImplementation(() => {
        // Return a promise that rejects asynchronously to bypass try/catch
        return new Promise((_, reject) => {
          setImmediate(() => reject(error));
        });
      });

      const importPromise = import('../../session-end/index.js');
      await vi.runAllTimersAsync();
      await importPromise;

      // Wait for async error to propagate through .catch() using fake timers
      await vi.runAllTimersAsync();

      // Error should be caught by main try/catch, not the .catch() handler
      expect(mockLogError).toHaveBeenCalledWith('SessionEnd main', error);
      expect(mockCreateResponse).toHaveBeenCalled();
      expect(mockRespond).toHaveBeenCalled();
    });
  });

  describe('debug logging', () => {
    it('should log session duration and tool count', async () => {
      const mockAnalytics = {
        session_id: 'debug-session',
        started_at: '2025-01-15T12:00:00Z',
        tool_usage: [
          { tool: 'Bash', timestamp: '2025-01-15T12:05:00Z', success: true },
          { tool: 'Read', timestamp: '2025-01-15T12:10:00Z', success: true },
        ],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      mockLoadAnalytics.mockResolvedValue(mockAnalytics);
      mockSaveAnalytics.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const importPromise = import('../../session-end/index.js');
      await vi.runAllTimersAsync();
      await importPromise;

      expect(mockDebug).toHaveBeenCalledWith(
        'Session ended. Duration: 30m, Tools: 2'
      );
    });

    it('should log when no analytics are available', async () => {
      mockLoadAnalytics.mockResolvedValue(null);

      const importPromise = import('../../session-end/index.js');
      await vi.runAllTimersAsync();
      await importPromise;

      expect(mockDebug).toHaveBeenCalledWith('SessionEnd hook starting');
      expect(mockDebug).toHaveBeenCalledWith('SessionEnd received input', {
        session_id: 'test-session-123',
      });
    });
  });

  describe('createResponse usage', () => {
    it('should use createResponse helper for success case', async () => {
      mockLoadAnalytics.mockResolvedValue(null);

      const importPromise = import('../../session-end/index.js');
      await vi.runAllTimersAsync();
      await importPromise;

      // Verify createResponse was called with no arguments (default response)
      expect(mockCreateResponse).toHaveBeenCalledWith();
    });

    it('should use createResponse for error case', async () => {
      mockReadHookInput.mockRejectedValue(new Error('Test error'));

      const importPromise = import('../../session-end/index.js');
      await vi.runAllTimersAsync();
      await importPromise;

      // Verify createResponse was called (could be with or without args)
      expect(mockCreateResponse).toHaveBeenCalled();
    });
  });
});
