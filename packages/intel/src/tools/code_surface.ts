/**
 * `code_surface` — public vs internal API surface of a module/package.
 *
 * Ports project-engine `extensions/code-intel/api-surface.ts` onto the shared
 * compiler host (§3.3, §4.1). v2 wrappers per the port row:
 *  - `base_path` contract (issue 1): the target dir + explicit entry points
 *    resolve via `core/fsx`; every export echoes an absolute `resolved_path`.
 *  - `core/proc` budget: the analysis runs under `withBudget`; if it expires the
 *    partial surface returns with `budget_exceeded: true`.
 *  - `core/envelope`: honest token accounting; `output.max_tokens` trims the
 *    lists (internal first) with `truncated` + `effective_caps` when it bites.
 *
 * @module tools/code_surface
 */

import * as fs from 'node:fs/promises';

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
import { withBudget, type BudgetSignal } from '@goodvibes/core/proc';

import {
  getCompilerHost,
  detectEntryPoints,
  findSourceFiles,
  collectPublicExports,
  collectAllExports,
  makeRelativePath,
  toTsPath,
  type PublicApiExport,
  type InternalApiExport,
} from '../host/index.js';

interface CodeSurfaceArgs {
  base_path?: string;
  path?: string;
  entry_points?: string[];
  output?: { max_tokens?: number };
}

interface CodeSurfaceData {
  path: string;
  public_api: PublicApiExport[];
  internal_api: InternalApiExport[];
  entry_points: string[];
}

const definition: Tool = {
  name: 'code_surface',
  description:
    'Use before modifying or reviewing a module to know what is public API versus internal implementation. Analyze the public vs internal API surface of a module or package using the ' +
    'TypeScript compiler. Returns exported symbols with kind, type signature, JSDoc, ' +
    'file and 1-based line — split into public (reachable from entry points) and ' +
    'internal. Static compiler analysis; no code is executed.',
  inputSchema: {
    type: 'object',
    properties: {
      base_path: {
        type: 'string',
        description: 'Absolute project root. Relative paths resolve against it.',
      },
      path: {
        type: 'string',
        description: 'Directory to analyze (relative to base_path or absolute). Default ".".',
      },
      entry_points: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Explicit entry-point files (relative to base_path or absolute). Auto-detected ' +
          'from package.json / conventional names when omitted.',
      },
      output: {
        type: 'object',
        properties: {
          max_tokens: {
            type: 'number',
            description: 'Cap the rendered response; the surface lists trim to fit (internal first).',
          },
        },
      },
    },
  },
};

/** Compute the surface under a cooperative budget signal. */
async function computeSurface(
  absTarget: string,
  baseDir: string,
  explicitEntryPoints: string[] | undefined,
  signal: BudgetSignal,
): Promise<CodeSurfaceData & { partial: boolean }> {
  const host = getCompilerHost();

  // Resolve entry points (explicit → resolved+existing; else auto-detect).
  let entryPoints: string[];
  if (explicitEntryPoints && explicitEntryPoints.length > 0) {
    const resolved = explicitEntryPoints.map((ep) => resolveInputPath(ep, baseDir).resolved_path);
    const checks = await Promise.all(
      resolved.map((ep) => fs.access(ep).then(() => true, () => false)),
    );
    entryPoints = resolved.filter((_, i) => checks[i]);
  } else {
    entryPoints = await detectEntryPoints(absTarget);
  }

  if (entryPoints.length === 0 || signal.aborted) {
    return { path: absTarget, public_api: [], internal_api: [], entry_points: [], partial: signal.aborted };
  }

  const sourceFiles = await findSourceFiles(absTarget);
  const entryRel = entryPoints.map((ep) => makeRelativePath(ep, baseDir));

  if (sourceFiles.length === 0 || signal.aborted) {
    return {
      path: absTarget,
      public_api: [],
      internal_api: [],
      entry_points: entryRel,
      partial: signal.aborted,
    };
  }

  // ONE program with every entry point + source file loaded as a root, so the
  // type checker resolves each file deterministically (not by import reach).
  const allFiles = Array.from(new Set([...entryPoints, ...sourceFiles].map(toTsPath)));
  const { service } = host.getServiceForFiles(allFiles);

  const publicExports = collectPublicExports(entryPoints, service);
  const allExports = collectAllExports(sourceFiles, service);
  const publicKeys = new Set(publicExports.keys());

  const publicApi: PublicApiExport[] = [];
  const internalApi: InternalApiExport[] = [];

  for (const [key, exp] of allExports) {
    if (signal.aborted) {break;}
    if (publicKeys.has(key)) {
      const pub = publicExports.get(key)!;
      publicApi.push({
        name: pub.name,
        kind: pub.kind,
        type: pub.type,
        file: makeRelativePath(pub.file, baseDir),
        resolved_path: pub.file,
        line: pub.line,
        jsdoc: pub.jsdoc,
      });
    } else {
      internalApi.push({
        name: exp.name,
        kind: exp.kind,
        type: exp.type,
        file: makeRelativePath(exp.file, baseDir),
        resolved_path: exp.file,
        line: exp.line,
      });
    }
  }

  const byFileLine = <T extends { file: string; line: number }>(arr: T[]): T[] =>
    arr.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  return {
    path: absTarget,
    public_api: byFileLine(publicApi),
    internal_api: byFileLine(internalApi),
    entry_points: entryRel,
    partial: signal.aborted,
  };
}

