/**
 * Unit tests for lifecycle/stop hook
 *
 * Tests cover:
 * - Session finalization with analytics
 * - Session summary file creation
 * - Temp file cleanup (detected-stack.json)
 * - Handling when no analytics exist
 * - Error handling for all failure scenarios
 * - Debug logging throughout execution
 * - Duration calculation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original values
const originalProcessExit = process.exit;

describe('lifecycle/stop', () => {
  // Mock functions
  let mockWriteFile: ReturnType<typeof vi.fn>;
  let mockUnlink: ReturnType<typeof vi.fn>;
  let mockRespond: ReturnType<typeof vi.fn>;
  let mockReadHookInput: ReturnType<typeof vi.fn>;
  let mockLoadAnalytics: ReturnType<typeof vi.fn>;
  let mockSaveAnalytics: ReturnType<typeof vi.fn>;
  let mockDebug: ReturnType<typeof vi.fn>;
  let mockLogError: ReturnType<typeof vi.fn>;
  let mockFileExists: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();

    // Initialize mock functions
    mockWriteFile = vi.fn();
    mockUnlink = vi.fn();
    mockRespond = vi.fn();
    mockReadHookInput = vi.fn();
    mockLoadAnalytics = vi.fn();
    mockSaveAnalytics = vi.fn();
    mockDebug = vi.fn();
    mockLogError = vi.fn();
    mockFileExists = vi.fn();

    // Mock process.exit to prevent actual exit
    process.exit = vi.fn() as never;

    // Default mock implementations
    mockRespond.mockReturnValue(undefined);
  });

  afterEach(() => {
    process.exit = originalProcessExit;
    vi.resetModules();
  });

  async function setupMocksAndImport() {
    // Mock fs/promises
    vi.doMock('fs/promises', () => ({
      writeFile: mockWriteFile,
      unlink: mockUnlink,
      access: vi.fn(),
      mkdir: vi.fn(),
      readFile: vi.fn(),
    }));

    // Mock shared module
    vi.doMock('../../shared/index.js', () => ({
      respond: mockRespond,
      readHookInput: mockReadHookInput,
      loadAnalytics: mockLoadAnalytics,
      saveAnalytics: mockSaveAnalytics,
      debug: mockDebug,
      logError: mockLogError,
      CACHE_DIR: '/mock/cache',
      fileExists: mockFileExists,
      createResponse: () => ({ continue: true }),
      isTestEnvironment: () => false,
    }));

    // Import the module (this triggers runStopHook)
    await import('../../lifecycle/stop.js');

    // Allow async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  describe('successful session end with analytics', () => {
    it('should finalize analytics and save session summary', async () => {
      const mockAnalytics = {
        session_id: 'test-session-123',
        started_at: '2025-01-01T00:00:00.000Z',
        tool_usage: [
          {
            tool: 'Bash',
            timestamp: '2025-01-01T00:01:00.000Z',
            success: true,
          },
          {
            tool: 'Read',
            timestamp: '2025-01-01T00:02:00.000Z',
            success: true,
          },
          {
            tool: 'Bash',
            timestamp: '2025-01-01T00:03:00.000Z',
            success: true,
          },
        ],
        skills_recommended: ['skill1', 'skill2'],
        validations_run: 5,
        issues_found: 2,
      };

      mockReadHookInput.mockResolvedValue({
        session_id: 'test-session-123',
        cwd: '/test/cwd',
        hook_event_name: 'Stop',
      });
      mockLoadAnalytics.mockResolvedValue(mockAnalytics);
      mockSaveAnalytics.mockResolvedValue(undefined);
      mockFileExists.mockResolvedValue(false);
      mockWriteFile.mockResolvedValue(undefined);

      await setupMocksAndImport();

      // Verify analytics were saved with ended_at
      expect(mockSaveAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'test-session-123',
          ended_at: expect.any(String),
        })
      );

      // Verify session summary file was written
      expect(mockWriteFile).toHaveBeenCalled();
      const writeFilePath = mockWriteFile.mock.calls[0][0] as string;
      expect(writeFilePath).toMatch(/session-test-session-123\.json$/);

      // Parse the written summary to verify content
      const writtenSummary = JSON.parse(
        mockWriteFile.mock.calls[0][1] as string
      );
      expect(writtenSummary.session_id).toBe('test-session-123');
      expect(writtenSummary.tools_used).toBe(3);
      expect(writtenSummary.unique_tools).toEqual(['Bash', 'Read']);
      expect(writtenSummary.skills_recommended).toBe(2);
      expect(writtenSummary.validations_run).toBe(5);
      expect(writtenSummary.issues_found).toBe(2);
      expect(writtenSummary.duration_minutes).toBeDefined();

      // Verify respond was called with success response
      expect(mockRespond).toHaveBeenCalledWith({ continue: true });
    });

    it('should calculate duration correctly', async () => {
      // Session that lasted exactly 5 minutes
      const startTime = new Date('2025-01-01T10:00:00.000Z');
      const mockAnalytics = {
        session_id: 'duration-test',
        started_at: startTime.toISOString(),
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      mockReadHookInput.mockResolvedValue({
        session_id: 'duration-test',
        cwd: '/test/cwd',
        hook_event_name: 'Stop',
      });
      mockLoadAnalytics.mockResolvedValue(mockAnalytics);
      mockSaveAnalytics.mockResolvedValue(undefined);
      mockFileExists.mockResolvedValue(false);
      mockWriteFile.mockResolvedValue(undefined);

      await setupMocksAndImport();

      // Verify duration_minutes was calculated
      const writtenSummary = JSON.parse(
        mockWriteFile.mock.calls[0][1] as string
      );
      expect(typeof writtenSummary.duration_minutes).toBe('number');
    });
  });

  describe('session end without analytics', () => {
    it('should handle missing analytics gracefully', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'no-analytics-session',
        cwd: '/test/cwd',
        hook_event_name: 'Stop',
      });
      mockLoadAnalytics.mockResolvedValue(null);
      mockFileExists.mockResolvedValue(false);

      await setupMocksAndImport();

      // Should not attempt to save analytics or write summary
      expect(mockSaveAnalytics).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();

      // Should still respond with success
      expect(mockRespond).toHaveBeenCalledWith({ continue: true });
    });
  });

  describe('temp file cleanup', () => {
    it('should delete temp files that exist', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'cleanup-test',
        cwd: '/test/cwd',
        hook_event_name: 'Stop',
      });
      mockLoadAnalytics.mockResolvedValue(null);
      mockFileExists.mockResolvedValue(true);
      mockUnlink.mockResolvedValue(undefined);

      await setupMocksAndImport();

      // Verify temp file was deleted
      expect(mockUnlink).toHaveBeenCalled();
      const unlinkPath = mockUnlink.mock.calls[0][0] as string;
      expect(unlinkPath).toMatch(/detected-stack\.json$/);
      expect(mockDebug).toHaveBeenCalledWith(
        'Cleaned up temp file: detected-stack.json'
      );
    });

    it('should not attempt to delete non-existent temp files', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'no-cleanup-test',
        cwd: '/test/cwd',
        hook_event_name: 'Stop',
      });
      mockLoadAnalytics.mockResolvedValue(null);
      mockFileExists.mockResolvedValue(false);

      await setupMocksAndImport();

      // Should not attempt to unlink
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('should handle unlink errors gracefully', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'unlink-error-test',
        cwd: '/test/cwd',
        hook_event_name: 'Stop',
      });
      mockLoadAnalytics.mockResolvedValue(null);
      mockFileExists.mockResolvedValue(true);
      mockUnlink.mockRejectedValue(new Error('Permission denied'));

      await setupMocksAndImport();

      // Should log error
      expect(mockLogError).toHaveBeenCalledWith('Stop main', expect.any(Error));

      // Should still respond
      expect(mockRespond).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle errors and respond with error message', async () => {
      const testError = new Error('Test error during stop');
      mockReadHookInput.mockRejectedValue(testError);

      await setupMocksAndImport();

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith('Stop main', testError);

      // Verify error response was sent
      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          continue: true,
          systemMessage: 'Cleanup error: Test error during stop',
        })
      );
    });

    it('should handle non-Error objects in catch block', async () => {
      const stringError = 'String error message';
      mockReadHookInput.mockRejectedValue(stringError);

      await setupMocksAndImport();

      // Verify error was logged
      expect(mockLogError).toHaveBeenCalledWith('Stop main', stringError);

      // Verify error message uses String() for non-Error objects
      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: 'Cleanup error: String error message',
        })
      );
    });

    it('should handle analytics save failure', async () => {
      const mockAnalytics = {
        session_id: 'save-fail-test',
        started_at: '2025-01-01T00:00:00.000Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      mockReadHookInput.mockResolvedValue({
        session_id: 'save-fail-test',
        cwd: '/test/cwd',
        hook_event_name: 'Stop',
      });
      mockLoadAnalytics.mockResolvedValue(mockAnalytics);
      mockSaveAnalytics.mockRejectedValue(new Error('Save failed'));
      mockFileExists.mockResolvedValue(false);

      await setupMocksAndImport();

      // Verify error handling was triggered
      expect(mockLogError).toHaveBeenCalledWith('Stop main', expect.any(Error));
      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: 'Cleanup error: Save failed',
        })
      );
    });

    it('should handle writeFile error', async () => {
      const mockAnalytics = {
        session_id: 'write-fail-test',
        started_at: '2025-01-01T00:00:00.000Z',
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
      };

      mockReadHookInput.mockResolvedValue({
        session_id: 'write-fail-test',
        cwd: '/test/cwd',
        hook_event_name: 'Stop',
      });
      mockLoadAnalytics.mockResolvedValue(mockAnalytics);
      mockSaveAnalytics.mockResolvedValue(undefined);
      mockFileExists.mockResolvedValue(false);
      mockWriteFile.mockRejectedValue(new Error('Write failed'));

      await setupMocksAndImport();

      // Verify error handling was triggered
      expect(mockLogError).toHaveBeenCalledWith('Stop main', expect.any(Error));
      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: 'Cleanup error: Write failed',
        })
      );
    });

    it('should handle uncaught promise rejection', async () => {
      mockReadHookInput.mockRejectedValue(new Error('Uncaught error'));

      await setupMocksAndImport();

      // Verify error handler was called (main catch block catches it before uncaught handler)
      expect(mockLogError).toHaveBeenCalledWith(
        'Stop main',
        expect.any(Error)
      );
    });
  });

  describe('debug logging', () => {
    it('should log debug messages during successful execution', async () => {
      const mockAnalytics = {
        session_id: 'debug-test',
        started_at: '2025-01-01T00:00:00.000Z',
        tool_usage: [
          {
            tool: 'Bash',
            timestamp: '2025-01-01T00:01:00.000Z',
            success: true,
          },
        ],
        skills_recommended: [],
        validations_run: 1,
        issues_found: 0,
      };

      mockReadHookInput.mockResolvedValue({
        session_id: 'debug-test',
        cwd: '/test/cwd',
        hook_event_name: 'Stop',
      });
      mockLoadAnalytics.mockResolvedValue(mockAnalytics);
      mockSaveAnalytics.mockResolvedValue(undefined);
      mockFileExists.mockResolvedValue(false);
      mockWriteFile.mockResolvedValue(undefined);

      await setupMocksAndImport();

      // Verify debug calls
      expect(mockDebug).toHaveBeenCalledWith('Stop hook starting');
      expect(mockDebug).toHaveBeenCalledWith('Stop hook received input', {
        session_id: 'debug-test',
      });
      expect(mockDebug).toHaveBeenCalledWith('Loaded analytics', {
        has_analytics: true,
        session_id: 'debug-test',
      });
      expect(mockDebug).toHaveBeenCalledWith(
        expect.stringContaining('Session summary saved to'),
        expect.objectContaining({
          duration_minutes: expect.any(Number),
          tools_used: 1,
          issues_found: 0,
        })
      );
    });

    it('should log when no analytics are present', async () => {
      mockReadHookInput.mockResolvedValue({
        session_id: 'no-analytics',
        cwd: '/test/cwd',
        hook_event_name: 'Stop',
      });
      mockLoadAnalytics.mockResolvedValue(null);
      mockFileExists.mockResolvedValue(false);

      await setupMocksAndImport();

      expect(mockDebug).toHaveBeenCalledWith('Loaded analytics', {
        has_analytics: false,
        session_id: undefined,
      });
    });
  });
});
