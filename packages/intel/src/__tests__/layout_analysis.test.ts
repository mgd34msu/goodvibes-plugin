/**
 * layout_analysis fixture tests — the Panel component in fixtures/frontend-app:
 * a nested flex without min-h-0 (overflow), a fixed z-50 modal (stacking, all
 * triggers), a guarded absolute-positioning flag, and a `.results` sizing chain
 * (§4.4.2). Responsive is asserted ABSENT in this alpha.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';

import { handler } from '../tools/layout_analysis.js';
import { disposeCompilerHost } from '../host/index.js';

const appDir = fileURLToPath(new URL('./fixtures/frontend-app', import.meta.url));

interface HierarchyNode { element: string; tag: string; layout_role: string; children: HierarchyNode[] }
interface OverflowRisk { node: string; pattern: string; severity: string; confidence: string; guarded?: boolean; fixes: string[] }
interface StackingCtx { node: string; z_index: number | 'auto'; created_by: string[] }
interface SizingSection { selector: string | null; constraint_chain?: Array<{ ancestor: string; constraint: string }> }
interface Data {
  file: string;
  resolved_path: string;
  sections: string[];
  hierarchy: HierarchyNode[];
  overflow?: { risks: OverflowRisk[] };
  stacking?: { contexts: StackingCtx[] };
  sizing?: SizingSection;
  responsive?: { available: boolean; note: string };
}

function parse(result: Awaited<ReturnType<typeof handler>>): { success: boolean; data?: Data; meta: { truncated?: boolean } } {
  return JSON.parse((result.content[0] as { text: string }).text);
}

afterAll(() => disposeCompilerHost());

describe('layout_analysis', () => {
  it('builds the hierarchy backbone with layout roles + resolved_path', async () => {
    const env = parse(await handler({ base_path: appDir, file: 'src/Panel.tsx' }));
    expect(env.success).toBe(true);
    const data = env.data!;
    expect(data.resolved_path.endsWith('src/Panel.tsx')).toBe(true);
    expect(data.hierarchy[0].layout_role).toBe('flex-col');
    expect(data.hierarchy[0].tag).toBe('div');
  });

  it('detects the nested-flex missing min-h-0 risk with a min-h-0 fix', async () => {
    const env = parse(await handler({ base_path: appDir, file: 'src/Panel.tsx' }));
    const risks = env.data!.overflow!.risks;
    const nested = risks.find((r) => r.pattern === 'min_height_zero_missing');
    expect(nested).toBeDefined();
    expect(nested!.fixes.some((f) => f.includes('min-h-0'))).toBe(true);
  });

  it('demotes the absolute-positioning heuristic to a guarded low-confidence flag', async () => {
    const env = parse(await handler({ base_path: appDir, file: 'src/Panel.tsx' }));
    const risks = env.data!.overflow!.risks;
    const abs = risks.find((r) => r.pattern === 'absolute_no_containment');
    expect(abs).toBeDefined();
    expect(abs!.guarded).toBe(true);
    expect(abs!.confidence).toBe('low');
  });

  it('reports stacking contexts with every context-creation trigger per element', async () => {
    const env = parse(await handler({ base_path: appDir, file: 'src/Panel.tsx' }));
    const contexts = env.data!.stacking!.contexts;
    const modal = contexts.find((c) => c.node.includes('modal'));
    expect(modal).toBeDefined();
    expect(modal!.z_index).toBe(50);
    // fixed + z-50 → both "fixed or sticky" and "position with z" triggers.
    expect(modal!.created_by.length).toBeGreaterThanOrEqual(2);
  });

  it('emits the sizing constraint chain only with a selector', async () => {
    const withSel = parse(await handler({ base_path: appDir, file: 'src/Panel.tsx', sections: ['sizing'], selector: '.results' }));
    expect(withSel.data!.sizing!.selector).toBe('.results');
    expect((withSel.data!.sizing!.constraint_chain ?? []).length).toBeGreaterThan(0);

    const noSel = parse(await handler({ base_path: appDir, file: 'src/Panel.tsx', sections: ['sizing'] }));
    expect(noSel.data!.sizing!.selector).toBeNull();
    expect(noSel.data!.sizing!.constraint_chain).toBeUndefined();
  });

  it('omits responsive analysis in this alpha', async () => {
    const env = parse(await handler({ base_path: appDir, file: 'src/Panel.tsx', sections: ['responsive'] }));
    expect(env.data!.responsive!.available).toBe(false);
  });
});
