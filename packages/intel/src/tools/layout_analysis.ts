/**
 * `layout_analysis`, CSS layout hierarchy + overflow/sizing/stacking sections.
 *
 * §3 tribunal MERGE, shape per §4.4.2. Backbone ports frontend-engine
 * `extensions/layout-hierarchy.ts` + `core/layout/*`; sections merge `core/overflow`
 * (nested-flex min-height detector + fix list, absolute-positioning demoted to a
 * guarded low-confidence flag), `core/sizing` (ancestor constraint chain, active
 * only with `selector`), and `core/stacking` (as-is + all-triggers-per-element).
 * The responsive section is ABSENT in alpha (it ships after the CSS-first rebuild).
 * v2 wrappers: `base_path` contract with `resolved_path` echo; `core/proc` budget;
 * `core/envelope` token accounting. Every SourceFile comes from the ONE host (§3.3).
 *
 * @module tools/layout_analysis
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from './types.js';
import {
  successEnvelope,
  errorEnvelope,
  toCallToolResult,
  renderEnvelope,
  estimatePayloadTokens,
  startTimer,
  type Envelope,
} from '@goodvibes/core/envelope';
import { resolveBaseDir, resolveInputPath } from '@goodvibes/core/fsx';
import { loadConfig } from '@goodvibes/core/config';
import { withBudget } from '@goodvibes/core/proc';

import { makeRelativePath } from '../host/index.js';
import { getSourceFile, FRONTEND_EXTENSIONS } from '../frontend/source.js';
import { findRootJsx, parseJsxElement } from '../frontend/layout/analyzer.js';
import type { LayoutNode } from '../frontend/layout/types.js';
import { enrichTreeWithParents } from '../frontend/overflow/utils.js';
import { findOverflowPatterns } from '../frontend/overflow/pattern-detector.js';
import { generateFixes } from '../frontend/overflow/fix-generator.js';
import type { FixOption } from '../frontend/overflow/types.js';
import { findElementBySelector } from '../frontend/jsx/element-finder.js';
import { buildAncestorChain, type SizingDimension } from '../frontend/sizing/context.js';
import { analyzeWidthStrategy, analyzeHeightStrategy } from '../frontend/sizing/analyzers.js';
import { analyzeStackingElements } from '../frontend/stacking/jsx-analyzer.js';

type Section = 'overflow' | 'sizing' | 'stacking' | 'responsive';
const DEFAULT_SECTIONS: Section[] = ['overflow', 'stacking'];

interface HierarchyNode {
  element: string;
  tag: string;
  classes: string[];
  layout_role: string;
  position: string;
  children: HierarchyNode[];
}

interface OverflowRisk {
  node: string;
  pattern: string;
  severity: 'high' | 'medium' | 'low';
  confidence: 'high' | 'medium' | 'low';
  guarded?: boolean;
  fixes: string[];
  fix_options: FixOption[];
}

interface SizingSection {
  selector: string | null;
  note?: string;
  width?: SizingDimension;
  height?: SizingDimension;
  constraint_chain?: Array<{ ancestor: string; constraint: string }>;
}

interface StackingContext {
  node: string;
  z_index: number | 'auto';
  created_by: string[];
}

interface LayoutData {
  file: string;
  resolved_path: string;
  sections: Section[];
  hierarchy: HierarchyNode[];
  overflow?: { risks: OverflowRisk[] };
  sizing?: SizingSection;
  stacking?: { contexts: StackingContext[] };
  responsive?: { available: false; note: string };
}

interface LayoutArgs {
  base_path?: string;
  file?: string;
  selector?: string;
  sections?: string[];
  output?: { max_tokens?: number };
}

const definition: Tool = {
  name: 'layout_analysis',
  description:
    'Use to reason about rendered layout from Tailwind classes without launching a browser. Analyze a JSX/TSX component\'s CSS layout from its Tailwind classes. Returns a ' +
    'hierarchy backbone (element, classes, layout_role, children) plus opt-in ' +
    'sections: "overflow" (nested-flex min-height risks + fix options; the ' +
    'absolute-positioning heuristic is a guarded low-confidence flag), "sizing" ' +
    '(ancestor constraint chain, requires a selector), and "stacking" (z-index ' +
    'contexts with every context-creation trigger per element). Responsive analysis ' +
    'is not available in this alpha. Static analysis; no code is executed.',
  inputSchema: {
    type: 'object',
    properties: {
      base_path: {
        type: 'string',
        description: 'Absolute project root. Relative paths resolve against it.',
      },
      file: {
        type: 'string',
        description: 'Component file to analyze (relative to base_path or absolute).',
      },
      selector: {
        type: 'string',
        description: 'Focus the sizing constraint chain on one node (.class / #id / tag).',
      },
      sections: {
        type: 'array',
        items: { type: 'string', enum: ['overflow', 'sizing', 'stacking', 'responsive'] },
        description: 'Sections to compute. Default ["overflow","stacking"]. "sizing" requires selector; "responsive" is post-alpha.',
      },
      output: {
        type: 'object',
        properties: {
          max_tokens: {
            type: 'number',
            description: 'Cap the rendered response; stacking contexts, overflow risks, then hierarchy leaves trim to fit.',
          },
        },
      },
    },
    required: ['file'],
  },
};

/** Derive a compact layout role from display + flex direction. */
function layoutRole(node: LayoutNode): string {
  const d = node.display;
  if (d === 'flex' || d === 'inline-flex') {
    const dir = node.flex_props?.direction;
    return dir === 'column' || dir === 'column-reverse' ? 'flex-col' : 'flex-row';
  }
  if (d === 'grid' || d === 'inline-grid') {return 'grid';}
  return d;
}

