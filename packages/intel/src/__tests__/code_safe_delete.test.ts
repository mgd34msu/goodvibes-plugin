/**
 * code_safe_delete fixture tests:
 *  - delete-safe: `countdown` has no external references (its recursive call is a
 *    self-reference; the comment/string mentions of "countdown" in consumer.ts do
 *    NOT count — proving the check is compiler-based, not a regex scan).
 *  - delete-breaks: `shared` is called by consumer.ts, so deletion breaks it.
 *  - resolved_path echo + argument validation.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';

import { handler } from '../tools/code_safe_delete.js';
import { disposeCompilerHost } from '../host/index.js';

const dir = fileURLToPath(new URL('./fixtures/safe-delete-project', import.meta.url));
const targetPath = `${dir}/src/target.ts`;

interface Ref {
  file: string;
  resolved_path: string;
  line: number;
  column: number;
  preview: string;
}
interface SafeDeleteData {
  safe: boolean;
  resolved_path: string;
  external_references: Ref[];
  self_references: Ref[];
  reason: string;
  symbol?: string;
}

function parse(result: Awaited<ReturnType<typeof handler>>): {
  success: boolean;
  data?: SafeDeleteData;
  error?: string;
  meta: { execution_ms?: number };
} {
  const text = (result.content[0] as { text: string }).text;
  return JSON.parse(text);
}

/** 1-based line/column of `symbol` within its declaration line `decl`. */
function defPos(content: string, decl: string, symbol: string): { line: number; column: number } {
  const declIdx = content.indexOf(decl);
  if (declIdx < 0) {throw new Error(`declaration not found: ${decl}`);}
  const symIdx = content.indexOf(symbol, declIdx);
  const before = content.slice(0, symIdx);
  return { line: before.split('\n').length, column: symIdx - before.lastIndexOf('\n') };
}

afterAll(() => disposeCompilerHost());

describe('code_safe_delete', () => {
  const content = fs.readFileSync(targetPath, 'utf-8');

  it('reports SAFE for a symbol with no external references (self-refs only)', async () => {
    const { line, column } = defPos(content, 'export function countdown', 'countdown');
    const env = parse(await handler({ base_path: dir, file: 'src/target.ts', line, column }));

    expect(env.success).toBe(true);
    const data = env.data!;
    expect(data.symbol).toBe('countdown');
    expect(data.safe).toBe(true);
    // The recursive call is a non-blocking self-reference.
    expect(data.self_references.length).toBeGreaterThanOrEqual(1);
    // Critically: the comment + string mentions of "countdown" in consumer.ts are
    // NOT counted — a regex scan would have flagged them as external references.
    expect(data.external_references).toEqual([]);
    // resolved_path echo (issue 1 fix #3).
    expect(data.resolved_path).toBe(targetPath);
    for (const ref of data.self_references) {
      expect(ref.resolved_path).toBe(targetPath);
    }
    expect(env.meta.execution_ms).toBeGreaterThanOrEqual(0);
  });

  it('reports UNSAFE for a symbol referenced by another file', async () => {
    const { line, column } = defPos(content, 'export function shared', 'shared');
    const env = parse(await handler({ base_path: dir, file: 'src/target.ts', line, column }));

    expect(env.success).toBe(true);
    const data = env.data!;
    expect(data.symbol).toBe('shared');
    expect(data.safe).toBe(false);
    expect(data.external_references.length).toBeGreaterThanOrEqual(1);

    const ext = data.external_references[0];
    expect(ext.file).toBe('src/consumer.ts');
    expect(ext.resolved_path.endsWith('src/consumer.ts')).toBe(true);
    expect(ext.preview.length).toBeGreaterThan(0);
  });

  it('rejects malformed arguments without throwing', async () => {
    const missingFile = parse(await handler({ base_path: dir, line: 1, column: 1 }));
    expect(missingFile.success).toBe(false);

    const badLine = parse(await handler({ base_path: dir, file: 'src/target.ts', line: 0, column: 1 }));
    expect(badLine.success).toBe(false);
  });

  it('errors cleanly on a non-existent file', async () => {
    const env = parse(await handler({ base_path: dir, file: 'src/nope.ts', line: 1, column: 1 }));
    expect(env.success).toBe(false);
    expect(env.error).toContain('not found');
  });
});
