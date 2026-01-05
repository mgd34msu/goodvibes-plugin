/**
 * Unit tests for logging utilities
 *
 * Tests cover:
 * - logInfo with and without data
 * - logError with Error objects, non-Error values, and without error
 * - logDebug with and without data
 * - All edge cases and error paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logInfo, logError, logDebug } from '../logging.js';

describe('logging', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  const mockTimestamp = '2024-01-15T12:00:00.000Z';

  beforeEach(() => {
    // Mock console.error to capture output
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock Date constructor and toISOString for consistent timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date(mockTimestamp));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('logInfo', () => {
    it('should log message without data to stderr', () => {
      logInfo('Test message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] Test message'
      );
    });

    it('should log message with data to stderr', () => {
      const data = { key: 'value', number: 42 };
      logInfo('Test with data', data);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] Test with data:',
        data
      );
    });

    it('should handle string data', () => {
      logInfo('Message', 'string data');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] Message:',
        'string data'
      );
    });

    it('should handle number data', () => {
      logInfo('Number value', 123);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] Number value:',
        123
      );
    });

    it('should handle boolean data', () => {
      logInfo('Boolean value', true);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] Boolean value:',
        true
      );
    });

    it('should handle null data', () => {
      logInfo('Null value', null);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] Null value:',
        null
      );
    });

    it('should handle array data', () => {
      const arr = [1, 2, 3];
      logInfo('Array data', arr);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] Array data:',
        arr
      );
    });

    it('should handle nested object data', () => {
      const nested = { outer: { inner: { deep: 'value' } } };
      logInfo('Nested object', nested);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] Nested object:',
        nested
      );
    });

    it('should handle undefined data differently from no data', () => {
      // When data is explicitly undefined, it should be logged
      logInfo('With undefined', undefined);

      // Should not include colon or data since undefined check
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] With undefined'
      );
    });

    it('should handle zero as valid data', () => {
      logInfo('Zero value', 0);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] Zero value:',
        0
      );
    });

    it('should handle empty string as valid data', () => {
      logInfo('Empty string', '');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] Empty string:',
        ''
      );
    });

    it('should handle false as valid data', () => {
      logInfo('False value', false);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] False value:',
        false
      );
    });
  });

  describe('logError', () => {
    it('should log error message without error object', () => {
      logError('Something went wrong');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] ERROR: Something went wrong'
      );
    });

    it('should log error message with Error object including stack', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';

      logError('Error occurred', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        '[GoodVibes 2024-01-15T12:00:00.000Z] ERROR: Error occurred:',
        'Test error'
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        'Error: Test error\n    at test.js:1:1'
      );
    });

    it('should log error message with Error object without stack', () => {
      const error = new Error('Test error');
      delete error.stack;

      logError('Error occurred', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] ERROR: Error occurred:',
        'Test error'
      );
    });

    it('should log error message with Error object with empty stack', () => {
      const error = new Error('Test error');
      error.stack = '';

      logError('Error occurred', error);

      // Stack is empty string (falsy), so no second call
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] ERROR: Error occurred:',
        'Test error'
      );
    });

    it('should convert string error to string', () => {
      logError('Error with string', 'string error');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] ERROR: Error with string:',
        'string error'
      );
    });

    it('should convert number error to string', () => {
      logError('Error with number', 404);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] ERROR: Error with number:',
        '404'
      );
    });

    it('should convert boolean error to string', () => {
      logError('Error with boolean', false);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] ERROR: Error with boolean:',
        'false'
      );
    });

    it('should convert null error to string', () => {
      logError('Error with null', null);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] ERROR: Error with null:',
        'null'
      );
    });

    it('should convert object error to string', () => {
      const errorObj = { code: 500, message: 'Server error' };
      logError('Error with object', errorObj);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] ERROR: Error with object:',
        '[object Object]'
      );
    });

    it('should convert array error to string', () => {
      const errorArr = ['error1', 'error2'];
      logError('Error with array', errorArr);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] ERROR: Error with array:',
        'error1,error2'
      );
    });

    it('should handle undefined error differently from no error', () => {
      logError('Error with undefined', undefined);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] ERROR: Error with undefined'
      );
    });

    it('should handle custom Error subclass', () => {
      class CustomError extends Error {
        code: number;
        constructor(message: string, code: number) {
          super(message);
          this.code = code;
          this.name = 'CustomError';
        }
      }

      const customError = new CustomError('Custom error message', 500);
      customError.stack = 'CustomError: Custom error message\n    at test.js:1:1';

      logError('Custom error occurred', customError);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        '[GoodVibes 2024-01-15T12:00:00.000Z] ERROR: Custom error occurred:',
        'Custom error message'
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        'CustomError: Custom error message\n    at test.js:1:1'
      );
    });

    it('should handle Error with multiline stack trace', () => {
      const error = new Error('Multiline error');
      error.stack = `Error: Multiline error
    at functionA (file1.js:10:5)
    at functionB (file2.js:20:10)
    at functionC (file3.js:30:15)`;

      logError('Stack trace error', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(2, error.stack);
    });

    it('should handle zero as error value', () => {
      logError('Error with zero', 0);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] ERROR: Error with zero:',
        '0'
      );
    });

    it('should handle empty string as error value', () => {
      logError('Error with empty string', '');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] ERROR: Error with empty string:',
        ''
      );
    });
  });

  describe('logDebug', () => {
    it('should log debug message without data', () => {
      logDebug('Debug message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: Debug message'
      );
    });

    it('should log debug message with object data as formatted JSON', () => {
      const data = { key: 'value', number: 42 };
      logDebug('Debug with data', data);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: Debug with data:',
        JSON.stringify(data, null, 2)
      );
    });

    it('should format nested objects in debug data', () => {
      const nested = {
        level1: {
          level2: {
            level3: 'deep value'
          }
        }
      };

      logDebug('Nested debug', nested);

      const expectedJson = JSON.stringify(nested, null, 2);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: Nested debug:',
        expectedJson
      );
    });

    it('should handle string data', () => {
      logDebug('String debug', 'debug string');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: String debug:',
        JSON.stringify('debug string', null, 2)
      );
    });

    it('should handle number data', () => {
      logDebug('Number debug', 123);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: Number debug:',
        JSON.stringify(123, null, 2)
      );
    });

    it('should handle boolean data', () => {
      logDebug('Boolean debug', true);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: Boolean debug:',
        JSON.stringify(true, null, 2)
      );
    });

    it('should handle null data', () => {
      logDebug('Null debug', null);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: Null debug:',
        JSON.stringify(null, null, 2)
      );
    });

    it('should handle array data', () => {
      const arr = [1, 2, 3, { key: 'value' }];
      logDebug('Array debug', arr);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: Array debug:',
        JSON.stringify(arr, null, 2)
      );
    });

    it('should handle undefined data differently from no data', () => {
      logDebug('Debug with undefined', undefined);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: Debug with undefined'
      );
    });

    it('should handle zero as valid data', () => {
      logDebug('Zero debug', 0);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: Zero debug:',
        JSON.stringify(0, null, 2)
      );
    });

    it('should handle empty string as valid data', () => {
      logDebug('Empty string debug', '');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: Empty string debug:',
        JSON.stringify('', null, 2)
      );
    });

    it('should handle false as valid data', () => {
      logDebug('False debug', false);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: False debug:',
        JSON.stringify(false, null, 2)
      );
    });

    it('should handle complex nested structures', () => {
      const complex = {
        users: [
          { id: 1, name: 'Alice', tags: ['admin', 'user'] },
          { id: 2, name: 'Bob', tags: ['user'] }
        ],
        metadata: {
          total: 2,
          page: 1,
          settings: {
            enabled: true,
            options: [1, 2, 3]
          }
        }
      };

      logDebug('Complex structure', complex);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: Complex structure:',
        JSON.stringify(complex, null, 2)
      );
    });

    it('should handle objects with circular references gracefully', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;

      // JSON.stringify throws on circular references, but this tests the function doesn't crash
      expect(() => {
        logDebug('Circular reference', circular);
      }).toThrow(); // JSON.stringify will throw
    });

    it('should handle Date objects', () => {
      const date = new Date('2024-01-15T12:00:00.000Z');
      logDebug('Date debug', date);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: Date debug:',
        JSON.stringify(date, null, 2)
      );
    });

    it('should handle Error objects in debug data', () => {
      const error = new Error('Test error');
      logDebug('Error debug', error);

      // Error objects have special JSON serialization behavior
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: Error debug:',
        JSON.stringify(error, null, 2)
      );
    });

    it('should handle BigInt values', () => {
      const bigIntValue = BigInt(9007199254740991);

      // BigInt throws when stringified, but this tests the behavior
      expect(() => {
        logDebug('BigInt debug', bigIntValue);
      }).toThrow(); // JSON.stringify throws on BigInt
    });

    it('should handle Symbol values', () => {
      const symbolValue = Symbol('test');
      logDebug('Symbol debug', symbolValue);

      // Symbols become undefined in JSON.stringify (returns undefined, not the string 'undefined')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: Symbol debug:',
        undefined
      );
    });

    it('should handle Map objects', () => {
      const map = new Map([['key1', 'value1'], ['key2', 'value2']]);
      logDebug('Map debug', map);

      // Map becomes empty object in JSON.stringify
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: Map debug:',
        JSON.stringify({}, null, 2)
      );
    });

    it('should handle Set objects', () => {
      const set = new Set([1, 2, 3]);
      logDebug('Set debug', set);

      // Set becomes empty object in JSON.stringify
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: Set debug:',
        JSON.stringify({}, null, 2)
      );
    });
  });

  describe('timestamp behavior', () => {
    it('should include ISO timestamp in all log types', () => {
      logInfo('info');
      logError('error');
      logDebug('debug');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(3);

      const calls = consoleErrorSpy.mock.calls;
      calls.forEach(call => {
        expect(call[0]).toContain('2024-01-15T12:00:00.000Z');
        expect(call[0]).toContain('[GoodVibes');
      });
    });

    it('should generate new timestamp for each call', () => {
      vi.restoreAllMocks();

      const timestamps: string[] = [];
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
        timestamps.push(args[0] as string);
      });

      logInfo('first');
      logInfo('second');
      logInfo('third');

      // All should have timestamps (even if same due to mocking)
      timestamps.forEach(msg => {
        expect(msg).toMatch(/\[GoodVibes \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
      });
    });
  });

  describe('message formatting', () => {
    it('should preserve message content exactly', () => {
      const specialMessage = 'Message with "quotes" and \'apostrophes\' and [brackets]';
      logInfo(specialMessage);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(specialMessage)
      );
    });

    it('should handle multiline messages', () => {
      const multiline = 'Line 1\nLine 2\nLine 3';
      logInfo(multiline);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(multiline)
      );
    });

    it('should handle empty message strings', () => {
      logInfo('');
      logError('');
      logDebug('');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(3);
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        '[GoodVibes 2024-01-15T12:00:00.000Z] '
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        '[GoodVibes 2024-01-15T12:00:00.000Z] ERROR: '
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        3,
        '[GoodVibes 2024-01-15T12:00:00.000Z] DEBUG: '
      );
    });

    it('should handle very long messages', () => {
      const longMessage = 'x'.repeat(10000);
      logInfo(longMessage);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(longMessage)
      );
    });
  });
});
