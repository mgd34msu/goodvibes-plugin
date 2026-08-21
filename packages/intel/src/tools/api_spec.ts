/**
 * `api_spec`, generate an OpenAPI 3.0.3 spec from detected API routes.
 *
 * Ports project-engine `extensions/api/spec.ts` + `core/api/{openapi,
 * type-extraction}.ts` (§4.1). Pairs with `api_routes`, it calls the same
 * `scanFrameworkRoutes` orchestration directly (in-process; v1 self-called
 * its own `routes.ts` handler and re-parsed the JSON response, which does not
 * port). READ-ONLY: unlike v1, the generated spec is returned in the
 * response only and is never written to disk (intel's read-only posture,
 * §4.1 api_spec row, "no sync"); `format: "yaml"` returns the YAML text
 * in-memory alongside the JSON `spec` object.
 *
 * v2 wrappers: `base_path`/`resolved_path` echo (issue 1), `core/proc`
 * budget, `core/envelope` accounting.
 *
 * @module tools/api_spec
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from './types.js';
import { successEnvelope, errorEnvelope, toCallToolResult, startTimer } from '@goodvibes/core/envelope';
import { resolveBaseDir, resolveInputPath } from '@goodvibes/core/fsx';
import { loadConfig } from '@goodvibes/core/config';
import { withBudget, type BudgetSignal } from '@goodvibes/core/proc';

import { detectFramework } from '../lib/api/detection.js';
import { scanFrameworkRoutes } from '../lib/api/routes.js';
import {
  convertRoutePathToOpenApi,
  extractPathParameters,
  generateOperationId,
  extractTag,
  generateExample,
  createDefaultRequestSchema,
  createDefaultResponseSchema,
  toYaml,
} from '../lib/api/openapi.js';
import { parseHandlerTypes } from '../lib/api/type-extraction.js';
import type {
  ApiRoute,
  EndpointSummary,
  Framework,
  MissingType,
  OpenAPISpec,
  OpenApiOperation,
  OpenApiPathItem,
} from '../lib/api/types.js';

interface ApiSpecArgs {
  base_path?: string;
  path?: string;
  framework?: Framework | 'auto';
  title?: string;
  version?: string;
  description?: string;
  server_url?: string;
  include_examples?: boolean;
  format?: 'json' | 'yaml';
}

interface ApiSpecData {
  framework: Framework;
  spec: OpenAPISpec;
  spec_version: '3.0.3';
  yaml?: string;
  routes_documented: number;
  endpoints: EndpointSummary[];
  missing_types: MissingType[];
  warnings: string[];
}

const definition: Tool = {
  name: 'api_spec',
  description:
    'Use to produce a spec for consumers without writing one by hand. Generate an OpenAPI 3.0.3 specification from detected API routes (pairs with api_routes). ' +
    'Read-only: the spec is returned in the response, never written to disk. Infers request/' +
    'response schemas from Zod schemas, TypeScript *Request/*Response interfaces, and ' +
    'NextResponse.json() shapes where detectable; falls back to a generic schema and flags the ' +
    'gap in missing_types otherwise.',
  inputSchema: {
    type: 'object',
    properties: {
      base_path: {
        type: 'string',
        description: 'Absolute project root. Relative paths resolve against it.',
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
      title: { type: 'string', description: 'API title (default: package.json name).' },
      version: { type: 'string', description: 'API version (default: package.json version).' },
      description: { type: 'string', description: 'API description.' },
      server_url: { type: 'string', description: 'Base server URL.' },
      include_examples: {
        type: 'boolean',
        description: 'Generate examples from schemas (default true).',
      },
      format: {
        type: 'string',
        enum: ['json', 'yaml'],
        description: "Also render 'yaml' text in the response alongside the JSON spec object (default 'json', no extra text).",
      },
    },
  },
};

/** Build the OpenAPI spec from routes + package.json defaults. Mirrors v1 generateOpenApi. */
function buildSpec(
  routes: ApiRoute[],
  args: ApiSpecArgs,
  pkg: { name?: string; version?: string; description?: string },
  baseDir: string,
): { spec: OpenAPISpec; endpoints: EndpointSummary[]; missingTypes: MissingType[] } {
  const missingTypes: MissingType[] = [];
  const endpoints: EndpointSummary[] = [];

  const spec: OpenAPISpec = {
    openapi: '3.0.3',
    info: {
      title: args.title || pkg.name || 'API',
      version: args.version || pkg.version || '1.0.0',
      ...((args.description || pkg.description) && { description: args.description || pkg.description }),
    },
    paths: {},
    components: { schemas: {} },
    tags: [],
  };
  if (args.server_url) {spec.servers = [{ url: args.server_url }];}

  const includeExamples = args.include_examples !== false;
  const tagSet = new Set<string>();
  const routesByPath: Record<string, ApiRoute[]> = {};
  for (const route of routes) {
    const openApiPath = convertRoutePathToOpenApi(route.path);
    (routesByPath[openApiPath] ??= []).push(route);
  }

  for (const openApiPath of Object.keys(routesByPath)) {
    const pathItem: OpenApiPathItem = {};

    for (const route of routesByPath[openApiPath]) {
      const method = route.method.toLowerCase();
      const tag = extractTag(route.path);
      tagSet.add(tag);

      const { requestSchema, responseSchema } = parseHandlerTypes(path.resolve(baseDir, route.handler_file));

      const hasRequestSchema = requestSchema !== null && Object.keys(requestSchema.properties || {}).length > 0;
      const hasResponseSchema = responseSchema !== null && Object.keys(responseSchema.properties || {}).length > 0;
      const nonBodyMethods = ['GET', 'DELETE', 'HEAD', 'OPTIONS'];

      if (!hasRequestSchema && !hasResponseSchema && !nonBodyMethods.includes(route.method)) {
        missingTypes.push({ route: `${route.method} ${route.path}`, missing: 'both' });
      } else if (!hasRequestSchema && !nonBodyMethods.includes(route.method)) {
        missingTypes.push({ route: `${route.method} ${route.path}`, missing: 'request' });
      } else if (!hasResponseSchema) {
        missingTypes.push({ route: `${route.method} ${route.path}`, missing: 'response' });
      }

      const operation: OpenApiOperation = {
        operationId: generateOperationId(route.method, route.path),
        tags: [tag],
        summary: `${route.method} ${route.path}`,
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: responseSchema || createDefaultResponseSchema(),
                ...(includeExamples && { example: generateExample(responseSchema || createDefaultResponseSchema()) }),
              },
            },
          },
          '400': { description: 'Bad request' },
          '500': { description: 'Internal server error' },
        },
      };

      const pathParams = extractPathParameters(route.path);
      if (pathParams.length > 0) {operation.parameters = pathParams;}

      const defaultRequestSchema = createDefaultRequestSchema(route.method);
      const finalRequestSchema = requestSchema || defaultRequestSchema;
      if (finalRequestSchema) {
        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: finalRequestSchema,
              ...(includeExamples && { example: generateExample(finalRequestSchema) }),
            },
          },
        };
      }

      if (route.middleware && route.middleware.length > 0) {
        const authMiddleware = route.middleware.find(
          (m) => m.toLowerCase().includes('auth') || m.toLowerCase().includes('protect') || m.toLowerCase().includes('guard'),
        );
        if (authMiddleware) {
          spec.components!.securitySchemes ??= {};
          spec.components!.securitySchemes['bearerAuth'] = { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' };
          operation.security = [{ bearerAuth: [] }];
        }
      }

      pathItem[method] = operation;
      endpoints.push({ path: openApiPath, method: route.method, has_request_schema: hasRequestSchema, has_response_schema: hasResponseSchema });
    }

    spec.paths[openApiPath] = pathItem;
  }

  spec.tags = Array.from(tagSet).sort().map((name) => ({ name }));
  return { spec, endpoints, missingTypes };
}

