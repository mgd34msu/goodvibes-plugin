/**
 * generateOpenApi extension for the api domain.
 *
 * Orchestrates API route discovery and builds an OpenAPI 3.0.3 specification,
 * optionally writing the output to a file in JSON or YAML format.
 *
 * @module extensions/api/spec
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { PROJECT_ROOT } from '../../shared/config.js';
import { ok, fail } from '../../shared/response.js';
import type { McpResponse } from '../../shared/response.js';
import { logError, logWarn } from '../../shared/logger.js';

import type {
  OpenApiArgs,
  ApiRoute,
  ApiRoutesResult,
  OpenAPISpec,
  OpenApiPathItem,
  OpenApiOperation,
  EndpointSummary,
  MissingType,
  GenerateOpenApiResult,
} from '../../core/api/types.js';
import {
  convertRoutePathToOpenApi,
  extractPathParameters,
  generateOperationId,
  extractTag,
  generateExample,
  createDefaultRequestSchema,
  createDefaultResponseSchema,
  toYaml,
} from '../../core/api/openapi.js';
import { parseHandlerTypes } from '../../core/api/type-extraction.js';
import { getApiRoutes } from './routes.js';

/**
 * Generates an OpenAPI 3.0.3 specification from detected API routes.
 *
 * Orchestrates route discovery, type extraction, spec building, and file output.
 * Reads package.json for default title/version/description.
 *
 * @param args - Tool arguments controlling output format, path, and metadata
 * @returns MCP tool response with generation results summary
 *
 * @example
 * ```typescript
 * const result = await generateOpenApi({ format: 'yaml', output_path: 'openapi.yaml' });
 * ```
 */