/** Map a LayoutNode tree into the lean hierarchy shape. */
function toHierarchyNode(node: LayoutNode): HierarchyNode {
  return {
    element: node.element,
    tag: node.tag,
    classes: node.classes,
    layout_role: layoutRole(node),
    position: node.position,
    children: node.children.map(toHierarchyNode),
  };
}

/** Prune one hierarchy leaf; returns true if one was removed. */
function pruneHierarchyLeaf(nodes: HierarchyNode[]): boolean {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].children.length === 0) {
      nodes.splice(i, 1);
      return true;
    }
    if (pruneHierarchyLeaf(nodes[i].children)) {return true;}
  }
  return false;
}

/** Trim sections then hierarchy leaves until the rendered envelope fits. */
function capToTokens(env: Envelope<LayoutData>, maxTokens?: number): Envelope<LayoutData> {
  if (!maxTokens || maxTokens <= 0 || !env.data) {return env;}
  if (estimatePayloadTokens(renderEnvelope(env)) <= maxTokens) {return env;}

  const data = env.data;
  const trim = (): Envelope<LayoutData> => ({
    ...env,
    data,
    meta: {
      ...env.meta,
      truncated: true,
      effective_caps: { ...(env.meta.effective_caps ?? {}), max_tokens: maxTokens },
    },
  });

  const over = (): boolean => estimatePayloadTokens(renderEnvelope(trim())) > maxTokens;
  while (over()) {
    if (data.stacking && data.stacking.contexts.length > 0) {
      data.stacking.contexts.pop();
      continue;
    }
    if (data.overflow && data.overflow.risks.length > 0) {
      data.overflow.risks.pop();
      continue;
    }
    if (!pruneHierarchyLeaf(data.hierarchy)) {break;}
  }
  return trim();
}

