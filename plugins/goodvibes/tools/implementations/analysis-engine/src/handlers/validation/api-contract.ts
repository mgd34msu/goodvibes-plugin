/**
 * API Contract Validation Handler
 *
 * Validates API responses against OpenAPI/Swagger specifications.
 * Makes requests to each endpoint and verifies response status codes
 * and body schemas match the spec.
 *
 * @module handlers/validation/api-contract
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

import { createSuccessResponse, type ToolResponse } from '../response-utils.js';
import { PROJECT_ROOT } from '../../config.js';
import { logError } from '../../logging.js';
import { fileExists } from '../../utils.js';
import { ValidateApiContractArgs } from './types.js';

/**
 * OpenAPI specification structure (simplified)
 */
interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, SchemaObject>;
  };
}

/**
 * OpenAPI path item
 */
interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  options?: Operation;
  head?: Operation;
}

/**
 * OpenAPI operation
 */
interface Operation {
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, Response>;
}

/**
 * OpenAPI parameter
 */
interface Parameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema?: SchemaObject;
  example?: unknown;
}

/**
 * OpenAPI request body
 */
interface RequestBody {
  content: Record<string, { schema?: SchemaObject; example?: unknown }>;
  required?: boolean;
}

/**
 * OpenAPI response
 */
interface Response {
  description: string;
  content?: Record<string, { schema?: SchemaObject; example?: unknown }>;
}

/**
 * OpenAPI schema object (simplified)
 */
interface SchemaObject {
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

/**
 * Validation issue
 */
interface ValidationIssue {
  endpoint: string;
  method: string;
  type: 'status_code' | 'schema' | 'network' | 'timeout';
  message: string;
  expected?: unknown;
  actual?: unknown;
  json_path?: string;
}

/**
 * Validation result
 */
interface ValidationResult {
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

/**
 * HTTP request helper
 */
function makeRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
  timeout: number = 10000
): Promise<{ statusCode: number; body: string; headers: Record<string, string | string[]> }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      method,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout,
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          body: data,
          headers: res.headers as Record<string, string | string[]>,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * Validate value against schema
 */
function validateSchema(
  value: unknown,
  schema: SchemaObject,
  spec: OpenAPISpec,
  path: string = '$'
): Array<{ path: string; message: string; expected: string; actual: string }> {
  const issues: Array<{ path: string; message: string; expected: string; actual: string }> = [];

  // Resolve $ref if present
  if (schema.$ref) {
    const refPath = schema.$ref.replace('#/components/schemas/', '');
    if (spec.components?.schemas?.[refPath]) {
      schema = spec.components.schemas[refPath];
    } else {
      issues.push({
        path,
        message: 'Referenced schema not found',
        expected: schema.$ref,
        actual: 'undefined',
      });
      return issues;
    }
  }

  // Type validation
  const actualType = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;

  if (schema.type && actualType !== schema.type) {
    // Special case: number can be integer or number
    if (!(schema.type === 'number' && actualType === 'number')) {
      issues.push({
        path,
        message: 'Type mismatch',
        expected: schema.type,
        actual: actualType,
      });
      return issues; // Don't check further if type is wrong
    }
  }

  // Enum validation
  if (schema.enum && !schema.enum.includes(value)) {
    issues.push({
      path,
      message: 'Value not in enum',
      expected: JSON.stringify(schema.enum),
      actual: JSON.stringify(value),
    });
  }

  // Pattern validation (for strings)
  if (schema.pattern && typeof value === 'string') {
    const regex = new RegExp(schema.pattern);
    if (!regex.test(value)) {
      issues.push({
        path,
        message: 'Pattern mismatch',
        expected: schema.pattern,
        actual: value,
      });
    }
  }

  // Number range validation
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push({
        path,
        message: 'Value below minimum',
        expected: `>= ${schema.minimum}`,
        actual: String(value),
      });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push({
        path,
        message: 'Value above maximum',
        expected: `<= ${schema.maximum}`,
        actual: String(value),
      });
    }
  }

  // Object validation
  if (schema.type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;

    // Check required properties
    if (schema.required) {
      for (const requiredProp of schema.required) {
        if (!(requiredProp in obj)) {
          issues.push({
            path: `${path}.${requiredProp}`,
            message: 'Required property missing',
            expected: requiredProp,
            actual: 'undefined',
          });
        }
      }
    }

    // Validate properties
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (propName in obj) {
          issues.push(...validateSchema(obj[propName], propSchema, spec, `${path}.${propName}`));
        }
      }
    }
  }

  // Array validation
  if (schema.type === 'array' && Array.isArray(value)) {
    if (schema.items) {
      value.forEach((item, index) => {
        issues.push(...validateSchema(item, schema.items!, spec, `${path}[${index}]`));
      });
    }
  }

  return issues;
}

