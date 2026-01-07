/**
 * Tests for shared/logging.ts
 * Target: 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { debug, logError } from '../../shared/logging.js';

describe('logging', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let dateNowSpy: ReturnType<typeof vi.spyOn>;
  const mockTimestamp = '2025-01-05T12:00:00.000Z';

  beforeEach(() => {
    // Mock console.error to capture output
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock Date to return consistent timestamps
    dateNowSpy = vi
      .spyOn(Date.prototype, 'toISOString')
      .mockReturnValue(mockTimestamp);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    dateNowSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('debug', () => {
    it('should log a simple message without data', () => {
      debug('Hook started');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] Hook started`
      );
    });

    it('should log a message with data object', () => {
      const data = { tool: 'Bash', command: 'npm test' };
      debug('Processing tool', data);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] Processing tool:`,
        JSON.stringify(data, null, 2)
      );
    });

    it('should log a message with string data', () => {
      debug('User input', 'test command');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] User input:`,
        JSON.stringify('test command', null, 2)
      );
    });

    it('should log a message with number data', () => {
      debug('Retry count', 3);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] Retry count:`,
        JSON.stringify(3, null, 2)
      );
    });

    it('should log a message with boolean data', () => {
      debug('Success', true);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] Success:`,
        JSON.stringify(true, null, 2)
      );
    });

    it('should log a message with null data', () => {
      debug('Result', null);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] Result:`,
        JSON.stringify(null, null, 2)
      );
    });

    it('should log a message with array data', () => {
      const data = ['item1', 'item2', 'item3'];
      debug('Items', data);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] Items:`,
        JSON.stringify(data, null, 2)
      );
    });

    it('should log a message with nested object data', () => {
      const data = {
        outer: {
          inner: {
            value: 'nested',
          },
        },
      };
      debug('Nested data', data);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] Nested data:`,
        JSON.stringify(data, null, 2)
      );
    });

    it('should handle undefined data by not including it', () => {
      debug('Message only', undefined);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] Message only`
      );
    });

    it('should log a message with zero as data', () => {
      debug('Count', 0);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] Count:`,
        JSON.stringify(0, null, 2)
      );
    });

    it('should log a message with empty string as data', () => {
      debug('Empty', '');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] Empty:`,
        JSON.stringify('', null, 2)
      );
    });

    it('should log a message with false as data', () => {
      debug('Flag', false);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] Flag:`,
        JSON.stringify(false, null, 2)
      );
    });

    it('should use actual timestamp when not mocked', () => {
      dateNowSpy.mockRestore();

      const beforeTime = new Date().toISOString();
      debug('Real timestamp test');
      const afterTime = new Date().toISOString();

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const calledWith = consoleErrorSpy.mock.calls[0][0] as string;

      expect(calledWith).toMatch(
        /^\[GoodVibes \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] Real timestamp test$/
      );

      // Extract timestamp from the logged message
      const match = calledWith.match(/\[GoodVibes (.*?)\]/);
      expect(match).toBeTruthy();
      const loggedTimestamp = match![1];

      // Verify it's between before and after times
      expect(loggedTimestamp >= beforeTime).toBe(true);
      expect(loggedTimestamp <= afterTime).toBe(true);
    });
  });

  describe('logError', () => {
    it('should log an Error instance with message and stack', () => {
      const error = new Error('Something went wrong');
      error.stack = 'Error: Something went wrong\n    at test.ts:42:5';

      logError('riskyOperation', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        `[GoodVibes ${mockTimestamp}] ERROR in riskyOperation: Something went wrong`
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        'Error: Something went wrong\n    at test.ts:42:5'
      );
    });

    it('should log an Error instance without stack', () => {
      const error = new Error('No stack trace');
      // Explicitly remove stack
      delete error.stack;

      logError('testContext', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] ERROR in testContext: No stack trace`
      );
    });

    it('should log a string error', () => {
      logError('stringError', 'Simple error message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] ERROR in stringError: Simple error message`
      );
    });

    it('should log a number error', () => {
      logError('numberError', 404);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] ERROR in numberError: 404`
      );
    });

    it('should log a boolean error', () => {
      logError('booleanError', false);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] ERROR in booleanError: false`
      );
    });

    it('should log a null error', () => {
      logError('nullError', null);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] ERROR in nullError: null`
      );
    });

    it('should log an undefined error', () => {
      logError('undefinedError', undefined);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] ERROR in undefinedError: undefined`
      );
    });

    it('should log an object error', () => {
      const error = { code: 'ERR_CUSTOM', message: 'Custom error' };
      logError('objectError', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] ERROR in objectError: [object Object]`
      );
    });

    it('should log an array error', () => {
      const error = ['error1', 'error2'];
      logError('arrayError', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[GoodVibes ${mockTimestamp}] ERROR in arrayError: error1,error2`
      );
    });

    it('should handle Error with empty message', () => {
      const error = new Error('');
      error.stack = 'Error\n    at test.ts:1:1';

      logError('emptyMessage', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        `[GoodVibes ${mockTimestamp}] ERROR in emptyMessage: `
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        'Error\n    at test.ts:1:1'
      );
    });

    it('should handle Error with very long stack trace', () => {
      const error = new Error('Deep error');
      const longStack = Array(100)
        .fill('    at function (file.ts:1:1)')
        .join('\n');
      error.stack = `Error: Deep error\n${longStack}`;

      logError('deepStack', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        `[GoodVibes ${mockTimestamp}] ERROR in deepStack: Deep error`
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(2, error.stack);
    });

    it('should handle special characters in context', () => {
      const error = new Error('Test error');
      // Remove stack to ensure only one console.error call
      delete error.stack;
      logError('context:with:colons', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain(
        'ERROR in context:with:colons:'
      );
    });

    it('should handle special characters in error message', () => {
      const error = new Error('Error with "quotes" and \'apostrophes\'');
      // Remove stack to ensure only one console.error call
      delete error.stack;
      logError('specialChars', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain(
        'Error with "quotes" and \'apostrophes\''
      );
    });

    it('should use actual timestamp when not mocked', () => {
      dateNowSpy.mockRestore();

      const beforeTime = new Date().toISOString();
      logError('realTime', new Error('Test'));
      const afterTime = new Date().toISOString();

      expect(consoleErrorSpy).toHaveBeenCalled();
      const calledWith = consoleErrorSpy.mock.calls[0][0] as string;

      expect(calledWith).toMatch(
        /^\[GoodVibes \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] ERROR in realTime:/
      );

      // Extract timestamp from the logged message
      const match = calledWith.match(/\[GoodVibes (.*?)\]/);
      expect(match).toBeTruthy();
      const loggedTimestamp = match![1];

      // Verify it's between before and after times
      expect(loggedTimestamp >= beforeTime).toBe(true);
      expect(loggedTimestamp <= afterTime).toBe(true);
    });

    it('should handle TypeError instance', () => {
      const error = new TypeError('Type mismatch');
      error.stack = 'TypeError: Type mismatch\n    at test.ts:1:1';

      logError('typeError', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        `[GoodVibes ${mockTimestamp}] ERROR in typeError: Type mismatch`
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(2, error.stack);
    });

    it('should handle RangeError instance', () => {
      const error = new RangeError('Out of range');
      error.stack = 'RangeError: Out of range\n    at test.ts:1:1';

      logError('rangeError', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        `[GoodVibes ${mockTimestamp}] ERROR in rangeError: Out of range`
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(2, error.stack);
    });

    it('should handle custom Error subclass', () => {
      class CustomError extends Error {
        code: string;
        constructor(message: string, code: string) {
          super(message);
          this.code = code;
          this.name = 'CustomError';
        }
      }

      const error = new CustomError('Custom error occurred', 'ERR_CUSTOM');
      error.stack = 'CustomError: Custom error occurred\n    at test.ts:1:1';

      logError('customError', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        `[GoodVibes ${mockTimestamp}] ERROR in customError: Custom error occurred`
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(2, error.stack);
    });
  });
});
