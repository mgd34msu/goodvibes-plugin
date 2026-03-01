/**
 * Barrel export for the api core domain (L1).
 *
 * Re-exports types, constants, and utility functions from the api domain.
 * Exports are grouped by source module to make the origin of each symbol clear.
 *
 * @module core/api
 */

// Types — routes
export type { Framework, ApiRoutesArgs, ApiRoute, ApiRoutesResult } from './types.js';

// Types — OpenAPI spec generation
export type {
  OpenApiArgs,
  JSONSchema,
  OpenAPISpec,
  OpenApiPathItem,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiRequestBody,
  OpenApiResponse,
  OpenApiSecurityScheme,
  EndpointSummary,
  MissingType,
  GenerateOpenApiResult,
} from './types.js';

// Types — contract validation
export type {
  ApiContractArgs,
  OpenApiSpecForValidation,
  ValidationPathItem,
  ValidationOperation,
  ValidationParameter,
  ValidationRequestBody,
  ValidationResponse,
  SchemaObject,
  ValidationIssue,
  ValidationResult,
} from './types.js';

// Types — API sync
export type {
  SyncApiTypesArgs,
  BackendRoute,
  FrontendCall,
  TypeDrift,
  SyncSummary,
  SyncApiTypesResult,
} from './types.js';

// Constants
export { BACKEND_PATHS } from './constants.js';

// Framework detection
export { FRAMEWORK_DETECTION_PRIORITY, detectFramework } from './detection.js';

// OpenAPI spec utilities
export {
  convertRoutePathToOpenApi,
  extractPathParameters,
  generateOperationId,
  extractTag,
  typeToJsonSchema,
  generateExample,
  createDefaultRequestSchema,
  createDefaultResponseSchema,
  resolvePathParams,
  toYaml,
} from './openapi.js';

// HTTP client
export type { HttpResponse } from './http.js';
export { makeRequest } from './http.js';

// Contract validation
export { validateSchema } from './validation.js';

// Type extraction
export {
  parseHandlerTypes,
  parseInterfaceToSchema,
  extractTypeText,
  compareTypes,
  normalizeType,
  extractTypesFromHandler,
} from './type-extraction.js';

// Route matching
export { normalizeEndpoint, matchEndpoint, generateFixSuggestion } from './matching.js';

// Route parsers
export { parseNextJsRoutes, parseNextJsAppRouter, parseNextJsPagesRouter, extractNextJsRoutePath, extractNextJsPagesRoutePath, detectPagesRouterMethods } from './parsers/nextjs.js';
export { parseExpressRoutes, parseExpressFileRoutes, extractExpressMiddleware } from './parsers/express.js';
export { parseFastifyRoutes, parseFastifyFileRoutes } from './parsers/fastify.js';
export { parseHonoRoutes, parseHonoFileRoutes } from './parsers/hono.js';

// Shared parser utilities
export { findFilesSync, getLineNumber } from './parsers/utils.js';