/**
 * Resolve path parameters in URL
 */
function resolvePathParams(path: string, params: Parameter[]): string {
  let resolvedPath = path;
  for (const param of params) {
    if (param.in === 'path') {
      const value = param.example || 'test-id';
      resolvedPath = resolvedPath.replace(`{${param.name}}`, String(value));
    }
  }
  return resolvedPath;
}

/**
 * Build query string from parameters
 */
function buildQueryString(params: Parameter[]): string {
  const queryParams = params.filter(p => p.in === 'query');
  if (queryParams.length === 0) return '';

  const parts = queryParams.map(p => {
    const value = p.example || 'test';
    return `${encodeURIComponent(p.name)}=${encodeURIComponent(String(value))}`;
  });

  return '?' + parts.join('&');
}

/**
 * Handles the validate_api_contract MCP tool call.
 *
 * Validates API responses against OpenAPI/Swagger specifications.
 * Makes requests to each endpoint and verifies response status codes
 * and body schemas match the spec.
 *
 * @param args - The validate_api_contract tool arguments
 * @returns MCP tool response with validation results
 *
 * @example
 * handleValidateApiContract({
 *   spec_path: 'openapi.yaml',
 *   base_url: 'http://localhost:3000',
 * });
 * // Validates all endpoints in the spec
 *
 * @example
 * handleValidateApiContract({
 *   spec_path: 'openapi.yaml',
 *   base_url: 'http://localhost:3000',
 *   endpoints: ['/api/users', '/api/posts'],
 *   auth_header: 'Bearer token123',
 * });
 * // Validates only specified endpoints with auth
 */