/**
 * The `api_spec` handler.
 * @param rawArgs - MCP tool arguments (validated here)
 */
export async function handler(rawArgs: unknown): Promise<CallToolResult> {
  const elapsed = startTimer();
  const args = (rawArgs ?? {}) as ApiSpecArgs;
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

    const warnings: string[] = [];
    const outcome = await withBudget(cfg.budgets.analyzer_ms, (signal: BudgetSignal) =>
      scanFrameworkRoutes(absTarget, baseDir, framework, signal),
    );
    const routes = outcome.value;

    let pkg: { name?: string; version?: string; description?: string } = {};
    try {
      const raw = await fs.readFile(path.join(absTarget, 'package.json'), 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      pkg = {
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        version: typeof parsed.version === 'string' ? parsed.version : undefined,
        description: typeof parsed.description === 'string' ? parsed.description : undefined,
      };
    } catch {
      // No package.json (or unreadable), spec falls back to args/defaults.
    }

    const { spec, endpoints, missingTypes } = buildSpec(routes, args, pkg, baseDir);

    let yamlText: string | undefined;
    if (args.format === 'yaml') {
      try {
        yamlText = toYaml(spec);
      } catch (yamlError) {
        warnings.push(
          `YAML conversion failed: ${yamlError instanceof Error ? yamlError.message : 'Unknown error'}. Returning JSON spec only.`,
        );
      }
    }

    const data: ApiSpecData = {
      framework,
      spec,
      spec_version: '3.0.3',
      ...(yamlText !== undefined && { yaml: yamlText }),
      routes_documented: endpoints.length,
      endpoints,
      missing_types: missingTypes,
      warnings,
    };

    let env = successEnvelope<ApiSpecData>(data, {
      execution_ms: elapsed(),
      ...(outcome.budget_exceeded ? { budget_exceeded: true } : {}),
    });
    if (resolved.warning) {env = { ...env, warning: resolved.warning };}
    return toCallToolResult(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toCallToolResult(errorEnvelope(`Failed to generate API spec: ${message}`));
  }
}

/** Registration entry consumed by `src/index.ts`. */
export const apiSpecTool: ToolDefinition = { definition, handler };
