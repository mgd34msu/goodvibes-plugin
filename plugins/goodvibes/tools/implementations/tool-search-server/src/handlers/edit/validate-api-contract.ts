/**
 * Validate API Contract Handler
 *
 * Validates API responses against an OpenAPI specification.
 * Supports both JSON and YAML spec formats, makes HTTP requests to the
 * running API, and validates responses against the documented schemas.
 *
 * @module handlers/edit/validate-api-contract
 */

import * as fs from 'fs/promises';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import { URL } from 'url';

import { success, error, fileExists } from '../../utils.js';

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
interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: unknown[];
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
interface OpenAPISpec {
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
interface PathItem {
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
interface OperationObject {
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
interface ParameterObject {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  schema?: JSONSchema;
  example?: unknown;
}

/**
 * Request body object from OpenAPI spec
 */
interface RequestBodyObject {
  required?: boolean;
  content?: Record<string, MediaTypeObject>;
}

/**
 * Response object from OpenAPI spec
 */
interface ResponseObject {
  description: string;
  content?: Record<string, MediaTypeObject>;
}

/**
 * Media type object from OpenAPI spec
 */
interface MediaTypeObject {
  schema?: JSONSchema;
  example?: unknown;
  examples?: Record<string, { value: unknown }>;
}

/**
 * Security requirement object
 */
type SecurityRequirement = Record<string, string[]>;

/**
 * Schema violation found during validation
 */
interface Violation {
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
interface EndpointResult {
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
interface ValidateApiContractResult {
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
 * Try to dynamically import js-yaml for YAML parsing
 */
async function tryLoadYaml(): Promise<{ load: (content: string) => unknown } | null> {
  try {
    const yaml = await import('js-yaml');
    return yaml;
  } catch {
    return null;
  }
}

/**
 * Parse OpenAPI spec from file content
 */
async function parseOpenAPISpec(content: string, filePath: string): Promise<OpenAPISpec> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.json') {
    return JSON.parse(content) as OpenAPISpec;
  }

  if (ext === '.yaml' || ext === '.yml') {
    const yaml = await tryLoadYaml();
    if (!yaml) {
      throw new Error(
        'YAML parsing requires js-yaml. Install it with: npm install js-yaml\n' +
        'Alternatively, convert your spec to JSON format.'
      );
    }
    return yaml.load(content) as OpenAPISpec;
  }

  // Try JSON first, then YAML
  try {
    return JSON.parse(content) as OpenAPISpec;
  } catch {
    const yaml = await tryLoadYaml();
    if (yaml) {
      return yaml.load(content) as OpenAPISpec;
    }
    throw new Error(
      `Unable to parse spec file. Extension "${ext}" not recognized and content is not valid JSON.`
    );
  }
}

/**
 * Resolve a $ref reference in the OpenAPI spec
 */
function resolveRef(spec: OpenAPISpec, ref: string): JSONSchema | undefined {
  // Handle local refs like "#/components/schemas/User"
  if (!ref.startsWith('#/')) {
    return undefined;
  }

  const parts = ref.slice(2).split('/');
  let current: unknown = spec;

  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current as JSONSchema | undefined;
}

/**
 * Validate data against a JSON schema
 */
function validateSchema(
  data: unknown,
  schema: JSONSchema,
  jsonPath: string,
  spec: OpenAPISpec
): Violation[] {
  const violations: Violation[] = [];

  // Handle $ref
  if (schema.$ref) {
    const resolved = resolveRef(spec, schema.$ref);
    if (!resolved) {
      violations.push({
        path: jsonPath,
        rule: '$ref',
        expected: schema.$ref,
        actual: 'unresolved',
        message: `Unable to resolve reference: ${schema.$ref}`,
      });
      return violations;
    }
    return validateSchema(data, resolved, jsonPath, spec);
  }

  // Handle nullable
  if (data === null) {
    if (schema.nullable) {
      return violations;
    }
    // In OpenAPI 3.0, nullable is explicit; in earlier versions, null might be unexpected
    if (schema.type && schema.type !== 'null') {
      violations.push({
        path: jsonPath,
        rule: 'nullable',
        expected: 'non-null',
        actual: 'null',
        message: `Expected non-null value at ${jsonPath}`,
      });
    }
    return violations;
  }

  // Handle oneOf/anyOf/allOf
  if (schema.oneOf) {
    const matches = schema.oneOf.filter(
      (s) => validateSchema(data, s, jsonPath, spec).length === 0
    );
    if (matches.length !== 1) {
      violations.push({
        path: jsonPath,
        rule: 'oneOf',
        expected: 'exactly one match',
        actual: `${matches.length} matches`,
        message: `Value at ${jsonPath} should match exactly one of the oneOf schemas`,
      });
    }
    return violations;
  }

  if (schema.anyOf) {
    const matches = schema.anyOf.filter(
      (s) => validateSchema(data, s, jsonPath, spec).length === 0
    );
    if (matches.length === 0) {
      violations.push({
        path: jsonPath,
        rule: 'anyOf',
        expected: 'at least one match',
        actual: '0 matches',
        message: `Value at ${jsonPath} should match at least one of the anyOf schemas`,
      });
    }
    return violations;
  }

  if (schema.allOf) {
    for (const subSchema of schema.allOf) {
      violations.push(...validateSchema(data, subSchema, jsonPath, spec));
    }
    return violations;
  }

  // Check type
  if (schema.type) {
    const actualType = getJsonType(data);
    if (schema.type === 'integer') {
      if (actualType !== 'number' || !Number.isInteger(data)) {
        violations.push({
          path: jsonPath,
          rule: 'type',
          expected: 'integer',
          actual: actualType,
          message: `Expected integer at ${jsonPath}, got ${actualType}`,
        });
        return violations;
      }
    } else if (actualType !== schema.type) {
      violations.push({
        path: jsonPath,
        rule: 'type',
        expected: schema.type,
        actual: actualType,
        message: `Expected ${schema.type} at ${jsonPath}, got ${actualType}`,
      });
      return violations;
    }
  }

  // Check enum
  if (schema.enum && !schema.enum.includes(data)) {
    violations.push({
      path: jsonPath,
      rule: 'enum',
      expected: schema.enum.map(String).join(' | '),
      actual: String(data),
      message: `Value at ${jsonPath} must be one of: ${schema.enum.join(', ')}`,
    });
  }

  // String validations
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      violations.push({
        path: jsonPath,
        rule: 'minLength',
        expected: `>= ${schema.minLength}`,
        actual: String(data.length),
        message: `String at ${jsonPath} is too short (min: ${schema.minLength})`,
      });
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      violations.push({
        path: jsonPath,
        rule: 'maxLength',
        expected: `<= ${schema.maxLength}`,
        actual: String(data.length),
        message: `String at ${jsonPath} is too long (max: ${schema.maxLength})`,
      });
    }
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(data)) {
        violations.push({
          path: jsonPath,
          rule: 'pattern',
          expected: schema.pattern,
          actual: data,
          message: `String at ${jsonPath} does not match pattern: ${schema.pattern}`,
        });
      }
    }
  }

