/**
 * component_tree fixture tests — bare tree plus one case per annotation mode
 * (§4.4.1) over fixtures/frontend-app. The state test locks the tribunal FIX:
 * each state variable flows ONLY to the children it is actually passed to.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';

import { handler } from '../tools/component_tree.js';
import { disposeCompilerHost } from '../host/index.js';

const appDir = fileURLToPath(new URL('./fixtures/frontend-app', import.meta.url));

interface StateAnn { name: string; kind: string; flows_to: Array<{ child: string; prop: string }> }
interface EventAnn { handler: string; element: string; event: string; risks: string[] }
interface AttrAnn { element: string; role: string; issues: string[] }
type Boundary = { is_boundary: boolean; mechanism?: string; has_fallback?: boolean; has_reset?: boolean };

interface Node {
  name: string;
  resolved_path: string;
  children: Node[];
  state?: StateAnn[];
  boundaries?: Boundary;
  events?: EventAnn[];
  attributes?: AttrAnn[];
}
interface Data { tree: Node[]; count: number; annotate: string[] }

function parse(result: Awaited<ReturnType<typeof handler>>): { success: boolean; data?: Data; meta: { truncated?: boolean } } {
  return JSON.parse((result.content[0] as { text: string }).text);
}

function findNode(nodes: Node[], name: string): Node | undefined {
  for (const n of nodes) {
    if (n.name === name) {return n;}
    const found = findNode(n.children, name);
    if (found) {return found;}
  }
  return undefined;
}

afterAll(() => disposeCompilerHost());

describe('component_tree', () => {
  it('builds the bare tree from a directory with resolved_path echo', async () => {
    const env = parse(await handler({ base_path: appDir, path: 'src', annotate: [] }));
    expect(env.success).toBe(true);
    const app = findNode(env.data!.tree, 'App')!;
    expect(app).toBeDefined();
    const childNames = app.children.map((c) => c.name).sort();
    expect(childNames).toEqual(['Counter', 'SearchBox']);
    expect(app.resolved_path.endsWith('src/App.tsx')).toBe(true);
    // Bare tree carries no annotation blocks.
    expect(app.state).toBeUndefined();
    expect(app.events).toBeUndefined();
  });

  it('state mode maps each variable ONLY to the children it flows into (tribunal fix)', async () => {
    const env = parse(await handler({ base_path: appDir, path: 'src', annotate: ['state'] }));
    const app = findNode(env.data!.tree, 'App')!;
    const state = app.state!;
    const query = state.find((s) => s.name === 'query')!;
    const count = state.find((s) => s.name === 'count')!;

    expect(query.kind).toBe('useState');
    // query is passed to SearchBox (value + onChange via its setter), never Counter.
    const queryChildren = new Set(query.flows_to.map((f) => f.child));
    expect(queryChildren.has('SearchBox')).toBe(true);
    expect(queryChildren.has('Counter')).toBe(false);
    expect(query.flows_to.some((f) => f.child === 'SearchBox' && f.prop === 'value')).toBe(true);

    // count is passed to Counter, never SearchBox.
    const countChildren = new Set(count.flows_to.map((f) => f.child));
    expect(countChildren.has('Counter')).toBe(true);
    expect(countChildren.has('SearchBox')).toBe(false);
    expect(count.flows_to.some((f) => f.child === 'Counter' && f.prop === 'count')).toBe(true);
  });

  it('events mode keeps only the two accurate predicates', async () => {
    const env = parse(await handler({ base_path: appDir, path: 'src/App.tsx', annotate: ['events'] }));
    const app = findNode(env.data!.tree, 'App')!;
    const events = app.events!;

    const divClick = events.find((e) => e.element === 'div' && e.handler === 'onClick')!;
    expect(divClick.risks).toContain('handler_on_non_interactive');

    const buttonClick = events.find((e) => e.element === 'button' && e.handler === 'onClick')!;
    expect(buttonClick.risks).toEqual([]);
  });

  it('attributes mode is a static overlay of the verified checks', async () => {
    const env = parse(await handler({ base_path: appDir, path: 'src/App.tsx', annotate: ['attributes'] }));
    const app = findNode(env.data!.tree, 'App')!;
    const attrs = app.attributes!;

    expect(attrs.some((a) => a.element.startsWith('img') && a.issues.includes('missing_alt'))).toBe(true);
    expect(attrs.some((a) => a.element.startsWith('div') && a.issues.includes('click_without_role'))).toBe(true);
  });

  it('boundaries mode detects a class error boundary with fallback + reset', async () => {
    const env = parse(await handler({ base_path: appDir, path: 'src/ErrorBoundary.tsx', annotate: ['boundaries'] }));
    const eb = findNode(env.data!.tree, 'ErrorBoundary')!;
    expect(eb.boundaries).toBeDefined();
    expect(eb.boundaries!.is_boundary).toBe(true);
    expect(eb.boundaries!.mechanism).toBe('getDerivedStateFromError');
    expect(eb.boundaries!.has_fallback).toBe(true);
    expect(eb.boundaries!.has_reset).toBe(true);
  });

  it('honours output.max_tokens by pruning leaves (truncated + effective_caps)', async () => {
    const env = parse(await handler({ base_path: appDir, path: 'src', annotate: ['state', 'events', 'attributes'], output: { max_tokens: 80 } }));
    expect(env.success).toBe(true);
    expect(env.meta.truncated).toBe(true);
  });
});
