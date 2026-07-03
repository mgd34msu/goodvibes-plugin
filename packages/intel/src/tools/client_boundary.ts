/**
 * `client_boundary` — Next.js App Router "use client"/"use server" analysis.
 *
 * Straight port (§4.1, §3 KEEP) of frontend-engine `extensions/client-boundary.ts`
 * + `core/client-boundary/*` onto the shared compiler host and `core/envelope`.
 * v2 wrappers: `base_path` contract (issue 1) with `resolved_path` echoed per file
 * and for the scanned root; `core/proc` budget; honest token accounting with
 * `output.max_tokens` trimming issues → components → boundaries. Every SourceFile
 * comes from the ONE compiler host (§3.3) in a single program build.
 *
 * @module tools/client_boundary
 */

import * as fs from 'node:fs';
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

import { getSourceFiles } from '../frontend/source.js';
import {
  collectScannableFiles,
  scanForDirectives,
} from '../frontend/client-boundary/scanner.js';
import {
  buildImportGraph,
  classifyComponents,
  buildBoundaryMap,
} from '../frontend/client-boundary/graph-builder.js';
import { detectIssues } from '../frontend/client-boundary/issue-detector.js';
import type {
  BoundaryEntry,
  BoundarySummary,
  ClientBoundaryResult,
  FileDirectiveInfo,
} from '../frontend/client-boundary/types.js';

interface ClientBoundaryArgs {
  base_path?: string;
  path?: string;
  entry?: string;
  output?: { max_tokens?: number };
}

const definition: Tool = {
  name: 'client_boundary',
  description:
    'Analyze a Next.js App Router project\'s "use client"/"use server" boundaries. ' +
    'Classifies each file as server, client, client-inherited, or ambiguous by ' +
    'directive + import graph, then flags misclassifications, unnecessary client ' +
    'directives, server-only imports in client code, and large client subtrees. ' +
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
        description: 'Directory to scan (relative to base_path or absolute). Auto-detects app/ then src/app then src/ then root.',
      },
      entry: {
        type: 'string',
        description: 'A single entry file to analyze instead of a directory.',
      },
      output: {
        type: 'object',
        properties: {
          max_tokens: {
            type: 'number',
            description: 'Cap the rendered response; issues then components then boundaries trim to fit.',
          },
        },
      },
    },
  },
};

/** Resolve the directory (or file) to scan, honoring base_path + auto-detection. */
function resolveScanPath(
  baseDir: string,
  basePathArg: string | undefined,
  providedPath?: string,
  entryFile?: string,
): { scanPath: string; description: string } {
  if (entryFile) {
    const abs = resolveInputPath(entryFile, basePathArg).resolved_path;
    return { scanPath: abs, description: entryFile };
  }
  if (providedPath) {
    const abs = resolveInputPath(providedPath, basePathArg).resolved_path;
    return { scanPath: abs, description: providedPath };
  }
  const candidates = [
    path.join(baseDir, 'app'),
    path.join(baseDir, 'src', 'app'),
    path.join(baseDir, 'src'),
    baseDir,
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const rel = path.relative(baseDir, candidate) || '.';
      return { scanPath: candidate, description: rel };
    }
  }
  return { scanPath: baseDir, description: '.' };
}

/** Trim issues → components → boundaries until the rendered envelope fits. */
function capToTokens(
  env: Envelope<ClientBoundaryResult>,
  maxTokens?: number,
): Envelope<ClientBoundaryResult> {
  if (!maxTokens || maxTokens <= 0 || !env.data) {return env;}
  if (estimatePayloadTokens(renderEnvelope(env)) <= maxTokens) {return env;}

  const data = env.data;
  const trim = (): Envelope<ClientBoundaryResult> => ({
    ...env,
    data,
    meta: {
      ...env.meta,
      truncated: true,
      effective_caps: { ...(env.meta.effective_caps ?? {}), max_tokens: maxTokens },
    },
  });

  while (data.issues.length > 0 && estimatePayloadTokens(renderEnvelope(trim())) > maxTokens) {
    data.issues.pop();
  }
  while (data.components.length > 0 && estimatePayloadTokens(renderEnvelope(trim())) > maxTokens) {
    data.components.pop();
  }
  while (data.boundaries.length > 0 && estimatePayloadTokens(renderEnvelope(trim())) > maxTokens) {
    data.boundaries.pop();
  }
  return trim();
}

