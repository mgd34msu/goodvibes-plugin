/**
 * Test utilities for precision-engine tests.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { PrecisionResult } from '../types.js';

/**
 * Parse the JSON result from a CallToolResult.
 */
/**
 * Loose payload type used as the default generic for parsed tool results.
 * Tool responses are free-form JSON envelopes and tests probe arbitrary
 * paths; supply an explicit T for stricter checking.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseToolData = any;

export function parseResult<T = LooseToolData>(result: CallToolResult): PrecisionResult<T> {
  const content = result.content?.[0];
  if (!content || content.type !== 'text') {
    throw new Error('Expected text content in result');
  }
  return JSON.parse(content.text) as PrecisionResult<T>;
}

/**
 * Assert that a result is successful.
 */
export function expectSuccess<T = LooseToolData>(result: CallToolResult): PrecisionResult<T> {
  const parsed = parseResult<T>(result);
  if (!parsed.success) {
    throw new Error(`Expected success but got error: ${parsed.error}`);
  }
  return parsed;
}

/**
 * Assert that a result is an error.
 */
export function expectError(result: CallToolResult): PrecisionResult<never> {
  const parsed = parseResult(result);
  if (parsed.success) {
    throw new Error('Expected error but got success');
  }
  return parsed as PrecisionResult<never>;
}

/**
 * Create a test file with content.
 */
export async function createTestFile(relativePath: string, content: string): Promise<string> {
  const fullPath = path.join(process.cwd(), relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
  return fullPath;
}

/**
 * Create multiple test files from an object.
 */
export async function createTestFiles(
  files: Record<string, string>
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [relativePath, content] of Object.entries(files)) {
    result[relativePath] = await createTestFile(relativePath, content);
  }
  return result;
}

/**
 * Read a test file's content.
 */
export async function readTestFile(relativePath: string): Promise<string> {
  const fullPath = path.join(process.cwd(), relativePath);
  return fs.readFile(fullPath, 'utf-8');
}

/**
 * Check if a test file exists.
 */
export async function fileExists(relativePath: string): Promise<boolean> {
  const fullPath = path.join(process.cwd(), relativePath);
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sample TypeScript code for testing symbol extraction.
 */
export const SAMPLE_TS_CODE = `
/**
 * Sample class for testing.
 */
export class SampleClass {
  private value: number;

  constructor(initial: number) {
    this.value = initial;
  }

  public getValue(): number {
    return this.value;
  }

  public setValue(val: number): void {
    this.value = val;
  }
}

/**
 * Sample interface.
 */
export interface SampleInterface {
  id: string;
  name: string;
  count?: number;
}

/**
 * Sample type alias.
 */
export type SampleType = SampleInterface | null;

/**
 * Sample function.
 */
export function sampleFunction(input: string): string {
  return input.toUpperCase();
}

/**
 * Sample constant.
 */
export const SAMPLE_CONSTANT = 42;

/**
 * Sample enum.
 */
export enum SampleEnum {
  First = 'first',
  Second = 'second',
  Third = 'third',
}

// Private function (not exported)
function privateHelper(): void {
  console.log('helper');
}
`;

/**
 * Sample JavaScript code for testing.
 */
export const SAMPLE_JS_CODE = `
/**
 * Sample function in JS.
 */
function processData(data) {
  return data.map(item => item * 2);
}

class DataProcessor {
  constructor(options) {
    this.options = options;
  }

  process(input) {
    return processData(input);
  }
}

module.exports = { processData, DataProcessor };
`;

/**
 * Sample JSON content.
 */
export const SAMPLE_JSON = `{
  "name": "test-project",
  "version": "1.0.0",
  "dependencies": {
    "lodash": "^4.17.21"
  }
}`;

/**
 * Sample markdown content.
 */
export const SAMPLE_MARKDOWN = `# Test Document

## Introduction

This is a test document for testing grep and file reading.

## Features

- Feature 1
- Feature 2
- Feature 3

## Code Example

\`\`\`typescript
const x = 42;
\`\`\`

## Conclusion

End of document.
`;