/** The `layout_analysis` handler. */
export async function handler(rawArgs: unknown): Promise<CallToolResult> {
  const elapsed = startTimer();
  const args = (rawArgs ?? {}) as LayoutArgs;
  const cfg = loadConfig();

  if (typeof args.file !== 'string' || args.file.length === 0) {
    return toCallToolResult(errorEnvelope('Missing required argument: file'));
  }

  const requested: Section[] = Array.isArray(args.sections)
    ? (args.sections.filter((s): s is Section => ['overflow', 'sizing', 'stacking', 'responsive'].includes(s)))
    : DEFAULT_SECTIONS;
  const selector = typeof args.selector === 'string' && args.selector.length > 0 ? args.selector : undefined;

  const baseDir = resolveBaseDir(args.base_path);
  const resolved = resolveInputPath(args.file, args.base_path);
  const absFile = resolved.resolved_path;

  const ext = path.extname(absFile).toLowerCase();
  if (!(FRONTEND_EXTENSIONS as readonly string[]).includes(ext)) {
    return toCallToolResult(
      errorEnvelope(`Unsupported file type: ${ext || '(none)'}. Supported: ${FRONTEND_EXTENSIONS.join(', ')}.`),
    );
  }

  try {
    const stat = await fs.stat(absFile).catch(() => null);
    if (!stat || !stat.isFile()) {
      return toCallToolResult(errorEnvelope(`File not found: ${absFile}`));
    }

    const outcome = await withBudget(cfg.budgets.analyzer_ms, async () => {
      const sourceFile = getSourceFile(absFile);
      if (!sourceFile) {return { ok: false as const, error: `Failed to parse component file: ${absFile}` };}

      const rootJsx = findRootJsx(sourceFile);
      if (!rootJsx) {return { ok: false as const, error: 'No JSX element found in file. Ensure the component returns JSX.' };}

      const tree = parseJsxElement(rootJsx, sourceFile);
      if (!tree) {return { ok: false as const, error: 'Failed to parse layout hierarchy from JSX.' };}

      const data: LayoutData = {
        file: makeRelativePath(absFile, baseDir),
        resolved_path: absFile,
        sections: requested,
        hierarchy: [toHierarchyNode(tree)],
      };

      // --- overflow ---
      if (requested.includes('overflow')) {
        const enriched = enrichTreeWithParents(tree);
        const patterns = findOverflowPatterns(enriched);
        const risks: OverflowRisk[] = patterns.map((p) => {
          const fixOptions = generateFixes(p);
          const guarded = p.type === 'absolute_no_containment';
          const confidence: 'high' | 'medium' | 'low' = guarded ? 'low' : p.severity;
          return {
            node: (p.element ?? p.parent)?.element ?? 'unknown',
            pattern: p.type,
            severity: p.severity,
            confidence,
            ...(guarded ? { guarded: true } : {}),
            fixes: fixOptions.map((f) => `${f.code_change} on ${f.element}`),
            fix_options: fixOptions,
          };
        });
        data.overflow = { risks };
      }

      // --- stacking ---
      if (requested.includes('stacking')) {
        const contexts: StackingContext[] = analyzeStackingElements(rootJsx, sourceFile)
          .filter((el) => el.creates_context)
          .map((el) => ({ node: el.node, z_index: el.z_index, created_by: el.created_by }));
        data.stacking = { contexts };
      }

      // --- sizing (requires selector) ---
      if (requested.includes('sizing')) {
        if (!selector) {
          data.sizing = { selector: null, note: 'The sizing section requires a `selector` to focus on one node.' };
        } else {
          const el = findElementBySelector(rootJsx, sourceFile, selector);
          if (!el) {
            data.sizing = { selector, note: `No element matched selector "${selector}".` };
          } else {
            data.sizing = {
              selector,
              width: analyzeWidthStrategy(el),
              height: analyzeHeightStrategy(el),
              constraint_chain: buildAncestorChain(el).map((a) => ({ ancestor: a.element, constraint: a.sizing_impact })),
            };
          }
        }
      }

      // --- responsive (absent in alpha) ---
      if (requested.includes('responsive')) {
        data.responsive = {
          available: false,
          note: 'Responsive analysis ships after the CSS-first rebuild (reads @theme breakpoint variables). Not available in this alpha.',
        };
      }

      return { ok: true as const, data };
    });

    if (!outcome.value.ok) {
      return toCallToolResult(errorEnvelope(outcome.value.error));
    }

    let env = successEnvelope<LayoutData>(outcome.value.data, {
      execution_ms: elapsed(),
      ...(outcome.budget_exceeded ? { budget_exceeded: true } : {}),
    });
    if (resolved.warning) {env = { ...env, warning: resolved.warning };}

    const maxTokens = args.output?.max_tokens ?? cfg.max_tokens_default;
    env = capToTokens(env, maxTokens);
    return toCallToolResult(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toCallToolResult(errorEnvelope(`Layout analysis failed: ${message}`));
  }
}

/** Registration entry consumed by `src/index.ts`. */
export const layoutAnalysisTool: ToolDefinition = { definition, handler };