export async function handleValidateApiContract(args: ValidateApiContractArgs): Promise<ToolResponse> {
  const specPath = path.resolve(PROJECT_ROOT, args.spec_path);
  const baseUrl = args.base_url.replace(/\/$/, ''); // Remove trailing slash
  const timeout = args.timeout || 10000;
  const includeExamples = args.include_examples !== false;

  // Check if spec file exists
  if (!await fileExists(specPath)) {
    return createSuccessResponse({
      valid: false,
      error: `Spec file not found: ${specPath}`,
    });
  }

  // Load and parse spec
  let spec: OpenAPISpec;
  try {
    const content = fs.readFileSync(specPath, 'utf-8');
    const ext = path.extname(specPath).toLowerCase();

    if (ext === '.yaml' || ext === '.yml') {
      spec = yaml.load(content) as OpenAPISpec;
    } else if (ext === '.json') {
      spec = JSON.parse(content) as OpenAPISpec;
    } else {
      return createSuccessResponse({
        valid: false,
        error: `Unsupported spec file format: ${ext}. Use .json, .yaml, or .yml`,
      });
    }
  } catch (err) {
    logError('[validate_api_contract] Failed to parse spec file', err);
    return createSuccessResponse({
      valid: false,
      error: `Failed to parse spec file: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // Filter endpoints if specified
  const endpointsToTest = args.endpoints
    ? Object.entries(spec.paths).filter(([path]) => args.endpoints!.includes(path))
    : Object.entries(spec.paths);

  const issues: ValidationIssue[] = [];
  let endpointsValidated = 0;
  let endpointsPassed = 0;
  let endpointsFailed = 0;

  // Prepare headers
  const headers: Record<string, string> = {};
  if (args.auth_header) {
    headers['Authorization'] = args.auth_header;
  }

  // Test each endpoint
  for (const [pathPattern, pathItem] of endpointsToTest) {
    const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;

    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;

      endpointsValidated++;

      const params = operation.parameters || [];
      const resolvedPath = resolvePathParams(pathPattern, params);
      const queryString = buildQueryString(params);
      const url = `${baseUrl}${resolvedPath}${queryString}`;

      let requestBody: string | undefined;

      // Build request body from example if POST/PUT/PATCH
      if (['post', 'put', 'patch'].includes(method) && operation.requestBody && includeExamples) {
        const content = operation.requestBody.content;
        const jsonContent = content['application/json'];
        if (jsonContent?.example) {
          requestBody = JSON.stringify(jsonContent.example);
        } else if (jsonContent?.schema) {
          // Generate minimal example from schema
          requestBody = JSON.stringify({});
        }
      }

      try {
        // Make request
        const response = await makeRequest(url, method.toUpperCase(), headers, requestBody, timeout);

        // Check if status code is in spec
        const expectedStatuses = Object.keys(operation.responses);
        const statusMatches = expectedStatuses.some(s => {
          if (s === 'default') return true;
          if (s.endsWith('XX')) {
            const prefix = s.substring(0, 1);
            return String(response.statusCode).startsWith(prefix);
          }
          return String(response.statusCode) === s;
        });

        if (!statusMatches) {
          issues.push({
            endpoint: pathPattern,
            method: method.toUpperCase(),
            type: 'status_code',
            message: 'Unexpected status code',
            expected: expectedStatuses.join(', '),
            actual: String(response.statusCode),
          });
          endpointsFailed++;
          continue;
        }

        // Validate response body
        const responseSpec = operation.responses[String(response.statusCode)] || operation.responses['default'];
        if (responseSpec?.content?.['application/json']?.schema) {
          try {
            const responseBody = JSON.parse(response.body);
            const schema = responseSpec.content['application/json'].schema!;
            const schemaIssues = validateSchema(responseBody, schema, spec);

            for (const issue of schemaIssues) {
              issues.push({
                endpoint: pathPattern,
                method: method.toUpperCase(),
                type: 'schema',
                message: issue.message,
                expected: issue.expected,
                actual: issue.actual,
                json_path: issue.path,
              });
            }

            if (schemaIssues.length > 0) {
              endpointsFailed++;
            } else {
              endpointsPassed++;
            }
          } catch (err) {
            issues.push({
              endpoint: pathPattern,
              method: method.toUpperCase(),
              type: 'schema',
              message: 'Invalid JSON response',
              expected: 'Valid JSON',
              actual: response.body.substring(0, 100),
            });
            endpointsFailed++;
          }
        } else {
          // No schema to validate, just check status code
          endpointsPassed++;
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const isTimeout = errorMessage.includes('timeout');

        issues.push({
          endpoint: pathPattern,
          method: method.toUpperCase(),
          type: isTimeout ? 'timeout' : 'network',
          message: errorMessage,
          expected: 'Successful response',
          actual: 'Error',
        });
        endpointsFailed++;
      }
    }
  }

  // Calculate summary
  const byType: Record<string, number> = {};
  const byEndpoint: Record<string, number> = {};

  for (const issue of issues) {
    byType[issue.type] = (byType[issue.type] || 0) + 1;
    const key = `${issue.method} ${issue.endpoint}`;
    byEndpoint[key] = (byEndpoint[key] || 0) + 1;
  }

  const result: ValidationResult = {
    valid: endpointsFailed === 0,
    endpoints_validated: endpointsValidated,
    endpoints_passed: endpointsPassed,
    endpoints_failed: endpointsFailed,
    issues,
    summary: {
      by_type: byType,
      by_endpoint: byEndpoint,
    },
  };

  return createSuccessResponse(result);
}
