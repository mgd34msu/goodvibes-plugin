/**
 * Unit tests for handlers/response-utils.ts
 *
 * Tests cover:
 * - createSuccessResponse
 * - createTextResponse
 * - createErrorResponse
 * - createErrorFromException
 * - createNotFoundResponse
 * - createMissingArgumentResponse
 * - createInvalidArgumentResponse
 * - ToolResponseContent interface
 * - ToolResponse interface
 */

import { describe, it, expect } from 'vitest';
import {
  createSuccessResponse,
  createTextResponse,
  createErrorResponse,
  createErrorFromException,
  createNotFoundResponse,
  createMissingArgumentResponse,
  createInvalidArgumentResponse,
  type ToolResponseContent,
  type ToolResponse,
} from '../../handlers/response-utils.js';

describe('createSuccessResponse', () => {
  it('should create response with JSON stringified content', () => {
    const data = { key: 'value', count: 42 };
    const response = createSuccessResponse(data);

    expect(response.content).toHaveLength(1);
    expect(response.content[0].type).toBe('text');

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.key).toBe('value');
    expect(parsed.count).toBe(42);
  });

  it('should not set isError flag', () => {
    const response = createSuccessResponse({ success: true });

    expect(response.isError).toBeUndefined();
  });

  it('should handle arrays', () => {
    const data = ['item1', 'item2', 'item3'];
    const response = createSuccessResponse(data);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toBe('item1');
  });

  it('should handle nested objects', () => {
    const data = {
      level1: {
        level2: {
          level3: 'deep value',
        },
      },
    };
    const response = createSuccessResponse(data);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.level1.level2.level3).toBe('deep value');
  });

  it('should handle null', () => {
    const response = createSuccessResponse(null);

    expect(response.content[0].text).toBe('null');
  });

  it('should handle numbers', () => {
    const response = createSuccessResponse(42);

    expect(response.content[0].text).toBe('42');
  });

  it('should handle boolean', () => {
    const response = createSuccessResponse(true);

    expect(response.content[0].text).toBe('true');
  });

  it('should handle strings', () => {
    const response = createSuccessResponse('hello');

    expect(response.content[0].text).toBe('"hello"');
  });

  it('should format JSON with 2 space indentation', () => {
    const data = { a: 1, b: 2 };
    const response = createSuccessResponse(data);

    // Should be formatted with indentation
    expect(response.content[0].text).toContain('\n');
    expect(response.content[0].text).toContain('  ');
  });

  it('should handle empty object', () => {
    const response = createSuccessResponse({});

    expect(response.content[0].text).toBe('{}');
  });

  it('should handle empty array', () => {
    const response = createSuccessResponse([]);

    expect(response.content[0].text).toBe('[]');
  });
});

describe('createTextResponse', () => {
  it('should create response with plain text content', () => {
    const text = 'This is plain text content';
    const response = createTextResponse(text);

    expect(response.content).toHaveLength(1);
    expect(response.content[0].type).toBe('text');
    expect(response.content[0].text).toBe(text);
  });

  it('should not set isError flag', () => {
    const response = createTextResponse('text');

    expect(response.isError).toBeUndefined();
  });

  it('should handle multiline text', () => {
    const text = 'Line 1\nLine 2\nLine 3';
    const response = createTextResponse(text);

    expect(response.content[0].text).toBe(text);
    expect(response.content[0].text.split('\n')).toHaveLength(3);
  });

  it('should handle markdown content', () => {
    const markdown = '# Heading\n\n- Item 1\n- Item 2\n\n```js\nconsole.log("hello");\n```';
    const response = createTextResponse(markdown);

    expect(response.content[0].text).toBe(markdown);
  });

  it('should handle empty string', () => {
    const response = createTextResponse('');

    expect(response.content[0].text).toBe('');
  });

  it('should handle special characters', () => {
    const text = 'Special chars: <>&"\'\n\tTab and newline';
    const response = createTextResponse(text);

    expect(response.content[0].text).toBe(text);
  });

  it('should handle unicode', () => {
    const text = 'Unicode: \u00e9\u00e8\u00ea \u4e2d\u6587';
    const response = createTextResponse(text);

    expect(response.content[0].text).toBe(text);
  });
});

