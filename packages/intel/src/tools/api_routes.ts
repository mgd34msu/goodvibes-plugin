/**
 * `api_routes`, multi-framework API route discovery.
 *
 * Ports project-engine `extensions/api/routes.ts` + `core/api/{detection,
 * parsers/*}.ts` (§4.1). v2 wrappers per the port row:
 *  - `base_path` contract (issue 1): the target dir resolves via `core/fsx`;
 *    every route echoes an absolute `resolved_path`.
 *  - `core/proc` budget: scanning runs under `withBudget`; a budget expiry
 *    returns whatever routes were found so far with `budget_exceeded: true`.
 *  - `core/envelope`: honest token accounting; `output.max_tokens` trims the
 *    routes list with `truncated` + `effective_caps` when it bites.
 *  - File discovery rides the shared compiler host's `findSourceFiles` (§3.3)
 *    instead of the v1 bespoke walker.
 *
 * @module tools/api_routes
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

import { detectFramework } from '../lib/api/detection.js';
import { scanFrameworkRoutes } from '../lib/api/routes.js';
import type { ApiRoute, Framework } from '../lib/api/types.js';

interface ApiRoutesArgs {
  base_path?: string;
  path?: string;
  framework?: Framework | 'auto';
  output?: { max_tokens?: number };
}

interface ApiRoutesData {
  framework: Framework;
  routes: ApiRoute[];
  count: number;
}

const FRAMEWORK_ENUM = ['nextjs', 'express', 'fastify', 'hono', 'auto'] as const;

const definition: Tool = {
  name: 'api_routes',
  description:
    'Use to map a project HTTP surface without opening route files one by one. Discover API route definitions in a project. Supports Next.js (App Router and Pages ' +
    'Router), Express, Fastify, and Hono. Auto-detects the framework from package.json when ' +
    'not specified. Returns each route\'s HTTP method, URL path pattern, handler file, ' +
    'resolved absolute path, and handler line. Static text/AST-adjacent scanning; no code is ' +
    'executed.',
  inputSchema: {
    type: 'object',
    properties: {
      base_path: {
        type: 'string',
        description: 'Absolute project root. Relative paths resolve against it.',
      },
      path: {
        type: 'string',
        description: 'Directory to scan (relative to base_path or absolute). Default ".".',
      },
      framework: {
        type: 'string',
        enum: FRAMEWORK_ENUM as unknown as string[],
        description: "Framework to parse routes for; 'auto' detects from package.json (default).",
      },
      output: {
        type: 'object',
        properties: {
          max_tokens: {
            type: 'number',
            description: 'Cap the rendered response; the routes list trims to fit.',
          },
        },
      },
    },
  },
};

/** Trim `data.routes` from the end until the rendered envelope fits `maxTokens`. */
function capToTokens(env: Envelope<ApiRoutesData>, maxTokens?: number): Envelope<ApiRoutesData> {
  if (!maxTokens || maxTokens <= 0 || !env.data) {return env;}
  if (estimatePayloadTokens(renderEnvelope(env)) <= maxTokens) {return env;}

  const data = env.data;
  const trim = (): Envelope<ApiRoutesData> => ({
    ...env,
    data,
    meta: {
      ...env.meta,
      truncated: true,
      effective_caps: { ...(env.meta.effective_caps ?? {}), max_tokens: maxTokens },
    },
  });

  while (data.routes.length > 0 && estimatePayloadTokens(renderEnvelope(trim())) > maxTokens) {
    data.routes.pop();
  }
  return trim();
}

/**
 * The `api_routes` handler.
 * @param rawArgs - MCP tool arguments (validated here)
 */
export async function handler(rawArgs: unknown): Promise<CallToolResult> {
  const elapsed = startTimer();
  const args = (rawArgs ?? {}) as ApiRoutesArgs;
  const cfg = loadConfig();

  const baseDir = resolveBaseDir(args.base_path);
  const targetInput = typeof args.path === 'string' && args.path.length > 0 ? args.path : '.';
  const resolved = resolveInputPath(targetInput, args.base_path);
  const absTarget = resolved.resolved_path;

  try {
    const stat = await fs.stat(absTarget).catch(() => null);
    if (!stat) {return toCallToolResult(errorEnvelope(`Path not found: ${absTarget}`));}
    if (!stat.isDirectory()) {return toCallToolResult(errorEnvelope(`Path is not a directory: ${absTarget}`));}

    const frameworkArg = args.framework ?? 'auto';
    let framework: Framework;
    if (frameworkArg === 'auto') {
      const detected = detectFramework(absTarget);
      if (!detected) {
        return toCallToolResult(
          errorEnvelope(
            'Could not auto-detect framework. Pass framework explicitly. Supported: nextjs, express, fastify, hono.',
          ),
        );
      }
      framework = detected;
    } else {
      framework = frameworkArg;
    }

    const outcome = await withBudget(cfg.budgets.analyzer_ms, (signal: BudgetSignal) =>
      scanFrameworkRoutes(absTarget, baseDir, framework, signal),
    );
    const routes = outcome.value;
    routes.sort((a, b) => a.handler_file.localeCompare(b.handler_file) || a.handler_line - b.handler_line);

    const data: ApiRoutesData = { framework, routes, count: routes.length };

    let env = successEnvelope<ApiRoutesData>(data, {
      execution_ms: elapsed(),
      ...(outcome.budget_exceeded ? { budget_exceeded: true } : {}),
    });
    if (resolved.warning) {env = { ...env, warning: resolved.warning };}

    const maxTokens = args.output?.max_tokens ?? cfg.max_tokens_default;
    env = capToTokens(env, maxTokens);
    return toCallToolResult(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toCallToolResult(errorEnvelope(`Failed to scan API routes: ${message}`));
  }
}

/** Registration entry consumed by `src/index.ts`. */
export const apiRoutesTool: ToolDefinition = { definition, handler };