  // Number validations
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      violations.push({
        path: jsonPath,
        rule: 'minimum',
        expected: `>= ${schema.minimum}`,
        actual: String(data),
        message: `Number at ${jsonPath} is below minimum (${schema.minimum})`,
      });
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      violations.push({
        path: jsonPath,
        rule: 'maximum',
        expected: `<= ${schema.maximum}`,
        actual: String(data),
        message: `Number at ${jsonPath} is above maximum (${schema.maximum})`,
      });
    }
  }

  // Object validations
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const objData = data as Record<string, unknown>;

    // Check required properties
    if (schema.required) {
      for (const prop of schema.required) {
        if (!(prop in objData)) {
          violations.push({
            path: `${jsonPath}.${prop}`,
            rule: 'required',
            expected: 'present',
            actual: 'missing',
            message: `Required property "${prop}" is missing at ${jsonPath}`,
          });
        }
      }
    }

    // Validate properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in objData) {
          violations.push(
            ...validateSchema(objData[key], propSchema, `${jsonPath}.${key}`, spec)
          );
        }
      }
    }

    // Check additionalProperties if set to false
    if (schema.additionalProperties === false && schema.properties) {
      const allowedKeys = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(objData)) {
        if (!allowedKeys.has(key)) {
          violations.push({
            path: `${jsonPath}.${key}`,
            rule: 'additionalProperties',
            expected: 'not present',
            actual: 'present',
            message: `Unexpected property "${key}" at ${jsonPath}`,
          });
        }
      }
    }
  }

  // Array validations
  if (Array.isArray(data)) {
    if (schema.items) {
      data.forEach((item, index) => {
        violations.push(
          ...validateSchema(item, schema.items!, `${jsonPath}[${index}]`, spec)
        );
      });
    }
  }

  return violations;
}

/**
 * Get JSON type name for a value
 */
function getJsonType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Make an HTTP request and return the response
 */
