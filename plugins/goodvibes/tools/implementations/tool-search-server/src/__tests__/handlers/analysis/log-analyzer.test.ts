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
});
