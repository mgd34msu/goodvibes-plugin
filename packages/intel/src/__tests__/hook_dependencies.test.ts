/**
 * hook_dependencies fixture tests, one hook per known issue class in
 * fixtures/frontend-app/src/HooksDemo.tsx. Asserts the issue taxonomy, the
 * stale-closure detail, the `hook` filter, and the resolved_path echo (issue 1).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';

import { handler } from '../tools/hook_dependencies.js';
import { disposeCompilerHost } from '../host/index.js';

const appDir = fileURLToPath(new URL('./fixtures/frontend-app', import.meta.url));

interface HookIssue {
  hookName: string;
  type: string;
  severity: string;
  details?: string[];
}
interface HookDep { name: string; stability: string }
interface SerializedHook { name: string; variableName?: string; deps: HookDep[] }
interface Data {
  file: string;
  resolved_path: string;
  component: string;
  hooks: SerializedHook[];
  issues: HookIssue[];
  summary: { total_hooks: number; total_issues: number; by_type: Record<string, number> };
}

function parse(result: Awaited<ReturnType<typeof handler>>): {
  success: boolean;
  data?: Data;
  error?: string;
  meta: { token_estimate: number; truncated?: boolean; effective_caps?: Record<string, number> };
} {
  return JSON.parse((result.content[0] as { text: string }).text);
}

afterAll(() => disposeCompilerHost());

describe('hook_dependencies', () => {
  it('classifies the known issue types in HooksDemo', async () => {
    const env = parse(await handler({ base_path: appDir, file: 'src/HooksDemo.tsx' }));
    expect(env.success).toBe(true);
    const data = env.data!;

    expect(data.component).toBe('HooksDemo');
    expect(data.resolved_path.startsWith('/')).toBe(true);
    expect(data.resolved_path.endsWith('src/HooksDemo.tsx')).toBe(true);
    expect(data.file).toBe('src/HooksDemo.tsx');

    const types = new Set(data.issues.map((i) => i.type));
    expect(types.has('stale_closure')).toBe(true);
    expect(types.has('missing_deps')).toBe(true);
    expect(types.has('missing_cleanup')).toBe(true);
    expect(types.has('unstable_deps')).toBe(true);

    // The stale closure names the captured state variable `count`.
    const stale = data.issues.find((i) => i.type === 'stale_closure')!;
    expect(stale.hookName).toBe('useEffect');
    expect(stale.details).toContain('count');

    // Stability is classified by default (include_stable_analysis defaults true).
    const inc = data.hooks.find((h) => h.variableName === 'inc');
    expect(inc).toBeDefined();
    expect(inc!.deps.some((d) => d.stability === 'stable')).toBe(true);
  });

  it('narrows to one hook via the `hook` filter (clean hook → no issues)', async () => {
    const env = parse(await handler({ base_path: appDir, file: 'src/HooksDemo.tsx', hook: 'inc' }));
    expect(env.success).toBe(true);
    const data = env.data!;
    expect(data.summary.total_hooks).toBe(1);
    expect(data.hooks[0].variableName).toBe('inc');
    expect(data.summary.total_issues).toBe(0);
  });

  it('rejects a non-component file type', async () => {
    const env = parse(await handler({ base_path: appDir, file: 'tsconfig.json' }));
    expect(env.success).toBe(false);
  });

  it('honours output.max_tokens with honest truncated + effective_caps', async () => {
    const env = parse(await handler({ base_path: appDir, file: 'src/HooksDemo.tsx', output: { max_tokens: 60 } }));
    expect(env.success).toBe(true);
    expect(env.meta.truncated).toBe(true);
    expect(env.meta.effective_caps?.max_tokens).toBe(60);
  });
});
