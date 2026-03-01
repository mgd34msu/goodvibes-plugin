/**
 * Domain types for the api domain.
 *
 * Centralizes all TypeScript interfaces and types used across the api
 * domain handlers, parsers, and extension layer.
 *
 * @module core/api/types
 */

// =============================================================================
// Routes types (from routes.ts)
// =============================================================================

/**
 * Arguments for the project_api_routes MCP tool.
 */
export interface ApiRoutesArgs {
  /** Project path relative to PROJECT_ROOT (defaults to '.') */
  path?: string;
  /** Framework to parse routes for; 'auto' detects from package.json */
  framework?: 'nextjs' | 'express' | 'fastify' | 'hono' | 'auto';
}

/**
 * Single API route definition extracted from source code.
 */
export interface ApiRoute {
  /** HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS) */
  method: string;
  /** URL path pattern (e.g., '/api/users/[id]') */
  path: string;
  /** Relative path to the handler file */
  handler_file: string;
  /** Line number where the route handler is defined */
  handler_line: number;
  /** Middleware function names applied to this route */
  middleware?: string[];
}

/**
 * Result of API route scanning operation.
 */
export interface ApiRoutesResult {
  /** Framework that was used for parsing (nextjs, express, fastify, hono) */
  framework: string;
  /** Array of discovered API route definitions */
  routes: ApiRoute[];
  /** Total number of routes discovered */
  count: number;
}

/** Supported web framework types for route parsing */
export type Framework = 'nextjs' | 'express' | 'fastify' | 'hono';

// =============================================================================
// OpenAPI spec types (from spec.ts)
// =============================================================================

/**
 * Arguments for the project_api_spec MCP tool.
 */
export interface OpenApiArgs {
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
  /** Framework to use for route detection; 'auto' detects from package.json */
  framework?: 'nextjs' | 'express' | 'fastify' | 'hono' | 'auto';
}

/** JSON Schema definition (alias for SchemaObject for backward compatibility) */
export type JSONSchema = SchemaObject;

/** OpenAPI 3.0.3 specification structure */
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

/** Path item in OpenAPI spec */
export interface OpenApiPathItem {
  [method: string]: OpenApiOperation | undefined;
}

/** Operation object in OpenAPI spec */
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

/** Parameter in OpenAPI spec */
export interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema: JSONSchema;
}

/** Request body in OpenAPI spec */
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

/** Response in OpenAPI spec */
export interface OpenApiResponse {
  description: string;
  content?: {
    'application/json': {
      schema: JSONSchema;
      example?: unknown;
    };
  };
}

/** Security scheme definition */
export interface OpenApiSecurityScheme {
  type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect';
  scheme?: string;
  bearerFormat?: string;
  name?: string;
  in?: 'header' | 'query' | 'cookie';
}

/** Endpoint summary for result */
export interface EndpointSummary {
  path: string;
  method: string;
  has_request_schema: boolean;
  has_response_schema: boolean;
}

/** Missing type information */
export interface MissingType {
  route: string;
  missing: 'request' | 'response' | 'both';
}

/** Result of OpenAPI generation */
export interface GenerateOpenApiResult {
  success: boolean;
  output_path: string;
  spec_version: string;
  routes_documented: number;
  endpoints: EndpointSummary[];
  missing_types: MissingType[];
  warnings: string[];
}

// =============================================================================
// Contract validation types (from validate.ts)
// =============================================================================

/**
 * Arguments for the project_api_validate MCP tool.
 */
export interface ApiContractArgs {
  /** Path to OpenAPI spec file (JSON or YAML) */
  spec_path: string;
  /** Base URL of running API */
  base_url: string;
  /** Optional array of specific endpoints to test (default: all) */
  endpoints?: string[];
  /** Use spec examples as request data (default: true) */
  include_examples?: boolean;
  /** Per-request timeout in ms (default: 10000) */
  timeout?: number;
  /** Authorization header value if needed */
  auth_header?: string;
}

/** OpenAPI specification structure (simplified, for validation) */
export interface OpenApiSpecForValidation {
  openapi?: string;
  swagger?: string;
  paths: Record<string, ValidationPathItem>;
  components?: {
    schemas?: Record<string, SchemaObject>;
  };
}

/** OpenAPI path item for validation */
export interface ValidationPathItem {
  get?: ValidationOperation;
  post?: ValidationOperation;
  put?: ValidationOperation;
  patch?: ValidationOperation;
  delete?: ValidationOperation;
  options?: ValidationOperation;
  head?: ValidationOperation;
}

/** OpenAPI operation for validation */
export interface ValidationOperation {
  summary?: string;
  description?: string;
  parameters?: ValidationParameter[];
  requestBody?: ValidationRequestBody;
  responses: Record<string, ValidationResponse>;
}

/** OpenAPI parameter for validation */
export interface ValidationParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema?: SchemaObject;
  example?: unknown;
}

/** OpenAPI request body for validation */
export interface ValidationRequestBody {
  content: Record<string, { schema?: SchemaObject; example?: unknown }>;
  required?: boolean;
}

/** OpenAPI response for validation */
export interface ValidationResponse {
  description: string;
  content?: Record<string, { schema?: SchemaObject; example?: unknown }>;
}

/** OpenAPI schema object (simplified) */
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
  [key: string]: unknown;
}

/** Validation issue */
export interface ValidationIssue {
  endpoint: string;
  method: string;
  type: 'status_code' | 'schema' | 'network' | 'timeout';
  message: string;
  expected?: unknown;
  actual?: unknown;
  json_path?: string;
}

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  endpoints_validated: number;
  endpoints_passed: number;
  endpoints_failed: number;
  issues: ValidationIssue[];
  summary: {
    by_type: Record<string, number>;
    by_endpoint: Record<string, number>;
  };
}

// =============================================================================
// API type sync types (from sync.ts)
// =============================================================================

/**
 * Arguments for the project_api_sync MCP tool.
 */
export interface SyncApiTypesArgs {
  /** Path to backend API routes (default: auto-detect) */
  backend_path?: string;
  /** Path to frontend source (default: "src") */
  frontend_path?: string;
  /** Regex pattern to identify API call sites (default: fetch|axios|api\.) */
  api_pattern?: string;
  /** Generate fix suggestions (default: false) */
  auto_fix?: boolean;
  /** Framework to use for route detection; 'auto' detects from package.json (default: auto) */
  framework?: 'nextjs' | 'express' | 'fastify' | 'hono' | 'auto';
}

/**
 * Backend route information.
 */
export interface BackendRoute {
  path: string;
  file: string;
  method: string;
  request_type?: string;
  response_type?: string;
}

/**
 * Frontend API call information.
 */
export interface FrontendCall {
  file: string;
  line: number;
  endpoint: string;
  method: string;
  expected_type?: string;
}

/**
 * Type drift information.
 */
export interface TypeDrift {
  endpoint: string;
  backend_file: string;
  frontend_file: string;
  frontend_line: number;
  issue: 'missing_type' | 'type_mismatch' | 'endpoint_not_found';
  backend_type?: string;
  frontend_type?: string;
  diff?: string;
  suggested_fix?: string;
}

/**
 * Summary statistics for API sync.
 */
export interface SyncSummary {
  total_endpoints: number;
  total_calls: number;
  in_sync: number;
  drifted: number;
  untyped: number;
}

/**
 * Result of API type sync analysis.
 */
export interface SyncApiTypesResult {
  in_sync: boolean;
  backend_routes: BackendRoute[];
  frontend_calls: FrontendCall[];
  drifts: TypeDrift[];
  summary: SyncSummary;
}