/** The `client_boundary` handler. */
export async function handler(rawArgs: unknown): Promise<CallToolResult> {
  const elapsed = startTimer();
  const args = (rawArgs ?? {}) as ClientBoundaryArgs;
  const cfg = loadConfig();

  const baseDir = resolveBaseDir(args.base_path);
  const { scanPath, description } = resolveScanPath(baseDir, args.base_path, args.path, args.entry);

  if (!fs.existsSync(scanPath)) {
    return toCallToolResult(errorEnvelope(`Scan path not found: ${scanPath}`));
  }

  try {
    const outcome = await withBudget(cfg.budgets.analyzer_ms, async () => {
      const absPaths = collectScannableFiles(scanPath);
      if (absPaths.length === 0) {
        const empty: ClientBoundaryResult = {
          scanned_path: description,
          resolved_path: scanPath,
          components: [],
          issues: [],
          summary: { total: 0, server: 0, client: 0, clientInherited: 0, ambiguous: 0 },
          boundaries: [],
        };
        return empty;
      }

      const sourceFiles = getSourceFiles(absPaths);
      const fileInfos = scanForDirectives(baseDir, absPaths, sourceFiles);
      const clientFiles = fileInfos.filter((f) => f.directive === '"use client"');

      const graph = buildImportGraph(absPaths, baseDir, sourceFiles);
      const directiveMap = new Map<string, FileDirectiveInfo>(
        fileInfos.map((info) => [info.file, info]),
      );
      const classifications = classifyComponents(graph, directiveMap);
      const boundaryMap = buildBoundaryMap(graph, classifications);
      const issues = detectIssues(classifications, directiveMap, graph, boundaryMap);

      // Echo an absolute resolved_path for every per-file entry (issue 1 fix #3).
      for (const c of classifications) {
        c.resolved_path = path.resolve(baseDir, c.file);
      }

      const summary: BoundarySummary = {
        total: classifications.length,
        server: classifications.filter((c) => c.classification === 'server').length,
        client: classifications.filter((c) => c.classification === 'client').length,
        clientInherited: classifications.filter((c) => c.classification === 'client-inherited').length,
        ambiguous: classifications.filter((c) => c.classification === 'ambiguous').length,
        ...(clientFiles.length === 0 && !args.entry
          ? {
              note: 'No "use client" directives found in the scanned directory — all files are treated as server components.',
            }
          : {}),
      };

      const boundaries: BoundaryEntry[] = Array.from(boundaryMap.entries())
        .map(([file, childCount]) => ({ file, resolved_path: path.resolve(baseDir, file), childCount }))
        .sort((a, b) => b.childCount - a.childCount);

      const result: ClientBoundaryResult = {
        scanned_path: description,
        resolved_path: scanPath,
        components: classifications,
        issues,
        summary,
        boundaries,
      };
      return result;
    });

    let env = successEnvelope<ClientBoundaryResult>(outcome.value, {
      execution_ms: elapsed(),
      ...(outcome.budget_exceeded ? { budget_exceeded: true } : {}),
    });

    const maxTokens = args.output?.max_tokens ?? cfg.max_tokens_default;
    env = capToTokens(env, maxTokens);
    return toCallToolResult(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toCallToolResult(errorEnvelope(`Client boundary analysis failed: ${message}`));
  }
}

/** Registration entry consumed by `src/index.ts`. */
export const clientBoundaryTool: ToolDefinition = { definition, handler };