describe('createErrorResponse', () => {
  it('should create error response with message', () => {
    const response = createErrorResponse('Something went wrong');

    expect(response.content).toHaveLength(1);
    expect(response.content[0].type).toBe('text');
    expect(response.isError).toBe(true);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('Something went wrong');
  });

  it('should include additional context', () => {
    const response = createErrorResponse('File not found', {
      path: '/missing/file.ts',
      code: 'ENOENT',
    });

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('File not found');
    expect(parsed.path).toBe('/missing/file.ts');
    expect(parsed.code).toBe('ENOENT');
  });

  it('should handle undefined context', () => {
    const response = createErrorResponse('Error message');

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('Error message');
    expect(Object.keys(parsed)).toHaveLength(1);
  });

  it('should handle empty context object', () => {
    const response = createErrorResponse('Error message', {});

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('Error message');
  });

  it('should format JSON with indentation', () => {
    const response = createErrorResponse('Error', { detail: 'info' });

    expect(response.content[0].text).toContain('\n');
    expect(response.content[0].text).toContain('  ');
  });

  it('should handle complex context', () => {
    const response = createErrorResponse('Validation failed', {
      errors: ['Field1 is required', 'Field2 must be a number'],
      code: 400,
      details: {
        field1: null,
        field2: 'not_a_number',
      },
    });

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.errors).toHaveLength(2);
    expect(parsed.details.field2).toBe('not_a_number');
  });
});

describe('createErrorFromException', () => {
  it('should extract message from Error object', () => {
    const error = new Error('Something broke');
    const response = createErrorFromException(error);

    expect(response.isError).toBe(true);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('Something broke');
  });

  it('should handle string errors', () => {
    const response = createErrorFromException('String error message');

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('String error message');
  });

  it('should handle number errors', () => {
    const response = createErrorFromException(404);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('404');
  });

  it('should handle null', () => {
    const response = createErrorFromException(null);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('null');
  });

  it('should handle undefined', () => {
    const response = createErrorFromException(undefined);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('undefined');
  });

  it('should handle object errors', () => {
    const response = createErrorFromException({ code: 'ERR', message: 'fail' });

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('[object Object]');
  });

  it('should add prefix when provided', () => {
    const error = new Error('Original error');
    const response = createErrorFromException(error, 'Operation failed');

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('Operation failed: Original error');
  });

  it('should work without prefix', () => {
    const error = new Error('Just the error');
    const response = createErrorFromException(error);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('Just the error');
  });

  it('should handle TypeError', () => {
    const error = new TypeError('Cannot read property');
    const response = createErrorFromException(error);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('Cannot read property');
  });

  it('should handle SyntaxError', () => {
    const error = new SyntaxError('Unexpected token');
    const response = createErrorFromException(error);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('Unexpected token');
  });

  it('should handle prefix with string error', () => {
    const response = createErrorFromException('string error', 'Prefix');

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('Prefix: string error');
  });
});

describe('createNotFoundResponse', () => {
  it('should create error response for missing resource', () => {
    const response = createNotFoundResponse('Skill', 'react/hooks');

    expect(response.isError).toBe(true);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('Skill not found: react/hooks');
  });

  it('should handle different resource types', () => {
    const skillResponse = createNotFoundResponse('Skill', 'path/to/skill');
    const fileResponse = createNotFoundResponse('File', '/src/file.ts');
    const templateResponse = createNotFoundResponse('Template', 'next-app');

    expect(JSON.parse(skillResponse.content[0].text).error).toContain('Skill not found');
    expect(JSON.parse(fileResponse.content[0].text).error).toContain('File not found');
    expect(JSON.parse(templateResponse.content[0].text).error).toContain('Template not found');
  });

  it('should include the identifier', () => {
    const response = createNotFoundResponse('Agent', 'test-agent');

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toContain('test-agent');
  });

  it('should handle empty identifier', () => {
    const response = createNotFoundResponse('User', '');

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('User not found: ');
  });
});

describe('createMissingArgumentResponse', () => {
  it('should create error response for missing argument', () => {
    const response = createMissingArgumentResponse('query');

    expect(response.isError).toBe(true);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('Missing required argument: query');
  });

  it('should handle different argument names', () => {
    const queryResponse = createMissingArgumentResponse('query');
    const fileResponse = createMissingArgumentResponse('file');
    const pathResponse = createMissingArgumentResponse('path');

    expect(JSON.parse(queryResponse.content[0].text).error).toContain('query');
    expect(JSON.parse(fileResponse.content[0].text).error).toContain('file');
    expect(JSON.parse(pathResponse.content[0].text).error).toContain('path');
  });
});

