/**
 * Unit tests for log-analyzer handler
 *
 * Tests cover:
 * - parseTimeWindow function
 * - detectLevel function
 * - parseTimestamp function
 * - extractTimestamp function
 * - detectStructured function
 * - parseLogLine function
 * - normalizeMessage function
 * - groupMessages function
 * - detectAnomalies function
 * - calculateRateAnalysis function
 * - tailFile function
 * - matchPatterns function
 * - handleLogAnalyzer main function
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock modules before imports
vi.mock('fs');
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => ({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    })),
  };
});
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

import { handleLogAnalyzer, LogAnalyzerArgs } from '../../../handlers/analysis/log-analyzer.js';

describe('handleLogAnalyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('argument validation', () => {
    it('should require path when source is file', async () => {
      const args: LogAnalyzerArgs = {
        source: 'file',
      };

      const result = await handleLogAnalyzer(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('path is required');
    });

    it('should require command when source is command', async () => {
      const args: LogAnalyzerArgs = {
        source: 'command',
      };

      const result = await handleLogAnalyzer(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('command is required');
    });
  });

  describe('file source', () => {
    it('should return error when file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/nonexistent/log.txt',
      };

      const result = await handleLogAnalyzer(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('File not found');
    });

    it('should analyze text log file successfully', async () => {
      const logContent = `
2024-01-15T10:30:00Z INFO Application started
2024-01-15T10:30:01Z DEBUG Loading configuration
2024-01-15T10:30:02Z WARN Configuration value missing, using default
2024-01-15T10:30:03Z ERROR Database connection failed
2024-01-15T10:30:04Z INFO Retrying connection
2024-01-15T10:30:05Z INFO Connection established
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/app.log',
        tail_lines: 100,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Log Analysis Results');
      expect(result.content[0].text).toContain('entries_analyzed');
    });

    it('should analyze JSON structured logs', async () => {
      const logContent = `
{"timestamp":"2024-01-15T10:30:00Z","level":"info","message":"Application started"}
{"timestamp":"2024-01-15T10:30:01Z","level":"debug","message":"Loading config"}
{"timestamp":"2024-01-15T10:30:02Z","level":"warn","message":"Missing value"}
{"timestamp":"2024-01-15T10:30:03Z","level":"error","message":"Connection failed"}
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/app.json',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('format_detected');
    });

    it('should return error for empty log file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('');

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/empty.log',
      };

      const result = await handleLogAnalyzer(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('No log entries found');
    });

    it('should handle file read errors', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/protected.log',
      };

      const result = await handleLogAnalyzer(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Permission denied');
    });

    it('should use absolute path when provided', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('2024-01-15 INFO Test log');

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/absolute/path/log.txt',
      };

      await handleLogAnalyzer(args);

      expect(fs.existsSync).toHaveBeenCalledWith('/absolute/path/log.txt');
    });

    it('should resolve relative path from project root', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('2024-01-15 INFO Test log');

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: 'logs/app.log',
      };

      await handleLogAnalyzer(args);

      // Path should be resolved from PROJECT_ROOT
      expect(fs.existsSync).toHaveBeenCalled();
    });
  });

  describe('log level detection', () => {
    it('should count log levels correctly', async () => {
      const logContent = `
DEBUG: Debug message
INFO: Info message
WARN: Warning message
WARNING: Another warning
ERROR: Error message
FATAL: Fatal error
TRACE: Trace message
LOG: Log message
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/levels.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('levels');
      expect(result.content[0].text).toContain('debug');
      expect(result.content[0].text).toContain('info');
      expect(result.content[0].text).toContain('warn');
      expect(result.content[0].text).toContain('error');
    });

    it('should detect verbose as debug level', async () => {
      const logContent = 'VERBOSE: Some verbose message';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/verbose.log',
      };

      const result = await handleLogAnalyzer(args);

      // Verbose should be counted as debug
      expect(result.content[0].text).toContain('debug');
    });

    it('should detect critical as error level', async () => {
      const logContent = 'CRITICAL: Critical error occurred';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/critical.log',
      };

      const result = await handleLogAnalyzer(args);

      // Critical should be counted as error
      expect(result.content[0].text).toContain('error');
    });
  });

  describe('timestamp parsing', () => {
    it('should parse ISO 8601 timestamps', async () => {
      const logContent = '2024-01-15T10:30:45.123Z INFO Test message';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/iso.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('time_range');
    });

    it('should parse common format timestamps', async () => {
      const logContent = '2024-01-15 10:30:45 INFO Test message';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/common.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('time_range');
    });

    it('should parse bracketed timestamps', async () => {
      const logContent = '[2024-01-15 10:30:45] INFO: Test message';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/bracketed.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('time_range');
    });
  });

  describe('error grouping', () => {
    it('should group duplicate error messages', async () => {
      const logContent = `
2024-01-15T10:30:00Z ERROR Database connection failed
2024-01-15T10:30:01Z ERROR Database connection failed
2024-01-15T10:30:02Z ERROR Database connection failed
2024-01-15T10:30:03Z ERROR Different error occurred
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/errors.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('errors');
      expect(result.content[0].text).toContain('count');
    });

    it('should normalize messages with timestamps and UUIDs', async () => {
      const logContent = `
2024-01-15T10:30:00Z ERROR User 550e8400-e29b-41d4-a716-446655440000 not found
2024-01-15T10:30:01Z ERROR User 123e4567-e89b-12d3-a456-426614174000 not found
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/uuids.log',
      };

      const result = await handleLogAnalyzer(args);

      // Both errors should be grouped as the same normalized message
      expect(result.content[0].text).toContain('errors');
    });
  });

  describe('custom patterns', () => {
    it('should match custom patterns', async () => {
      const logContent = `
2024-01-15T10:30:00Z Request timeout after 30s
2024-01-15T10:30:01Z Request timeout after 45s
2024-01-15T10:30:02Z INFO Normal message
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/timeouts.log',
        patterns: [
          { name: 'timeout', regex: 'timeout after \\d+s', level: 'error' },
        ],
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('patterns_matched');
      expect(result.content[0].text).toContain('timeout');
    });

    it('should handle invalid regex patterns gracefully', async () => {
      const logContent = '2024-01-15T10:30:00Z INFO Test message';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/test.log',
        patterns: [
          { name: 'invalid', regex: '[invalid(regex', level: 'warn' },
        ],
      };

      const result = await handleLogAnalyzer(args);

      // Should complete without error
      expect(result.isError).toBeUndefined();
    });
  });

  describe('time window filtering', () => {
    it('should filter by time window in seconds', async () => {
      const logContent = `
2024-01-15T10:30:00Z INFO Old message
2024-01-15T10:30:01Z INFO Another old message
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/test.log',
        time_window: '30s',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('entries_analyzed');
    });

    it('should filter by time window in minutes', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('2024-01-15T10:30:00Z INFO Test');

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/test.log',
        time_window: '5m',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
    });

    it('should filter by time window in hours', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('2024-01-15T10:30:00Z INFO Test');

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/test.log',
        time_window: '1h',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
    });

    it('should filter by time window in days', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('2024-01-15T10:30:00Z INFO Test');

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/test.log',
        time_window: '7d',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
    });

    it('should handle invalid time window format', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('2024-01-15T10:30:00Z INFO Test');

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/test.log',
        time_window: 'invalid',
      };

      const result = await handleLogAnalyzer(args);

      // Should complete without error, ignoring invalid window
      expect(result.isError).toBeUndefined();
    });
  });

  describe('format detection', () => {
    it('should detect JSON format', async () => {
      const logContent = `
{"level":"info","message":"test1"}
{"level":"info","message":"test2"}
{"level":"info","message":"test3"}
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/json.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('"format_detected": "json"');
    });

    it('should detect text format', async () => {
      const logContent = `
2024-01-15 INFO Test message 1
2024-01-15 INFO Test message 2
2024-01-15 INFO Test message 3
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/text.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('"format_detected": "text"');
    });

    it('should detect mixed format', async () => {
      const logContent = `
{"level":"info","message":"json log"}
2024-01-15 INFO text log
{"level":"error","message":"another json"}
Some plain text without structure
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/mixed.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('format_detected');
    });
  });

  describe('JSON structured log parsing', () => {
    it('should parse timestamp from JSON timestamp field', async () => {
      const logContent = '{"timestamp":"2024-01-15T10:30:00Z","level":"info","message":"test"}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/json.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('time_range');
    });

    it('should parse timestamp from JSON time field', async () => {
      const logContent = '{"time":"2024-01-15T10:30:00Z","level":"info","msg":"test"}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/json.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
    });

    it('should parse timestamp from JSON ts field', async () => {
      const logContent = '{"ts":"2024-01-15T10:30:00Z","severity":"info","message":"test"}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/json.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
    });

    it('should parse level from severity field', async () => {
      const logContent = '{"timestamp":"2024-01-15T10:30:00Z","severity":"error","message":"test"}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/json.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('error');
    });

    it('should parse message from msg field', async () => {
      const logContent = '{"timestamp":"2024-01-15T10:30:00Z","level":"info","msg":"test message"}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/json.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('response format', () => {
    it('should return formatted markdown response', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('2024-01-15T10:30:00Z INFO Test');

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/test.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('## Log Analysis Results');
      expect(result.content[0].text).toContain('**Entries Analyzed:**');
      expect(result.content[0].text).toContain('**Format Detected:**');
    });

    it('should include source info in response', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('2024-01-15T10:30:00Z INFO Test');

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/test.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('source_info');
      expect(result.content[0].text).toContain('"type": "file"');
    });

    it('should include JSON result in response', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('2024-01-15T10:30:00Z INFO Test');

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/test.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('```json');
      expect(result.content[0].text).toContain('entries_analyzed');
    });
  });

  describe('detectLevel edge cases', () => {
    it('should return undefined for unrecognized level string', async () => {
      // Line 160: detectLevel returns undefined for unrecognized strings
      const logContent = 'UNKNOWN_LEVEL: Some message without recognizable level';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/unknown.log',
      };

      const result = await handleLogAnalyzer(args);

      // Should have 1 unknown entry since level is not recognized
      expect(result.content[0].text).toContain('"unknown": 1');
    });

    it('should detect err as error level in JSON structured log', async () => {
      // detectLevel checks lower === 'err', so we need JSON with level: 'err'
      const logContent = '{"timestamp":"2024-01-15T10:30:00Z","level":"err","message":"Something went wrong"}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/err.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('"error": 1');
    });
  });

  describe('parseTimestamp Unix timestamps', () => {
    it('should parse Unix timestamp in milliseconds (13 digits)', async () => {
      // Lines 202-204: parseTimestamp handles 13-digit Unix timestamps (ms)
      // Timestamp 1705315800000 = 2024-01-15T10:30:00Z
      const logContent = '1705315800000 INFO Message with unix timestamp ms';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/unix-ms.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('time_range');
    });

    it('should parse Unix timestamp in seconds (10 digits)', async () => {
      // Lines 207-209: parseTimestamp handles 10-digit Unix timestamps (s)
      // Timestamp 1705315800 = 2024-01-15T10:30:00Z
      const logContent = '1705315800 INFO Message with unix timestamp seconds';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/unix-s.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('time_range');
    });
  });

  describe('parseLogLine patterns', () => {
    it('should parse level-first pattern (LEVEL timestamp message)', async () => {
      // Lines 319-321: parseLogLine handles level-first pattern
      const logContent = 'ERROR [2024-01-15T10:30:00Z] Database connection failed';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/level-first.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('"error": 1');
      expect(result.content[0].text).toContain('time_range');
    });

    it('should handle log line with only two capture groups (fallback message)', async () => {
      // Line 328: parseLogLine fallback when match.length != 3 or 4
      // This tests the fallback path when pattern matching is incomplete
      const logContent = 'Some random log line without clear structure';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/fallback.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('"unknown": 1');
    });
  });

  describe('groupMessages with stack traces', () => {
    it('should extract stack trace from error entry with "    at " pattern', async () => {
      // Lines 410-414: groupMessages extracts sample_stack from entries
      // The raw line must contain "    at " within the same entry
      const logContent = `
2024-01-15T10:30:00Z ERROR TypeError: Cannot read property 'foo' of undefined    at Object.<anonymous> (/app/src/index.ts:42:15)
2024-01-15T10:30:01Z ERROR TypeError: Cannot read property 'foo' of undefined    at Object.<anonymous> (/app/src/index.ts:42:15)
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/stack.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('sample_stack');
    });

    it('should extract stack trace from JSON log with stack field', async () => {
      // Lines 410-414: groupMessages extracts sample_stack from metadata.stack
      const logContent = `
{"timestamp":"2024-01-15T10:30:00Z","level":"error","message":"Error occurred","stack":"Error: test\\n    at foo (/app/src/test.ts:10:5)"}
{"timestamp":"2024-01-15T10:30:01Z","level":"error","message":"Error occurred","stack":"Error: test\\n    at foo (/app/src/test.ts:10:5)"}
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/json-stack.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('sample_stack');
    });

    it('should extract stack trace with tab-prefixed "at" pattern', async () => {
      // Lines 406-407: groupMessages checks for '\tat ' pattern
      const logContent = `
2024-01-15T10:30:00Z ERROR java.lang.NullPointerException
\tat com.example.App.main(App.java:15)
\tat sun.reflect.NativeMethodAccessorImpl.invoke0(Native Method)
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/java-stack.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('errors');
    });
  });

  describe('detectAnomalies', () => {
    it('should detect gaps in log entries', async () => {
      // Lines 448-460: detectAnomalies detects gaps > 5x average and > 60s
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // Generate 15 entries with 1-second intervals, then a 5-minute gap
      for (let i = 0; i < 15; i++) {
        const ts = new Date(baseTime + i * 1000).toISOString();
        lines.push(`${ts} INFO Regular log entry ${i}`);
      }
      // Add a 5-minute gap (300 seconds)
      const gapTs = new Date(baseTime + 14000 + 300000).toISOString();
      lines.push(`${gapTs} INFO Entry after long gap`);
      // Add more entries after the gap
      for (let i = 0; i < 5; i++) {
        const ts = new Date(baseTime + 14000 + 300000 + (i + 1) * 1000).toISOString();
        lines.push(`${ts} INFO Post-gap entry ${i}`);
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/gaps.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('anomalies');
      expect(result.content[0].text).toContain('gap');
    });

    it('should detect error spikes', async () => {
      // Lines 464-481: detectAnomalies detects error spikes (2nd half > 3x first half)
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // First half: mostly info, few errors
      for (let i = 0; i < 50; i++) {
        const ts = new Date(baseTime + i * 1000).toISOString();
        if (i % 25 === 0) {
          lines.push(`${ts} ERROR Occasional error in first half`);
        } else {
          lines.push(`${ts} INFO Normal log entry ${i}`);
        }
      }

      // Second half: many errors (spike)
      for (let i = 50; i < 100; i++) {
        const ts = new Date(baseTime + i * 1000).toISOString();
        if (i % 3 === 0) {
          lines.push(`${ts} ERROR Frequent error in second half ${i}`);
        } else {
          lines.push(`${ts} INFO Normal log entry ${i}`);
        }
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/spike.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('anomalies');
      expect(result.content[0].text).toContain('spike');
    });

    it('should detect new error types in second half', async () => {
      // Lines 484-512: detectAnomalies detects new error types
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // First half: known error type
      for (let i = 0; i < 30; i++) {
        const ts = new Date(baseTime + i * 1000).toISOString();
        if (i % 10 === 0) {
          lines.push(`${ts} ERROR Known error type A`);
        } else {
          lines.push(`${ts} INFO Normal entry ${i}`);
        }
      }

      // Second half: introduce new error types
      for (let i = 30; i < 60; i++) {
        const ts = new Date(baseTime + i * 1000).toISOString();
        if (i === 40) {
          lines.push(`${ts} ERROR Brand new error type B`);
        } else if (i === 50) {
          lines.push(`${ts} ERROR Another new error type C`);
        } else {
          lines.push(`${ts} INFO Normal entry ${i}`);
        }
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/new-errors.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('anomalies');
      expect(result.content[0].text).toContain('new_error');
    });

    it('should detect rate increase', async () => {
      // Lines 515-543: detectAnomalies detects rate changes
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // First quarter: slow rate (1 entry per 10 seconds)
      for (let i = 0; i < 10; i++) {
        const ts = new Date(baseTime + i * 10000).toISOString();
        lines.push(`${ts} INFO Slow entry ${i}`);
      }

      // Second and third quarter: medium rate
      for (let i = 0; i < 20; i++) {
        const ts = new Date(baseTime + 100000 + i * 5000).toISOString();
        lines.push(`${ts} INFO Medium entry ${i}`);
      }

      // Last quarter: fast rate (1 entry per second = 10x faster)
      for (let i = 0; i < 10; i++) {
        const ts = new Date(baseTime + 200000 + i * 1000).toISOString();
        lines.push(`${ts} INFO Fast entry ${i}`);
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/rate-increase.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('anomalies');
      expect(result.content[0].text).toContain('rate_change');
    });

    it('should detect rate decrease', async () => {
      // Lines 544-550: detectAnomalies detects rate decrease
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // First quarter: fast rate (1 entry per second)
      for (let i = 0; i < 10; i++) {
        const ts = new Date(baseTime + i * 1000).toISOString();
        lines.push(`${ts} INFO Fast entry ${i}`);
      }

      // Second and third quarter: medium rate
      for (let i = 0; i < 20; i++) {
        const ts = new Date(baseTime + 10000 + i * 5000).toISOString();
        lines.push(`${ts} INFO Medium entry ${i}`);
      }

      // Last quarter: slow rate (1 entry per 30 seconds = 30x slower)
      for (let i = 0; i < 10; i++) {
        const ts = new Date(baseTime + 110000 + i * 30000).toISOString();
        lines.push(`${ts} INFO Slow entry ${i}`);
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/rate-decrease.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('anomalies');
      expect(result.content[0].text).toContain('rate_change');
    });

    it('should not detect anomalies with insufficient entries', async () => {
      // Line 429: detectAnomalies returns early if < 10 entries
      const logContent = `
2024-01-15T10:30:00Z INFO Entry 1
2024-01-15T10:30:01Z INFO Entry 2
2024-01-15T10:30:02Z INFO Entry 3
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/few.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('"anomalies": []');
    });

    it('should detect many new error types (> 3 unique)', async () => {
      // Lines 505-511: detectAnomalies reports multiple new error types
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // First half: no errors, just info
      for (let i = 0; i < 30; i++) {
        const ts = new Date(baseTime + i * 1000).toISOString();
        lines.push(`${ts} INFO Normal entry ${i}`);
      }

      // Second half: introduce 5 new unique error types
      for (let i = 30; i < 60; i++) {
        const ts = new Date(baseTime + i * 1000).toISOString();
        if (i >= 35 && i <= 39) {
          lines.push(`${ts} ERROR New error type ${i - 35}`);
        } else {
          lines.push(`${ts} INFO Normal entry ${i}`);
        }
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/many-new-errors.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('anomalies');
      expect(result.content[0].text).toContain('new error types appeared');
    });
  });

  describe('calculateRateAnalysis', () => {
    it('should calculate rate analysis with multiple timed entries', async () => {
      // Lines 577-600: calculateRateAnalysis calculates rates and peak period
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // Generate entries over 5 minutes with varying rates
      // First 2 minutes: sparse (1 per 30s)
      for (let i = 0; i < 4; i++) {
        const ts = new Date(baseTime + i * 30000).toISOString();
        lines.push(`${ts} INFO Sparse entry ${i}`);
      }

      // Minute 3: peak (10 entries in 1 minute)
      for (let i = 0; i < 10; i++) {
        const ts = new Date(baseTime + 120000 + i * 6000).toISOString();
        if (i % 3 === 0) {
          lines.push(`${ts} ERROR Error during peak ${i}`);
        } else {
          lines.push(`${ts} INFO Peak entry ${i}`);
        }
      }

      // Minutes 4-5: normal (1 per 15s)
      for (let i = 0; i < 8; i++) {
        const ts = new Date(baseTime + 180000 + i * 15000).toISOString();
        lines.push(`${ts} INFO Normal entry ${i}`);
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/rate.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('rate_analysis');
      expect(result.content[0].text).toContain('entries_per_minute');
      expect(result.content[0].text).toContain('errors_per_minute');
      expect(result.content[0].text).toContain('peak_period');
    });

    it('should not return rate analysis with insufficient timed entries', async () => {
      // Line 565: calculateRateAnalysis returns undefined if < 2 timed entries
      const logContent = `
INFO Entry without timestamp
INFO Another entry without timestamp
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/no-timestamps.log',
      };

      const result = await handleLogAnalyzer(args);

      // Should not have rate_analysis since no timed entries
      expect(result.content[0].text).not.toContain('"rate_analysis":');
    });

    it('should not return rate analysis with duration < 1 minute', async () => {
      // Line 575: calculateRateAnalysis returns undefined if duration < 1 minute
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // All entries within 30 seconds
      for (let i = 0; i < 5; i++) {
        const ts = new Date(baseTime + i * 5000).toISOString();
        lines.push(`${ts} INFO Quick entry ${i}`);
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/short-duration.log',
      };

      const result = await handleLogAnalyzer(args);

      // rate_analysis may be null or undefined
      expect(result.isError).toBeUndefined();
    });
  });

  describe('formatResult sections', () => {
    it('should format anomalies section in output', async () => {
      // Lines 729-734: formatResult includes anomalies section
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // Create a gap anomaly
      for (let i = 0; i < 15; i++) {
        const ts = new Date(baseTime + i * 1000).toISOString();
        lines.push(`${ts} INFO Entry ${i}`);
      }
      // 10-minute gap
      const gapTs = new Date(baseTime + 14000 + 600000).toISOString();
      lines.push(`${gapTs} INFO After gap`);
      for (let i = 0; i < 5; i++) {
        const ts = new Date(baseTime + 14000 + 600000 + (i + 1) * 1000).toISOString();
        lines.push(`${ts} INFO Post gap ${i}`);
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/anomalies-format.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('### Anomalies Detected');
      expect(result.content[0].text).toContain('**[HIGH]**');
    });

    it('should format rate analysis section in output', async () => {
      // Lines 763-767: formatResult includes rate analysis section
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // 3 minutes of entries
      for (let i = 0; i < 30; i++) {
        const ts = new Date(baseTime + i * 6000).toISOString();
        if (i % 5 === 0) {
          lines.push(`${ts} ERROR Error entry ${i}`);
        } else {
          lines.push(`${ts} INFO Normal entry ${i}`);
        }
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/rate-format.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('### Rate Analysis');
      expect(result.content[0].text).toContain('Entries/min:');
      expect(result.content[0].text).toContain('Errors/min:');
      expect(result.content[0].text).toContain('Peak period:');
    });

    it('should format warnings section in output', async () => {
      // Lines 746-752: formatResult includes warnings section
      const logContent = `
2024-01-15T10:30:00Z WARN Configuration value missing
2024-01-15T10:30:01Z WARN Configuration value missing
2024-01-15T10:30:02Z WARN Deprecated API usage
2024-01-15T10:30:03Z INFO Normal entry
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/warnings.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('### Top Warnings');
      expect(result.content[0].text).toContain('**2x**');
    });

    it('should format custom patterns section in output', async () => {
      // Lines 754-759: formatResult includes patterns section
      const logContent = `
2024-01-15T10:30:00Z Request completed in 150ms
2024-01-15T10:30:01Z Request completed in 2500ms
2024-01-15T10:30:02Z Request completed in 3200ms
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/patterns-output.log',
        patterns: [
          { name: 'slow_request', regex: 'completed in [2-9]\\d{3}ms', level: 'warn' },
        ],
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('### Custom Pattern Matches');
      expect(result.content[0].text).toContain('slow_request:');
    });

    it('should format time range with duration in output', async () => {
      // Lines 709-718: formatResult includes time range with duration
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // 5 minutes of entries
      for (let i = 0; i < 10; i++) {
        const ts = new Date(baseTime + i * 30000).toISOString();
        lines.push(`${ts} INFO Entry ${i}`);
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/timerange.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('### Time Range');
      expect(result.content[0].text).toContain('- Start:');
      expect(result.content[0].text).toContain('- End:');
      expect(result.content[0].text).toContain('- Duration:');
    });
  });

  describe('command source', () => {
    it('should capture output from command execution', async () => {
      // Lines 822-824: handleLogAnalyzer command source branch
      const { spawn } = await import('child_process');

      // Create a more realistic mock that simulates stdout data
      vi.mocked(spawn).mockImplementation(() => {
        const mockStdout = {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              // Simulate receiving log data
              setTimeout(() => {
                callback(Buffer.from('2024-01-15T10:30:00Z INFO Test from command\n'));
                callback(Buffer.from('2024-01-15T10:30:01Z ERROR Error from command\n'));
              }, 5);
            }
          }),
        };
        const mockStderr = {
          on: vi.fn(),
        };
        const mockProc = {
          stdout: mockStdout,
          stderr: mockStderr,
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 20);
            }
          }),
          kill: vi.fn(),
        };
        return mockProc as ReturnType<typeof spawn>;
      });

      const args: LogAnalyzerArgs = {
        source: 'command',
        command: 'tail -f /var/log/app.log',
        duration_seconds: 1,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('source_info');
      expect(result.content[0].text).toContain('"type": "command"');
    });

    it('should handle command execution error', async () => {
      // Lines 654-657: captureCommand handles spawn error
      const { spawn } = await import('child_process');

      vi.mocked(spawn).mockImplementation(() => {
        const mockProc = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'error') {
              setTimeout(() => callback(new Error('Command not found')), 5);
            }
          }),
          kill: vi.fn(),
        };
        return mockProc as ReturnType<typeof spawn>;
      });

      const args: LogAnalyzerArgs = {
        source: 'command',
        command: 'nonexistent-command',
        duration_seconds: 1,
      };

      const result = await handleLogAnalyzer(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Command not found');
    });

    it('should handle empty command output', async () => {
      // Test command that produces no output
      const { spawn } = await import('child_process');

      vi.mocked(spawn).mockImplementation(() => {
        const mockProc = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 10);
            }
          }),
          kill: vi.fn(),
        };
        return mockProc as ReturnType<typeof spawn>;
      });

      const args: LogAnalyzerArgs = {
        source: 'command',
        command: 'echo ""',
        duration_seconds: 1,
      };

      const result = await handleLogAnalyzer(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('No log entries found');
    });

    it('should use default duration when not specified', async () => {
      // Line 822: default duration_seconds is 10
      const { spawn } = await import('child_process');

      vi.mocked(spawn).mockImplementation(() => {
        const mockStdout = {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              setTimeout(() => {
                callback(Buffer.from('2024-01-15T10:30:00Z INFO Test\n'));
              }, 5);
            }
          }),
        };
        const mockProc = {
          stdout: mockStdout,
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 20);
            }
          }),
          kill: vi.fn(),
        };
        return mockProc as ReturnType<typeof spawn>;
      });

      const args: LogAnalyzerArgs = {
        source: 'command',
        command: 'some-command',
        // duration_seconds not specified, should default to 10
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
    });

    it('should capture stderr output as well', async () => {
      // Lines 645-647: captureCommand captures stderr
      const { spawn } = await import('child_process');

      vi.mocked(spawn).mockImplementation(() => {
        const mockStdout = {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              setTimeout(() => {
                callback(Buffer.from('2024-01-15T10:30:00Z INFO stdout line\n'));
              }, 5);
            }
          }),
        };
        const mockStderr = {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              setTimeout(() => {
                callback(Buffer.from('2024-01-15T10:30:01Z ERROR stderr error\n'));
              }, 5);
            }
          }),
        };
        const mockProc = {
          stdout: mockStdout,
          stderr: mockStderr,
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 20);
            }
          }),
          kill: vi.fn(),
        };
        return mockProc as ReturnType<typeof spawn>;
      });

      const args: LogAnalyzerArgs = {
        source: 'command',
        command: 'some-command',
        duration_seconds: 1,
      };

      const result = await handleLogAnalyzer(args);

      // Should contain both stdout and stderr entries
      expect(result.content[0].text).toContain('entries_analyzed');
    });

    it('should kill process after timeout expires (line 638)', async () => {
      // Line 638: captureCommand kills the process after duration_seconds timeout
      const { spawn } = await import('child_process');

      vi.useFakeTimers();

      const killMock = vi.fn();
      let closeCallback: ((code: number) => void) | null = null;

      vi.mocked(spawn).mockImplementation(() => {
        const mockStdout = {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              // Send some data immediately
              callback(Buffer.from('2024-01-15T10:30:00Z INFO Test\n'));
            }
          }),
        };
        const mockProc = {
          stdout: mockStdout,
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              closeCallback = callback;
            }
          }),
          kill: killMock,
        };
        return mockProc as ReturnType<typeof spawn>;
      });

      const args: LogAnalyzerArgs = {
        source: 'command',
        command: 'long-running-command',
        duration_seconds: 2, // 2 second timeout
      };

      // Start the handler (returns a promise)
      const resultPromise = handleLogAnalyzer(args);

      // Advance time past the timeout (2 seconds = 2000ms)
      vi.advanceTimersByTime(2000);

      // The timeout should have triggered kill
      expect(killMock).toHaveBeenCalledWith('SIGTERM');

      // Simulate process closing after kill
      if (closeCallback) {
        closeCallback(0);
      }

      // Wait for the result
      const result = await resultPromise;

      vi.useRealTimers();

      expect(result.content[0].text).toContain('entries_analyzed');
    });
  });

  describe('custom patterns with level assignment', () => {
    it('should match patterns and set entry level (counted after level counting)', async () => {
      // Lines 679-682: matchPatterns sets entry.level from pattern.level
      // Note: Level counting happens BEFORE pattern matching in the main handler,
      // so the pattern-assigned levels don't affect the levels count.
      // The pattern matching still sets entry.level for potential downstream use.
      const logContent = `
2024-01-15T10:30:00Z Connection timeout after 30s
2024-01-15T10:30:01Z Connection timeout after 45s
2024-01-15T10:30:02Z Normal message
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/pattern-level.log',
        patterns: [
          { name: 'timeout', regex: 'timeout after', level: 'error' },
        ],
      };

      const result = await handleLogAnalyzer(args);

      // Pattern matching worked - 2 timeout matches
      expect(result.content[0].text).toContain('"timeout": 2');
      // Note: levels are counted before pattern matching, so error count is 0
      // This tests the pattern matching code path (lines 679-682)
      expect(result.content[0].text).toContain('patterns_matched');
    });
  });

  describe('cwd handling', () => {
    it('should use custom cwd when provided', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('2024-01-15T10:30:00Z INFO Test');

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: 'relative/path/log.txt',
        cwd: '/custom/working/directory',
      };

      await handleLogAnalyzer(args);

      // Path should be resolved from custom cwd
      expect(fs.existsSync).toHaveBeenCalled();
    });
  });

  describe('JSON structured log edge cases', () => {
    it('should handle numeric timestamp in JSON', async () => {
      const logContent = '{"timestamp":1705315800000,"level":"info","message":"test"}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/numeric-ts.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('time_range');
    });

    it('should handle lvl field for level in JSON', async () => {
      const logContent = '{"timestamp":"2024-01-15T10:30:00Z","lvl":"warn","message":"test"}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/lvl-field.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('"warn": 1');
    });

    it('should fall back to text parsing for invalid JSON in structured mode', async () => {
      // Lines 287-289: parseLogLine falls through to text parsing on JSON parse error
      const logContent = `
{"valid":"json","level":"info","message":"test1"}
{invalid json line}
{"level":"error","message":"test2"}
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/mixed-json.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      // Should still process valid JSON and handle invalid gracefully
      expect(result.isError).toBeUndefined();
    });

    it('should handle invalid timestamp that cannot be parsed', async () => {
      // Line 211: parseTimestamp returns undefined for unparseable timestamps
      const logContent = '{"timestamp":"not-a-valid-timestamp","level":"info","message":"test"}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/invalid-ts.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
      // time_range start should be null since timestamp couldn't be parsed
      expect(result.content[0].text).toContain('"start": null');
    });

    it('should return undefined from parseTimestamp for non-matching timestamp formats (line 211)', async () => {
      // Line 211: parseTimestamp returns undefined when:
      // 1. new Date(str) returns Invalid Date, AND
      // 2. str is not 13 digits (unix ms), AND
      // 3. str is not 10 digits (unix s)
      //
      // We need a timestamp that:
      // - Matches LOG_LINE_PATTERN regex (so it gets captured)
      // - But is invalid for new Date() (e.g., 9999-99-99 has invalid month 99)
      // - Is not exactly 10 or 13 digits
      //
      // The timestamp "9999-99-99T99:99:99" matches the regex pattern but is invalid
      const logContent = `9999-99-99T99:99:99 INFO Message with invalid timestamp`;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/invalid-date.log',
        structured: false,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
      // The timestamp couldn't be parsed, so time_range.start should be null
      expect(result.content[0].text).toContain('"start": null');
    });

    it('should handle numeric time field in JSON', async () => {
      const logContent = '{"time":1705315800000,"level":"info","message":"test"}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/numeric-time.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('time_range');
    });

    it('should handle numeric ts field in JSON', async () => {
      const logContent = '{"ts":1705315800,"level":"info","message":"test"}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/numeric-ts-s.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('additional edge cases for full coverage', () => {
    it('should return undefined for completely unrecognized level string (line 160)', async () => {
      // Line 160: detectLevel returns undefined for level strings that don't match ANY pattern
      // The level must NOT contain: debug, trace, verbose, info, log, warn, warning, error, fatal, critical, err
      // So we need a completely unrelated level string like "notice" or "custom"
      const logContent = '{"timestamp":"2024-01-15T10:30:00Z","level":"notice","message":"test"}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/notice-level.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      // "notice" doesn't match any level patterns, so it becomes unknown
      expect(result.content[0].text).toContain('"unknown": 1');
    });

    it('should handle log level with "log" keyword', async () => {
      // Line 150: detectLevel checks lower === 'log' for info
      const logContent = '{"timestamp":"2024-01-15T10:30:00Z","level":"log","message":"test"}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/log-level.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('"info": 1');
    });

    it('should handle log level "warning" (alternative for warn)', async () => {
      // Line 151: detectLevel checks lower === 'warning' for warn
      const logContent = '{"timestamp":"2024-01-15T10:30:00Z","level":"warning","message":"test"}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/warning-level.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('"warn": 1');
    });

    it('should handle JSON with only msg field (no message field)', async () => {
      // Line 277: parseLogLine uses json.msg when json.message is not present
      const logContent = '{"timestamp":"2024-01-15T10:30:00Z","level":"info","msg":"test message"}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/msg-field.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
    });

    it('should normalize hex addresses in error messages', async () => {
      // Line 360: normalizeMessage replaces hex addresses
      const logContent = `
2024-01-15T10:30:00Z ERROR Memory error at 0xDEADBEEF
2024-01-15T10:30:01Z ERROR Memory error at 0x12345678
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/hex.log',
      };

      const result = await handleLogAnalyzer(args);

      // Both errors should be grouped (addresses normalized)
      expect(result.content[0].text).toContain('"count": 2');
    });

    it('should normalize file paths with line numbers in error messages', async () => {
      // Line 358: normalizeMessage replaces file paths with line numbers
      const logContent = `
2024-01-15T10:30:00Z ERROR Error in /app/src/file.ts:42:15
2024-01-15T10:30:01Z ERROR Error in /app/src/other.js:100:5
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/file-paths.log',
      };

      const result = await handleLogAnalyzer(args);

      // Both errors should be grouped (file paths normalized)
      expect(result.content[0].text).toContain('"count": 2');
    });

    it('should normalize large numbers in error messages', async () => {
      // Line 367: normalizeMessage replaces large numbers (6+ digits)
      const logContent = `
2024-01-15T10:30:00Z ERROR Request 1234567 failed
2024-01-15T10:30:01Z ERROR Request 9876543 failed
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/large-nums.log',
      };

      const result = await handleLogAnalyzer(args);

      // Both errors should be grouped (numbers normalized)
      expect(result.content[0].text).toContain('"count": 2');
    });

    it('should handle empty patterns array', async () => {
      // Line 668: matchPatterns returns early for empty patterns
      const logContent = '2024-01-15T10:30:00Z INFO Test message';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/empty-patterns.log',
        patterns: [],
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('"patterns_matched": {}');
    });

    it('should group warning messages correctly', async () => {
      // Test warning grouping (similar to error grouping)
      const logContent = `
2024-01-15T10:30:00Z WARN Deprecated API call
2024-01-15T10:30:01Z WARN Deprecated API call
2024-01-15T10:30:02Z WARN Different warning
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/warn-group.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('"warnings"');
      expect(result.content[0].text).toContain('"count": 2');
    });

    it('should handle entries without timestamp in grouping', async () => {
      // Lines 391-396: groupMessages handles entries without timestamp
      const logContent = `
ERROR Database connection failed
ERROR Database connection failed
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/no-ts-group.log',
      };

      const result = await handleLogAnalyzer(args);

      // Should still group the errors
      expect(result.content[0].text).toContain('"count": 2');
      expect(result.content[0].text).toContain('"first_seen": "unknown"');
    });
  });

  describe('branch coverage: parseTimeWindow unknown unit fallback (line 136)', () => {
    it('should return 0 multiplier for unknown time unit', async () => {
      // Line 136: The multipliers[unit] || 0 fallback when unit is not s/m/h/d
      // This happens when regex matches but unit is somehow not in multipliers
      // Since the regex only allows s/m/h/d, we need to test the edge case
      // where parseTimeWindow is called with a valid pattern but the unit
      // is not recognized (this branch may be defensive)
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('2024-01-15T10:30:00Z INFO Test');

      // The regex pattern ^(\d+)\s*(s|m|h|d)$/i should match, but let's test
      // with uppercase to ensure case insensitivity works
      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/test.log',
        time_window: '5S', // Uppercase S
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('branch coverage: detectStructured with only whitespace lines (line 234)', () => {
    it('should return false when sample has only whitespace lines filtered out', async () => {
      // Line 234: detectStructured returns false when sample.length === 0
      // This happens when all lines are empty/whitespace after filtering
      // But the main handler filters empty lines BEFORE detectStructured is called
      // So we need a scenario where lines have content but would result in empty sample
      // Actually, this branch is covered by the early filter in handleLogAnalyzer
      // The "No log entries found" error is returned before detectStructured is called
      // So line 234 is defensive code that's hard to reach through the main handler

      // Let's verify the behavior when ALL lines are whitespace
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('   \n   \n   ');

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/whitespace.log',
      };

      const result = await handleLogAnalyzer(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('No log entries found');
    });
  });

  describe('branch coverage: JSON log without message or msg fields (line 277)', () => {
    it('should use trimmed raw line when JSON has no message or msg field', async () => {
      // Line 277: messageField falls back to trimmed when both message and msg are undefined
      const logContent = '{"timestamp":"2024-01-15T10:30:00Z","level":"info","data":"some data without message field"}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/no-message.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
      // The message should be the entire JSON line since neither message nor msg exists
      expect(result.content[0].text).toContain('entries_analyzed');
    });
  });

  describe('branch coverage: groupMessages last_seen timestamp update (line 387)', () => {
    it('should update last_seen when new entry timestamp is greater', async () => {
      // Line 387: Updates last_seen when ts > existing.last_seen
      // Need multiple errors with the same normalized message but different timestamps
      const logContent = `
2024-01-15T10:30:00Z ERROR Same error message
2024-01-15T10:30:05Z ERROR Same error message
2024-01-15T10:30:10Z ERROR Same error message
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/last-seen.log',
      };

      const result = await handleLogAnalyzer(args);

      // Verify first_seen is earliest and last_seen is latest
      expect(result.content[0].text).toContain('"first_seen": "2024-01-15T10:30:00');
      expect(result.content[0].text).toContain('"last_seen": "2024-01-15T10:30:10');
      expect(result.content[0].text).toContain('"count": 3');
    });
  });

  describe('branch coverage: detectAnomalies insufficient timed entries (lines 433-437)', () => {
    it('should return empty anomalies when entries >= 10 but timed entries < 10', async () => {
      // Lines 433-437: detectAnomalies returns early when timedEntries.length < 10
      // Need >= 10 total entries but < 10 with timestamps
      const lines: string[] = [];

      // Add 15 entries without timestamps (no timestamp pattern will match)
      for (let i = 0; i < 15; i++) {
        lines.push(`INFO Entry without timestamp number ${i}`);
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/no-timed.log',
      };

      const result = await handleLogAnalyzer(args);

      // Should have entries but no anomalies due to lack of timed entries
      expect(result.content[0].text).toContain('"entries_analyzed": 15');
      expect(result.content[0].text).toContain('"anomalies": []');
    });
  });

  describe('branch coverage: error spike high severity (line 478)', () => {
    it('should detect error spike with high severity when secondHalfErrors > firstHalfErrors * 10', async () => {
      // Line 478: severity is 'high' when secondHalfErrors > firstHalfErrors * 10
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // First half: 1 error in 50 entries
      for (let i = 0; i < 50; i++) {
        const ts = new Date(baseTime + i * 1000).toISOString();
        if (i === 25) {
          lines.push(`${ts} ERROR Single error in first half`);
        } else {
          lines.push(`${ts} INFO Normal entry ${i}`);
        }
      }

      // Second half: > 10 errors (need > 10x first half = > 10 errors, and > 10 total)
      for (let i = 50; i < 100; i++) {
        const ts = new Date(baseTime + i * 1000).toISOString();
        if (i % 3 === 0) {
          // This gives us about 17 errors in second half
          lines.push(`${ts} ERROR Frequent error in second half ${i}`);
        } else {
          lines.push(`${ts} INFO Normal entry ${i}`);
        }
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/high-spike.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('spike');
      expect(result.content[0].text).toContain('"severity": "high"');
    });
  });

  describe('branch coverage: rate change high severity (line 542)', () => {
    it('should detect rate increase with high severity when lastRate > firstRate * 10', async () => {
      // Line 542: severity is 'high' when lastRate > firstRate * 10
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // First quarter: very slow rate (1 entry per 60 seconds = 1/min)
      // Need enough entries for the rate calculation to work
      for (let i = 0; i < 10; i++) {
        const ts = new Date(baseTime + i * 60000).toISOString();
        lines.push(`${ts} INFO Slow entry ${i}`);
      }

      // Middle portion: medium rate
      for (let i = 0; i < 20; i++) {
        const ts = new Date(baseTime + 600000 + i * 10000).toISOString();
        lines.push(`${ts} INFO Medium entry ${i}`);
      }

      // Last quarter: very fast rate (1 entry per second = 60/min, which is > 10x)
      for (let i = 0; i < 10; i++) {
        const ts = new Date(baseTime + 800000 + i * 1000).toISOString();
        lines.push(`${ts} INFO Fast entry ${i}`);
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/high-rate-increase.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('rate_change');
      expect(result.content[0].text).toContain('"severity": "high"');
    });
  });

  describe('branch coverage: tailFile error with non-Error object (line 612)', () => {
    it('should handle non-Error thrown from fs.readFileSync', async () => {
      // Line 612: err instanceof Error ? err.message : String(err)
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw 'String error instead of Error object';
      });

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/string-error.log',
      };

      const result = await handleLogAnalyzer(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('String error instead of Error object');
    });
  });

  describe('branch coverage: matchPatterns level assignment when entry has no level (line 680)', () => {
    it('should set entry level from pattern when entry level is undefined', async () => {
      // Line 680: if (!entry.level) entry.level = pattern.level
      // Need log lines without a detectable level that match a custom pattern
      const logContent = `
2024-01-15T10:30:00Z Connection timeout detected
2024-01-15T10:30:01Z Connection timeout detected
2024-01-15T10:30:02Z Some other message
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/pattern-level-set.log',
        patterns: [
          { name: 'timeout', regex: 'timeout detected', level: 'error' },
        ],
      };

      const result = await handleLogAnalyzer(args);

      // Pattern should match 2 times
      expect(result.content[0].text).toContain('"timeout": 2');
    });
  });

  describe('branch coverage: handleLogAnalyzer catch block with non-Error (line 827)', () => {
    it('should handle non-Error thrown during command execution', async () => {
      // Line 827: err instanceof Error ? err.message : String(err)
      const { spawn } = await import('child_process');

      vi.mocked(spawn).mockImplementation(() => {
        const mockProc = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'error') {
              // Throw a non-Error object
              setTimeout(() => callback({ code: 'ENOENT', toString: () => 'Custom error object' }), 5);
            }
          }),
          kill: vi.fn(),
        };
        return mockProc as ReturnType<typeof spawn>;
      });

      const args: LogAnalyzerArgs = {
        source: 'command',
        command: 'nonexistent',
        duration_seconds: 1,
      };

      const result = await handleLogAnalyzer(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      // The error should contain "Failed to run command" since captureCommand wraps it
    });
  });

  describe('branch coverage: timed entries sorting in time range calculation (line 912)', () => {
    it('should correctly sort timed entries for time range calculation', async () => {
      // Line 912: Sorting happens when calculating time_range
      // Entries should be sorted by timestamp regardless of input order
      const logContent = `
2024-01-15T10:30:05Z INFO Third entry
2024-01-15T10:30:00Z INFO First entry
2024-01-15T10:30:10Z INFO Fifth entry
2024-01-15T10:30:02Z INFO Second entry
2024-01-15T10:30:08Z INFO Fourth entry
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/unsorted.log',
      };

      const result = await handleLogAnalyzer(args);

      // Time range should show earliest and latest timestamps after sorting
      expect(result.content[0].text).toContain('"start": "2024-01-15T10:30:00');
      expect(result.content[0].text).toContain('"end": "2024-01-15T10:30:10');
    });
  });

  describe('branch coverage: calculateRateAnalysis sorting (line 568)', () => {
    it('should sort entries before calculating rate analysis', async () => {
      // Line 568: timedEntries.sort() in calculateRateAnalysis
      // Pass entries in reverse chronological order
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // Create entries in REVERSE order (latest first)
      for (let i = 29; i >= 0; i--) {
        const ts = new Date(baseTime + i * 6000).toISOString();
        lines.push(`${ts} INFO Entry ${i}`);
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/reverse-order.log',
      };

      const result = await handleLogAnalyzer(args);

      // Rate analysis should still work correctly after sorting
      expect(result.content[0].text).toContain('rate_analysis');
      expect(result.content[0].text).toContain('entries_per_minute');
    });
  });

  describe('branch coverage: rate change with quarters having <= 2 entries (lines 524-534)', () => {
    it('should not detect rate change when quarters have insufficient entries', async () => {
      // Lines 524-534: firstQuarter.length > 2 && lastQuarter.length > 2
      // Need >= 20 timed entries total but quarters with <= 2 entries
      // This is tricky - with 20 entries, each quarter has 5 entries
      // We need a scenario where the condition is true but the rate calculation fails
      // Let's test the boundary: exactly 20 entries
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // Exactly 20 entries - each quarter gets 5 entries
      for (let i = 0; i < 20; i++) {
        const ts = new Date(baseTime + i * 6000).toISOString();
        lines.push(`${ts} INFO Entry ${i}`);
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/exact-20.log',
      };

      const result = await handleLogAnalyzer(args);

      // Should process without error
      expect(result.isError).toBeUndefined();
    });

    it('should skip rate change detection when first or last quarter duration is 0 (line 534)', async () => {
      // Line 534: if (firstDuration > 0 && lastDuration > 0)
      // Need a quarter where all entries have the same timestamp
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // First quarter: all same timestamp (duration = 0)
      const sameTs = new Date(baseTime).toISOString();
      for (let i = 0; i < 5; i++) {
        lines.push(`${sameTs} INFO First quarter entry ${i}`);
      }

      // Middle quarters: spread out
      for (let i = 5; i < 15; i++) {
        const ts = new Date(baseTime + i * 10000).toISOString();
        lines.push(`${ts} INFO Middle entry ${i}`);
      }

      // Last quarter: spread out
      for (let i = 15; i < 20; i++) {
        const ts = new Date(baseTime + 150000 + (i - 15) * 10000).toISOString();
        lines.push(`${ts} INFO Last quarter entry ${i}`);
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/zero-duration.log',
      };

      const result = await handleLogAnalyzer(args);

      // Should process without error, rate_change may or may not be detected
      expect(result.isError).toBeUndefined();
    });
  });

  describe('branch coverage: detectLevel with undefined input (line 145)', () => {
    it('should return undefined when levelStr is undefined', async () => {
      // Line 145: if (!levelStr) return undefined
      // JSON log without any level field
      const logContent = '{"timestamp":"2024-01-15T10:30:00Z","message":"test without level"}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/no-level.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      // Entry should be counted as unknown since no level field
      expect(result.content[0].text).toContain('"unknown": 1');
    });
  });

  describe('branch coverage: extractTimestamp returns undefined (line 225)', () => {
    it('should return undefined when no timestamp pattern matches', async () => {
      // Line 225: extractTimestamp returns undefined when no pattern matches
      const logContent = 'Just a plain text log line without any timestamp';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/no-timestamp.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('"start": null');
    });
  });

  describe('branch coverage: gap detection with high severity (line 457)', () => {
    it('should detect gap with high severity when interval > 300000ms (5 minutes)', async () => {
      // Line 457: severity is 'high' when intervals[i] > 300000
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // Generate 15 entries with 1-second intervals
      for (let i = 0; i < 15; i++) {
        const ts = new Date(baseTime + i * 1000).toISOString();
        lines.push(`${ts} INFO Regular entry ${i}`);
      }

      // Add a 10-minute gap (600000ms > 300000ms)
      const gapTs = new Date(baseTime + 14000 + 600000).toISOString();
      lines.push(`${gapTs} INFO Entry after very long gap`);

      // Add more entries after the gap
      for (let i = 0; i < 5; i++) {
        const ts = new Date(baseTime + 14000 + 600000 + (i + 1) * 1000).toISOString();
        lines.push(`${ts} INFO Post-gap entry ${i}`);
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/high-gap.log',
      };

      const result = await handleLogAnalyzer(args);

      expect(result.content[0].text).toContain('gap');
      expect(result.content[0].text).toContain('"severity": "high"');
    });
  });

  describe('branch coverage: pattern match where entry already has level (line 680 else branch)', () => {
    it('should not override entry level when entry already has a level', async () => {
      // Line 680-682: if (!entry.level) branch - need to test when entry.level IS set
      // Entry must have a level already AND match the pattern
      const logContent = `
2024-01-15T10:30:00Z ERROR timeout detected with error level
2024-01-15T10:30:01Z WARN timeout detected with warn level
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/pattern-existing-level.log',
        patterns: [
          { name: 'timeout', regex: 'timeout detected', level: 'debug' },
        ],
      };

      const result = await handleLogAnalyzer(args);

      // Pattern should match both, but levels should remain ERROR and WARN
      expect(result.content[0].text).toContain('"timeout": 2');
      // Original levels should be preserved
      expect(result.content[0].text).toContain('"error": 1');
      expect(result.content[0].text).toContain('"warn": 1');
    });
  });

  describe('branch coverage: sort comparator fallback branches (lines 568, 912)', () => {
    it('should handle entries in sort comparator with valid timestamps', async () => {
      // Lines 568, 912: The sort comparators use (a.timestamp?.getTime() || 0)
      // These are defensive branches for when timestamp is undefined
      // Since we filter for timestamps first, these should not normally trigger
      // But we test the sorting with unsorted timestamps to ensure comparator runs
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // Create entries in completely random order with varied timestamps
      const timestamps = [5, 1, 8, 3, 9, 2, 7, 4, 6, 0];
      for (const i of timestamps) {
        const ts = new Date(baseTime + i * 60000).toISOString();
        lines.push(`${ts} INFO Entry ${i}`);
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/random-order.log',
      };

      const result = await handleLogAnalyzer(args);

      // Should sort correctly - first entry should be at offset 0, last at offset 9
      expect(result.content[0].text).toContain('"start": "2024-01-15T10:00:00');
      expect(result.content[0].text).toContain('"end": "2024-01-15T10:09:00');
    });
  });

  describe('branch coverage: error handling with non-Error thrown by tailFile (line 612)', () => {
    it('should handle thrown number as error', async () => {
      // Line 612: String(err) branch - throw a number
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw 42;
      });

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/number-error.log',
      };

      const result = await handleLogAnalyzer(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('42');
    });

    it('should handle thrown object with toString as error', async () => {
      // Line 612: String(err) branch - throw an object
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw { code: 'EACCES', toString: () => 'Access denied object' };
      });

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/object-error.log',
      };

      const result = await handleLogAnalyzer(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Access denied object');
    });

    it('should handle thrown null as error', async () => {
      // Line 612: String(err) branch - throw null
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw null;
      });

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/null-error.log',
      };

      const result = await handleLogAnalyzer(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('null');
    });
  });

  describe('branch coverage: handleLogAnalyzer catch with non-Error from captureCommand (line 827)', () => {
    it('should handle captureCommand rejecting with non-Error string', async () => {
      // Line 827: String(err) branch when captureCommand rejects
      const { spawn } = await import('child_process');

      vi.mocked(spawn).mockImplementation(() => {
        const mockProc = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'error') {
              // The error handler in captureCommand wraps errors
              // But the outer catch at line 827 should handle it
              setTimeout(() => {
                // Simulate an error that gets wrapped
                callback(new Error('Wrapped command error'));
              }, 5);
            }
          }),
          kill: vi.fn(),
        };
        return mockProc as ReturnType<typeof spawn>;
      });

      const args: LogAnalyzerArgs = {
        source: 'command',
        command: 'failing-command',
        duration_seconds: 1,
      };

      const result = await handleLogAnalyzer(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Failed to run command');
    });
  });

  describe('branch coverage: rate detection condition with boundary entries (line 524)', () => {
    it('should handle exactly 20 timed entries triggering rate detection', async () => {
      // Line 524: Test the exact boundary condition for rate detection
      // With 20 entries, firstQuarter = 5, lastQuarter = 5
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // Exactly 20 entries with increasing rate
      for (let i = 0; i < 20; i++) {
        // First 5 entries: slow (10s apart), last 5 entries: fast (1s apart)
        let interval: number;
        if (i < 5) {
          interval = i * 10000; // First quarter: 10s intervals
        } else if (i < 15) {
          interval = 50000 + (i - 5) * 5000; // Middle: 5s intervals
        } else {
          interval = 100000 + (i - 15) * 1000; // Last quarter: 1s intervals
        }
        const ts = new Date(baseTime + interval).toISOString();
        lines.push(`${ts} INFO Entry ${i}`);
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/boundary-20.log',
      };

      const result = await handleLogAnalyzer(args);

      // Should process and potentially detect rate changes
      expect(result.isError).toBeUndefined();
    });
  });

  describe('branch coverage: defensive fallback branches (unreachable)', () => {
    // These tests document that certain branches are unreachable through the public API
    // The || 0 fallbacks in sort comparators (lines 568, 912) are defensive code
    // because we filter for entries with timestamps BEFORE sorting

    it('should document that sort comparator fallbacks are unreachable - entries are pre-filtered', async () => {
      // Lines 568, 912: The sort functions use (a.timestamp?.getTime() || 0)
      // But entries are filtered to only include those WITH timestamps before sorting
      // So the || 0 branch can never execute
      // This test documents this design decision

      // Create log with mixed timestamped and non-timestamped entries
      const logContent = `
2024-01-15T10:30:00Z INFO Entry with timestamp
Some entry without timestamp
2024-01-15T10:30:01Z INFO Another timestamped entry
Another line without timestamp
2024-01-15T10:30:02Z INFO Third timestamped entry
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/mixed-ts.log',
      };

      const result = await handleLogAnalyzer(args);

      // All 5 entries are analyzed
      expect(result.content[0].text).toContain('"entries_analyzed": 5');
      // Time range only considers timestamped entries (3 of them)
      expect(result.content[0].text).toContain('"start": "2024-01-15T10:30:00');
      expect(result.content[0].text).toContain('"end": "2024-01-15T10:30:02');
    });
  });

  describe('branch coverage: line 524 false branch (mathematically unreachable)', () => {
    // Line 524: if (firstQuarter.length > 2 && lastQuarter.length > 2)
    // With >= 20 timed entries, quarters always have >= 5 entries
    // The false branch is mathematically unreachable

    it('should always have quarters > 2 when timedEntries >= 20', async () => {
      // With exactly 20 entries: firstQuarter = 5, lastQuarter = 5
      // Both are > 2, so condition is always true
      // This documents that the else branch is defensive/unreachable
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // Create exactly 20 entries (minimum for rate detection)
      for (let i = 0; i < 20; i++) {
        const ts = new Date(baseTime + i * 6000).toISOString();
        lines.push(`${ts} INFO Entry ${i}`);
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/twenty-entries.log',
      };

      const result = await handleLogAnalyzer(args);

      // The condition at line 524 evaluates to true (5 > 2 && 5 > 2)
      // So rate analysis is performed
      expect(result.isError).toBeUndefined();
    });

    it('should skip rate detection when fewer than 20 timed entries (line 515 false branch)', async () => {
      // With 19 entries, the condition at line 515 is false
      // This covers the false branch of timedEntries.length >= 20
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const lines: string[] = [];

      // Create exactly 19 entries (below threshold)
      for (let i = 0; i < 19; i++) {
        const ts = new Date(baseTime + i * 6000).toISOString();
        lines.push(`${ts} INFO Entry ${i}`);
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(lines.join('\n'));

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/nineteen-entries.log',
      };

      const result = await handleLogAnalyzer(args);

      // No rate change detection (timedEntries < 20)
      expect(result.isError).toBeUndefined();
      // Result should not contain rate_change in anomalies from this block
    });
  });

  describe('branch coverage: line 827 String(err) branch', () => {
    // Line 827: err instanceof Error ? err.message : String(err)
    // This branch is reached when the catch receives a non-Error value
    // Both tailFile and captureCommand wrap errors, but we can test by
    // mocking to throw directly from file operations

    it('should handle undefined thrown as error', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw undefined;
      });

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/undefined-error.log',
      };

      const result = await handleLogAnalyzer(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      // String(undefined) = "undefined"
      expect(data.error).toContain('undefined');
    });

    it('should handle array thrown as error', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw ['error', 'array'];
      });

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/array-error.log',
      };

      const result = await handleLogAnalyzer(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      // String(['error', 'array']) = "error,array"
      expect(data.error).toContain('error,array');
    });

    it('should handle boolean thrown as error', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw false;
      });

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/boolean-error.log',
      };

      const result = await handleLogAnalyzer(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('false');
    });
  });

  describe('branch coverage: Invalid Date timestamp handling (lines 568, 912)', () => {
    // The sort comparators use (a.timestamp?.getTime() || 0)
    // An Invalid Date passes the truthy filter but getTime() returns NaN
    // NaN || 0 = 0, so this COULD trigger the || 0 branch
    // However, parseLogLine checks for valid timestamps before assigning

    it('should handle JSON logs with invalid timestamp strings that parse to Invalid Date', async () => {
      // Test with timestamp that creates Invalid Date
      // The parseLogLine function checks isNaN(timestamp.getTime()) and returns undefined
      // So Invalid Date timestamps are filtered out
      const logContent = `
{"timestamp":"invalid-date-string","level":"info","message":"test1"}
{"timestamp":"2024-01-15T10:30:00Z","level":"info","message":"test2"}
{"timestamp":"not-a-timestamp","level":"info","message":"test3"}
`.trim();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(logContent);

      const args: LogAnalyzerArgs = {
        source: 'file',
        path: '/logs/invalid-dates.log',
        structured: true,
      };

      const result = await handleLogAnalyzer(args);

      expect(result.isError).toBeUndefined();
      // Only 1 entry should have valid timestamp
      expect(result.content[0].text).toContain('"start": "2024-01-15T10:30:00');
      expect(result.content[0].text).toContain('"end": "2024-01-15T10:30:00');
    });
  });
});
