/**
 * Barrel export for the api core domain (L1).
 *
 * Re-exports all types, constants, and utility functions from the api domain.
 *
 * @module core/api
 */

export * from './types.js';
export * from './constants.js';
export * from './detection.js';
export * from './openapi.js';
export * from './http.js';
export * from './validation.js';
export * from './type-extraction.js';
export * from './matching.js';
export * from './parsers/nextjs.js';
export * from './parsers/express.js';
export * from './parsers/fastify.js';
export * from './parsers/hono.js';
