/**
 * validateApiContract extension for the api domain.
 *
 * Validates API responses against OpenAPI/Swagger specifications by making
 * live HTTP requests to each endpoint and verifying response status codes
 * and body schemas match the spec.
 *
 * @module extensions/api/validate
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

import { PROJECT_ROOT } from '../../shared/config.js';
import { createSuccessResponse, createErrorResponse } from '../../shared/response.js';
import type { ToolResponse } from '../../shared/response.js';
import { fileExists } from '../../shared/utils.js';
import { logError } from '../../shared/logger.js';

import type {
  ApiContractArgs,
  OpenApiSpecForValidation,
  ValidationParameter,
  ValidationIssue,
  ValidationResult,
} from '../../core/api/types.js';
import { validateSchema } from '../../core/api/validation.js';
import { makeRequest } from '../../core/api/http.js';
import { resolvePathParams } from '../../core/api/openapi.js';

/**
 * Build a query string from an array of query parameters.
 *
 * @param params - Array of parameter definitions
 * @returns URL query string starting with '?', or empty string if no query params
 */
function buildQueryString(params: ValidationParameter[]): string {
  const queryParams = params.filter(p => p.in === 'query');
  if (queryParams.length === 0) return '';

  const parts = queryParams.map(p => {
    const value = p.example || 'test';
    return `${encodeURIComponent(p.name)}=${encodeURIComponent(String(value))}`;
  });

  return '?' + parts.join('&');
}

/**
 * Validates API responses against an OpenAPI/Swagger specification.
 *
 * Loads and parses the spec file, then makes HTTP requests to each endpoint
 * and verifies response status codes and body schemas match the spec.
 *
 * @param args - Tool arguments specifying spec path, base URL, and options
 * @returns MCP tool response with validation results
 *
 * @example
 * ```typescript
 * const result = await validateApiContract({
 *   spec_path: 'openapi.yaml',
 *   base_url: 'http://localhost:3000',
 * });
 * ```
 */
export async function validateApiContract(args: ApiContractArgs): Promise<ToolResponse> {
  const specPath = path.resolve(PROJECT_ROOT, args.spec_path);
  const baseUrl = args.base_url.replace(/\/$/, ''); // Remove trailing slash
  const timeout = args.timeout || 10000;
  const includeExamples = args.include_examples !== false;

  // Check if spec file exists
  if (!(await fileExists(specPath))) {
    return createSuccessResponse({
      valid: false,
      error: `Spec file not found: ${specPath}`,
    });
  }

  // Load and parse spec
  let spec: OpenApiSpecForValidation;
  try {
    const content = fs.readFileSync(specPath, 'utf-8');
    const ext = path.extname(specPath).toLowerCase();

    if (ext === '.yaml' || ext === '.yml') {
      spec = yaml.load(content) as OpenApiSpecForValidation;
    } else if (ext === '.json') {
      spec = JSON.parse(content) as OpenApiSpecForValidation;
    } else {
      return createSuccessResponse({
        valid: false,
        error: `Unsupported spec file format: ${ext}. Use .json, .yaml, or .yml`,
      });
    }
  } catch (err) {
    logError('[validateApiContract] Failed to parse spec file', err);
    return createSuccessResponse({
      valid: false,
      error: `Failed to parse spec file: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // Filter endpoints if specified
  const endpointsToTest = args.endpoints
    ? Object.entries(spec.paths).filter(([p]) => args.endpoints!.includes(p))
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
        const response = await makeRequest(method.toUpperCase(), url, requestBody, headers, timeout);

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
            const responseBody = JSON.parse(response.body) as unknown;
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
          } catch {
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
