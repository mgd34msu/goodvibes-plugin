/**
 * `component_tree` — React component hierarchy with four opt-in annotation modes.
 *
 * §3 tribunal MERGE, shape per §4.4.1. Backbone ports frontend-engine
 * `extensions/component-tree.ts` + `core/react/*`; the four annotation modes are
 * distilled from `core/component-state` (state), `core/error-boundaries`
 * (boundaries), `core/event-flow` (events), and `core/accessibility` (attributes)
 * with the tribunal corrections baked in (see each annotation module). v2 wrappers:
 *  - `base_path` contract (issue 1): every node echoes an absolute `resolved_path`.
 *  - `core/proc` budget + `core/envelope` honest token accounting; `output.max_tokens`
 *    prunes leaf nodes until the forest fits.
 *  - Every SourceFile comes from the ONE compiler host (§3.3).
 *
 * @module tools/component_tree
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
import { getSourceFile, getSourceFiles } from '../frontend/source.js';
import {
  analyzeFile,
  findComponentFiles,
} from '../frontend/react/component-analyzer.js';
import {
  buildUsedByRelationships,
  buildTree,
  findRootComponents,
} from '../frontend/react/relationship-builder.js';
import type { ComponentInfo, ComponentNodeRef, ComponentTreeNode } from '../frontend/react/types.js';
import { annotateState, type StateAnnotation } from '../frontend/annotations/state.js';
import { annotateBoundaries, type BoundaryAnnotation } from '../frontend/annotations/boundaries.js';
import { annotateEvents, type EventAnnotation } from '../frontend/annotations/events.js';
import { annotateAttributes, type AttributeAnnotation } from '../frontend/annotations/attributes.js';

type AnnotationMode = 'state' | 'boundaries' | 'events' | 'attributes';
const ALL_MODES: AnnotationMode[] = ['state', 'boundaries', 'events', 'attributes'];

type NodeBoundary = BoundaryAnnotation | { is_boundary: false };

interface MergedNode {
  name: string;
  file: string;
  resolved_path: string;
  props: string[];
  children: MergedNode[];
  lazy?: boolean;
  wrappers?: string[];
  state?: StateAnnotation[];
  boundaries?: NodeBoundary;
  events?: EventAnnotation[];
  attributes?: AttributeAnnotation[];
}

interface ComponentTreeArgs {
  base_path?: string;
  path?: string;
  annotate?: string[];
  depth?: number;
  root_component?: string;
  output?: { max_tokens?: number };
}

interface ComponentTreeData {
  tree: MergedNode[];
  count: number;
  annotate: AnnotationMode[];
  message?: string;
}

const definition: Tool = {
  name: 'component_tree',
  description:
    'Build a React component hierarchy from a file or directory with four opt-in ' +
    'annotation modes. annotate:[] returns the bare tree (name, props, children, ' +
    'lazy/HOC wrappers). "state" maps each state variable to the children it flows ' +
    'into; "boundaries" flags class/library error boundaries with has_fallback/' +
    'has_reset; "events" flags the two accurate handler risks (nested double-fire, ' +
    'handler-on-non-interactive); "attributes" is a static overlay of verified ' +
    'accessibility checks (role, missing-alt, click-without-role, ARIA required). ' +
    'Static TypeScript AST analysis; no code is executed.',
  inputSchema: {
    type: 'object',
    properties: {
      base_path: {
        type: 'string',
        description: 'Absolute project root. Relative paths resolve against it.',
      },
      path: {
        type: 'string',
        description: 'File or directory to analyze (relative to base_path or absolute). Default "src".',
      },
      annotate: {
        type: 'array',
        items: { type: 'string', enum: ALL_MODES },
        description: 'Annotation modes to attach: state, boundaries, events, attributes. Default [] (bare tree).',
      },
      depth: { type: 'number', description: 'Maximum tree depth (default 5).' },
      root_component: {
        type: 'string',
        description: 'Start the tree from a specific component name (else auto-detected roots).',
      },
      output: {
        type: 'object',
        properties: {
          max_tokens: {
            type: 'number',
            description: 'Cap the rendered response; leaf nodes are pruned until it fits.',
          },
        },
      },
    },
  },
};

/** Attach the requested annotation blocks to a bare tree node, recursively. */
function toMergedNode(
  node: ComponentTreeNode,
  modes: AnnotationMode[],
  nodeIndex: Map<string, ComponentNodeRef>,
): MergedNode {
  const merged: MergedNode = {
    name: node.name,
    file: node.file,
    resolved_path: node.resolved_path,
    props: node.props,
    children: node.children.map((c) => toMergedNode(c, modes, nodeIndex)),
    ...(node.lazy !== undefined && { lazy: node.lazy }),
    ...(node.wrappers !== undefined && { wrappers: node.wrappers }),
  };

  const ref = nodeIndex.get(node.name);
  if (ref && modes.length > 0) {
    const { node: cnode, sourceFile } = ref;
    if (modes.includes('state')) merged.state = annotateState(cnode, sourceFile);
    if (modes.includes('boundaries')) {
      merged.boundaries = annotateBoundaries(cnode, sourceFile) ?? { is_boundary: false };
    }
    if (modes.includes('events')) merged.events = annotateEvents(cnode, sourceFile);
    if (modes.includes('attributes')) merged.attributes = annotateAttributes(cnode, sourceFile);
  }
  return merged;
}

