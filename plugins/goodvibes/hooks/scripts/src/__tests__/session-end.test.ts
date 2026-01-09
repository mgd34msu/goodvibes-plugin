/**
 * Unit tests for session-end hook
 *
 * Tests cover:
 * - Analytics finalization (when analytics exist)
 * - Session summary file creation
 * - Duration calculation
 * - Unique tools extraction
 * - Error handling (catch block)
 * - No analytics scenario
 * - Response format
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original values
const originalProcessExit = process.exit;

describe('session-end hook', () => {
  // Mock functions
  let mockWriteFile: ReturnType<typeof vi.fn>;
  let mockRespond: ReturnType<typeof vi.fn>;
  let mockReadHookInput: ReturnType<typeof vi.fn>;
  let mockLoadAnalytics: ReturnType<typeof vi.fn>;
  let mockSaveAnalytics: ReturnType<typeof vi.fn>;
  let mockDebug: ReturnType<typeof vi.fn>;
  let mockLogError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();

    // Initialize mock functions
    mockWriteFile = vi.fn();
    mockRespond = vi.fn();
    mockReadHookInput = vi.fn();
    mockLoadAnalytics = vi.fn();
    mockSaveAnalytics = vi.fn();
    mockDebug = vi.fn();
    mockLogError = vi.fn();

    // Mock process.exit to prevent actual exit
    process.exit = vi.fn() as never;

    // Default mock implementations
    mockRespond.mockReturnValue(undefined);
    mockReadHookInput.mockResolvedValue({
      session_id: 'test-session-123',
      cwd: '/test/cwd',
      hook_event_name: 'SessionEnd',
      transcript_path: '/test/transcript',
      permission_mode: 'default',
    });
  });

  afterEach(() => {
    process.exit = originalProcessExit;
    vi.resetModules();
  });

  async function setupMocksAndImport() {
    // Mock fs/promises
    vi.doMock('fs/promises', () => ({
      writeFile: mockWriteFile,
      access: vi.fn(),
      mkdir: vi.fn(),
      readFile: vi.fn(),
    }));

    // Mock shared module with isTestEnvironment = false so hook runs
    vi.doMock('../shared/index.js', () => ({
      respond: mockRespond,
      readHookInput: mockReadHookInput,
      loadAnalytics: mockLoadAnalytics,
      saveAnalytics: mockSaveAnalytics,
      debug: mockDebug,
      logError: mockLogError,
      CACHE_DIR: '/mock/cache/dir',
      createResponse: () => ({ continue: true }),
      isTestEnvironment: () => false,
    }));

    // Import the module (this triggers the hook)
    await import('../session-end/index.js');

    // Allow async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

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

      await setupMocksAndImport();

      // Verify analytics were finalized
      expect(mockSaveAnalytics).toHaveBeenCalled();
      const savedAnalytics = mockSaveAnalytics.mock.calls[0][0];
      expect(savedAnalytics.ended_at).toBeDefined();
      expect(typeof savedAnalytics.ended_at).toBe('string');

      // Verify session summary was written
      expect(mockWriteFile).toHaveBeenCalled();
      const writeCall = mockWriteFile.mock.calls[0];
      expect(writeCall[0]).toContain('session-session-abc.json');

      const summaryContent = JSON.parse(writeCall[1] as string);
      expect(summaryContent.session_id).toBe('session-abc');
      expect(summaryContent.duration_minutes).toBeGreaterThanOrEqual(0); // Duration calculation
      expect(summaryContent.tools_used).toBe(3);
      expect(summaryContent.unique_tools).toEqual(['Bash', 'Read']);
      expect(summaryContent.skills_recommended).toBe(2);
      expect(summaryContent.validations_run).toBe(5);
      expect(summaryContent.issues_found).toBe(2);
      expect(summaryContent.ended_reason).toBe('session_end');

      // Verify response was sent
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
        started_at: new Date(Date.now() - 2 * 60000).toISOString(), // 2 minutes ago
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      mockLoadAnalytics.mockResolvedValue(mockAnalytics);
      mockSaveAnalytics.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await setupMocksAndImport();

      const summaryContent = JSON.parse(
        mockWriteFile.mock.calls[0][1] as string
      );
      // Duration should be approximately 2 minutes (allow for small variance)
      expect(summaryContent.duration_minutes).toBeGreaterThanOrEqual(1);
      expect(summaryContent.duration_minutes).toBeLessThanOrEqual(3);
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

      await setupMocksAndImport();

      const summaryContent = JSON.parse(
        mockWriteFile.mock.calls[0][1] as string
      );
      expect(summaryContent.tools_used).toBe(0);
      expect(summaryContent.unique_tools).toEqual([]);
    });
  });

  describe('runSessionEndHook without analytics', () => {
    it('should respond without creating summary when no analytics exist', async () => {
      mockLoadAnalytics.mockResolvedValue(null);

      await setupMocksAndImport();

      // Verify no summary was written
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockSaveAnalytics).not.toHaveBeenCalled();

      // Verify response was still sent
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: undefined,
      });
    });
  });

  describe('error handling', () => {
    it('should handle readHookInput error and still respond', async () => {
      mockReadHookInput.mockRejectedValue(new Error('Input read failed'));

      await setupMocksAndImport();

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith(
        'SessionEnd main',
        expect.any(Error)
      );

      // Verify response was sent despite error
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: undefined,
      });
    });

    it('should handle loadAnalytics error and still respond', async () => {
      mockLoadAnalytics.mockRejectedValue(new Error('Analytics load failed'));

      await setupMocksAndImport();

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith(
        'SessionEnd main',
        expect.any(Error)
      );

      // Verify response was sent despite error
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

      await setupMocksAndImport();

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith(
        'SessionEnd main',
        expect.any(Error)
      );

      // Verify response was sent despite error
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

      await setupMocksAndImport();

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith(
        'SessionEnd main',
        expect.any(Error)
      );

      // Verify response was sent despite error
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: undefined,
      });
    });
  });

  describe('createResponse helper', () => {
    it('should create response with no systemMessage when none provided', async () => {
      mockLoadAnalytics.mockResolvedValue(null);

      await setupMocksAndImport();

      const response = mockRespond.mock.calls[0][0];
      expect(response.continue).toBe(true);
      expect(response.systemMessage).toBeUndefined();
    });
  });

  describe('debug logging', () => {
    it('should log session duration and tool count', async () => {
      const mockAnalytics = {
        session_id: 'debug-session',
        started_at: new Date(Date.now() - 30 * 60000).toISOString(),
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

      await setupMocksAndImport();

      // Check that debug was called with a message containing duration and tool count
      const debugCalls = mockDebug.mock.calls.map((call) => call[0]);
      const durationLog = debugCalls.find((msg) =>
        msg.includes('Session ended')
      );
      expect(durationLog).toBeDefined();
      expect(durationLog).toContain('Tools: 2');
    });
  });

  describe('uncaught promise rejection', () => {
    it('should handle uncaught promise rejections (lines 87-90)', async () => {
      // Create a mock that rejects asynchronously to trigger .catch() handler
      const error = new Error('Uncaught async error');
      mockReadHookInput.mockReturnValue(
        new Promise((_, reject) => {
          // Reject asynchronously to trigger .catch() handler
          setImmediate(() => reject(error));
        })
      );

      await setupMocksAndImport();

      expect(mockLogError).toHaveBeenCalledWith('SessionEnd main', error);
      expect(mockRespond).toHaveBeenCalledWith({
        continue: true,
        systemMessage: undefined,
      });
    });

    it('should handle uncaught non-Error rejections', async () => {
      const errorString = 'Uncaught string error';
      mockReadHookInput.mockReturnValue(
        new Promise((_, reject) => {
          setImmediate(() => reject(errorString));
        })
      );

      await setupMocksAndImport();

      expect(mockLogError).toHaveBeenCalledWith('SessionEnd main', errorString);
      expect(mockRespond).toHaveBeenCalled();
    });
  });
});
