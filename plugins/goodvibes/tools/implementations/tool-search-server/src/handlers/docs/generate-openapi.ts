/**
 * Generate OpenAPI Specification Handler
 *
 * Generates OpenAPI 3.0.3 specifications from API routes detected in the project.
 * Supports Next.js, Express, Fastify, and Hono frameworks.
 *
 * @module handlers/docs/generate-openapi
 */

import * as fs from 'fs';
import * as path from 'path';

import { ToolResponse } from '../../types.js';
import { PROJECT_ROOT } from '../../config.js';
import { handleGetApiRoutes, ApiRoute, ApiRoutesResult } from '../schema/api-routes.js';

// ============================================================================
// Types
// ============================================================================

/** Arguments for generate_openapi tool */
export interface GenerateOpenApiArgs {
  /** Output file path (default: "openapi.json") */
  output_path?: string;
  /** API title (default: from package.json name) */
  title?: string;
  /** API version (default: from package.json version) */
  version?: string;
  /** API description */
  description?: string;
  /** Base server URL */
  server_url?: string;
  /** Generate examples from types (default: true) */
  include_examples?: boolean;
  /** Output format (default: "json") */
  format?: 'json' | 'yaml';
}

/** JSON Schema definition */
interface JSONSchema {
  type?: string;
  format?: string;
  items?: JSONSchema;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  $ref?: string;
  description?: string;
  enum?: (string | number)[];
  default?: unknown;
  example?: unknown;
  additionalProperties?: boolean | JSONSchema;
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  nullable?: boolean;
}

/** OpenAPI 3.0.3 specification structure */
interface OpenAPISpec {
  openapi: '3.0.3';
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, JSONSchema>;
    securitySchemes?: Record<string, SecurityScheme>;
  };
  tags?: Array<{ name: string; description?: string }>;
}

/** Path item in OpenAPI spec */
interface PathItem {
  [method: string]: Operation | undefined;
}

/** Operation object in OpenAPI spec */
interface Operation {
  summary?: string;
  description?: string;
  operationId: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, Response>;
  security?: Array<Record<string, string[]>>;
}

/** Parameter in OpenAPI spec */
interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema: JSONSchema;
}

/** Request body in OpenAPI spec */
interface RequestBody {
  description?: string;
  required?: boolean;
  content: {
    'application/json': {
      schema: JSONSchema;
      example?: unknown;
    };
  };
}

/** Response in OpenAPI spec */
interface Response {
  description: string;
  content?: {
    'application/json': {
      schema: JSONSchema;
      example?: unknown;
    };
  };
}

/** Security scheme definition */
interface SecurityScheme {
  type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect';
  scheme?: string;
  bearerFormat?: string;
  name?: string;
  in?: 'header' | 'query' | 'cookie';
}

/** Endpoint summary for result */
interface EndpointSummary {
  path: string;
  method: string;
  has_request_schema: boolean;
  has_response_schema: boolean;
}

/** Missing type information */
interface MissingType {
  route: string;
  missing: 'request' | 'response' | 'both';
}

/** Result of OpenAPI generation */
interface GenerateOpenApiResult {
  success: boolean;
  output_path: string;
  spec_version: string;
  routes_documented: number;
  endpoints: EndpointSummary[];
  missing_types: MissingType[];
  warnings: string[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Read package.json to get default title and version
 */
function readPackageJson(projectPath: string): { name?: string; version?: string; description?: string } {
  const packageJsonPath = path.join(projectPath, 'package.json');
  try {
    if (fs.existsSync(packageJsonPath)) {
      const content = fs.readFileSync(packageJsonPath, 'utf-8');
      return JSON.parse(content) as { name?: string; version?: string; description?: string };
    }
  } catch {
    // Ignore errors, return empty object
  }
  return {};
}

/**
 * Convert Next.js/Express route patterns to OpenAPI path format
 * - /api/users/[id] -> /api/users/{id}
 * - /api/posts/:postId -> /api/posts/{postId}
 */
function convertRoutePathToOpenApi(routePath: string): string {
  return routePath
    // Convert Next.js dynamic segments: [id] -> {id}
    .replace(/\[([^\]]+)\]/g, '{$1}')
    // Convert Express-style params: :id -> {id}
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
}

/**
 * Extract path parameters from route path
 */
function extractPathParameters(routePath: string): Parameter[] {
  const params: Parameter[] = [];

  // Match Next.js style: [id], [slug], etc.
  const nextjsPattern = /\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = nextjsPattern.exec(routePath)) !== null) {
    params.push({
      name: match[1],
      in: 'path',
      required: true,
      description: `Path parameter: ${match[1]}`,
      schema: { type: 'string' },
    });
  }

  // Match Express style: :id, :postId, etc.
  const expressPattern = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  while ((match = expressPattern.exec(routePath)) !== null) {
    // Avoid duplicates
    if (!params.find(p => p.name === match![1])) {
      params.push({
        name: match[1],
        in: 'path',
        required: true,
        description: `Path parameter: ${match[1]}`,
        schema: { type: 'string' },
      });
    }
  }

  return params;
}