async function makeRequest(
  method: string,
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeout: number
): Promise<{ status: number; body: unknown; error?: string }> {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      // Prepare request body
      let bodyData: string | undefined;
      const requestHeaders: Record<string, string> = { ...headers };

      if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
        bodyData = typeof body === 'string' ? body : JSON.stringify(body);
        if (!requestHeaders['Content-Type'] && !requestHeaders['content-type']) {
          requestHeaders['Content-Type'] = 'application/json';
        }
        requestHeaders['Content-Length'] = Buffer.byteLength(bodyData).toString();
      }

      const options: http.RequestOptions = {
        method,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        headers: requestHeaders,
        timeout,
      };

      const req = client.request(options, (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf-8');

          // Parse body as JSON if possible
          let parsedBody: unknown = rawBody;
          try {
            parsedBody = JSON.parse(rawBody);
          } catch {
            // Keep as string if not valid JSON
          }

          resolve({
            status: res.statusCode || 0,
            body: parsedBody,
          });
        });
      });

      req.on('error', (err) => {
        resolve({
          status: 0,
          body: null,
          error: err.message,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          status: 0,
          body: null,
          error: 'Request timed out',
        });
      });

      // Write body and end request
      if (bodyData) {
        req.write(bodyData);
      }
      req.end();
    } catch (err) {
      resolve({
        status: 0,
        body: null,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });
}

/**
 * Substitute path parameters in a URL path
 * Replaces {paramName} with example values or defaults
 */
function substitutePathParams(
  pathTemplate: string,
  parameters: ParameterObject[] | undefined
): { path: string; substituted: boolean; missing: string[] } {
  const missing: string[] = [];
  let substituted = false;

  const result = pathTemplate.replace(/\{(\w+)\}/g, (match, paramName) => {
    const param = parameters?.find((p) => p.in === 'path' && p.name === paramName);

    if (param?.example !== undefined) {
      substituted = true;
      return String(param.example);
    }

    // Use sensible defaults based on common parameter names
    const defaults: Record<string, string> = {
      id: '1',
      userId: '1',
      user_id: '1',
      postId: '1',
      post_id: '1',
      itemId: '1',
      item_id: '1',
      slug: 'test',
      uuid: '00000000-0000-0000-0000-000000000001',
      name: 'test',
    };

    if (defaults[paramName]) {
      substituted = true;
      return defaults[paramName];
    }

    // Try schema default or integer type hint
    if (param?.schema?.type === 'integer') {
      substituted = true;
      return '1';
    }

    if (param?.schema?.type === 'string') {
      substituted = true;
      return 'test';
    }

    missing.push(paramName);
    return match; // Keep original if we can't substitute
  });

  return { path: result, substituted, missing };
}

/**
 * Extract request body example from operation
 */
function extractRequestExample(
  operation: OperationObject | undefined
): unknown | undefined {
  if (!operation?.requestBody?.content) {
    return undefined;
  }

  const content = operation.requestBody.content;
  const mediaType = content['application/json'] || Object.values(content)[0];

  if (mediaType?.example !== undefined) {
    return mediaType.example;
  }

  if (mediaType?.examples) {
    const firstExample = Object.values(mediaType.examples)[0];
    if (firstExample?.value !== undefined) {
      return firstExample.value;
    }
  }

  return undefined;
}

/**
 * Get the response schema for a given status code
 */
function getResponseSchema(
  operation: OperationObject,
  statusCode: number
): JSONSchema | undefined {
  // Try exact match first
  const exactResponse = operation.responses[String(statusCode)];
  if (exactResponse?.content) {
    const mediaType =
      exactResponse.content['application/json'] ||
      Object.values(exactResponse.content)[0];
    return mediaType?.schema;
  }

  // Try wildcard matches (2XX, 4XX, etc.)
  const wildcardKey = `${Math.floor(statusCode / 100)}XX`;
  const wildcardResponse = operation.responses[wildcardKey];
  if (wildcardResponse?.content) {
    const mediaType =
      wildcardResponse.content['application/json'] ||
      Object.values(wildcardResponse.content)[0];
    return mediaType?.schema;
  }

  // Try default response
  const defaultResponse = operation.responses['default'];
  if (defaultResponse?.content) {
    const mediaType =
      defaultResponse.content['application/json'] ||
      Object.values(defaultResponse.content)[0];
    return mediaType?.schema;
  }

  return undefined;
}

/**
 * Check if an HTTP status code is documented in the operation
 */
function isStatusCodeDocumented(
  operation: OperationObject,
  statusCode: number
): boolean {
  const statusStr = String(statusCode);
  const wildcardKey = `${Math.floor(statusCode / 100)}XX`;

  return (
    statusStr in operation.responses ||
    wildcardKey in operation.responses ||
    'default' in operation.responses
  );
}

/**
 * Handles the validate_api_contract MCP tool call.
 *
 * Validates API responses against an OpenAPI specification by:
 * 1. Parsing the OpenAPI spec (JSON or YAML)
 * 2. Making HTTP requests to the running API
 * 3. Validating responses against documented schemas
 *
 * @param args - The validate_api_contract tool arguments
 * @returns MCP tool response with validation results
 */
