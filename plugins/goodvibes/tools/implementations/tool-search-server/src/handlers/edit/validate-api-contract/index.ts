/**
 * Validate API Contract Module
 *
 * Validates API responses against an OpenAPI specification.
 * Supports both JSON and YAML spec formats, makes HTTP requests to the
 * running API, and validates responses against the documented schemas.
 *
 * @module handlers/edit/validate-api-contract
 */

// Re-export the main handler
export { handleValidateApiContract } from './handler.js';

// Re-export types for external use
export type {
  ValidateApiContractArgs,
  ValidateApiContractResult,
  EndpointResult,
  Violation,
  // OpenAPI types (for advanced usage)
  OpenAPISpec,
  JSONSchema,
  OperationObject,
  ParameterObject,
  PathItem,
} from './types.js';

// Re-export utilities for potential reuse
export { parseOpenAPISpec, tryLoadYaml } from './parser.js';
export { validateSchema, resolveRef, getJsonType } from './schema-validator.js';
export { makeRequest } from './http-client.js';
export {
  substitutePathParams,
  extractRequestExample,
  getResponseSchema,
  isStatusCodeDocumented,
} from './openapi-helpers.js';
