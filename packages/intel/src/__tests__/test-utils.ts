/**
 * Test utilities for the search/read trio (code_read, code_grep, code_glob).
 *
 * Every test gets an isolated temp directory and passes it explicitly as
 * `base_path` (never relies on `process.chdir`), this exercises the same
 * `base_path` contract real callers use (field issue 1) and keeps parallel
 * test files from ever touching one another's fixtures.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { TreeSitterCore } from '../lib/tree-sitter.js';

export interface Envelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  warning?: string;
  meta: {
    token_estimate: number;
    execution_ms?: number;
    truncated?: boolean;
    effective_caps?: Record<string, number>;
    budget_exceeded?: boolean;
  };
}

export function parseResult<T = unknown>(result: CallToolResult): Envelope<T> {
  const content = result.content?.[0];
  if (!content || content.type !== 'text') {throw new Error('Expected text content in result');}
  return JSON.parse(content.text) as Envelope<T>;
}

export function expectSuccess<T = unknown>(result: CallToolResult): Envelope<T> {
  const parsed = parseResult<T>(result);
  if (!parsed.success) {throw new Error(`Expected success but got error: ${parsed.error}`);}
  return parsed;
}

export function expectError(result: CallToolResult): Envelope<never> {
  const parsed = parseResult(result);
  if (parsed.success) {throw new Error('Expected error but got success');}
  return parsed as Envelope<never>;
}

/** Create an isolated temp directory for one test. Caller is responsible for cleanup via `cleanupTempDir`. */
export async function makeTempDir(prefix = 'intel-test-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function cleanupTempDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

/** Write one file (creating parent directories) under `root`. */
export async function writeFile(root: string, relativePath: string, content: string): Promise<string> {
  const fullPath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
  return fullPath;
}

/** Write multiple files under `root` from a relativePath -> content map. */
export async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    await writeFile(root, relativePath, content);
  }
}

/**
 * Whether tree-sitter grammar parsing actually works in this environment.
 *
 * FLAGGED BLOCKER (see lane report): the committed `packages/intel/wasm/*.wasm`
 * grammars were copied from v1 precision-engine's dist (built against
 * `web-tree-sitter@0.22.6`). The v2 workspace pins `web-tree-sitter@0.26.10`,
 * which requires the newer wasm "dylink.0" custom-section format; the v1
 * grammars use the legacy "dylink" section and fail to load
 * (`Language.load` throws). This is a genuine asset/toolchain version gap,
 * not a code defect, outline-extraction tests that need a working grammar
 * gate on this probe and skip with a clear reason instead of failing red,
 * so the vitest gate stays honest about what is and is not exercised. Fix:
 * install a `tree-sitter-wasms` release built for web-tree-sitter 0.26.x (or
 * rebuild the grammars with a matching `tree-sitter-cli`) and re-run
 * `packages/intel/wasm/` asset refresh, no code change needed once that
 * lands.
 */
let outlineCapabilityCache: boolean | null = null;
export async function treeSitterOutlineAvailable(): Promise<boolean> {
  if (outlineCapabilityCache !== null) {return outlineCapabilityCache;}
  try {
    const core = new TreeSitterCore();
    await core.parse('const x = 1;\n', 'probe.ts');
    outlineCapabilityCache = true;
  } catch {
    outlineCapabilityCache = false;
  }
  return outlineCapabilityCache;
}

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
}

export interface SampleInterface {
  id: string;
  name: string;
}

export function sampleFunction(input: string): string {
  return input.toUpperCase();
}

export const SAMPLE_CONSTANT = 42;

function privateHelper(): void {
  console.log('helper');
}
`;
