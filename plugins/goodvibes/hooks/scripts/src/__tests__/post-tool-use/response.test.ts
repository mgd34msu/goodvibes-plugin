/**
 * Unit tests for post-tool-use/response utilities
 *
 * Tests cover:
 * - createResponse function with and without systemMessage
 * - combineMessages with various input scenarios
 * - Edge cases and boundary conditions
 * - All exported functions
 * - All code paths and branches
 *
 * Target: 100% line and branch coverage
 */

import { describe, it, expect } from 'vitest';
import { createResponse, combineMessages } from '../../post-tool-use/response.js';
import type { AutomationMessages } from '../../post-tool-use/response.js';

describe('post-tool-use/response utilities', () => {
  describe('createResponse', () => {
    it('should create response without systemMessage', () => {
      const result = createResponse();

      expect(result).toEqual({
        continue: true,
        systemMessage: undefined,
      });
      expect(result.continue).toBe(true);
      expect(result.systemMessage).toBeUndefined();
    });

    it('should create response with systemMessage', () => {
      const message = 'Build failed: 3 type errors';
      const result = createResponse(message);

      expect(result).toEqual({
        continue: true,
        systemMessage: message,
      });
      expect(result.continue).toBe(true);
      expect(result.systemMessage).toBe(message);
    });

    it('should create response with empty string systemMessage', () => {
      const result = createResponse('');

      expect(result).toEqual({
        continue: true,
        systemMessage: '',
      });
      expect(result.continue).toBe(true);
      expect(result.systemMessage).toBe('');
    });

    it('should create response with multiline systemMessage', () => {
      const message = 'Line 1\nLine 2\nLine 3';
      const result = createResponse(message);

      expect(result).toEqual({
        continue: true,
        systemMessage: message,
      });
      expect(result.systemMessage).toBe(message);
    });

    it('should create response with special characters in systemMessage', () => {
      const message = 'Error: <test> & "quotes" | special!@#$%^&*()';
      const result = createResponse(message);

      expect(result).toEqual({
        continue: true,
        systemMessage: message,
      });
      expect(result.systemMessage).toBe(message);
    });

    it('should always set continue to true', () => {
      expect(createResponse().continue).toBe(true);
      expect(createResponse('message').continue).toBe(true);
      expect(createResponse('').continue).toBe(true);
    });
  });

  describe('combineMessages', () => {
    it('should return undefined for empty array', () => {
      const result = combineMessages([]);

      expect(result).toBeUndefined();
    });

    it('should combine single message', () => {
      const result = combineMessages(['Tests passed']);

      expect(result).toBe('Tests passed');
    });

    it('should combine two messages with pipe separator', () => {
      const result = combineMessages(['Tests passed', 'Build OK']);

      expect(result).toBe('Tests passed | Build OK');
    });

    it('should combine multiple messages with pipe separator', () => {
      const result = combineMessages([
        'Tests passed',
        'Build OK',
        'Linting passed',
        'Type check OK',
      ]);

      expect(result).toBe('Tests passed | Build OK | Linting passed | Type check OK');
    });

    it('should handle messages with empty strings', () => {
      const result = combineMessages(['', 'Message', '']);

      expect(result).toBe(' | Message | ');
    });

    it('should handle messages with spaces', () => {
      const result = combineMessages(['  Message 1  ', '  Message 2  ']);

      expect(result).toBe('  Message 1   |   Message 2  ');
    });

    it('should handle messages with special characters', () => {
      const result = combineMessages([
        'Error: <test>',
        'Warning: "quotes"',
        'Info: special!@#$',
      ]);

      expect(result).toBe('Error: <test> | Warning: "quotes" | Info: special!@#$');
    });

    it('should handle messages with pipe characters', () => {
      const result = combineMessages(['Message | 1', 'Message | 2']);

      expect(result).toBe('Message | 1 | Message | 2');
    });

    it('should handle messages with newlines', () => {
      const result = combineMessages(['Line 1\nLine 2', 'Line 3\nLine 4']);

      expect(result).toBe('Line 1\nLine 2 | Line 3\nLine 4');
    });

    it('should handle very long message arrays', () => {
      const messages = Array.from({ length: 100 }, (_, i) => `Message ${i}`);
      const result = combineMessages(messages);

      expect(result).toBeDefined();
      expect(result!.split(' | ')).toHaveLength(100);
      expect(result).toContain('Message 0');
      expect(result).toContain('Message 99');
    });

    it('should handle array with single empty string', () => {
      const result = combineMessages(['']);

      expect(result).toBe('');
    });

    it('should preserve exact spacing in separator', () => {
      const result = combineMessages(['A', 'B']);

      // Verify exact separator is ' | ' (space-pipe-space)
      expect(result).toBe('A | B');
      expect(result).not.toBe('A|B');
      expect(result).not.toBe('A  |  B');
    });
  });

  describe('AutomationMessages interface', () => {
    it('should accept valid AutomationMessages objects', () => {
      const validMessages: AutomationMessages = {
        messages: ['Test 1', 'Test 2'],
      };

      expect(validMessages.messages).toHaveLength(2);
      expect(validMessages.messages[0]).toBe('Test 1');
    });

    it('should accept empty messages array', () => {
      const emptyMessages: AutomationMessages = {
        messages: [],
      };

      expect(emptyMessages.messages).toHaveLength(0);
    });

    it('should work with combineMessages', () => {
      const automationMessages: AutomationMessages = {
        messages: ['Message 1', 'Message 2', 'Message 3'],
      };

      const combined = combineMessages(automationMessages.messages);

      expect(combined).toBe('Message 1 | Message 2 | Message 3');
    });
  });

  describe('integration scenarios', () => {
    it('should create response from combined messages', () => {
      const messages = ['Tests passed', 'Build OK', 'Deploy ready'];
      const combined = combineMessages(messages);
      const response = createResponse(combined);

      expect(response).toEqual({
        continue: true,
        systemMessage: 'Tests passed | Build OK | Deploy ready',
      });
    });

    it('should create response with undefined when no messages', () => {
      const messages: string[] = [];
      const combined = combineMessages(messages);
      const response = createResponse(combined);

      expect(response).toEqual({
        continue: true,
        systemMessage: undefined,
      });
    });

    it('should handle workflow with AutomationMessages', () => {
      const automation: AutomationMessages = {
        messages: ['Automation 1', 'Automation 2'],
      };

      const combined = combineMessages(automation.messages);
      const response = createResponse(combined);

      expect(response.systemMessage).toBe('Automation 1 | Automation 2');
      expect(response.continue).toBe(true);
    });

    it('should handle typical error reporting workflow', () => {
      const errorMessages = [
        'Build failed: 3 errors',
        'Tests failed: 5 failures',
        'Lint failed: 2 warnings',
      ];

      const combined = combineMessages(errorMessages);
      const response = createResponse(combined);

      expect(response.systemMessage).toContain('Build failed');
      expect(response.systemMessage).toContain('Tests failed');
      expect(response.systemMessage).toContain('Lint failed');
      expect(response.continue).toBe(true);
    });

    it('should handle success reporting workflow', () => {
      const successMessages = ['All tests passed', 'Build successful', 'Ready to deploy'];

      const combined = combineMessages(successMessages);
      const response = createResponse(combined);

      expect(response.systemMessage).toBe(
        'All tests passed | Build successful | Ready to deploy'
      );
      expect(response.continue).toBe(true);
    });
  });

  describe('type safety and edge cases', () => {
    it('should handle unicode characters in messages', () => {
      const messages = ['Test 测试', 'Build ビルド', 'Deploy 🚀'];
      const result = combineMessages(messages);

      expect(result).toBe('Test 测试 | Build ビルド | Deploy 🚀');
    });

    it('should handle messages with tabs and special whitespace', () => {
      const messages = ['Tab\there', 'Space there'];
      const result = combineMessages(messages);

      expect(result).toBe('Tab\there | Space there');
    });

    it('should handle very long single message', () => {
      const longMessage = 'A'.repeat(10000);
      const result = combineMessages([longMessage]);

      expect(result).toBe(longMessage);
      expect(result!.length).toBe(10000);
    });

    it('should handle message with only whitespace', () => {
      const messages = ['   ', '\t\t', '\n\n'];
      const result = combineMessages(messages);

      expect(result).toBe('    | \t\t | \n\n');
    });

    it('should maintain array order in combination', () => {
      const messages = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
      const result = combineMessages(messages);

      expect(result).toBe('First | Second | Third | Fourth | Fifth');
      const parts = result!.split(' | ');
      expect(parts).toEqual(messages);
    });
  });

  describe('boundary conditions', () => {
    it('should handle single character messages', () => {
      const result = combineMessages(['A', 'B', 'C']);

      expect(result).toBe('A | B | C');
    });

    it('should handle messages that are just separators', () => {
      const result = combineMessages(['|', '|', '|']);

      expect(result).toBe('| | | | |');
    });

    it('should handle null-like strings (not actual null)', () => {
      const messages = ['null', 'undefined', 'NaN'];
      const result = combineMessages(messages);

      expect(result).toBe('null | undefined | NaN');
    });

    it('should handle numeric-looking strings', () => {
      const messages = ['123', '456.789', '-100'];
      const result = combineMessages(messages);

      expect(result).toBe('123 | 456.789 | -100');
    });

    it('should handle boolean-looking strings', () => {
      const messages = ['true', 'false'];
      const result = combineMessages(messages);

      expect(result).toBe('true | false');
    });
  });
});