/**
 * Trim the surface lists so the rendered envelope fits `maxTokens`. Drops
 * internal_api entries first, then public_api. Returns the (possibly) trimmed
 * envelope with honest `truncated` + `effective_caps`.
 */
function capToTokens(env: Envelope<CodeSurfaceData>, maxTokens?: number): Envelope<CodeSurfaceData> {
  if (!maxTokens || maxTokens <= 0 || !env.data) {return env;}
  if (estimatePayloadTokens(renderEnvelope(env)) <= maxTokens) {return env;}

  const data = env.data;
  const trim = (): Envelope<CodeSurfaceData> => ({
    ...env,
    data,
    meta: {
      ...env.meta,
      truncated: true,
      effective_caps: { ...(env.meta.effective_caps ?? {}), max_tokens: maxTokens },
    },
  });

  // Drop internal entries from the end until it fits or none remain.
  while (data.internal_api.length > 0 && estimatePayloadTokens(renderEnvelope(trim())) > maxTokens) {
    data.internal_api.pop();
  }
  // Then public entries if still over.
  while (data.public_api.length > 0 && estimatePayloadTokens(renderEnvelope(trim())) > maxTokens) {
    data.public_api.pop();
  }
  return trim();
}

/**
 * The `code_surface` handler.
 * @param rawArgs - MCP tool arguments (validated here)
 */
export async function handler(rawArgs: unknown): Promise<CallToolResult> {
  const elapsed = startTimer();
  const args = (rawArgs ?? {}) as CodeSurfaceArgs;
  const cfg = loadConfig();

  const baseDir = resolveBaseDir(args.base_path);
  const targetInput = typeof args.path === 'string' && args.path.length > 0 ? args.path : '.';
  const resolved = resolveInputPath(targetInput, args.base_path);
  const absTarget = resolved.resolved_path;

  try {
    const stat = await fs.stat(absTarget).catch(() => null);
    if (!stat) {
      return toCallToolResult(errorEnvelope(`Path not found: ${absTarget}`));
    }
    if (!stat.isDirectory()) {
      return toCallToolResult(errorEnvelope(`Path is not a directory: ${absTarget}`));
    }

    const outcome = await withBudget(cfg.budgets.analyzer_ms, (signal) =>
      computeSurface(absTarget, baseDir, args.entry_points, signal),
    );
    const { partial, ...data } = outcome.value;

    let env = successEnvelope<CodeSurfaceData>(data, {
      execution_ms: elapsed(),
      ...(outcome.budget_exceeded || partial ? { budget_exceeded: true } : {}),
    });
    if (resolved.warning) {env = { ...env, warning: resolved.warning };}

    const maxTokens = args.output?.max_tokens ?? cfg.max_tokens_default;
    env = capToTokens(env, maxTokens);
    return toCallToolResult(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toCallToolResult(errorEnvelope(`Failed to analyze API surface: ${message}`));
  }
}

/** Registration entry consumed by `src/index.ts`. */
export const codeSurfaceTool: ToolDefinition = { definition, handler };