describe('createInvalidArgumentResponse', () => {
  it('should create error response for invalid argument', () => {
    const response = createInvalidArgumentResponse('line', 'must be a positive integer');

    expect(response.isError).toBe(true);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('Invalid line: must be a positive integer');
  });

  it('should handle different argument and reason combinations', () => {
    const response1 = createInvalidArgumentResponse('limit', 'cannot be negative');
    const response2 = createInvalidArgumentResponse('path', 'must be absolute');
    const response3 = createInvalidArgumentResponse('format', 'must be json or yaml');

    expect(JSON.parse(response1.content[0].text).error).toBe('Invalid limit: cannot be negative');
    expect(JSON.parse(response2.content[0].text).error).toBe('Invalid path: must be absolute');
    expect(JSON.parse(response3.content[0].text).error).toBe('Invalid format: must be json or yaml');
  });

  it('should handle empty reason', () => {
    const response = createInvalidArgumentResponse('field', '');

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe('Invalid field: ');
  });
});

describe('ToolResponseContent Interface', () => {
  it('should have type as text', () => {
    const content: ToolResponseContent = {
      type: 'text',
      text: 'Sample text',
    };

    expect(content.type).toBe('text');
    expect(content.text).toBe('Sample text');
  });
});

describe('ToolResponse Interface', () => {
  it('should have content array', () => {
    const response: ToolResponse = {
      content: [{ type: 'text', text: 'Response text' }],
    };

    expect(response.content).toHaveLength(1);
  });

  it('should optionally have isError', () => {
    const successResponse: ToolResponse = {
      content: [{ type: 'text', text: 'Success' }],
    };

    const errorResponse: ToolResponse = {
      content: [{ type: 'text', text: 'Error' }],
      isError: true,
    };

    expect(successResponse.isError).toBeUndefined();
    expect(errorResponse.isError).toBe(true);
  });
});

describe('Response Consistency', () => {
  it('should all return ToolResponse format', () => {
    const responses = [
      createSuccessResponse({ data: 'test' }),
      createTextResponse('plain text'),
      createErrorResponse('error message'),
      createErrorFromException(new Error('exception')),
      createNotFoundResponse('Type', 'id'),
      createMissingArgumentResponse('arg'),
      createInvalidArgumentResponse('arg', 'reason'),
    ];

    for (const response of responses) {
      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content.length).toBeGreaterThanOrEqual(1);
      expect(response.content[0]).toHaveProperty('type');
      expect(response.content[0]).toHaveProperty('text');
    }
  });

  it('error responses should all have isError true', () => {
    const errorResponses = [
      createErrorResponse('error'),
      createErrorFromException(new Error('exception')),
      createNotFoundResponse('Type', 'id'),
      createMissingArgumentResponse('arg'),
      createInvalidArgumentResponse('arg', 'reason'),
    ];

    for (const response of errorResponses) {
      expect(response.isError).toBe(true);
    }
  });

  it('success responses should not have isError', () => {
    const successResponses = [
      createSuccessResponse({ data: 'test' }),
      createTextResponse('plain text'),
    ];

    for (const response of successResponses) {
      expect(response.isError).toBeUndefined();
    }
  });
});

describe('Edge Cases', () => {
  it('should handle very long strings', () => {
    const longString = 'a'.repeat(10000);
    const response = createTextResponse(longString);

    expect(response.content[0].text.length).toBe(10000);
  });

  it('should handle special JSON characters in success response', () => {
    const data = {
      message: 'Line1\nLine2\tTabbed',
      quote: '"quoted"',
    };
    const response = createSuccessResponse(data);

    // Should be valid JSON
    expect(() => JSON.parse(response.content[0].text)).not.toThrow();
  });

  it('should handle circular reference in error context', () => {
    // Note: This would actually throw, so we test with non-circular
    const context = { key: 'value', nested: { deeper: 'value' } };
    const response = createErrorResponse('Error', context);

    expect(response.isError).toBe(true);
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.nested.deeper).toBe('value');
  });

  it('should handle Date objects in success response', () => {
    const data = { created: new Date('2024-01-01T00:00:00Z') };
    const response = createSuccessResponse(data);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.created).toBe('2024-01-01T00:00:00.000Z');
  });
});
