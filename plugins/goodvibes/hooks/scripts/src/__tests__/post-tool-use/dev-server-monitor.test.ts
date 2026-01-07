import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  isDevServerCommand,
  registerDevServer,
  unregisterDevServer,
  recordDevServerError,
  parseDevServerErrors,
} from '../../post-tool-use/dev-server-monitor.js';
import { createDefaultState } from '../../types/state.js';

import type { HooksState } from '../../types/state.js';

describe('dev-server-monitor', () => {
  let state: HooksState;

  beforeEach(() => {
    state = createDefaultState();
    // Reset time mocking
    vi.useRealTimers();
  });

  describe('isDevServerCommand', () => {
    it('should recognize npm run dev', () => {
      expect(isDevServerCommand('npm run dev')).toBe(true);
    });

    it('should recognize npm start', () => {
      expect(isDevServerCommand('npm start')).toBe(true);
    });

    it('should recognize yarn dev', () => {
      expect(isDevServerCommand('yarn dev')).toBe(true);
    });

    it('should recognize pnpm dev', () => {
      expect(isDevServerCommand('pnpm dev')).toBe(true);
    });

    it('should recognize next dev', () => {
      expect(isDevServerCommand('next dev')).toBe(true);
    });

    it('should recognize vite command', () => {
      expect(isDevServerCommand('vite')).toBe(true);
      expect(isDevServerCommand('vite --port 3000')).toBe(true);
    });

    it('should recognize node server commands', () => {
      expect(isDevServerCommand('node server.js')).toBe(true);
      expect(isDevServerCommand('node app/server.js')).toBe(true);
      expect(isDevServerCommand('node ./dist/server.js')).toBe(true);
    });

    it('should not recognize non-dev commands', () => {
      expect(isDevServerCommand('npm install')).toBe(false);
      expect(isDevServerCommand('npm test')).toBe(false);
      expect(isDevServerCommand('npm run build')).toBe(false);
      expect(isDevServerCommand('git status')).toBe(false);
      expect(isDevServerCommand('ls -la')).toBe(false);
    });

    it('should handle empty string', () => {
      expect(isDevServerCommand('')).toBe(false);
    });

    it('should handle commands with extra flags and options', () => {
      expect(isDevServerCommand('npm run dev -- --port 4000')).toBe(true);
      expect(isDevServerCommand('npm run dev --watch')).toBe(true);
      expect(isDevServerCommand('vite --host 0.0.0.0 --port 5173')).toBe(true);
    });
  });

  describe('registerDevServer', () => {
    it('should register a new dev server', () => {
      const fixedDate = '2025-01-05T12:00:00.000Z';
      vi.useFakeTimers();
      vi.setSystemTime(new Date(fixedDate));

      registerDevServer(state, 'bash_12345', 'npm run dev', 3000);

      expect(state.devServers['bash_12345']).toEqual({
        command: 'npm run dev',
        port: 3000,
        startedAt: fixedDate,
        lastError: null,
      });

      vi.useRealTimers();
    });

    it('should register multiple dev servers with different PIDs', () => {
      registerDevServer(state, 'bash_1', 'npm run dev', 3000);
      registerDevServer(state, 'bash_2', 'vite', 5173);

      expect(Object.keys(state.devServers)).toHaveLength(2);
      expect(state.devServers['bash_1'].command).toBe('npm run dev');
      expect(state.devServers['bash_2'].command).toBe('vite');
    });

    it('should overwrite existing dev server with same PID', () => {
      const fixedDate1 = '2025-01-05T12:00:00.000Z';
      const fixedDate2 = '2025-01-05T13:00:00.000Z';

      vi.useFakeTimers();
      vi.setSystemTime(new Date(fixedDate1));
      registerDevServer(state, 'bash_12345', 'npm run dev', 3000);

      vi.setSystemTime(new Date(fixedDate2));
      registerDevServer(state, 'bash_12345', 'vite', 5173);

      expect(state.devServers['bash_12345']).toEqual({
        command: 'vite',
        port: 5173,
        startedAt: fixedDate2,
        lastError: null,
      });

      vi.useRealTimers();
    });

    it('should handle different port numbers', () => {
      registerDevServer(state, 'bash_1', 'npm run dev', 3000);
      registerDevServer(state, 'bash_2', 'npm start', 8080);
      registerDevServer(state, 'bash_3', 'next dev', 3001);

      expect(state.devServers['bash_1'].port).toBe(3000);
      expect(state.devServers['bash_2'].port).toBe(8080);
      expect(state.devServers['bash_3'].port).toBe(3001);
    });

    it('should initialize lastError as null', () => {
      registerDevServer(state, 'bash_12345', 'npm run dev', 3000);

      expect(state.devServers['bash_12345'].lastError).toBeNull();
    });
  });

  describe('unregisterDevServer', () => {
    it('should remove an existing dev server', () => {
      registerDevServer(state, 'bash_12345', 'npm run dev', 3000);
      expect(state.devServers['bash_12345']).toBeDefined();

      unregisterDevServer(state, 'bash_12345');

      expect(state.devServers['bash_12345']).toBeUndefined();
    });

    it('should handle removing a non-existent dev server', () => {
      expect(state.devServers['bash_99999']).toBeUndefined();

      // Should not throw
      unregisterDevServer(state, 'bash_99999');

      expect(state.devServers['bash_99999']).toBeUndefined();
    });

    it('should not affect other dev servers when removing one', () => {
      registerDevServer(state, 'bash_1', 'npm run dev', 3000);
      registerDevServer(state, 'bash_2', 'vite', 5173);
      registerDevServer(state, 'bash_3', 'next dev', 3001);

      unregisterDevServer(state, 'bash_2');

      expect(state.devServers['bash_1']).toBeDefined();
      expect(state.devServers['bash_2']).toBeUndefined();
      expect(state.devServers['bash_3']).toBeDefined();
    });

    it('should allow re-registering after unregistering', () => {
      registerDevServer(state, 'bash_12345', 'npm run dev', 3000);
      unregisterDevServer(state, 'bash_12345');
      registerDevServer(state, 'bash_12345', 'vite', 5173);

      expect(state.devServers['bash_12345']).toBeDefined();
      expect(state.devServers['bash_12345'].command).toBe('vite');
    });
  });

  describe('recordDevServerError', () => {
    it('should record an error for an existing dev server', () => {
      registerDevServer(state, 'bash_12345', 'npm run dev', 3000);

      recordDevServerError(state, 'bash_12345', 'Module not found: ./missing');

      expect(state.devServers['bash_12345'].lastError).toBe(
        'Module not found: ./missing'
      );
    });

    it('should update existing error with new error', () => {
      registerDevServer(state, 'bash_12345', 'npm run dev', 3000);
      recordDevServerError(state, 'bash_12345', 'First error');
      recordDevServerError(state, 'bash_12345', 'Second error');

      expect(state.devServers['bash_12345'].lastError).toBe('Second error');
    });

    it('should not create a dev server entry if it does not exist', () => {
      recordDevServerError(state, 'bash_99999', 'Some error');

      expect(state.devServers['bash_99999']).toBeUndefined();
    });

    it('should handle empty error string', () => {
      registerDevServer(state, 'bash_12345', 'npm run dev', 3000);
      recordDevServerError(state, 'bash_12345', '');

      expect(state.devServers['bash_12345'].lastError).toBe('');
    });

    it('should not affect other dev servers when recording error', () => {
      registerDevServer(state, 'bash_1', 'npm run dev', 3000);
      registerDevServer(state, 'bash_2', 'vite', 5173);

      recordDevServerError(state, 'bash_1', 'Error in server 1');

      expect(state.devServers['bash_1'].lastError).toBe('Error in server 1');
      expect(state.devServers['bash_2'].lastError).toBeNull();
    });

    it('should handle long error messages', () => {
      registerDevServer(state, 'bash_12345', 'npm run dev', 3000);
      const longError = 'A'.repeat(1000);
      recordDevServerError(state, 'bash_12345', longError);

      expect(state.devServers['bash_12345'].lastError).toBe(longError);
    });
  });

  describe('parseDevServerErrors', () => {
    it('should extract Error messages', () => {
      const output = 'Error: Cannot find module "foo"';
      const errors = parseDevServerErrors(output);

      expect(errors).toEqual(['Cannot find module "foo"']);
    });

    it('should extract Unhandled Runtime Error messages', () => {
      const output = 'Unhandled Runtime Error: Division by zero';
      const errors = parseDevServerErrors(output);

      // Note: This matches both /Error: (.+)/ and /Unhandled Runtime Error: (.+)/
      expect(errors).toEqual(['Division by zero', 'Division by zero']);
    });

    it('should extract TypeError messages', () => {
      const output = 'TypeError: Cannot read property "name" of undefined';
      const errors = parseDevServerErrors(output);

      // Note: This matches both /Error: (.+)/ and /TypeError: (.+)/
      expect(errors).toEqual([
        'Cannot read property "name" of undefined',
        'Cannot read property "name" of undefined',
      ]);
    });

    it('should extract ReferenceError messages', () => {
      const output = 'ReferenceError: foo is not defined';
      const errors = parseDevServerErrors(output);

      // Note: This matches both /Error: (.+)/ and /ReferenceError: (.+)/
      expect(errors).toEqual(['foo is not defined', 'foo is not defined']);
    });

    it('should extract SyntaxError messages', () => {
      const output = 'SyntaxError: Unexpected token }';
      const errors = parseDevServerErrors(output);

      // Note: This matches both /Error: (.+)/ and /SyntaxError: (.+)/
      expect(errors).toEqual(['Unexpected token }', 'Unexpected token }']);
    });

    it('should extract Module not found messages', () => {
      const output = 'Module not found: Can\'t resolve "./components/Missing"';
      const errors = parseDevServerErrors(output);

      expect(errors).toEqual(['Can\'t resolve "./components/Missing"']);
    });

    it('should extract multiple errors from output', () => {
      const output = `
        Error: First error
        Some other text
        TypeError: Second error
        More text
        SyntaxError: Third error
      `;
      const errors = parseDevServerErrors(output);

      // Note: /Error: (.+)/ matches all three, then specific patterns match their own
      expect(errors).toEqual([
        'First error',
        'Second error',
        'Third error',
        'Second error',
        'Third error',
      ]);
    });

    it('should extract multiple occurrences of the same error type', () => {
      const output = `
        Error: First error
        Error: Second error
        Error: Third error
      `;
      const errors = parseDevServerErrors(output);

      expect(errors).toEqual(['First error', 'Second error', 'Third error']);
    });

    it('should return empty array for output with no errors', () => {
      const output = 'Compiled successfully!\nReady on http://localhost:3000';
      const errors = parseDevServerErrors(output);

      expect(errors).toEqual([]);
    });

    it('should handle empty output', () => {
      const errors = parseDevServerErrors('');

      expect(errors).toEqual([]);
    });

    it('should handle output with error keywords but not matching pattern', () => {
      const output = 'This is an error message but not in the pattern';
      const errors = parseDevServerErrors(output);

      expect(errors).toEqual([]);
    });

    it('should extract errors with special characters', () => {
      const output = 'Error: Expected "(" but got "{"';
      const errors = parseDevServerErrors(output);

      expect(errors).toEqual(['Expected "(" but got "{"']);
    });

    it('should handle multiline error messages', () => {
      const output = `
        Error: First line
        Second line of error
        TypeError: Another error
      `;
      const errors = parseDevServerErrors(output);

      // Regex only captures the first line after the error type
      // TypeError also matches /Error: (.+)/ pattern
      expect(errors).toEqual(['First line', 'Another error', 'Another error']);
    });

    it('should not include matches without capture group', () => {
      const output = 'Error:';
      const errors = parseDevServerErrors(output);

      // No capture group content means no error extracted
      expect(errors).toEqual([]);
    });

    it('should handle error patterns at start of string', () => {
      const output = 'Error: At the beginning';
      const errors = parseDevServerErrors(output);

      expect(errors).toEqual(['At the beginning']);
    });

    it('should handle error patterns at end of string', () => {
      const output = 'Some text Error: At the end';
      const errors = parseDevServerErrors(output);

      expect(errors).toEqual(['At the end']);
    });

    it('should handle all error types in single output', () => {
      const output = `
        Error: Generic error
        Unhandled Runtime Error: Runtime issue
        TypeError: Type problem
        ReferenceError: Reference issue
        SyntaxError: Syntax problem
        Module not found: Missing module
      `;
      const errors = parseDevServerErrors(output);

      // /Error: (.+)/ matches all *Error patterns first, then specific patterns
      expect(errors).toEqual([
        'Generic error',
        'Runtime issue',
        'Type problem',
        'Reference issue',
        'Syntax problem',
        'Runtime issue',
        'Type problem',
        'Reference issue',
        'Syntax problem',
        'Missing module',
      ]);
    });

    it('should handle error messages with newlines in output', () => {
      const output =
        'Error: This is an error\nAnother line\nTypeError: Another error';
      const errors = parseDevServerErrors(output);

      // TypeError also matches /Error: (.+)/ pattern
      expect(errors).toEqual([
        'This is an error',
        'Another error',
        'Another error',
      ]);
    });

    it('should handle error messages with tabs and spaces', () => {
      const output = '  \t  Error: Indented error  \t  ';
      const errors = parseDevServerErrors(output);

      expect(errors).toEqual(['Indented error  \t  ']);
    });
  });
});
