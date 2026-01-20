/**
 * Validate API Contract Handler
 *
 * Main handler for the validate_api_contract MCP tool.
 * Validates API responses against an OpenAPI specification.
 *
 * @module handlers/edit/validate-api-contract/handler
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { success, error, fileExists } from '../../../utils.js';
import type {
  ValidateApiContractArgs,
  ValidateApiContractResult,
  OpenAPISpec,
  EndpointResult,
  EndpointEntry,
  Violation,
} from './types.js';
import { parseOpenAPISpec } from './parser.js';
import { validateSchema } from './schema-validator.js';
import { makeRequest } from './http-client.js';
import {
  substitutePathParams,
  extractRequestExample,
  getResponseSchema,
  isStatusCodeDocumented,
} from './openapi-helpers.js';

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
  const allEndpoints: EndpointEntry[] = [];

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
    // Note: We must call validateSchema even for null values so nullable validation works
    const responseSchema = getResponseSchema(operation, response.status);
    if (responseSchema && response.body !== undefined) {
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