export function generateOpenApi(args: OpenApiArgs): McpResponse {
  const projectPath = PROJECT_ROOT;
  const warnings: string[] = [];
  const missingTypes: MissingType[] = [];

  // Get API routes using the routes extension
  const apiRoutesResponse = getApiRoutes({ path: '.' });

  // Parse the response
  let apiRoutesResult: ApiRoutesResult;
  try {
    const responseText = apiRoutesResponse.content[0]?.text;
    if (!responseText) {
      throw new Error('No response from getApiRoutes');
    }
    apiRoutesResult = JSON.parse(responseText) as ApiRoutesResult;

    if ('error' in apiRoutesResult) {
      throw new Error((apiRoutesResult as unknown as { error: string }).error);
    }
  } catch (error) {
    return fail(
      `Failed to get API routes: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { hint: 'Ensure the project has API routes in a supported framework (Next.js, Express, Fastify, Hono)' }
    );
  }

  // Read package.json for defaults
  const packageJsonPath = path.join(projectPath, 'package.json');
  let packageJson: Record<string, unknown> = {};
  try {
    if (fs.existsSync(packageJsonPath)) {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as Record<string, unknown>;
    }
  } catch (err) {
    logWarn('[generateOpenApi] Failed to read package.json', err);
  }

  const pkgName = typeof packageJson['name'] === 'string' ? packageJson['name'] : undefined;
  const pkgVersion = typeof packageJson['version'] === 'string' ? packageJson['version'] : undefined;
  const pkgDescription = typeof packageJson['description'] === 'string' ? packageJson['description'] : undefined;

  // Build OpenAPI spec
  const spec: OpenAPISpec = {
    openapi: '3.0.3',
    info: {
      title: args.title || pkgName || 'API',
      version: args.version || pkgVersion || '1.0.0',
      ...(args.description || pkgDescription
        ? { description: args.description || pkgDescription }
        : {}),
    },
    paths: {},
    components: {
      schemas: {},
    },
    tags: [],
  };

  // Add server URL if provided
  if (args.server_url) {
    spec.servers = [{ url: args.server_url }];
  }

  // Track tags
  const tagSet = new Set<string>();

  // Build endpoints summary
  const endpoints: EndpointSummary[] = [];

  // Group routes by path
  const routesByPath: Record<string, ApiRoute[]> = {};
  for (const route of apiRoutesResult.routes) {
    const openApiPath = convertRoutePathToOpenApi(route.path);
    if (!routesByPath[openApiPath]) {
      routesByPath[openApiPath] = [];
    }
    routesByPath[openApiPath].push(route);
  }

  // Process each path
  for (const openApiPath of Object.keys(routesByPath)) {
    const routes = routesByPath[openApiPath];
    const pathItem: OpenApiPathItem = {};

    for (const route of routes) {
      const method = route.method.toLowerCase();
      const tag = extractTag(route.path);
      tagSet.add(tag);

      // Try to parse types from handler file
      const { requestSchema, responseSchema } = parseHandlerTypes(route.handler_file, projectPath);

      // Determine if we have proper schemas
      const hasRequestSchema = requestSchema !== null && Object.keys(requestSchema.properties || {}).length > 0;
      const hasResponseSchema = responseSchema !== null && Object.keys(responseSchema.properties || {}).length > 0;

      // Track missing types
      if (!hasRequestSchema && !hasResponseSchema && !['GET', 'DELETE', 'HEAD', 'OPTIONS'].includes(route.method)) {
        missingTypes.push({ route: `${route.method} ${route.path}`, missing: 'both' });
      } else if (!hasRequestSchema && !['GET', 'DELETE', 'HEAD', 'OPTIONS'].includes(route.method)) {
        missingTypes.push({ route: `${route.method} ${route.path}`, missing: 'request' });
      } else if (!hasResponseSchema) {
        missingTypes.push({ route: `${route.method} ${route.path}`, missing: 'response' });
      }

      // Build operation
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
                ...(args.include_examples !== false && {
                  example: generateExample(responseSchema || createDefaultResponseSchema()),
                }),
              },
            },
          },
          '400': {
            description: 'Bad request',
          },
          '500': {
            description: 'Internal server error',
          },
        },
      };

      // Add path parameters
      const pathParams = extractPathParameters(route.path);
      if (pathParams.length > 0) {
        operation.parameters = pathParams;
      }

      // Add request body for methods that typically have one
      const defaultRequestSchema = createDefaultRequestSchema(route.method);
      const finalRequestSchema = requestSchema || defaultRequestSchema;
      if (finalRequestSchema) {
        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: finalRequestSchema,
              ...(args.include_examples !== false && {
                example: generateExample(finalRequestSchema),
              }),
            },
          },
        };
      }

      // Add middleware as security if present
      if (route.middleware && route.middleware.length > 0) {
        const authMiddleware = route.middleware.find(m =>
          m.toLowerCase().includes('auth') ||
          m.toLowerCase().includes('protect') ||
          m.toLowerCase().includes('guard')
        );
        if (authMiddleware) {
          if (!spec.components!.securitySchemes) {
            spec.components!.securitySchemes = {};
          }
          spec.components!.securitySchemes['bearerAuth'] = {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          };
          operation.security = [{ bearerAuth: [] }];
        }
      }

      pathItem[method] = operation;

      // Track endpoint summary
      endpoints.push({
        path: openApiPath,
        method: route.method,
        has_request_schema: hasRequestSchema,
        has_response_schema: hasResponseSchema,
      });
    }

    spec.paths[openApiPath] = pathItem;
  }

  // Add tags
  spec.tags = Array.from(tagSet).sort().map(name => ({ name }));

  // Generate output
  const format = args.format || 'json';
  const outputPath = args.output_path || `openapi.${format}`;
  const fullOutputPath = path.resolve(projectPath, outputPath);

  let specContent: string;
  if (format === 'yaml') {
    try {
      specContent = toYaml(spec);
    } catch (yamlError) {
      warnings.push(`YAML conversion warning: ${yamlError instanceof Error ? yamlError.message : 'Unknown error'}. Falling back to JSON.`);
      specContent = JSON.stringify(spec, null, 2);
    }
  } else {
    specContent = JSON.stringify(spec, null, 2);
  }

  // Write to file
  try {
    fs.writeFileSync(fullOutputPath, specContent, 'utf-8');
  } catch (writeError) {
    logError('[generateOpenApi] Failed to write OpenAPI spec', writeError);
    return fail(
      `Failed to write OpenAPI spec: ${writeError instanceof Error ? writeError.message : 'Unknown error'}`,
      { output_path: fullOutputPath }
    );
  }

  // Build result
  const result: GenerateOpenApiResult = {
    success: true,
    output_path: fullOutputPath,
    spec_version: '3.0.3',
    routes_documented: endpoints.length,
    endpoints,
    missing_types: missingTypes,
    warnings,
  };

  return ok(result);
}
