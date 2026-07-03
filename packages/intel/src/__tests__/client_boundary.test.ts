/**
 * client_boundary fixture tests — the client/ tree in fixtures/frontend-app:
 * Page ("use client") → Widget (client-inherited); Server (server); Leaky
 * (client APIs, no directive → missing_directive). Asserts classification, the
 * issue, and the resolved_path echo (issue 1).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';

import { handler } from '../tools/client_boundary.js';
import { disposeCompilerHost } from '../host/index.js';

const appDir = fileURLToPath(new URL('./fixtures/frontend-app', import.meta.url));

interface Component { file: string; resolved_path?: string; classification: string }
interface Issue { type: string; severity: string; file: string }
interface Data {
  scanned_path: string;
  resolved_path: string;
  components: Component[];
  issues: Issue[];
  summary: { total: number; server: number; client: number; clientInherited: number; ambiguous: number };
}

function parse(result: Awaited<ReturnType<typeof handler>>): { success: boolean; data?: Data } {
  return JSON.parse((result.content[0] as { text: string }).text);
}

function byFile(data: Data, needle: string): Component {
  const c = data.components.find((c) => c.file.endsWith(needle));
  if (!c) {throw new Error(`component ${needle} not found in ${data.components.map((x) => x.file).join(', ')}`);}
  return c;
}

afterAll(() => disposeCompilerHost());

describe('client_boundary', () => {
  it('classifies the client/ tree by directive + import graph', async () => {
    const env = parse(await handler({ base_path: appDir, path: 'client' }));
    expect(env.success).toBe(true);
    const data = env.data!;

    expect(data.summary.total).toBe(4);
    expect(data.summary.client).toBe(1);
    expect(data.summary.clientInherited).toBe(1);
    expect(data.summary.server).toBe(2);

    expect(byFile(data, 'client/Page.tsx').classification).toBe('client');
    expect(byFile(data, 'client/Widget.tsx').classification).toBe('client-inherited');
    expect(byFile(data, 'client/Server.tsx').classification).toBe('server');
    expect(byFile(data, 'client/Leaky.tsx').classification).toBe('server');

    // resolved_path echoed per component (issue 1 fix #3).
    const page = byFile(data, 'client/Page.tsx');
    expect(page.resolved_path?.startsWith('/')).toBe(true);
    expect(page.resolved_path?.endsWith('client/Page.tsx')).toBe(true);
  });

  it('flags the missing "use client" directive on Leaky', async () => {
    const env = parse(await handler({ base_path: appDir, path: 'client' }));
    const data = env.data!;
    const missing = data.issues.find((i) => i.type === 'missing_directive');
    expect(missing).toBeDefined();
    expect(missing!.file.endsWith('client/Leaky.tsx')).toBe(true);
    expect(missing!.severity).toBe('error');
  });
});
