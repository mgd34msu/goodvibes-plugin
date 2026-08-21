/**
 * Domain types for `api_routes` / `api_spec` / `api_validate`.
 *
 * Trimmed from v1 project-engine `core/api/types.ts` to the shapes v2 actually
 * uses: `project_api_sync` retired (writes code; §4.1 port map), and
 * `api_validate` dropped every live-probe field (`base_url`, `timeout`,
 * `auth_header`, network-error issue types) per R11, static spec-vs-routes
 * only, no HTTP.
 *
 * @module lib/api/types
 */

/** Supported web framework types for route parsing. */
export type Framework = 'nextjs' | 'express' | 'fastify' | 'hono';

/**
 * A single API route definition extracted from source code. Issue 1 fix #3:
 * every per-file result echoes an absolute `resolved_path` alongside the
 * base_path-relative `handler_file`.
 */
export interface ApiRoute {
  /** HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS, ALL). */
  method: string;
  /** URL path pattern (e.g. '/api/users/[id]'), framework-native syntax. */
  path: string;
  /** Handler file path relative to base_path. */
  handler_file: string;
  /** Absolute resolved path of the handler file (issue 1 fix #3). */
  resolved_path: string;
  /** Line number where the route handler is defined. */
  handler_line: number;
  /** Middleware function names applied to this route, when detected. */
  middleware?: string[];
}

/** Result of API route scanning for one framework. */
export interface ApiRoutesResult {
  /** Framework that was used for parsing. */
  framework: Framework;
  /** Discovered API route definitions. */
  routes: ApiRoute[];
  /** Total number of routes discovered. */
  count: number;
}

// =============================================================================
// OpenAPI spec types (api_spec)
// =============================================================================

/** JSON Schema definition (subset actually used for OpenAPI generation). */
export interface SchemaObject {
  type?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  required?: string[];
  enum?: unknown[];
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  $ref?: string;
  example?: unknown;
  default?: unknown;
  description?: string;
  nullable?: boolean;
  oneOf?: SchemaObject[];
  additionalProperties?: boolean | SchemaObject;
  [key: string]: unknown;
}

export type JSONSchema = SchemaObject;

/** OpenAPI 3.0.3 specification structure (the subset `api_spec` generates). */
export interface OpenAPISpec {
  openapi: '3.0.3';
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, OpenApiPathItem>;
  components?: {
    schemas?: Record<string, JSONSchema>;
    securitySchemes?: Record<string, OpenApiSecurityScheme>;
  };
  tags?: Array<{ name: string; description?: string }>;
}

export interface OpenApiPathItem {
  [method: string]: OpenApiOperation | undefined;
}

export interface OpenApiOperation {
  summary?: string;
  description?: string;
  operationId: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
  security?: Array<Record<string, string[]>>;
}

export interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema: JSONSchema;
}

export interface OpenApiRequestBody {
  description?: string;
  required?: boolean;
  content: {
    'application/json': {
      schema: JSONSchema;
      example?: unknown;
    };
  };
}

export interface OpenApiResponse {
  description: string;
  content?: {
    'application/json': {
      schema: JSONSchema;
      example?: unknown;
    };
  };
}

export interface OpenApiSecurityScheme {
  type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect';
  scheme?: string;
  bearerFormat?: string;
  name?: string;
  in?: 'header' | 'query' | 'cookie';
}

/** Endpoint summary for the api_spec result. */
export interface EndpointSummary {
  path: string;
  method: string;
  has_request_schema: boolean;
  has_response_schema: boolean;
}

/** Missing type information for the api_spec result. */
export interface MissingType {
  route: string;
  missing: 'request' | 'response' | 'both';
}

/** Result of static OpenAPI spec generation (never written to disk, read-only). */
export interface GenerateOpenApiResult {
  spec: OpenAPISpec;
  spec_version: string;
  yaml?: string;
  routes_documented: number;
  endpoints: EndpointSummary[];
  missing_types: MissingType[];
  warnings: string[];
}

// =============================================================================
// api_validate types, STATIC spec-vs-routes only (R11)
// =============================================================================

export type ValidationIssueType = 'missing_route' | 'undocumented_route' | 'parameter_mismatch';

/** One static mismatch between the spec and the parsed routes. */
export interface ValidationIssue {
  /** Canonical path (OpenAPI `{param}` syntax) the issue is about. */
  path: string;
  /** HTTP method, uppercased. */
  method: string;
  type: ValidationIssueType;
  message: string;
  /** JSONPath into the spec document pinpointing the mismatch (tribunal requirement). */
  json_path: string;
  expected?: unknown;
  actual?: unknown;
}

export interface ApiValidateResult {
  valid: boolean;
  framework: Framework;
  spec_resolved_path: string;
  routes_count: number;
  spec_endpoints_count: number;
  issues: ValidationIssue[];
  summary: {
    by_type: Record<string, number>;
  };
}

/** Simplified OpenAPI/Swagger spec shape used for validation matching. */
export interface OpenApiSpecForValidation {
  openapi?: string;
  swagger?: string;
  paths: Record<string, ValidationPathItem>;
  components?: {
    schemas?: Record<string, SchemaObject>;
  };
}

export interface ValidationPathItem {
  get?: ValidationOperation;
  post?: ValidationOperation;
  put?: ValidationOperation;
  patch?: ValidationOperation;
  delete?: ValidationOperation;
  options?: ValidationOperation;
  head?: ValidationOperation;
}

export interface ValidationOperation {
  summary?: string;
  description?: string;
  parameters?: ValidationParameter[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
}

export interface ValidationParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema?: SchemaObject;
  example?: unknown;
}
