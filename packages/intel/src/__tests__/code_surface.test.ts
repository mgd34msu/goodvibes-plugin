/**
 * code_surface fixture tests: a mini TS project whose entry point declares the
 * public API and whose `internal.ts` is internal-only. Asserts the split, the
 * resolved_path echo (issue 1), JSDoc capture, and output.max_tokens trimming.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';

import { handler } from '../tools/code_surface.js';
import { disposeCompilerHost } from '../host/index.js';

const surfaceDir = fileURLToPath(new URL('./fixtures/surface-project', import.meta.url));

interface SurfaceExport {
  name: string;
  kind: string;
  type: string;
  file: string;
  resolved_path: string;
  line: number;
  jsdoc?: string | null;
}
interface SurfaceData {
  path: string;
  public_api: SurfaceExport[];
  internal_api: SurfaceExport[];
  entry_points: string[];
}

function parse(result: Awaited<ReturnType<typeof handler>>): {
  success: boolean;
  data?: SurfaceData;
  warning?: string;
  meta: { token_estimate: number; truncated?: boolean; effective_caps?: Record<string, number> };
} {
  const text = (result.content[0] as { text: string }).text;
  return JSON.parse(text);
}

afterAll(() => disposeCompilerHost());

describe('code_surface', () => {
  it('splits public vs internal exports with resolved_path and JSDoc', async () => {
    const env = parse(await handler({ base_path: surfaceDir, path: '.' }));

    expect(env.success).toBe(true);
    const data = env.data!;

    const publicNames = data.public_api.map((e) => e.name).sort();
    const internalNames = data.internal_api.map((e) => e.name);

    expect(publicNames).toEqual(['PublicThing', 'PublicType', 'publicFn']);
    expect(internalNames).toContain('internalHelper');
    expect(internalNames).not.toContain('publicFn');

    // Entry point reported relative to base_path.
    expect(data.entry_points).toContain('src/index.ts');

    // Every export echoes an absolute resolved_path (issue 1 fix #3) plus a
    // base-relative file path.
    const publicFn = data.public_api.find((e) => e.name === 'publicFn')!;
    expect(publicFn.kind).toBe('function');
    expect(publicFn.file).toBe('src/index.ts');
    expect(publicFn.resolved_path.startsWith('/')).toBe(true);
    expect(publicFn.resolved_path.endsWith('src/index.ts')).toBe(true);
    expect(publicFn.jsdoc ?? '').toContain('Adds one');

    // Honest token accounting, no truncation at the default cap.
    expect(env.meta.token_estimate).toBeGreaterThan(0);
    expect(env.meta.truncated ?? false).toBe(false);
  });

  it('honours output.max_tokens by trimming the lists (truncated + effective_caps)', async () => {
    const small = parse(await handler({ base_path: surfaceDir, path: '.', output: { max_tokens: 50 } }));

    expect(small.success).toBe(true);
    expect(small.meta.truncated).toBe(true);
    expect(small.meta.effective_caps?.max_tokens).toBe(50);
    // The trimmed surface holds no more entries than the untrimmed one.
    const full = parse(await handler({ base_path: surfaceDir, path: '.' }));
    const trimmedCount = small.data!.public_api.length + small.data!.internal_api.length;
    const fullCount = full.data!.public_api.length + full.data!.internal_api.length;
    expect(trimmedCount).toBeLessThan(fullCount);
  });

  it('errors cleanly on a non-directory path', async () => {
    const env = parse(await handler({ base_path: surfaceDir, path: 'src/index.ts' }));
    expect(env.success).toBe(false);
  });
});