/** Remove one leaf node from the forest; returns true if one was removed. */
function pruneOneLeaf(forest: MergedNode[]): boolean {
  for (let i = forest.length - 1; i >= 0; i--) {
    const node = forest[i];
    if (node.children.length === 0) {
      forest.splice(i, 1);
      return true;
    }
    if (pruneOneLeaf(node.children)) return true;
  }
  return false;
}

/** Trim the forest (leaves first) until the rendered envelope fits `maxTokens`. */
function capToTokens(
  env: Envelope<ComponentTreeData>,
  maxTokens?: number,
): Envelope<ComponentTreeData> {
  if (!maxTokens || maxTokens <= 0 || !env.data) return env;
  if (estimatePayloadTokens(renderEnvelope(env)) <= maxTokens) return env;

  const data = env.data;
  const trim = (): Envelope<ComponentTreeData> => ({
    ...env,
    data,
    meta: {
      ...env.meta,
      truncated: true,
      effective_caps: { ...(env.meta.effective_caps ?? {}), max_tokens: maxTokens },
    },
  });

  while (estimatePayloadTokens(renderEnvelope(trim())) > maxTokens) {
    if (!pruneOneLeaf(data.tree)) break;
  }
  return trim();
}

/** The `component_tree` handler. */
export async function handler(rawArgs: unknown): Promise<CallToolResult> {
  const elapsed = startTimer();
  const args = (rawArgs ?? {}) as ComponentTreeArgs;
  const cfg = loadConfig();

  const modes: AnnotationMode[] = Array.isArray(args.annotate)
    ? (args.annotate.filter((m): m is AnnotationMode => (ALL_MODES as string[]).includes(m)))
    : [];
  const depth = typeof args.depth === 'number' && args.depth > 0 ? args.depth : 5;

  const baseDir = resolveBaseDir(args.base_path);
  const targetInput = typeof args.path === 'string' && args.path.length > 0 ? args.path : 'src';
  const resolved = resolveInputPath(targetInput, args.base_path);
  const absTarget = resolved.resolved_path;

  try {
    const stat = await fs.stat(absTarget).catch(() => null);
    if (!stat) {
      return toCallToolResult(errorEnvelope(`Path not found: ${absTarget}`));
    }

    const outcome = await withBudget(cfg.budgets.analyzer_ms, async (signal) => {
      const nodeIndex = new Map<string, ComponentNodeRef>();
      const allComponents: ComponentInfo[] = [];

      if (stat.isFile()) {
        const sf = getSourceFile(absTarget);
        if (sf) {
          allComponents.push(
            ...analyzeFile(sf, makeRelativePath(absTarget, baseDir), absTarget, nodeIndex),
          );
        }
      } else {
        const files = findComponentFiles(absTarget);
        const sourceFiles = getSourceFiles(files);
        for (const abs of files) {
          if (signal.aborted) break;
          const sf = sourceFiles.get(abs);
          if (!sf) continue;
          allComponents.push(
            ...analyzeFile(sf, makeRelativePath(abs, baseDir), abs, nodeIndex),
          );
        }
      }

      if (allComponents.length === 0) {
        return { tree: [] as MergedNode[], count: 0 };
      }

      buildUsedByRelationships(allComponents);
      const roots = args.root_component ? [args.root_component] : findRootComponents(allComponents);

      const forest: MergedNode[] = [];
      for (const root of roots) {
        const bare = buildTree(root, allComponents, depth);
        if (bare) forest.push(toMergedNode(bare, modes, nodeIndex));
      }
      return { tree: forest, count: allComponents.length };
    });

    const data: ComponentTreeData = {
      tree: outcome.value.tree,
      count: outcome.value.count,
      annotate: modes,
      ...(outcome.value.count === 0 ? { message: `No React components found in ${targetInput}` } : {}),
    };

    let env = successEnvelope<ComponentTreeData>(data, {
      execution_ms: elapsed(),
      ...(outcome.budget_exceeded ? { budget_exceeded: true } : {}),
    });
    if (resolved.warning) env = { ...env, warning: resolved.warning };

    const maxTokens = args.output?.max_tokens ?? cfg.max_tokens_default;
    env = capToTokens(env, maxTokens);
    return toCallToolResult(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toCallToolResult(errorEnvelope(`Component tree analysis failed: ${message}`));
  }
}

/** Registration entry consumed by `src/index.ts`. */
export const componentTreeTool: ToolDefinition = { definition, handler };
