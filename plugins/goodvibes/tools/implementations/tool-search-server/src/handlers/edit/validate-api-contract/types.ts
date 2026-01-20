/**
 * Type definitions for API contract validation
 *
 * Contains all interfaces and types used by the validate_api_contract handler
 * including OpenAPI spec types, validation results, and configuration options.
 *
 * @module handlers/edit/validate-api-contract/types
 */

/**
 * Arguments for the validate_api_contract MCP tool
 */
export interface ValidateApiContractArgs {
  /** Path to OpenAPI spec file (JSON or YAML) */
  spec_path: string;
  /** Base URL of running API */
  base_url: string;
  /** Specific endpoints to test, or all if not specified */
  endpoints?: string[];
  /** Use spec examples as request data (default true) */
  include_examples?: boolean;
  /** Per-request timeout in ms (default 10000) */
  timeout?: number;
  /** Authorization header value if needed */
  auth_header?: string;
}

/**
 * JSON Schema type for validation
 */
export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: unknown[];
  const?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | JSONSchema;
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  $ref?: string;
  nullable?: boolean;
}

/**
 * OpenAPI specification structure (simplified)
 */
export interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, JSONSchema>;
    securitySchemes?: Record<string, unknown>;
  };
}

/**
 * Path item from OpenAPI spec
 */
export interface PathItem {
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  patch?: OperationObject;
  delete?: OperationObject;
  parameters?: ParameterObject[];
}

/**
 * Operation object from OpenAPI spec
 */
export interface OperationObject {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses: Record<string, ResponseObject>;
  security?: SecurityRequirement[];
}

/**
 * Parameter object from OpenAPI spec
 */
export interface ParameterObject {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  schema?: JSONSchema;
  example?: unknown;
}

/**
 * Request body object from OpenAPI spec
 */
export interface RequestBodyObject {
  required?: boolean;
  content?: Record<string, MediaTypeObject>;
}

/**
 * Response object from OpenAPI spec
 */
export interface ResponseObject {
  description: string;
  content?: Record<string, MediaTypeObject>;
}

/**
 * Media type object from OpenAPI spec
 */
export interface MediaTypeObject {
  schema?: JSONSchema;
  example?: unknown;
  examples?: Record<string, { value: unknown }>;
}

/**
 * Security requirement object
 */
export type SecurityRequirement = Record<string, string[]>;

/**
 * Schema violation found during validation
 */
export interface Violation {
  /** JSON path in response */
  path: string;
  /** What was violated */
  rule: string;
  /** Expected value/type */
  expected: string;
  /** Actual value/type */
  actual: string;
  /** Human-readable message */
  message: string;
}

/**
 * Result for a single endpoint test
 */
export interface EndpointResult {
  endpoint: string;
  method: string;
  tested: boolean;
  skip_reason?: string;
  request?: {
    url: string;
    body?: unknown;
  };
  response?: {
    status: number;
    body: unknown;
  };
  valid: boolean;
  violations: Violation[];
}

/**
 * Overall validation result
 */
export interface ValidateApiContractResult {
  valid: boolean;
  spec_info: {
    title: string;
    version: string;
    endpoints_count: number;
  };
  results: EndpointResult[];
  summary: {
    total: number;
    tested: number;
    valid: number;
    invalid: number;
    skipped: number;
  };
}

/**
 * HTTP response from makeRequest
 */
export interface HttpResponse {
  status: number;
  body: unknown;
  error?: string;
}

/**
 * Result of path parameter substitution
 */
export interface PathSubstitutionResult {
  path: string;
  substituted: boolean;
  missing: string[];
}

/**
 * Endpoint entry extracted from OpenAPI spec
 */
export interface EndpointEntry {
  path: string;
  method: string;
  operation: OperationObject;
  parameters?: ParameterObject[];
}
