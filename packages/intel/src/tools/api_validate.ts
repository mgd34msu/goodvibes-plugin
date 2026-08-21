/**
 * `api_validate`, static spec-vs-routes contract validation (R11).
 *
 * REBUILD of project-engine `extensions/api/validate.ts` + `core/api/
 * {matching,validation}.ts` (§4.1, §7 R11): the v1 tool made live HTTP
 * requests against a running server. v2 keeps it entirely static, spec vs.
 * the routes `api_routes` finds in source, because live probing needs
 * credentials, which is connect's trust model, not intel's read-only one.
 * The JSONPath-precise mismatch reporting the tribunal required is preserved
 * (see `lib/api/validate-static.ts`), now pointing at spec document
 * locations instead of live response bodies.
 *
 * v2 wrappers: `base_path`/`resolved_path` echo (issue 1), `core/proc`
 * budget, `core/envelope` accounting.
 *
 * @module tools/api_validate
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from './types.js';
import { successEnvelope, errorEnvelope, toCallToolResult, startTimer } from '@goodvibes/core/envelope';
import { resolveBaseDir, resolveInputPath } from '@goodvibes/core/fsx';
import { loadConfig } from '@goodvibes/core/config';
import { withBudget, type BudgetSignal } from '@goodvibes/core/proc';

import { detectFramework } from '../lib/api/detection.js';
import { scanFrameworkRoutes } from '../lib/api/routes.js';
import { validateRoutesAgainstSpec } from '../lib/api/validate-static.js';
import type { ApiValidateResult, Framework, OpenApiSpecForValidation, ValidationIssue } from '../lib/api/types.js';

interface ApiValidateArgs {
  base_path?: string;
  spec_path: string;
  path?: string;
  framework?: Framework | 'auto';
}

const definition: Tool = {
  name: 'api_validate',
  description:
    'Use to catch drift between a written spec and the actual routes before it ships. Validate an OpenAPI/Swagger spec against actual API routes found in source: statically, ' +
    'spec-vs-routes only (no live HTTP requests). Reports routes the spec declares but code does ' +
    'not implement (missing_route), routes code implements but the spec omits ' +
    '(undocumented_route), and path-parameter name mismatches (parameter_mismatch), each with a ' +
    'JSONPath into the spec document pinpointing the location.',
  inputSchema: {
    type: 'object',
    properties: {
      base_path: {
        type: 'string',
        description: 'Absolute project root. Relative paths resolve against it.',
      },
      spec_path: {
        type: 'string',
        description: 'Path to the OpenAPI spec file (JSON or YAML), relative to base_path or absolute.',
      },
      path: {
        type: 'string',
        description: 'Directory to scan for routes (relative to base_path or absolute). Default ".".',
      },
      framework: {
        type: 'string',
        enum: ['nextjs', 'express', 'fastify', 'hono', 'auto'],
        description: "Framework to parse routes for; 'auto' detects from package.json (default).",
      },
    },
    required: ['spec_path'],
  },
};

/**
 * The `api_validate` handler.
 * @param rawArgs - MCP tool arguments (validated here)
 */
export async function handler(rawArgs: unknown): Promise<CallToolResult> {
  const elapsed = startTimer();
  const args = (rawArgs ?? {}) as ApiValidateArgs;
  const cfg = loadConfig();

  if (typeof args.spec_path !== 'string' || args.spec_path.length === 0) {
    return toCallToolResult(errorEnvelope('spec_path is required.'));
  }

  const baseDir = resolveBaseDir(args.base_path);
  const specResolved = resolveInputPath(args.spec_path, args.base_path);
  const specAbsPath = specResolved.resolved_path;

  const targetInput = typeof args.path === 'string' && args.path.length > 0 ? args.path : '.';
  const targetResolved = resolveInputPath(targetInput, args.base_path);
  const absTarget = targetResolved.resolved_path;

  try {
    const specStat = await fs.stat(specAbsPath).catch(() => null);
    if (!specStat || !specStat.isFile()) {
      return toCallToolResult(errorEnvelope(`Spec file not found: ${specAbsPath}`));
    }
    const targetStat = await fs.stat(absTarget).catch(() => null);
    if (!targetStat || !targetStat.isDirectory()) {
      return toCallToolResult(errorEnvelope(`Path is not a directory: ${absTarget}`));
    }

    let spec: OpenApiSpecForValidation;
    try {
      const content = await fs.readFile(specAbsPath, 'utf-8');
      const ext = path.extname(specAbsPath).toLowerCase();
      if (ext === '.yaml' || ext === '.yml') {
        spec = yaml.load(content) as OpenApiSpecForValidation;
      } else if (ext === '.json') {
        spec = JSON.parse(content) as OpenApiSpecForValidation;
      } else {
        return toCallToolResult(errorEnvelope(`Unsupported spec file format: ${ext}. Use .json, .yaml, or .yml.`));
      }
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : String(parseError);
      return toCallToolResult(errorEnvelope(`Failed to parse spec file: ${message}`));
    }
    if (!spec || typeof spec !== 'object' || !spec.paths || typeof spec.paths !== 'object') {
      return toCallToolResult(errorEnvelope('Spec file has no "paths" object; not a valid OpenAPI/Swagger document.'));
    }

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

    const issues: ValidationIssue[] = validateRoutesAgainstSpec(routes, spec);
    const specEndpointsCount = Object.values(spec.paths).reduce((sum, item) => {
      const rec = item as unknown as Record<string, unknown>;
      return sum + ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].filter((m) => rec[m]).length;
    }, 0);

    const byType: Record<string, number> = {};
    for (const issue of issues) {byType[issue.type] = (byType[issue.type] ?? 0) + 1;}

    const data: ApiValidateResult = {
      valid: issues.length === 0,
      framework,
      spec_resolved_path: specAbsPath,
      routes_count: routes.length,
      spec_endpoints_count: specEndpointsCount,
      issues,
      summary: { by_type: byType },
    };

    let env = successEnvelope<ApiValidateResult>(data, {
      execution_ms: elapsed(),
      ...(outcome.budget_exceeded ? { budget_exceeded: true } : {}),
    });
    if (targetResolved.warning) {env = { ...env, warning: targetResolved.warning };}
    return toCallToolResult(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toCallToolResult(errorEnvelope(`Failed to validate API contract: ${message}`));
  }
}

/** Registration entry consumed by `src/index.ts`. */
export const apiValidateTool: ToolDefinition = { definition, handler };
