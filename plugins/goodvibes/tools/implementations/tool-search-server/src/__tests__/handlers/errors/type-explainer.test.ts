
import { describe, test, expect } from 'vitest';
import { handleExplainTypeError } from '../../../handlers/errors/type-explainer.js';

describe('handleExplainTypeError', () => {
  // ============================================================================
  // Basic Functionality Tests
  // ============================================================================
  
  test('returns explanation for known error code (2322)', async () => {
    const args = {
      error_code: 2322,
      error_message: "Type 'string' is not assignable to type 'number'.",
      context: "const x: number = 'hello';"
    };

    const result = await handleExplainTypeError(args);

    expect(result).not.toHaveProperty('isError');
    const content = JSON.parse((result.content[0] as { text: string }).text);
    
    expect(content).toHaveProperty('code', 2322);
    expect(content).toHaveProperty('name', 'Type Assignment Error');
    expect(content.explanation).toContain('type mismatch');
    expect(content.suggested_fixes.length).toBeGreaterThan(0);
    expect(content.documentation_url).toContain('narrowing.html');
  });

  test('returns default explanation for unknown error code', async () => {
    const args = {
      error_code: 99999,
      error_message: "Some unknown error occurred",
      context: "unknown code"
    };

    const result = await handleExplainTypeError(args);

    expect(result).not.toHaveProperty('isError');
    const content = JSON.parse((result.content[0] as { text: string }).text);
    
    expect(content).toHaveProperty('code', 99999);
    expect(content).toHaveProperty('name', 'TypeScript Error');
    expect(content.explanation).toContain('not in our database');
  });

  // ============================================================================
  // Input Validation Tests
  // ============================================================================

  test('returns error for invalid error_code (negative)', async () => {
    const args = {
      error_code: -1,
      error_message: "Error"
    };

    const result = await handleExplainTypeError(args);

    expect(result).toHaveProperty('isError', true);
    expect((result.content[0] as { text: string }).text).toContain('error_code must be a positive integer');
  });

  test('returns error for invalid error_code (not a number)', async () => {
    // @ts-ignore - testing runtime validation
    const args = {
      error_code: "2322",
      error_message: "Error"
    };

    // @ts-ignore
    const result = await handleExplainTypeError(args);

    expect(result).toHaveProperty('isError', true);
    expect((result.content[0] as { text: string }).text).toContain('error_code must be a positive integer');
  });

  test('returns error for missing error_message', async () => {
    // @ts-ignore - testing runtime validation
    const args = {
      error_code: 2322
    };

    // @ts-ignore
    const result = await handleExplainTypeError(args);

    expect(result).toHaveProperty('isError', true);
    expect((result.content[0] as { text: string }).text).toContain('error_message is required');
  });

  // ============================================================================
  // Pattern-Based Fix Tests
  // ============================================================================

  test('suggests undefined-specific fixes', async () => {
    const args = {
      error_code: 2322,
      error_message: "Type 'undefined' is not assignable to type 'string'"
    };

    const result = await handleExplainTypeError(args);
    const content = JSON.parse((result.content[0] as { text: string }).text);

    expect(content.suggested_fixes).toContain('Add undefined to the type: Type | undefined');
  });

  test('suggests null-specific fixes', async () => {
    const args = {
      error_code: 2322,
      error_message: "Type 'null' is not assignable to type 'string'"
    };

    const result = await handleExplainTypeError(args);
    const content = JSON.parse((result.content[0] as { text: string }).text);

    expect(content.suggested_fixes).toContain('Add null to the type: Type | null');
  });

  test('suggests Promise-specific fixes', async () => {
    const args = {
      error_code: 2322,
      error_message: "Type 'Promise<string>' is not assignable to type 'string'"
    };

    const result = await handleExplainTypeError(args);
    const content = JSON.parse((result.content[0] as { text: string }).text);

    expect(content.suggested_fixes).toContain('Ensure async functions are awaited');
  });

  test('suggests Array-specific fixes', async () => {
    const args = {
      error_code: 2322,
      error_message: "Type 'readonly string[]' is not assignable to type 'string[]'"
    };

    const result = await handleExplainTypeError(args);
    const content = JSON.parse((result.content[0] as { text: string }).text);

    expect(content.suggested_fixes).toContain('Check if array is readonly vs mutable');
  });

  test('suggests React-specific fixes', async () => {
    const args = {
      error_code: 2322,
      error_message: "Type 'Element' is not assignable to type 'ReactNode'"
    };

    const result = await handleExplainTypeError(args);
    const content = JSON.parse((result.content[0] as { text: string }).text);

    expect(content.suggested_fixes).toContain('Check component prop types');
  });

  test('suggests Event-specific fixes', async () => {
    const args = {
      error_code: 2322,
      error_message: "Type 'Event' is not assignable to type 'ChangeEvent'"
    };

    const result = await handleExplainTypeError(args);
    const content = JSON.parse((result.content[0] as { text: string }).text);

    expect(content.suggested_fixes).toContain('Use specific event type: React.ChangeEvent<HTMLInputElement>');
  });

  // ============================================================================
  // Context-Based Fix Tests
  // ============================================================================

  test('suggests async/await fixes based on context', async () => {
    const args = {
      error_code: 2322,
      error_message: "Error",
      context: "async function foo() { await bar(); }"
    };

    const result = await handleExplainTypeError(args);
    const content = JSON.parse((result.content[0] as { text: string }).text);

    expect(content.suggested_fixes).toContain('Verify async/await usage is correct');
  });

  test('suggests array method fixes based on context', () => {
    const contexts = [
      "items.map(item => item.id)",
      "items.filter(item => item.active)",
      "items.reduce((acc, item) => acc + item.val, 0)"
    ];

    contexts.forEach(async (context) => {
      const args = { error_code: 2322, error_message: "Error", context };
      const result = await handleExplainTypeError(args);
      const content = JSON.parse((result.content[0] as { text: string }).text);
      expect(content.suggested_fixes).toContain('Add explicit type parameter to array method: arr.map<Type>(...)');
    });
  });

  test('suggests hook fixes based on context', async () => {
    const args = {
      error_code: 2322,
      error_message: "Error",
      context: "const [state, setState] = useState();"
    };

    const result = await handleExplainTypeError(args);
    const content = JSON.parse((result.content[0] as { text: string }).text);

    expect(content.suggested_fixes).toContain('Add generic type to hook: useState<Type>() or useRef<Type>()');
  });

  test('suggests fetch/axios fixes based on context', async () => {
    const args = {
      error_code: 2322,
      error_message: "Error",
      context: "const res = await fetch('/api');"
    };

    const result = await handleExplainTypeError(args);
    const content = JSON.parse((result.content[0] as { text: string }).text);

    expect(content.suggested_fixes).toContain('Add type annotation to API response: const data: ResponseType = await fetch(...)');
  });

  test('suggests JSON.parse fixes based on context', async () => {
    const args = {
      error_code: 2322,
      error_message: "Error",
      context: "const data = JSON.parse(jsonString);"
    };

    const result = await handleExplainTypeError(args);
    const content = JSON.parse((result.content[0] as { text: string }).text);

    expect(content.suggested_fixes).toContain('Validate and type parsed JSON: const data = JSON.parse(str) as ExpectedType');
  });

  test('handles undefined context gracefully', async () => {
    const args = {
      error_code: 2322,
      error_message: "Error"
    };

    const result = await handleExplainTypeError(args);
    const content = JSON.parse((result.content[0] as { text: string }).text);

    // Should not crash and still return basic fixes
    expect(content.suggested_fixes.length).toBeGreaterThan(0);
  });
});
