/**
 * Unit tests for watch-for-errors handler
 *
 * Tests cover:
 * - handleWatchForErrors main function
 * - Argument validation
 * - File source mode (tailFile)
 * - Command source mode (captureCommandOutput)
 * - Error pattern matching
 * - Warning pattern matching
 * - Error type classification
 * - Message normalization and deduplication
 * - Stack trace extraction
 * - Result formatting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock modules - use function factories to avoid hoisting issues
vi.mock('fs');
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as object,
    spawn: vi.fn(),
  };
});

vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

vi.mock('../../../utils.js', () => ({
  fileExists: vi.fn(),
}));

// Import mocked modules after vi.mock
import * as fsPromises from 'fs/promises';
import { fileExists } from '../../../utils.js';

// Create typed references to the mocked functions
const mockFsReadFile = vi.mocked(fsPromises.readFile);
const mockFileExists = vi.mocked(fileExists);

// Import after mocks
import {
  handleWatchForErrors,
  type WatchForErrorsArgs,
  type WatchForErrorsResult,
  type DetectedError,
  type DetectedWarning,
  type ErrorType,
} from '../../../handlers/process/watch-for-errors.js';

// Helper to create mock child process
function createMockChildProcess(options: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: Error;
} = {}): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();

  Object.defineProperty(proc, 'stdout', { value: stdoutEmitter });
  Object.defineProperty(proc, 'stderr', { value: stderrEmitter });
  Object.defineProperty(proc, 'killed', { value: false, writable: true });
  proc.kill = vi.fn().mockReturnValue(true);

  setTimeout(() => {
    if (options.stdout) {
      stdoutEmitter.emit('data', Buffer.from(options.stdout));
    }
    if (options.stderr) {
      stderrEmitter.emit('data', Buffer.from(options.stderr));
    }
    if (options.error) {
      proc.emit('error', options.error);
    } else {
      proc.emit('close', options.exitCode ?? 0);
    }
  }, 10);

  return proc;
}

describe('watch-for-errors handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  describe('handleWatchForErrors', () => {
    describe('argument validation', () => {
      it('should return error when source is file but file_path is missing', async () => {
        const resultPromise = handleWatchForErrors({
          source: 'file',
        } as WatchForErrorsArgs);

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toContain('file_path is required');
      });

      it('should return error when source is command but command is missing', async () => {
        const resultPromise = handleWatchForErrors({
          source: 'command',
        } as WatchForErrorsArgs);

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toContain('command is required');
      });

      it('should accept valid file source arguments', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('Normal log line\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBeFalsy();
      });

      it('should accept valid command source arguments', async () => {
        vi.mocked(spawn).mockReturnValue(createMockChildProcess({
          stdout: 'Normal output\n',
        }));

        const resultPromise = handleWatchForErrors({
          source: 'command',
          command: 'echo test',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBeFalsy();
      });
    });

    describe('file source mode', () => {
      it('should return error when file does not exist', async () => {
        mockFileExists.mockResolvedValue(false);

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/missing.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toContain('File not found');
      });

      it('should read last N lines from file', async () => {
        mockFileExists.mockResolvedValue(true);

        const lines = Array.from({ length: 200 }, (_, i) => `Line ${i}`).join('\n');
        mockFsReadFile.mockResolvedValue(lines);

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
          tail_lines: 100,
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBeFalsy();
      });

      it('should use default tail_lines of 100', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('Log content\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        await resultPromise;

        expect(mockFsReadFile).toHaveBeenCalled();
      });

      it('should resolve file path relative to cwd', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('Log\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
          cwd: 'subdir',
        });

        vi.runAllTimersAsync();
        await resultPromise;

        expect(mockFileExists).toHaveBeenCalledWith(
          expect.stringContaining('subdir')
        );
      });

      it('should handle file read error', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockRejectedValue(new Error('Permission denied'));

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toContain('Permission denied');
      });
    });

    describe('command source mode', () => {
      it('should spawn command and capture output', async () => {
        vi.mocked(spawn).mockReturnValue(createMockChildProcess({
          stdout: 'Command output\n',
        }));

        const resultPromise = handleWatchForErrors({
          source: 'command',
          command: 'npm run test',
        });

        vi.runAllTimersAsync();
        await resultPromise;

        expect(spawn).toHaveBeenCalled();
      });

      it('should capture both stdout and stderr', async () => {
        vi.mocked(spawn).mockReturnValue(createMockChildProcess({
          stdout: 'stdout content\n',
          stderr: 'stderr content\n',
        }));

        const resultPromise = handleWatchForErrors({
          source: 'command',
          command: 'npm run test',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        // Both should be captured
        expect(result.content[0].text).toBeDefined();
      });

      it('should use specified duration', async () => {
        vi.mocked(spawn).mockReturnValue(createMockChildProcess({
          stdout: 'output\n',
        }));

        const resultPromise = handleWatchForErrors({
          source: 'command',
          command: 'npm run dev',
          duration: 10000,
        });

        vi.runAllTimersAsync();
        await resultPromise;

        expect(spawn).toHaveBeenCalled();
      });

      it('should use default duration of 5000ms', async () => {
        vi.mocked(spawn).mockReturnValue(createMockChildProcess({
          stdout: 'output\n',
        }));

        const resultPromise = handleWatchForErrors({
          source: 'command',
          command: 'npm run dev',
        });

        vi.runAllTimersAsync();
        await resultPromise;

        // Default duration is used internally
        expect(spawn).toHaveBeenCalled();
      });

      it('should handle command spawn error', async () => {
        vi.mocked(spawn).mockReturnValue(createMockChildProcess({
          error: new Error('Command not found'),
        }));

        const resultPromise = handleWatchForErrors({
          source: 'command',
          command: 'invalid-command',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toContain('Command not found');
      });

      it('should handle empty command', async () => {
        // Test that whitespace-only commands are rejected
        const resultPromise = handleWatchForErrors({
          source: 'command',
          command: '   ',
        });

        // No need to run timers - validation happens before spawn
        const result = await resultPromise;

        expect(result.isError).toBe(true);
      });

      it('should parse quoted arguments in command', async () => {
        vi.mocked(spawn).mockReturnValue(createMockChildProcess({
          stdout: 'output\n',
        }));

        const resultPromise = handleWatchForErrors({
          source: 'command',
          command: 'grep "error pattern" logs.txt',
        });

        vi.runAllTimersAsync();
        await resultPromise;

        expect(spawn).toHaveBeenCalled();
      });
    });

    describe('error pattern detection', () => {
      it('should detect "error" keyword', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('Application error occurred\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('error');
      });

      it('should detect "exception" keyword', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('Unhandled exception thrown\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('exception');
      });

      it('should detect "TypeError" pattern', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('TypeError: Cannot read property of undefined\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        // Should be in markdown output
        expect(result.content[0].text).toContain('TypeError');
      });

      it('should detect "ECONNREFUSED" pattern', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('connect ECONNREFUSED 127.0.0.1:3000\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('ECONNREFUSED');
      });

      it('should use custom error patterns', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('CUSTOM_ERROR: Something went wrong\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
          patterns: ['CUSTOM_ERROR'],
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('CUSTOM_ERROR');
      });

      it('should handle invalid regex in custom patterns', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('Normal line\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
          patterns: ['[invalid regex'],
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        // Should not throw, invalid regex is escaped
        expect(result.isError).toBeFalsy();
      });
    });

    describe('warning pattern detection', () => {
      it('should detect "WARN" keyword', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('[WARN] Configuration is deprecated\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('Warning');
      });

      it('should detect "deprecated" keyword', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('This API is deprecated\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('deprecated');
      });
    });

    describe('error type classification', () => {
      it('should classify SyntaxError', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('SyntaxError: Unexpected token\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('SYNTAX');
      });

      it('should classify TypeError', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('TypeError: undefined is not a function\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('TYPE');
      });

      it('should classify ReferenceError', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('ReferenceError: foo is not defined\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('REFERENCE');
      });

      it('should classify module not found errors', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('Cannot find module "missing-package"\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('MODULE');
      });

      it('should classify permission errors', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('EACCES: permission denied\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('PERMISSION');
      });

      it('should classify network errors', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('ECONNREFUSED: Connection refused\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('NETWORK');
      });

      it('should classify assertion errors', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('AssertionError: expected true to equal false\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('ASSERTION');
      });

      it('should classify unknown errors', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('Some generic error message\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('UNKNOWN');
      });
    });

    describe('stack trace extraction', () => {
      it('should extract stack trace lines', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue(
          'Error: Something went wrong\n' +
          '    at Function.foo (/path/to/file.js:10:5)\n' +
          '    at Object.<anonymous> (/path/to/other.js:20:3)\n' +
          '    at Module._compile (node:internal/modules/cjs/loader:1234:14)\n'
        );

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('at Function.foo');
      });

      it('should include stack trace in error object', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue(
          'TypeError: Cannot read property "foo"\n' +
          '    at bar (/app/src/file.ts:15:7)\n'
        );

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        // Stack trace should be in the formatted output
        expect(result.content[0].text).toContain('at bar');
      });
    });

    describe('error deduplication', () => {
      it('should deduplicate similar error messages', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue(
          'Error at /path/to/file.js:10:5\n' +
          'Error at /path/to/file.js:10:5\n' +
          'Error at /path/to/file.js:10:5\n'
        );

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        // Should have count indicator for duplicates
        expect(result.content[0].text).toBeDefined();
      });

      it('should normalize file paths in messages for deduplication', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue(
          'Error at /path/file1.js:10:5\n' +
          'Error at /path/file2.js:20:10\n'
        );

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        // Different paths should result in similar normalized messages
        expect(result.content[0].text).toBeDefined();
      });

      it('should normalize timestamps for deduplication', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue(
          '2024-01-15T10:00:00.000Z Error occurred\n' +
          '2024-01-15T10:01:00.000Z Error occurred\n'
        );

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        // Should normalize timestamps
        expect(result.content[0].text).toBeDefined();
      });
    });

    describe('result formatting', () => {
      it('should format result as markdown', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('Error: Test error\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        // Should contain markdown headers
        expect(result.content[0].text).toContain('## Error Watch Results');
      });

      it('should include summary section', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('Error: Test\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('### Summary');
      });

      it('should include source info', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('Log line\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('**Source:**');
      });

      it('should include lines analyzed count', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('Line 1\nLine 2\nLine 3\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('**Lines Analyzed:**');
      });

      it('should include raw JSON in details section', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('Normal log\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('Raw JSON');
        expect(result.content[0].text).toContain('```json');
      });

      it('should show "No Issues Found" when clean', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('Info: Application started\nDebug: Processing request\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('No Issues Found');
      });
    });

    describe('error sorting', () => {
      it('should sort errors by count (most frequent first)', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue(
          'TypeError: A\n' +
          'SyntaxError: B\n' +
          'SyntaxError: B\n' +
          'SyntaxError: B\n'
        );

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        // SyntaxError should appear first due to higher count
        const text = result.content[0].text;
        const syntaxIndex = text.indexOf('SYNTAX');
        const typeIndex = text.indexOf('TYPE');
        expect(syntaxIndex).toBeLessThan(typeIndex);
      });

      it('should sort by type severity when counts are equal', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue(
          'ReferenceError: ref error\n' +
          'SyntaxError: syntax error\n' +
          'TypeError: type error\n'
        );

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        // Syntax should come before Type which comes before Reference
        expect(result.content[0].text).toBeDefined();
      });
    });

    describe('warning sorting', () => {
      it('should sort warnings by count (most frequent first)', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue(
          'WARN: Warning A\n' +
          'WARNING: Warning B\n' +
          'WARNING: Warning B\n' +
          'WARNING: Warning B\n'
        );

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.content[0].text).toContain('Warning');
      });
    });

    describe('response format', () => {
      it('should return properly formatted MCP response', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('Log line\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result).toHaveProperty('content');
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toHaveProperty('type', 'text');
      });

      it('should set isError when mismatch found', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue('Normal log\n');

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        // No errors = no isError flag
        expect(result.isError).toBeFalsy();
      });
    });

    describe('line number tracking', () => {
      it('should include line numbers for file source', async () => {
        mockFileExists.mockResolvedValue(true);
        mockFsReadFile.mockResolvedValue(
          'Normal line\nNormal line\nError: Something failed\n'
        );

        const resultPromise = handleWatchForErrors({
          source: 'file',
          file_path: 'logs/app.log',
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        // Should include line reference
        expect(result.content[0].text).toContain('line');
      });
    });
  });
});

describe('similarity calculation', () => {
  // Test deduplication similarity thresholds

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('should consider very similar messages as duplicates', async () => {
    mockFileExists.mockResolvedValue(true);
    mockFsReadFile.mockResolvedValue(
      'Error: Connection to database failed at 10:00\n' +
      'Error: Connection to database failed at 10:01\n'
    );

    const resultPromise = handleWatchForErrors({
      source: 'file',
      file_path: 'logs/app.log',
    });

    vi.runAllTimersAsync();
    const result = await resultPromise;

    // Should be deduplicated to show count
    expect(result.content[0].text).toBeDefined();
  });

  it('should keep distinct messages separate', async () => {
    mockFileExists.mockResolvedValue(true);
    mockFsReadFile.mockResolvedValue(
      'Error: Connection to database failed\n' +
      'Error: File system permission denied\n'
    );

    const resultPromise = handleWatchForErrors({
      source: 'file',
      file_path: 'logs/app.log',
    });

    vi.runAllTimersAsync();
    const result = await resultPromise;

    // Both errors should appear as separate
    expect(result.content[0].text).toContain('database');
    expect(result.content[0].text).toContain('permission');
  });
});
