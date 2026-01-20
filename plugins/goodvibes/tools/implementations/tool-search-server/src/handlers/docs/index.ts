/**
 * Documentation handlers
 *
 * Exports handlers for documentation-related tools including
 * codebase explanation, analysis, and OpenAPI generation.
 *
 * @module handlers/docs
 */

export { handleExplainCodebase } from './explain-codebase/index.js';
export type { ExplainCodebaseArgs } from './explain-codebase/index.js';

// OpenAPI generation
export { handleGenerateOpenApi } from './generate-openapi.js';
export type { GenerateOpenApiArgs } from './generate-openapi.js';