/**
 * Generate an operation ID from method and path
 */
function generateOperationId(method: string, routePath: string): string {
  // Remove /api prefix if present
  let cleanPath = routePath.replace(/^\/api\/?/, '');

  // Convert path segments to camelCase
  const segments = cleanPath
    .split('/')
    .filter(Boolean)
    .map(segment => {
      // Handle dynamic segments
      const match = segment.match(/\[([^\]]+)\]|:([a-zA-Z_][a-zA-Z0-9_]*)|{([^}]+)}/);
      if (match) {
        const paramName = match[1] || match[2] || match[3];
        return `By${paramName.charAt(0).toUpperCase()}${paramName.slice(1)}`;
      }
      return segment;
    });

  // Build operation ID
  const methodPrefix = method.toLowerCase();
  const pathPart = segments
    .map((seg, idx) => idx === 0 ? seg : seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('');

  return pathPart ? `${methodPrefix}${pathPart.charAt(0).toUpperCase()}${pathPart.slice(1)}` : methodPrefix;
}

/**
 * Extract tag from route path (first segment after /api)
 */
function extractTag(routePath: string): string {
  const match = routePath.match(/^\/api\/([^/\[{]+)/);
  if (match) {
    return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  }
  return 'Default';
}

/**
 * Convert a TypeScript type string to JSON Schema
 */
function typeToJsonSchema(typeStr: string): JSONSchema {
  const trimmed = typeStr.trim();

  // Handle primitive types
  if (trimmed === 'string') return { type: 'string' };
  if (trimmed === 'number') return { type: 'number' };
  if (trimmed === 'boolean') return { type: 'boolean' };
  if (trimmed === 'null') return { type: 'string', nullable: true };
  if (trimmed === 'undefined') return { type: 'string' };
  if (trimmed === 'any' || trimmed === 'unknown') return { type: 'object', additionalProperties: true };
  if (trimmed === 'void') return { type: 'object' };
  if (trimmed === 'never') return { type: 'object' };

  // Handle array types: string[], Array<string>
  const arrayMatch = trimmed.match(/^(.+)\[\]$/) || trimmed.match(/^Array<(.+)>$/);
  if (arrayMatch) {
    return {
      type: 'array',
      items: typeToJsonSchema(arrayMatch[1]),
    };
  }

  // Handle Record type: Record<string, number>
  const recordMatch = trimmed.match(/^Record<(.+),\s*(.+)>$/);
  if (recordMatch) {
    return {
      type: 'object',
      additionalProperties: typeToJsonSchema(recordMatch[2]),
    };
  }

  // Handle union types: string | number
  if (trimmed.includes(' | ')) {
    const parts = trimmed.split(' | ').map(p => p.trim());
    // Check if it's a nullable type
    const nonNullParts = parts.filter(p => p !== 'null' && p !== 'undefined');
    const isNullable = parts.length > nonNullParts.length;

    if (nonNullParts.length === 1) {
      const schema = typeToJsonSchema(nonNullParts[0]);
      if (isNullable) {
        schema.nullable = true;
      }
      return schema;
    }

    return {
      oneOf: nonNullParts.map(p => typeToJsonSchema(p)),
      ...(isNullable && { nullable: true }),
    };
  }

  // Handle literal types: "active" | "inactive"
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const value = trimmed.slice(1, -1);
    return { type: 'string', enum: [value] };
  }

  // Handle Date type
  if (trimmed === 'Date') {
    return { type: 'string', format: 'date-time' };
  }

  // Default: reference to a schema component
  return { $ref: `#/components/schemas/${trimmed}` };
}

/**
 * Generate example value from JSON Schema
 */
function generateExample(schema: JSONSchema): unknown {
  if (schema.$ref) {
    return { '...': 'Reference object' };
  }

  if (schema.example !== undefined) {
    return schema.example;
  }

  if (schema.default !== undefined) {
    return schema.default;
  }

  if (schema.enum && schema.enum.length > 0) {
    return schema.enum[0];
  }

  switch (schema.type) {
    case 'string':
      if (schema.format === 'date-time') return '2024-01-15T10:30:00Z';
      if (schema.format === 'date') return '2024-01-15';
      if (schema.format === 'email') return 'user@example.com';
      if (schema.format === 'uri') return 'https://example.com';
      if (schema.format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
      return 'string';
    case 'number':
    case 'integer':
      return 123;
    case 'boolean':
      return true;
    case 'array':
      if (schema.items) {
        return [generateExample(schema.items)];
      }
      return [];
    case 'object':
      if (schema.properties) {
        const obj: Record<string, unknown> = {};
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          obj[key] = generateExample(propSchema);
        }
        return obj;
      }
      return {};
    default:
      return null;
  }
}

/**
 * Create default request schema based on HTTP method
 */
function createDefaultRequestSchema(method: string): JSONSchema | null {
  // GET, DELETE, HEAD typically don't have request bodies
  if (['GET', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) {
    return null;
  }

  // POST, PUT, PATCH typically do
  return {
    type: 'object',
    properties: {},
    additionalProperties: true,
    description: 'Request body (schema not detected)',
  };
}

/**
 * Create default response schema
 */
function createDefaultResponseSchema(): JSONSchema {
  return {
    type: 'object',
    properties: {},
    additionalProperties: true,
    description: 'Response body (schema not detected)',
  };
}

/**
 * Try to parse request/response types from handler file
 */
function parseHandlerTypes(
  handlerFile: string,
  projectPath: string
): { requestSchema: JSONSchema | null; responseSchema: JSONSchema | null } {
  const filePath = path.join(projectPath, handlerFile);

  if (!fs.existsSync(filePath)) {
    return { requestSchema: null, responseSchema: null };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    let requestSchema: JSONSchema | null = null;
    let responseSchema: JSONSchema | null = null;

    // Try to find Zod schema definitions
    // Match: const createUserSchema = z.object({...})
    const zodSchemaMatch = content.match(/(?:const|let)\s+(\w+)Schema\s*=\s*z\.object\s*\(\s*\{/);
    if (zodSchemaMatch) {
      // For now, create a generic schema - full Zod parsing would require AST
      requestSchema = {
        type: 'object',
        description: `Schema: ${zodSchemaMatch[1]}`,
        additionalProperties: true,
      };
    }

    // Try to find TypeScript interface for request
    // Match: interface CreateUserRequest { ... }
    const requestInterfaceMatch = content.match(/interface\s+(\w+Request)\s*\{([^}]+)\}/);
    if (requestInterfaceMatch) {
      requestSchema = parseInterfaceToSchema(requestInterfaceMatch[2]);
      requestSchema.description = requestInterfaceMatch[1];
    }

    // Try to find TypeScript interface for response
    const responseInterfaceMatch = content.match(/interface\s+(\w+Response)\s*\{([^}]+)\}/);
    if (responseInterfaceMatch) {
      responseSchema = parseInterfaceToSchema(responseInterfaceMatch[2]);
      responseSchema.description = responseInterfaceMatch[1];
    }

    // Check for NextResponse.json() return types
    const nextResponseMatch = content.match(/return\s+(?:NextResponse\.json|Response\.json)\s*\(\s*\{([^}]+)\}/);
    if (nextResponseMatch && !responseSchema) {
      responseSchema = {
        type: 'object',
        description: 'JSON response',
        additionalProperties: true,
      };
    }

    return { requestSchema, responseSchema };
  } catch {
    return { requestSchema: null, responseSchema: null };
  }
}

/**
 * Parse a TypeScript interface body to JSON Schema
 */
function parseInterfaceToSchema(interfaceBody: string): JSONSchema {
  const properties: Record<string, JSONSchema> = {};
  const required: string[] = [];

  // Simple regex-based parsing for common patterns
  // Match: propertyName: type; or propertyName?: type;
  const propRegex = /(\w+)(\?)?:\s*([^;]+);/g;
  let match;

  while ((match = propRegex.exec(interfaceBody)) !== null) {
    const propName = match[1];
    const isOptional = match[2] === '?';
    const propType = match[3].trim();

    properties[propName] = typeToJsonSchema(propType);

    if (!isOptional) {
      required.push(propName);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 && { required }),
  };
}

/**
 * Convert spec to YAML format
 */
function toYaml(obj: unknown, indent: number = 0): string {
  const spaces = '  '.repeat(indent);

  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj === 'string') {
    // Check if string needs quoting
    if (obj.includes('\n') || obj.includes(':') || obj.includes('#') ||
        obj.startsWith(' ') || obj.endsWith(' ') || /^\d/.test(obj) ||
        obj === 'true' || obj === 'false' || obj === 'null' || obj === '') {
      return JSON.stringify(obj);
    }
    return obj;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map(item => {
      const itemStr = toYaml(item, indent + 1);
      if (typeof item === 'object' && item !== null) {
        return `\n${spaces}- ${itemStr.trim().replace(/\n/g, `\n${spaces}  `)}`;
      }
      return `\n${spaces}- ${itemStr}`;
    }).join('');
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return '{}';

    return entries.map(([key, value]) => {
      const valueStr = toYaml(value, indent + 1);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return `${spaces}${key}:\n${valueStr}`;
      }
      if (Array.isArray(value) && value.length > 0) {
        return `${spaces}${key}:${valueStr}`;
      }
      return `${spaces}${key}: ${valueStr}`;
    }).join('\n');
  }

  return String(obj);
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Handle generate_openapi tool call
 *
 * Generates an OpenAPI 3.0.3 specification from detected API routes.
 *
 * @param args - Tool arguments
 * @returns MCP tool response with generation results
 */
export function handleGenerateOpenApi(args: GenerateOpenApiArgs): ToolResponse {
  const projectPath = PROJECT_ROOT;
  const warnings: string[] = [];
  const missingTypes: MissingType[] = [];

  // Get API routes using existing handler
  const apiRoutesResponse = handleGetApiRoutes({ path: projectPath });

  // Parse the response
  let apiRoutesResult: ApiRoutesResult;
  try {
    const responseText = apiRoutesResponse.content[0]?.text;
    if (!responseText) {
      throw new Error('No response from get_api_routes');
    }
    apiRoutesResult = JSON.parse(responseText) as ApiRoutesResult;

    if ('error' in apiRoutesResult) {
      throw new Error((apiRoutesResult as unknown as { error: string }).error);
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: `Failed to get API routes: ${error instanceof Error ? error.message : 'Unknown error'}`,
          hint: 'Ensure the project has API routes in a supported framework (Next.js, Express, Fastify, Hono)',
        }, null, 2),
      }],
      isError: true,
    };
  }

  // Read package.json for defaults
  const packageJson = readPackageJson(projectPath);

  // Build OpenAPI spec
  const spec: OpenAPISpec = {
    openapi: '3.0.3',
    info: {
      title: args.title || packageJson.name || 'API',
      version: args.version || packageJson.version || '1.0.0',
      ...(args.description || packageJson.description
        ? { description: args.description || packageJson.description }
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
    const pathItem: PathItem = {};

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
      const operation: Operation = {
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
      if (requestSchema || defaultRequestSchema) {
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
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: `Failed to write OpenAPI spec: ${writeError instanceof Error ? writeError.message : 'Unknown error'}`,
          output_path: fullOutputPath,
        }, null, 2),
      }],
      isError: true,
    };
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

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(result, null, 2),
    }],
  };
}