export async function handleValidateApiContract(
  args: ValidateApiContractArgs
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const {
    spec_path,
    base_url,
    endpoints,
    include_examples = true,
    timeout = 10000,
    auth_header,
  } = args;

  // Validate required arguments
  if (!spec_path) {
    return error('spec_path is required');
  }
  if (!base_url) {
    return error('base_url is required');
  }

  // Check if spec file exists
  const resolvedSpecPath = path.isAbsolute(spec_path)
    ? spec_path
    : path.resolve(process.cwd(), spec_path);

  if (!(await fileExists(resolvedSpecPath))) {
    return error(`OpenAPI spec file not found: ${resolvedSpecPath}`);
  }

  // Read and parse the spec
  let spec: OpenAPISpec;
  try {
    const content = await fs.readFile(resolvedSpecPath, 'utf-8');
    spec = await parseOpenAPISpec(content, resolvedSpecPath);
  } catch (err) {
    return error(
      `Failed to parse OpenAPI spec: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }

  // Validate spec has required fields
  if (!spec.info || !spec.paths) {
    return error('Invalid OpenAPI spec: missing info or paths');
  }

  // Build list of endpoints to test
  const allEndpoints: Array<{
    path: string;
    method: string;
    operation: OperationObject;
    parameters?: ParameterObject[];
  }> = [];

  for (const [pathStr, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem) continue;

    const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;
    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;

      // Filter if specific endpoints requested
      if (endpoints && endpoints.length > 0) {
        const shouldInclude = endpoints.some(
          (ep) =>
            pathStr.includes(ep) ||
            ep.includes(pathStr) ||
            operation.operationId === ep
        );
        if (!shouldInclude) continue;
      }

      allEndpoints.push({
        path: pathStr,
        method: method.toUpperCase(),
        operation,
        parameters: [...(pathItem.parameters || []), ...(operation.parameters || [])],
      });
    }
  }

  // Test each endpoint
  const results: EndpointResult[] = [];

  for (const endpoint of allEndpoints) {
    const { path: pathTemplate, method, operation, parameters } = endpoint;

    // Substitute path parameters
    const { path: substitutedPath, missing } = substitutePathParams(
      pathTemplate,
      parameters
    );

    // Skip if we couldn't substitute required path params
    if (missing.length > 0) {
      results.push({
        endpoint: pathTemplate,
        method,
        tested: false,
        skip_reason: `Missing path parameter examples: ${missing.join(', ')}`,
        valid: false,
        violations: [],
      });
      continue;
    }

    // Build full URL
    const fullUrl = base_url.replace(/\/+$/, '') + substitutedPath;

    // Get request body if applicable
    let requestBody: unknown;
    if (include_examples && ['POST', 'PUT', 'PATCH'].includes(method)) {
      requestBody = extractRequestExample(operation);
    }

    // Build headers
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (auth_header) {
      headers['Authorization'] = auth_header;
    }

    // Make the request
    const response = await makeRequest(
      method,
      fullUrl,
      requestBody,
      headers,
      timeout
    );

    // Check for request errors
    if (response.error) {
      results.push({
        endpoint: pathTemplate,
        method,
        tested: false,
        skip_reason: `Request failed: ${response.error}`,
        request: {
          url: fullUrl,
          body: requestBody,
        },
        valid: false,
        violations: [],
      });
      continue;
    }

    // Validate the response
    const violations: Violation[] = [];

    // Check if status code is documented
    if (!isStatusCodeDocumented(operation, response.status)) {
      violations.push({
        path: '$',
        rule: 'status_code',
        expected: Object.keys(operation.responses).join(' | '),
        actual: String(response.status),
        message: `Undocumented status code: ${response.status}`,
      });
    }

    // Validate response body against schema
    const responseSchema = getResponseSchema(operation, response.status);
    if (responseSchema && response.body !== null && response.body !== undefined) {
      violations.push(...validateSchema(response.body, responseSchema, '$', spec));
    }

    results.push({
      endpoint: pathTemplate,
      method,
      tested: true,
      request: {
        url: fullUrl,
        body: requestBody,
      },
      response: {
        status: response.status,
        body: response.body,
      },
      valid: violations.length === 0,
      violations,
    });
  }

  // Calculate summary
  const tested = results.filter((r) => r.tested).length;
  const valid = results.filter((r) => r.tested && r.valid).length;
  const invalid = results.filter((r) => r.tested && !r.valid).length;
  const skipped = results.filter((r) => !r.tested).length;

  const result: ValidateApiContractResult = {
    valid: invalid === 0 && tested > 0,
    spec_info: {
      title: spec.info.title,
      version: spec.info.version,
      endpoints_count: allEndpoints.length,
    },
    results,
    summary: {
      total: allEndpoints.length,
      tested,
      valid,
      invalid,
      skipped,
    },
  };

  return success(result);
}
